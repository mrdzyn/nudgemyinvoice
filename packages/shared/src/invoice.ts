import { z } from "zod";
import { CURRENCY_CODES, type CurrencyCode } from "./currency.js";
import {
  divRoundHalfUp,
  formatMoney,
  parseMoney,
  parsePercent,
  parseQuantity,
  MoneyError,
} from "./money.js";

const MAX_LINE_ITEMS = 50;
const MAX_TEXT = 200;

/** True only for a real calendar date written exactly as YYYY-MM-DD (rejects 2026-02-30, 2026-13-01, 2026-1-1). */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  // Date.UTC maps years 0-99 to 1900-1999, so set the full year explicitly.
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return (
    y >= 1 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** Strips control characters and collapses whitespace in untrusted text. */
export function sanitizeText(value: string): string {
  const printable = Array.from(value, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f ? " " : ch;
  }).join("");
  return printable.replace(/\s+/g, " ").trim();
}

export const currencyCodeSchema = z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]]);

const decimalString = z.string().regex(/^\d{1,12}(\.\d+)?$/, "Must be a non-negative decimal");

export const lineItemSchema = z.strictObject({
  description: z.string().transform(sanitizeText).pipe(z.string().min(1).max(MAX_TEXT)),
  quantity: decimalString,
  unitPrice: decimalString,
});

export const discountSchema = z.strictObject({
  kind: z.enum(["percent", "amount"]),
  value: decimalString,
});

/** Validated invoice draft. Totals are NOT part of the input; they are computed exactly. */
export const invoiceDraftSchema = z.strictObject({
  customerName: z.string().transform(sanitizeText).pipe(z.string().min(1).max(MAX_TEXT)),
  customerEmail: z.string().max(254).email(),
  currency: currencyCodeSchema,
  lineItems: z.array(lineItemSchema).min(1).max(MAX_LINE_ITEMS),
  dueDate: z.string().refine(isValidIsoDate, "Must be a valid YYYY-MM-DD date"),
  taxPercent: decimalString.nullable(),
  discount: discountSchema.nullable(),
});
export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;

export const clarificationRequestSchema = z.strictObject({
  field: z.enum(["customerName", "customerEmail", "currency", "lineItems", "dueDate", "other"]),
  question: z.string().min(1).max(300),
});
export type ClarificationRequest = z.infer<typeof clarificationRequestSchema>;

export const validationErrorSchema = z.strictObject({
  path: z.string(),
  message: z.string(),
});
export type ValidationErrorItem = z.infer<typeof validationErrorSchema>;

export interface CalculatedTotals {
  currency: CurrencyCode;
  lineTotals: string[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

/** Exact decimal arithmetic in minor units; rounds half up per line and for tax. */
export function calculateTotals(draft: InvoiceDraft): CalculatedTotals {
  const { currency } = draft;
  let subtotal = 0n;
  const lineTotals: bigint[] = draft.lineItems.map((item) => {
    const line = divRoundHalfUp(
      parseMoney(item.unitPrice, currency) * parseQuantity(item.quantity),
      100n,
    );
    subtotal += line;
    return line;
  });

  let discount = 0n;
  if (draft.discount) {
    discount =
      draft.discount.kind === "percent"
        ? divRoundHalfUp(subtotal * parsePercent(draft.discount.value), 10_000n)
        : parseMoney(draft.discount.value, currency);
    if (discount > subtotal) throw new MoneyError("Discount exceeds subtotal");
  }
  const taxable = subtotal - discount;
  const tax = draft.taxPercent
    ? divRoundHalfUp(taxable * parsePercent(draft.taxPercent), 10_000n)
    : 0n;
  const fmt = (v: bigint) => formatMoney(v, currency);
  return {
    currency,
    lineTotals: lineTotals.map(fmt),
    subtotal: fmt(subtotal),
    discount: fmt(discount),
    tax: fmt(tax),
    total: fmt(taxable + tax),
  };
}

/**
 * Per-currency grouping. Totals in different currencies are NEVER combined; the result is a
 * map keyed by currency code, each value summed only within that currency.
 */
export function sumByCurrency(
  entries: ReadonlyArray<{ currency: CurrencyCode; total: string }>,
): Partial<Record<CurrencyCode, string>> {
  const acc: Partial<Record<CurrencyCode, bigint>> = {};
  for (const e of entries) {
    acc[e.currency] = (acc[e.currency] ?? 0n) + parseMoney(e.total, e.currency);
  }
  const out: Partial<Record<CurrencyCode, string>> = {};
  for (const code of CURRENCY_CODES) {
    const v = acc[code];
    if (v !== undefined) out[code] = formatMoney(v, code);
  }
  return out;
}

export type ParseOutcome =
  | { status: "draft"; draft: InvoiceDraft; totals: CalculatedTotals }
  | { status: "needs_clarification"; questions: ClarificationRequest[] }
  | { status: "invalid"; errors: ValidationErrorItem[] }
  | { status: "unavailable"; fallback: "manual_entry"; reason: string };
