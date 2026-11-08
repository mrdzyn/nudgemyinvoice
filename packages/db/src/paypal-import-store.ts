import { and, desc, eq, sql } from "drizzle-orm";
import type { CurrencyCode } from "@nmi/shared";
import type { Db } from "./client.js";
import { paypalImportedDrafts } from "./schema.js";

export interface ImportedDraftInput {
  operatorId: string;
  paypalEnv?: string | undefined;
  remoteInvoiceId: string;
  invoiceNumber?: string | null | undefined;
  currency: CurrencyCode;
  totalMinor: bigint;
  dueDate?: string | null | undefined;
  linkedInvoiceId?: string | null | undefined;
}

export interface ImportedDraft {
  id: string;
  paypalEnv: string;
  remoteInvoiceId: string;
  invoiceNumber: string | null;
  remoteStatus: string;
  currency: CurrencyCode;
  /** Exact decimal string in the invoice's own currency; never summed across currencies. */
  totalMinor: string;
  dueDate: string | null;
  linkedInvoiceId: string | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type UpsertOutcome = "created" | "updated" | "unchanged";

/**
 * Raw statements below bypass drizzle's column mapping, so every RETURNING aliases
 * snake_case columns to the camelCase shape `toDraft` reads. `due_date` is cast to text
 * (drizzle's `date` mode is string, but the driver would hand back a Date).
 */
const RETURNING_IMPORTED_DRAFT = sql`
  id,
  operator_id AS "operatorId",
  paypal_env AS "paypalEnv",
  remote_invoice_id AS "remoteInvoiceId",
  invoice_number AS "invoiceNumber",
  remote_status AS "remoteStatus",
  currency,
  total_minor AS "totalMinor",
  due_date::text AS "dueDate",
  linked_invoice_id AS "linkedInvoiceId",
  source,
  last_synced_at AS "lastSyncedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

type Row = typeof paypalImportedDrafts.$inferSelect;

const toDraft = (r: Row): ImportedDraft => ({
  id: r.id,
  paypalEnv: r.paypalEnv,
  remoteInvoiceId: r.remoteInvoiceId,
  invoiceNumber: r.invoiceNumber,
  remoteStatus: r.remoteStatus,
  currency: r.currency as CurrencyCode,
  totalMinor: String(r.totalMinor),
  dueDate: r.dueDate,
  linkedInvoiceId: r.linkedInvoiceId,
  lastSyncedAt: new Date(r.lastSyncedAt),
  createdAt: new Date(r.createdAt),
  updatedAt: new Date(r.updatedAt),
});

/**
 * Owner-scoped mirror of PayPal Sandbox DRAFT invoices. The sync service is the only writer;
 * every read filters by the server-session operator id, so one operator can never see or
 * overwrite another operator's rows (a cross-owner remote id collides on the unique key and
 * is reported as skipped, never merged). Analytics stores never read this table, so imported
 * drafts cannot leak into invoice totals.
 */
export class PostgresPayPalImportStore {
  constructor(private readonly db: Db) {}

  /**
   * Idempotent upsert keyed by (paypal_env, remote_invoice_id), safe under concurrency.
   *
   * Protocol (every write is one atomic statement; there is no SELECT-then-act race):
   *  1. INSERT ... ON CONFLICT DO NOTHING ... RETURNING: a returned row means `created`.
   *     Two concurrent syncs for the same new id race on the unique index; exactly one wins
   *     and the loser falls through below instead of reporting a spurious failure.
   *  2. UPDATE ... WHERE key AND operator_id AND content IS DISTINCT ... RETURNING: a row
   *     means `updated`. The owner predicate makes cross-operator writes impossible.
   *  3. UPDATE (timestamps only) ... WHERE key AND operator_id ... RETURNING: a row means
   *     `unchanged` (identical content, sync timestamp bumped).
   *  4. Otherwise a row exists under a different owner: report `owner_conflict` and leave it
   *     untouched (the caller counts a skip). A classification SELECT runs here only; no
   *     write follows it, so it cannot race. Rows are never deleted through the app, so a
   *     missing row at this point is an honest internal error, never a silent skip.
   */
  async upsert(
    input: ImportedDraftInput,
  ): Promise<{ outcome: UpsertOutcome; draft: ImportedDraft } | { outcome: "owner_conflict" }> {
    const env = input.paypalEnv ?? "sandbox";
    const invoiceNumber = input.invoiceNumber ?? null;
    const dueDate = input.dueDate ?? null;
    const linkedInvoiceId = input.linkedInvoiceId ?? null;

    const inserted = await this.db.execute<Row>(sql`
      INSERT INTO ${paypalImportedDrafts}
        (operator_id, paypal_env, remote_invoice_id, invoice_number, remote_status, currency,
         total_minor, due_date, linked_invoice_id, source, last_synced_at, updated_at)
      VALUES (${input.operatorId}, ${env}, ${input.remoteInvoiceId}, ${invoiceNumber}, 'DRAFT',
        ${input.currency}, ${input.totalMinor}, ${dueDate}, ${linkedInvoiceId}, 'paypal_sandbox',
        now(), now())
      ON CONFLICT (paypal_env, remote_invoice_id) DO NOTHING
      RETURNING ${RETURNING_IMPORTED_DRAFT}`);
    if (inserted.rows[0]) return { outcome: "created", draft: toDraft(inserted.rows[0] as Row) };

    const updated = await this.db.execute<Row>(sql`
      UPDATE ${paypalImportedDrafts}
      SET invoice_number = ${invoiceNumber}, currency = ${input.currency},
        total_minor = ${input.totalMinor}, due_date = ${dueDate},
        linked_invoice_id = ${linkedInvoiceId}, last_synced_at = now(), updated_at = now()
      WHERE paypal_env = ${env} AND remote_invoice_id = ${input.remoteInvoiceId}
        AND operator_id = ${input.operatorId}
        AND (invoice_number IS DISTINCT FROM ${invoiceNumber}
          OR currency IS DISTINCT FROM ${input.currency}
          OR total_minor IS DISTINCT FROM ${input.totalMinor}
          OR due_date IS DISTINCT FROM ${dueDate}
          OR linked_invoice_id IS DISTINCT FROM ${linkedInvoiceId})
      RETURNING ${RETURNING_IMPORTED_DRAFT}`);
    if (updated.rows[0]) return { outcome: "updated", draft: toDraft(updated.rows[0] as Row) };

    const touched = await this.db.execute<Row>(sql`
      UPDATE ${paypalImportedDrafts}
      SET last_synced_at = now(), updated_at = now()
      WHERE paypal_env = ${env} AND remote_invoice_id = ${input.remoteInvoiceId}
        AND operator_id = ${input.operatorId}
      RETURNING ${RETURNING_IMPORTED_DRAFT}`);
    if (touched.rows[0]) return { outcome: "unchanged", draft: toDraft(touched.rows[0] as Row) };

    const stillThere = await this.db
      .select({ id: paypalImportedDrafts.id })
      .from(paypalImportedDrafts)
      .where(
        and(
          eq(paypalImportedDrafts.paypalEnv, env),
          eq(paypalImportedDrafts.remoteInvoiceId, input.remoteInvoiceId),
        ),
      )
      .limit(1);
    if (stillThere.length > 0) return { outcome: "owner_conflict" };
    throw new Error("paypal import row vanished mid-upsert");
  }

  /** Owner-scoped read for the dashboard's dedicated imported-drafts section. */
  async list(input: { operatorId: string; limit?: number }): Promise<ImportedDraft[]> {
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100);
    const rows = await this.db
      .select()
      .from(paypalImportedDrafts)
      .where(eq(paypalImportedDrafts.operatorId, input.operatorId))
      .orderBy(desc(paypalImportedDrafts.lastSyncedAt))
      .limit(limit);
    return rows.map(toDraft);
  }

  /** Test/maintenance helper: exact row count for one operator. */
  async countByOperator(operatorId: string): Promise<number> {
    const rows = await this.db.execute<{ n: string }>(
      sql`SELECT COUNT(*)::text AS n FROM ${paypalImportedDrafts} WHERE ${paypalImportedDrafts.operatorId} = ${operatorId}`,
    );
    return Number((rows.rows[0] as { n: string }).n);
  }
}
