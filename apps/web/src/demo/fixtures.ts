import raw from "../../../../design/fixtures/invoice-fixtures.json";
import type {
  InvoiceDraft,
  ParseOutcome,
  ParseScenario,
  SavedInvoice,
  Totals,
} from "../domain/types.js";
import { CURRENCY_CODES, type CurrencyCode } from "../domain/types.js";

/**
 * Synthetic design fixtures (single source of truth: design/fixtures/invoice-fixtures.json, whose
 * totals are verified against the real calculateTotals by design/fixtures/verify-fixtures.mjs and by
 * fixtures.test.ts). Every name, email, id and amount is fabricated.
 */
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string") throw new Error(`fixture ${what} must be a string`);
  return v;
};
const strOrNull = (v: unknown, what: string): string | null => (v === null ? null : str(v, what));
const rec = (v: unknown, what: string): Record<string, unknown> => {
  if (!isRecord(v)) throw new Error(`fixture ${what} must be an object`);
  return v;
};
const arr = (v: unknown, what: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`fixture ${what} must be an array`);
  return v;
};
const currency = (v: unknown): CurrencyCode => {
  const s = str(v, "currency");
  const found = CURRENCY_CODES.find((c) => c === s);
  if (!found) throw new Error(`fixture currency ${s} unsupported`);
  return found;
};

function toDraft(v: unknown): InvoiceDraft {
  const d = rec(v, "draft");
  const disc = d["discount"];
  let discount: InvoiceDraft["discount"] = null;
  if (disc !== null) {
    const o = rec(disc, "discount");
    const kind = str(o["kind"], "discount.kind");
    if (kind !== "percent" && kind !== "amount") throw new Error("fixture discount.kind invalid");
    discount = { kind, value: str(o["value"], "discount.value") };
  }
  return {
    customerName: str(d["customerName"], "customerName"),
    customerEmail: str(d["customerEmail"], "customerEmail"),
    currency: currency(d["currency"]),
    lineItems: arr(d["lineItems"], "lineItems").map((li) => {
      const o = rec(li, "lineItem");
      return {
        description: str(o["description"], "description"),
        quantity: str(o["quantity"], "quantity"),
        unitPrice: str(o["unitPrice"], "unitPrice"),
      };
    }),
    dueDate: str(d["dueDate"], "dueDate"),
    taxPercent: strOrNull(d["taxPercent"], "taxPercent"),
    discount,
  };
}

function toTotals(v: unknown): Totals {
  const t = rec(v, "totals");
  return {
    currency: currency(t["currency"]),
    lineTotals: arr(t["lineTotals"], "lineTotals").map((x) => str(x, "lineTotal")),
    subtotal: str(t["subtotal"], "subtotal"),
    discount: str(t["discount"], "discount"),
    tax: str(t["tax"], "tax"),
    total: str(t["total"], "total"),
  };
}

function toInvoice(v: unknown): SavedInvoice {
  const o = rec(v, "invoice");
  const pp = rec(o["paypal"], "paypal");
  const state = str(pp["state"], "paypal.state");
  const allowed = [
    "none",
    "pending",
    "creating",
    "created",
    "unknown",
    "rejected",
    "mismatch",
  ] as const;
  const found = allowed.find((s) => s === state);
  if (!found) throw new Error(`fixture paypal.state ${state} invalid`);
  return {
    id: str(o["id"], "id"),
    draft: toDraft(o["draft"]),
    totals: toTotals(o["totals"]),
    paypalInvoiceId: strOrNull(o["paypalInvoiceId"], "paypalInvoiceId"),
    paypal: {
      state: found,
      paypalInvoiceId: strOrNull(pp["paypalInvoiceId"], "paypal.paypalInvoiceId"),
      lastErrorCode: strOrNull(pp["lastErrorCode"], "paypal.lastErrorCode"),
    },
    createdAt: str(o["createdAt"], "createdAt"),
  };
}

function toOutcome(v: unknown): ParseOutcome {
  const o = rec(v, "outcome");
  const status = str(o["status"], "outcome.status");
  if (status === "draft")
    return { status, draft: toDraft(o["draft"]), totals: toTotals(o["totals"]) };
  if (status === "needs_clarification")
    return {
      status,
      questions: arr(o["questions"], "questions").map((q) => {
        const r = rec(q, "question");
        return { field: str(r["field"], "field"), question: str(r["question"], "question") };
      }),
    };
  if (status === "invalid")
    return {
      status,
      errors: arr(o["errors"], "errors").map((e) => {
        const r = rec(e, "error");
        return { path: str(r["path"], "path"), message: str(r["message"], "message") };
      }),
    };
  throw new Error(`fixture outcome ${status} unsupported`);
}

const file = rec(raw, "file");

export const FIXTURE_INVOICES: readonly SavedInvoice[] = arr(file["invoices"], "invoices").map(
  toInvoice,
);

export const PARSE_SCENARIOS: readonly ParseScenario[] = arr(
  file["parseScenarios"],
  "parseScenarios",
).map((v) => {
  const o = rec(v, "scenario");
  const cur = o["currency"];
  const after = o["afterClarification"];
  const base = {
    id: str(o["id"], "id"),
    label: str(o["label"], "label"),
    currency: cur === null ? null : currency(cur),
    text: str(o["text"], "text"),
    outcome: toOutcome(o["outcome"]),
  };
  return after === undefined ? base : { ...base, afterClarification: toOutcome(after) };
});

export function scenarioById(id: string): ParseScenario {
  const s = PARSE_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown parse scenario ${id}`);
  return s;
}

export function draftOf(outcome: ParseOutcome | undefined): InvoiceDraft {
  if (!outcome || outcome.status !== "draft") throw new Error("scenario outcome is not a draft");
  return outcome.draft;
}

/** Fixture ids used by the demo state selector. */
export const FIXTURE_IDS = {
  usdCreated: str(FIXTURE_INVOICES[0]?.id, "usd id"),
  eurNone: str(FIXTURE_INVOICES[1]?.id, "eur id"),
  jpyCreating: str(FIXTURE_INVOICES[2]?.id, "jpy id"),
  gbpRefused: str(FIXTURE_INVOICES[3]?.id, "gbp id"),
} as const;
