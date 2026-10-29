import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
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

/**
 * Objective: GET /api/invoice-drafts is authenticated, read-only, owner-scoped, strictly validated,
 * bounded and exact, and GET /api/invoice-drafts/:id no longer reveals another operator's record.
 * Real Fastify + real PostgreSQL; no provider is configured (a model client or PayPal client would
 * throw if the list route ever touched one).
 *
 * NOTE: production allows exactly one operator (`operators_single_row_uq`). This suite drops that
 * index in its own scratch schema ONLY to create a second operator for isolation tests.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const ORIGIN = baseEnv.WEB_ORIGIN;
const PW_A = `pw-${randomBytes(12).toString("hex")}`;
const PW_B = `pw-${randomBytes(12).toString("hex")}`;

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
  throw new Error("the list route must not call a provider");
};

describe.skipIf(!url)("GET /api/invoice-drafts (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  const apps: FastifyInstance[] = [];
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;

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
        // Providers that fail the test if they are ever reached.
        modelClient: { generate: async () => explode() },
        clock: () => new Date("2026-10-25T12:00:00Z"),
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
    return {
      get: (u: string) =>
        app.inject({ method: "GET", url: u, headers: { cookie: `nmi_session=${cookie}` } }),
      /** The privacy-preserving search transport: the whole query is the JSON body, the URL is fixed. */
      search: (payload: unknown) =>
        app.inject({
          method: "POST",
          url: "/api/invoice-drafts/search",
          headers: {
            cookie: `nmi_session=${cookie}`,
            "x-csrf-token": csrf,
            origin: ORIGIN,
          },
          payload: payload as object,
        }),
      post: (u: string, payload: unknown, key: string) =>
        app.inject({
          method: "POST",
          url: u,
          headers: {
            cookie: `nmi_session=${cookie}`,
            "x-csrf-token": csrf,
            origin: ORIGIN,
            "idempotency-key": key,
          },
          payload: payload as object,
        }),
    };
  }
  type S = Awaited<ReturnType<typeof login>>;
  let n = 0;
  const create = async (s: S, d: InvoiceDraft = draft()) => {
    const r = await s.post("/api/invoice-drafts", d, `key-${String(++n).padStart(10, "0")}`);
    expect(r.statusCode, r.body).toBe(201);
    return (r.json() as { id: string }).id;
  };

  let sA: S;
  let sB: S;
  beforeAll(async () => {
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
  afterEach(async () => {
    /* sessions stay valid across tests in this suite */
  });
  afterAll(async () => {
    while (apps.length) await apps.pop()?.close();
    await scratch?.drop();
  });

  type Item = {
    id: string;
    customerName: string;
    customerEmail: string;
    currency: string;
    dueDate: string;
    total: string;
    createdAt: string;
    paypal: { state: string };
  };
  // A query that carries search text uses POST /search (the only supported transport for `q`);
  // everything else exercises the GET list.
  const list = async (s: S, qs = "") => {
    const params = new URLSearchParams(qs);
    let r;
    if (params.has("q")) {
      const body: Record<string, unknown> = Object.fromEntries(params);
      if (typeof body["limit"] === "string") body["limit"] = Number(body["limit"]);
      r = await s.search(body);
    } else {
      r = await s.get(`/api/invoice-drafts${qs}`);
    }
    return {
      r,
      body: r.json() as { items: Item[]; nextCursor: string | null } & Record<string, unknown>,
    };
  };

  it("rejects an anonymous caller with 401 and touches nothing", async () => {
    const app = apps[0] as FastifyInstance;
    const r = await app.inject({ method: "GET", url: "/api/invoice-drafts" });
    expect(r.statusCode).toBe(401);
    expect(r.body).not.toMatch(/customer|items/);
  });

  it("returns exactly the documented contract with no-store caching", async () => {
    const a = await create(sA, draft({ customerName: "Contract Co" }));
    const { r, body } = await list(sA);
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual(["items", "nextCursor"]);
    const item = body.items.find((i) => i.id === a) as Item;
    expect(Object.keys(item).sort()).toEqual(
      [
        "createdAt",
        "currency",
        "customerEmail",
        "customerName",
        "dueDate",
        "id",
        "paypal",
        "total",
      ].sort(),
    );
    expect(item).toMatchObject({
      customerName: "Contract Co",
      currency: "USD",
      dueDate: "2030-12-01",
      total: "500.00",
      paypal: { state: "none" },
    });
    expect(Object.keys(item.paypal)).toEqual(["state"]);
    expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // nothing sensitive leaks through the list
    expect(r.body).not.toMatch(
      /lineItems|idempotency|digest|created_by|createdBy|password|operator/i,
    );
  });

  it("operator A sees only A's invoices and B only B's (isolation through the real route)", async () => {
    const a = await create(sA, draft({ customerName: "Iso A" }));
    const b = await create(sB, draft({ customerName: "Iso B" }));
    const ids = (x: { items: Item[] }) => x.items.map((i) => i.id);
    const la = (await list(sA, "?limit=50")).body;
    const lb = (await list(sB, "?limit=50")).body;
    expect(ids(la)).toContain(a);
    expect(ids(la)).not.toContain(b);
    expect(ids(lb)).toContain(b);
    expect(ids(lb)).not.toContain(a);
    expect(ids((await list(sA, "?q=Iso%20B")).body)).toEqual([]);
  });

  it("an ownerless record is never listed or readable", async () => {
    const orphan = (
      await sql(
        `INSERT INTO invoices (customer_name, customer_email, currency, subtotal_minor, total_minor, due_date)
         VALUES ('Ownerless Inc', 'o@ownerless.example', 'USD', 100, 100, '2030-01-01') RETURNING id`,
      )
    )[0].id as string;
    expect((await list(sA, "?q=Ownerless")).body.items).toEqual([]);
    expect((await sA.get(`/api/invoice-drafts/${orphan}`)).statusCode).toBe(404);
  });

  it("detail: another operator's id and an unknown id are indistinguishable 404s; the owner reads it", async () => {
    const mine = await create(sA, draft({ customerName: "Detail Owned" }));
    const own = await sA.get(`/api/invoice-drafts/${mine}`);
    expect(own.statusCode).toBe(200);
    expect((own.json() as { draft: { customerName: string } }).draft.customerName).toBe(
      "Detail Owned",
    );
    const cross = await sB.get(`/api/invoice-drafts/${mine}`);
    const unknown = await sB.get("/api/invoice-drafts/00000000-0000-4000-8000-000000000000");
    const bad = await sB.get("/api/invoice-drafts/not-a-uuid");
    for (const r of [cross, unknown, bad]) {
      expect(r.statusCode).toBe(404);
      expect(r.json()).toEqual({ error: "not_found" });
      expect(r.headers["cache-control"]).toBe("no-store");
    }
    expect(cross.body).toBe(unknown.body);
    expect(cross.body).not.toContain("Detail Owned");
  });

  describe("strict query validation", () => {
    it.each([
      ["limit=0"],
      ["limit=51"],
      ["limit=-1"],
      ["limit=abc"],
      ["limit=1.5"],
      ["limit=100"],
      ["limit="],
      ["limit=5&limit=6"],
      ["currency=XYZ"],
      ["currency=usd"],
      ["status=bogus"],
      ["status=created&status=none"],
      ["q="],
      [`q=${"x".repeat(101)}`],
      ["operatorId=00000000-0000-4000-8000-000000000000"],
      ["createdBy=anything"],
      ["unknown=1"],
      ["cursor="],
      ["cursor=!!!"],
      [`cursor=${"A".repeat(121)}`],
      [`cursor=${Buffer.from("[1,2]").toString("base64url")}`],
      [
        `cursor=${Buffer.from(JSON.stringify(["2030-02-31T00:00:00.000000Z", "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11"])).toString("base64url")}`,
      ],
    ])("rejects ?%s with 400", async (qs) => {
      const { r } = await list(sA, `?${qs}`);
      expect(r.statusCode, qs).toBe(400);
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.body).not.toMatch(/items|customer/);
    });
    it("accepts the documented bounds", async () => {
      expect((await list(sA, "?limit=1")).r.statusCode).toBe(200);
      expect((await list(sA, "?limit=50")).r.statusCode).toBe(200);
      expect((await list(sA, `?q=${"x".repeat(100)}`)).r.statusCode).toBe(200);
      expect((await list(sA, "?currency=JPY&status=attention&limit=7")).r.statusCode).toBe(200);
    });
  });

  it("page size: default 20, never above 50, and nextCursor walks every owned row exactly once", async () => {
    const P = makeApp();
    await sql(`INSERT INTO operators (username, password_hash) VALUES ('operator-pager', $1)`, [
      await hashPassword("pager-password-1", weak),
    ]);
    const sP = await login(P, "operator-pager", "pager-password-1");
    const made: string[] = [];
    for (let i = 0; i < 53; i++) made.push(await create(sP, draft({ customerName: `Pg ${i}` })));
    expect((await list(sP)).body.items).toHaveLength(20);
    expect((await list(sP, "?limit=50")).body.items).toHaveLength(50);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const { body } = await list(sP, `?limit=20${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...body.items.map((x) => x.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(53);
    expect(new Set(seen)).toEqual(new Set(made));
    // order is created_at DESC, id DESC
    const rows = (
      await sql(
        "SELECT id FROM invoices WHERE created_by = (SELECT id FROM operators WHERE username='operator-pager') ORDER BY created_at DESC, id DESC",
      )
    ).map((r) => r.id);
    expect(seen).toEqual(rows);
  });

  it("filters and cursor work together through the route and keep money exact per currency", async () => {
    const P = makeApp();
    await sql(`INSERT INTO operators (username, password_hash) VALUES ('operator-mix', $1)`, [
      await hashPassword("mixed-password-1", weak),
    ]);
    const sM = await login(P, "operator-mix", "mixed-password-1");
    await create(
      sM,
      draft({
        customerName: "Mix One",
        currency: "USD",
        lineItems: [{ description: "a", quantity: "1.5", unitPrice: "0.33" }],
        taxPercent: "8.25",
      }),
    );
    await create(
      sM,
      draft({
        customerName: "Mix Two",
        currency: "JPY",
        lineItems: [{ description: "b", quantity: "2", unitPrice: "1000" }],
        taxPercent: "10",
      }),
    );
    await create(
      sM,
      draft({
        customerName: "Mix Three",
        currency: "EUR",
        lineItems: [{ description: "c", quantity: "1", unitPrice: "10.10" }],
      }),
    );
    const jpy = (await list(sM, "?currency=JPY")).body.items;
    expect(jpy.map((i) => [i.customerName, i.total])).toEqual([["Mix Two", "2200"]]);
    const usd = (await list(sM, "?currency=USD&q=mix")).body.items;
    expect(usd.map((i) => [i.customerName, i.total])).toEqual([["Mix One", "0.54"]]);
    const first = (await list(sM, "?q=mix&limit=1")).body;
    expect(first.items).toHaveLength(1);
    const second = (await list(sM, `?q=mix&limit=1&cursor=${first.nextCursor}`)).body;
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    // a cursor issued for one operator cannot widen another operator's view
    const cross = await list(sA, `?limit=50&cursor=${first.nextCursor}`);
    expect(
      cross.body.items.every((i) => !["Mix One", "Mix Two", "Mix Three"].includes(i.customerName)),
    ).toBe(true);
  });

  it("reports the PayPal state from the durable operation row only", async () => {
    const id = await create(sA, draft({ customerName: "Durable State" }));
    expect((await list(sA, "?q=Durable%20State")).body.items[0]?.paypal.state).toBe("none");
    await sql(
      `INSERT INTO paypal_draft_operations (invoice_id, created_by, state, invoice_number, payload_digest, last_error_code)
       VALUES ($1, (SELECT created_by FROM invoices WHERE id=$1), 'rejected', 'NMI-00000000000000000001', $2, 'paypal_rejected')`,
      [id, "b".repeat(64)],
    );
    const item = (await list(sA, "?q=Durable%20State")).body.items[0] as Item;
    expect(item.paypal).toEqual({ state: "rejected" });
    expect((await list(sA, "?status=attention&q=Durable%20State")).body.items).toHaveLength(1);
    expect((await list(sA, "?status=none&q=Durable%20State")).body.items).toHaveLength(0);
    // consistent with the by-id read
    const detail = (await sA.get(`/api/invoice-drafts/${id}`)).json() as {
      paypal: { state: string };
    };
    expect(detail.paypal.state).toBe("rejected");
  });

  it("is read-only: no mutation, no audit row (no customer data in audit) and no provider call", async () => {
    const snapshot = async () =>
      (
        await sql(
          "SELECT (SELECT count(*)::int FROM invoices) i, (SELECT count(*)::int FROM invoice_items) it, (SELECT count(*)::int FROM paypal_draft_operations) o, (SELECT count(*)::int FROM audit_log) a, (SELECT count(*)::int FROM approvals) ap",
        )
      )[0];
    const before = await snapshot();
    await list(sA, "?limit=50");
    await list(sB, "?q=zzz&status=none&currency=USD");
    await sA.get("/api/invoice-drafts/00000000-0000-4000-8000-000000000000");
    expect(await snapshot()).toEqual(before);
    const audit = (
      await sql("SELECT string_agg(detail::text || action, ' ') AS t FROM audit_log")
    )[0].t as string;
    expect(audit).not.toMatch(/Acme|Contract Co|Iso A|Iso B|billing@/);
  });

  it("never writes the search text (customer names/e-mails) to the request log", async () => {
    let logs = "";
    const stream = new Writable({
      write(chunk, _e, cb) {
        logs += chunk.toString();
        cb();
      },
    });
    const app = buildApp(
      loadConfig({
        ...baseEnv,
        DATABASE_URL: url,
        PAYPAL_DRAFTS_ENABLED: "false",
        ...fakePayPalCredentials,
      }),
      { db: createDb(scratch.pool), passwordParams: weak, logStream: stream },
    );
    apps.push(app);
    const s = await login(app, "operator-a", PW_A);
    const needle = "SecretCustomerName";
    expect((await s.search({ q: needle, limit: 5 })).statusCode).toBe(200);
    expect(logs).toContain('"url":"/api/invoice-drafts/search"'); // the path is still logged
    expect(logs).not.toContain(needle);
    // Legacy transport: refused, and even then neither the term nor the query string is logged.
    const legacy = await s.get(`/api/invoice-drafts?q=${needle}&limit=5`);
    expect(legacy.statusCode).toBe(400);
    expect(legacy.json()).toEqual({ error: "search_requires_post" });
    expect(logs).not.toContain(needle);
    expect(logs).not.toMatch(/q=|limit=5/);
  });

  describe("privacy-preserving search transport (NMI-RENDER-P1)", () => {
    it("POST /search returns exactly the same ordered items as the legacy GET did, owner-scoped", async () => {
      await create(sA, draft({ customerName: "Same Order One" }));
      await create(sA, draft({ customerName: "Same Order Two" }));
      await create(sB, draft({ customerName: "Same Order Foreign" }));
      const viaPost = await sA.search({ q: "same order", limit: 10 });
      expect(viaPost.statusCode).toBe(200);
      expect(viaPost.headers["cache-control"]).toBe("no-store");
      const names = (viaPost.json() as { items: Item[] }).items.map((i) => i.customerName);
      expect(names).toEqual(["Same Order Two", "Same Order One"]);
      // the same filters without text give the same body through GET and POST
      const g = (await sA.get("/api/invoice-drafts?limit=5&currency=USD")).json();
      const p = (await sA.search({ limit: 5, currency: "USD" })).json();
      expect(p).toEqual(g);
    });
    it.each([
      ["a repeated or foreign field", { q: "a", extra: 1 }],
      ["a non-string q", { q: 5 }],
      ["an empty q", { q: "   " }],
      ["an over-long q", { q: "x".repeat(101) }],
      ["a string limit", { limit: "5" }],
      ["limit 0", { limit: 0 }],
      ["limit above the maximum", { limit: 51 }],
      ["an unknown currency", { currency: "XXX" }],
      ["a malformed cursor", { cursor: "not-a-cursor" }],
    ])("rejects %s with 400 and no data", async (_n, body) => {
      const r = await sA.search(body);
      expect(r.statusCode).toBe(400);
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.body).not.toMatch(/items|customer/);
    });
    it("is authenticated, CSRF-protected and origin-checked, with the same denials as other mutations", async () => {
      const app = apps[0] as FastifyInstance;
      const anon = await app.inject({
        method: "POST",
        url: "/api/invoice-drafts/search",
        headers: { origin: ORIGIN },
        payload: { q: "Acme" },
      });
      expect(anon.statusCode).toBe(401);
      const foreign = await app.inject({
        method: "POST",
        url: "/api/invoice-drafts/search",
        headers: { origin: "http://evil.example" },
        payload: { q: "Acme" },
      });
      expect(foreign.statusCode).toBe(403);
      expect(foreign.json()).toEqual({ error: "origin_rejected" });
      const noOrigin = await app.inject({
        method: "POST",
        url: "/api/invoice-drafts/search",
        payload: { q: "Acme" },
      });
      expect(noOrigin.statusCode).toBe(403);
      for (const r of [anon, foreign, noOrigin]) expect(r.body).not.toMatch(/customer|items/);
    });
    it("a valid session without the CSRF token is refused (403) and nothing is listed", async () => {
      const app = apps[0] as FastifyInstance;
      const cookie = (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin: ORIGIN },
          payload: { username: "operator-a", password: PW_A },
        })
      ).cookies.find((c) => c.name === "nmi_session")?.value as string;
      const r = await app.inject({
        method: "POST",
        url: "/api/invoice-drafts/search",
        headers: { origin: ORIGIN, cookie: `nmi_session=${cookie}`, "x-csrf-token": "wrong" },
        payload: { q: "Acme" },
      });
      expect(r.statusCode).toBe(403);
      expect(r.json()).toEqual({ error: "csrf_rejected" });
    });
    it("refuses the legacy GET ?q= for every spelling, before any lookup, and never echoes the term", async () => {
      for (const u of [
        "/api/invoice-drafts?q=Acme",
        "/api/invoice-drafts?q=",
        "/api/invoice-drafts?limit=5&q=a%40b.example",
        "/api/invoice-drafts?q=a&q=b",
      ]) {
        const r = await sA.get(u);
        expect(r.statusCode, u).toBe(400);
        expect(r.json(), u).toEqual({ error: "search_requires_post" });
      }
      // an anonymous caller still gets only 401 (no information about the transport rule)
      const anon = await (apps[0] as FastifyInstance).inject({
        method: "GET",
        url: "/api/invoice-drafts?q=Acme",
      });
      expect(anon.statusCode).toBe(401);
    });
  });

  it("does not require a CSRF token for GET and refuses a foreign-origin POST on the same path", async () => {
    expect((await list(sA)).r.statusCode).toBe(200);
    const post = await apps[0]!.inject({
      method: "POST",
      url: "/api/invoice-drafts",
      headers: { origin: "http://evil.example" },
      payload: draft() as object,
    });
    expect([401, 403]).toContain(post.statusCode);
  });
});
