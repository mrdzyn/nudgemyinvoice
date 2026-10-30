import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresAuthStore, createAuditSink, createDb } from "@nmi/db";
import {
  createScratchDatabase,
  migrationStatements,
  testDatabaseUrl,
  type ScratchDatabase,
} from "@nmi/db/testing";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { provisionOperator } from "./auth/provision.js";
import { baseEnv } from "./test-support.js";

/**
 * Objective (NMI-RENDER-P1, offline): the hosted shape works end to end behind a simulated TLS-
 * terminating reverse proxy, with the application connected as the LEAST-PRIVILEGE runtime role:
 *  - production `__Host-` cookie attributes, exact-Origin, CSRF, logout, one-hop proxy trust;
 *  - customer search text never appears in any request URL the proxy (= the host's HTTP request
 *    log) sees, nor in Fastify logs, including error and unauthorized cases;
 *  - providers are disabled: zero provider traffic, manual-entry fallback;
 *  - all eight migrations are applied in journal order by the owner and the app never changes schema;
 *  - the runtime role can do exactly what the API needs and nothing destructive.
 * Real Fastify + real PostgreSQL + loopback sockets only.
 */
const url = testDatabaseUrl();
const ORIGIN = "https://nmi-staging.example.com";
const weak = { N: 1024, r: 8, p: 1 };
const PASSWORD = `pw-${randomBytes(12).toString("hex")}`;
const NEEDLE_NAME = "Zorblax Industries";
const NEEDLE_EMAIL = "pii.needle@zorblax.example";

