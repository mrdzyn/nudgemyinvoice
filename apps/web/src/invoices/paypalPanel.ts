import type { MappingRefusalReason, PayPalDraftResult } from "./api.js";
import type { ServerInvoice, ServerPayPalState } from "../domain/serverInvoice.js";

export type DurableState = ServerPayPalState["state"];

export interface PanelUi {
  phase: "idle" | "confirming" | "creating" | "checking";
  /** The last POST answer, shown as a notice. The durable state from GET detail stays the authority. */
  outcome: PayPalDraftResult | null;
  /** The server said drafting is switched off: no further POST is offered in this view. */
  disabledSeen: boolean;
  /**
   * A POST completed (whatever its answer) and the durable state has not been re-read AFTER it.
   * While the saved invoice is not the one that re-read produced, creating is NOT offered: the
   * `invoice` prop may still describe the state from before the POST.
   */
  unverified: boolean;
  /**
   * The answer proves creating again is pointless or unsafe from this view (mapping refused, drafting
   * disabled, not found, forbidden, refused request). Never lifted by a re-read.
   */
  locked: boolean;
  /** Counts confirmations. A read-back belongs to exactly one of them; a stale one is ignored. */
  seq: number;
  /** The exact invoice object the last successful authoritative re-read produced. */
  verifiedWith: ServerInvoice | null;
  /** The last re-read failed or contradicted the POST answer (the state shown may be stale). */
  readFailed: boolean;
}

export const initialPanel: PanelUi = {
  phase: "idle",
  outcome: null,
  disabledSeen: false,
  unverified: false,
  locked: false,
  seq: 0,
  verifiedWith: null,
  readFailed: false,
};

export type PanelAction =
  /** Carries the invoice currently shown, so eligibility is judged against what the operator sees. */
  | { type: "open-confirm"; invoice: ServerInvoice }
  | { type: "cancel-confirm" }
  | { type: "confirm" }
  | { type: "result"; result: PayPalDraftResult }
  | { type: "check-start" }
  | { type: "check-done"; ok: boolean; invoice?: ServerInvoice }
  /** Automatic read-only re-read after a POST answer, tagged with the confirmation it belongs to. */
  | { type: "readback"; ok: boolean; seq: number; invoice?: ServerInvoice };

/** Answers after which creating again from this view is never offered, whatever a re-read says. */
const LOCKING: ReadonlySet<PayPalDraftResult["kind"]> = new Set([
  "mapping-refused",
  "disabled",
  "not-found",
  "forbidden",
  "bad-request",
]);

/**
 * Does the re-read agree with the POST answer? A `created` answer must be matched by a durable
 * `created` state carrying the same PayPal id; anything else is not accepted as verification.
 */
function agrees(outcome: PayPalDraftResult | null, invoice: ServerInvoice): boolean {
  if (outcome?.kind !== "created") return true;
  const pp = invoice.paypal;
  return pp?.state === "created" && pp.paypalInvoiceId === outcome.paypalInvoiceId;
}

/** Pure panel state. Nothing here issues a request: the component does, once, from `confirm`. */
export function panelReducer(s: PanelUi, a: PanelAction): PanelUi {
  switch (a.type) {
    case "open-confirm":
      // Same rule as the button: only from an eligible durable state that has been (re-)read.
      return canOfferCreate(a.invoice, s) ? { ...s, phase: "confirming" } : s;
    case "cancel-confirm":
      return s.phase === "confirming" ? { ...s, phase: "idle" } : s;
    case "confirm":
      // The only transition that leads to a POST, and only from the open confirmation dialog.
      return s.phase === "confirming"
        ? {
            ...s,
            phase: "creating",
            outcome: null,
            seq: s.seq + 1,
            verifiedWith: null,
            readFailed: false,
          }
        : s;
    case "result": {
      if (s.phase !== "creating") return s;
      const r = a.result;
      return {
        ...s,
        phase: "idle",
        outcome: r,
        disabledSeen: s.disabledSeen || r.kind === "disabled",
        locked: s.locked || LOCKING.has(r.kind),
        // EVERY answer fails closed until the authoritative re-read after it has landed.
        unverified: true,
        verifiedWith: null,
        readFailed: false,
      };
    }
    case "readback": {
      // Stale (an earlier confirmation) or while a newer POST is in flight: must not touch the guard.
      if (a.seq !== s.seq || s.phase === "creating") return s;
      if (!a.ok || !a.invoice || !agrees(s.outcome, a.invoice))
        return { ...s, readFailed: true, verifiedWith: null };
      return { ...s, readFailed: false, verifiedWith: a.invoice };
    }
    case "check-start":
      return s.phase === "idle" ? { ...s, phase: "checking" } : s;
    case "check-done": {
      if (s.phase !== "checking") return s;
      if (!a.ok || !a.invoice || !agrees(s.outcome, a.invoice))
        return { ...s, phase: "idle", readFailed: true, verifiedWith: null };
      return { ...s, phase: "idle", readFailed: false, verifiedWith: a.invoice };
    }
  }
}

/** True while a POST answer has not been confirmed by a re-read that produced THIS invoice object. */
export function awaitingReadback(ui: PanelUi, invoice: ServerInvoice): boolean {
  return ui.unverified && ui.verifiedWith !== invoice;
}

/**
 * Create/retry is offered only from states where a new explicit attempt is safe and meaningful, and
 * only when the durable state shown is the one the last authoritative re-read produced.
 */
export function canOfferCreate(invoice: ServerInvoice, ui: PanelUi): boolean {
  if (ui.disabledSeen || ui.locked || ui.phase !== "idle") return false;
  if (awaitingReadback(ui, invoice)) return false;
  const durable = invoice.paypal?.state ?? "none";
  return durable === "none" || durable === "rejected" || durable === "unknown";
}

export const REFUSAL_COPY: Record<MappingRefusalReason, string> = {
  rounding_required_line:
    "A line total (quantity × unit price) is not an exact number of minor units.",
  rounding_required_tax: "The tax amount is not an exact number of minor units.",
  rounding_required_discount: "The percent discount is not an exact number of minor units.",
  tax_with_discount_multiline:
    "Tax combined with a discount is only supported on single-line invoices.",
  due_date_past: "The due date is in the past.",
  invalid_invoice_date: "The invoice date could not be determined.",
};
