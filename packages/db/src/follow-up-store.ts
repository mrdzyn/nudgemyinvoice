import { and, asc, desc, eq, sql } from "drizzle-orm";
import { formatMoney, type CurrencyCode } from "@nmi/shared";
import type { Db } from "./client.js";
import { invoiceFollowUps, invoices } from "./schema.js";

export const FOLLOW_UP_MAX_NOTE = 500;
export const FOLLOW_UP_MAX_MESSAGE = 2000;
export const FOLLOW_UP_LIST_LIMIT = 100;
export const FOLLOW_UP_HISTORY_LIMIT = 5;

export type FollowUpStatus = "active" | "completed" | "canceled";
/** Derived at read time from `due_at` and the supplied clock; never stored. */
export type FollowUpState = "due" | "upcoming" | "completed" | "canceled";

export interface FollowUp {
  id: string;
  invoiceId: string;
  /** The real scheduled instant (UTC). */
  dueAt: Date;
  /** IANA zone the operator scheduled it in; used only to display the instant back. */
  timezone: string;
  note: string | null;
  message: string;
  status: FollowUpStatus;
  state: FollowUpState;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  canceledAt: Date | null;
}

/** A follow-up with the minimal invoice context the operator needs to recognise it. */
export interface FollowUpWithInvoice extends FollowUp {
  invoice: { customerName: string; currency: CurrencyCode; total: string; dueDate: string };
}

export interface FollowUpInput {
  dueAt: Date;
  timezone: string;
  note: string | null;
  message: string;
}

export type FollowUpFailure = "not_found" | "duplicate_active" | "not_active";

export type FollowUpResult<T> = { ok: true; value: T } | { ok: false; reason: FollowUpFailure };

type Row = typeof invoiceFollowUps.$inferSelect;

const stateOf = (r: Row, now: Date): FollowUpState =>
  r.status === "completed"
    ? "completed"
    : r.status === "canceled"
      ? "canceled"
      : r.dueAt.getTime() <= now.getTime()
        ? "due"
        : "upcoming";

const toFollowUp = (r: Row, now: Date): FollowUp => ({
  id: r.id,
  invoiceId: r.invoiceId,
  dueAt: r.dueAt,
  timezone: r.timezone,
  note: r.note,
  message: r.message,
  status: r.status as FollowUpStatus,
  state: stateOf(r, now),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  completedAt: r.completedAt,
  canceledAt: r.canceledAt,
});

/**
 * Operator-scoped persistence for local follow-up reminders. Every method takes the authenticated
 * operator id from the server session and the request clock; an invoice or follow-up owned by
 * someone else is indistinguishable from a missing one (`not_found`). Nothing here contacts a
 * customer, PayPal or any provider, and nothing needs a running scheduler: "due" is computed from
 * `due_at` and `now` whenever rows are read.
 */
export class PostgresFollowUpStore {
  constructor(private readonly db: Db) {}

