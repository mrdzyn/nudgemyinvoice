/** Shapes mirror the implemented API (packages/shared invoiceDraftSchema and GET /api/invoice-drafts/:id). */
export const CURRENCY_CODES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface Discount {
  kind: "percent" | "amount";
  value: string;
}

export interface InvoiceDraft {
  customerName: string;
  customerEmail: string;
  currency: CurrencyCode;
  lineItems: LineItem[];
  dueDate: string;
  taxPercent: string | null;
  discount: Discount | null;
}

export interface Totals {
  currency: CurrencyCode;
  lineTotals: string[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

/** Operation states returned by GET /api/invoice-drafts/:id. */
export type PayPalOperationState =
  "none" | "pending" | "creating" | "created" | "unknown" | "rejected" | "mismatch";

/** Presentation states: the operation states plus outcomes only seen in POST responses. */
export type PayPalViewState = PayPalOperationState | "reconciling" | "refused";

export interface PayPalInfo {
  state: PayPalOperationState;
  paypalInvoiceId: string | null;
  lastErrorCode: string | null;
}

export interface SavedInvoice {
  id: string;
  draft: InvoiceDraft;
  totals: Totals;
  paypalInvoiceId: string | null;
  paypal: PayPalInfo;
  createdAt: string;
  /** True for drafts created inside this preview: the "server" response is simulated. */
  simulated?: boolean;
}

export type ParseOutcome =
  | { status: "draft"; draft: InvoiceDraft; totals: Totals }
  | { status: "needs_clarification"; questions: { field: string; question: string }[] }
  | { status: "invalid"; errors: { path: string; message: string }[] }
  | { status: "unavailable"; fallback: "manual_entry"; reason: string };

export interface ParseScenario {
  id: string;
  label: string;
  currency: CurrencyCode | null;
  text: string;
  outcome: ParseOutcome;
  afterClarification?: ParseOutcome;
}

export type RefusalReason =
  | "rounding_required_line"
  | "rounding_required_tax"
  | "rounding_required_discount"
  | "tax_with_discount_multiline"
  | "due_date_past";
