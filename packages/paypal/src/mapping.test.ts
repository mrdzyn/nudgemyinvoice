import { describe, expect, it } from "vitest";
import { calculateTotals, type InvoiceDraft } from "@nmi/shared";
import {
  PayPalMappingError,
  assertExactMapping,
  buildInvoiceRequest,
  invoiceNumberFor,
  requestDigest,
} from "./mapping.js";

const ID = "3f2b8c1e-9d4a-4b6e-8a1c-0123456789ab";
const TODAY = "2026-10-25";
const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concept", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-11-30",
  taxPercent: null,
  discount: null,
  ...over,
});
const refusal = (d: InvoiceDraft) => {
  try {
    assertExactMapping(d, TODAY);
    return null;
  } catch (e) {
    return e instanceof PayPalMappingError ? e.reason : "other";
  }
};

describe("invoice number", () => {
  it("is deterministic, within PayPal's limit, and rejects non-UUIDs", () => {
    expect(invoiceNumberFor(ID)).toBe("NMI-3f2b8c1e9d4a4b6e8a1c");
    expect(invoiceNumberFor(ID).length).toBeLessThanOrEqual(25);
    expect(invoiceNumberFor(ID.toUpperCase())).toBe(invoiceNumberFor(ID));
    expect(() => invoiceNumberFor("nope")).toThrow();
  });
});

describe("exact-mapping rules (refuse anything whose total depends on rounding)", () => {
  it("accepts plain integer, exactly-priced and fractional-but-exact lines", () => {
    expect(refusal(draft())).toBeNull();
    expect(
      refusal(draft({ lineItems: [{ description: "x", quantity: "1.5", unitPrice: "80.00" }] })),
    ).toBeNull(); // 120.00
    expect(
      refusal(
        draft({
          currency: "JPY",
          lineItems: [{ description: "x", quantity: "1", unitPrice: "15000" }],
        }),
      ),
    ).toBeNull();
  });
  it("refuses a line that needs rounding (qty x price has a sub-cent remainder)", () => {
    expect(
      refusal(draft({ lineItems: [{ description: "x", quantity: "0.33", unitPrice: "0.10" }] })),
    ).toBe("rounding_required_line");
    expect(
      refusal(draft({ lineItems: [{ description: "x", quantity: "1.5", unitPrice: "0.05" }] })),
    ).toBe("rounding_required_line");
  });
  it("accepts tax only when every line's tax is an exact number of minor units", () => {
    expect(refusal(draft({ taxPercent: "10" }))).toBeNull(); // 500.00 * 10% = 50.00
    expect(
      refusal(
        draft({
          taxPercent: "8.25",
          lineItems: [{ description: "x", quantity: "1", unitPrice: "100.00" }],
        }),
      ),
    ).toBeNull(); // 8.25
    expect(
      refusal(
        draft({
          taxPercent: "8.25",
          lineItems: [{ description: "x", quantity: "1", unitPrice: "10.01" }],
        }),
      ),
    ).toBe("rounding_required_tax");
    expect(
      refusal(
        draft({
          taxPercent: "19",
          lineItems: [{ description: "x", quantity: "3", unitPrice: "80.50" }],
          currency: "EUR",
        }),
      ),
    ).toBe("rounding_required_tax");
  });
  it("multi-line tax is accepted only if EACH line is exact", () => {
    const two = [
      { description: "a", quantity: "1", unitPrice: "100.00" },
      { description: "b", quantity: "1", unitPrice: "50.00" },
    ];
    expect(refusal(draft({ lineItems: two, taxPercent: "10" }))).toBeNull();
    const rough = [
      { description: "a", quantity: "1", unitPrice: "100.00" },
      { description: "b", quantity: "1", unitPrice: "0.05" },
    ];
    expect(refusal(draft({ lineItems: rough, taxPercent: "10" }))).toBe("rounding_required_tax");
  });
  it("percent discounts must be exact; fixed discounts always map", () => {
    expect(refusal(draft({ discount: { kind: "percent", value: "10" } }))).toBeNull();
    expect(
      refusal(
        draft({
          lineItems: [{ description: "x", quantity: "1", unitPrice: "0.05" }],
          discount: { kind: "percent", value: "10" },
        }),
      ),
    ).toBe("rounding_required_discount");
    expect(refusal(draft({ discount: { kind: "amount", value: "25.50" } }))).toBeNull();
  });
  it("tax together with a discount is accepted only for a single line, and only if both are exact", () => {
    expect(
      refusal(draft({ taxPercent: "10", discount: { kind: "percent", value: "10" } })),
    ).toBeNull(); // 500 -> 450 -> tax 45
    expect(
      refusal(draft({ taxPercent: "10", discount: { kind: "amount", value: "100.00" } })),
    ).toBeNull();
    const two = [
      { description: "a", quantity: "1", unitPrice: "100.00" },
      { description: "b", quantity: "1", unitPrice: "50.00" },
    ];
    expect(
      refusal(
        draft({ lineItems: two, taxPercent: "10", discount: { kind: "amount", value: "10.00" } }),
      ),
    ).toBe("tax_with_discount_multiline");
    expect(
      refusal(draft({ taxPercent: "8.25", discount: { kind: "amount", value: "0.01" } })),
    ).toBe("rounding_required_tax");
  });
  it("refuses a past due date and a malformed reference date", () => {
    expect(refusal(draft({ dueDate: "2026-10-24" }))).toBe("due_date_past");
    expect(refusal(draft({ dueDate: TODAY }))).toBeNull();
    expect(() => assertExactMapping(draft(), "2026-02-30")).toThrow(PayPalMappingError);
  });
  it("whenever mapping is accepted, our exact total needs no rounding mode at all (property check)", () => {
    for (const unit of ["1.00", "2.50", "99.99", "0.10"]) {
      for (const qty of ["1", "2", "3", "4", "10"]) {
        for (const tax of [null, "10", "20", "5"]) {
          const d = draft({
            lineItems: [{ description: "x", quantity: qty, unitPrice: unit }],
            taxPercent: tax,
          });
          if (refusal(d) === null) {
            const t = calculateTotals(d);
            const cents = (s: string) => BigInt(s.replace(".", ""));
            const line = cents(unit) * BigInt(qty);
            const expectedTax = tax === null ? 0n : (line * BigInt(tax)) / 100n;
            expect(cents(t.total)).toBe(line + expectedTax);
            if (tax !== null) expect((line * BigInt(tax)) % 100n).toBe(0n);
          }
        }
      }
    }
  });
});

