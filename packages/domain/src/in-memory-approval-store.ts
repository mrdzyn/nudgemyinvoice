import type { ApprovalGrant, ApprovalStore, ConsumeExpectation } from "./approval.js";

/** Reference/test implementation. Production uses a PostgreSQL adapter honoring the same contract. */
export class InMemoryApprovalStore implements ApprovalStore {
  private readonly rows = new Map<string, ApprovalGrant>();

  insert(grant: ApprovalGrant): void {
    this.rows.set(grant.id, { ...grant });
  }

  /** Test hook: simulate a concurrent writer changing the stored row. */
  mutate(id: string, patch: Partial<ApprovalGrant>): void {
    const row = this.rows.get(id);
    if (row) Object.assign(row, patch);
  }

  async get(id: string): Promise<ApprovalGrant | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null; // a copy: callers cannot mutate stored state
  }

  async consumeIfMatches(e: ConsumeExpectation): Promise<boolean> {
    // Check-and-set in a single synchronous step (no await between), so it is atomic in-process.
    const row = this.rows.get(e.id);
    if (
      !row ||
      row.consumedAt !== null ||
      row.expiresAt.getTime() <= e.now.getTime() ||
      row.action !== e.action ||
      row.resourceId !== e.resourceId ||
      row.payloadDigest !== e.payloadDigest ||
      row.approverId !== e.approverId
    ) {
      return false;
    }
    row.consumedAt = e.now;
    return true;
  }
}
