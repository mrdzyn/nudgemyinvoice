/**
 * Typed same-origin transport for `POST /api/invoice-drafts/parse`, the only invoice route the web
 * app may call in C2. The 200 body is UNTRUSTED: it is validated field by field and anything that
 * is not exactly one of the four documented outcomes fails closed (`malformed`) without reaching
 * the review form. The CSRF token is passed per call from volatile React memory and never stored.
 */
import { isValidIsoDate } from "../domain/invoiceForm.js";
import { estimateTotals, MoneyError } from "../domain/money.js";
import {
  CURRENCY_CODES,
  type CurrencyCode,
  type InvoiceDraft,
  type ParseOutcome,
  type Totals,
} from "../domain/types.js";
import type { FetchLike } from "../auth/api.js";

export const MAX_QUESTIONS = 10;
export const MAX_ERRORS = 20;
const MAX_LINES = 50;
const MAX_TEXT = 200;
const MAX_MESSAGE = 300;

export type ParseResult =
  | { kind: "outcome"; outcome: ParseOutcome }
  | { kind: "rejected"; messages: string[] } // 400: the request body was refused
  | { kind: "unauthorized" } // 401: session is gone
  | { kind: "forbidden" } // 403: Origin or CSRF refused
  | { kind: "throttled"; retryAfterSeconds: number | null } // 429
  | { kind: "unavailable" } // 503 and other server errors
  | { kind: "malformed" } // 200 with a body that is not a documented outcome
  | { kind: "offline" } // network failure
  | { kind: "aborted" };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** True when the object has exactly the listed keys (the server schemas are strict). */
const exactKeys = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => k in o);

const DECIMAL = /^\d{1,12}(\.\d+)?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasControl = (v: string) =>
  Array.from(v).some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

const text = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v.length >= min && v.length <= max && !hasControl(v);

function isCurrency(v: unknown): v is CurrencyCode {
  return typeof v === "string" && (CURRENCY_CODES as readonly string[]).includes(v);
}

function parseDraft(v: unknown): InvoiceDraft | null {
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
function parseTotals(v: unknown, draft: InvoiceDraft): Totals | null {
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

const FIELDS = ["customerName", "customerEmail", "currency", "lineItems", "dueDate", "other"];

/** Validates the HTTP 200 body. Returns null for anything that is not exactly a documented outcome. */
export function validateParseOutcome(body: unknown): ParseOutcome | null {
  if (!isRecord(body)) return null;
  switch (body["status"]) {
    case "draft": {
      if (!exactKeys(body, ["status", "draft", "totals"])) return null;
      const draft = parseDraft(body["draft"]);
      if (!draft) return null;
      const totals = parseTotals(body["totals"], draft);
      return totals ? { status: "draft", draft, totals } : null;
    }
    case "needs_clarification": {
      if (!exactKeys(body, ["status", "questions"])) return null;
      const qs = body["questions"];
      if (!Array.isArray(qs) || qs.length < 1 || qs.length > MAX_QUESTIONS) return null;
      const questions: { field: string; question: string }[] = [];
      for (const q of qs) {
        if (!isRecord(q) || !exactKeys(q, ["field", "question"])) return null;
        if (typeof q["field"] !== "string" || !FIELDS.includes(q["field"])) return null;
        if (!text(q["question"], 1, MAX_MESSAGE)) return null;
        questions.push({ field: q["field"], question: q["question"] });
      }
      return { status: "needs_clarification", questions };
    }
    case "invalid": {
      if (!exactKeys(body, ["status", "errors"])) return null;
      const es = body["errors"];
      if (!Array.isArray(es) || es.length < 1 || es.length > MAX_ERRORS) return null;
      const errors: { path: string; message: string }[] = [];
      for (const e of es) {
        if (!isRecord(e) || !exactKeys(e, ["path", "message"])) return null;
        if (typeof e["path"] !== "string" || e["path"].length > 120) return null;
        if (!text(e["message"], 1, MAX_MESSAGE)) return null;
        errors.push({ path: e["path"], message: e["message"] });
      }
      return { status: "invalid", errors };
    }
    case "unavailable": {
      if (!exactKeys(body, ["status", "fallback", "reason"])) return null;
      if (body["fallback"] !== "manual_entry") return null;
      if (typeof body["reason"] !== "string" || !/^[a-z_]{1,60}$/.test(body["reason"])) return null;
      return { status: "unavailable", fallback: "manual_entry", reason: body["reason"] };
    }
    default:
      return null;
  }
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (raw === null || !/^\d{1,5}$/.test(raw.trim())) return null;
  return Number(raw);
}

/** 400 issues are server-authored; keep only short printable messages, never the raw JSON. */
function rejectedMessages(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body["issues"])) return [];
  const out: string[] = [];
  for (const i of body["issues"].slice(0, MAX_ERRORS)) {
    if (isRecord(i) && text(i["message"], 1, MAX_MESSAGE)) out.push(i["message"]);
  }
  return out;
}

export interface ParseApi {
  parse(description: string, csrfToken: string, signal: AbortSignal): Promise<ParseResult>;
}

export function createParseApi(doFetch: FetchLike = (input, init) => fetch(input, init)): ParseApi {
  return {
    async parse(description, csrfToken, signal) {
      let res: Response;
      try {
        res = await doFetch("/api/invoice-drafts/parse", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ text: description }),
          signal,
        });
      } catch {
        return signal.aborted ? { kind: "aborted" } : { kind: "offline" };
      }
      switch (res.status) {
        case 200:
          try {
            const outcome = validateParseOutcome(await res.json());
            return outcome ? { kind: "outcome", outcome } : { kind: "malformed" };
          } catch {
            return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
          }
        case 400: {
          let messages: string[] = [];
          try {
            messages = rejectedMessages(await res.json());
          } catch {
            /* an unreadable 400 body still means "rejected" */
          }
          return { kind: "rejected", messages };
        }
        case 401:
          return { kind: "unauthorized" };
        case 403:
          return { kind: "forbidden" };
        case 429:
          return { kind: "throttled", retryAfterSeconds: retryAfter(res) };
        default:
          return { kind: "unavailable" };
      }
    },
  };
}
