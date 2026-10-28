import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresAuthStore,
  PostgresInvoiceDraftStore,
  PostgresPayPalOperationStore,
  createAuditSink,
  createDb,
} from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import type { InvoiceDraft } from "@nmi/shared";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv, fakePayPalCredentials } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { hashPassword } from "./auth/password.js";
import { createPayPalDraft } from "./services/paypal-draft-service.js";
import { fakePayPal, timeout, type FakePayPal } from "./test-paypal.js";

/**
 * C5-P0 security gate. Objective: an authenticated operator can trigger PayPal Sandbox draft
 * creation or reconciliation ONLY for an invoice they own. A foreign, ownerless or unknown invoice
 * is one indistinguishable `404 {"error":"not_found"}` and, for it, NOTHING else happens: no
 * operation read or write, no stored PayPal id returned, no reserve/claim, no audit row, no provider
 * call. Real Fastify + disposable PostgreSQL 16 + a fake PayPal client (the real PayPal is never
 * reached). Authorized behaviour (fencing, idempotency, state machine) must be unchanged.
 *
 * NOTE: production allows exactly one operator (`operators_single_row_uq`). This suite drops that
 * index in its own scratch schema ONLY to create a second operator; nothing here is a migration.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const ORIGIN = baseEnv.WEB_ORIGIN;
const PW_A = `pw-${randomBytes(12).toString("hex")}`;
const PW_B = `pw-${randomBytes(12).toString("hex")}`;
const NOW = new Date("2026-10-25T12:00:00Z");
const NOT_FOUND = { error: "not_found" };
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const draft = (name: string): InvoiceDraft => ({
  customerName: name,
  customerEmail: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@own.example`,
  currency: "USD",
  lineItems: [{ description: "Logo concept", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-11-30",
  taxPercent: null,
  discount: null,
});

describe.skipIf(!url)("PayPal draft operator ownership (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  const apps: FastifyInstance[] = [];
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;

  const makeApp = (pp: FakePayPal | null, env: Record<string, string | undefined> = {}) => {
    const app = buildApp(
      loadConfig({
        ...baseEnv,
        DATABASE_URL: url,
        PAYPAL_DRAFTS_ENABLED: "true",
        ...fakePayPalCredentials,
        ...env,
      }),
      {
        db: createDb(scratch.pool),
        passwordParams: weak,
        clock: () => NOW,
        ...(pp ? { paypal: pp.client } : {}),
      },
    );
    apps.push(app);
    return app;
  };

  async function login(app: FastifyInstance, username: string, password: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN },
      payload: { username, password },
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === "nmi_session")?.value as string;
    const csrf = (res.json() as { csrfToken: string }).csrfToken;
    const headers = { cookie: `nmi_session=${cookie}`, "x-csrf-token": csrf, origin: ORIGIN };
    let n = 0;
    return {
      save: async (d: InvoiceDraft) => {
        const r = await app.inject({
          method: "POST",
          url: "/api/invoice-drafts",
          headers: {
            ...headers,
            "idempotency-key": `own-${randomBytes(6).toString("hex")}-${++n}`,
          },
          payload: d as object,
        });
        expect(r.statusCode, r.body).toBe(201);
        return (r.json() as { id: string }).id;
      },
      paypal: (id: string) =>
        app.inject({ method: "POST", url: `/api/invoice-drafts/${id}/paypal-draft`, headers }),
      get: (id: string) =>
        app.inject({
          method: "GET",
          url: `/api/invoice-drafts/${id}`,
          headers: { cookie: headers.cookie },
        }),
    };
  }
  type S = Awaited<ReturnType<typeof login>>;

  let sA: S;
  let sB: S;
  let ppA: FakePayPal; // wired into the app both operators use; reset per test via .log
  let app: FastifyInstance;
  let A: string;
  let B: string;

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 25);
    const db = createDb(scratch.pool);
    await provisionOperator(
      { store: new PostgresAuthStore(db), audit: createAuditSink(db), params: weak },
      { username: "operator-a", password: PW_A },
    );
    await sql("DROP INDEX operators_single_row_uq"); // test-only: allow a second operator
    await sql(`INSERT INTO operators (username, password_hash) VALUES ('operator-b', $1)`, [
      await hashPassword(PW_B, weak),
    ]);
    A = (await sql("SELECT id FROM operators WHERE username='operator-a'"))[0].id;
    B = (await sql("SELECT id FROM operators WHERE username='operator-b'"))[0].id;
    ppA = fakePayPal();
    app = makeApp(ppA);
    sA = await login(app, "operator-a", PW_A);
    sB = await login(app, "operator-b", PW_B);
  });
  afterEach(() => {
    delete ppA.on.create;
    delete ppA.on.get;
    delete ppA.on.find;
  });
  afterAll(async () => {
    while (apps.length) await apps.pop()?.close();
    await scratch?.drop();
  });

  const orphan = async () =>
    (
      await sql(
        `INSERT INTO invoices (customer_name, customer_email, currency, subtotal_minor, total_minor, due_date)
         VALUES ('Ownerless Inc', 'o@ownerless.example', 'USD', 100, 100, '2026-11-30') RETURNING id`,
      )
    )[0].id as string;
  const opRow = async (id: string) =>
    (await sql("SELECT * FROM paypal_draft_operations WHERE invoice_id = $1", [id]))[0];
  const counts = async () =>
    (
      await sql(
        `SELECT (SELECT count(*)::int FROM paypal_draft_operations) ops,
                (SELECT count(*)::int FROM audit_log) audit,
                (SELECT count(*)::int FROM audit_log WHERE action LIKE 'paypal.%') paypal_audit,
                (SELECT count(*)::int FROM invoices) invoices,
                (SELECT count(*)::int FROM invoices WHERE paypal_invoice_id IS NOT NULL) linked`,
      )
    )[0];
  const providerCalls = () => ppA.log.create.length + ppA.log.get.length + ppA.log.find.length;
  const resetLog = () => {
    ppA.log.create.length = 0;
    ppA.log.get.length = 0;
    ppA.log.find.length = 0;
  };

  describe("authorized owner behaviour is unchanged", () => {
    it("A creates one verified draft for A's own invoice, then a replay makes no second external call", async () => {
      resetLog();
      const id = await sA.save(draft("A Owned One"));
      const res = await sA.paypal(id);
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json()).toMatchObject({ status: "DRAFT", replayed: false });
      expect(ppA.log.create).toHaveLength(1);
      expect(await opRow(id)).toMatchObject({ state: "created", attempts: 1, created_by: A });
      const replay = await sA.paypal(id);
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toMatchObject({ replayed: true });
      expect(ppA.log.create).toHaveLength(1);
    });

    it("B equally creates a draft for B's own invoice (ownership is per operator, not global)", async () => {
      resetLog();
      const id = await sB.save(draft("B Owned One"));
      const res = await sB.paypal(id);
      expect(res.statusCode, res.body).toBe(201);
      expect(await opRow(id)).toMatchObject({ state: "created", created_by: B });
      expect(ppA.log.create).toHaveLength(1);
    });

    it("an uncertain owner attempt is reconciled by the SAME owner without a second create", async () => {
      resetLog();
      const id = await sA.save(draft("A Reconcile"));
      ppA.on.create = async () => timeout();
      const first = await sA.paypal(id);
      expect(first.statusCode).toBe(502);
      expect((await opRow(id)).state).toBe("unknown");
      delete ppA.on.create;
      // owner retries: reconciliation (search/get) is allowed for the owner and never re-creates blindly
      const again = await sA.paypal(id);
      expect(again.statusCode, again.body).toBe(409);
      expect(again.json()).toEqual({ error: "reconciliation_pending" });
      expect(ppA.log.create).toHaveLength(1); // reconciled, never blindly re-created
      expect(ppA.log.find).toHaveLength(1); // the owner's retry really did reconcile with PayPal
    });

    it("12 simultaneous owner requests keep the original fencing: one create, eleven refused", async () => {
      resetLog();
      let release!: () => void;
      const parked = new Promise<void>((r) => (release = r));
      ppA.on.create = async (input) => {
        await parked;
        return { paypalInvoiceId: ppA.materialize(input.body) };
      };
      const id = await sA.save(draft("A Concurrent"));
      let refused = 0;
      let eleven!: () => void;
      const gate = new Promise<void>((r) => (eleven = r));
      const all = Array.from({ length: 12 }, () =>
        sA.paypal(id).then((r) => {
          if (r.statusCode === 409 && ++refused === 11) eleven();
          return r;
        }),
      );
      await gate;
      expect(ppA.log.create).toHaveLength(1);
      release();
      const res = await Promise.all(all);
      expect(res.filter((r) => r.statusCode === 201)).toHaveLength(1);
      expect(res.filter((r) => r.statusCode === 409)).toHaveLength(11);
      expect(ppA.log.create).toHaveLength(1);
    });

    it("foreign requests during an owner's in-flight create neither join, refuse nor disturb it", async () => {
      resetLog();
      let release!: () => void;
      const parked = new Promise<void>((r) => (release = r));
      ppA.on.create = async (input) => {
        await parked;
        return { paypalInvoiceId: ppA.materialize(input.body) };
      };
      const id = await sA.save(draft("A Raced By B"));
      const ownerReq = sA.paypal(id);
      // wait until the owner's request is inside PayPal
      for (let i = 0; i < 200 && ppA.log.create.length === 0; i++)
        await new Promise((r) => setTimeout(r, 10));
      expect(ppA.log.create).toHaveLength(1);
      const foreign = await Promise.all(Array.from({ length: 6 }, () => sB.paypal(id)));
      for (const r of foreign) {
        expect(r.statusCode).toBe(404);
        expect(r.json()).toEqual(NOT_FOUND);
      }
      expect((await opRow(id)).state).toBe("creating");
      release();
      const res = await ownerReq;
      expect(res.statusCode, res.body).toBe(201);
      expect(ppA.log.create).toHaveLength(1);
      expect((await opRow(id)).created_by).toBe(A);
    });
  });

  describe("cross-operator and ownerless access is a plain 404 that does nothing", () => {
    it("A cannot create a draft for B's invoice; B cannot for A's; neither for an ownerless one", async () => {
      const aId = await sA.save(draft("A Private"));
      const bId = await sB.save(draft("B Private"));
      const oId = await orphan();
      resetLog();
      const before = await counts();
      const results = [
        await sA.paypal(bId),
        await sB.paypal(aId),
        await sA.paypal(oId),
        await sB.paypal(oId),
      ];
      for (const r of results) {
        expect(r.statusCode).toBe(404);
        expect(r.json()).toEqual(NOT_FOUND);
      }
      expect(await counts()).toEqual(before); // no operation row, no audit row, nothing linked
      expect(providerCalls()).toBe(0);
      expect(await opRow(aId)).toBeUndefined();
      expect(await opRow(bId)).toBeUndefined();
      expect(await opRow(oId)).toBeUndefined();
    });

    it("foreign, ownerless and unknown ids produce byte-identical 404 responses", async () => {
      const aId = await sA.save(draft("A Identical"));
      const oId = await orphan();
      const foreign = await sB.paypal(aId);
      const ownerless = await sA.paypal(oId);
      const unknown = await sB.paypal(UNKNOWN_ID);
      const malformed = await sB.paypal("not-a-uuid");
      for (const r of [foreign, ownerless, unknown, malformed]) {
        expect(r.statusCode).toBe(404);
        expect(r.headers["cache-control"]).toBe("no-store");
      }
      expect(foreign.body).toBe(unknown.body);
      expect(ownerless.body).toBe(unknown.body);
      expect(malformed.body).toBe(unknown.body);
      expect(unknown.json()).toEqual(NOT_FOUND);
      expect(foreign.body).not.toContain(aId);
    });

    it("an existing PayPal draft id of another operator is never returned or revealed", async () => {
      resetLog();
      const aId = await sA.save(draft("A Has Draft"));
      const created = await sA.paypal(aId);
      expect(created.statusCode).toBe(201);
      const remoteId = created.json().paypalInvoiceId as string;
      resetLog();
      const before = await counts();
      const res = await sB.paypal(aId);
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe((await sB.paypal(UNKNOWN_ID)).body);
      expect(res.body).not.toContain(remoteId);
      expect(res.body).not.toContain("replayed");
      expect(providerCalls()).toBe(0);
      expect(await counts()).toEqual(before);
      // the owner still sees it
      expect((await sA.paypal(aId)).json()).toMatchObject({
        paypalInvoiceId: remoteId,
        replayed: true,
      });
    });

    it("another operator's pending/creating/unknown operation is inaccessible and is not changed", async () => {
      const ids: Record<string, string> = {};
      for (const state of ["pending", "unknown"] as const) {
        const id = await sA.save(draft(`A ${state}`));
        ids[state] = id;
        await sql(
          `INSERT INTO paypal_draft_operations (invoice_id, created_by, state, invoice_number, payload_digest, invoice_date, last_error_code, create_attempted_at)
           VALUES ($1, $2, $3, $4, $5, '2026-10-25', $6, $7)`,
          [
            id,
            A,
            state,
            `NMI-${randomBytes(10).toString("hex")}`,
            "c".repeat(64),
            state === "unknown" ? "timeout" : null,
            state === "unknown" ? NOW : null,
          ],
        );
      }
      resetLog();
      const snapshot = async () =>
        (await sql("SELECT * FROM paypal_draft_operations ORDER BY id")) as unknown[];
      const before = await snapshot();
      const counted = await counts();
      for (const id of Object.values(ids)) {
        const r = await sB.paypal(id);
        expect(r.statusCode).toBe(404);
        expect(r.json()).toEqual(NOT_FOUND);
      }
      expect(await snapshot()).toEqual(before); // attempts, state, timestamps: untouched
      expect(await counts()).toEqual(counted);
      expect(providerCalls()).toBe(0);
      // B cannot even observe the operation state through the detail read
      expect((await sB.get(ids["unknown"] as string)).statusCode).toBe(404);
    });

    it("unauthorized attempts write no audit row and make zero provider calls, at any volume", async () => {
      const aId = await sA.save(draft("A Audit Quiet"));
      resetLog();
      const before = await counts();
      await Promise.all(Array.from({ length: 20 }, () => sB.paypal(aId)));
      expect(await counts()).toEqual(before);
      expect(providerCalls()).toBe(0);
    });

    it("the service itself enforces ownership (not only the route): foreign callers get not_found", async () => {
      const db = createDb(scratch.pool);
      const drafts = new PostgresInvoiceDraftStore(db);
      const ops = new PostgresPayPalOperationStore(db);
      const pp = fakePayPal();
      const deps = { drafts, ops, paypal: pp.client, audit: createAuditSink(db), clock: () => NOW };
      const aId = await sA.save(draft("A Service Level"));
      const own = await createPayPalDraft(deps, { invoiceId: aId, operatorId: A, requestId: "r1" });
      expect(own.kind).toBe("created");
      pp.log.create.length = 0;
      pp.log.get.length = 0;
      pp.log.find.length = 0;
      const oId = await orphan();
      const before = await counts();
      for (const invoiceId of [aId, UNKNOWN_ID, oId]) {
        const r = await createPayPalDraft(deps, { invoiceId, operatorId: B, requestId: "r2" });
        expect(r).toEqual({ kind: "not_found" });
      }
      // even the stored PayPal id of an already-created draft is not returned to a foreign operator
      expect(
        await createPayPalDraft(deps, { invoiceId: aId, operatorId: B, requestId: "r3" }),
      ).toEqual({
        kind: "not_found",
      });
      expect(pp.log.create.length + pp.log.get.length + pp.log.find.length).toBe(0);
      expect(await counts()).toEqual(before);
    });
  });

  describe("provider boundaries", () => {
    it("disabled by default: 503 and nothing happens for owner and non-owner alike (no existence signal)", async () => {
      const pp = fakePayPal();
      const off = makeApp(pp, { PAYPAL_DRAFTS_ENABLED: "false" });
      const a = await login(off, "operator-a", PW_A);
      const b = await login(off, "operator-b", PW_B);
      const aId = await a.save(draft("A Disabled"));
      const before = await counts();
      const own = await a.paypal(aId);
      const foreign = await b.paypal(aId);
      const unknown = await b.paypal(UNKNOWN_ID);
      for (const r of [own, foreign]) {
        expect(r.statusCode).toBe(503);
        expect(r.json()).toEqual({ error: "paypal_disabled" });
      }
      expect(unknown.statusCode).toBe(503);
      expect(foreign.body).toBe(own.body);
      expect(pp.log.create.length + pp.log.get.length + pp.log.find.length).toBe(0);
      expect(await counts()).toEqual(before);
    });

    it("the real PayPal and OpenAI are never configured or reached in this suite", () => {
      expect(baseEnv.PAYPAL_API_BASE_URL).toContain("sandbox");
      expect(process.env["PAYPAL_DRAFTS_ENABLED"]).not.toBe("true");
    });
  });
});
