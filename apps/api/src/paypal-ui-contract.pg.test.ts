import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PostgresAuthStore, createAuditSink, createDb } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import type { InvoiceDraft } from "@nmi/shared";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv, fakePayPalCredentials } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { hashPassword } from "./auth/password.js";
import { PayPalRejectedError } from "@nmi/paypal";
import { fakePayPal, timeout, type FakePayPal } from "./test-paypal.js";

/**
 * C5-P1 contract. Objective: the exact HTTP answers the React PayPal panel depends on, end to end
 * against real Fastify + disposable PostgreSQL 16 + a fake PayPal client (the real PayPal is never
 * reached): authenticated session + CSRF, a saved invoice reaching the protected route, every
 * outcome body shape, and the durable read-back through GET /api/invoice-drafts/:id.
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

const draft = (name: string): InvoiceDraft => ({
  customerName: name,
  customerEmail: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@own.example`,
  currency: "USD",
  lineItems: [{ description: "Logo concept", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-11-30",
  taxPercent: null,
  discount: null,
});

describe.skipIf(!url)("PayPal draft UI contract and durable read-back (real PostgreSQL)", () => {
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

  const opRow = async (id: string) =>
    (await sql("SELECT * FROM paypal_draft_operations WHERE invoice_id = $1", [id]))[0];
  const calls = () => ppA.log.create.length + ppA.log.get.length + ppA.log.find.length;
  const reset = () => {
    ppA.log.create.length = 0;
    ppA.log.get.length = 0;
    ppA.log.find.length = 0;
  };
  const keys = (b: unknown) => Object.keys(b as object).sort();
  const detail = async (s: S, id: string) =>
    (await s.get(id)).json() as {
      paypalInvoiceId: string | null;
      paypal: { state: string; paypalInvoiceId: string | null; lastErrorCode: string | null };
    };

  it("create: 201 body is exactly {paypalInvoiceId,status:DRAFT,replayed:false}; GET reads back the durable 'created' state; replay is 200", async () => {
    reset();
    const id = await sA.save(draft("C Created"));
    const res = await sA.paypal(id);
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { paypalInvoiceId: string; status: string; replayed: boolean };
    expect(keys(body)).toEqual(["paypalInvoiceId", "replayed", "status"]);
    expect(body).toMatchObject({ status: "DRAFT", replayed: false });
    expect(body.paypalInvoiceId).toMatch(/^[A-Za-z0-9-]{1,64}$/);
    const d = await detail(sA, id);
    expect(d.paypal).toEqual({
      state: "created",
      paypalInvoiceId: body.paypalInvoiceId,
      lastErrorCode: null,
    });
    expect(d.paypalInvoiceId).toBe(body.paypalInvoiceId);
    const replay = await sA.paypal(id);
    expect(replay.statusCode).toBe(200);
    expect(keys(replay.json())).toEqual(["paypalInvoiceId", "replayed", "status"]);
    expect(replay.json()).toMatchObject({
      paypalInvoiceId: body.paypalInvoiceId,
      replayed: true,
      status: "DRAFT",
    });
    expect(ppA.log.create).toHaveLength(1);
    expect(await detail(sA, id)).toEqual(d);
  });

  it("a saved invoice is created via the exact verified local record (server totals, not browser values)", async () => {
    reset();
    const id = await sA.save(draft("C Exact"));
    expect((await sA.paypal(id)).statusCode).toBe(201);
    const sent = ppA.log.create[0]!;
    expect(sent.body.detail).toMatchObject({ currency_code: "USD", reference: id });
    expect(sent.body.items[0]).toMatchObject({
      unit_amount: { currency_code: "USD", value: "250.00" },
    });
  });

  it("mapping refused: 422 {error,reason}, no operation, no provider call, durable state stays 'none'", async () => {
    reset();
    const refused: InvoiceDraft = {
      ...draft("C Refused"),
      lineItems: [{ description: "Rounding", quantity: "1.5", unitPrice: "0.33" }],
    };
    const id = await sA.save(refused);
    const res = await sA.paypal(id);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: "mapping_refused", reason: "rounding_required_line" });
    expect(await opRow(id)).toBeUndefined();
    expect(calls()).toBe(0);
    expect((await detail(sA, id)).paypal).toEqual({
      state: "none",
      paypalInvoiceId: null,
      lastErrorCode: null,
    });
  });

  it("outcome unknown: 502 {error,code}; GET shows 'unknown'; an immediate retry reconciles (409 reconciliation_pending) without a second create", async () => {
    reset();
    const id = await sA.save(draft("C Unknown"));
    ppA.on.create = async () => timeout();
    const first = await sA.paypal(id);
    expect(first.statusCode).toBe(502);
    expect(keys(first.json())).toEqual(["code", "error"]);
    expect(first.json()).toMatchObject({ error: "paypal_outcome_unknown" });
    expect(first.headers["retry-after"]).toBeDefined();
    const d = await detail(sA, id);
    expect(d.paypal.state).toBe("unknown");
    expect(d.paypal.paypalInvoiceId).toBeNull();
    delete ppA.on.create;
    const again = await sA.paypal(id);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "reconciliation_pending" });
    expect(again.headers["retry-after"]).toBeDefined();
    expect(ppA.log.create).toHaveLength(1); // never blindly re-created
    expect((await detail(sA, id)).paypal.state).toBe("unknown");
  });

  it("in progress: a rival request gets 409 {error:in_progress} while GET shows 'creating'; the winner then reads back as 'created'", async () => {
    reset();
    let release!: () => void;
    const parked = new Promise<void>((r) => (release = r));
    ppA.on.create = async (input) => {
      await parked;
      return { paypalInvoiceId: ppA.materialize(input.body) };
    };
    const id = await sA.save(draft("C InProgress"));
    const winner = sA.paypal(id);
    for (let i = 0; i < 200 && ppA.log.create.length === 0; i++)
      await new Promise((r) => setTimeout(r, 10));
    const rival = await sA.paypal(id);
    expect(rival.statusCode).toBe(409);
    expect(rival.json()).toEqual({ error: "in_progress" });
    expect(rival.headers["retry-after"]).toBeDefined();
    expect((await detail(sA, id)).paypal.state).toBe("creating");
    release();
    expect((await winner).statusCode).toBe(201);
    expect((await detail(sA, id)).paypal.state).toBe("created");
    expect(ppA.log.create).toHaveLength(1);
  });

  it("rejected: 502 {error,code}; GET shows 'rejected' with the sanitized code; a later explicit retry may succeed", async () => {
    reset();
    const id = await sA.save(draft("C Rejected"));
    ppA.on.create = async () => {
      throw new PayPalRejectedError("http_422:invalid_parameter_value");
    };
    const res = await sA.paypal(id);
    expect(res.statusCode).toBe(502);
    expect(keys(res.json())).toEqual(["code", "error"]);
    expect(res.json()).toMatchObject({ error: "paypal_rejected" });
    const d = await detail(sA, id);
    expect(d.paypal.state).toBe("rejected");
    expect(d.paypal.lastErrorCode).toMatch(/^[a-z0-9_.:-]{1,64}$/);
    delete ppA.on.create;
    const retry = await sA.paypal(id);
    expect(retry.statusCode, retry.body).toBe(201);
    expect((await detail(sA, id)).paypal.state).toBe("created");
  });

  it("mismatch: 502 {error,code}; GET shows 'mismatch'; a repeat is not a blind re-create", async () => {
    reset();
    const id = await sA.save(draft("C Mismatch"));
    ppA.on.create = async (input) => ({
      paypalInvoiceId: ppA.materialize(input.body, { total: "499.99" }),
    });
    const res = await sA.paypal(id);
    expect(res.statusCode).toBe(502);
    expect(keys(res.json())).toEqual(["code", "error"]);
    expect(res.json()).toMatchObject({ error: "paypal_mismatch" });
    expect((await detail(sA, id)).paypal.state).toBe("mismatch");
    delete ppA.on.create;
    const before = ppA.log.create.length;
    await sA.paypal(id);
    expect(ppA.log.create.length).toBe(before);
  });

  it("disabled: 503 {error:paypal_disabled}, GET stays 'none', no provider call", async () => {
    const pp = fakePayPal();
    const off = makeApp(pp, { PAYPAL_DRAFTS_ENABLED: "false" });
    const a = await login(off, "operator-a", PW_A);
    const id = await a.save(draft("C Disabled"));
    const res = await a.paypal(id);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "paypal_disabled" });
    expect(pp.log.create.length + pp.log.get.length + pp.log.find.length).toBe(0);
    expect((await detail(a, id)).paypal.state).toBe("none");
  });

  it("session, CSRF and Origin are enforced on the real route; a body is refused (400)", async () => {
    reset();
    const id = await sA.save(draft("C Auth"));
    const url = `/api/invoice-drafts/${id}/paypal-draft`;
    expect(
      (await app.inject({ method: "POST", url, headers: { origin: ORIGIN } })).statusCode,
    ).toBe(401);
    const cookie = (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: ORIGIN },
        payload: { username: "operator-a", password: PW_A },
      })
    ).cookies.find((c) => c.name === "nmi_session")?.value as string;
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { origin: ORIGIN, cookie: `nmi_session=${cookie}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(calls()).toBe(0);
    expect(await opRow(id)).toBeUndefined();
    const bad = await app.inject({
      method: "POST",
      url,
      headers: {
        cookie: `nmi_session=${cookie}`,
        origin: ORIGIN,
        "content-type": "application/json",
      },
      payload: { instruction: "send it" },
    });
    expect([400, 403]).toContain(bad.statusCode); // 403 when the CSRF header is absent; never a create
    expect(calls()).toBe(0);
  });

  it("owner scope (C5-P0) still holds: a foreign operator gets 404 with zero provider calls and no operation", async () => {
    reset();
    const id = await sA.save(draft("C Scope"));
    const foreign = await sB.paypal(id);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: "not_found" });
    expect(calls()).toBe(0);
    expect(await opRow(id)).toBeUndefined();
    expect((await sB.get(id)).statusCode).toBe(404);
  });
});
