import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { CURRENCY_CODES, formatMoney, type CurrencyCode } from "@nmi/shared";
import type { Db } from "./client.js";
import { invoices, paypalDraftOperations } from "./schema.js";

export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 50;
export const LIST_MAX_SEARCH = 100;

/** PayPal status groups the dashboard filters by. `none` = no durable operation row exists. */
export const PAYPAL_STATUS_GROUPS = ["none", "progress", "created", "attention"] as const;
export type PayPalStatusGroup = (typeof PAYPAL_STATUS_GROUPS)[number];
const GROUP_STATES: Record<Exclude<PayPalStatusGroup, "none">, string[]> = {
  progress: ["pending", "creating"],
  created: ["created"],
  attention: ["unknown", "rejected", "mismatch"],
};

export interface InvoiceListCursor {
  /** UTC instant with microsecond precision exactly as stored (JS Dates would truncate it). */
  createdAt: string;
  id: string;
}

const MICRO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;
// Lowercase only: stored ids are canonical, and a cursor must be too.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_CURSOR_CHARS = 120;

/** Opaque to clients. Carries only a timestamp and an invoice id (both already visible to the owner). */
export function encodeCursor(c: InvoiceListCursor): string {
  return Buffer.from(JSON.stringify([c.createdAt, c.id]), "utf8").toString("base64url");
}

/** Strict decoder: anything that is not exactly an encoded real instant + UUID is rejected (null). */
export function decodeCursor(raw: string): InvoiceListCursor | null {
  if (raw.length === 0 || raw.length > MAX_CURSOR_CHARS || !/^[A-Za-z0-9_-]+$/.test(raw))
    return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [createdAt, id] = parsed as unknown[];
  if (typeof createdAt !== "string" || typeof id !== "string" || !UUID.test(id)) return null;
  const m = MICRO_INSTANT.exec(createdAt);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const probe = new Date(Date.UTC(2000, 0, 1));
  probe.setUTCFullYear(y, mo - 1, d);
  probe.setUTCHours(h, mi, s, 0);
  const real =
    y >= 1970 &&
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d &&
    h <= 23 &&
    mi <= 59 &&
    s <= 59;
  if (!real) return null;
  // Canonical form only: re-encoding must reproduce the exact input (no alternative spellings).
  const cursor = { createdAt, id };
  return encodeCursor(cursor) === raw ? cursor : null;
}

export interface InvoiceListQuery {
  /** Always the authenticated operator, taken from the server session. */
  operatorId: string;
  limit?: number;
  cursor?: InvoiceListCursor | undefined;
  currency?: CurrencyCode | undefined;
  status?: PayPalStatusGroup | undefined;
  /** Customer name/email substring, or an invoice-id prefix. */
  search?: string | undefined;
}

export interface InvoiceListItem {
  id: string;
  customerName: string;
  customerEmail: string;
  currency: CurrencyCode;
  dueDate: string;
  /** Exact decimal string in the invoice's own currency; never summed across currencies here. */
  total: string;
  createdAt: Date;
  paypalState: "none" | "pending" | "creating" | "created" | "unknown" | "rejected" | "mismatch";
}

export interface InvoiceListPage {
  items: InvoiceListItem[];
  nextCursor: InvoiceListCursor | null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Read-only, owner-scoped invoice list. One query (LEFT JOIN on the unique paypal operation row, no
 * N+1), keyset-paginated on (created_at DESC, id DESC) so equal timestamps and concurrent inserts
 * can neither skip nor repeat a row. Rows with a NULL owner never match `created_by = $operator`.
 * Money is formatted from integer minor units; nothing is summed.
 */
export class PostgresInvoiceListStore {
  constructor(private readonly db: Db) {}

  async list(q: InvoiceListQuery): Promise<InvoiceListPage> {
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? LIST_DEFAULT_LIMIT), 1), LIST_MAX_LIMIT);
    const where: (SQL | undefined)[] = [eq(invoices.createdBy, q.operatorId)];
    if (q.currency) {
      if (!(CURRENCY_CODES as readonly string[]).includes(q.currency))
        throw new Error("bad currency");
      where.push(eq(invoices.currency, q.currency));
    }
    if (q.status) {
      where.push(
        q.status === "none"
          ? isNull(paypalDraftOperations.id)
          : inArray(paypalDraftOperations.state, GROUP_STATES[q.status]),
      );
    }
    const term = q.search?.trim();
    if (term) {
      if (term.length > LIST_MAX_SEARCH) throw new Error("search too long");
      const contains = `%${escapeLike(term)}%`;
      const prefix = `${escapeLike(term)}%`;
      where.push(
        sql`(${invoices.customerName} ilike ${contains} escape '\\' or ${invoices.customerEmail} ilike ${contains} escape '\\' or ${invoices.id}::text ilike ${prefix} escape '\\')`,
      );
    }
    if (q.cursor) {
      where.push(
        sql`(${invoices.createdAt}, ${invoices.id}) < (${q.cursor.createdAt}::timestamptz, ${q.cursor.id}::uuid)`,
      );
    }

    const rows = await this.db
      .select({
        id: invoices.id,
        customerName: invoices.customerName,
        customerEmail: invoices.customerEmail,
        currency: invoices.currency,
        dueDate: invoices.dueDate,
        totalMinor: invoices.totalMinor,
        createdAt: invoices.createdAt,
        cursorTs: sql<string>`to_char(${invoices.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        state: paypalDraftOperations.state,
      })
      .from(invoices)
      .leftJoin(paypalDraftOperations, eq(paypalDraftOperations.invoiceId, invoices.id))
      .where(and(...where))
      .orderBy(desc(invoices.createdAt), desc(invoices.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        currency: r.currency as CurrencyCode,
        dueDate: r.dueDate,
        total: formatMoney(r.totalMinor, r.currency as CurrencyCode),
        createdAt: r.createdAt,
        paypalState: (r.state ?? "none") as InvoiceListItem["paypalState"],
      })),
      nextCursor: rows.length > limit && last ? { createdAt: last.cursorTs, id: last.id } : null,
    };
  }
}
