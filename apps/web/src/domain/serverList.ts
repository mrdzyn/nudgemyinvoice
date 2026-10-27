/**
 * Strict runtime validation of the `GET /api/invoice-drafts` page. The list is UNTRUSTED input: any
 * deviation (extra key, bad id, impossible date, non-canonical money, unknown state, duplicate id,
 * a page longer than requested, an order that is not newest-first, a cursor that does not move)
 * makes the whole page malformed. Nothing is repaired, reinterpreted or replaced by a fixture.
 */
import { CURRENCY_INFO } from "./money.js";
import { exactKeys, isRecord, isUuid, isValidInstant, MAX_TEXT, text } from "./serverInvoice.js";
import { isValidIsoDate } from "./invoiceForm.js";
import { CURRENCY_CODES, type CurrencyCode } from "./types.js";

export const LIST_PAYPAL_STATES = [
  "none",
  "pending",
  "creating",
  "created",
  "unknown",
  "rejected",
  "mismatch",
] as const;
export type ListPayPalState = (typeof LIST_PAYPAL_STATES)[number];

export const PAGE_SIZE = 20;
export const MAX_CURSOR_CHARS = 120;
export const MAX_SEARCH_CHARS = 100;

export interface ListItem {
  id: string;
  customerName: string;
  customerEmail: string;
  currency: CurrencyCode;
  dueDate: string;
  /** Canonical decimal string in the invoice's own currency. */
  total: string;
  createdAt: string;
  paypalState: ListPayPalState;
}

export interface ListPage {
  items: ListItem[];
  nextCursor: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURSOR = /^[A-Za-z0-9_-]{1,120}$/;

/** `0`, `12`, `12.50` (2 decimals) or `1200` (JPY, none); no leading zeros, bounded length. */
export function isCanonicalMoney(v: unknown, currency: CurrencyCode): v is string {
  if (typeof v !== "string") return false;
  const exp = CURRENCY_INFO[currency].exponent;
  return exp === 0 ? /^(0|[1-9]\d{0,14})$/.test(v) : /^(0|[1-9]\d{0,14})\.\d{2}$/.test(v);
}

/** Integer minor units of a canonical amount; exact BigInt, never a float. */
export function minorOf(total: string): bigint {
  return BigInt(total.replace(".", ""));
}

function parseItem(v: unknown): ListItem | null {
  if (
    !isRecord(v) ||
    !exactKeys(v, [
      "id",
      "customerName",
      "customerEmail",
      "currency",
      "dueDate",
      "total",
      "createdAt",
      "paypal",
    ])
  )
    return null;
  const { id, customerName, customerEmail, currency, dueDate, total, createdAt, paypal } = v;
  if (!isUuid(id)) return null;
  if (!text(customerName, 1, MAX_TEXT)) return null;
  if (!text(customerEmail, 3, 254) || !EMAIL.test(customerEmail)) return null;
  if (typeof currency !== "string" || !(CURRENCY_CODES as readonly string[]).includes(currency))
    return null;
  const cur = currency as CurrencyCode;
  if (typeof dueDate !== "string" || !isValidIsoDate(dueDate)) return null;
  if (!isCanonicalMoney(total, cur)) return null;
  if (!isValidInstant(createdAt)) return null;
  if (!isRecord(paypal) || !exactKeys(paypal, ["state"])) return null;
  const state = paypal["state"];
  if (typeof state !== "string" || !(LIST_PAYPAL_STATES as readonly string[]).includes(state))
    return null;
  return {
    id,
    customerName,
    customerEmail,
    currency: cur,
    dueDate,
    total,
    createdAt,
    paypalState: state as ListPayPalState,
  };
}

/**
 * @param limit  the page size that was requested; a longer page is refused
 * @param requestCursor the cursor that was sent, so a response that does not advance is refused
 */
export function parseListPage(
  body: unknown,
  limit: number,
  requestCursor: string | null,
): ListPage | null {
  if (!isRecord(body) || !exactKeys(body, ["items", "nextCursor"])) return null;
  const raw = body["items"];
  if (!Array.isArray(raw) || raw.length > limit) return null;
  const items: ListItem[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const item = parseItem(r);
    if (!item) return null;
    const key = item.id.toLowerCase();
    if (seen.has(key)) return null; // duplicate id within a page
    seen.add(key);
    const prev = items[items.length - 1];
    // Newest first. createdAt has millisecond resolution here, so equal neighbours are legitimate.
    if (prev && Date.parse(item.createdAt) > Date.parse(prev.createdAt)) return null;
    items.push(item);
  }
  const next = body["nextCursor"];
  if (next !== null) {
    if (typeof next !== "string" || !CURSOR.test(next)) return null;
    if (next === requestCursor) return null; // would loop on the same page forever
    if (items.length !== limit) return null; // a cursor only follows a full page
  }
  return { items, nextCursor: next as string | null };
}
