import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresAuthStore, OperatorConflictError } from "./auth-store.js";
import { createDb } from "./client.js";
import {
  createScratchDatabase,
  testDatabaseUrl,
  waitForBlockedBackends,
  type ScratchDatabase,
} from "./testing/pg-scratch.js";

/**
 * Deterministic race tests for credential rotation vs. session issuance, using independent real
 * PostgreSQL connections. Ordering is forced by holding the operator row lock on one connection and
 * waiting (via pg_stat_activity) until the competing statements are actually blocked, never by sleeping.
 * Skipped unless TEST_DATABASE_URL names a disposable nmi_test* database.
 */
const url = testDatabaseUrl();
const HASH = (n: number) => `scrypt$16384$8$1$c2FsdHNhbHQ$hash${n}`;

describe.skipIf(!url)("credential rotation vs session issuance (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let store: PostgresAuthStore;
  let n = 0;
  let operatorId: string;

  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
  const tokenHash = () => (++n).toString(16).padStart(64, "0");
  const version = async () =>
    (await sql("SELECT credential_version AS v FROM operators"))[0].v as number;
  const active = async () =>
    (await sql("SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL"))[0].n as number;
  const issue = (v: number) =>
    store.createSession({
      operatorId,
      credentialVersion: v,
      tokenHash: tokenHash(),
      ttlMinutes: 60,
    });
  const rotate = () => store.upsertOperator({ username: "demo-operator", passwordHash: HASH(++n) });

  /** Holds the operator row lock on its own connection until `release()`. */
  async function holdOperatorLock() {
    const c = await scratch.pool.connect();
    await c.query("BEGIN");
    await c.query("SELECT id FROM operators FOR UPDATE");
    return {
      async release() {
        try {
          await c.query("COMMIT");
        } finally {
          c.release();
        }
      },
    };
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 20);
    store = new PostgresAuthStore(createDb(scratch.pool));
    operatorId = (await rotate()).id;
  });
  beforeEach(async () => {
    await sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  describe("session issuance proves the credential is current", () => {
    it("issues for the current version and returns the operator's login record version", async () => {
      const op = await store.findOperatorByUsername("demo-operator");
      expect(op?.credentialVersion).toBe(await version());
      expect(await issue(op?.credentialVersion as number)).not.toBeNull();
    });

    it.each([
      ["one behind", (v: number) => v - 1],
      ["zero", () => 0],
      ["one ahead (never issued)", (v: number) => v + 1],
      ["far ahead", (v: number) => v + 999],
    ])("refuses a stale or invented version: %s", async (_name, pick) => {
      const v = await version();
      const before = await active();
      expect(await issue(pick(v))).toBeNull();
      expect(await active()).toBe(before);
    });

    it("refuses a disabled operator, and creates no row", async () => {
      await sql("UPDATE operators SET disabled_at = now()");
      try {
        expect(await issue(await version())).toBeNull();
      } finally {
        await sql("UPDATE operators SET disabled_at = NULL");
      }
      expect(await active()).toBe(0);
    });

    it("refuses an unknown operator id", async () => {
      const res = await store.createSession({
        operatorId: "00000000-0000-4000-8000-000000000000",
        credentialVersion: 1,
        tokenHash: tokenHash(),
        ttlMinutes: 60,
      });
      expect(res).toBeNull();
    });
  });

  describe("rotation is one transaction", () => {
    it("bumps the version by exactly one, swaps the hash and revokes live sessions", async () => {
      const v = await version();
      await issue(v);
      await issue(v);
      expect(await active()).toBe(2);
      const res = await rotate();
      expect(res.created).toBe(false);
      expect(await version()).toBe(v + 1);
      expect(await active()).toBe(0);
    });

    it("rolls back the new hash AND the version bump if revoking sessions fails", async () => {
      const v = await version();
      const hashBefore = (await sql("SELECT password_hash h FROM operators"))[0].h as string;
      await issue(v);
      await sql(`CREATE FUNCTION fail_revoke() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'simulated failure while revoking'; END $$`);
      await sql(
        "CREATE TRIGGER fail_revoke_trg BEFORE UPDATE ON sessions FOR EACH STATEMENT EXECUTE FUNCTION fail_revoke()",
      );
      try {
        await expect(rotate()).rejects.toBeDefined();
      } finally {
        await sql("DROP TRIGGER fail_revoke_trg ON sessions");
        await sql("DROP FUNCTION fail_revoke()");
      }
      expect(await version()).toBe(v);
      expect((await sql("SELECT password_hash h FROM operators"))[0].h).toBe(hashBefore);
      expect(await active()).toBe(1); // nothing was half-applied
    });

    it("a second operator is refused and does not disturb the first", async () => {
      const v = await version();
      await expect(
        store.upsertOperator({ username: "someone-else", passwordHash: HASH(1) }),
      ).rejects.toBeInstanceOf(OperatorConflictError);
      expect(await version()).toBe(v);
    });
  });

  describe("deterministic races on two or more independent connections", () => {
    it("rotation reaches the lock first: the stale-credential issuance is REFUSED and creates nothing", async () => {
      const v = await version();
      const lock = await holdOperatorLock();
      const rotation = rotate();
      await waitForBlockedBackends(scratch.pool, scratch.appName, 1); // rotation is queued
      const issuance = issue(v); // login verified the OLD password at version v
      await waitForBlockedBackends(scratch.pool, scratch.appName, 2); // issuance is queued behind it
      await lock.release();
      await rotation;
      expect(await issuance).toBeNull();
      expect(await active()).toBe(0);
      expect(await version()).toBe(v + 1);
    });

    it("issuance wins the lock first: its session is committed and then REVOKED by the rotation", async () => {
      const v = await version();
      const lock = await holdOperatorLock();
      const issuance = issue(v);
      await waitForBlockedBackends(scratch.pool, scratch.appName, 1);
      const rotation = rotate();
      await waitForBlockedBackends(scratch.pool, scratch.appName, 2);
      await lock.release();
      const session = await issuance;
      await rotation;
      expect(session).not.toBeNull();
      const row = await sql("SELECT revoked_at FROM sessions WHERE id = $1", [session?.sessionId]);
      expect(row[0].revoked_at).not.toBeNull();
      expect(await active()).toBe(0);
    });

    it("a session issued before rotation starts is revoked by it; the new credential then issues", async () => {
      const v = await version();
      const before = await issue(v);
      expect(before).not.toBeNull();
      await rotate();
      expect(
        (await sql("SELECT revoked_at FROM sessions WHERE id = $1", [before?.sessionId]))[0]
          .revoked_at,
      ).not.toBeNull();
      expect(await issue(v)).toBeNull(); // obsolete credential
      expect(await issue(await version())).not.toBeNull(); // new credential
    });

    it("an in-flight rotation holding the lock mid-transaction blocks issuance until it commits", async () => {
      const v = await version();
      const c = (await scratch.pool.connect()) as pg.PoolClient;
      try {
        await c.query("BEGIN");
        await c.query("SELECT id FROM operators FOR UPDATE");
        await c.query("UPDATE operators SET credential_version = credential_version + 1");
        await c.query(
          "UPDATE sessions SET revoked_at = clock_timestamp() WHERE revoked_at IS NULL",
        );
        const issuance = issue(v);
        await waitForBlockedBackends(scratch.pool, scratch.appName, 1);
        await c.query("COMMIT");
        expect(await issuance).toBeNull();
      } finally {
        c.release();
      }
      expect(await active()).toBe(0);
    });

    it("an in-flight rotation that ROLLS BACK leaves the credential current, so issuance succeeds", async () => {
      const v = await version();
      const c = (await scratch.pool.connect()) as pg.PoolClient;
      try {
        await c.query("BEGIN");
        await c.query("SELECT id FROM operators FOR UPDATE");
        await c.query("UPDATE operators SET credential_version = credential_version + 1");
        const issuance = issue(v);
        await waitForBlockedBackends(scratch.pool, scratch.appName, 1);
        await c.query("ROLLBACK");
        expect(await issuance).not.toBeNull();
      } finally {
        c.release();
      }
      expect(await version()).toBe(v);
    });

    it("stress: 40 rounds of concurrent obsolete-credential issuances racing a rotation never leave a usable session", async () => {
      for (let round = 0; round < 40; round++) {
        const v = await version();
        const results = await Promise.allSettled([
          issue(v),
          issue(v),
          issue(v),
          rotate(),
          issue(v),
          issue(v),
        ]);
        for (const r of results) expect(r.status).toBe("fulfilled");
        expect(await version()).toBe(v + 1);
        // Every issuance used the obsolete version, so after rotation NO session may remain usable.
        expect(await active(), `round ${round}`).toBe(0);
      }
    });
  });
});
