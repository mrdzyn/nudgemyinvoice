import { describe, expect, it } from "vitest";
import { NUDGE_CLARIFY, SEND_REFUSAL, parseNudgeIntent } from "./nudgeIntent.js";

/** Objective (NMI-P6 D7): Nudgey recognises a DRAFT request deterministically and never turns "send" into an action. */
describe("parseNudgeIntent", () => {
  it.each([
    ["draft a firm nudge for zorblax", "firm", "zorblax"],
    ["Draft a friendly nudge for Northwind Studio.", "friendly", "Northwind Studio"],
    [
      "please write a professional payment nudge to Bluebird Bakery",
      "professional",
      "Bluebird Bakery",
    ],
    ["draft a nudge for Lumen Labs in a firm tone", "firm", "Lumen Labs"],
    ["draft a nudge for “Quill & Co”", null, "Quill & Co"],
    ["create a payment reminder for Harbor Coffee", null, "Harbor Coffee"],
    ["draft a nudge for Text Co", null, "Text Co"],
  ])("%j -> draft (%s) for %j", (input, tone, term) => {
    expect(parseNudgeIntent(input)).toEqual({ kind: "draft", tone, term });
  });

  it.each([
    "send it",
    "email them",
    "send the nudge to Zorblax",
    "text Northwind a reminder",
    "whatsapp Acme",
    "draft a firm nudge for Acme and email it",
    "draft a nudge for Acme, then send it",
    "automatically nudge everyone",
    "schedule a nudge for Acme",
  ])("%j is refused clearly, never acted on", (input) => {
    expect(parseNudgeIntent(input)).toEqual({ kind: "unsupported", message: SEND_REFUSAL });
  });

  it.each(["draft a nudge", "draft a firm nudge for me", "draft a nudge for it"])(
    "%j asks which customer",
    (input) => {
      expect(parseNudgeIntent(input)).toEqual({ kind: "clarify", message: NUDGE_CLARIFY });
    },
  );

  it.each([
    "What are my pending invoices?",
    "Find invoices for Northwind Studio",
    "remind me to follow up with Acme tomorrow at 9am",
    "which follow-ups are due?",
    "",
    "x".repeat(201),
    "draft a nudge\u0007 for Acme",
  ])("%j is not a nudge request (handled by the existing intents)", (input) => {
    expect(parseNudgeIntent(input)).toEqual({ kind: "not-nudge" });
  });

  it("the refusal says nothing is ever sent and points to the draft wording", () => {
    expect(SEND_REFUSAL).toMatch(/never contacts your customers/);
    expect(SEND_REFUSAL).toMatch(/draft a friendly nudge for Northwind/);
  });
});
