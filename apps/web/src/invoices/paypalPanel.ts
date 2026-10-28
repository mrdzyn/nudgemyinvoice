import type { MappingRefusalReason, PayPalDraftResult } from "./api.js";
import type { ServerPayPalState } from "../domain/serverInvoice.js";

export type DurableState = ServerPayPalState["state"];

export interface PanelUi {
  phase: "idle" | "confirming" | "creating" | "checking";
  /** The last POST answer, shown as a notice. The durable state from GET detail stays the authority. */
  outcome: PayPalDraftResult | null;
  /** The server said drafting is switched off: no further POST is offered in this view. */
  disabledSeen: boolean;
  /**
   * An uncertain outcome (or an unresolved one) happened and the durable state has not been re-read
   * since. While true, creating is NOT offered: the operator must read the state first.
   */
  unverified: boolean;
  /** The last read-only refresh failed (the durable state shown may be stale). */
  readFailed: boolean;
}

export const initialPanel: PanelUi = {
  phase: "idle",
  outcome: null,
  disabledSeen: false,
  unverified: false,
  readFailed: false,
};

export type PanelAction =
  | { type: "open-confirm" }
  | { type: "cancel-confirm" }
  | { type: "confirm" }
  | { type: "result"; result: PayPalDraftResult }
  | { type: "check-start" }
  | { type: "check-done"; ok: boolean }
  /** Automatic read-only re-read after a POST answer. */
  | { type: "readback"; ok: boolean };

/** Outcomes after which the server-side state is not known to the browser until it is re-read. */
const UNVERIFIED: ReadonlySet<PayPalDraftResult["kind"]> = new Set([
  "uncertain",
  "paypal-unknown",
  "in-progress",
  "reconciliation-pending",
  "unavailable",
]);

/** Pure panel state. Nothing here issues a request: the component does, once, from `confirm`. */
export function panelReducer(s: PanelUi, a: PanelAction): PanelUi {
  switch (a.type) {
    case "open-confirm":
      return s.phase === "idle" && !s.disabledSeen && !s.unverified
        ? { ...s, phase: "confirming" }
        : s;
    case "cancel-confirm":
      return s.phase === "confirming" ? { ...s, phase: "idle" } : s;
    case "confirm":
      // The only transition that leads to a POST, and only from the open confirmation dialog.
      return s.phase === "confirming" ? { ...s, phase: "creating", outcome: null } : s;
    case "result": {
      if (s.phase !== "creating") return s;
      const r = a.result;
      return {
        ...s,
        phase: "idle",
        outcome: r,
        disabledSeen: s.disabledSeen || r.kind === "disabled",
        unverified: UNVERIFIED.has(r.kind) ? true : s.unverified,
        readFailed: false,
      };
    }
    case "readback":
      // Never applies while a new POST is in flight (that answer will trigger its own read-back).
      return s.phase === "creating"
        ? s
        : { ...s, unverified: a.ok ? false : s.unverified, readFailed: !a.ok };
    case "check-start":
      return s.phase === "idle" ? { ...s, phase: "checking" } : s;
    case "check-done":
      return s.phase === "checking"
        ? { ...s, phase: "idle", unverified: a.ok ? false : s.unverified, readFailed: !a.ok }
        : s;
  }
}

/** Create/retry is offered only from states where a new explicit attempt is safe and meaningful. */
export function canOfferCreate(durable: DurableState, ui: PanelUi): boolean {
  if (ui.disabledSeen || ui.unverified || ui.phase !== "idle") return false;
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
