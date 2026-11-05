import { describe, expect, it, vi } from "vitest";
import {
  createOpenAINudgeClient,
  draftNudge,
  dueBucket,
  groupedAmount,
  longDate,
  NUDGE_INSTRUCTIONS,
  NUDGE_MAX_OUTPUT_TOKENS,
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

describe("payment-status claims (owner refinement 1: a due date does not establish payment status)", () => {
  const withSentence = (sentence: string) => ({
    ...GOOD,
    message: GOOD.message.replace("Could you", `${sentence} Could you`),
  });
  it.each([
    "The invoice is still unpaid.",
    "This invoice is unpaid.",
    "The balance remains outstanding.",
    "This invoice is now overdue.",
    "The invoice is past due.",
    "Your account is in arrears.",
    "The amount you owe is shown above.",
    "This is the amount owed.",
    "Payment has not been received.",
    "We haven't received your payment yet.",
    "The invoice hasn’t been paid.",
    "It has not yet been settled.",
    "It looks like a missed payment.",
    "Your payment is late.",
    "The invoice remains open.",
    "We received your payment, thank you.",
    "Thank you for your payment.",
    "The invoice was paid in full.",
    "It seems the invoice is already paid.",
  ])("refuses the message claim %j", (sentence) => {
    expect(validateNudgeOutput(withSentence(sentence))).toEqual({
      ok: false,
      issue: "payment_status_claim",
    });
  });
  it.each([
    "The invoice is still unpaid so a firm tone fits.",
    "Because the balance is outstanding, the wording is direct.",
    "It is overdue, so the message asks for payment.",
    "The customer has not paid yet, so it is firm but polite.",
  ])("refuses the rationale claim %j", (rationale) => {
    expect(validateNudgeOutput({ ...GOOD, rationale })).toEqual({
      ok: false,
      issue: "payment_status_claim",
    });
  });
  it.each([
    "Just checking in on this one.",
    "If this is already taken care of, please let me know and disregard this note.",
    "Could you share an update on when payment is planned?",
    "I wanted to follow up now that the due date has passed.",
  ])("accepts neutral, date-oriented wording %j", (sentence) => {
    expect(validateNudgeOutput(withSentence(sentence))).toMatchObject({ ok: true });
  });
  it("accepts a neutral rationale that refers only to the due date", () => {
    expect(
      validateNudgeOutput({
        ...GOOD,
        rationale:
          "The due date passed recently and this is the first note, so it is courteous and asks for an update.",
      }),
    ).toMatchObject({ ok: true });
  });
  it("draftNudge refuses a payment-status claim after exactly one call and stores nothing", async () => {
    const c = fake(withSentence("The invoice is still unpaid."));
    expect(
      await draftNudge(
        c,
        { tone: "firm", currency: "USD", dueStatus: "overdue_1_7", repeat: false },
        values,
      ),
    ).toEqual({ status: "invalid", issue: "payment_status_claim" });
    expect(c.calls).toBe(1);
  });
});

describe("OpenAI nudge client cost bound (approved D6: one call, no retries)", () => {
  const stub = (status: number, body: unknown) => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const f = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    });
    return { f, calls };
  };
  for (const status of [429, 500, 503]) {
    it(`a ${status} from the provider is NOT retried: exactly one request`, async () => {
      const { f, calls } = stub(status, { error: { message: "synthetic failure" } });
      const client = createOpenAINudgeClient({
        apiKey: "sk-test-not-real",
        model: "test-model",
        fetch: f as unknown as typeof fetch,
      });
      await expect(client.generate({ instructions: "i", input: "{}" })).rejects.toBeTruthy();
      expect(f).toHaveBeenCalledTimes(1);
      expect(calls[0]?.url).toMatch(/\/responses$/);
    });
  }
  it("caps output tokens at 600 and disables response storage, even if a larger cap is configured", async () => {
    const { f, calls } = stub(500, { error: { message: "synthetic failure" } });
    const client = createOpenAINudgeClient({
      apiKey: "sk-test-not-real",
      model: "test-model",
      maxOutputTokens: 5000,
      fetch: f as unknown as typeof fetch,
    });
    await expect(client.generate({ instructions: "i", input: "{}" })).rejects.toBeTruthy();
    expect(NUDGE_MAX_OUTPUT_TOKENS).toBe(600);
    expect(calls[0]?.body).toMatchObject({
      model: "test-model",
      store: false,
      max_output_tokens: 600,
    });
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
      due_status: "the due date passed between one week and one month ago",
      earlier_reminder_approved: true,
    });
    expect(input).not.toMatch(/\d/);
  });
  it("describes every due bucket by the date only, never by payment status", () => {
    for (const dueStatus of [
      "not_yet_due",
      "due_today",
      "overdue_1_7",
      "overdue_8_30",
      "overdue_31_plus",
    ] as const) {
      const text = JSON.parse(
        nudgeModelInput({ tone: "friendly", currency: "USD", dueStatus, repeat: false }),
      ).due_status as string;
      expect(text).toMatch(/due date/);
      expect(text).not.toMatch(/unpaid|overdue|outstanding|late|owed|paid/i);
    }
  });
  it("the instructions forbid payment-status claims", () => {
    expect(NUDGE_INSTRUCTIONS).toMatch(/You do NOT know whether the invoice has been paid/);
    expect(NUDGE_INSTRUCTIONS).toMatch(/Never state or imply\s+payment status/);
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
