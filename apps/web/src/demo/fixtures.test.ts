import { describe, expect, it } from "vitest";
import { assertExactMapping, PayPalMappingError } from "../../../../packages/paypal/src/mapping.js";
import { calculateTotals, invoiceDraftSchema } from "../../../../packages/shared/src/index.js";
import { DEMO_TODAY, estimateTotals, paypalRefusal } from "../domain/money.js";
import { FIXTURE_INVOICES, PARSE_SCENARIOS } from "./fixtures.js";

/** Objective: the synthetic demo data is truthful (real arithmetic, real mapping rules, fabricated ids). */

const REAL_SMOKE_ID = ["INV2", "U92W", "76NX", "3P2E", "AGUZ"].join("-");

describe("synthetic fixtures", () => {
  it("covers USD, EUR, GBP and JPY as separate currencies", () => {
    expect(FIXTURE_INVOICES.map((i) => i.draft.currency)).toEqual(["USD", "EUR", "JPY", "GBP"]);
  });

  it.each(FIXTURE_INVOICES.map((i) => [i.draft.currency, i] as const))(
    "%s fixture passes the strict schema and server totals",
    (_c, inv) => {
      const parsed = invoiceDraftSchema.safeParse(inv.draft);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(inv.totals).toEqual(calculateTotals(parsed.data));
      const ui = estimateTotals(inv.draft);
      expect({
        currency: ui.currency,
        lineTotals: ui.lineTotals,
        subtotal: ui.subtotal,
        discount: ui.discount,
        tax: ui.tax,
        total: ui.total,
      }).toEqual(inv.totals);
    },
  );

  it("PayPal eligibility in the UI matches assertExactMapping for every fixture", () => {
    for (const inv of FIXTURE_INVOICES) {
      let server: string | null = null;
      try {
        assertExactMapping(inv.draft, DEMO_TODAY);
      } catch (e) {
        if (!(e instanceof PayPalMappingError)) throw e;
        server = e.reason;
      }
      expect(paypalRefusal(inv.draft)).toBe(server);
    }
    expect(paypalRefusal(FIXTURE_INVOICES[3]?.draft ?? FIXTURE_INVOICES[0]!.draft)).toBe(
      "tax_with_discount_multiline",
    );
  });

  it("uses only clearly fabricated PayPal ids, never the genuine Sandbox smoke id", () => {
    const text = JSON.stringify([FIXTURE_INVOICES, PARSE_SCENARIOS]);
    expect(text).not.toContain(REAL_SMOKE_ID);
    for (const inv of FIXTURE_INVOICES) {
      if (inv.paypalInvoiceId !== null) expect(inv.paypalInvoiceId).toMatch(/^INV2-DEMO-FAKE-/);
    }
  });

  it("uses only reserved example domains for emails", () => {
    for (const inv of FIXTURE_INVOICES) expect(inv.draft.customerEmail).toMatch(/\.example$/);
  });

  it("parse scenarios fit the 2,000-character limit and produce schema-valid drafts", () => {
    for (const s of PARSE_SCENARIOS) {
      expect(s.text.length).toBeLessThanOrEqual(2000);
      for (const o of [s.outcome, s.afterClarification]) {
        if (o?.status === "draft") {
          const parsed = invoiceDraftSchema.safeParse(o.draft);
          expect(parsed.success).toBe(true);
          if (parsed.success) expect(o.totals).toEqual(calculateTotals(parsed.data));
        }
      }
    }
  });
});
