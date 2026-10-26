import { payloadDigest } from "@nmi/domain";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  isValidIsoDate,
  parseMoney,
  parsePercent,
  parseQuantity,
  type InvoiceDraft,
} from "@nmi/shared";

/** Why a draft cannot be mapped to PayPal with a PROVABLY identical payable total. */
export type MappingRefusal =
  | "rounding_required_line"
  | "rounding_required_tax"
  | "rounding_required_discount"
  | "tax_with_discount_multiline"
  | "due_date_past"
  | "invalid_invoice_date";

export class PayPalMappingError extends Error {
  constructor(public readonly reason: MappingRefusal) {
    super(`Cannot map invoice exactly: ${reason}`);
    this.name = "PayPalMappingError";
  }
}

/** "NMI-" + 20 hex chars of the local invoice id: deterministic, unique, within PayPal's 25-char limit. */
export function invoiceNumberFor(localInvoiceId: string): string {
  const hex = localInvoiceId.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error("local invoice id must be a UUID");
  return `NMI-${hex.slice(0, 20)}`;
}

/**
 * PayPal's rounding rules for tax and discounts are not something this project has verified, so any
 * draft whose total depends on rounding is REFUSED rather than risk a different payable amount.
 * What remains is provably identical under any rounding mode (every intermediate is an exact
 * number of minor units), and the remote total is additionally compared after creation.
 */
export function assertExactMapping(draft: InvoiceDraft, today: string): void {
  if (!isValidIsoDate(today)) throw new PayPalMappingError("invalid_invoice_date");
  if (draft.dueDate < today) throw new PayPalMappingError("due_date_past");
  const c = draft.currency;
  const lines = draft.lineItems.map((i) => {
    const product = parseMoney(i.unitPrice, c) * parseQuantity(i.quantity);
    if (product % 100n !== 0n) throw new PayPalMappingError("rounding_required_line");
    return product / 100n;
  });
  const subtotal = lines.reduce((a, b) => a + b, 0n);
  const taxBps = draft.taxPercent === null ? null : parsePercent(draft.taxPercent);
  const d = draft.discount;

  if (taxBps !== null && d !== null) {
    if (lines.length !== 1) throw new PayPalMappingError("tax_with_discount_multiline");
    const discount =
      d.kind === "percent"
        ? exactShare(subtotal, parsePercent(d.value), "rounding_required_discount")
        : parseMoney(d.value, c);
    exactShare(subtotal - discount, taxBps, "rounding_required_tax");
  } else if (taxBps !== null) {
    for (const l of lines) exactShare(l, taxBps, "rounding_required_tax");
  } else if (d !== null && d.kind === "percent") {
    exactShare(subtotal, parsePercent(d.value), "rounding_required_discount");
  }
}

function exactShare(base: bigint, bps: bigint, refusal: MappingRefusal): bigint {
  const product = base * bps;
  if (product % 10_000n !== 0n) throw new PayPalMappingError(refusal);
  return product / 10_000n;
}

export interface PayPalInvoiceRequest {
  detail: {
    currency_code: string;
    invoice_number: string;
    reference: string;
    invoice_date: string;
    payment_term: { term_type: "DUE_ON_DATE_SPECIFIED"; due_date: string };
  };
  primary_recipients: Array<{
    billing_info: { name: { full_name: string }; email_address: string };
  }>;
  items: Array<{
    name: string;
    quantity: string;
    unit_amount: { currency_code: string; value: string };
    unit_of_measure: "QUANTITY";
    tax?: { name: string; percent: string };
  }>;
  configuration: {
    tax_calculated_after_discount: true;
    tax_inclusive: false;
    allow_tip: false;
  };
  amount?: {
    breakdown: {
      discount: {
        invoice_discount:
          { percent: string } | { amount: { currency_code: string; value: string } };
      };
    };
  };
}

/** Builds the create-draft body. Call {@link assertExactMapping} first; this never rounds. */
export function buildInvoiceRequest(
  draft: InvoiceDraft,
  ctx: { localInvoiceId: string; invoiceDate: string },
): PayPalInvoiceRequest {
  const c = draft.currency;
  const tax =
    draft.taxPercent === null
      ? undefined
      : { name: "Tax", percent: formatPercent(parsePercent(draft.taxPercent)) };
  const body: PayPalInvoiceRequest = {
    detail: {
      currency_code: c,
      invoice_number: invoiceNumberFor(ctx.localInvoiceId),
      reference: ctx.localInvoiceId,
      invoice_date: ctx.invoiceDate,
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: draft.dueDate },
    },
    primary_recipients: [
      {
        billing_info: {
          name: { full_name: draft.customerName },
          email_address: draft.customerEmail,
        },
      },
    ],
    items: draft.lineItems.map((i) => ({
      name: i.description,
      quantity: formatQuantity(parseQuantity(i.quantity)),
      unit_amount: { currency_code: c, value: formatMoney(parseMoney(i.unitPrice, c), c) },
      unit_of_measure: "QUANTITY" as const,
      ...(tax ? { tax } : {}),
    })),
    configuration: { tax_calculated_after_discount: true, tax_inclusive: false, allow_tip: false },
  };
  if (draft.discount) {
    body.amount = {
      breakdown: {
        discount: {
          invoice_discount:
            draft.discount.kind === "percent"
              ? { percent: formatPercent(parsePercent(draft.discount.value)) }
              : {
                  amount: {
                    currency_code: c,
                    value: formatMoney(parseMoney(draft.discount.value, c), c),
                  },
                },
        },
      },
    };
  }
  return body;
}

/**
 * Digest of the request body recorded with the durable intent. `invoice_date` is excluded so a retry
 * on a later day (which legitimately carries a new invoice date) still describes the same intent.
 */
export function requestDigest(body: PayPalInvoiceRequest): string {
  return payloadDigest({ ...body, detail: { ...body.detail, invoice_date: undefined } });
}
