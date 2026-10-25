import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export type OperationState =
  "pending" | "creating" | "created" | "unknown" | "rejected" | "mismatch";

export interface PayPalOperation {
  id: string;
  invoiceId: string;
  state: OperationState;
  requestId: string;
  invoiceNumber: string;
  payloadDigest: string;
  paypalInvoiceId: string | null;
  /** Fencing counter: each claim increments it; later writes must present the value they were granted. */
  attempts: number;
  lastErrorCode: string | null;
  createAttemptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export type ClaimMode = "create" | "reconcile";

export type ClaimResult =
  | {
      claimed: true;
      mode: ClaimMode;
      op: PayPalOperation;
      /** Seconds since a create request was last sent to PayPal (null if never). */
      secondsSinceCreateAttempt: number | null;
    }
  | { claimed: false; op: PayPalOperation };

type Row = {
  id: string;
  invoice_id: string;
  state: OperationState;
  request_id: string;
  invoice_number: string;
  payload_digest: string;
  paypal_invoice_id: string | null;
  attempts: number;
  last_error_code: string | null;
  create_attempted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
  prev_state?: OperationState;
  attempted_age_seconds?: string | number | null;
};

const toDate = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));
const toOp = (r: Row): PayPalOperation => ({
  id: r.id,
  invoiceId: r.invoice_id,
  state: r.state,
  requestId: r.request_id,
  invoiceNumber: r.invoice_number,
  payloadDigest: r.payload_digest,
  paypalInvoiceId: r.paypal_invoice_id,
  attempts: Number(r.attempts),
  lastErrorCode: r.last_error_code,
  createAttemptedAt: toDate(r.create_attempted_at),
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
  completedAt: toDate(r.completed_at),
});

/**
 * Durable state machine for "create at most one PayPal sandbox draft per invoice".
 *
 *  - `reserve` inserts the single row for an invoice (unique invoice_id) or returns the existing one.
 *  - `claim` is ONE conditional UPDATE that moves pending/rejected/unknown/stale-creating -> creating
 *    and bumps the fencing counter; concurrent claimers get exactly one winner.
 *  - Every later write is conditional on `state = 'creating' AND attempts = <fence>`, so a request
 *    whose lease expired cannot overwrite the outcome recorded by a newer claimant.
 * All time comparisons use the database clock.
 */
export class PostgresPayPalOperationStore {
  constructor(private readonly db: Db) {}

  async reserve(input: {
    invoiceId: string;
    operatorId: string;
    invoiceNumber: string;
    payloadDigest: string;
  }): Promise<PayPalOperation> {
    const res = await this.db.execute<Row>(sql`
      INSERT INTO paypal_draft_operations (invoice_id, created_by, invoice_number, payload_digest)
      VALUES (${input.invoiceId}, ${input.operatorId}, ${input.invoiceNumber}, ${input.payloadDigest})
      ON CONFLICT (invoice_id) DO UPDATE SET invoice_id = EXCLUDED.invoice_id
      RETURNING *`);
    return toOp(res.rows[0] as Row);
  }

  async get(invoiceId: string): Promise<PayPalOperation | null> {
    const res = await this.db.execute<Row>(
      sql`SELECT * FROM paypal_draft_operations WHERE invoice_id = ${invoiceId}`,
    );
    return res.rows[0] ? toOp(res.rows[0]) : null;
  }

  async claim(invoiceId: string, leaseSeconds: number): Promise<ClaimResult> {
    const res = await this.db.execute<Row>(sql`
      WITH old AS (
        SELECT id, state AS prev_state, create_attempted_at AS prev_attempted
        FROM paypal_draft_operations WHERE invoice_id = ${invoiceId} FOR UPDATE
      )
      UPDATE paypal_draft_operations t
      SET state = 'creating', attempts = t.attempts + 1,
          claimed_at = clock_timestamp(), updated_at = clock_timestamp()
      FROM old
      WHERE t.id = old.id
        AND (old.prev_state IN ('pending', 'rejected', 'unknown')
             OR (old.prev_state = 'creating'
                 AND t.claimed_at < clock_timestamp() - make_interval(secs => ${leaseSeconds})))
      RETURNING t.*, old.prev_state,
        extract(epoch FROM (clock_timestamp() - old.prev_attempted)) AS attempted_age_seconds`);
    const r = res.rows[0];
    if (!r) {
      const current = await this.get(invoiceId);
      if (!current) throw new Error("no PayPal draft operation reserved for this invoice");
      return { claimed: false, op: current };
    }
    return {
      claimed: true,
      mode: r.prev_state === "pending" || r.prev_state === "rejected" ? "create" : "reconcile",
      op: toOp(r),
      secondsSinceCreateAttempt:
        r.attempted_age_seconds === null || r.attempted_age_seconds === undefined
          ? null
          : Number(r.attempted_age_seconds),
    };
  }

  /** Records, durably and BEFORE the request leaves, that a create is about to be sent. */
  async markCreateAttempt(invoiceId: string, fence: number): Promise<boolean> {
    const res = await this.db.execute(sql`
      UPDATE paypal_draft_operations
      SET create_attempted_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE invoice_id = ${invoiceId} AND state = 'creating' AND attempts = ${fence}`);
    return (res.rowCount ?? 0) === 1;
  }

  /** Verified remote draft: operation and invoice link are committed together, or not at all. */
  async markCreated(invoiceId: string, fence: number, remoteId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const upd = await tx.execute(sql`
        UPDATE paypal_draft_operations
        SET state = 'created', paypal_invoice_id = ${remoteId}, last_error_code = NULL,
            completed_at = clock_timestamp(), updated_at = clock_timestamp()
        WHERE invoice_id = ${invoiceId} AND state = 'creating' AND attempts = ${fence}`);
      if ((upd.rowCount ?? 0) !== 1) return false;
      const link = await tx.execute(
        sql`UPDATE invoices SET paypal_invoice_id = ${remoteId} WHERE id = ${invoiceId} AND paypal_invoice_id IS NULL`,
      );
      if ((link.rowCount ?? 0) !== 1) throw new Error("invoice already linked to a PayPal invoice");
      return true;
    });
  }

  private async finish(
    invoiceId: string,
    fence: number,
    state: "mismatch" | "rejected" | "unknown",
    code: string,
    remoteId: string | null,
  ): Promise<boolean> {
    const res = await this.db.execute(sql`
      UPDATE paypal_draft_operations
      SET state = ${state}, last_error_code = ${code},
          paypal_invoice_id = COALESCE(${remoteId}, paypal_invoice_id),
          completed_at = CASE WHEN ${state} = 'unknown' OR ${state} = 'rejected' THEN NULL ELSE clock_timestamp() END,
          updated_at = clock_timestamp()
      WHERE invoice_id = ${invoiceId} AND state = 'creating' AND attempts = ${fence}`);
    return (res.rowCount ?? 0) === 1;
  }

  /** A remote draft exists but its content does not match: never claimed as success, never retried. */
  markMismatch(invoiceId: string, fence: number, remoteId: string, code: string) {
    return this.finish(invoiceId, fence, "mismatch", code, remoteId);
  }
  /** PayPal definitively refused the request, so nothing was created and a retry is allowed. */
  markRejected(invoiceId: string, fence: number, code: string) {
    return this.finish(invoiceId, fence, "rejected", code, null);
  }
  /** The outcome is not known (timeout, network, 5xx, unparsable reply); must be reconciled before any create. */
  markUnknown(invoiceId: string, fence: number, code: string, remoteId: string | null = null) {
    return this.finish(invoiceId, fence, "unknown", code, remoteId);
  }
}
