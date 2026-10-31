import { describe, expect, it } from "vitest";
import type { Action } from "../demo/appState.js";
import { isLeavingAction, LEAVE_COPY, mustConfirmLeave, type SaveGuard } from "./leaveGuard.js";

/**
 * Objective: an unresolved save (pending or uncertain) can never be abandoned by the brand, desktop
 * or mobile navigation, "Back to composer" or "Discard" without an explicit, duplicate-aware
 * decision, while the save's own success path and non-leaving actions stay free.
 */
const leaving: Action[] = [
  { type: "navigate", screen: "dashboard" },
  { type: "navigate", screen: "composer" },
  { type: "navigate", screen: "composer", resetComposer: true },
  { type: "discard-review" },
  // Choosing another saved invoice (Nudgey status selector / follow-up list / dashboard) leaves Review too.
  { type: "open-saved", id: "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11", notice: "opened" },
];
const free: Action[] = [
  { type: "open-saved", id: "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11", notice: "created" },
  { type: "open-saved", id: "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11", notice: "replayed" },
  { type: "set-theme", theme: "dark" },
  { type: "set-offline", offline: true },
  { type: "composer", patch: { text: "x" } },
];

describe("mustConfirmLeave", () => {
  it.each(["pending", "uncertain"] as const)("asks before every leaving action while %s", (g) => {
    for (const a of leaving) expect(mustConfirmLeave(g, a), JSON.stringify(a)).toBe(true);
  });
  it.each(["pending", "uncertain"] as const)(
    "never blocks the save's own outcome or non-leaving actions while %s",
    (g) => {
      for (const a of free) expect(mustConfirmLeave(g, a), JSON.stringify(a)).toBe(false);
    },
  );
  it("never asks when nothing is unresolved", () => {
    for (const a of [...leaving, ...free]) expect(mustConfirmLeave("none", a)).toBe(false);
  });
  it("classifies leaving actions", () => {
    expect(leaving.every(isLeavingAction)).toBe(true);
    expect(free.some(isLeavingAction)).toBe(false);
  });
});

describe("leave copy distinguishes pending from uncertain and warns about duplicates", () => {
  const states: Exclude<SaveGuard, "none">[] = ["pending", "uncertain"];
  it("has distinct titles, buttons and bodies", () => {
    expect(LEAVE_COPY.pending.title).not.toBe(LEAVE_COPY.uncertain.title);
    expect(LEAVE_COPY.pending.confirm).not.toBe(LEAVE_COPY.uncertain.confirm);
    expect(LEAVE_COPY.pending.body).toMatch(/has not answered/);
    expect(LEAVE_COPY.uncertain.body).toMatch(/could not confirm/);
  });
  it.each(states)(
    "%s: says the invoice may already exist and that saving again may duplicate it",
    (g) => {
      expect(LEAVE_COPY[g].body).toMatch(/may already/);
      expect(LEAVE_COPY[g].body).toMatch(/duplicate|second draft/);
      expect(LEAVE_COPY[g].cancel).toMatch(/^Stay/);
    },
  );
  it("uncertain explains that staying allows a safe identical retry", () => {
    expect(LEAVE_COPY.uncertain.body).toMatch(/identical request/);
  });
});
