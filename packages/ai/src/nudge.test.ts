import { describe, expect, it, vi } from "vitest";
import {
  draftNudge,
  dueBucket,
  groupedAmount,
  longDate,
  NUDGE_INSTRUCTIONS,
  nudgeModelInput,
  renderNudge,
  validateNudgeOutput,
  type NudgeModelClient,
} from "./nudge.js";

const GOOD = {
  message:
    "Hi {{customer_name}},\n\nA quick reminder that invoice {{invoice_ref}} for {{amount}} was due on {{due_date}}. Could you let me know when payment is on its way?\n\nKind regards,",
  rationale: "A professional, concise reminder that names the invoice and asks for an update.",
};
const values = {
  customerName: "Synthetic Client Ltd",
  invoiceRef: "c615eb2b",
  amount: "USD 1,200.00",
  dueDate: "October 30, 2026",
};
const fake = (out: unknown): NudgeModelClient & { calls: number } => {
  const c = {
    model: "fake-model",
    calls: 0,
    generate: vi.fn(async () => {
      c.calls++;
      return out;
    }),
  };
  return c;
};

describe("validateNudgeOutput", () => {
  it("accepts a well-formed template", () => {
    expect(validateNudgeOutput(GOOD)).toMatchObject({ ok: true });
  });
  it.each([
    ["shape", { message: GOOD.message }, "shape"],
    ["extra key", { ...GOOD, action: "send" }, "shape"],
    [
      "too short",
      { ...GOOD, message: "Hi {{customer_name}} {{invoice_ref}} {{amount}} {{due_date}}" },
      "length",
    ],
    [
      "missing amount",
      { ...GOOD, message: GOOD.message.replace("{{amount}}", "the balance") },
      "placeholder_missing",
    ],
    [
      "unknown placeholder",
      { ...GOOD, message: `${GOOD.message} {{payment_link}}` },
      "placeholder_unknown",
    ],
    [
      "invented number",
      {
        ...GOOD,
        message: GOOD.message.replace("Could you", "Please pay within 7 days. Could you"),
      },
      "digits",
    ],
    [
      "invented amount",
      {
        ...GOOD,
        message: GOOD.message.replace(
          "Could you",
          "That is USD five hundred, i.e. $500. Could you",
        ),
      },
      "digits",
    ],
    [
      "currency symbol",
      { ...GOOD, message: GOOD.message.replace("Could you", "Every $ counts. Could you") },
      "currency_symbol",
    ],
    [
      "link",
      {
        ...GOOD,
        message: GOOD.message.replace("Could you", "Pay at https://pay.example now. Could you"),
      },
      "link_or_email",
    ],
    [
      "email",
      {
        ...GOOD,
        message: GOOD.message.replace("Could you", "Reply to billing@example. Could you"),
      },
      "link_or_email",
    ],
    [
      "paypal claim",
      { ...GOOD, message: GOOD.message.replace("Could you", "Use the PayPal button. Could you") },
      "unbacked_claim",
    ],
    [
      "attachment claim",
      { ...GOOD, message: GOOD.message.replace("Could you", "The invoice is attached. Could you") },
      "unbacked_claim",
    ],
    [
      "late fee threat",
      { ...GOOD, message: GOOD.message.replace("Could you", "A late fee will apply. Could you") },
      "unbacked_claim",
    ],
    [
      "legal threat",
      {
        ...GOOD,
        message: GOOD.message.replace("Could you", "I will start legal action. Could you"),
      },
      "unbacked_claim",
    ],
    ["square brackets", { ...GOOD, message: `${GOOD.message}\n[Your Name]` }, "brackets"],
    ["control chars", { ...GOOD, message: `${GOOD.message}\u0007` }, "control_characters"],
    [
      "rationale digits",
      { ...GOOD, rationale: "It is 12 days overdue so a firm tone fits best here." },
      "digits",
    ],
    ["short rationale", { ...GOOD, rationale: "ok" }, "rationale_length"],
  ])("refuses %s", (_n, raw, issue) => {
    expect(validateNudgeOutput(raw)).toEqual({ ok: false, issue });
  });
});

describe("renderNudge", () => {
  it("substitutes verified values literally and never re-expands them", () => {
    const out = renderNudge(GOOD.message, { ...values, customerName: "Evil {{amount}} Co" });
    expect(out).toContain("Hi Evil {{amount}} Co,");
    expect(out).toContain("invoice c615eb2b for USD 1,200.00 was due on October 30, 2026.");
  });
});

describe("model input privacy", () => {
  it("sends only tone and enumerated facts: no name, email, amount, date or id", () => {
    const input = nudgeModelInput({
      tone: "firm",
      currency: "EUR",
      dueStatus: "overdue_8_30",
      repeat: true,
    });
    expect(JSON.parse(input)).toEqual({
      tone: "firm",
      currency: "EUR",
      due_status: "overdue by between one week and one month",
      earlier_reminder_approved: true,
    });
    expect(input).not.toMatch(/\d/);
  });
  it("the instructions forbid sending, links, fees and legal threats", () => {
    expect(NUDGE_INSTRUCTIONS).toMatch(/send THEMSELVES/);
    expect(NUDGE_INSTRUCTIONS).toMatch(/late fees/);
    expect(NUDGE_INSTRUCTIONS).toMatch(/Do not say the invoice was sent/);
  });
});

describe("draftNudge", () => {
  const facts = {
    tone: "professional",
    currency: "USD",
    dueStatus: "overdue_1_7",
    repeat: false,
  } as const;
  it("makes exactly one call and returns the rendered, validated draft", async () => {
    const c = fake(GOOD);
    const r = await draftNudge(c, facts, values);
    expect(c.calls).toBe(1);
    expect(r).toMatchObject({ status: "draft", model: "fake-model", rationale: GOOD.rationale });
    if (r.status === "draft") expect(r.message).toContain("USD 1,200.00");
  });
  it("refuses invalid output without retrying", async () => {
    const c = fake({
      ...GOOD,
      message:
        "Pay within 3 days {{customer_name}} {{invoice_ref}} {{amount}} {{due_date}} please now, thanks",
    });
    expect(await draftNudge(c, facts, values)).toEqual({ status: "invalid", issue: "digits" });
    expect(c.calls).toBe(1);
  });
  it("maps a provider failure to unavailable without its error text", async () => {
    const c: NudgeModelClient = {
      model: "m",
      generate: async () => {
        throw new Error("401 sk-secret customer Acme");
      },
    };
    expect(await draftNudge(c, facts, values)).toEqual({ status: "unavailable" });
  });
});

describe("helpers", () => {
  it("dueBucket", () => {
    expect([-3, 0, 1, 7, 8, 30, 31].map(dueBucket)).toEqual([
      "not_yet_due",
      "due_today",
      "overdue_1_7",
      "overdue_1_7",
      "overdue_8_30",
      "overdue_8_30",
      "overdue_31_plus",
    ]);
  });
  it("groupedAmount is exact and code-prefixed", () => {
    expect(groupedAmount("USD", "1234567.05")).toBe("USD 1,234,567.05");
    expect(groupedAmount("JPY", "188837")).toBe("JPY 188,837");
  });
  it("longDate has no time-zone shift", () => {
    expect(longDate("2026-10-30")).toBe("October 30, 2026");
    expect(longDate("2027-01-01")).toBe("January 1, 2027");
  });
});
