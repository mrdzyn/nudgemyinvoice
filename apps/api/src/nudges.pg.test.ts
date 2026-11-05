import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresAuthStore, createAuditSink, createDb } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import type { NudgeModelClient, NudgeModelRequest } from "@nmi/ai";
import type { InvoiceDraft } from "@nmi/shared";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { hashPassword } from "./auth/password.js";

/**
 * Objective (NMI-P6): AI nudge drafting and review is authenticated, CSRF/Origin protected, operator-scoped,
 * bounded in cost, never shows the model customer data, refuses invalid model output, binds every review
 * transition to the version the operator saw, keeps real counts and audits without message content. Nothing
 * here sends or schedules anything; `fetch` is spied to prove no network call happens.
 * Real Fastify + real PostgreSQL; the model is a deterministic fake.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const ORIGIN = baseEnv.WEB_ORIGIN;
const PW_A = `pw-${randomBytes(12).toString("hex")}`;
const PW_B = `pw-${randomBytes(12).toString("hex")}`;
const NOW = new Date("2026-11-05T04:00:00.000Z"); // 2026-11-05 12:00 in Asia/Manila

const GOOD = {
  message:
    "Hi {{customer_name}},\n\nA quick reminder that invoice {{invoice_ref}} for {{amount}} was due on {{due_date}}. Could you let me know when payment is on its way?\n\nKind regards,",
  rationale: "A professional, concise reminder that names the invoice and asks for an update.",
};
const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  customerName: "Zorblax Industries",
  customerEmail: "pii.needle@zorblax.example",
  currency: "USD",
  lineItems: [{ description: "Secret project work", quantity: "2", unitPrice: "600.00" }],
  dueDate: "2026-10-30",
  taxPercent: null,
  discount: null,
  ...over,
});

class FakeNudgeModel implements NudgeModelClient {
  readonly model = "fake-nudge-model";
  calls: NudgeModelRequest[] = [];
  next: () => unknown = () => GOOD;
  async generate(req: NudgeModelRequest) {
    this.calls.push(req);
    return this.next();
  }
}

describe.skipIf(!url)("AI nudge queue API (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  const apps: FastifyInstance[] = [];
  const model = new FakeNudgeModel();
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
  let fetchSpy: { mockRestore: () => void; mock: { calls: unknown[] } };

  function makeApp(opts: { client?: NudgeModelClient | null; budget?: number } = {}) {
    const app = buildApp(
      loadConfig({ ...baseEnv, DATABASE_URL: url, PAYPAL_DRAFTS_ENABLED: "false" }),
      {
        db: createDb(scratch.pool),
        passwordParams: weak,
        ...(opts.client === null ? {} : { nudgeClient: opts.client ?? model }),
        nudgeSeams: { generateBudgetMax: opts.budget ?? 100 },
        clock: () => NOW,
      },
    );
    apps.push(app);
    return app;
  }
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
    const auth = { cookie: `nmi_session=${cookie}` };
    const mut = { ...auth, "x-csrf-token": csrf, origin: ORIGIN };
    return {
      get: (u: string) => app.inject({ method: "GET", url: u, headers: auth }),
      post: (u: string, payload?: unknown, headers: Record<string, string> = mut) =>
        app.inject({ method: "POST", url: u, headers, payload: payload as object }),
      csrfOnly: { ...auth, "x-csrf-token": csrf },
      originOnly: { ...auth, origin: ORIGIN },
      mut,
    };
  }
  type S = Awaited<ReturnType<typeof login>>;
  let n = 0;
  const saveInvoice = async (s: S, d: InvoiceDraft = draft()) => {
    const r = await s.post("/api/invoice-drafts", d, {
      ...s.mut,
      "idempotency-key": `key-${String(++n).padStart(10, "0")}`,
    });
    expect(r.statusCode, r.body).toBe(201);
    return (r.json() as { id: string }).id;
  };
  type N = {
    id: string;
    version: number;
    status: string;
    message: string;
    aiMessage: string;
    edited: boolean;
    facts: Record<string, unknown>;
    sentToCustomer: boolean;
  };
  const generate = (s: S, invoiceId: string, body: Record<string, unknown> = {}) =>
    s.post(`/api/invoice-drafts/${invoiceId}/nudges`, {
      tone: "professional",
      timeZone: "Asia/Manila",
      ...body,
    });

  let sA: S;
  let sB: S;
  let app: FastifyInstance;
  beforeAll(async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    scratch = await createScratchDatabase(url as string, 15);
    const db = createDb(scratch.pool);
    await provisionOperator(
      { store: new PostgresAuthStore(db), audit: createAuditSink(db), params: weak },
      { username: "operator-a", password: PW_A },
    );
    await sql("DROP INDEX operators_single_row_uq"); // test-only: allow a second operator
    await sql(`INSERT INTO operators (username, password_hash) VALUES ('operator-b', $1)`, [
      await hashPassword(PW_B, weak),
    ]);
    app = makeApp();
    sA = await login(app, "operator-a", PW_A);
    sB = await login(app, "operator-b", PW_B);
  });
  afterAll(async () => {
    fetchSpy?.mockRestore();
    while (apps.length) await apps.pop()?.close();
    await scratch?.drop();
  });

  it("every route refuses an anonymous caller (401)", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    for (const [method, u] of [
      ["GET", "/api/nudges/summary"],
      ["GET", "/api/nudges"],
      ["GET", `/api/nudges/${id}`],
      ["POST", `/api/invoice-drafts/${id}/nudges`],
      ["POST", `/api/nudges/${id}/edit`],
      ["POST", `/api/nudges/${id}/approve`],
      ["POST", `/api/nudges/${id}/reject`],
    ] as const) {
      const r = await app.inject({
        method,
        url: u,
        headers: { origin: ORIGIN },
        ...(method === "POST" ? { payload: {} } : {}),
      });
      expect(r.statusCode, u).toBe(401);
    }
  });

  it("mutations need both the CSRF token and the exact Origin; no model call on refusal", async () => {
    const inv = await saveInvoice(sA);
    const before = model.calls.length;
    const body = { tone: "firm", timeZone: "Asia/Manila" };
    expect((await sA.post(`/api/invoice-drafts/${inv}/nudges`, body, sA.csrfOnly)).statusCode).toBe(
      403,
    );
    expect(
      (await sA.post(`/api/invoice-drafts/${inv}/nudges`, body, sA.originOnly)).statusCode,
    ).toBe(403);
    expect(model.calls.length).toBe(before);
    expect((await sA.get(`/api/nudges?view=pending&invoiceId=${inv}`)).json().items).toEqual([]);
  });

  it("drafts from VERIFIED facts: the model sees no name, e-mail, item, amount, date or id; the stored text has the real values", async () => {
    const inv = await saveInvoice(sA);
    const r = await generate(sA, inv);
    expect(r.statusCode, r.body).toBe(201);
    const nd = r.json() as N;
    expect(nd).toMatchObject({
      status: "pending_review",
      version: 1,
      edited: false,
      sentToCustomer: false,
    });
    expect(nd.message).toContain("Hi Zorblax Industries,");
    expect(nd.message).toContain(
      `invoice ${inv.slice(0, 8)} for USD 1,200.00 was due on October 30, 2026.`,
    );
    expect(nd.facts).toMatchObject({
      currency: "USD",
      amount: "USD 1,200.00",
      dueDate: "2026-10-30",
      daysPastDue: 6,
      asOfDate: "2026-11-05",
      timeZone: "Asia/Manila",
    });
    const sent = JSON.stringify(model.calls.at(-1));
    for (const needle of [
      "Zorblax",
      "zorblax.example",
      "Secret project",
      "1,200",
      "1200",
      "2026",
      inv,
      inv.slice(0, 8),
    ])
      expect(sent, needle).not.toContain(needle);
    expect(JSON.parse(model.calls.at(-1)?.input ?? "{}")).toEqual({
      tone: "professional",
      currency: "USD",
      due_status: "the due date passed up to one week ago",
      earlier_reminder_approved: false,
    });
  });

  it("refuses invalid model output (422) and provider failure (503) without storing anything", async () => {
    const inv = await saveInvoice(sA);
    model.next = () => ({
      ...GOOD,
      message: GOOD.message.replace(
        "Could you",
        "Pay within 3 days or a late fee applies. Could you",
      ),
    });
    expect((await generate(sA, inv)).statusCode).toBe(422);
    // Owner refinement 1: an unsupported payment-status claim, in the message or the rationale, is refused.
    model.next = () => ({
      ...GOOD,
      message: GOOD.message.replace("Could you", "The invoice is still unpaid. Could you"),
    });
    expect([(await generate(sA, inv)).statusCode]).toEqual([422]);
    model.next = () => ({ ...GOOD, rationale: "The balance is outstanding, so it is direct." });
    const rs = await generate(sA, inv);
    expect([rs.statusCode, rs.json()]).toEqual([422, { error: "ai_output_rejected" }]);
    model.next = () => {
      throw new Error("provider said: sk-secret Zorblax");
    };
    const r = await generate(sA, inv);
    expect(r.statusCode).toBe(503);
    expect(r.body).not.toMatch(/sk-secret|Zorblax/);
    model.next = () => GOOD;
    expect((await sA.get(`/api/nudges?view=pending&invoiceId=${inv}`)).json().items).toEqual([]);
  });

  it("without a configured model, drafting answers 503 ai_unavailable and review still works", async () => {
    const off = makeApp({ client: null });
    const s = await login(off, "operator-a", PW_A);
    const inv = await saveInvoice(s);
    const r = await generate(s, inv);
    expect([r.statusCode, r.json()]).toEqual([503, { error: "ai_unavailable" }]);
    expect((await s.get("/api/nudges/summary")).json().aiAvailable).toBe(false);
  });

  it("another operator's invoice or nudge is indistinguishable from a missing one, and costs no model call", async () => {
    const inv = await saveInvoice(sA);
    const nd = (await generate(sA, inv)).json() as N;
    const before = model.calls.length;
    expect((await generate(sB, inv)).statusCode).toBe(404);
    expect(model.calls.length).toBe(before);
    expect((await sB.get(`/api/nudges/${nd.id}`)).statusCode).toBe(404);
    for (const a of ["approve", "reject"])
      expect((await sB.post(`/api/nudges/${nd.id}/${a}`, { version: 1 })).statusCode).toBe(404);
    expect(
      (await sB.post(`/api/nudges/${nd.id}/edit`, { version: 1, message: "hijack attempt text" }))
        .statusCode,
    ).toBe(404);
    expect((await sB.get("/api/nudges/summary")).json().counts.total).toBe(0);
  });

  it("one pending draft per invoice: regenerating must name the exact pending draft and version; the old one is superseded", async () => {
    const inv = await saveInvoice(sA);
    const first = (await generate(sA, inv)).json() as N;
    const before = model.calls.length;
    const dup = await generate(sA, inv, { tone: "firm" });
    expect([dup.statusCode, dup.json().error]).toEqual([409, "pending_exists"]);
    const stale = await generate(sA, inv, { tone: "firm", replace: { id: first.id, version: 7 } });
    expect([stale.statusCode, stale.json().error]).toEqual([409, "version_conflict"]);
    expect(model.calls.length).toBe(before); // refused before any model call
    const second = await generate(sA, inv, { tone: "firm", replace: { id: first.id, version: 1 } });
    expect(second.statusCode).toBe(201);
    expect(((await sA.get(`/api/nudges/${first.id}`)).json() as N).status).toBe("superseded");
  });

  it("review: edit keeps the AI original; approve/reject are version-bound and one-way; approval sends nothing", async () => {
    const inv = await saveInvoice(sA);
    const nd = (await generate(sA, inv)).json() as N;
    const edited = await sA.post(`/api/nudges/${nd.id}/edit`, {
      version: 1,
      message:
        "Hi Zorblax Industries, edited by me. Please let me know when payment is on its way.",
    });
    expect(edited.statusCode).toBe(200);
    const e = edited.json() as N;
    expect(e).toMatchObject({ version: 2, edited: true, aiMessage: nd.aiMessage });
    expect((await sA.post(`/api/nudges/${nd.id}/approve`, { version: 1 })).json().error).toBe(
      "version_conflict",
    );
    const ap = await sA.post(`/api/nudges/${nd.id}/approve`, { version: 2 });
    expect(ap.json()).toMatchObject({ status: "approved", sentToCustomer: false });
    expect((await sA.post(`/api/nudges/${nd.id}/reject`, { version: 3 })).json().error).toBe(
      "not_pending",
    );
    expect(
      (
        await sA.post(`/api/nudges/${nd.id}/edit`, { version: 3, message: "late change attempt" })
      ).json().error,
    ).toBe("not_pending");
    // A later draft for the same invoice knows an earlier one was approved.
    await generate(sA, inv, { tone: "firm" });
    expect(JSON.parse(model.calls.at(-1)?.input ?? "{}").earlier_reminder_approved).toBe(true);
  });

  it("validates bodies strictly", async () => {
    const inv = await saveInvoice(sA);
    for (const b of [
      { tone: "rude", timeZone: "Asia/Manila" },
      { tone: "firm", timeZone: "Mars/Base" },
      { tone: "firm", timeZone: "Asia/Manila", send: true },
    ])
      expect((await sA.post(`/api/invoice-drafts/${inv}/nudges`, b)).statusCode).toBe(400);
    const nd = (await generate(sA, inv)).json() as N;
    for (const b of [{ version: 0 }, { version: 1, extra: 1 }, { version: "1" }])
      expect((await sA.post(`/api/nudges/${nd.id}/approve`, b)).statusCode).toBe(400);
    for (const m of ["", "x".repeat(2001), "bell\u0007"])
      expect(
        (await sA.post(`/api/nudges/${nd.id}/edit`, { version: 1, message: m })).statusCode,
      ).toBe(400);
  });

  it("bounded cost: the per-operator budget refuses further drafts with 429 and Retry-After", async () => {
    const small = makeApp({ budget: 2 });
    const s = await login(small, "operator-a", PW_A);
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await generate(s, await saveInvoice(s))).statusCode);
    expect(codes).toEqual([201, 201, 429]);
  });

  it("summary counts and queue views are exact", async () => {
    const C = (await sA.get("/api/nudges/summary")).json().counts;
    const pending = (await sA.get("/api/nudges?view=pending")).json().items.length;
    const approved = (await sA.get("/api/nudges?view=approved")).json().items.length;
    const history = (await sA.get("/api/nudges?view=history")).json().items.length;
    const db = await sql(
      `SELECT status, count(*)::int n FROM invoice_nudges i JOIN operators o ON o.id = i.operator_id WHERE o.username='operator-a' GROUP BY 1`,
    );
    const by = (s: string) => db.find((r) => r.status === s)?.n ?? 0;
    expect(C).toEqual({
      pending: by("pending_review"),
      approved: by("approved"),
      rejected: by("rejected"),
      superseded: by("superseded"),
      total: db.reduce((a, r) => a + r.n, 0),
    });
    expect([pending, approved, history]).toEqual([
      C.pending,
      C.approved,
      C.rejected + C.superseded,
    ]);
    expect((await sA.get("/api/nudges?view=sent")).statusCode).toBe(400);
  });

  it("audits generation and review without any message text, name or e-mail; nothing touched the network", async () => {
    const rows = await sql(
      `SELECT action, outcome, detail::text d FROM audit_log WHERE action LIKE 'nudge.%'`,
    );
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["nudge.generate", "nudge.edit", "nudge.approve"]),
    );
    for (const r of rows)
      expect(r.d).not.toMatch(/Zorblax|zorblax|Hi |reminder|Kind regards|1,200/);
    expect(fetchSpy.mock.calls.length).toBe(0);
  });
});