  /** Schedule a new active follow-up for an invoice the operator owns. */
  async create(
    operatorId: string,
    invoiceId: string,
    input: FollowUpInput,
    now: Date,
  ): Promise<FollowUpResult<FollowUp>> {
    const owned = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.createdBy, operatorId)))
      .limit(1);
    if (owned.length === 0) return { ok: false, reason: "not_found" };
    try {
      const rows = await this.db
        .insert(invoiceFollowUps)
        .values({
          invoiceId,
          operatorId,
          dueAt: input.dueAt,
          timezone: input.timezone,
          note: input.note,
          message: input.message,
        })
        .returning();
      return { ok: true, value: toFollowUp(rows[0] as Row, now) };
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, reason: "duplicate_active" };
      throw e;
    }
  }

  /** The operator's active follow-ups (soonest first) with real due/upcoming counts. */
  async listActive(
    operatorId: string,
    now: Date,
  ): Promise<{ items: FollowUpWithInvoice[]; due: number; upcoming: number }> {
    const rows = await this.db
      .select({
        f: invoiceFollowUps,
        customerName: invoices.customerName,
        currency: invoices.currency,
        totalMinor: invoices.totalMinor,
        dueDate: invoices.dueDate,
      })
      .from(invoiceFollowUps)
      .innerJoin(invoices, eq(invoices.id, invoiceFollowUps.invoiceId))
      .where(
        and(eq(invoiceFollowUps.operatorId, operatorId), eq(invoiceFollowUps.status, "active")),
      )
      .orderBy(asc(invoiceFollowUps.dueAt), asc(invoiceFollowUps.id))
      .limit(FOLLOW_UP_LIST_LIMIT);
    const items = rows.map((r) => ({
      ...toFollowUp(r.f, now),
      invoice: {
        customerName: r.customerName,
        currency: r.currency as CurrencyCode,
        total: formatMoney(r.totalMinor, r.currency as CurrencyCode),
        dueDate: r.dueDate,
      },
    }));
    const due = items.filter((i) => i.state === "due").length;
    return { items, due, upcoming: items.length - due };
  }

  /** The active follow-up (if any) plus a few recent closed ones for one owned invoice. */
  async forInvoice(
    operatorId: string,
    invoiceId: string,
    now: Date,
  ): Promise<{ active: FollowUp | null; recent: FollowUp[] } | null> {
    const owned = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.createdBy, operatorId)))
      .limit(1);
    if (owned.length === 0) return null;
    const rows = await this.db
      .select()
      .from(invoiceFollowUps)
      .where(
        and(eq(invoiceFollowUps.invoiceId, invoiceId), eq(invoiceFollowUps.operatorId, operatorId)),
      )
      .orderBy(desc(invoiceFollowUps.updatedAt), desc(invoiceFollowUps.id))
      .limit(FOLLOW_UP_HISTORY_LIMIT + 1);
    const all = rows.map((r) => toFollowUp(r, now));
    const active = all.find((f) => f.status === "active") ?? null;
    return {
      active,
      recent: all.filter((f) => f.status !== "active").slice(0, FOLLOW_UP_HISTORY_LIMIT),
    };
  }

  complete(operatorId: string, id: string, now: Date): Promise<FollowUpResult<FollowUp>> {
    return this.close(operatorId, id, now, "completed");
  }

  cancel(operatorId: string, id: string, now: Date): Promise<FollowUpResult<FollowUp>> {
    return this.close(operatorId, id, now, "canceled");
  }

  /** Move an ACTIVE follow-up to a new instant (and optionally edit its note/message). */
  async reschedule(
    operatorId: string,
    id: string,
    input: FollowUpInput,
    now: Date,
  ): Promise<FollowUpResult<FollowUp>> {
    const rows = await this.db
      .update(invoiceFollowUps)
      .set({
        dueAt: input.dueAt,
        timezone: input.timezone,
        note: input.note,
        message: input.message,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(invoiceFollowUps.id, id),
          eq(invoiceFollowUps.operatorId, operatorId),
          eq(invoiceFollowUps.status, "active"),
        ),
      )
      .returning();
    if (rows[0]) return { ok: true, value: toFollowUp(rows[0], now) };
    return { ok: false, reason: await this.missingReason(operatorId, id) };
  }

  private async close(
    operatorId: string,
    id: string,
    now: Date,
    to: "completed" | "canceled",
  ): Promise<FollowUpResult<FollowUp>> {
    const rows = await this.db
      .update(invoiceFollowUps)
      .set(
        to === "completed"
          ? { status: to, completedAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` }
          : { status: to, canceledAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` },
      )
      .where(
        and(
          eq(invoiceFollowUps.id, id),
          eq(invoiceFollowUps.operatorId, operatorId),
          eq(invoiceFollowUps.status, "active"),
        ),
      )
      .returning();
    if (rows[0]) return { ok: true, value: toFollowUp(rows[0], now) };
    return { ok: false, reason: await this.missingReason(operatorId, id) };
  }

  /** Another operator's id and an unknown id are both `not_found`; only an own closed row is `not_active`. */
  private async missingReason(operatorId: string, id: string): Promise<FollowUpFailure> {
    const rows = await this.db
      .select({ id: invoiceFollowUps.id })
      .from(invoiceFollowUps)
      .where(and(eq(invoiceFollowUps.id, id), eq(invoiceFollowUps.operatorId, operatorId)))
      .limit(1);
    return rows.length ? "not_active" : "not_found";
  }
}

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } }).code;
  return code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505";
}
