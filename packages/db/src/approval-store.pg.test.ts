import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ApprovalError,
  asTrustedActor,
  payloadDigest,
  requireApproval,
  type ConsumeExpectation,
  type PrivilegedRequest,
} from "@nmi/domain";
import { PostgresApprovalStore } from "./approval-store.js";
import { createAuditSink } from "./audit.js";
import { requireApprovalAudited } from "./approval-audit.js";
import { createDb, type Db } from "./client.js";
import {
  createScratchDatabase,
  testDatabaseUrl,
  type ScratchDatabase,
} from "./testing/pg-scratch.js";

/**
 * Real PostgreSQL tests of the approval adapter, with several genuinely separate connections.
 * Skipped (never reported as passed) unless TEST_DATABASE_URL names a disposable nmi_test* database.
 */
const url = testDatabaseUrl();

describe.skipIf(!url)("PostgresApprovalStore (real PostgreSQL, concurrent connections)", () => {
  let scratch: ScratchDatabase;
  let db: Db;
  let store: PostgresApprovalStore;

  const payload = { invoiceId: "INV-1", total: "500.00", currency: "USD" };
  const digest = payloadDigest(payload);
  const approver = "11111111-1111-4111-8111-111111111111";

  async function grant(
    over: {
      action?: string;
      resource?: string;
      digest?: string;
      approver?: string;
      expiresInSeconds?: number;
      consumed?: boolean;
    } = {},
  ) {
    const r = await scratch.pool.query(
      `INSERT INTO approvals (action, resource_id, payload_digest, approver_id, created_at, expires_at, consumed_at)
       VALUES ($1,$2,$3,$4, now() - interval '2 hours', now() + make_interval(secs => $5), CASE WHEN $6 THEN now() - interval '1 hour' END)
       RETURNING id`,
      [
        over.action ?? "sendInvoice",
        over.resource ?? "INV-1",
        over.digest ?? digest,
        over.approver ?? approver,
        over.expiresInSeconds ?? 600,
        over.consumed ?? false,
      ],
    );
    return r.rows[0].id as string;
  }
  const expectation = (id: string, over: Partial<ConsumeExpectation> = {}): ConsumeExpectation => ({
    id,
    action: "sendInvoice",
    resourceId: "INV-1",
    payloadDigest: digest,
    approverId: approver,
    now: new Date(),
    ...over,
  });
  const request = (over: Partial<PrivilegedRequest> = {}): PrivilegedRequest => ({
    action: "sendInvoice",
    resourceId: "INV-1",
    payload,
    actor: asTrustedActor(approver),
    ...over,
  });
  const consumedAt = async (id: string) =>
    (await scratch.pool.query("SELECT consumed_at FROM approvals WHERE id=$1", [id])).rows[0]
      .consumed_at as Date | null;

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 12);
    db = createDb(scratch.pool);
    store = new PostgresApprovalStore(db);
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  describe("single-caller semantics", () => {
    it("get maps a row and returns null for unknown or non-uuid ids", async () => {
      const id = await grant();
      const g = await store.get(id);
      expect(g).toMatchObject({
        id,
        action: "sendInvoice",
        resourceId: "INV-1",
        payloadDigest: digest,
        approverId: approver,
        consumedAt: null,
      });
      expect(await store.get("00000000-0000-4000-8000-000000000000")).toBeNull();
      expect(await store.get("not-a-uuid")).toBeNull();
      expect(await store.get("' OR 1=1 --")).toBeNull();
    });

    it("consumes exactly once", async () => {
      const id = await grant();
      expect(await store.consumeIfMatches(expectation(id))).toBe(true);
      expect(await consumedAt(id)).toBeInstanceOf(Date);
      expect(await store.consumeIfMatches(expectation(id))).toBe(false);
    });

    it.each([
      ["action", { action: "cancelInvoice" as const }],
      ["resource", { resourceId: "INV-2" }],
      ["payload digest", { payloadDigest: payloadDigest({ ...payload, total: "5000.00" }) }],
      ["approver", { approverId: "22222222-2222-4222-8222-222222222222" }],
    ])("a mismatched %s cannot consume and leaves the grant usable", async (_n, patch) => {
      const id = await grant();
      expect(await store.consumeIfMatches(expectation(id, patch))).toBe(false);
      expect(await consumedAt(id)).toBeNull();
      expect(await store.consumeIfMatches(expectation(id))).toBe(true);
    });

    it("refuses expired and already-consumed grants and non-uuid ids", async () => {
      expect(
        await store.consumeIfMatches(expectation(await grant({ expiresInSeconds: -60 }))),
      ).toBe(false);
      expect(await store.consumeIfMatches(expectation(await grant({ consumed: true })))).toBe(
        false,
      );
      expect(await store.consumeIfMatches(expectation("nope"))).toBe(false);
    });

    it("enforces expiry with the DATABASE clock, ignoring the caller-supplied `now`", async () => {
      const expired = await grant({ expiresInSeconds: -60 });
      const farPast = new Date("2000-01-01T00:00:00Z");
      expect(await store.consumeIfMatches(expectation(expired, { now: farPast }))).toBe(false);
      const valid = await grant({ expiresInSeconds: 600 });
      const farFuture = new Date("2999-01-01T00:00:00Z");
      expect(await store.consumeIfMatches(expectation(valid, { now: farFuture }))).toBe(true);
    });
  });

  describe("real concurrency", () => {
    it("the pool really uses multiple PostgreSQL backends", async () => {
      const pids = await Promise.all(
        Array.from({ length: 8 }, () =>
          scratch.pool.query("SELECT pg_backend_pid() AS pid, pg_sleep(0.2)"),
        ),
      );
      expect(new Set(pids.map((r) => r.rows[0].pid)).size).toBeGreaterThan(1);
    });

    it("10 simultaneous consumers of one grant: exactly one wins (repeated for 30 grants)", async () => {
      for (let round = 0; round < 30; round++) {
        const id = await grant();
        const results = await Promise.all(
          Array.from({ length: 10 }, () => store.consumeIfMatches(expectation(id))),
        );
        expect(results.filter(Boolean)).toHaveLength(1);
      }
    });

    it("requireApproval: concurrent callers on the real store yield exactly one success", async () => {
      const id = await grant();
      const settled = await Promise.allSettled(
        Array.from({ length: 12 }, () => requireApproval(store, id, request(), new Date())),
      );
      expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
      for (const s of settled) {
        if (s.status === "rejected") expect(s.reason).toBeInstanceOf(ApprovalError);
      }
    });

    async function twoClients() {
      const a = await scratch.pool.connect();
      const b = await scratch.pool.connect();
      return {
        a,
        b,
        storeA: new PostgresApprovalStore(createDb(a)),
        storeB: new PostgresApprovalStore(createDb(b)),
      };
    }
    const pending = async (p: Promise<unknown>) => {
      const marker = Symbol("pending");
      return (
        (await Promise.race([p, new Promise((r) => setTimeout(() => r(marker), 300))])) === marker
      );
    };
    const release = (...cs: pg.PoolClient[]) => cs.forEach((c) => c.release());

    it("an uncommitted consumption blocks a rival; after COMMIT the rival loses", async () => {
      const id = await grant();
      const { a, b, storeA, storeB } = await twoClients();
      try {
        await a.query("BEGIN");
        expect(await storeA.consumeIfMatches(expectation(id))).toBe(true);
        const rival = storeB.consumeIfMatches(expectation(id));
        expect(await pending(rival)).toBe(true); // blocked on the row lock, not racing past it
        await a.query("COMMIT");
        expect(await rival).toBe(false);
      } finally {
        release(a, b);
      }
    });

    it("a ROLLED-BACK consumption does not authorize: the grant stays unconsumed and the rival then wins", async () => {
      const id = await grant();
      const { a, b, storeA, storeB } = await twoClients();
      try {
        await a.query("BEGIN");
        expect(await storeA.consumeIfMatches(expectation(id))).toBe(true); // true only inside A's tx
        const rival = storeB.consumeIfMatches(expectation(id));
        expect(await pending(rival)).toBe(true);
        await a.query("ROLLBACK");
        expect(await rival).toBe(true);
        expect(await consumedAt(id)).toBeInstanceOf(Date);
        expect(await store.consumeIfMatches(expectation(id))).toBe(false); // consumed once overall
      } finally {
        release(a, b);
      }
    });

    it("a rolled-back consumption leaves a grant consumable (nothing was persisted)", async () => {
      const id = await grant();
      const c = await scratch.pool.connect();
      try {
        await c.query("BEGIN");
        expect(await new PostgresApprovalStore(createDb(c)).consumeIfMatches(expectation(id))).toBe(
          true,
        );
        await c.query("ROLLBACK");
      } finally {
        c.release();
      }
      expect(await consumedAt(id)).toBeNull();
    });
  });

  describe("fail closed", () => {
    it("a closed pool makes consumption throw, and requireApproval never succeeds", async () => {
      const id = await grant();
      const dead = await createScratchDatabase(url as string, 1);
      await dead.drop(); // pool.end() inside
      const deadStore = new PostgresApprovalStore(createDb(dead.pool));
      await expect(deadStore.consumeIfMatches(expectation(id))).rejects.toBeDefined();
      await expect(requireApproval(deadStore, id, request(), new Date())).rejects.toBeDefined();
      expect(await consumedAt(id)).toBeNull();
    });
  });

  describe("audit trail", () => {
    const audit = () => createAuditSink(db);
    const rows = async (id: string) =>
      (
        await scratch.pool.query(
          "SELECT * FROM audit_log WHERE detail->>'approvalId' = $1 ORDER BY at",
          [id],
        )
      ).rows;

    it("records a sanitized success row", async () => {
      const id = await grant();
      await requireApprovalAudited({ store, audit: audit() }, id, request(), new Date(), {
        requestId: "req-1",
      });
      const [row] = await rows(id);
      expect(row).toMatchObject({
        actor: approver,
        action: "approval.consume",
        outcome: "success",
        resource_id: "INV-1",
        request_id: "req-1",
      });
      expect(row.detail).toEqual({ approvalId: id, privilegedAction: "sendInvoice" });
    });

    it("records denials with a closed-set reason and never the payload", async () => {
      const id = await grant();
      await expect(
        requireApprovalAudited(
          { store, audit: audit() },
          id,
          request({ payload: { ...payload, total: "9999.00" } }),
          new Date(),
          {},
        ),
      ).rejects.toMatchObject({ reason: "payload_changed" });
      await expect(
        requireApprovalAudited(
          { store, audit: audit() },
          id,
          request({ actor: undefined }),
          new Date(),
          {},
        ),
      ).rejects.toMatchObject({ reason: "untrusted_actor" });
      const found = await rows(id);
      expect(found.map((r) => [r.actor, r.outcome, r.detail.reason])).toEqual([
        [approver, "denied", "payload_changed"],
        ["anonymous", "denied", "untrusted_actor"],
      ]);
      expect(JSON.stringify(found)).not.toMatch(/9999|500\.00|payload_digest|payloadDigest/);
    });

    it("drops unknown or unsafe detail keys (no secrets, emails, cookies)", async () => {
      await audit().record({
        actor: "system",
        action: "auth.login",
        outcome: "failure",
        detail: {
          reason: "bad_credentials",
          password: "hunter2",
          email: "a@b.example",
          cookie: "x",
        } as never,
      });
      const r = await scratch.pool.query(
        "SELECT detail FROM audit_log WHERE actor='system' ORDER BY at DESC LIMIT 1",
      );
      expect(r.rows[0].detail).toEqual({ reason: "bad_credentials" });
      expect(JSON.stringify(r.rows[0])).not.toMatch(/hunter2|example|cookie/);
    });

    it("is append-only: UPDATE, DELETE and TRUNCATE are rejected by the database", async () => {
      await audit().record({ actor: "system", action: "operator.provision", outcome: "success" });
      for (const sql of [
        "UPDATE audit_log SET actor='x'",
        "DELETE FROM audit_log",
        "TRUNCATE audit_log",
      ]) {
        await expect(scratch.pool.query(sql), sql).rejects.toMatchObject({ code: "23000" });
      }
      expect(
        (await scratch.pool.query("SELECT count(*)::int AS n FROM audit_log")).rows[0].n,
      ).toBeGreaterThan(0);
    });
  });
});
