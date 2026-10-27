import { describe, expect, it } from "vitest";
import { assertExactMapping, PayPalMappingError } from "../../../../packages/paypal/src/mapping.js";
import {
  calculateTotals,
  invoiceDraftSchema,
  MoneyError as SharedMoneyError,
} from "../../../../packages/shared/src/index.js";
import { CURRENCY_CODES, type InvoiceDraft } from "./types.js";
import { DEMO_TODAY, estimateTotals, formatCurrency, MoneyError, paypalRefusal } from "./money.js";

/**
 * Objective: the browser estimate shown in the UI must follow exactly the same integer-minor-unit
 * rules as the server (packages/shared) and preview the same PayPal refusals (packages/paypal),
 * so the UI never "invents" arithmetic. Parity is checked against the real implementations.
 */

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function randomDraft(rand: () => number): InvoiceDraft {
  const currency = CURRENCY_CODES[Math.floor(rand() * CURRENCY_CODES.length)] ?? "USD";
  const jpy = currency === "JPY";
  const qtys = ["1", "2", "3", "0.5", "1.5", "2.25", "0.33", "7", "12", "0.01", "100"];
  const price = () => {
    const whole = Math.floor(rand() * 5000);
    if (jpy) return String(whole);
    const cents = Math.floor(rand() * 100);
    return rand() < 0.4 ? String(whole) : `${whole}.${String(cents).padStart(2, "0")}`;
  };
  const pct = () => {
    const opts = ["0", "5", "7.5", "8", "8.25", "10", "19", "20", "12.34", "33.33", "100"];
    return opts[Math.floor(rand() * opts.length)] ?? "10";
  };
  const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, i) => ({
    description: `Item ${i + 1}`,
    quantity: qtys[Math.floor(rand() * qtys.length)] ?? "1",
    unitPrice: price(),
  }));
  const r = rand();
  const discount =
    r < 0.4
      ? null
      : r < 0.7
        ? { kind: "percent" as const, value: pct() }
        : { kind: "amount" as const, value: price() };
  return {
    customerName: "Parity Customer",
    customerEmail: "parity@example.test",
    currency,
    lineItems: lines,
    dueDate: rand() < 0.2 ? "2026-10-01" : "2026-12-15",
    taxPercent: rand() < 0.5 ? null : pct(),
    discount,
  };
}

describe("estimateTotals parity with packages/shared calculateTotals", () => {
  it("matches the server for 1,500 pseudo-random drafts, including JPY and rounding cases", () => {
    const rand = lcg(20261027);
    let compared = 0;
    let rounded = 0;
    let thrown = 0;
    for (let n = 0; n < 1500; n++) {
      const d = randomDraft(rand);
      const parsed = invoiceDraftSchema.safeParse(d);
      if (!parsed.success) continue;
      let server;
      let serverError = false;
      try {
        server = calculateTotals(parsed.data);
      } catch (e) {
        if (!(e instanceof SharedMoneyError)) throw e;
        serverError = true;
      }
      if (serverError) {
        expect(() => estimateTotals(d)).toThrow(MoneyError);
        thrown++;
        continue;
      }
      const ui = estimateTotals(d);
      expect({
        currency: ui.currency,
        lineTotals: ui.lineTotals,
        subtotal: ui.subtotal,
        discount: ui.discount,
        tax: ui.tax,
        total: ui.total,
      }).toEqual(server);
      if (ui.rounded) rounded++;
      compared++;
    }
    expect(compared).toBeGreaterThan(900);
    expect(rounded).toBeGreaterThan(50);
    expect(thrown).toBeGreaterThan(5);
  });

  it("formats currency from decimal strings without floating point", () => {
    expect(formatCurrency("1234567.5", "USD")).toBe("$1,234,567.5");
    expect(formatCurrency("143000", "JPY")).toBe("¥143,000");
    expect(formatCurrency("0.07", "GBP")).toBe("£0.07");
    expect(formatCurrency("1517.25", "EUR")).toBe("€1,517.25");
    expect(formatCurrency("99.99", "CAD")).toBe("CA$99.99");
    expect(formatCurrency("5.00", "AUD")).toBe("A$5.00");
    // 0.1 + 0.2 style hazards are impossible because no number type is involved
    expect(
      estimateTotals({
        ...randomDraft(lcg(1)),
        currency: "USD",
        taxPercent: null,
        discount: null,
        lineItems: [
          { description: "a", quantity: "3", unitPrice: "0.10" },
          { description: "b", quantity: "1", unitPrice: "0.20" },
        ],
      }).total,
    ).toBe("0.50");
  });

  it("JPY has no decimal places and USD rounds half up", () => {
    const base = {
      customerName: "x",
      customerEmail: "x@example.test",
      dueDate: "2026-12-01",
      taxPercent: null,
      discount: null,
    } as const;
    expect(() =>
      estimateTotals({
        ...base,
        currency: "JPY",
        lineItems: [{ description: "a", quantity: "1", unitPrice: "10.5" }],
      }),
    ).toThrow(MoneyError);
    const t = estimateTotals({
      ...base,
      currency: "USD",
      lineItems: [{ description: "a", quantity: "0.5", unitPrice: "0.01" }],
    });
    expect(t.total).toBe("0.01"); // 0.005 rounds half up
    expect(t.rounded).toBe(true);
  });
});

describe("paypalRefusal parity with packages/paypal assertExactMapping", () => {
  it("previews the same refusal reason for 1,500 pseudo-random drafts", () => {
    const rand = lcg(77);
    const reasons = new Set<string>();
    let compared = 0;
    for (let n = 0; n < 1500; n++) {
      const d = randomDraft(rand);
      const parsed = invoiceDraftSchema.safeParse(d);
      if (!parsed.success) continue;
      let server: string | null = null;
      try {
        assertExactMapping(parsed.data, DEMO_TODAY);
      } catch (e) {
        if (!(e instanceof PayPalMappingError)) throw e;
        server = e.reason;
      }
      let ui: string | null;
      try {
        ui = paypalRefusal(d);
      } catch (e) {
        if (!(e instanceof MoneyError)) throw e;
        continue; // arithmetic error: the server never reaches mapping either
      }
      expect(ui).toBe(server);
      if (server) reasons.add(server);
      compared++;
    }
    expect(compared).toBeGreaterThan(900);
    expect([...reasons].sort()).toEqual(
      expect.arrayContaining([
        "due_date_past",
        "rounding_required_line",
        "rounding_required_tax",
        "tax_with_discount_multiline",
      ]),
    );
  });
});
