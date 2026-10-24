import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresAuthStore, createAuditSink, createDb } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";
import { hashPassword, verifyPassword } from "./auth/password.js";
import type { AuthRouteSeams } from "./routes/auth.js";

/**
 * Login race regressions (rotation vs in-flight login; concurrent guessing vs throttling).
 * Real PostgreSQL; ordering is forced with explicit promise barriers, not sleeps.
 * Skipped unless TEST_DATABASE_URL names a disposable nmi_test* database.
 */
const url = testDatabaseUrl();
const weak = { N: 1024, r: 8, p: 1 };
const USER = "demo-operator";
const ORIGIN = baseEnv.WEB_ORIGIN;
const rand = () => randomBytes(12).toString("hex");
const WINDOW_MS = 15 * 60 * 1000;

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
/** Resolves once `n` calls to `hit()` have happened. */
function countdown(n: number) {
  const d = deferred();
  let seen = 0;
  return {
    hit() {
      if (++seen >= n) d.resolve();
    },
    reached: d.promise,
    get seen() {
      return seen;
    },
  };
}

describe.skipIf(!url)("login races (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let store: PostgresAuthStore;
  let password: string;
  const apps: FastifyInstance[] = [];

  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
  const activeSessions = async () =>
    (await sql("SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL"))[0].n as number;
  const rotate = async (pw: string) => {
    const db = createDb(scratch.pool);
    await provisionOperator(
      { store, audit: createAuditSink(db), params: weak },
      { username: USER, password: pw },
    );
    password = pw;
  };

  function makeApp(seams: AuthRouteSeams = {}, deps: { now?: () => number } = {}) {
    const app = buildApp(loadConfig({ ...baseEnv, DATABASE_URL: url }), {
      db: createDb(scratch.pool),
      passwordParams: weak,
      authSeams: { maxConcurrentHashes: 64, maxQueuedHashes: 0, ...seams },
      ...deps,
    });
    apps.push(app);
    return app;
  }
  const login = (
    app: FastifyInstance,
    over: {
      username?: string;
      password?: string;
      ip?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN, ...over.headers },
      payload: { username: over.username ?? USER, password: over.password ?? password },
      ...(over.ip ? { remoteAddress: over.ip } : {}),
    });

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 20);
    store = new PostgresAuthStore(createDb(scratch.pool));
    await rotate(`pw-${rand()}`);
  });
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
    vi.restoreAllMocks();
    await sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  describe("Fix 1: password rotation vs an in-flight login", () => {
    it("rotation commits between verification and session issuance: the old-password login gets NO usable session", async () => {
      const oldPassword = password;
      const verified = deferred();
      const proceed = deferred();
      const app = makeApp({
        beforeSessionIssue: async () => {
          verified.resolve(); // the OLD password has been verified...
          await proceed.promise; // ...and issuance is parked
        },
      });

      const inFlight = login(app, { password: oldPassword });
      await verified.promise;
      const newPassword = `pw-${rand()}`;
      await rotate(newPassword); // rotation fully commits while the old login is parked
      proceed.resolve();

      const res = await inFlight;
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "invalid_credentials" });
      expect(res.cookies).toHaveLength(0);
      expect(await activeSessions()).toBe(0);
      const rows = await sql(
        "SELECT detail->>'reason' AS reason FROM audit_log WHERE action='auth.login' AND outcome='failure' ORDER BY at DESC LIMIT 1",
      );
      expect(rows[0].reason).toBe("credential_changed");

      // the new password works, the old one no longer does
      const fresh = await login(makeApp(), { password: newPassword });
      expect(fresh.statusCode).toBe(200);
      expect((await login(makeApp(), { password: oldPassword })).statusCode).toBe(401);
    });

    it("a login committed BEFORE rotation is revoked by it", async () => {
      const app = makeApp();
      const res = await login(app);
      expect(res.statusCode).toBe(200);
      const cookie = res.cookies.find((c) => c.name === "nmi_session")?.value as string;
      const get = () =>
        app.inject({
          method: "GET",
          url: "/api/auth/session",
          headers: { cookie: `nmi_session=${cookie}` },
        });
      expect((await get()).statusCode).toBe(200);
      await rotate(`pw-${rand()}`);
      expect((await get()).statusCode).toBe(401);
      const row = await sql("SELECT revoked_at FROM sessions WHERE token_hash = $1", [
        createHash("sha256").update(cookie).digest("hex"),
      ]);
      expect(row[0].revoked_at).not.toBeNull();
    });

    it("login with the new password succeeds after rotation", async () => {
      const next = `pw-${rand()}`;
      await rotate(next);
      const res = await login(makeApp());
      expect(res.statusCode).toBe(200);
      expect(await activeSessions()).toBe(1);
    });

    it("an operator disabled while the login is parked also yields no session", async () => {
      const verified = deferred();
      const proceed = deferred();
      const app = makeApp({
        beforeSessionIssue: async () => {
          verified.resolve();
          await proceed.promise;
        },
      });
      const inFlight = login(app);
      await verified.promise;
      await sql("UPDATE operators SET disabled_at = now()");
      try {
        proceed.resolve();
        expect((await inFlight).statusCode).toBe(401);
      } finally {
        await sql("UPDATE operators SET disabled_at = NULL");
      }
      expect(await activeSessions()).toBe(0);
    });

    it("stress: 15 rounds of an obsolete-password login racing a rotation never leave a usable session", async () => {
      const app = makeApp();
      for (let round = 0; round < 15; round++) {
        const old = password;
        const next = `pw-${rand()}`;
        const [res] = await Promise.all([login(app, { password: old }), rotate(next)]);
        expect([200, 401], `round ${round}`).toContain(res.statusCode);
        // Whether the login finished before or after the rotation, the old password must not
        // leave any live session behind once the rotation has committed.
        expect(await activeSessions(), `round ${round}`).toBe(0);
        expect((await login(app, { password: next })).statusCode).toBe(200);
        await sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
      }
    });
  });

  describe("Fix 2: concurrent guessing cannot bypass throttling", () => {
    /** verifyPassword stub: counts calls, parks every call until `open()`, then always rejects. */
    function parkedVerifier(expectedArrivals: number) {
      const arrivals = countdown(expectedArrivals);
      const gate = deferred();
      let calls = 0;
      let inFlight = 0;
      let peak = 0;
      const stub: typeof verifyPassword = async () => {
        calls++;
        inFlight++;
        peak = Math.max(peak, inFlight);
        arrivals.hit();
        await gate.promise;
        inFlight--;
        return false;
      };
      return {
        stub,
        open: gate.resolve,
        arrived: arrivals.reached,
        get calls() {
          return calls;
        },
        get peak() {
          return peak;
        },
      };
    }

    it("30 simultaneous invalid logins from one address+username admit exactly the budget; the rest get 429 without any verification or lookup", async () => {
      const lookups = vi.spyOn(PostgresAuthStore.prototype, "findOperatorByUsername");
      const v = parkedVerifier(5);
      const app = makeApp({ verifyPassword: v.stub }, { now: () => 5_000_000 });

      const all = Array.from({ length: 30 }, (_, i) =>
        login(app, { password: `wrong-${i}`, ip: "10.0.0.1" }),
      );
      await v.arrived; // the 5 admitted attempts are parked inside verification
      v.open();
      const res = await Promise.all(all);

      const ok401 = res.filter((r) => r.statusCode === 401);
      const rejected = res.filter((r) => r.statusCode === 429);
      expect(ok401).toHaveLength(5);
      expect(rejected).toHaveLength(25);
      expect(v.calls).toBe(5); // verification never ran for a rejected request
      expect(lookups).toHaveBeenCalledTimes(5); // nor did the database lookup
      for (const r of rejected) {
        expect(r.json()).toEqual({ error: "too_many_attempts" });
        expect(r.headers["retry-after"]).toBe(String(WINDOW_MS / 1000)); // oldest slot is 'now'
        expect(r.cookies).toHaveLength(0);
      }
    });

    it("retry-after shrinks as the window passes, and normal authentication works once it has", async () => {
      let t = 9_000_000;
      let mode: "fail" | "real" = "fail";
      const stub: typeof verifyPassword = async (pw, hash) =>
        mode === "real" ? verifyPassword(pw, hash) : false;
      const app = makeApp({ verifyPassword: stub }, { now: () => t });
      for (let i = 0; i < 5; i++)
        expect((await login(app, { password: "nope", ip: "10.0.0.2" })).statusCode).toBe(401);

      t += 100_000;
      const blocked = await login(app, { ip: "10.0.0.2" }); // the CORRECT password is refused too
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers["retry-after"]).toBe(String((WINDOW_MS - 100_000) / 1000));

      t += WINDOW_MS - 100_000; // exactly the retry-after
      mode = "real";
      const ok = await login(app, { ip: "10.0.0.2" });
      expect(ok.statusCode).toBe(200);
      expect(ok.cookies.find((c) => c.name === "nmi_session")).toBeDefined();
    });

    it("rapidly alternating usernames cannot lift the limit (3 names x 5 each from one address)", async () => {
      const v = parkedVerifier(15);
      const app = makeApp({ verifyPassword: v.stub }, { now: () => 1_000 });
      const names = ["alpha", "bravo", "charlie"];
      const all = Array.from({ length: 30 }, (_, i) =>
        login(app, { username: names[i % 3] as string, ip: "10.0.0.3" }),
      );
      await v.arrived;
      v.open();
      const res = await Promise.all(all);
      expect(res.filter((r) => r.statusCode === 401)).toHaveLength(15);
      expect(res.filter((r) => r.statusCode === 429)).toHaveLength(15);
      expect(v.calls).toBe(15);
    });

    it("30 distinct usernames from one address are capped by the address budget (20)", async () => {
      const v = parkedVerifier(20);
      const app = makeApp({ verifyPassword: v.stub }, { now: () => 1_000 });
      const all = Array.from({ length: 30 }, (_, i) =>
        login(app, { username: `guess-${i}`, ip: "10.0.0.4" }),
      );
      await v.arrived;
      v.open();
      const res = await Promise.all(all);
      expect(res.filter((r) => r.statusCode === 401)).toHaveLength(20);
      expect(res.filter((r) => r.statusCode === 429)).toHaveLength(10);
      expect(v.calls).toBe(20);
    });

    it("a spoofed X-Forwarded-For does not create new budgets (trust proxy is off)", async () => {
      const v = parkedVerifier(5);
      const app = makeApp({ verifyPassword: v.stub }, { now: () => 1_000 });
      const all = Array.from({ length: 30 }, (_, i) =>
        login(app, { ip: "10.0.0.5", headers: { "x-forwarded-for": `203.0.113.${i}` } }),
      );
      await v.arrived;
      v.open();
      const res = await Promise.all(all);
      expect(res.filter((r) => r.statusCode === 429)).toHaveLength(25);
      expect(v.calls).toBe(5);
    });

    it("username case and whitespace variants share one account budget", async () => {
      const v = parkedVerifier(5);
      const app = makeApp({ verifyPassword: v.stub }, { now: () => 1_000 });
      const variants = [USER, USER.toUpperCase(), ` ${USER} `, "Demo-Operator", `${USER}\t`];
      const all = Array.from({ length: 30 }, (_, i) =>
        login(app, { username: variants[i % 5] as string, ip: "10.0.0.6" }),
      );
      await v.arrived;
      v.open();
      const res = await Promise.all(all);
      expect(res.filter((r) => r.statusCode === 401)).toHaveLength(5);
      expect(v.calls).toBe(5);
    });

    it("concurrent password hashing is bounded; excess requests get 429 before any lookup or hashing, and are not charged", async () => {
      const lookups = vi.spyOn(PostgresAuthStore.prototype, "findOperatorByUsername");
      const v = parkedVerifier(4); // 4 workers run; 16 more queue; 10 are refused
      const app = makeApp(
        { verifyPassword: v.stub, maxConcurrentHashes: 4, maxQueuedHashes: 16 },
        { now: () => 1_000 },
      );
      // 30 different addresses: every request passes the per-address limiter, so only the gate bounds work.
      const all = Array.from({ length: 30 }, (_, i) => login(app, { ip: `10.1.0.${i + 1}` }));
      await v.arrived;
      expect(v.peak).toBe(4); // never more than 4 hashes in flight
      v.open();
      const res = await Promise.all(all);
      expect(res.filter((r) => r.statusCode === 401)).toHaveLength(20);
      const busy = res.filter((r) => r.statusCode === 429);
      expect(busy).toHaveLength(10);
      for (const r of busy) expect(r.headers["retry-after"]).toBe("1");
      expect(v.calls).toBe(20);
      expect(v.peak).toBe(4);
      expect(lookups).toHaveBeenCalledTimes(20);
      // refused-for-capacity attempts were refunded: one of those addresses can still try (and fail normally)
      const refusedIp = `10.1.0.${res.findIndex((r) => r.statusCode === 429) + 1}`;
      expect((await login(app, { ip: refusedIp })).statusCode).toBe(401);
    });

    it("capacity refusals are refunded: 10 'busy' 429s from one address never consume its account budget", async () => {
      const v = parkedVerifier(1);
      const app = makeApp(
        { verifyPassword: v.stub, maxConcurrentHashes: 1, maxQueuedHashes: 0 },
        { now: () => 1_000 },
      );
      const holder = login(app, { ip: "10.2.0.1" }); // occupies the only hashing slot
      await v.arrived;
      const busy = await Promise.all(
        Array.from({ length: 10 }, () => login(app, { ip: "10.2.0.2" })),
      );
      for (const r of busy) {
        expect(r.statusCode).toBe(429);
        // "1" = refused for capacity. If these had been charged, the 6th onward would carry the
        // rate-limit window (~900s) instead.
        expect(r.headers["retry-after"]).toBe("1");
      }
      expect(v.calls).toBe(1);
      v.open();
      expect((await holder).statusCode).toBe(401);
      expect((await login(app, { ip: "10.2.0.2" })).statusCode).toBe(401); // budget untouched
    });

    it("success refunds its slot and clears the account history", async () => {
      const t = 2_000_000;
      let mode: "fail" | "real" = "fail";
      const stub: typeof verifyPassword = async (pw, hash) =>
        mode === "real" ? verifyPassword(pw, hash) : false;
      const app = makeApp({ verifyPassword: stub }, { now: () => t });
      for (let i = 0; i < 4; i++)
        expect((await login(app, { ip: "10.0.0.7" })).statusCode).toBe(401);
      mode = "real";
      expect((await login(app, { ip: "10.0.0.7" })).statusCode).toBe(200);
      mode = "fail";
      for (let i = 0; i < 5; i++)
        expect((await login(app, { ip: "10.0.0.7" })).statusCode).toBe(401);
      expect((await login(app, { ip: "10.0.0.7" })).statusCode).toBe(429);
    });

    it("an error BEFORE hashing refunds the attempt; an error AFTER hashing starts keeps it counted", async () => {
      // before: the database lookup fails five times, then a normal attempt is still admitted
      const lookups = vi
        .spyOn(PostgresAuthStore.prototype, "findOperatorByUsername")
        .mockRejectedValue(new Error("db down"));
      const app = makeApp({ verifyPassword: async () => false }, { now: () => 1_000 });
      for (let i = 0; i < 6; i++)
        expect((await login(app, { ip: "10.0.0.8" })).statusCode).toBe(503);
      lookups.mockRestore();
      expect((await login(app, { ip: "10.0.0.8" })).statusCode).toBe(401);

      // after: verification itself throws; each such attempt stays charged
      const thrower = makeApp(
        { verifyPassword: async () => Promise.reject(new Error("hash blew up")) },
        { now: () => 1_000 },
      );
      for (let i = 0; i < 5; i++)
        expect((await login(thrower, { ip: "10.0.0.9" })).statusCode).toBe(503);
      expect((await login(thrower, { ip: "10.0.0.9" })).statusCode).toBe(429);
    });

    it("failed responses never leak error details", async () => {
      const app = makeApp({
        verifyPassword: async () => Promise.reject(new Error("secret internal detail")),
      });
      const res = await login(app, { ip: "10.0.0.10" });
      expect(res.statusCode).toBe(503);
      expect(res.body).not.toContain("secret internal detail");
      expect(res.json()).toEqual({ error: "unavailable" });
    });
  });

  describe("regression guard: ordinary login still works end to end with real scrypt", () => {
    it("real verification, cookie and session", async () => {
      const pw = `pw-${rand()}`;
      await rotate(pw);
      await hashPassword(pw, weak); // sanity: hashing helper available
      const app = makeApp();
      const res = await login(app, { password: pw });
      expect(res.statusCode).toBe(200);
      expect(res.cookies.find((c) => c.name === "nmi_session")).toMatchObject({
        httpOnly: true,
        sameSite: "Lax",
      });
    });
  });
});
