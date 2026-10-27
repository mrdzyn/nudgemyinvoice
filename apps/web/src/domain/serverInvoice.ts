/**
 * Strict runtime validation of server-authored invoice drafts and totals, shared by every transport
 * that receives them (parse, save, detail). The server is the authority, but the browser trust
 * boundary still fails closed: exact keys, bounded text, supported currency, decimal-string amounts,
 * real calendar dates and totals that equal an exact BigInt recomputation (no floating point).
 */
import { isValidIsoDate } from "./invoiceForm.js";
import { estimateTotals, MoneyError } from "./money.js";
import { CURRENCY_CODES, type CurrencyCode, type InvoiceDraft, type Totals } from "./types.js";

export const MAX_LINES = 50;
export const MAX_TEXT = 200;
export const MAX_MESSAGE = 300;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** True when the object has exactly the listed keys (the server schemas are strict). */
export const exactKeys = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => k in o);

const DECIMAL = /^\d{1,12}(\.\d+)?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasControl = (v: string) =>
  Array.from(v).some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

export const text = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v.length >= min && v.length <= max && !hasControl(v);

function isCurrency(v: unknown): v is CurrencyCode {
  return typeof v === "string" && (CURRENCY_CODES as readonly string[]).includes(v);
}

export function parseDraft(v: unknown): InvoiceDraft | null {
  if (!isRecord(v)) return null;
  if (
    !exactKeys(v, [
      "customerName",
      "customerEmail",
      "currency",
      "lineItems",
      "dueDate",
      "taxPercent",
      "discount",
    ])
  )
    return null;
  const { customerName, customerEmail, currency, lineItems, dueDate, taxPercent, discount } = v;
  if (!text(customerName, 1, MAX_TEXT)) return null;
  if (!text(customerEmail, 3, 254) || !EMAIL.test(customerEmail)) return null;
  if (!isCurrency(currency)) return null;
  if (!Array.isArray(lineItems) || lineItems.length < 1 || lineItems.length > MAX_LINES)
    return null;
  const lines: InvoiceDraft["lineItems"] = [];
  for (const l of lineItems) {
    if (!isRecord(l) || !exactKeys(l, ["description", "quantity", "unitPrice"])) return null;
    const { description, quantity, unitPrice } = l;
    if (!text(description, 1, MAX_TEXT)) return null;
    if (typeof quantity !== "string" || !DECIMAL.test(quantity)) return null;
    if (typeof unitPrice !== "string" || !DECIMAL.test(unitPrice)) return null;
    lines.push({ description, quantity, unitPrice });
  }
  if (typeof dueDate !== "string" || !isValidIsoDate(dueDate)) return null;
  if (taxPercent !== null && (typeof taxPercent !== "string" || !DECIMAL.test(taxPercent)))
    return null;
  let disc: InvoiceDraft["discount"] = null;
  if (discount !== null) {
    if (!isRecord(discount) || !exactKeys(discount, ["kind", "value"])) return null;
    if (discount["kind"] !== "percent" && discount["kind"] !== "amount") return null;
    if (typeof discount["value"] !== "string" || !DECIMAL.test(discount["value"])) return null;
    disc = { kind: discount["kind"], value: discount["value"] };
  }
  return {
    customerName,
    customerEmail,
    currency,
    lineItems: lines,
    dueDate,
    taxPercent: taxPercent as string | null,
    discount: disc,
  };
}

/**
 * Consistency gate, not an alternative calculation: the returned figures must equal, as exact
 * canonical strings, what the existing BigInt money utilities (a mirror of the server's
 * integer-minor-unit arithmetic) derive from the validated draft. A draft the money rules would
 * refuse (zero quantity, over-precise amounts, percentages over 100, a discount above the subtotal)
 * has no consistent totals, so it is rejected here before it can reach Review.
 */
