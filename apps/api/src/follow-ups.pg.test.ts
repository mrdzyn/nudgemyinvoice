import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresAuthStore, createAuditSink, createDb } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import type { InvoiceDraft } from "@nmi/shared";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv, fakePayPalCredentials } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { hashPassword } from "./auth/password.js";

/**
 * Objective (NMI-FUP-01): local follow-up scheduling is authenticated, CSRF/Origin protected,
 * operator-scoped, strictly validated, duplicate-free, persistent, and "due" is computed on the
 * server at read time from the stored UTC instant. Nothing here may reach a provider or the network.
 * Real Fastify + real PostgreSQL; the model client throws and `fetch` is spied if anything tries.
 *
 * NOTE: production allows exactly one operator; this suite drops that index in its own scratch
 * schema ONLY to create a second operator for isolation tests.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const ORIGIN = baseEnv.WEB_ORIGIN;
const PW_A = `pw-${randomBytes(12).toString("hex")}`;
const PW_B = `pw-${randomBytes(12).toString("hex")}`;
const T0 = new Date("2026-10-30T12:00:00.000Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const iso = (ms: number) => new Date(ms).toISOString();

const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concept", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2030-12-01",
  taxPercent: null,
  discount: null,
  ...over,
});
const explode = () => {
  throw new Error("follow-ups must not call a provider");
};

describe.skipIf(!url)("follow-up scheduling (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let now = T0;
  const apps: FastifyInstance[] = [];
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
  let fetchSpy: { mockRestore: () => void; mock: { calls: unknown[] } };

  function makeApp() {
    const app = buildApp(
      loadConfig({
        ...baseEnv,
        DATABASE_URL: url,
        PAYPAL_DRAFTS_ENABLED: "false",
        ...fakePayPalCredentials,
      }),
      {
        db: createDb(scratch.pool),
        passwordParams: weak,
        modelClient: { generate: async () => explode() },
        clock: () => now,
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
      app,
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
  const body = (invoiceId: string, over: Record<string, unknown> = {}) => ({
    invoiceId,
    dueAt: iso(now.getTime() + 2 * HOUR),
    timezone: "Asia/Manila",
    note: "Ask about the PO number",
    message: "Hi Acme, a friendly reminder about your invoice. Thank you!",
    ...over,
  });
  const resBody = (over: Record<string, unknown> = {}) => {
    const rest: Record<string, unknown> = body("00000000-0000-4000-8000-000000000000", over);
    delete rest["invoiceId"];
    return rest;
  };
  type FU = {
    id: string;
    invoiceId: string;
    dueAt: string;
    timezone: string;
    note: string | null;
    message: string;
    status: string;
    state: string;
    sentToCustomer: boolean;
    invoice?: { customerName: string; currency: string; total: string };
  };
  type List = { now: string; counts: { due: number; upcoming: number }; items: FU[] };
  const schedule = async (s: S, invoiceId: string, over: Record<string, unknown> = {}) => {
    const r = await s.post("/api/follow-ups", body(invoiceId, over));
    return { r, fu: r.json() as FU };
  };
  const list = async (s: S) => (await s.get("/api/follow-ups")).json() as List;

  let sA: S;
  let sB: S;
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
    const app = makeApp();
    sA = await login(app, "operator-a", PW_A);
    sB = await login(app, "operator-b", PW_B);
  });
  afterAll(async () => {
    fetchSpy?.mockRestore();
    while (apps.length) await apps.pop()?.close();
    await scratch?.drop();
  });

  it("rejects every route for an anonymous caller (401) and leaks nothing", async () => {
    const app = apps[0] as FastifyInstance;
    const id = "00000000-0000-4000-8000-000000000001";
    for (const [method, u] of [
      ["GET", "/api/follow-ups"],
      ["GET", `/api/invoice-drafts/${id}/follow-ups`],
      ["POST", "/api/follow-ups"],
      ["POST", `/api/follow-ups/${id}/complete`],
      ["POST", `/api/follow-ups/${id}/cancel`],
      ["POST", `/api/follow-ups/${id}/reschedule`],
    ] as const) {
      const r = await app.inject({
        method,
        url: u,
        headers: { origin: ORIGIN },
        ...(method === "POST" ? { payload: {} } : {}),
      });
      expect(r.statusCode, `${method} ${u}`).toBe(401);
      expect(r.body).not.toMatch(/items|message|invoice/i);
    }
  });

  it("requires the CSRF token and the exact Origin on every mutation", async () => {
    const inv = await saveInvoice(sA);
    const payload = body(inv);
    expect((await sA.post("/api/follow-ups", payload, sA.originOnly)).statusCode).toBe(403);
    expect((await sA.post("/api/follow-ups", payload, sA.csrfOnly)).statusCode).toBe(403);
    expect(
      (await sA.post("/api/follow-ups", payload, { ...sA.mut, origin: "https://evil.example" }))
        .statusCode,
    ).toBe(403);
    expect(
      (await sA.post("/api/follow-ups", payload, { ...sA.mut, "x-csrf-token": "x".repeat(40) }))
        .statusCode,
    ).toBe(403);
    expect((await list(sA)).items.filter((i) => i.invoiceId === inv)).toEqual([]);
    const { fu } = await schedule(sA, inv);
    for (const path of ["complete", "cancel"]) {
      expect(
        (await sA.post(`/api/follow-ups/${fu.id}/${path}`, undefined, sA.originOnly)).statusCode,
      ).toBe(403);
    }
    expect(
      (await sA.post(`/api/follow-ups/${fu.id}/reschedule`, resBody(), sA.csrfOnly)).statusCode,
    ).toBe(403);
    expect((await list(sA)).items.find((i) => i.id === fu.id)?.status).toBe("active");
    await sA.post(`/api/follow-ups/${fu.id}/cancel`, {});
  });

  it("schedules a follow-up: exact contract, UTC instant stored, nothing marked as sent", async () => {
    const inv = await saveInvoice(sA, draft({ customerName: "Contract Co" }));
    const { r, fu } = await schedule(sA, inv, {
      dueAt: "2026-11-02T01:30:00.000Z",
      timezone: "America/New_York",
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(fu).sort()).toEqual(
      [
        "canceledAt",
        "completedAt",
        "createdAt",
        "dueAt",
        "id",
        "invoiceId",
        "message",
        "note",
        "sentToCustomer",
        "state",
        "status",
        "timezone",
      ].sort(),
    );
    expect(fu).toMatchObject({
      invoiceId: inv,
      status: "active",
      state: "upcoming",
      timezone: "America/New_York",
      sentToCustomer: false,
      dueAt: "2026-11-02T01:30:00.000Z",
    });
    const [row] = await sql(
      "SELECT to_char(due_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS') AS utc, timezone, status, operator_id IS NOT NULL AS owned FROM invoice_follow_ups WHERE id = $1",
      [fu.id],
    );
    expect(row).toEqual({
      utc: "2026-11-02T01:30:00",
      timezone: "America/New_York",
      status: "active",
      owned: true,
    });
    await sA.post(`/api/follow-ups/${fu.id}/cancel`, {});
  });

  it("validates strictly: bad instants, zones, text, extra keys, window", async () => {
    const inv = await saveInvoice(sA);
    const bad: [string, Record<string, unknown>][] = [
      ["offset instead of UTC Z", { dueAt: "2026-11-01T10:00:00+08:00" }],
      ["date only", { dueAt: "2026-11-01" }],
      ["not a date", { dueAt: "tomorrow" }],
      ["number", { dueAt: 1790000000000 }],
      ["missing time zone", { timezone: undefined }],
      ["unknown time zone", { timezone: "Mars/Olympus" }],
      ["offset-style zone", { timezone: "+08:00" }],
      ["traversal-looking zone", { timezone: "../etc/passwd" }],
      ["empty message", { message: "   " }],
      ["message too long", { message: "x".repeat(2001) }],
      ["note too long", { note: "n".repeat(501) }],
      ["control character in message", { message: "Hi\u0000there" }],
      ["control character in note", { note: "a\u0007b" }],
      ["unknown extra key", { status: "completed" }],
      ["client-supplied owner", { operatorId: "00000000-0000-4000-8000-000000000009" }],
      ["more than 5 minutes in the past", { dueAt: iso(now.getTime() - 6 * MIN) }],
      ["more than two years ahead", { dueAt: iso(now.getTime() + 800 * 24 * HOUR) }],
    ];
    for (const [label, over] of bad) {
      const { r } = await schedule(sA, inv, over);
      expect(r.statusCode, label + " " + r.body).toBe(400);
    }
    expect(
      (await sA.post("/api/follow-ups", { ...body(inv), invoiceId: "not-a-uuid" })).statusCode,
    ).toBe(400);
    expect((await sA.post("/api/follow-ups", "not json at all")).statusCode).toBeGreaterThanOrEqual(
      400,
    );
    expect((await list(sA)).items.filter((i) => i.invoiceId === inv)).toEqual([]);
    // Boundaries that ARE accepted: now, 4 minutes ago (grace), multiline note/message, empty note.
    const ok = await schedule(sA, inv, {
      dueAt: iso(now.getTime() - 4 * MIN),
      note: "",
      message: "Line one\nLine two",
    });
    expect(ok.r.statusCode, ok.r.body).toBe(201);
    expect(ok.fu.note).toBeNull();
    expect(ok.fu.state).toBe("due");
    await sA.post(`/api/follow-ups/${ok.fu.id}/cancel`, {});
  });

  it("prevents duplicate active schedules per invoice (409) at API and database level, allows a new one after closing", async () => {
    const inv = await saveInvoice(sA);
    const first = await schedule(sA, inv);
    expect(first.r.statusCode).toBe(201);
    const second = await schedule(sA, inv, { dueAt: iso(now.getTime() + 3 * HOUR) });
    expect(second.r.statusCode).toBe(409);
    expect(second.r.json()).toEqual({ error: "duplicate_active" });
    const burst = await Promise.all(
      [1, 2, 3, 4, 5].map(() => schedule(sA, inv, { dueAt: iso(now.getTime() + 4 * HOUR) })),
    );
    expect(burst.every((b) => b.r.statusCode === 409)).toBe(true);
    await expect(
      sql(
        `INSERT INTO invoice_follow_ups (invoice_id, operator_id, due_at, timezone, message) SELECT invoice_id, operator_id, now(), 'UTC', 'x' FROM invoice_follow_ups WHERE id = $1`,
        [first.fu.id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    expect((await sA.post(`/api/follow-ups/${first.fu.id}/complete`, {})).statusCode).toBe(200);
    const again = await schedule(sA, inv);
    expect(again.r.statusCode, again.r.body).toBe(201);
    expect(
      Number(
        (
          await sql(
            "SELECT count(*)::int AS c FROM invoice_follow_ups WHERE invoice_id=$1 AND status='active'",
            [inv],
          )
        )[0].c,
      ),
    ).toBe(1);
    await sA.post(`/api/follow-ups/${again.fu.id}/cancel`, {});
  });

  it("is operator-scoped: another operator cannot schedule, see, complete, cancel or reschedule", async () => {
    const inv = await saveInvoice(sA);
    const { fu } = await schedule(sA, inv);
    const forged = await schedule(sB, inv);
    expect(forged.r.statusCode).toBe(404);
    expect(forged.r.json()).toEqual({ error: "not_found" });
    expect((await sB.get(`/api/invoice-drafts/${inv}/follow-ups`)).statusCode).toBe(404);
    expect((await list(sB)).items.find((i) => i.id === fu.id)).toBeUndefined();
    for (const path of ["complete", "cancel"]) {
      expect((await sB.post(`/api/follow-ups/${fu.id}/${path}`, {})).statusCode).toBe(404);
    }
    expect((await sB.post(`/api/follow-ups/${fu.id}/reschedule`, resBody())).statusCode).toBe(404);
    // An unknown id looks identical to another operator's id.
    const ghost = await sB.post("/api/follow-ups/00000000-0000-4000-8000-0000000000aa/cancel", {});
    expect(ghost.statusCode).toBe(404);
    expect((await list(sA)).items.find((i) => i.id === fu.id)?.status).toBe("active");
    await sA.post(`/api/follow-ups/${fu.id}/cancel`, {});
  });

  it("computes Due and Upcoming on the server at read time and survives an app restart", async () => {
    const inv1 = await saveInvoice(sA, draft({ customerName: "Soon Ltd" }));
    const inv2 = await saveInvoice(sA, draft({ customerName: "Later Ltd" }));
    const base = (await list(sA)).counts;
    const soon = await schedule(sA, inv1, { dueAt: iso(now.getTime() + 1 * HOUR) });
    const later = await schedule(sA, inv2, { dueAt: iso(now.getTime() + 48 * HOUR) });
    expect([soon.r.statusCode, later.r.statusCode]).toEqual([201, 201]);
    let l = await list(sA);
    expect(l.now).toBe(now.toISOString());
    expect(l.counts).toEqual({ due: base.due, upcoming: base.upcoming + 2 });
    expect(l.items.find((i) => i.id === soon.fu.id)?.state).toBe("upcoming");
    expect(l.items.find((i) => i.id === soon.fu.id)?.invoice?.customerName).toBe("Soon Ltd");
    // No scheduler runs: only the clock moves. The earlier follow-up becomes due by itself.
    const realNow = now;
    now = new Date(realNow.getTime() + 2 * HOUR);
    l = await list(sA);
    expect(l.items.find((i) => i.id === soon.fu.id)?.state).toBe("due");
    expect(l.items.find((i) => i.id === later.fu.id)?.state).toBe("upcoming");
    const dueNow = l.items.filter((i) => Date.parse(i.dueAt) <= now.getTime()).length;
    expect(l.counts).toEqual({ due: dueNow, upcoming: l.items.length - dueNow });
    expect(dueNow).toBeGreaterThanOrEqual(base.due + 1);
    expect(l.items.map((i) => Date.parse(i.dueAt))).toEqual(
      l.items.map((i) => Date.parse(i.dueAt)).sort((a, b) => a - b),
    );
    // Restart: a brand new application instance over the same database sees the same records.
    const restarted = await login(makeApp(), "operator-a", PW_A);
    const l2 = await list(restarted);
    expect(l2.counts).toEqual(l.counts);
    expect(l2.items.find((i) => i.id === soon.fu.id)).toMatchObject({
      state: "due",
      message: soon.fu.message,
    });
    expect(
      Number(
        (
          await sql("SELECT count(*)::int AS c FROM invoice_follow_ups WHERE id=$1", [soon.fu.id])
        )[0].c,
      ),
    ).toBe(1);
    now = realNow;
    await sA.post(`/api/follow-ups/${soon.fu.id}/cancel`, {});
    await sA.post(`/api/follow-ups/${later.fu.id}/cancel`, {});
  });

  it("supports complete, reschedule and cancel with correct state rules", async () => {
    const inv = await saveInvoice(sA);
    const { fu } = await schedule(sA, inv, { dueAt: iso(now.getTime() + 1 * HOUR) });
    const moved = await sA.post(
      `/api/follow-ups/${fu.id}/reschedule`,
      resBody({
        dueAt: iso(now.getTime() + 24 * HOUR),
        timezone: "Europe/Vienna",
        note: "moved",
        message: "Edited message",
      }),
    );
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json()).toMatchObject({
      id: fu.id,
      status: "active",
      state: "upcoming",
      timezone: "Europe/Vienna",
      note: "moved",
      message: "Edited message",
      dueAt: iso(now.getTime() + 24 * HOUR),
    });
    expect(
      (
        await sA.post(
          `/api/follow-ups/${fu.id}/reschedule`,
          resBody({ dueAt: "2026-01-01T00:00:00.000Z" }),
        )
      ).statusCode,
    ).toBe(400);
    const done = await sA.post(`/api/follow-ups/${fu.id}/complete`, {});
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: "completed", state: "completed" });
    expect((done.json() as { completedAt: string | null }).completedAt).not.toBeNull();
    // Closed rows cannot be changed again.
    for (const path of ["complete", "cancel"])
      expect((await sA.post(`/api/follow-ups/${fu.id}/${path}`, {})).statusCode).toBe(409);
    expect((await sA.post(`/api/follow-ups/${fu.id}/reschedule`, resBody())).statusCode).toBe(409);
    expect((await list(sA)).items.find((i) => i.id === fu.id)).toBeUndefined();
    const second = await schedule(sA, inv);
    const canceled = await sA.post(`/api/follow-ups/${second.fu.id}/cancel`, {});
    expect(canceled.json()).toMatchObject({ status: "canceled", state: "canceled" });
    expect((canceled.json() as { canceledAt: string | null }).canceledAt).not.toBeNull();
    expect((await sA.post(`/api/follow-ups/${second.fu.id}/complete`, {})).statusCode).toBe(409);
    expect(
      (await sA.post(`/api/follow-ups/${second.fu.id}/complete`, { extra: 1 })).statusCode,
    ).toBe(400);
  });

  it("shows the active follow-up and recent history for one invoice", async () => {
    const inv = await saveInvoice(sA);
    const empty = (await sA.get(`/api/invoice-drafts/${inv}/follow-ups`)).json() as {
      active: FU | null;
      recent: FU[];
    };
    expect(empty).toMatchObject({ active: null, recent: [] });
    const a = await schedule(sA, inv, { message: "First" });
    await sA.post(`/api/follow-ups/${a.fu.id}/complete`, {});
    const b = await schedule(sA, inv, { message: "Second" });
    const view = (await sA.get(`/api/invoice-drafts/${inv}/follow-ups`)).json() as {
      active: FU | null;
      recent: FU[];
    };
    expect(view.active).toMatchObject({ id: b.fu.id, message: "Second", status: "active" });
    expect(view.recent.map((f) => [f.id, f.status])).toEqual([[a.fu.id, "completed"]]);
    expect((await sA.get("/api/invoice-drafts/not-a-uuid/follow-ups")).statusCode).toBe(404);
    expect(
      (await sA.get("/api/invoice-drafts/00000000-0000-4000-8000-0000000000bb/follow-ups"))
        .statusCode,
    ).toBe(404);
    await sA.post(`/api/follow-ups/${b.fu.id}/cancel`, {});
  });

  it("database rejects inconsistent rows (closed-at consistency, bad zone, oversize text)", async () => {
    const inv = await saveInvoice(sA);
    const [{ operator_id }] = await sql(
      "SELECT created_by AS operator_id FROM invoices WHERE id=$1",
      [inv],
    );
    const ins = (cols: string, vals: string) =>
      sql(
        `INSERT INTO invoice_follow_ups (invoice_id, operator_id, due_at, timezone, message, ${cols}) VALUES ($1,$2,now(),'UTC','m',${vals})`,
        [inv, operator_id],
      );
    await expect(ins("status", "'completed'")).rejects.toMatchObject({ code: "23514" });
    await expect(ins("status, canceled_at", "'active', now()")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(ins("status", "'archived'")).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql(
        `INSERT INTO invoice_follow_ups (invoice_id, operator_id, due_at, timezone, message) VALUES ($1,$2,now(),'not a zone!','m')`,
        [inv, operator_id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql(
        `INSERT INTO invoice_follow_ups (invoice_id, operator_id, due_at, timezone, message) VALUES ($1,$2,now(),'UTC',$3)`,
        [inv, operator_id, "x".repeat(2001)],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("records closed-vocabulary audit events without customer text, and never touches a provider or the network", async () => {
    const rows = await sql(
      "SELECT action, outcome, detail FROM audit_log WHERE action LIKE 'followup.%'",
    );
    const actions = new Set(rows.map((r) => r.action));
    for (const a of [
      "followup.schedule",
      "followup.complete",
      "followup.cancel",
      "followup.reschedule",
    ])
      expect(actions.has(a)).toBe(true);
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/Acme|Contract Co|friendly reminder|Ask about|billing@/);
    expect(rows.some((r) => r.outcome === "denied")).toBe(true);
    expect(fetchSpy.mock.calls).toEqual([]);
  });
});
