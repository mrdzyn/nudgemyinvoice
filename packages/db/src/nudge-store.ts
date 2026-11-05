import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { formatMoney, type CurrencyCode } from "@nmi/shared";
import type { Db } from "./client.js";
import { invoiceNudges, invoices } from "./schema.js";

export const NUDGE_MAX_MESSAGE = 2000;
export const NUDGE_LIST_LIMIT = 100;

export type NudgeTone = "friendly" | "professional" | "firm";
export type NudgeStatus = "pending_review" | "approved" | "rejected" | "superseded";
/** Queue views. "history" = closed without approval (rejected or replaced by a newer draft). */
export type NudgeView = "pending" | "approved" | "history";
const VIEW_STATUSES: Record<NudgeView, NudgeStatus[]> = {
  pending: ["pending_review"],
  approved: ["approved"],
  history: ["rejected", "superseded"],
};

/** Verified facts the draft was rendered from (snapshot; no customer contact data). */
export interface NudgeFacts {
  currency: CurrencyCode;
  amount: string;
  dueDate: string;
  daysPastDue: number;
  asOfDate: string;
  timeZone: string;
  invoiceRef: string;
}

export interface Nudge {
  id: string;
  invoiceId: string;
  tone: NudgeTone;
  status: NudgeStatus;
  message: string;
  aiMessage: string;
  rationale: string;
  facts: NudgeFacts;
  model: string;
  promptVersion: string;
  edited: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  supersededAt: Date | null;
}

export interface NudgeWithInvoice extends Nudge {
  invoice: { customerName: string; currency: CurrencyCode; total: string; dueDate: string };
}

/** Verified, operator-owned invoice facts used to draft a nudge. */
export interface NudgeInvoiceContext {
  id: string;
  customerName: string;
  currency: CurrencyCode;
  total: string;
  dueDate: string;
  /** An earlier nudge for this invoice was approved for manual use. */
  repeat: boolean;
  pending: { id: string; version: number } | null;
}

export interface NudgeCreateInput {
  tone: NudgeTone;
  message: string;
  rationale: string;
  facts: NudgeFacts;
  model: string;
  promptVersion: string;
}

export type NudgeFailure = "not_found" | "not_pending" | "version_conflict" | "pending_exists";
export type NudgeResult<T> = { ok: true; value: T } | { ok: false; reason: NudgeFailure };

export interface NudgeSummary {
  pending: number;
  approved: number;
  rejected: number;
  superseded: number;
  total: number;
}

type Row = typeof invoiceNudges.$inferSelect;

const toNudge = (r: Row): Nudge => ({
  id: r.id,
  invoiceId: r.invoiceId,
  tone: r.tone as NudgeTone,
  status: r.status as NudgeStatus,
  message: r.message,
  aiMessage: r.aiMessage,
  rationale: r.rationale,
  facts: r.facts as NudgeFacts,
  model: r.model,
  promptVersion: r.promptVersion,
  edited: r.edited,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  approvedAt: r.approvedAt,
  rejectedAt: r.rejectedAt,
  supersededAt: r.supersededAt,
});

/**
 * Operator-scoped persistence for AI-drafted payment nudges. Every method takes the authenticated operator id
 * from the server session; an invoice or nudge owned by someone else is indistinguishable from a missing one.
 * Every transition is bound to the `version` the operator last saw, so an approval always applies to exactly the
 * text that was reviewed. Nothing here sends, schedules or dispatches anything.
 */
export class PostgresNudgeStore {
  constructor(private readonly db: Db) {}

