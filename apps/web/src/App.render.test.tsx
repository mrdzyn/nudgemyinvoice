import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import { ALL_SCENARIOS } from "./demo/scenarios.js";

/**
 * Objective: every approved screen and state renders from fixtures alone, with the approved copy,
 * Sandbox identity and boundaries, and with no send/pay controls. (Browser journeys, focus and
 * layout are covered by the Chrome QA harness; this is the fast server-render regression net.)
 */
/** React separates adjacent text nodes with comment markers; strip them so copy can be matched as written. */
const render = (hash: string) =>
  renderToString(<App initialHash={hash} />).replace(/<!-- -->/g, "");
const buttonLabels = (html: string) =>
  [...html.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/g)].map((m) =>
    (m[1] ?? "").replace(/<[^>]*>/g, "").trim(),
  );
const REAL_SMOKE_ID = ["INV2", "U92W", "76NX", "3P2E", "AGUZ"].join("-");

describe("approved screens", () => {
  it("login requires username and password, has no remember-me and discloses fixture-only auth", () => {
    const html = render("#screen=login");
    expect(html).toContain("Operator sign in");
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toMatch(/name="username"/);
    expect(html).toMatch(/name="password"[^>]*type="password"|type="password"[^>]*name="password"/);
    expect(html).not.toMatch(/type="checkbox"/);
    expect(html).not.toMatch(/remember|maintain active session/i);
    expect(html).toContain("Simulated sign-in");
    expect(html).toMatch(/id="login-password"[^>]*value=""|id="login-password"(?![^>]*value=)/);
  });

  it("login failure, throttle and expiry states use generic, non-leaking copy", () => {
    expect(render("#state=login-error")).toMatch(/Sign-in failed[\s\S]*incorrect/);
    expect(render("#state=login-throttled")).toContain("Too many sign-in attempts");
    expect(render("#state=session-expired")).toContain("Your session has expired");
  });

  it("dashboard shows currency-separated cards, never a mixed total, and labels data as synthetic", () => {
    const html = render("#screen=dashboard");
    for (const c of ["USD", "EUR", "GBP", "JPY"]) expect(html).toContain(`<span>${c}</span>`);
    expect(html).toContain("$702.00");
    expect(html).toContain("€1,517.25");
    expect(html).toContain("£1,053.00");
    expect(html).toContain("¥49,500");
    expect(html).toContain("DEMO / SYNTHETIC data");
    expect(html).toContain("never added together or converted");
    expect(html).toContain("AG Studio is not enabled");
    expect(html).not.toMatch(/active trial|trial[^.]*Dec/i);
    expect(html).not.toMatch(/>Delete<|Updated at/i);
  });

  it("dashboard loading, empty and error states render", () => {
    expect(render("#state=loading")).toContain("Loading drafts");
    expect(render("#state=empty")).toContain("No invoice drafts yet");
    expect(render("#state=list-error")).toContain("Could not load invoice drafts");
  });

  it("composer shows the 2,000 limit, approved examples and an accurate OpenAI privacy notice", () => {
    const html = render("#screen=composer");
    expect(html).toContain("0 / 2,000");
    expect(html).toContain("may be sent to OpenAI");
    expect(html).toContain("NOT TESTED");
    expect(html).not.toMatch(/securely|Safe Processing/i);
    expect(html).toContain("Synthetic example prompts");
    expect(html).toContain("Enter manually");
  });

  it("composer states: over limit, clarification, invalid, unavailable", () => {
    const over = render("#state=over-limit");
    expect(over).toContain("2,143 / 2,000 · 143 over the limit");
    expect(over).toMatch(/aria-invalid="true"/);
    expect(render("#state=ai-clarification")).toContain("The AI needs a little more information");
    expect(render("#state=ai-invalid")).toContain("could not turn this text into an invoice");
    expect(render("#state=ai-unavailable")).toContain("AI parsing is unavailable");
  });

  it("review contains exactly the schema-backed fields and labels totals as estimates", () => {
    const html = render("#screen=review");
    expect(html).toContain("Customer email");
    expect(html).toContain("Estimated totals");
    expect(html).toContain("Estimated total (USD)");
    expect(html).toContain("$702.00");
    expect(html).not.toMatch(/Invoice number|Issue date|PO reference/i);
    expect(html).not.toMatch(/verified/i);
    expect(html).toContain("Percent only");
  });

  it("review states: validation errors, rounding warning, save replay/conflict seeds", () => {
    const errs = render("#state=validation-errors");
    expect(errs).toContain("problems to fix before saving");
    expect(errs).toContain("Enter a valid email address");
    expect(errs).toContain("JPY amounts have no decimal places.");
    const rounding = render("#state=rounding");
    expect(rounding).toContain("Rounding applied");
    expect(rounding).toContain("would be refused");
    expect(render("#state=save-replay")).toContain("Save local draft");
  });

  it("detail separates the local draft from the PayPal Sandbox panel and has no send or pay controls", () => {
    const html = render("#screen=detail&state=paypal-created");
    expect(html).toContain("PayPal Sandbox draft");
    expect(html).toContain("The customer has not been emailed");
    expect(html).toContain("INV2-DEMO-FAKE-0000-0001");
    expect(html).toContain("fabricated demo id");
    expect(html).toContain("Server-computed");
    const labels = buttonLabels(html);
    expect(labels.length).toBeGreaterThan(5);
    for (const label of labels)
      expect(label).not.toMatch(/^(send|pay|remind|refund|cancel invoice|mark paid|capture)/i);
  });

  it.each([
    ["paypal-disabled", "PayPal Sandbox drafting is switched off"],
    ["paypal-refused", "mapping_refused"],
    ["paypal-creating", "Creation in progress"],
    ["paypal-reconciling", "Checking PayPal before doing anything else"],
    ["paypal-unknown", "may or may not exist in PayPal"],
    ["paypal-rejected", "PayPal rejected the request"],
    ["paypal-mismatch", "does not match this invoice"],
  ])("PayPal state %s renders its approved explanation", (state, text) => {
    expect(render(`#state=${state}`)).toContain(text);
  });
});

describe("global boundaries", () => {
  it("every screen and state shows the persistent PayPal Sandbox identity and stays free of real provider ids", () => {
    for (const id of ALL_SCENARIOS) {
      const html = render(`#state=${id}`);
      expect(html).toContain("PayPal Sandbox only.");
      expect(html).toContain("does not email");
      expect(html).not.toContain(REAL_SMOKE_ID);
    }
  });

  it("offline state shows an alert banner", () => {
    expect(render("#state=offline")).toContain(
      "Offline. Parsing, saving and PayPal draft creation are unavailable",
    );
  });

  it("dark theme is selectable from the hash", () => {
    expect(render("#screen=dashboard&theme=dark")).toContain('aria-pressed="true"');
  });
});
