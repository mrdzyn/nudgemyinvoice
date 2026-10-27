import { describe, expect, it } from "vitest";
import { invoiceDraftSchema } from "../../../../packages/shared/src/index.js";
import {
  blankForm,
  controlId,
  formFromDraft,
  MAX_PARSE_CHARS,
  toDraft,
  validateForm,
  type FormState,
} from "./invoiceForm.js";
import { draftOf, scenarioById } from "../demo/fixtures.js";

/** Objective: the form enforces the strict invoice draft contract, with the same accept/reject outcome. */

const valid = (): FormState => formFromDraft(draftOf(scenarioById("usd-draft").outcome));
const ids = (f: FormState) => validateForm(f).errors.map((e) => e.id);

describe("validateForm", () => {
  it("accepts the approved synthetic proposal and agrees with the strict server schema", () => {
    const r = validateForm(valid());
    expect(r.errors).toEqual([]);
    expect(invoiceDraftSchema.safeParse(r.draft).success).toBe(true);
  });

  it("requires customer name and a valid customer email", () => {
    const f = { ...valid(), customerName: "  ", customerEmail: "" };
    expect(ids(f)).toEqual(expect.arrayContaining(["customerName", "customerEmail"]));
    expect(ids({ ...valid(), customerEmail: "billing@" })).toContain("customerEmail");
    expect(ids({ ...valid(), customerEmail: `${"a".repeat(250)}@example.test` })).toContain(
      "customerEmail",
    );
  });

  it("validates the due date as a real calendar date", () => {
    expect(ids({ ...valid(), dueDate: "" })).toContain("dueDate");
    expect(ids({ ...valid(), dueDate: "2026-02-30" })).toContain("dueDate");
    expect(ids({ ...valid(), dueDate: "2026-13-01" })).toContain("dueDate");
    expect(ids({ ...valid(), dueDate: "2026-11-30" })).not.toContain("dueDate");
  });

  it("rejects zero/non-numeric quantity, excess decimals and JPY fractions", () => {
    const f = valid();
    expect(
      ids({ ...f, lines: [{ description: "a", quantity: "0", unitPrice: "1.00" }] }),
    ).toContain("line-0-quantity");
    expect(
      ids({ ...f, lines: [{ description: "a", quantity: "1.234", unitPrice: "1.00" }] }),
    ).toContain("line-0-quantity");
    expect(
      ids({ ...f, lines: [{ description: "a", quantity: "x", unitPrice: "1.00" }] }),
    ).toContain("line-0-quantity");
    expect(
      ids({ ...f, lines: [{ description: "a", quantity: "1", unitPrice: "1.005" }] }),
    ).toContain("line-0-unitPrice");
    expect(
      ids({
        ...f,
        currency: "JPY",
        lines: [{ description: "a", quantity: "1", unitPrice: "85.50" }],
      }),
    ).toContain("line-0-unitPrice");
    expect(ids({ ...f, lines: [{ description: " ", quantity: "1", unitPrice: "1" }] })).toContain(
      "line-0-description",
    );
  });

  it("supports percent tax only and a bounded percent/amount discount", () => {
    expect(ids({ ...valid(), taxPercent: "120" })).toContain("taxPercent");
    expect(ids({ ...valid(), taxPercent: "8.255" })).toContain("taxPercent");
    expect(ids({ ...valid(), taxPercent: "$5" })).toContain("taxPercent");
    expect(ids({ ...valid(), discountKind: "percent", discountValue: "" })).toContain(
      "discountValue",
    );
    expect(ids({ ...valid(), discountKind: "percent", discountValue: "150" })).toContain(
      "discountValue",
    );
    expect(ids({ ...valid(), discountKind: "amount", discountValue: "999999" })).toContain(
      "discountValue",
    ); // exceeds subtotal
    expect(ids({ ...valid(), discountKind: "amount", discountValue: "50" })).not.toContain(
      "discountValue",
    );
  });

  it("requires at least one and at most 50 line items", () => {
    expect(ids({ ...valid(), lines: [] })).toContain("lines");
    const many = Array.from({ length: 51 }, () => ({
      description: "a",
      quantity: "1",
      unitPrice: "1.00",
    }));
    expect(ids({ ...valid(), lines: many })).toContain("lines");
  });

  it("an empty manual form lists every required problem and maps errors to focusable controls", () => {
    const r = validateForm(blankForm());
    expect(r.draft).toBeNull();
    expect(r.errors.map((e) => e.id)).toEqual(
      expect.arrayContaining([
        "customerName",
        "customerEmail",
        "dueDate",
        "line-0-description",
        "line-0-unitPrice",
      ]),
    );
    expect(controlId("customerName")).toBe("f-customerName");
    expect(controlId("line-0-quantity")).toBe("f-line-0-quantity");
    expect(controlId("lines")).toBe("add-line-btn");
  });

  it("agrees with the strict schema on accept/reject for a spread of forms", () => {
    const forms: FormState[] = [
      valid(),
      { ...valid(), customerEmail: "nope" },
      { ...valid(), taxPercent: "8.25" },
      { ...valid(), discountKind: "percent", discountValue: "10" },
      { ...valid(), discountKind: "amount", discountValue: "5.00" },
      {
        ...valid(),
        currency: "JPY",
        lines: [{ description: "a", quantity: "2", unitPrice: "500" }],
      },
      { ...valid(), dueDate: "2026-02-29" },
    ];
    for (const f of forms) {
      const ui = validateForm(f).errors.length === 0;
      const server = invoiceDraftSchema.safeParse(toDraft(f)).success;
      // The UI may be stricter only by the discount>subtotal arithmetic check, which the schema defers to calculateTotals.
      expect(ui).toBe(server);
    }
  });

  it("only submits schema keys (no invoice number, issue date, PO or client totals)", () => {
    expect(Object.keys(toDraft(valid())).sort()).toEqual([
      "currency",
      "customerEmail",
      "customerName",
      "discount",
      "dueDate",
      "lineItems",
      "taxPercent",
    ]);
  });

  it("uses the 2,000-character AI input limit from the API", () => {
    expect(MAX_PARSE_CHARS).toBe(2000);
  });
});
