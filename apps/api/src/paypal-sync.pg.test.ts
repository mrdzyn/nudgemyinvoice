import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAuthStore, createAuditSink, createDb, type AuditSink } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import type { InvoiceDraft } from "@nmi/shared";
import {
  PayPalSandboxClient,
  type HttpRequest,
  type HttpResponse,
  type PayPalInvoicingReadDraft,
  type RemoteInvoice,
} from "@nmi/paypal";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv, fakePayPalCredentials } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { fakePayPal, type FakePayPal } from "./test-paypal.js";

/**
 * HOTFIX NMI PayPal Sandbox DRAFT sync. Objective: a manually initiated, authenticated, one-way
 * import of existing PayPal Sandbox DRAFT invoices into PostgreSQL, using fake PayPal responses
 * and a disposable PostgreSQL 16 database (the real PayPal is never reached).
 *
 * Covered: bounded pagination, duplicate sync idempotency, malformed-money skip, operator
 * ownership isolation, partial-failure recovery, verified-id reconciliation linking, the
 * default-OFF flag, raw-page pagination through the real list-response parsing path,
 * page-cap truncation reporting, and fail-closed audit-failure behavior with idempotent
 * recovery. No production database is touched.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const ORIGIN = baseEnv.WEB_ORIGIN;

const draft = (name: string): InvoiceDraft => ({
  customerName: name,
  customerEmail: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@own.example`,
  currency: "USD",
  lineItems: [{ description: "Logo concept", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-11-30",
  taxPercent: null,
  discount: null,
});

const remote = (id: string, over: Partial<RemoteInvoice> = {}): RemoteInvoice => ({
  paypalInvoiceId: id,
  status: "DRAFT",
  currency: "USD",
  total: "10.00",
  dueDate: "2026-12-01",
  invoiceNumber: `n-${id.slice(-8)}`,
  reference: null,
  ...over,
});

describe.skipIf(!url)("PayPal DRAFT sync (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  const apps: FastifyInstance[] = [];
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
  let n = 0;

  const makeApp = (
    pp: FakePayPal | null,
    env: Record<string, string | undefined> = {},
    client?: PayPalInvoicingReadDraft,
  ) => {
    const paypal = client ?? pp?.client;
    const app = buildApp(
      loadConfig({
        ...baseEnv,
        DATABASE_URL: url,
        PAYPAL_SYNC_ENABLED: "true",
        ...fakePayPalCredentials,
        ...env,
      }),
      {
        db: createDb(scratch.pool),
        passwordParams: weak,
        ...(paypal ? { paypal } : {}),
      },
    );
    apps.push(app);
    return app;
  };

  let provisioned = false;
  const newOperator = async (app: FastifyInstance, username: string) => {
    const password = `pw-${randomBytes(12).toString("hex")}`;
    const db = createDb(scratch.pool);
    if (!provisioned) {
      provisioned = true;
      await provisionOperator(
        { store: new PostgresAuthStore(db), audit: createAuditSink(db), params: weak },
        { username, password },
      );
    } else {
      // Test-only: extra operators via direct insert (provisioning stays single-operator by design).
      const { hashPassword } = await import("./auth/password.js");
      await sql(`INSERT INTO operators (username, password_hash) VALUES ($1, $2)`, [
        username,
        await hashPassword(password, weak),
      ]);
    }
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN },
      payload: { username, password },
    });
    expect(res.statusCode, res.body).toBe(200);
    const cookie = res.cookies.find((c) => c.name === "nmi_session")?.value as string;
    const csrf = (res.json() as { csrfToken: string }).csrfToken;
    const auth = { cookie: `nmi_session=${cookie}`, "x-csrf-token": csrf, origin: ORIGIN };
    return {
      sync: () => app.inject({ method: "POST", url: "/api/paypal/imports/sync", headers: auth }),
      list: (qs = "") =>
        app.inject({
          method: "GET",
          url: `/api/paypal/imports${qs}`,
          headers: { cookie: auth.cookie },
        }),
      save: async (d: InvoiceDraft) => {
        const r = await app.inject({
          method: "POST",
          url: "/api/invoice-drafts",
          headers: { ...auth, "idempotency-key": `sync-${++n}-${randomBytes(4).toString("hex")}` },
          payload: d as object,
        });
        expect(r.statusCode, r.body).toBe(201);
        return (r.json() as { id: string }).id;
      },
    };
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 25);
    await sql("DROP INDEX operators_single_row_uq"); // test-only: several operators in one scratch schema
  });

  afterAll(async () => {
    for (const app of apps) await app.close().catch(() => undefined);
    await scratch?.drop().catch(() => undefined);
  });

  it("is inert unless the read-sync flag is on", async () => {
    const pp = fakePayPal();
    const off = buildApp(loadConfig({ ...baseEnv, DATABASE_URL: url, ...fakePayPalCredentials }), {
      db: createDb(scratch.pool),
      passwordParams: weak,
      paypal: pp.client,
    });
    apps.push(off);
    const op = await newOperator(off, "sync-flag-off");
    const syncRes = await off.inject({
      method: "POST",
      url: "/api/paypal/imports/sync",
      headers: { cookie: "nmi_session=x", "x-csrf-token": "y", origin: ORIGIN },
    });
    expect([401, 403, 503]).toContain(syncRes.statusCode);
    // An authenticated operator on the flag-off app sees sync_disabled on both routes.
    void op;
    const authed = await newOperator(off, "sync-flag-off-b");
    expect((await authed.sync()).json()).toEqual({ error: "sync_disabled" });
    expect((await authed.list()).json()).toEqual({ error: "sync_disabled" });
    expect(pp.log.list).toHaveLength(0);
  });

  it("imports across bounded pages and is idempotent on re-sync", async () => {
    const pp = fakePayPal();
    for (let i = 1; i <= 25; i++) pp.remotes.set(`INV2-PAGE-${i}`, remote(`INV2-PAGE-${i}`));
    const app = makeApp(pp);
    const op = await newOperator(app, "sync-pages");

    const first = await op.sync();
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().counts).toEqual({
      created: 25,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
    });
    // 25 rows at page size 20 take exactly two bounded list calls.
    expect(pp.log.list).toHaveLength(2);

    const listed = await op.list();
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { items: unknown[] }).items).toHaveLength(25);

    const second = await op.sync();
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json().counts).toEqual({
      created: 0,
      updated: 0,
      unchanged: 25,
      skipped: 0,
      failed: 0,
    });
    expect(pp.log.create).toHaveLength(0); // sync never creates in PayPal
  });

  it("skips non-DRAFT and malformed records without storing them", async () => {
    const pp = fakePayPal();
    pp.remotes.set("INV2-GOOD-1", remote("INV2-GOOD-1"));
    pp.remotes.set("INV2-SENT-1", remote("INV2-SENT-1", { status: "SENT" }));
    pp.remotes.set("INV2-BADTOTAL-1", remote("INV2-BADTOTAL-1", { total: "not-a-number" }));
    pp.remotes.set(
      "INV2-BADCUR-1",
      remote("INV2-BADCUR-1", { currency: "XXX" as never, total: "5.00" }),
    );
    pp.remotes.set("INV2-BADDATE-1", remote("INV2-BADDATE-1", { dueDate: "12/01/2026" }));
    pp.remotes.set("INV2-BADDATE-2", remote("INV2-BADDATE-2", { dueDate: "2026-13-01" }));
    const app = makeApp(pp);
    const op = await newOperator(app, "sync-malformed");

    const res = await op.sync();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().counts).toEqual({
      created: 1,
      updated: 0,
      unchanged: 0,
      skipped: 5,
      failed: 0,
    });
    const listed = (await op.list()).json() as { items: Array<{ remoteInvoiceId: string }> };
    expect(listed.items.map((i) => i.remoteInvoiceId)).toEqual(["INV2-GOOD-1"]);
  });

  it("isolates operators: a second owner cannot see or overwrite the first import", async () => {
    const pp = fakePayPal();
    pp.remotes.set("INV2-OWNED-1", remote("INV2-OWNED-1"));
    const app = makeApp(pp);
    const opA = await newOperator(app, "sync-owner-a");
    const opB = await newOperator(app, "sync-owner-b");

    expect((await opA.sync()).json().counts.created).toBe(1);
    const resB = await opB.sync();
    expect(resB.statusCode, resB.body).toBe(200);
    // Owner conflict on the shared remote id: skipped, never merged into B's view.
    expect(resB.json().counts).toEqual({
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 1,
      failed: 0,
    });
    expect(((await opB.list()).json() as { items: unknown[] }).items).toHaveLength(0);
    expect(((await opA.list()).json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it("preserves earlier pages when a later page fails, then recovers", async () => {
    const pp = fakePayPal();
    for (let i = 1; i <= 25; i++) pp.remotes.set(`INV2-FAIL-${i}`, remote(`INV2-FAIL-${i}`));
    pp.on.list = async (input) => {
      if (input.page >= 2) throw new Error("boom-page-2");
      const all = [...pp.remotes.values()];
      const size = input.pageSize ?? 20;
      const slice = all.slice(0, size);
      return {
        invoices: slice,
        skippedMalformed: 0,
        rawCount: slice.length,
        totalItems: all.length,
        totalPages: 2,
      };
    };
    const app = makeApp(pp);
    const op = await newOperator(app, "sync-recover");

    const first = await op.sync();
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().counts).toMatchObject({ created: 20, failed: 1 });
    expect(first.json().partialFailure).toBe(true);
    expect(((await op.list()).json() as { items: unknown[] }).items).toHaveLength(20);

    delete pp.on.list;
    const second = await op.sync();
    expect(second.statusCode, second.body).toBe(200);
    // The 20 kept rows are unchanged; only the 5 missing rows are created.
    expect(second.json().counts).toEqual({
      created: 5,
      updated: 0,
      unchanged: 20,
      skipped: 0,
      failed: 0,
    });
    expect(second.json().partialFailure).toBe(false);
  });

  it("links only verified id + matching values, never modifies local invoices", async () => {
    const pp = fakePayPal();
    pp.remotes.set(
      "INV2-LINK-1",
      remote("INV2-LINK-1", { total: "500.00", dueDate: "2026-11-30" }),
    );
    pp.remotes.set(
      "INV2-LINK-2",
      remote("INV2-LINK-2", { total: "999.99", dueDate: "2026-11-30" }),
    );
    const app = makeApp(pp);
    const op = await newOperator(app, "sync-link");

    const localMatch = await op.save(draft("Link Match"));
    const localMismatch = await op.save(draft("Link Mismatch"));
    await sql(`UPDATE invoices SET paypal_invoice_id = 'INV2-LINK-1' WHERE id = $1`, [localMatch]);
    await sql(`UPDATE invoices SET paypal_invoice_id = 'INV2-LINK-2' WHERE id = $1`, [
      localMismatch,
    ]);

    const res = await op.sync();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().counts.created).toBe(2);

    const items = (
      (await op.list()).json() as {
        items: Array<{ remoteInvoiceId: string; linkedInvoiceId: string | null }>;
      }
    ).items;
    const byId = new Map(items.map((i) => [i.remoteInvoiceId, i.linkedInvoiceId]));
    expect(byId.get("INV2-LINK-1")).toBe(localMatch); // verified id + USD 500.00 match
    expect(byId.get("INV2-LINK-2")).toBeNull(); // same id shape, different total: stays unlinked

    // Local bodies are byte-identical: totals and the stored remote id are untouched.
    const rows = await sql(
      `SELECT id, total_minor::text AS total, paypal_invoice_id AS remote FROM invoices WHERE id = ANY($1) ORDER BY id`,
      [[localMatch, localMismatch]],
    );
    expect(rows.map((r: { total: string; remote: string }) => [r.total, r.remote]).sort()).toEqual([
      ["50000", "INV2-LINK-1"],
      ["50000", "INV2-LINK-2"],
    ]);
  });

  it("does not let malformed rows hide later pages (real list-response parsing path)", async () => {
    // Raw PayPal v2 list bodies through the REAL client, OAuth and guard included: page 1 holds
    // 20 rows with 1 malformed (19 valid), page 2 holds 5 valid. Filtering-based pagination
    // would stop after page 1 (19 < 20) and silently drop the 5 valid drafts.
    const rawItem = (id: string, n: string) => ({
      id,
      status: "DRAFT",
      detail: {
        currency_code: "USD",
        invoice_number: n,
        payment_term: { due_date: "2026-12-01" },
      },
      amount: { currency_code: "USD", value: "10.00" },
    });
    const page1: unknown[] = Array.from({ length: 19 }, (_, i) =>
      rawItem(`INV2-R-${i + 1}`, `r${i + 1}`),
    );
    page1.push({
      id: "INV2-R-BAD",
      status: "DRAFT",
      detail: { currency_code: "USD", invoice_number: "bad" },
    });
    const page2: unknown[] = Array.from({ length: 5 }, (_, i) =>
      rawItem(`INV2-R-${20 + i}`, `r${20 + i}`),
    );
    const seen: string[] = [];
    const transport = async (req: HttpRequest): Promise<HttpResponse> => {
      const url = new URL(req.url);
      if (url.pathname === "/v1/oauth2/token") {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            access_token: "t".repeat(32),
            token_type: "Bearer",
            expires_in: 3600,
          }),
        };
      }
      seen.push(`${req.method} ${url.pathname}${url.search}`);
      if (url.pathname !== "/v2/invoicing/invoices") {
        // Read-only detail enrichment for the amount-less row: unknown here (404).
        return { status: 404, headers: {}, body: JSON.stringify({ id: "INV2-R-BAD" }) };
      }
      const page = Number(url.searchParams.get("page"));
      const items = page === 1 ? page1 : page === 2 ? page2 : [];
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({ total_items: 25, total_pages: 2, items }),
      };
    };
    const client = new PayPalSandboxClient({
      baseUrl: "https://api-m.sandbox.paypal.com",
      clientId: "cid",
      clientSecret: "csecret",
      transport,
    });
    const app = makeApp(null, {}, client);
    const op = await newOperator(app, "sync-rawpage");

    const res = await op.sync();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().counts).toEqual({
      created: 24,
      updated: 0,
      unchanged: 0,
      skipped: 1,
      failed: 0,
    });
    expect(res.json().partialFailure).toBe(false);
    expect(res.json().truncated).toBe(false);
    // Both list pages are consumed; the amount-less row triggers exactly one read-only
    // detail enrichment (404 here), which degrades to its single skip.
    expect(seen).toEqual([
      "GET /v2/invoicing/invoices?page=1&page_size=20&total_required=true&fields=amount",
      "GET /v2/invoicing/invoices/INV2-R-BAD",
      "GET /v2/invoicing/invoices?page=2&page_size=20&total_required=true&fields=amount",
    ]);
    expect(((await op.list()).json() as { items: unknown[] }).items).toHaveLength(24);
  });

  it("imports minimally represented DRAFTs via read-only detail (real HTTP path)", async () => {
    // PayPal omits amounts from the list despite fields=amount: the client must enrich each
    // amount-less row through the read-only detail endpoint and import the validated DRAFT
    // instead of reporting a clean sync with zero imports.
    const seen: string[] = [];
    const token = () => ({
      status: 200,
      headers: {},
      body: JSON.stringify({
        access_token: "t".repeat(32),
        token_type: "Bearer",
        expires_in: 3600,
      }),
    });
    const full = (id: string, n: string, value: string) => ({
      status: 200,
      headers: {},
      body: JSON.stringify({
        id,
        status: "DRAFT",
        detail: { currency_code: "USD", invoice_number: n },
        amount: { currency_code: "USD", value },
      }),
    });
    const transport = async (req: HttpRequest): Promise<HttpResponse> => {
      const url = new URL(req.url);
      if (url.pathname === "/v1/oauth2/token") return token();
      seen.push(`${req.method} ${url.pathname}${url.search}`);
      if (url.pathname === "/v2/invoicing/invoices/INV2-MIN-1")
        return full("INV2-MIN-1", "m1", "10.00");
      if (url.pathname === "/v2/invoicing/invoices/INV2-MIN-2")
        return full("INV2-MIN-2", "m2", "3.25");
      if (url.pathname === "/v2/invoicing/invoices") {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            total_items: 2,
            total_pages: 1,
            items: [
              {
                id: "INV2-MIN-1",
                status: "DRAFT",
                detail: { currency_code: "USD", invoice_number: "m1" },
              },
              {
                id: "INV2-MIN-2",
                status: "DRAFT",
                detail: { currency_code: "USD", invoice_number: "m2" },
              },
            ],
          }),
        };
      }
      throw new Error(`unexpected request ${req.method} ${url.pathname}`);
    };
    const client = new PayPalSandboxClient({
      baseUrl: "https://api-m.sandbox.paypal.com",
      clientId: "cid",
      clientSecret: "csecret",
      transport,
    });
    const app = makeApp(null, {}, client);
    const op = await newOperator(app, "sync-minimal");

    const res = await op.sync();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().counts).toEqual({
      created: 2,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
    });
    expect(res.json().partialFailure).toBe(false);
    expect(res.json().truncated).toBe(false);
    // Exact outgoing contract: fields=amount on the list, read-only detail per minimal row,
    // and nothing else (no money-moving path).
    expect(seen).toEqual([
      "GET /v2/invoicing/invoices?page=1&page_size=20&total_required=true&fields=amount",
      "GET /v2/invoicing/invoices/INV2-MIN-1",
      "GET /v2/invoicing/invoices/INV2-MIN-2",
    ]);
    const items = (
      (await op.list()).json() as { items: Array<{ remoteInvoiceId: string; total: string }> }
    ).items;
    expect(items.map((i) => [i.remoteInvoiceId, i.total]).sort()).toEqual([
      ["INV2-MIN-1", "10.00"],
      ["INV2-MIN-2", "3.25"],
    ]);
  });

  it("reports truncation when the bounded page cap is reached", async () => {
    const pp = fakePayPal();
    for (let i = 1; i <= 501; i++) pp.remotes.set(`INV2-TRUNC-${i}`, remote(`INV2-TRUNC-${i}`));
    const app = makeApp(pp);
    const op = await newOperator(app, "sync-trunc");

    const res = await op.sync();
    expect(res.statusCode, res.body).toBe(200);
    // 25 pages x 20 rows: the 501st row is left out and the run is marked incomplete.
    expect(res.json().counts).toEqual({
      created: 500,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
    });
    expect(res.json().truncated).toBe(true);
    expect(res.json().partialFailure).toBe(true);
    expect(pp.log.list).toHaveLength(25);
    const rows = await sql(
      `SELECT detail FROM audit_log WHERE action = 'paypal.draft_sync' ORDER BY at DESC LIMIT 1`,
    );
    expect((rows[0] as { detail: { state: string } }).detail).toEqual({ state: "incomplete" });
  });

  it("fails closed with counts when the audit write fails, and recovers idempotently", async () => {
    const pp = fakePayPal();
    pp.remotes.set("INV2-AUDITFAIL-1", remote("INV2-AUDITFAIL-1"));
    let failAudit = true;
    const flaky: AuditSink = {
      record: async (e) => {
        if (failAudit && e.action === "paypal.draft_sync") throw new Error("audit down");
        await createAuditSink(createDb(scratch.pool)).record(e);
      },
    };
    const app = buildApp(
      loadConfig({
        ...baseEnv,
        DATABASE_URL: url,
        PAYPAL_SYNC_ENABLED: "true",
        ...fakePayPalCredentials,
      }),
      { db: createDb(scratch.pool), passwordParams: weak, paypal: pp.client, audit: flaky },
    );
    apps.push(app);
    const op = await newOperator(app, "sync-auditfail");

    const res = await op.sync();
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("audit_failed");
    expect(res.json().counts.created).toBe(1);
    expect(res.json().partialFailure).toBe(true);
    // Rows are preserved despite the audit outage: no silent loss, no duplicate on retry.
    expect(((await op.list()).json() as { items: unknown[] }).items).toHaveLength(1);

    failAudit = false;
    const retry = await op.sync();
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json().counts).toEqual({
      created: 0,
      updated: 0,
      unchanged: 1,
      skipped: 0,
      failed: 0,
    });
    expect(retry.json().partialFailure).toBe(false);
  });

  it("rejects an invalid list limit and records an audit row per sync", async () => {
    const pp = fakePayPal();
    pp.remotes.set("INV2-AUDIT-1", remote("INV2-AUDIT-1"));
    const app = makeApp(pp);
    const op = await newOperator(app, "sync-audit");

    const bad = await op.list("?limit=200");
    expect(bad.statusCode).toBe(400);

    const before = await sql(
      `SELECT COUNT(*)::text AS n FROM audit_log WHERE action = 'paypal.draft_sync'`,
    );
    await op.sync();
    const after = await sql(
      `SELECT COUNT(*)::text AS n FROM audit_log WHERE action = 'paypal.draft_sync'`,
    );
    expect(Number((after[0] as { n: string }).n) - Number((before[0] as { n: string }).n)).toBe(1);
  });
});
