import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresAuthStore,
  PostgresInvoiceDraftStore,
  PostgresPayPalOperationStore,
  createAuditSink,
  createDb,
} from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import {
  PayPalSandboxClient,
  TransportError,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from "@nmi/paypal";
import type { InvoiceDraft } from "@nmi/shared";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv, fakePayPalCredentials } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { hashPassword } from "./auth/password.js";
import { createPayPalDraft } from "./services/paypal-draft-service.js";

/**
 * NMI-DEMO-R1-FIX-B1. Objective: with the REAL PayPal client over a deterministic COUNTING fake
 * transport (no network, no credential), one fenced create invocation puts at most ONE
 * `POST /v2/invoicing/invoices` on the wire, an HTTP 401 on the create is recorded as UNKNOWN, and
 * every later browser request only reconciles read-only (search/show), never creating again. A
 * foreign operator cannot cause any PayPal traffic. Real Fastify + disposable PostgreSQL 16.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const ORIGIN = baseEnv.WEB_ORIGIN;
const PW_A = `pw-${randomBytes(12).toString("hex")}`;
const PW_B = `pw-${randomBytes(12).toString("hex")}`;
const NOW = new Date("2026-10-25T12:00:00Z");
const BASE = "https://api-m.sandbox.paypal.com";
const TOKEN = { access_token: "tok-0123456789abcdef", token_type: "Bearer", expires_in: 3600 };

type Handler = (r: HttpRequest) => HttpResponse | Promise<HttpResponse>;
const json = (body: unknown, status = 200): HttpResponse => ({
  status,
  headers: {},
  body: JSON.stringify(body),
});

/** Counting transport: every request is recorded; routes are replaceable per test. */
function counting() {
  const calls: HttpRequest[] = [];
  const routes: Record<string, Handler> = {};
  const transport: HttpTransport = async (req) => {
    calls.push(req);
    const h = routes[`${req.method} ${new URL(req.url).pathname}`];
    if (!h) throw new Error(`unexpected request ${req.method} ${req.url}`);
    return h(req);
  };
  const count = (m: string, path: string) =>
    calls.filter((c) => c.method === m && new URL(c.url).pathname === path).length;
  return {
    calls,
    routes,
    transport,
    creates: () => count("POST", "/v2/invoicing/invoices"),
    searches: () => count("POST", "/v2/invoicing/search-invoices"),
    tokens: () => count("POST", "/v1/oauth2/token"),
    reset: () => {
      calls.length = 0;
      for (const k of Object.keys(routes)) delete routes[k];
      routes["POST /v1/oauth2/token"] = () => json(TOKEN);
    },
  };
}

