import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditSink, createDb, PostgresAuthStore } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv, fakePayPalCredentials } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { hashPassword } from "./auth/password.js";

/**
 * NMI-PROTOTYPE-10D A1: real Fastify/PostgreSQL boundary tests, no provider calls.
 * The production single-operator index is dropped ONLY inside the disposable test schema.
 */
const url = testDatabaseUrl();
const pwA = randomBytes(16).toString("hex");
const pwB = randomBytes(16).toString("hex");
const weak = { N: 1024, r: 8, p: 1 };
const period = {
  fromInclusive: "2026-11-01T00:00:00.000Z",
  toExclusive: "2026-11-06T00:00:00.000Z",
  timeZone: "Asia/Manila",
};

describe.skipIf(!url)("POST /api/analytics/summary (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let app: FastifyInstance;
  let ownerA: string;
  let ownerB: string;
  let authA: { cookie: string; csrf: string };
  let authB: { cookie: string; csrf: string };
  const query = async (statement: string, params: unknown[] = []) =>
    (await scratch.pool.query(statement, params)).rows;
  const post = (
    auth: { cookie: string; csrf: string },
    payload: unknown,
    extraHeaders: Record<string, string> = {},
  ) =>
    app.inject({
      method: "POST",
      url: "/api/analytics/summary",
      headers: {
        cookie: auth.cookie,
        origin: baseEnv.WEB_ORIGIN,
        "x-csrf-token": auth.csrf,
        ...extraHeaders,
      },
      payload: payload as object,
    });
  const searchInvoices = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/api/invoice-drafts/search",
      headers: {
        cookie: authA.cookie,
        origin: baseEnv.WEB_ORIGIN,
        "x-csrf-token": authA.csrf,
      },
      payload,
    });
  const login = async (name: string, password: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: baseEnv.WEB_ORIGIN },
      payload: { username: name, password },
    });
    expect(r.statusCode, r.body).toBe(200);
    const cookie = r.cookies.find((c) => c.name === "nmi_session")?.value as string;
    return {
      cookie: `nmi_session=${cookie}`,
      csrf: (r.json() as { csrfToken: string }).csrfToken,
    };
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 20);
    const db = createDb(scratch.pool);
    await provisionOperator(
      { store: new PostgresAuthStore(db), audit: createAuditSink(db), params: weak },
      { username: "analytics-a", password: pwA },
    );
    await query("DROP INDEX operators_single_row_uq");
    await query("INSERT INTO operators (username, password_hash) VALUES ($1,$2)", [
      "analytics-b",
      await hashPassword(pwB, weak),
    ]);
    ownerA = (await query("SELECT id FROM operators WHERE username='analytics-a'"))[0].id;
    ownerB = (await query("SELECT id FROM operators WHERE username='analytics-b'"))[0].id;

    // More than the dashboard's 200-row cap and list page size; no loaded-page sum is valid.
    await query(
      `INSERT INTO invoices
         (created_by, customer_name, customer_email, currency, subtotal_minor, total_minor, due_date, created_at)
       SELECT $1, 'Alpha Synthetic', 'alpha-' || g || '@example.test',
              'USD', 100, 100, '2030-01-01', '2026-11-03T12:00:00Z'::timestamptz
       FROM generate_series(1,257) g`,
      [ownerA],
    );
    await query(
      `INSERT INTO invoices
         (created_by, customer_name, customer_email, currency, subtotal_minor, total_minor, due_date, created_at)
       SELECT $1, 'Beta Synthetic', 'beta-' || g || '@example.test',
              'JPY', 150, 150, '2030-01-01', '2026-11-03T12:00:00Z'::timestamptz
       FROM generate_series(1,3) g`,
      [ownerA],
    );
    await query(
      `INSERT INTO invoices
        (created_by, customer_name, customer_email, currency, subtotal_minor, total_minor, due_date, created_at)
       VALUES ($1, 'Euro Synthetic', 'euro@example.test', 'EUR', 2500, 2500, '2030-01-01', '2026-11-03T12:00:00Z')`,
      [ownerA],
    );
    await query(
      `INSERT INTO invoices
        (created_by, customer_name, customer_email, currency, subtotal_minor, total_minor, due_date, created_at)
       VALUES ($1, 'Foreign Synthetic', 'foreign@example.test', 'USD', 9999, 9999, '2030-01-01', '2026-11-03T12:00:00Z'),
              (NULL, 'Ownerless Synthetic', 'ownerless@example.test', 'USD', 8888, 8888, '2030-01-01', '2026-11-03T12:00:00Z')`,
      [ownerB],
    );
    const special = (
      await query("SELECT id FROM invoices WHERE created_by=$1 AND currency='USD' LIMIT 1", [
        ownerA,
      ])
    )[0].id as string;
    await query(
      `INSERT INTO paypal_draft_operations
       (invoice_id, created_by, state, invoice_number, payload_digest)
       VALUES ($1,$2,'unknown','NMI-00000000000000000001',$3)`,
      [special, ownerA, "a".repeat(64)],
    );

    app = buildApp(
      loadConfig({
        ...baseEnv,
        DATABASE_URL: url,
        PAYPAL_DRAFTS_ENABLED: "false",
        ...fakePayPalCredentials,
      }),
      { db, passwordParams: weak },
    );
    authA = await login("analytics-a", pwA);
    authB = await login("analytics-b", pwB);
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it("rejects missing session, missing CSRF and incorrect Origin, without exposing data", async () => {
    const anonymous = await app.inject({
      method: "POST",
      url: "/api/analytics/summary",
      headers: { origin: baseEnv.WEB_ORIGIN },
      payload: period,
    });
    expect(anonymous.statusCode).toBe(401);
    expect((await post(authA, period, { "x-csrf-token": "wrong" })).statusCode).toBe(403);
    expect((await post(authA, period, { origin: "http://evil.example" })).statusCode).toBe(403);
  });

  it("computes all 257 USD invoices beyond pagination and the dashboard cap, excluding foreign and orphan rows", async () => {
    const r = await post(authA, period);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const data = r.json() as {
      version: number;
      currencies: Array<{
        currency: string;
        exponent: number;
        invoiceCount: number;
        totalMinor: string;
        stateCounts: Record<string, number>;
      }>;
      days: Array<{ day: string; currency: string; invoiceCount: number; totalMinor: string }>;
    };
    expect(Object.keys(data).sort()).toEqual(
      ["version", "fromInclusive", "toExclusive", "timeZone", "currencies", "days"].sort(),
    );
    expect(data.version).toBe(1);
    expect(data.currencies).toEqual([
      {
        currency: "EUR",
        exponent: 2,
        invoiceCount: 1,
        totalMinor: "2500",
        stateCounts: { none: 1, progress: 0, created: 0, attention: 0 },
      },
      {
        currency: "JPY",
        exponent: 0,
        invoiceCount: 3,
        totalMinor: "450",
        stateCounts: { none: 3, progress: 0, created: 0, attention: 0 },
      },
      {
        currency: "USD",
        exponent: 2,
        invoiceCount: 257,
        totalMinor: "25700",
        stateCounts: { none: 256, progress: 0, created: 0, attention: 1 },
      },
    ]);
    expect(data.days.find((x) => x.currency === "USD")).toMatchObject({
      day: "2026-11-03",
      invoiceCount: 257,
      totalMinor: "25700",
    });
    expect(r.body).not.toMatch(/customerName|customerEmail|@example|paypalInvoiceId|payloadDigest/);
    const grid = await app.inject({
      method: "GET",
      url: "/api/invoice-drafts?limit=50",
      headers: { cookie: authA.cookie },
    });
    expect(grid.statusCode).toBe(200);
    expect((grid.json() as { items: unknown[] }).items).toHaveLength(50);
  });

  it("uses the same half-open date population for analytics and every cursor page", async () => {
    const analytics = await post(authA, { ...period, currency: "USD" });
    expect(analytics.statusCode).toBe(200);
    const first = await searchInvoices({
      limit: 50,
      currency: "USD",
      fromInclusive: period.fromInclusive,
      toExclusive: period.toExclusive,
    });
    expect(first.statusCode).toBe(200);
    let page = first.json() as { items: Array<{ id: string }>; nextCursor: string | null };
    const ids = page.items.map((item) => item.id);
    let cursor = page.nextCursor;
    while (cursor) {
      const next = await searchInvoices({
        limit: 50,
        currency: "USD",
        fromInclusive: period.fromInclusive,
        toExclusive: period.toExclusive,
        cursor,
      });
      expect(next.statusCode).toBe(200);
      page = next.json() as typeof page;
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    }
    const usd = (
      analytics.json() as { currencies: Array<{ currency: string; invoiceCount: number }> }
    ).currencies.find((currency) => currency.currency === "USD");
    expect(ids).toHaveLength(257);
    expect(new Set(ids).size).toBe(257);
    expect(usd?.invoiceCount).toBe(ids.length);
  });

  it("applies identical owner/currency/status/text filters independent of pagination", async () => {
    const attention = await post(authA, { ...period, status: "attention", currency: "USD" });
    expect(attention.statusCode).toBe(200);
    expect(
      (attention.json() as { currencies: Array<{ invoiceCount: number }> }).currencies[0]
        ?.invoiceCount,
    ).toBe(1);
    const search = await post(authA, { ...period, q: "alpha", currency: "USD" });
    expect(search.statusCode).toBe(200);
    expect(
      (search.json() as { currencies: Array<{ invoiceCount: number }> }).currencies[0]
        ?.invoiceCount,
    ).toBe(257);
    const foreign = await post(authB, period);
    expect(foreign.statusCode).toBe(200);
    expect(
      (foreign.json() as { currencies: Array<{ totalMinor: string }> }).currencies,
    ).toMatchObject([{ totalMinor: "9999" }]);
  });

  it("rejects invalid or unbounded ranges, timezone, unexpected keys and unsupported currencies", async () => {
    const bad: unknown[] = [
      { toExclusive: period.toExclusive, timeZone: period.timeZone },
      { ...period, fromInclusive: period.toExclusive },
      { ...period, toExclusive: "2028-11-06T00:00:00.000Z" },
      { ...period, timeZone: "Not/A_Zone" },
      { ...period, currency: "KWD" }, // deliberately unsupported until domain migration
      { ...period, operatorId: ownerB },
      { ...period, fromInclusive: "2026-11-01" },
      { ...period, q: "%" + "x".repeat(101) },
    ];
    for (const input of bad) {
      const r = await post(authA, input);
      expect(r.statusCode, JSON.stringify(input)).toBe(400);
      expect(r.json()).toHaveProperty("error", "invalid_analytics_query");
    }
  });

  it("filters a UTC half-open interval and groups by actual IANA local dates across DST", async () => {
    await query(
      `INSERT INTO invoices
        (created_by, customer_name, customer_email, currency, subtotal_minor, total_minor, due_date, created_at)
       VALUES
        ($1,'DST Early','early@example.test','USD',101,101,'2030-01-01','2026-03-08T06:30:00Z'),
        ($1,'DST Later','later@example.test','USD',102,102,'2030-01-01','2026-03-08T07:30:00Z')`,
      [ownerA],
    );
    const r = await post(authA, {
      fromInclusive: "2026-03-08T07:30:00.000Z",
      toExclusive: "2026-03-08T08:30:00.000Z",
      timeZone: "America/New_York",
      currency: "USD",
    });
    expect(r.statusCode).toBe(200);
    expect(
      (r.json() as { days: Array<{ day: string; totalMinor: string; invoiceCount: number }> }).days,
    ).toMatchObject([{ day: "2026-03-08", totalMinor: "102", invoiceCount: 1 }]);
    const noRows = await post(authA, {
      fromInclusive: "2026-03-08T06:00:00.000Z",
      toExclusive: "2026-03-08T06:30:00.000Z",
      timeZone: "America/New_York",
    });
    expect(noRows.statusCode).toBe(200);
    expect((noRows.json() as { days: unknown[] }).days).toEqual([]);
  });

  it("does not create operations, follow-ups or invoices when reading analytics", async () => {
    const snapshot = async () =>
      (
        await query(
          "SELECT (SELECT count(*)::int FROM invoices) invoices, (SELECT count(*)::int FROM paypal_draft_operations) paypal, (SELECT count(*)::int FROM invoice_follow_ups) reminders",
        )
      )[0];
    const before = await snapshot();
    await post(authA, period);
    await post(authA, { ...period, q: "Alpha", status: "none" });
    expect(await snapshot()).toEqual(before);
  });
});
