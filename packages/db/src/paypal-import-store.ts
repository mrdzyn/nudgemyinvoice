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
   * Idempotent upsert keyed by (paypal_env, remote_invoice_id). A row owned by a different
   * operator is left untouched and reported as an owner conflict; the caller counts it as
   * skipped. Same-owner rows with identical values only bump the sync timestamp and report
   * `unchanged`; differing values report `updated`.
   */
  async upsert(
    input: ImportedDraftInput,
  ): Promise<{ outcome: UpsertOutcome; draft: ImportedDraft } | { outcome: "owner_conflict" }> {
    const env = input.paypalEnv ?? "sandbox";
    const existing = await this.db
      .select()
      .from(paypalImportedDrafts)
      .where(
        and(
          eq(paypalImportedDrafts.paypalEnv, env),
          eq(paypalImportedDrafts.remoteInvoiceId, input.remoteInvoiceId),
        ),
      )
      .limit(1);
    const found = existing[0];
    if (found && found.operatorId !== input.operatorId) return { outcome: "owner_conflict" };
    const values = {
      operatorId: input.operatorId,
      paypalEnv: env,
      remoteInvoiceId: input.remoteInvoiceId,
      invoiceNumber: input.invoiceNumber ?? null,
      remoteStatus: "DRAFT",
      currency: input.currency,
      totalMinor: input.totalMinor,
      dueDate: input.dueDate ?? null,
      linkedInvoiceId: input.linkedInvoiceId ?? null,
      source: "paypal_sandbox",
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };
    if (!found) {
      const inserted = await this.db.insert(paypalImportedDrafts).values(values).returning();
      return { outcome: "created", draft: toDraft(inserted[0] as Row) };
    }
    const same =
      found.invoiceNumber === values.invoiceNumber &&
      found.currency === values.currency &&
      String(found.totalMinor) === String(values.totalMinor) &&
      found.dueDate === values.dueDate &&
      found.linkedInvoiceId === values.linkedInvoiceId;
    if (same) {
      const touched = await this.db
        .update(paypalImportedDrafts)
        .set({ lastSyncedAt: values.lastSyncedAt, updatedAt: values.updatedAt })
        .where(eq(paypalImportedDrafts.id, found.id))
        .returning();
      return { outcome: "unchanged", draft: toDraft(touched[0] as Row) };
    }
    const updated = await this.db
      .update(paypalImportedDrafts)
      .set(values)
      .where(eq(paypalImportedDrafts.id, found.id))
      .returning();
    return { outcome: "updated", draft: toDraft(updated[0] as Row) };
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
