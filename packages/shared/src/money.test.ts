import { describe, expect, it } from "vitest";
import { calculateTotals, sumByCurrency, type InvoiceDraft } from "./invoice.js";
import { MoneyError, formatMoney, parseMoney } from "./money.js";

const draft = (over: Partial<InvoiceDraft>): InvoiceDraft => ({
  customerName: "A",
  customerEmail: "a@example.com",
  currency: "USD",
  lineItems: [{ description: "x", quantity: "1", unitPrice: "0.10" }],
  dueDate: "2026-11-01",
  taxPercent: null,
  discount: null,
  ...over,
});

describe("exact money arithmetic", () => {
  it("avoids float error (0.1 * 3)", () => {
    const t = calculateTotals(
      draft({ lineItems: [{ description: "x", quantity: "3", unitPrice: "0.10" }] }),
    );
    expect(t.total).toBe("0.30");
  });
  it("rounds tax half up", () => {
    const t = calculateTotals(
      draft({
        lineItems: [{ description: "x", quantity: "1", unitPrice: "0.05" }],
        taxPercent: "10",
      }),
    );
    expect(t.tax).toBe("0.01");
    expect(t.total).toBe("0.06");
  });
  it("applies percent and amount discounts, and rejects over-discount", () => {
    const items = [{ description: "x", quantity: "1", unitPrice: "100" }];
    expect(
      calculateTotals(draft({ lineItems: items, discount: { kind: "percent", value: "10" } }))
        .total,
    ).toBe("90.00");
    expect(
      calculateTotals(draft({ lineItems: items, discount: { kind: "amount", value: "25.50" } }))
        .total,
    ).toBe("74.50");
    expect(() =>
      calculateTotals(draft({ lineItems: items, discount: { kind: "amount", value: "101" } })),
    ).toThrow(MoneyError);
  });
  it("respects currency exponent", () => {
    expect(parseMoney("15000", "JPY")).toBe(15000n);
    expect(() => parseMoney("1.5", "JPY")).toThrow(MoneyError);
    expect(() => parseMoney("1.001", "USD")).toThrow(MoneyError);
    expect(formatMoney(5n, "USD")).toBe("0.05");
  });
  it("rejects malformed amounts", () => {
    for (const bad of ["-1", "1e3", "NaN", "", "1,000", "$5"]) {
      expect(() => parseMoney(bad, "USD")).toThrow(MoneyError);
    }
  });
});

describe("multi-currency summaries", () => {
  it("groups per currency and never merges", () => {
    expect(
      sumByCurrency([
        { currency: "USD", total: "500.00" },
        { currency: "EUR", total: "287.39" },
        { currency: "USD", total: "0.10" },
      ]),
    ).toEqual({ USD: "500.10", EUR: "287.39" });
  });
});
