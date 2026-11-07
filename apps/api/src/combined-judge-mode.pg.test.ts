import { Writable } from "node:stream";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PostgresAuthStore, createAuditSink, createDb } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import type { InvoiceModelClient, NudgeModelClient, NudgeModelRequest } from "@nmi/ai";
import type { InvoiceDraft } from "@nmi/shared";
import { PayPalOutcomeUnknownError, PayPalRejectedError } from "@nmi/paypal";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv, fakePayPalCredentials } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { hashPassword } from "./auth/password.js";
import { fakePayPal } from "./test-paypal.js";

/**
 * Objective (P0 unified judge release): the explicitly enabled combined mode runs the full
 * human-controlled loop — AI parse → operator review/save → explicit PayPal Sandbox draft →
 * AI nudge draft — against real PostgreSQL with deterministic fake providers (never network).
 * Skipped without TEST_DATABASE_URL.
 *
 * Nothing here sends, pays, captures, refunds or schedules anything: the only external writes
 * a human operator can trigger are sandbox DRAFT creates and AI draft generations, each behind
 * authentication, CSRF/Origin checks, idempotent fencing and audit rows.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const ORIGIN = baseEnv.WEB_ORIGIN;
const USER_A = "combined-operator-a";
const USER_B = "combined-operator-b";
const PASSWORD_A = `pw-${randomBytes(12).toString("hex")}`;
const PASSWORD_B = `pw-${randomBytes(12).toString("hex")}`;
const NOW = new Date("2026-10-25T12:00:00Z");
const KEY = "sk-test-only-combined-synthetic-not-a-real-secret";

const combinedEnv = (over: Record<string, string | undefined> = {}) => ({
  ...baseEnv,
  DATABASE_URL: url as string,
  NMI_JUDGE_AI_MODE: "combined",
  OPENAI_API_KEY: KEY,
  OPENAI_MODEL: "gpt-6-luna",
  OPENAI_MAX_OUTPUT_TOKENS: "4096",
  NUDGE_AI_DRAFTING_ENABLED: "true",
  PAYPAL_DRAFTS_ENABLED: "true",
  ...fakePayPalCredentials,
  ...over,
});

const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concepts", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-11-30",
  taxPercent: null,
  discount: null,
  ...over,
});
const modelOutput = (over: Record<string, unknown> = {}) => ({
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concepts", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-11-30",
  taxPercent: null,
  discount: null,
  ...over,
});
const parseModel = (
  out: unknown,
): InvoiceModelClient & { calls: Array<{ input: string; instructions: string }> } => {
  const calls: Array<{ input: string; instructions: string }> = [];
  return {
    calls,
    generate: async (r) => {
      calls.push(r);
      if (out instanceof Error) throw out;
      return out;
    },
  };
};
const GOOD_NUDGE = {
  message:
    "Hi {{customer_name}},\n\nA quick reminder that invoice {{invoice_ref}} for {{amount}} was due on {{due_date}}. Could you let me know when payment is on its way?\n\nKind regards,",
  rationale: "A professional, concise reminder that names the invoice and asks for an update.",
};
class FakeNudgeModel implements NudgeModelClient {
  readonly model = "fake-combined-nudge-model";
  calls: NudgeModelRequest[] = [];
  next: () => unknown = () => GOOD_NUDGE;
  async generate(req: NudgeModelRequest) {
    this.calls.push(req);
    return this.next();
  }
}

describe.skipIf(!url)("combined judge mode end-to-end (real PostgreSQL, fake providers)", () => {
  let scratch: ScratchDatabase;
  const apps: FastifyInstance[] = [];
  // Discard Fastify logs to keep test output readable.
  const logStream = new Writable({
    write(_chunk, _e, cb) {
      cb();
    },
  });
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
  let keySeq = 0;
  const key = () => `key-${String(++keySeq).padStart(10, "0")}`;

  function makeApp(
    deps: {
      modelClient?: InvoiceModelClient;
      nudgeClient?: NudgeModelClient | null;
      paypal?: ReturnType<typeof fakePayPal>["client"] | null;
      env?: Record<string, string | undefined>;
    } = {},
  ) {
    const app = buildApp(loadConfig(combinedEnv(deps.env)), {
      db: createDb(scratch.pool),
      passwordParams: weak,
      logStream,
      clock: () => NOW,
      ...(deps.modelClient ? { modelClient: deps.modelClient } : {}),
      ...(deps.nudgeClient === null
        ? {}
        : { nudgeClient: deps.nudgeClient ?? new FakeNudgeModel() }),
      ...(deps.paypal === null ? {} : { paypal: deps.paypal ?? fakePayPal().client }),
    });
    apps.push(app);
    return app;
  }

  async function session(app: FastifyInstance, username: string, password: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN },
      payload: { username, password },
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === "nmi_session")?.value as string;
    const csrf = (res.json() as { csrfToken: string }).csrfToken;
    const headers = (extra: Record<string, string> = {}) => ({
      cookie: `nmi_session=${cookie}`,
      "x-csrf-token": csrf,
      origin: ORIGIN,
      ...extra,
    });
    return {
      post: (u: string, payload?: unknown, h: Record<string, string> = {}) =>
        app.inject({
          method: "POST",
          url: u,
          headers: headers(h),
          ...(payload === undefined ? {} : { payload: payload as object }),
        }),
      get: (u: string) =>
        app.inject({ method: "GET", url: u, headers: { cookie: `nmi_session=${cookie}` } }),
    };
  }
  type S = Awaited<ReturnType<typeof session>>;

  const saveDraft = async (s: S, d: InvoiceDraft = draft()) => {
    const res = await s.post("/api/invoice-drafts", d, { "idempotency-key": key() });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { id: string }).id;
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 25);
    const db = createDb(scratch.pool);
    const store = new PostgresAuthStore(db);
    const audit = createAuditSink(db);
    await provisionOperator(
      { store, audit, params: weak },
      { username: USER_A, password: PASSWORD_A },
    );
    await sql("DROP INDEX operators_single_row_uq"); // test-only: allow a second operator
    await sql(`INSERT INTO operators (username, password_hash) VALUES ('${USER_B}', $1)`, [
      await hashPassword(PASSWORD_B, weak),
    ]);
  });
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
    await sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  it("AI parse → human review → explicit PayPal draft → AI nudge, with exactly one remote create", async () => {
    const parse = parseModel(modelOutput());
    const nudge = new FakeNudgeModel();
    const fake = fakePayPal();
    const app = makeApp({ modelClient: parse, nudgeClient: nudge, paypal: fake.client });
    const s = await session(app, USER_A, PASSWORD_A);

    // 1. AI parses the operator's text (proposal only; nothing saved, no PayPal touched).
    const parsed = await s.post("/api/invoice-drafts/parse", {
      text: "Acme 2 logos 250 each, due Nov 30",
    });
    expect(parsed.statusCode, parsed.body).toBe(200);
    expect(parsed.json()).toMatchObject({
      status: "draft",
      draft: { customerName: "Acme Design" },
    });
    expect(parse.calls).toHaveLength(1);

    // 2. Human review: the operator reads the proposal, then explicitly saves it.
    const id = await saveDraft(s);
    const read = await s.get(`/api/invoice-drafts/${id}`);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ draft: { customerName: "Acme Design" } });
    // Saving alone creates no PayPal operation and no provider traffic.
    expect(read.json().paypal).toMatchObject({ state: "none", paypalInvoiceId: null });
    expect(fake.log.create).toHaveLength(0);

    // 3. Explicit human approval: the operator posts the draft action themselves.
    const created = await s.post(`/api/invoice-drafts/${id}/paypal-draft`, {});
    expect(created.statusCode, created.body).toBe(201);
    const remoteId = (created.json() as { paypalInvoiceId: string }).paypalInvoiceId;
    expect(remoteId).toMatch(/^INV2-FAKE-/);
    expect(fake.log.create).toHaveLength(1);
    // The verify step re-read the remote draft; no second create happened.
    expect(fake.log.get.length).toBeGreaterThanOrEqual(1);

    // 4. Duplicate approval replays the stored outcome instead of creating again.
    const replay = await s.post(`/api/invoice-drafts/${id}/paypal-draft`, {});
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ paypalInvoiceId: remoteId, replayed: true });
    expect(fake.log.create).toHaveLength(1);

    // 5. AI nudge drafting on the reviewed, draft-created invoice.
    const gen = await s.post(`/api/invoice-drafts/${id}/nudges`, {
      tone: "professional",
      timeZone: "Asia/Manila",
    });
    expect(gen.statusCode, gen.body).toBe(201);
    const nd = gen.json() as { id: string; message: string; status: string; version: number };
    expect(nd.status).toBe("pending_review");
    expect(nd.message).toContain("Hi Acme Design,");
    expect(nd.message).toContain(`invoice ${id.slice(0, 8)}`);
    expect(nudge.calls).toHaveLength(1);
    // The model saw enumerated facts only, never customer PII.
    const sent = JSON.stringify(nudge.calls[0]);
    for (const needle of ["Acme", "acme.example", id]) expect(sent, needle).not.toContain(needle);

    // Human review of the nudge, then approval for manual use (never a send).
    const seen = await s.get(`/api/nudges/${nd.id}`);
    expect(seen.statusCode).toBe(200);
    const approved = await s.post(`/api/nudges/${nd.id}/approve`, { version: 1 });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ status: "approved" });

    // Audit trail covers every human-approved step; nothing was sent anywhere.
    const rows = await sql(
      `SELECT action, outcome, COUNT(*)::int AS n FROM audit_log WHERE action IN ('invoice.parse','paypal.draft_create','nudge.generate','nudge.approve') GROUP BY action, outcome ORDER BY action`,
    );
    const ok = new Set(rows.filter((r) => r.outcome === "success").map((r) => r.action));
    expect(ok.has("invoice.parse")).toBe(true);
    expect(ok.has("paypal.draft_create")).toBe(true);
    expect(ok.has("nudge.generate")).toBe(true);
  });

  it("refuses anonymous, cross-operator and forged requests before any provider call", async () => {
    const parse = parseModel(modelOutput());
    const fake = fakePayPal();
    const app = makeApp({ modelClient: parse, paypal: fake.client });
    const sA = await session(app, USER_A, PASSWORD_A);
    const sB = await session(app, USER_B, PASSWORD_B);
    const id = await saveDraft(sA);

    const anon = { origin: ORIGIN };
    for (const [method, u, payload] of [
      ["POST", "/api/invoice-drafts/parse", { text: "x" }],
      ["POST", `/api/invoice-drafts/${id}/paypal-draft`, {}],
      [
        "POST",
        `/api/invoice-drafts/${id}/nudges`,
        { tone: "professional", timeZone: "Asia/Manila" },
      ],
    ] as const) {
      const r = await app.inject({ method, url: u, headers: anon, payload });
      expect(r.statusCode, u).toBe(401);
    }
    // Another operator's invoice is indistinguishable from missing.
    expect((await sB.get(`/api/invoice-drafts/${id}`)).statusCode).toBe(404);
    expect((await sB.post(`/api/invoice-drafts/${id}/paypal-draft`, {})).statusCode).toBe(404);
    expect(
      (
        await sB.post(`/api/invoice-drafts/${id}/nudges`, {
          tone: "professional",
          timeZone: "Asia/Manila",
        })
      ).statusCode,
    ).toBe(404);
    expect(parse.calls).toHaveLength(0);
    expect(fake.log.create).toHaveLength(0);
  });

  it("fails closed on disabled providers without touching fakes", async () => {
    // PayPal drafting builds but no client is wired: explicit human action still cannot create.
    const noPaypal = makeApp({
      modelClient: parseModel(modelOutput()),
      nudgeClient: new FakeNudgeModel(),
      paypal: null,
      env: {
        PAYPAL_DRAFTS_ENABLED: "false",
        PAYPAL_CLIENT_ID: undefined,
        PAYPAL_CLIENT_SECRET: undefined,
      },
    });
    const s = await session(noPaypal, USER_A, PASSWORD_A);
    const id = await saveDraft(s);
    const r = await s.post(`/api/invoice-drafts/${id}/paypal-draft`, {});
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ error: "paypal_disabled" });

    // AI nudge drafting without a client answers 503 while review still works.
    const noNudge = makeApp({ modelClient: parseModel(modelOutput()), nudgeClient: null });
    const s2 = await session(noNudge, USER_A, PASSWORD_A);
    const id2 = await saveDraft(s2);
    const g = await s2.post(`/api/invoice-drafts/${id2}/nudges`, {
      tone: "professional",
      timeZone: "Asia/Manila",
    });
    expect(g.statusCode).toBe(503);
    expect(g.json()).toEqual({ error: "ai_unavailable" });
    expect((await s2.get(`/api/nudges?view=pending&invoiceId=${id2}`)).json().items).toEqual([]);
  });

  it("reports provider failure without ever claiming a draft exists", async () => {
    const fake = fakePayPal();
    fake.on.create = async () => {
      throw new PayPalRejectedError("duplicate_invoice_number");
    };
    const app = makeApp({ modelClient: parseModel(modelOutput()), paypal: fake.client });
    const s = await session(app, USER_A, PASSWORD_A);
    const id = await saveDraft(s);
    const r = await s.post(`/api/invoice-drafts/${id}/paypal-draft`, {});
    expect(r.statusCode).toBe(502);
    expect(r.json()).toMatchObject({ error: "paypal_rejected" });
    const read = (await s.get(`/api/invoice-drafts/${id}`)).json() as {
      paypalInvoiceId: string | null;
      paypal: { state: string };
    };
    expect(read.paypalInvoiceId).toBeNull();
    expect(read.paypal.state).toBe("rejected");

    fake.on.create = async () => {
      throw new PayPalOutcomeUnknownError("timeout");
    };
    const id2 = await saveDraft(s);
    const u = await s.post(`/api/invoice-drafts/${id2}/paypal-draft`, {});
    expect(u.statusCode).toBe(502);
    expect(u.json()).toMatchObject({ error: "paypal_outcome_unknown" });
    const read2 = (await s.get(`/api/invoice-drafts/${id2}`)).json() as {
      paypal: { state: string };
    };
    expect(read2.paypal.state).toBe("unknown");
  });

  it("combined judge budgets bound both providers (3 per 10 minutes each)", async () => {
    const app = makeApp({ modelClient: parseModel(modelOutput()) });
    const s = await session(app, USER_A, PASSWORD_A);
    for (let i = 0; i < 3; i++) {
      const r = await s.post("/api/invoice-drafts/parse", { text: `invoice ${i}` });
      expect(r.statusCode).toBe(200);
    }
    const limited = await s.post("/api/invoice-drafts/parse", { text: "one too many" });
    expect(limited.statusCode).toBe(429);

    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push(await saveDraft(s));
    for (let i = 0; i < 3; i++) {
      const g = await s.post(`/api/invoice-drafts/${ids[i]}/nudges`, {
        tone: "professional",
        timeZone: "Asia/Manila",
      });
      expect(g.statusCode, g.body).toBe(201);
    }
    const fourth = await s.post(`/api/invoice-drafts/${ids[3]}/nudges`, {
      tone: "professional",
      timeZone: "Asia/Manila",
    });
    expect(fourth.statusCode).toBe(429);
  });

  it("missing combined credentials refuse to start, and limited still forbids PayPal", () => {
    expect(() => loadConfig(combinedEnv({ PAYPAL_DRAFTS_ENABLED: "false" }))).toThrow(
      /PAYPAL_DRAFTS_ENABLED=true/,
    );
    expect(() => loadConfig(combinedEnv({ PAYPAL_CLIENT_ID: undefined }))).toThrow(
      /PAYPAL_CLIENT_ID/,
    );
    expect(() => loadConfig({ ...combinedEnv(), NMI_JUDGE_AI_MODE: "limited" })).toThrow(
      /forbids PayPal/,
    );
  });
});