const draft = (name: string): InvoiceDraft => ({
  customerName: name,
  customerEmail: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@fix.example`,
  currency: "USD",
  lineItems: [{ description: "Logo concept", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-11-30",
  taxPercent: null,
  discount: null,
});

describe.skipIf(!url)(
  "PayPal create is never resent and never blindly recreated (real PostgreSQL)",
  () => {
    let scratch: ScratchDatabase;
    let app: FastifyInstance;
    let A: string;
    const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
    const t = counting();
    const emptySearch = () => json({ total_items: 0, total_pages: 0, items: [] });

    async function login(username: string, password: string) {
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
              "idempotency-key": `fix-${randomBytes(6).toString("hex")}-${++n}`,
            },
            payload: d as object,
          });
          expect(r.statusCode, r.body).toBe(201);
          return (r.json() as { id: string }).id;
        },
        paypal: (id: string) =>
          app.inject({ method: "POST", url: `/api/invoice-drafts/${id}/paypal-draft`, headers }),
      };
    }
    let sA: Awaited<ReturnType<typeof login>>;
    let sB: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
      scratch = await createScratchDatabase(url as string, 25);
      const db = createDb(scratch.pool);
      await provisionOperator(
        { store: new PostgresAuthStore(db), audit: createAuditSink(db), params: weak },
        { username: "operator-a", password: PW_A },
      );
      await sql("DROP INDEX operators_single_row_uq"); // test-only: a second operator for isolation
      await sql(`INSERT INTO operators (username, password_hash) VALUES ('operator-b', $1)`, [
        await hashPassword(PW_B, weak),
      ]);
      A = (await sql("SELECT id FROM operators WHERE username='operator-a'"))[0].id;
      const client = new PayPalSandboxClient({
        baseUrl: BASE,
        clientId: "id-fake-0123",
        clientSecret: "secret-fake-0123",
        transport: t.transport,
      });
      app = buildApp(
        loadConfig({
          ...baseEnv,
          DATABASE_URL: url,
          PAYPAL_DRAFTS_ENABLED: "true",
          ...fakePayPalCredentials,
        }),
        { db, passwordParams: weak, clock: () => NOW, paypal: client },
      );
      sA = await login("operator-a", PW_A);
      sB = await login("operator-b", PW_B);
    });
    afterAll(async () => {
      await app?.close();
      await scratch?.drop();
    });

    const op = async (id: string) =>
      (await sql("SELECT * FROM paypal_draft_operations WHERE invoice_id=$1", [id]))[0];
    const linked = async (id: string) =>
      (await sql("SELECT paypal_invoice_id FROM invoices WHERE id=$1", [id]))[0].paypal_invoice_id;

    it("create HTTP 401: ONE create POST, state unknown, attempts=1, nothing linked; a second browser request only reconciles", async () => {
      t.reset();
      t.routes["POST /v2/invoicing/invoices"] = () => json({ name: "AUTHENTICATION_FAILURE" }, 401);
      const id = await sA.save(draft("Create 401"));
      const first = await sA.paypal(id);
      expect(first.statusCode, first.body).toBe(502);
      expect(first.json()).toMatchObject({ error: "paypal_outcome_unknown", code: "http_401" });
      expect(t.creates()).toBe(1);
      expect(await op(id)).toMatchObject({
        state: "unknown",
        attempts: 1,
        paypal_invoice_id: null,
      });
      expect(await linked(id)).toBeNull();

      // Later request: read-only reconciliation (search finds nothing yet) and NO new create.
      t.routes["POST /v2/invoicing/search-invoices"] = emptySearch;
      const again = await sA.paypal(id);
      expect(again.statusCode, again.body).toBe(409);
      expect(again.json()).toEqual({ error: "reconciliation_pending" });
      expect(t.creates()).toBe(1);
      expect(t.searches()).toBe(1);
      expect((await op(id)).state).toBe("unknown");
      expect(await linked(id)).toBeNull();
      // and again, and concurrently: still no create
      const burst = await Promise.all([sA.paypal(id), sA.paypal(id), sA.paypal(id)]);
      for (const r of burst) expect([409, 202, 503]).toContain(r.statusCode);
      expect(t.creates()).toBe(1);
    });

    it("a 401 on the reconciliation search refreshes the token once (safe read) and still creates nothing", async () => {
      t.reset();
      t.routes["POST /v2/invoicing/invoices"] = () => json({}, 401);
      const id = await sA.save(draft("Search 401"));
      await sA.paypal(id);
      let seen = 0;
      t.routes["POST /v2/invoicing/search-invoices"] = () =>
        seen++ === 0 ? json({}, 401) : emptySearch();
      const tokensBefore = t.tokens();
      const again = await sA.paypal(id);
      expect(again.statusCode, again.body).toBe(409);
      expect(t.searches()).toBe(2); // the read-only search was refreshed and resent once
      expect(t.tokens()).toBe(tokensBefore + 1);
      expect(t.creates()).toBe(1);
    });

    it.each([
      ["timeout", () => Promise.reject(new TransportError("timeout"))],
      ["HTTP 503", () => json({}, 503)],
      ["201 without an id", () => json({ nope: 1 }, 201)],
    ])(
      "create %s: ONE create POST, unknown, and no second create on the next request",
      async (_n, create) => {
        t.reset();
        t.routes["POST /v2/invoicing/invoices"] = create as Handler;
        const id = await sA.save(draft(`Create ${_n}`));
        const first = await sA.paypal(id);
        expect(first.statusCode).toBe(502);
        expect(t.creates()).toBe(1);
        expect(await op(id)).toMatchObject({ state: "unknown", attempts: 1 });
        t.routes["POST /v2/invoicing/search-invoices"] = emptySearch;
        const again = await sA.paypal(id);
        expect(again.statusCode).toBe(409);
        expect(t.creates()).toBe(1);
      },
    );

    it("OAuth failure before the create (fresh client, no cached token): zero create POSTs and a definite rejection", async () => {
      t.reset();
      t.routes["POST /v1/oauth2/token"] = () => json({ error: "invalid_client" }, 401);
      const db = createDb(scratch.pool);
      const fresh = new PayPalSandboxClient({
        baseUrl: BASE,
        clientId: "id-fake-0123",
        clientSecret: "secret-fake-0123",
        transport: t.transport,
      });
      const deps = {
        drafts: new PostgresInvoiceDraftStore(db),
        ops: new PostgresPayPalOperationStore(db),
        paypal: fresh,
        audit: createAuditSink(db),
        clock: () => NOW,
      };
      const id = await sA.save(draft("Oauth Fail"));
      const res = await createPayPalDraft(deps, { invoiceId: id, operatorId: A, requestId: "r1" });
      expect(res).toEqual({ kind: "rejected", code: "oauth_http_401" });
      expect(t.creates()).toBe(0);
      expect(await op(id)).toMatchObject({ state: "rejected", attempts: 1 });
    });

    it("a foreign operator cannot cause ANY PayPal traffic for another operator's unknown or fresh invoice", async () => {
      t.reset();
      t.routes["POST /v2/invoicing/invoices"] = () => json({}, 401);
      const id = await sA.save(draft("Owned By A"));
      await sA.paypal(id);
      const fresh = await sA.save(draft("Fresh By A"));
      t.calls.length = 0;
      const before = await op(id);
      for (const target of [id, fresh]) {
        const r = await sB.paypal(target);
        expect(r.statusCode).toBe(404);
        expect(r.json()).toEqual({ error: "not_found" });
      }
      expect(t.calls).toHaveLength(0); // not even an OAuth token request
      expect(await op(id)).toEqual(before);
      expect(await op(fresh)).toBeUndefined();
    });

    it("service level: the same 401 gives unknown, and the next invocation never calls create", async () => {
      t.reset();
      t.routes["POST /v2/invoicing/invoices"] = () => json({}, 401);
      t.routes["POST /v2/invoicing/search-invoices"] = emptySearch;
      const db = createDb(scratch.pool);
      const client = new PayPalSandboxClient({
        baseUrl: BASE,
        clientId: "id-fake-0123",
        clientSecret: "secret-fake-0123",
        transport: t.transport,
      });
      const deps = {
        drafts: new PostgresInvoiceDraftStore(db),
        ops: new PostgresPayPalOperationStore(db),
        paypal: client,
        audit: createAuditSink(db),
        clock: () => NOW,
      };
      const id = await sA.save(draft("Service Level"));
      const first = await createPayPalDraft(deps, {
        invoiceId: id,
        operatorId: A,
        requestId: "r1",
      });
      expect(first).toEqual({ kind: "unknown", code: "http_401" });
      const second = await createPayPalDraft(deps, {
        invoiceId: id,
        operatorId: A,
        requestId: "r2",
      });
      expect(second.kind).toBe("reconciliation_pending");
      expect(t.creates()).toBe(1);
    });

    it("no send, remind, cancel, payment or other money-moving request is ever made", () => {
      const paths = new Set(t.calls.map((c) => new URL(c.url).pathname));
      for (const p of paths) {
        expect(p).toMatch(
          /^\/(v1\/oauth2\/token|v2\/invoicing\/(invoices|invoices\/[A-Za-z0-9-]+|search-invoices))$/,
        );
      }
    });
  },
);
