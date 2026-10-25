import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type {
  ApprovalGrant,
  ApprovalStore,
  ConsumeExpectation,
  PrivilegedAction,
} from "@nmi/domain";
import type { Db } from "./client.js";
import { approvals } from "./schema.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PostgreSQL implementation of the `ApprovalStore` contract.
 *
 * `consumeIfMatches` is ONE conditional `UPDATE ... WHERE ... RETURNING id`: it never reads and then
 * writes. Every expected value (id, action, resource, payload digest, approver) plus "not yet
 * consumed" and "not expired" are in the WHERE clause, and success means exactly one row returned.
 * Under READ COMMITTED a second concurrent UPDATE blocks on the row lock and re-evaluates the WHERE
 * against the committed row, so it sees `consumed_at` set and updates nothing. If the surrounding
 * transaction rolls back, the consumption rolls back with it and the grant is usable again.
 *
 * Time: expiry is enforced with the DATABASE clock (`clock_timestamp()`), never with the caller's
 * `expected.now`, so a caller cannot extend or shorten a grant by passing a different clock. The
 * `now` field of the expectation is ignored here by design.
 *
 * Any database error propagates (fail closed): the privileged action does not proceed.
 */
export class PostgresApprovalStore implements ApprovalStore {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<ApprovalGrant | null> {
    if (!UUID.test(id)) return null;
    const rows = await this.db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      action: r.action as PrivilegedAction,
      resourceId: r.resourceId,
      payloadDigest: r.payloadDigest,
      approverId: r.approverId,
      expiresAt: r.expiresAt,
      consumedAt: r.consumedAt,
    };
  }

  async consumeIfMatches(expected: ConsumeExpectation): Promise<boolean> {
    if (!UUID.test(expected.id)) return false;
    const updated = await this.db
      .update(approvals)
      .set({ consumedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(approvals.id, expected.id),
          eq(approvals.action, expected.action),
          eq(approvals.resourceId, expected.resourceId),
          eq(approvals.payloadDigest, expected.payloadDigest),
          eq(approvals.approverId, expected.approverId),
          isNull(approvals.consumedAt),
          gt(approvals.expiresAt, sql`clock_timestamp()`),
        ),
      )
      .returning({ id: approvals.id });
    return updated.length === 1;
  }
}