  /** The verified facts for an owned invoice, or null when it is missing or not the operator's. */
  async invoiceContext(operatorId: string, invoiceId: string): Promise<NudgeInvoiceContext | null> {
    const inv = await this.db
      .select({
        id: invoices.id,
        customerName: invoices.customerName,
        currency: invoices.currency,
        totalMinor: invoices.totalMinor,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.createdBy, operatorId)))
      .limit(1);
    const i = inv[0];
    if (!i) return null;
    const rows = await this.db
      .select({
        id: invoiceNudges.id,
        status: invoiceNudges.status,
        version: invoiceNudges.version,
      })
      .from(invoiceNudges)
      .where(
        and(
          eq(invoiceNudges.invoiceId, invoiceId),
          eq(invoiceNudges.operatorId, operatorId),
          inArray(invoiceNudges.status, ["pending_review", "approved"]),
        ),
      );
    const pending = rows.find((r) => r.status === "pending_review");
    return {
      id: i.id,
      customerName: i.customerName,
      currency: i.currency as CurrencyCode,
      total: formatMoney(i.totalMinor, i.currency as CurrencyCode),
      dueDate: i.dueDate,
      repeat: rows.some((r) => r.status === "approved"),
      pending: pending ? { id: pending.id, version: pending.version } : null,
    };
  }

  /**
   * Store a new pending draft. If the invoice already has a pending draft, the caller must name it (id + the
   * version it saw) to replace it; the old one becomes `superseded` in the same transaction.
   */
  async create(
    operatorId: string,
    invoiceId: string,
    input: NudgeCreateInput,
    replace: { id: string; version: number } | null,
  ): Promise<NudgeResult<Nudge>> {
    try {
      return await this.db.transaction(async (tx) => {
        const owned = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.createdBy, operatorId)))
          .limit(1);
        if (owned.length === 0) return { ok: false, reason: "not_found" } as const;
        if (replace) {
          const old = await tx
            .update(invoiceNudges)
            .set({
              status: "superseded",
              supersededAt: sql`clock_timestamp()`,
              updatedAt: sql`clock_timestamp()`,
              version: sql`${invoiceNudges.version} + 1`,
            })
            .where(
              and(
                eq(invoiceNudges.id, replace.id),
                eq(invoiceNudges.invoiceId, invoiceId),
                eq(invoiceNudges.operatorId, operatorId),
                eq(invoiceNudges.status, "pending_review"),
                eq(invoiceNudges.version, replace.version),
              ),
            )
            .returning({ id: invoiceNudges.id });
          if (old.length === 0) return { ok: false, reason: "version_conflict" } as const;
        }
        const rows = await tx
          .insert(invoiceNudges)
          .values({
            invoiceId,
            operatorId,
            tone: input.tone,
            message: input.message,
            aiMessage: input.message,
            rationale: input.rationale,
            facts: input.facts,
            model: input.model,
            promptVersion: input.promptVersion,
          })
          .returning();
        return { ok: true, value: toNudge(rows[0] as Row) } as const;
      });
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, reason: "pending_exists" };
      throw e;
    }
  }

  /** Real counts for the operator (all of the operator's nudges, every status). */
  async summary(operatorId: string): Promise<NudgeSummary> {
    const rows = await this.db
      .select({ status: invoiceNudges.status, n: count() })
      .from(invoiceNudges)
      .where(eq(invoiceNudges.operatorId, operatorId))
      .groupBy(invoiceNudges.status);
    const by = (s: NudgeStatus) => Number(rows.find((r) => r.status === s)?.n ?? 0);
    const s = {
      pending: by("pending_review"),
      approved: by("approved"),
      rejected: by("rejected"),
      superseded: by("superseded"),
    };
    return { ...s, total: s.pending + s.approved + s.rejected + s.superseded };
  }

  /** One queue view, newest first, with the minimal invoice context needed to recognise each draft. */
  async list(
    operatorId: string,
    view: NudgeView,
    opts: { invoiceId?: string; limit?: number } = {},
  ): Promise<NudgeWithInvoice[]> {
    const rows = await this.db
      .select({
        n: invoiceNudges,
        customerName: invoices.customerName,
        currency: invoices.currency,
        totalMinor: invoices.totalMinor,
        dueDate: invoices.dueDate,
      })
      .from(invoiceNudges)
      .innerJoin(
        invoices,
        and(eq(invoices.id, invoiceNudges.invoiceId), eq(invoices.createdBy, operatorId)),
      )
      .where(
        and(
          eq(invoiceNudges.operatorId, operatorId),
          inArray(invoiceNudges.status, VIEW_STATUSES[view]),
          ...(opts.invoiceId ? [eq(invoiceNudges.invoiceId, opts.invoiceId)] : []),
        ),
      )
      .orderBy(desc(invoiceNudges.updatedAt), desc(invoiceNudges.id))
      .limit(Math.min(opts.limit ?? NUDGE_LIST_LIMIT, NUDGE_LIST_LIMIT));
    return rows.map((r) => ({
      ...toNudge(r.n),
      invoice: {
        customerName: r.customerName,
        currency: r.currency as CurrencyCode,
        total: formatMoney(r.totalMinor, r.currency as CurrencyCode),
        dueDate: r.dueDate,
      },
    }));
  }

  async get(operatorId: string, id: string): Promise<NudgeWithInvoice | null> {
    const rows = await this.db
      .select({
        n: invoiceNudges,
        customerName: invoices.customerName,
        currency: invoices.currency,
        totalMinor: invoices.totalMinor,
        dueDate: invoices.dueDate,
      })
      .from(invoiceNudges)
      .innerJoin(
        invoices,
        and(eq(invoices.id, invoiceNudges.invoiceId), eq(invoices.createdBy, operatorId)),
      )
      .where(and(eq(invoiceNudges.id, id), eq(invoiceNudges.operatorId, operatorId)))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      ...toNudge(r.n),
      invoice: {
        customerName: r.customerName,
        currency: r.currency as CurrencyCode,
        total: formatMoney(r.totalMinor, r.currency as CurrencyCode),
        dueDate: r.dueDate,
      },
    };
  }

  /** Replace the reviewed text of a PENDING draft (the AI original is kept unchanged). */
  edit(operatorId: string, id: string, version: number, message: string) {
    return this.transition(operatorId, id, version, {
      message,
      edited: sql`${invoiceNudges.aiMessage} <> ${message}`,
    });
  }

  /** Approved for the operator's OWN manual use. Nothing is sent. */
  approve(operatorId: string, id: string, version: number) {
    return this.transition(operatorId, id, version, {
      status: "approved",
      approvedAt: sql`clock_timestamp()`,
    });
  }

  reject(operatorId: string, id: string, version: number) {
    return this.transition(operatorId, id, version, {
      status: "rejected",
      rejectedAt: sql`clock_timestamp()`,
    });
  }

  private async transition(
    operatorId: string,
    id: string,
    version: number,
    set: Partial<Record<keyof Row, unknown>>,
  ): Promise<NudgeResult<Nudge>> {
    const rows = await this.db
      .update(invoiceNudges)
      .set({
        ...(set as Partial<typeof invoiceNudges.$inferInsert>),
        updatedAt: sql`clock_timestamp()`,
        version: sql`${invoiceNudges.version} + 1`,
      })
      .where(
        and(
          eq(invoiceNudges.id, id),
          eq(invoiceNudges.operatorId, operatorId),
          eq(invoiceNudges.status, "pending_review"),
          eq(invoiceNudges.version, version),
        ),
      )
      .returning();
    if (rows[0]) return { ok: true, value: toNudge(rows[0]) };
    // Say precisely why, without revealing anything about rows the operator does not own.
    const cur = await this.db
      .select({ status: invoiceNudges.status })
      .from(invoiceNudges)
      .where(and(eq(invoiceNudges.id, id), eq(invoiceNudges.operatorId, operatorId)))
      .limit(1);
    if (!cur[0]) return { ok: false, reason: "not_found" };
    if (cur[0].status !== "pending_review") return { ok: false, reason: "not_pending" };
    return { ok: false, reason: "version_conflict" };
  }
}

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } }).code;
  return code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505";
}
