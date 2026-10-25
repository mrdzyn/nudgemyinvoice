import { createHash, randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PostgresAuthStore, createAuditSink, createDb } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv } from "./test-support.js";
import { provisionOperator, ProvisionError } from "./auth/provision.js";

/**
 * Authentication/session integration tests against a real PostgreSQL database.
 * Skipped (never "passed") unless TEST_DATABASE_URL names a disposable nmi_test* database.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const USER = "demo-operator";
// Throwaway per-run credentials; no password literal is committed.
const rand = () => randomBytes(12).toString("hex");
const PASSWORD = `pw-${rand()}`;
const WRONG = `wrong-${rand()}`;
const OTHER_PASSWORD = `other-${rand()}`;
const ORIGIN = baseEnv.WEB_ORIGIN;

describe.skipIf(!url)("operator authentication (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let store: PostgresAuthStore;
  let logs = "";
  const apps: FastifyInstance[] = [];

  const logStream = new Writable({
    write(chunk, _enc, cb) {
      logs += chunk.toString();
      cb();
    },
  });

  function makeApp(
    env: Record<string, string | undefined> = {},
    deps: { now?: () => number } = {},
  ) {
    const app = buildApp(loadConfig({ ...baseEnv, DATABASE_URL: url, ...env }), {
      db: createDb(scratch.pool),
      passwordParams: weak,
      logStream,
      ...deps,
    });
    // Test-only probes that report which actor the server derived for the request.
    app.get("/test/whoami", { preHandler: app.requireOperator }, async (req) => ({
      actor: req.trustedActor?.id ?? null,
    }));
    app.post("/test/whoami", { preHandler: app.requireOperator }, async (req) => ({
      actor: req.trustedActor?.id ?? null,
    }));
    apps.push(app);
    return app;
  }

  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;

  async function login(
    app: FastifyInstance,
    over: { username?: string; password?: string; ip?: string; origin?: string | null } = {},
  ) {
    const headers: Record<string, string> = {};
    if (over.origin !== null) headers["origin"] = over.origin ?? ORIGIN;
    return app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers,
      payload: { username: over.username ?? USER, password: over.password ?? PASSWORD },
      ...(over.ip ? { remoteAddress: over.ip } : {}),
    });
  }
  const cookieOf = (res: Awaited<ReturnType<typeof login>>, name = "nmi_session") =>
    res.cookies.find((c) => c.name === name)?.value as string;

  async function session(app: FastifyInstance) {
    const res = await login(app);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { operator: { id: string }; csrfToken: string };
    return { cookie: cookieOf(res), csrf: body.csrfToken, operatorId: body.operator.id, res };
  }
  const authed = (cookie: string, csrf?: string, origin: string | null = ORIGIN) => ({
    cookie: `nmi_session=${cookie}`,
    ...(csrf ? { "x-csrf-token": csrf } : {}),
    ...(origin ? { origin } : {}),
  });

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 10);
    const db = createDb(scratch.pool);
    store = new PostgresAuthStore(db);
    await provisionOperator(
      { store, audit: createAuditSink(db), params: weak },
      { username: USER, password: PASSWORD },
    );
  });
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
    await sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  describe("login and cookie", () => {
    it("issues a non-guessable session with a safe cookie, storing only the token hash", async () => {
      const app = makeApp();
      const { cookie, res } = await session(app);
      const c = res.cookies.find((x) => x.name === "nmi_session");
      expect(c).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/", maxAge: 480 * 60 });
      expect(cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await sql("SELECT token_hash FROM sessions");
      expect(stored.map((r) => r.token_hash)).toContain(
        createHash("sha256").update(cookie).digest("hex"),
      );
      expect(JSON.stringify(await sql("SELECT * FROM sessions"))).not.toContain(cookie);
      const other = cookieOf(await login(app));
      expect(other).not.toBe(cookie);
    });

    it("uses a Secure __Host- cookie for https origins", async () => {
      const app = makeApp({ WEB_ORIGIN: "https://app.example.com" });
      const res = await login(app, { origin: "https://app.example.com" });
      expect(res.statusCode).toBe(200);
      expect(res.cookies.find((x) => x.name === "__Host-nmi_session")).toMatchObject({
        secure: true,
        httpOnly: true,
        path: "/",
      });
    });

    it("gives the same generic failure for a wrong password, unknown user and malformed input", async () => {
      const app = makeApp();
      const a = await login(app, { password: WRONG });
      const b = await login(app, { username: "nobody-here" });
      expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
      expect(a.body).toBe(b.body);
      expect(a.json()).toEqual({ error: "invalid_credentials" });
      expect(a.cookies).toHaveLength(0);
      const bad = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: ORIGIN },
        payload: { username: USER },
      });
      expect(bad.statusCode).toBe(400);
      const extra = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: ORIGIN },
        payload: { username: USER, password: PASSWORD, actor: "x" },
      });
      expect(extra.statusCode).toBe(400);
    });

    it("rejects login from a foreign or missing Origin", async () => {
      const app = makeApp();
      expect((await login(app, { origin: "https://evil.example" })).statusCode).toBe(403);
      expect((await login(app, { origin: null })).statusCode).toBe(403);
    });

    it("a disabled operator cannot log in and loses existing sessions", async () => {
      const app = makeApp();
      const { cookie } = await session(app);
      await sql("UPDATE operators SET disabled_at = now()");
      try {
        expect((await login(app)).statusCode).toBe(401);
        expect(
          (await app.inject({ method: "GET", url: "/api/auth/session", headers: authed(cookie) }))
            .statusCode,
        ).toBe(401);
      } finally {
        await sql("UPDATE operators SET disabled_at = NULL");
      }
    });
  });

  describe("throttling", () => {
    it("blocks the 6th attempt for an address+username, even with the right password, then recovers", async () => {
      let t = 1_000_000;
      const app = makeApp({}, { now: () => t });
      for (let i = 0; i < 5; i++)
        expect((await login(app, { password: `${WRONG}-${i}`, ip: "10.0.0.1" })).statusCode).toBe(
          401,
        );
      const blocked = await login(app, { ip: "10.0.0.1" });
      expect(blocked.statusCode).toBe(429);
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
      expect(blocked.cookies).toHaveLength(0);
      // another address is not locked out by it
      expect((await login(app, { ip: "10.0.0.2" })).statusCode).toBe(200);
      t += 16 * 60 * 1000;
      expect((await login(app, { ip: "10.0.0.1" })).statusCode).toBe(200);
    });

    it("applies a coarser per-address cap across different usernames", async () => {
      const app = makeApp({}, { now: () => 5_000_000 });
      for (let i = 0; i < 20; i++)
        expect((await login(app, { username: `guess-${i}`, ip: "10.0.1.1" })).statusCode).toBe(401);
      expect((await login(app, { username: "guess-new", ip: "10.0.1.1" })).statusCode).toBe(429);
    });
  });

  describe("session lifecycle", () => {
    it("returns the operator for a valid session and is anonymous-safe otherwise", async () => {
      const app = makeApp();
      const { cookie, csrf, operatorId } = await session(app);
      const ok = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: authed(cookie),
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({
        operator: { id: operatorId, username: USER },
        csrfToken: csrf,
      });
      expect((await app.inject({ method: "GET", url: "/api/auth/session" })).statusCode).toBe(401);
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    });

    it.each([
      ["malformed", "not-a-token"],
      ["forged (well-formed, unknown)", "A".repeat(43)],
      ["injection attempt", "' OR 1=1 --"],
      ["empty", ""],
    ])("rejects a %s session cookie", async (_n, value) => {
      const app = makeApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { cookie: `nmi_session=${value}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects expired, revoked and idle sessions", async () => {
      const app = makeApp();
      const get = (cookie: string) =>
        app.inject({ method: "GET", url: "/api/auth/session", headers: authed(cookie) });
      const expired = (await session(app)).cookie;
      const revoked = (await session(app)).cookie;
      const idle = (await session(app)).cookie;
      const hash = (c: string) => createHash("sha256").update(c).digest("hex");
      await sql(
        "UPDATE sessions SET created_at = now() - interval '3 hours', expires_at = now() - interval '1 minute' WHERE token_hash = $1",
        [hash(expired)],
      );
      await sql("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1", [hash(revoked)]);
      await sql(
        "UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE token_hash = $1",
        [hash(idle)],
      );
      for (const c of [expired, revoked, idle]) expect((await get(c)).statusCode).toBe(401);
    });

    it("logout invalidates the session on the server immediately", async () => {
      const app = makeApp();
      const { cookie, csrf } = await session(app);
      const out = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: authed(cookie, csrf),
      });
      expect(out.statusCode).toBe(204);
      expect(out.cookies.find((c) => c.name === "nmi_session")?.value).toBe("");
      const after = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: authed(cookie),
      });
      expect(after.statusCode).toBe(401);
      const row = await sql("SELECT revoked_at FROM sessions WHERE token_hash = $1", [
        createHash("sha256").update(cookie).digest("hex"),
      ]);
      expect(row[0].revoked_at).not.toBeNull();
    });

    it("fails closed with 503 (never 200) when the database is unavailable", async () => {
      const dead = await createScratchDatabase(url as string, 1);
      await dead.drop();
      const app = buildApp(loadConfig({ ...baseEnv, DATABASE_URL: url }), {
        db: createDb(dead.pool),
        passwordParams: weak,
        audit: { record: async () => {} },
      });
      apps.push(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { cookie: `nmi_session=${"A".repeat(43)}` },
      });
      expect(res.statusCode).toBe(503);
    });
  });

  describe("CSRF and origin on mutating requests", () => {
    it("rejects logout without, with a wrong, or with another session's CSRF token, and keeps the session", async () => {
      const app = makeApp();
      const a = await session(app);
      const b = await session(app);
      for (const headers of [
        authed(a.cookie),
        authed(a.cookie, "x".repeat(43)),
        authed(a.cookie, b.csrf),
      ]) {
        const res = await app.inject({ method: "POST", url: "/api/auth/logout", headers });
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: "csrf_rejected" });
      }
      expect(
        (await app.inject({ method: "GET", url: "/api/auth/session", headers: authed(a.cookie) }))
          .statusCode,
      ).toBe(200);
    });

    it("rejects a mutating request with a wrong or missing Origin even with valid cookie and CSRF", async () => {
      const app = makeApp();
      const { cookie, csrf } = await session(app);
      for (const origin of ["https://evil.example", null]) {
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: authed(cookie, csrf, origin),
        });
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: "origin_rejected" });
      }
    });

    it("accepts a correctly authenticated, origin-valid, CSRF-valid mutation", async () => {
      const app = makeApp();
      const { cookie, csrf, operatorId } = await session(app);
      const res = await app.inject({
        method: "POST",
        url: "/test/whoami",
        headers: authed(cookie, csrf),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ actor: operatorId });
    });
  });

  describe("TrustedActor cannot be spoofed", () => {
    it("derives the actor only from the validated session, ignoring headers, query and body claims", async () => {
      const app = makeApp();
      const { cookie, csrf, operatorId } = await session(app);
      const spoof = {
        "x-actor-id": "attacker",
        "x-operator-id": "attacker",
        "x-user": "attacker",
        "x-forwarded-user": "attacker",
      };
      const get = await app.inject({
        method: "GET",
        url: "/test/whoami?actor=attacker&actorId=attacker",
        headers: { ...authed(cookie), ...spoof },
      });
      expect(get.json()).toEqual({ actor: operatorId });
      const post = await app.inject({
        method: "POST",
        url: "/test/whoami",
        headers: { ...authed(cookie, csrf), ...spoof },
        payload: {
          actor: "attacker",
          approverId: "attacker",
          trustedActor: { kind: "human", id: "attacker" },
        },
      });
      expect(post.json()).toEqual({ actor: operatorId });
    });

    it("yields no actor at all without a session, however the request is dressed up", async () => {
      const app = makeApp();
      const res = await app.inject({
        method: "GET",
        url: "/test/whoami",
        headers: { "x-actor-id": "attacker", origin: ORIGIN },
      });
      expect(res.statusCode).toBe(401);
      expect(res.body).not.toContain("attacker");
    });
  });

  describe("audit and logging hygiene", () => {
    it("audits login success/failure/logout and denials with no credentials, tokens, usernames or cookies", async () => {
      logs = "";
      const app = makeApp();
      await login(app, { password: WRONG });
      const { cookie, csrf, res } = await session(app);
      await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: authed(cookie, csrf, "https://evil.example"),
      });
      await app.inject({ method: "POST", url: "/api/auth/logout", headers: authed(cookie, csrf) });
      await app.inject({ method: "GET", url: "/api/auth/session" });

      const rows = await sql(
        "SELECT actor, action, outcome, request_id, detail FROM audit_log ORDER BY at",
      );
      const summary = rows.map((r) => `${r.action}:${r.outcome}`);
      for (const expected of [
        "auth.login:failure",
        "auth.login:success",
        "auth.request_denied:denied",
        "auth.logout:success",
        "operator.provision:success",
      ]) {
        expect(summary).toContain(expected);
      }
      const dump = JSON.stringify(rows);
      const hash = createHash("sha256").update(cookie).digest("hex");
      for (const secret of [PASSWORD, WRONG, cookie, csrf, hash, USER, baseEnv.SESSION_SECRET]) {
        expect(dump, `audit leaked ${secret.slice(0, 6)}…`).not.toContain(secret);
      }
      const allLogs = logs + JSON.stringify(res.headers);
      expect(logs).not.toContain(PASSWORD);
      for (const secret of [PASSWORD, WRONG, cookie, csrf, baseEnv.SESSION_SECRET]) {
        expect(logs, `logs leaked ${secret.slice(0, 6)}…`).not.toContain(secret);
      }
      expect(allLogs.length).toBeGreaterThan(0);
    });

    it("never logs request headers, and the redaction config censors them if a handler ever does", async () => {
      logs = "";
      const app = makeApp();
      const { cookie, csrf } = await session(app);
      await app.inject({ method: "GET", url: "/api/auth/session", headers: authed(cookie, csrf) });
      expect(logs).not.toContain(cookie);
      expect(logs).not.toContain(csrf);
      app.log.info(
        {
          headers: {
            cookie: `nmi_session=${cookie}`,
            "x-csrf-token": csrf,
            authorization: "Bearer zzz",
          },
        },
        "probe",
      );
      expect(logs).toContain("[redacted]");
      expect(logs).not.toContain(cookie);
      expect(logs).not.toContain(csrf);
      expect(logs).not.toContain("Bearer zzz");
    });
  });

  describe("operator provisioning", () => {
    const db = () => createDb(scratch.pool);
    const deps = () => ({
      store: new PostgresAuthStore(db()),
      audit: createAuditSink(db()),
      params: weak,
    });

    it("is idempotent, rotates the password, revokes sessions, and stores only a salted scrypt hash", async () => {
      const app = makeApp();
      const { cookie } = await session(app);
      const before = (await sql("SELECT password_hash FROM operators"))[0].password_hash as string;
      const res = await provisionOperator(deps(), {
        username: USER,
        password: OTHER_PASSWORD,
      });
      expect(res.created).toBe(false);
      expect((await sql("SELECT count(*)::int AS n FROM operators"))[0].n).toBe(1);
      const after = (await sql("SELECT password_hash FROM operators"))[0].password_hash as string;
      expect(after).not.toBe(before);
      expect(after.startsWith("scrypt$")).toBe(true);
      expect(after).not.toContain(OTHER_PASSWORD);
      expect(
        (await app.inject({ method: "GET", url: "/api/auth/session", headers: authed(cookie) }))
          .statusCode,
      ).toBe(401);
      expect((await login(app)).statusCode).toBe(401); // old password no longer works
      await provisionOperator(deps(), { username: USER, password: PASSWORD }); // restore for later tests
    });

    it("refuses a second operator, weak passwords and bad usernames without echoing the password", async () => {
      const long = `long-${rand()}`;
      await expect(
        provisionOperator(deps(), { username: "second-user", password: long }),
      ).rejects.toBeInstanceOf(ProvisionError);
      await expect(
        provisionOperator(deps(), { username: USER, password: "short" }),
      ).rejects.toThrow(/Password must be/);
      await expect(provisionOperator(deps(), { username: "x", password: long })).rejects.toThrow(
        /Username/,
      );
      try {
        await provisionOperator(deps(), { username: "second-user", password: long });
      } catch (e) {
        expect(String(e)).not.toContain(long);
      }
      expect((await sql("SELECT count(*)::int AS n FROM operators"))[0].n).toBe(1);
    });

    it("migrations provision no default user", async () => {
      const fresh = await createScratchDatabase(url as string, 1);
      try {
        expect((await fresh.pool.query("SELECT count(*)::int AS n FROM operators")).rows[0].n).toBe(
          0,
        );
      } finally {
        await fresh.drop();
      }
    });
  });
});
