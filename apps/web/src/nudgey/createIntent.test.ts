import { describe, expect, it } from "vitest";
import { parseCreateIntent } from "./createIntent.js";

const CREATE =
  "Create an invoice for Bold Vision Enterprise for 1 month of Website Maintenance for $75, due in 15 days from today.";

describe("create-invoice intent (chat-to-composer, never an action)", () => {
  it("recognizes the reported P0 request and keeps the verbatim text for in-memory prefill", () => {
    const r = parseCreateIntent(CREATE);
    expect(r).toEqual({ kind: "create", text: CREATE });
  });

  it("recognizes affirmative creation with the invoice as the verb's direct object", () => {
    for (const q of [
      "Make me an invoice for Acme for $75 due Friday",
      "Draft an invoice for Northwind for design work",
      "Generate an invoice for Contoso for 2 hours of consulting",
      "Add a new invoice for Acme",
      "Prepare an invoice for Acme for $100",
      "I need a new invoice for Acme",
      "I want an invoice for Acme",
      "I'd like a new invoice for Acme",
      "Please create an invoice for Acme",
      "Can you create an invoice for Acme for $75?",
      "Could you please draft an invoice for Acme?",
      "Hey Nudgey, create an invoice for Acme",
    ])
      expect(parseCreateIntent(q).kind, q).toBe("create");
  });

  it("rejects conflicting financial commands even when phrased as creation", () => {
    for (const [q, action] of [
      ["Create and send an invoice to Acme for $75", "send"],
      ["Create an invoice for Acme and email it to them", "send"],
      ["Make an invoice for Acme and mark it paid", "pay"],
      ["Draft an invoice for Acme and pay it now", "pay"],
      ["Create an invoice and capture the payment", "capture"],
      ["Create an invoice for Acme then refund it", "refund"],
    ] as const) {
      const r = parseCreateIntent(q);
      expect(r.kind, q).toBe("conflict");
      if (r.kind === "conflict") expect(r.action).toBe(action);
    }
  });

  it("does not hijack read-only lookups that mention creation participles or new invoices", () => {
    for (const q of [
      "Show my invoices created today",
      "Find invoices generated for Acme",
      "Show new invoices",
      "Show me invoices drafted last week",
      "I created an invoice yesterday",
      "What are my pending invoices?",
      "Show my USD invoices",
      "Find invoices for Acme",
    ])
      expect(parseCreateIntent(q).kind, q).toBe("not-create");
  });

  it("does not redirect creation of something else about an invoice", () => {
    for (const q of [
      "Create a follow-up for invoice 123",
      "create a reminder",
      "create",
      "Send an invoice to Acme",
      "",
      "   ",
    ])
      expect(parseCreateIntent(q).kind, q).toBe("not-create");
  });

  it("leaves over-long and control-character input to the existing rejection path", () => {
    expect(parseCreateIntent("create an invoice for " + "x".repeat(300)).kind).toBe("not-create");
    expect(parseCreateIntent("create an invoice\tfor Acme").kind).toBe("not-create");
  });
});