describe.skipIf(!url)("hosted staging shape (real PostgreSQL, simulated proxy)", () => {
  let scratch: ScratchDatabase;
  let runtimePool: pg.Pool;
  const role = `nmi_rt_${randomBytes(4).toString("hex")}`;
  // Ephemeral, test-only; exists only in this process and on the disposable role. Never logged.
  const rolePassword = randomBytes(24).toString("hex");
  let ownerName = "";
  let dist: string;
  let app: ReturnType<typeof buildApp>;
  let appPort: number;
  let proxy: http.Server;
  let proxyPort: number;
  const edgeLog: string[] = []; // exactly what a host's HTTP request log would record
  let fastifyLog = "";
  let fetchSpy: { mockRestore: () => void; mock: { calls: unknown[] } };

  const owner = async (q: string) => (await scratch.pool.query(q)).rows;
  const snapshot = async () =>
    JSON.stringify(
      await owner(
        `SELECT c.relname, c.relkind, a.attname, format_type(a.atttypid, a.atttypmod) AS type
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          WHERE n.nspname = '${scratch.schema}' ORDER BY 1, 3`,
      ),
    ) +
    JSON.stringify(
      await owner(
        `SELECT indexname FROM pg_indexes WHERE schemaname='${scratch.schema}' ORDER BY 1`,
      ),
    ) +
    JSON.stringify(
      await owner(
        `SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='${scratch.schema}' AND NOT tgisinternal ORDER BY 1`,
      ),
    );

  /** Simulated TLS-terminating edge: logs the request line, appends the client address, forwards. */
  function startProxy(): Promise<void> {
    proxy = http.createServer((creq, cres) => {
      edgeLog.push(`${creq.method} ${creq.url}`);
      const xff = [creq.headers["x-forwarded-for"], creq.socket.remoteAddress]
        .filter(Boolean)
        .join(", ");
      const up = http.request(
        {
          host: "127.0.0.1",
          port: appPort,
          method: creq.method,
          path: creq.url,
          headers: { ...creq.headers, "x-forwarded-for": xff, "x-forwarded-proto": "https" },
        },
        (ures) => {
          cres.writeHead(ures.statusCode ?? 502, ures.headers);
          ures.pipe(cres);
        },
      );
      creq.pipe(up);
    });
    return new Promise((r) =>
      proxy.listen(0, "127.0.0.1", () => {
        proxyPort = (proxy.address() as AddressInfo).port;
        r();
      }),
    );
  }

  interface Res {
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
    json: () => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const call = (
    method: string,
    path: string,
    opts: { headers?: Record<string, string>; body?: unknown } = {},
  ) =>
    new Promise<Res>((resolve, reject) => {
      const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
      const req = http.request(
        {
          host: "127.0.0.1",
          port: proxyPort,
          method,
          path,
          headers: {
            ...(payload ? { "content-type": "application/json" } : {}),
            ...opts.headers,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body,
              json: () => JSON.parse(body),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(payload);
    });

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 10);
    // Owner role: provisions the single operator (an owner-run CLI in production), then creates the
    // runtime role from the committed grants file.
    await provisionOperator(
      {
        store: new PostgresAuthStore(createDb(scratch.pool)),
        audit: createAuditSink(createDb(scratch.pool)),
        params: weak,
      },
      { username: "operator", password: PASSWORD },
    );
    const admin = new pg.Client({ connectionString: url as string });
    await admin.connect();
    await admin.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`,
    );
    ownerName = (await admin.query("SELECT session_user AS u")).rows[0].u as string;
    const grants = readFileSync(
      join(import.meta.dirname, "..", "..", "..", "packages", "db", "ops", "runtime-role.sql"),
      "utf8",
    )
      .replaceAll("nmi_runtime", role)
      .replaceAll('"public".', `"${scratch.schema}".`);
    await admin.query(`SET search_path TO ${scratch.schema}`);
    await admin.query(grants);
    await admin.query(`GRANT USAGE ON SCHEMA ${scratch.schema} TO ${role}`);
    await admin.end();
    // The app authenticates AS the runtime role itself (genuine LOGIN with its own credential),
    // never as the owner with a role selected afterwards.
    const base = new URL(url as string);
    runtimePool = new pg.Pool({
      host: base.hostname,
      port: base.port ? Number(base.port) : 5432,
      database: base.pathname.slice(1),
      user: role,
      password: rolePassword,
      max: 5,
      options: `-c search_path=${scratch.schema}`,
    });

    dist = mkdtempSync(join(tmpdir(), "nmi-hosted-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>shell</title>");
    fetchSpy = vi.spyOn(globalThis, "fetch");
    const logStream = new Writable({
      write(chunk, _e, cb) {
        fastifyLog += chunk.toString();
        cb();
      },
    });
    const config = loadConfig({
      NODE_ENV: "production",
      PAYPAL_ENV: "sandbox",
      PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
      DATABASE_URL: url as string,
      SESSION_SECRET: randomBytes(32).toString("hex"),
      WEB_ORIGIN: ORIGIN,
      TRUST_PROXY: "1",
      HOST: "0.0.0.0",
      WEB_DIST_DIR: dist,
      PAYPAL_DRAFTS_ENABLED: "false",
    });
    expect([config.openai, config.paypalCredentials]).toEqual([null, null]);
    app = buildApp(config, { db: createDb(runtimePool), passwordParams: weak, logStream });
    await app.listen({ port: 0, host: "127.0.0.1" });
    appPort = (app.server.address() as AddressInfo).port;
    await startProxy();
  });

  afterAll(async () => {
    fetchSpy?.mockRestore();
    proxy?.close();
    await app?.close();
    await runtimePool?.end();
    await scratch?.drop();
    if (dist) rmSync(dist, { recursive: true, force: true });
    const admin = new pg.Client({ connectionString: url as string });
    await admin.connect();
    try {
      await admin.query(`DROP OWNED BY ${role}`);
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
    } finally {
      await admin.end();
    }
  });

  let cookie = "";
  let csrf = "";
  const auth = (extra: Record<string, string> = {}) => ({
    origin: ORIGIN,
    cookie,
    "x-csrf-token": csrf,
    ...extra,
  });

  it("applied exactly the eight committed migrations in journal order, before the app started", async () => {
    const journal = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          "..",
          "..",
          "..",
          "packages",
          "db",
          "migrations",
          "meta",
          "_journal.json",
        ),
        "utf8",
      ),
    ) as { entries: { tag: string }[] };
    expect(journal.entries.map((e) => e.tag.slice(0, 4))).toEqual([
      "0000",
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
      "0007",
    ]);
    expect(migrationStatements().length).toBeGreaterThan(8);
    const tables = (
      await owner(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='${scratch.schema}' ORDER BY 1`,
      )
    ).map((r) => r.table_name);
    expect(tables).toEqual([
      "approvals",
      "audit_log",
      "invoice_follow_ups",
      "invoice_items",
      "invoices",
      "operators",
      "paypal_draft_operations",
      "paypal_webhook_events",
      "sessions",
    ]);
  });

  it("login behind the proxy: __Host- cookie is Secure, HttpOnly, SameSite=Lax, Path=/, no Domain; CSRF token returned once", async () => {
    const r = await call("POST", "/api/auth/login", {
      headers: { origin: ORIGIN },
      body: { username: "operator", password: PASSWORD },
    });
    expect(r.status, r.body).toBe(200);
    const set = ([] as string[]).concat(r.headers["set-cookie"] ?? []);
    expect(set).toHaveLength(1);
    const c = set[0] as string;
    expect(c).toMatch(/^__Host-nmi_session=[A-Za-z0-9_-]{32,}; /);
    expect(c).toMatch(/; Path=\/(;|$)/);
    expect(c).toMatch(/; HttpOnly/);
    expect(c).toMatch(/; Secure/);
    expect(c).toMatch(/; SameSite=Lax/);
    expect(c).not.toMatch(/Domain=/i);
    cookie = c.split(";")[0] as string;
    csrf = r.json().csrfToken;
    expect(csrf.length).toBeGreaterThan(20);
    expect(r.headers["cache-control"]).toBe("no-store");
    // CORS never opens to another origin: only the exact configured origin is ever echoed.
    const foreign = await call("GET", "/health", { headers: { origin: "https://evil.example" } });
    expect(foreign.headers["access-control-allow-origin"]).toBeUndefined();
    expect(foreign.headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("the hosted page and API share one origin: shell, health JSON and an authenticated session", async () => {
    expect((await call("GET", "/dashboard")).body).toContain("<title>shell</title>");
    const h = await call("GET", "/health");
    expect(h.json()).toEqual({ status: "ok", paypalEnvironment: "sandbox", aiConfigured: false });
    expect((await call("GET", "/api/auth/session", { headers: { cookie } })).status).toBe(200);
  });

  it("origin/CSRF: foreign, missing and lookalike Origins and a missing or wrong CSRF token are refused", async () => {
    const body = { q: NEEDLE_NAME };
    for (const origin of [
      "https://evil.example",
      "http://nmi-staging.example.com",
      "https://nmi-staging.example.com.evil.example",
      "https://nmi-staging.example.com:8443",
      "null",
    ]) {
      const r = await call("POST", "/api/invoice-drafts/search", {
        headers: auth({ origin }),
        body,
      });
      expect([r.status, r.json().error], origin).toEqual([403, "origin_rejected"]);
    }
    const noOrigin = await call("POST", "/api/invoice-drafts/search", {
      headers: { cookie, "x-csrf-token": csrf },
      body,
    });
    expect(noOrigin.status).toBe(403);
    const noCsrf = await call("POST", "/api/invoice-drafts/search", {
      headers: { origin: ORIGIN, cookie },
      body,
    });
    expect([noCsrf.status, noCsrf.json().error]).toEqual([403, "csrf_rejected"]);
    const badCsrf = await call("POST", "/api/invoice-drafts/search", {
      headers: auth({ "x-csrf-token": "x".repeat(40) }),
      body,
    });
    expect(badCsrf.status).toBe(403);
    // The plain (non-__Host-) cookie name is not accepted over the hosted configuration.
    const plain = await call("GET", "/api/auth/session", {
      headers: { cookie: cookie.replace("__Host-", "") },
    });
    expect(plain.status).toBe(401);
  });

  it("saves a draft as the least-privilege role and lists it through POST search; no search text ever reaches a request URL or a Fastify log", async () => {
    const save = await call("POST", "/api/invoice-drafts", {
      headers: auth({ "idempotency-key": "hosted-key-0000000001" }),
      body: {
        customerName: NEEDLE_NAME,
        customerEmail: NEEDLE_EMAIL,
        currency: "USD",
        lineItems: [{ description: "Synthetic work", quantity: "1", unitPrice: "10.00" }],
        dueDate: "2030-12-01",
        taxPercent: null,
        discount: null,
      },
    });
    expect(save.status, save.body).toBe(201);
    const id = save.json().id as string;

    // The exact request the web client sends (apps/web api.test.ts + boundaries.test.ts pin its
    // URL and body shape): a fixed URL and the whole query in the JSON body.
    const seenBefore = edgeLog.length;
    for (const q of [NEEDLE_NAME, NEEDLE_EMAIL, "zorb", id.slice(0, 8)]) {
      const r = await call("POST", "/api/invoice-drafts/search", {
        headers: auth(),
        body: { limit: 20, currency: "USD", q },
      });
      expect(r.status, q).toBe(200);
      expect(
        r.json().items.map((i: { id: string }) => i.id),
        q,
      ).toEqual([id]);
    }
    // an unauthorized (wrong CSRF) and an invalid (over-long) search
    const forbidden = await call("POST", "/api/invoice-drafts/search", {
      headers: auth({ "x-csrf-token": "x".repeat(40) }),
      body: { limit: 20, q: NEEDLE_NAME },
    });
    expect(forbidden.status).toBe(403);
    const rejected = await call("POST", "/api/invoice-drafts/search", {
      headers: auth(),
      body: { limit: 20, q: "z".repeat(500) },
    });
    expect(rejected.status).toBe(400);
    const lines = edgeLog.slice(seenBefore);
    expect(lines.length).toBe(6);
    for (const l of lines) expect(l).toBe("POST /api/invoice-drafts/search");

    // Negative control: the instrument WOULD catch a term in a URL (the legacy GET shape).
    const legacy = await call("GET", `/api/invoice-drafts?q=${encodeURIComponent(NEEDLE_NAME)}`, {
      headers: { cookie },
    });
    expect([legacy.status, legacy.json()]).toEqual([400, { error: "search_requires_post" }]);
    expect(edgeLog.at(-1)).toContain(encodeURIComponent(NEEDLE_NAME)); // visible to the edge: control works
    edgeLog.pop(); // the control line is intentionally removed before the whole-log assertion

    const all = edgeLog.join("\n");
    for (const t of [NEEDLE_NAME, NEEDLE_EMAIL, encodeURIComponent(NEEDLE_NAME), "zorb"]) {
      expect(all, `edge log holds ${t}`).not.toContain(t);
      expect(fastifyLog, `fastify log holds ${t}`).not.toContain(t);
    }
    expect(all).not.toMatch(/[?&]q=/);
    // Detail still works and equals the stored draft (same data as before the transport change).
    const detail = await call("GET", `/api/invoice-drafts/${id}`, { headers: { cookie } });
    expect(detail.json().draft.customerName).toBe(NEEDLE_NAME);
  });

  it("local follow-ups work through the least-privilege runtime role behind the proxy (schedule, read, complete) and contact no provider", async () => {
    const found = await call("POST", "/api/invoice-drafts/search", { headers: auth(), body: {} });
    const invoiceId = found.json().items[0].id as string;
    const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const made = await call("POST", "/api/follow-ups", {
      headers: auth(),
      body: { invoiceId, dueAt, timezone: "Asia/Manila", note: null, message: "Friendly reminder" },
    });
    expect(made.status, made.body).toBe(201);
    expect(made.json()).toMatchObject({
      status: "active",
      state: "upcoming",
      sentToCustomer: false,
    });
    const listed = await call("GET", "/api/follow-ups", { headers: { cookie } });
    expect(listed.json().counts).toEqual({ due: 0, upcoming: 1 });
    const done = await call("POST", `/api/follow-ups/${made.json().id}/complete`, {
      headers: auth(),
    });
    expect(done.status, done.body).toBe(200);
    expect((await call("GET", "/api/follow-ups", { headers: { cookie } })).json().counts).toEqual({
      due: 0,
      upcoming: 0,
    });
    // A follow-up never puts customer text in a request URL.
    expect(edgeLog.some((l) => l.includes("Friendly reminder"))).toBe(false);
  });

  it("providers are disabled: PayPal create is refused, parsing falls back to manual entry, zero provider traffic", async () => {
    const list = await call("POST", "/api/invoice-drafts/search", { headers: auth(), body: {} });
    const id = list.json().items[0].id as string;
    const pp = await call("POST", `/api/invoice-drafts/${id}/paypal-draft`, { headers: auth() });
    expect([pp.status, pp.json()]).toEqual([503, { error: "paypal_disabled" }]);
    const parsed = await call("POST", "/api/invoice-drafts/parse", {
      headers: auth(),
      body: { text: "Invoice Acme USD 10 due 2030-01-01" },
    });
    expect(parsed.json()).toEqual({
      status: "unavailable",
      fallback: "manual_entry",
      reason: "ai_not_configured",
    });
    expect(fetchSpy.mock.calls).toEqual([]); // no outbound fetch at all (OpenAI/PayPal use fetch)
  });

  it("security headers on page, API and error responses behind the proxy", async () => {
    for (const p of ["/", "/health", "/api/nope", "/missing.js"]) {
      const r = await call("GET", p);
      expect(r.headers["strict-transport-security"], p).toBe("max-age=15552000");
      expect(r.headers["x-frame-options"], p).toBe("DENY");
      expect(r.headers["content-security-policy"], p).toContain("frame-ancestors 'none'");
      expect(String(r.headers["content-security-policy"]), p).not.toMatch(/https?:|\*|unsafe/);
    }
  });

  it("logout revokes the session server-side and expires the cookie with the same attributes", async () => {
    const out = await call("POST", "/api/auth/logout", { headers: auth() });
    expect(out.status).toBe(204);
    const cleared = ([] as string[]).concat(out.headers["set-cookie"] ?? [])[0] as string;
    expect(cleared).toMatch(/^__Host-nmi_session=;/);
    expect(cleared).toMatch(/Secure/);
    expect(cleared).toMatch(/Path=\//);
    expect(cleared).toMatch(/(Max-Age=0|Expires=Thu, 01 Jan 1970)/);
    // the old cookie no longer works even if a client kept it
    expect((await call("GET", "/api/auth/session", { headers: { cookie } })).status).toBe(401);
    expect(
      (await call("POST", "/api/invoice-drafts/search", { headers: auth(), body: {} })).status,
    ).toBe(401);
  });

  it("the app never changed the schema (startup, login, writes, logout)", async () => {
    // Snapshot taken now equals a fresh scratch schema built from the same migrations.
    const fresh = await createScratchDatabase(url as string, 2);
    try {
      const mine = await snapshot();
      const [ownPool, ownSchema] = [scratch.pool, scratch.schema];
      scratch.pool = fresh.pool;
      scratch.schema = fresh.schema;
      const theirs = await snapshot();
      scratch.pool = ownPool;
      scratch.schema = ownSchema;
      expect(mine.replaceAll(/t_[0-9a-f]{12}/g, "S")).toBe(
        theirs.replaceAll(/t_[0-9a-f]{12}/g, "S"),
      );
    } finally {
      await fresh.drop();
    }
  });

  it("the runtime role holds only the privileges the API needs and cannot alter schema or history", async () => {
    const s = scratch.schema;
    // Genuine runtime-role login: the authenticated session user IS the runtime role, not the owner.
    const who = (await runtimePool.query("SELECT session_user AS s, current_user AS c")).rows[0];
    expect(who).toEqual({ s: role, c: role });
    expect(ownerName).not.toBe(role);
    const denied = async (sql: string) => {
      const c = await runtimePool.connect();
      try {
        await expect(c.query(sql), sql).rejects.toMatchObject({ code: "42501" });
      } finally {
        c.release();
      }
    };
    for (const sql of [
      `CREATE TABLE ${s}.x (a int)`,
      `DROP TABLE ${s}.invoices`,
      `ALTER TABLE ${s}.invoices ADD COLUMN z int`,
      `TRUNCATE ${s}.invoices`,
      `DELETE FROM ${s}.invoices`,
      `DELETE FROM ${s}.sessions`,
      `UPDATE ${s}.invoices SET customer_name = 'tampered'`,
      `UPDATE ${s}.invoices SET total_minor = 1`,
      `UPDATE ${s}.invoice_items SET description = 'x'`,
      `DELETE FROM ${s}.invoice_items`,
      `DELETE FROM ${s}.invoice_follow_ups`,
      `UPDATE ${s}.invoice_follow_ups SET operator_id = operator_id`,
      `UPDATE ${s}.invoice_follow_ups SET invoice_id = invoice_id`,
      `UPDATE ${s}.invoice_follow_ups SET created_at = now()`,
      `INSERT INTO ${s}.operators (username, password_hash) VALUES ('x','y')`,
      `UPDATE ${s}.operators SET password_hash = 'x'`,
      `UPDATE ${s}.operators SET credential_version = 9`,
      `UPDATE ${s}.operators SET disabled_at = now()`,
      `SELECT * FROM ${s}.audit_log`,
      `UPDATE ${s}.audit_log SET outcome = 'success'`,
      `DELETE FROM ${s}.audit_log`,
      `SELECT * FROM ${s}.approvals`,
      `SELECT 1 FROM ${s}.paypal_webhook_events`,
      `DELETE FROM ${s}.paypal_draft_operations`,
      `CREATE ROLE evil`,
      `CREATE FUNCTION ${s}.f() RETURNS int LANGUAGE sql AS 'select 1'`,
    ]) {
      await denied(sql);
    }
    // No way back to owner privileges from inside the session.
    {
      const c = await runtimePool.connect();
      try {
        await c.query("SET ROLE NONE"); // resets to the session user, which is the runtime role
        expect((await c.query("SELECT session_user AS s, current_user AS c")).rows[0]).toEqual({
          s: role,
          c: role,
        });
        await expect(c.query(`CREATE TABLE ${s}.y (a int)`)).rejects.toMatchObject({
          code: "42501",
        });
        await expect(c.query(`DELETE FROM ${s}.invoices`)).rejects.toMatchObject({ code: "42501" });
        await expect(c.query(`SET ROLE "${ownerName}"`)).rejects.toMatchObject({ code: "42501" });
        await expect(c.query(`SET SESSION AUTHORIZATION "${ownerName}"`)).rejects.toMatchObject({
          code: "42501",
        });
        // audit INSERT is allowed; reading it back is not
        await c.query(
          `INSERT INTO ${s}.audit_log (actor, action, outcome) VALUES ('runtime-role-test','probe','success')`,
        );
        await expect(c.query(`SELECT 1 FROM ${s}.audit_log`)).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        c.release();
      }
    }
    expect(
      (
        await owner(`SELECT count(*)::int AS n FROM ${s}.audit_log WHERE actor='runtime-role-test'`)
      )[0].n,
    ).toBe(1);
    // ...while the operations the API needs work.
    const ok = await runtimePool.query(`SELECT count(*)::int AS n FROM ${s}.invoices`);
    expect(ok.rows[0].n).toBe(1);
    const flags = await owner(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname='${role}'`,
    );
    expect(flags[0]).toMatchObject({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolcanlogin: true,
    });
  });
});

describe.skipIf(!url)("one-hop proxy trust keeps login throttling honest", () => {
  let scratch: ScratchDatabase;
  let dist: string;
  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 4);
    dist = mkdtempSync(join(tmpdir(), "nmi-throttle-"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>shell</title>");
  });
  afterAll(async () => {
    await scratch?.drop();
    if (dist) rmSync(dist, { recursive: true, force: true });
  });

  const attempts = async (env: Record<string, string>, forwarded: (i: number) => string) => {
    const app = buildApp(
      loadConfig({ ...baseEnv, DATABASE_URL: url as string, WEB_DIST_DIR: dist, ...env }),
      {
        db: createDb(scratch.pool),
        passwordParams: weak,
      },
    );
    let limited = 0;
    for (let i = 0; i < 30; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: env["WEB_ORIGIN"] ?? baseEnv.WEB_ORIGIN,
          "x-forwarded-for": forwarded(i),
        },
        payload: { username: `nobody-${i}`, password: "wrong-password" },
      });
      if (r.statusCode === 429) limited++;
    }
    await app.close();
    return limited;
  };
  // The client rotates a spoofed leftmost entry; the (trusted) proxy appends the real address.
  const spoofed = (i: number) => `198.51.100.${i}, 203.0.113.7`;

  it("with TRUST_PROXY=1 a client-supplied X-Forwarded-For entry cannot dodge the per-address limit", async () => {
    const limited = await attempts(
      { NODE_ENV: "production", WEB_ORIGIN: ORIGIN, TRUST_PROXY: "1" },
      spoofed,
    );
    expect(limited).toBeGreaterThan(0);
  });
  it("negative control: trusting every hop (TRUST_PROXY=true, development only) IS evaded by the same spoof", async () => {
    const limited = await attempts({ TRUST_PROXY: "true" }, spoofed);
    expect(limited).toBe(0);
  });
  it("without any proxy trust the header is ignored entirely", async () => {
    const limited = await attempts({ TRUST_PROXY: "false" }, spoofed);
    expect(limited).toBeGreaterThan(0);
  });
});
