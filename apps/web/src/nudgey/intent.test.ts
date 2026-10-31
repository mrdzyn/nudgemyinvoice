import { describe, expect, it } from "vitest";
import { EXAMPLE_QUESTIONS, MAX_PROMPT_CHARS, parseIntent, type Intent } from "./intent.js";

const intent = (s: string): Intent => {
  const r = parseIntent(s);
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r.intent;
};

describe("Nudgey intent recognition (deterministic, no model)", () => {
  it("recognises the five documented example questions", () => {
    expect(intent("What are my pending invoices?")).toEqual({ kind: "pending" });
    expect(intent("Show my USD invoices")).toEqual({ kind: "list", currency: "USD", status: null });
    expect(intent("Find invoices for Northwind Studio")).toEqual({
      kind: "search",
      term: "Northwind Studio",
    });
    expect(intent("Which follow-ups are due?")).toEqual({ kind: "followups", which: "due" });
    expect(intent("What follow-ups are upcoming?")).toEqual({
      kind: "followups",
      which: "upcoming",
    });
    for (const q of EXAMPLE_QUESTIONS) expect(parseIntent(q).ok).toBe(true);
  });

  it("is case, spacing and punctuation tolerant and preserves the customer's own spelling", () => {
    expect(intent("  WHAT   are my PENDING invoices ")).toEqual({ kind: "pending" });
    expect(intent("find invoices for   NORTHWIND   studio!!")).toEqual({
      kind: "search",
      term: "NORTHWIND studio",
    });
    expect(intent('Find invoices for "Vienna Café"')).toEqual({
      kind: "search",
      term: "Vienna Café",
    });
    expect(intent("Which invoices need attention?")).toEqual({ kind: "pending" });
    expect(intent("Which follow ups are due")).toEqual({ kind: "followups", which: "due" });
    expect(intent("show my follow-ups")).toEqual({ kind: "followups", which: "all" });
  });

  it("lists by currency code and by PayPal DRAFT state, never by payment state", () => {
    expect(intent("Show my invoices")).toEqual({ kind: "list", currency: null, status: null });
    expect(intent("show my eur invoices")).toEqual({ kind: "list", currency: "EUR", status: null });
    expect(intent("Show my PayPal drafts")).toEqual({
      kind: "list",
      currency: null,
      status: "created",
    });
    expect(intent("show my GBP invoices with no paypal draft")).toEqual({
      kind: "list",
      currency: "GBP",
      status: "none",
    });
    expect(intent("show failed invoices")).toEqual({
      kind: "list",
      currency: null,
      status: "attention",
    });
    // A currency word that is not a supported code is not a filter.
    expect(intent("show my dollars invoices")).toEqual({
      kind: "list",
      currency: null,
      status: null,
    });
    expect(intent("show my usdt invoices")).toEqual({ kind: "list", currency: null, status: null });
  });

  it("never maps 'pending' to unpaid and refuses every payment-status question", () => {
    for (const q of [
      "Is Northwind Studio paid?",
      "Show overdue unpaid invoices",
      "Who owes me money?",
      "Which invoices are unpaid?",
      "show outstanding invoices",
      "Did Acme pay?" /* no payment keyword: help, not an answer */,
    ]) {
      const k = intent(q).kind;
      if (q.startsWith("Did")) expect(k).toBe("help");
      else expect(k, q).toBe("payment-unsupported");
    }
    expect(intent("What are my pending invoices?").kind).toBe("pending");
  });

  it("a customer name that contains a payment word is still a customer search", () => {
    expect(intent("Find invoices for Unpaid Ventures Ltd")).toEqual({
      kind: "search",
      term: "Unpaid Ventures Ltd",
    });
    expect(intent("Find invoices for Overdue Studio")).toEqual({
      kind: "search",
      term: "Overdue Studio",
    });
  });

  it("treats 'overdue' follow-ups as due REMINDERS, not as an unpaid invoice", () => {
    expect(intent("Which follow-ups are overdue?")).toEqual({ kind: "followups", which: "due" });
  });

  it("returns help for unknown, vague or unrelated requests (no invented certainty)", () => {
    for (const q of [
      "hello",
      "what's the weather",
      "delete my invoices",
      "send a reminder to Northwind",
      "email Acme",
      "Find invoices for",
      "Find invoices for me",
      "invoices",
    ]) {
      expect(intent(q).kind, q).toBe("help");
    }
  });

  it("does not turn write or send requests into actions", () => {
    for (const q of [
      "Remind me to follow up with Northwind tomorrow at 9 AM",
      "create an invoice for Acme",
      "send invoice to Acme",
      "cancel my follow-ups",
    ]) {
      expect(["help", "followups"]).toContain(intent(q).kind);
    }
    expect(intent("create an invoice for Acme").kind).toBe("help");
    expect(intent("send invoice to Acme").kind).toBe("help");
  });

  it("rejects empty, over-long and control-character prompts before any API work", () => {
    expect(parseIntent("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parseIntent("")).toEqual({ ok: false, reason: "empty" });
    expect(parseIntent("a".repeat(MAX_PROMPT_CHARS + 1))).toEqual({
      ok: false,
      reason: "too-long",
    });
    expect(parseIntent("a".repeat(MAX_PROMPT_CHARS)).ok).toBe(true);
    expect(parseIntent("show\u0000 invoices")).toEqual({ ok: false, reason: "control-characters" });
    expect(parseIntent("find invoices for A\u0007B")).toEqual({
      ok: false,
      reason: "control-characters",
    });
  });

  it("refuses tabs and line breaks in the RAW input instead of normalising them to spaces", () => {
    for (const q of [
      "show my\tinvoices",
      "show my\ninvoices",
      "show my invoices\n",
      "\tshow my invoices",
      "show\r\nmy invoices",
      "\n",
      "\t",
    ])
      expect(parseIntent(q), JSON.stringify(q)).toEqual({
        ok: false,
        reason: "control-characters",
      });
    // Ordinary spaces (even repeated or padded) remain fine and are collapsed.
    expect(parseIntent("  show   my    invoices  ")).toEqual({
      ok: true,
      intent: { kind: "list", currency: null, status: null },
    });
  });

  it("keeps search terms within the server's bound and refuses unusable terms", () => {
    expect(intent("find invoices for " + "x".repeat(101)).kind).toBe("help");
    expect(intent("find invoices for " + "x".repeat(100))).toMatchObject({ kind: "search" });
    expect(intent("find invoices for a").kind).toBe("help");
    expect(intent("find invoices for ???").kind).toBe("help");
  });
});
