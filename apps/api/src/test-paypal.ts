import {
  PayPalOutcomeUnknownError,
  type PayPalInvoiceRequest,
  type PayPalInvoicingReadDraft,
  type RemoteInvoice,
} from "@nmi/paypal";
import {
  formatMoney,
  parseMoney,
  parsePercent,
  parseQuantity,
  type CurrencyCode,
} from "@nmi/shared";

/** Independent, exact computation of what an honest PayPal would report as the invoice total. */
export function honestTotal(body: PayPalInvoiceRequest): string {
  const c = body.detail.currency_code as CurrencyCode;
  const lines = body.items.map(
    (i) => (parseMoney(i.unit_amount.value, c) * parseQuantity(i.quantity)) / 100n,
  );
  const subtotal = lines.reduce((a, b) => a + b, 0n);
  let discount = 0n;
  const inv = body.amount?.breakdown.discount.invoice_discount;
  if (inv) {
    discount =
      "percent" in inv
        ? (subtotal * parsePercent(inv.percent)) / 10_000n
        : parseMoney(inv.amount.value, c);
  }
  let tax = 0n;
  body.items.forEach((item, idx) => {
    if (item.tax) {
      const base =
        body.items.length === 1 ? (lines[idx] as bigint) - discount : (lines[idx] as bigint);
      tax += (base * parsePercent(item.tax.percent)) / 10_000n;
    }
  });
  return formatMoney(subtotal - discount + tax, c);
}

export interface FakePayPal {
  client: PayPalInvoicingReadDraft;
  remotes: Map<string, RemoteInvoice>;
  log: {
    create: Array<{ body: PayPalInvoiceRequest; requestId: string }>;
    get: string[];
    find: string[];
  };
  /** Replace behavior per test. */
  on: {
    create?:
      | undefined
      | ((input: {
          body: PayPalInvoiceRequest;
          requestId: string;
        }) => Promise<{ paypalInvoiceId: string }>);
    get?: (id: string) => Promise<RemoteInvoice | null>;
    find?: (invoiceNumber: string) => Promise<string[]>;
  };
  /** Records a remote invoice exactly as PayPal would for this request, and returns its id. */
  materialize(body: PayPalInvoiceRequest, over?: Partial<RemoteInvoice>): string;
}

// Process-wide so remote ids never repeat across fake instances (PayPal ids are unique too).
let globalSeq = 0;

export function fakePayPal(): FakePayPal {
  const remotes = new Map<string, RemoteInvoice>();
  const log: FakePayPal["log"] = { create: [], get: [], find: [] };
  const f: FakePayPal = {
    remotes,
    log,
    on: {},
    materialize(body, over = {}) {
      const id = `INV2-FAKE-${++globalSeq}`;
      remotes.set(id, {
        paypalInvoiceId: id,
        status: "DRAFT",
        currency: body.detail.currency_code as CurrencyCode,
        total: honestTotal(body),
        dueDate: body.detail.payment_term.due_date,
        invoiceNumber: body.detail.invoice_number,
        reference: body.detail.reference,
        ...over,
      });
      return id;
    },
    client: {
      async createDraftInvoice(input) {
        log.create.push(input);
        if (f.on.create) return f.on.create(input);
        return { paypalInvoiceId: f.materialize(input.body) };
      },
      async getInvoice(id) {
        log.get.push(id);
        if (f.on.get) return f.on.get(id);
        return remotes.get(id) ?? null;
      },
      async findInvoiceIdsByNumber(n) {
        log.find.push(n);
        if (f.on.find) return f.on.find(n);
        return [...remotes.values()]
          .filter((r) => r.invoiceNumber === n)
          .map((r) => r.paypalInvoiceId);
      },
    },
  };
  return f;
}

export const timeout = () => Promise.reject(new PayPalOutcomeUnknownError("timeout"));