describe("request body", () => {
  it("maps customer, item, due date, reference and number exactly, with no recipient notification fields", () => {
    const b = buildInvoiceRequest(draft(), { localInvoiceId: ID, invoiceDate: TODAY });
    expect(b).toEqual({
      detail: {
        currency_code: "USD",
        invoice_number: "NMI-3f2b8c1e9d4a4b6e8a1c",
        reference: ID,
        invoice_date: TODAY,
        payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: "2026-11-30" },
      },
      primary_recipients: [
        {
          billing_info: {
            name: { full_name: "Acme Design" },
            email_address: "billing@acme.example",
          },
        },
      ],
      items: [
        {
          name: "Logo concept",
          quantity: "2",
          unit_amount: { currency_code: "USD", value: "250.00" },
          unit_of_measure: "QUANTITY",
        },
      ],
      configuration: {
        tax_calculated_after_discount: true,
        tax_inclusive: false,
        allow_tip: false,
      },
    });
    expect(JSON.stringify(b)).not.toMatch(/send|notif|remind|invoicer/i);
  });
  it("uses currency scale for amounts (JPY has none), canonical quantities, tax per item and the invoice discount", () => {
    const jpy = buildInvoiceRequest(
      draft({
        currency: "JPY",
        lineItems: [{ description: "x", quantity: "1.50", unitPrice: "15000" }],
      }),
      { localInvoiceId: ID, invoiceDate: TODAY },
    );
    expect(jpy.items[0]).toMatchObject({
      quantity: "1.5",
      unit_amount: { currency_code: "JPY", value: "15000" },
    });
    const eur = buildInvoiceRequest(
      draft({ currency: "EUR", taxPercent: "8.25", discount: { kind: "percent", value: "10" } }),
      { localInvoiceId: ID, invoiceDate: TODAY },
    );
    expect(eur.items[0]?.tax).toEqual({ name: "Tax", percent: "8.25" });
    expect(eur.amount).toEqual({
      breakdown: { discount: { invoice_discount: { percent: "10" } } },
    });
    const fixed = buildInvoiceRequest(draft({ discount: { kind: "amount", value: "25.5" } }), {
      localInvoiceId: ID,
      invoiceDate: TODAY,
    });
    expect(fixed.amount).toEqual({
      breakdown: {
        discount: { invoice_discount: { amount: { currency_code: "USD", value: "25.50" } } },
      },
    });
  });
  it("the digest is stable and changes with any field", () => {
    const a = buildInvoiceRequest(draft(), { localInvoiceId: ID, invoiceDate: TODAY });
    expect(requestDigest(a)).toBe(
      requestDigest(buildInvoiceRequest(draft(), { localInvoiceId: ID, invoiceDate: TODAY })),
    );
    expect(requestDigest(a)).not.toBe(
      requestDigest(
        buildInvoiceRequest(draft({ customerName: "Other" }), {
          localInvoiceId: ID,
          invoiceDate: TODAY,
        }),
      ),
    );
    expect(requestDigest(a)).toMatch(/^[0-9a-f]{64}$/);
    // a retry on a later day carries a new invoice_date but is the same intent
    const nextDay = buildInvoiceRequest(draft(), { localInvoiceId: ID, invoiceDate: "2026-10-26" });
    expect(requestDigest(nextDay)).toBe(requestDigest(a));
  });
});