export function parseTotals(v: unknown, draft: InvoiceDraft): Totals | null {
  if (
    !isRecord(v) ||
    !exactKeys(v, ["currency", "lineTotals", "subtotal", "discount", "tax", "total"])
  )
    return null;
  // One invoice, one currency: totals must be in the draft's own currency, never converted.
  if (v["currency"] !== draft.currency) return null;
  let expected: Totals;
  try {
    expected = estimateTotals(draft);
  } catch (e) {
    if (e instanceof MoneyError) return null;
    throw e;
  }
  const lineTotals = v["lineTotals"];
  if (!Array.isArray(lineTotals) || lineTotals.length !== expected.lineTotals.length) return null;
  if (!lineTotals.every((t, i) => t === expected.lineTotals[i])) return null;
  for (const k of ["subtotal", "discount", "tax", "total"] as const)
    if (v[k] !== expected[k]) return null;
  return {
    currency: draft.currency,
    lineTotals: [...expected.lineTotals],
    subtotal: expected.subtotal,
    discount: expected.discount,
    tax: expected.tax,
    total: expected.total,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const PAYPAL_ID = /^[A-Za-z0-9-]{1,64}$/;
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,80}$/;
const PAYPAL_STATES = ["none", "pending", "creating", "created", "unknown", "rejected", "mismatch"];

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Read-only PayPal operation state as reported by `GET /api/invoice-drafts/:id`. */
export interface ServerPayPalState {
  state: "none" | "pending" | "creating" | "created" | "unknown" | "rejected" | "mismatch";
  paypalInvoiceId: string | null;
  lastErrorCode: string | null;
}

/** A persisted record exactly as the server returned it. Authoritative; never rebuilt locally. */
export interface ServerInvoice {
  id: string;
  draft: InvoiceDraft;
  totals: Totals;
  paypalInvoiceId: string | null;
  replayed: boolean;
  createdAt: string;
  /** Present on the detail response only. */
  paypal: ServerPayPalState | null;
}

function parsePayPal(v: unknown): ServerPayPalState | null {
  if (!isRecord(v) || !exactKeys(v, ["state", "paypalInvoiceId", "lastErrorCode"])) return null;
  const { state, paypalInvoiceId, lastErrorCode } = v;
  if (typeof state !== "string" || !PAYPAL_STATES.includes(state)) return null;
  if (
    paypalInvoiceId !== null &&
    (typeof paypalInvoiceId !== "string" || !PAYPAL_ID.test(paypalInvoiceId))
  )
    return null;
  if (
    lastErrorCode !== null &&
    (typeof lastErrorCode !== "string" || !ERROR_CODE.test(lastErrorCode))
  )
    return null;
  return {
    state: state as ServerPayPalState["state"],
    paypalInvoiceId: paypalInvoiceId as string | null,
    lastErrorCode: lastErrorCode as string | null,
  };
}

/**
 * Validates a save (201/200) or detail (200) body. `detail` selects the exact key set: the detail
 * response additionally carries the `paypal` object. Anything else returns null (fail closed).
 */
export function parseServerInvoice(body: unknown, detail: boolean): ServerInvoice | null {
  if (!isRecord(body)) return null;
  const base = ["id", "draft", "totals", "paypalInvoiceId", "replayed", "createdAt"];
  if (!exactKeys(body, detail ? [...base, "paypal"] : base)) return null;
  if (!isUuid(body["id"])) return null;
  const draft = parseDraft(body["draft"]);
  if (!draft) return null;
  const totals = parseTotals(body["totals"], draft);
  if (!totals) return null;
  const pid = body["paypalInvoiceId"];
  if (pid !== null && (typeof pid !== "string" || !PAYPAL_ID.test(pid))) return null;
  if (typeof body["replayed"] !== "boolean") return null;
  const createdAt = body["createdAt"];
  if (
    typeof createdAt !== "string" ||
    !ISO_INSTANT.test(createdAt) ||
    !Number.isFinite(Date.parse(createdAt))
  )
    return null;
  let paypal: ServerPayPalState | null = null;
  if (detail) {
    paypal = parsePayPal(body["paypal"]);
    if (!paypal) return null;
  }
  return {
    id: body["id"],
    draft,
    totals,
    paypalInvoiceId: pid,
    replayed: body["replayed"],
    createdAt,
    paypal,
  };
}
