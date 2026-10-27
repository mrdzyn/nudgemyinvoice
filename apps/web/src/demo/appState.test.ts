import { describe, expect, it } from "vitest";
import { initialState, overLimitText, reducer, type AppState } from "./appState.js";
import { FIXTURE_IDS, FIXTURE_INVOICES } from "./fixtures.js";
import { ALL_SCENARIOS } from "./scenarios.js";
import { parseHash, hashFor, stateFromHash } from "./hash.js";
import { MAX_PARSE_CHARS } from "../domain/invoiceForm.js";

/** Objective: the simulated state transitions behave as specified and never leak invoice data into the URL. */

const start = (): AppState => initialState("light");

describe("scenario seeds", () => {
  it("every demo state resolves to a screen without throwing", () => {
    for (const id of ALL_SCENARIOS) {
      const s = reducer(start(), { type: "scenario", id });
      expect(s.scenario).toBe(id);
      expect(["login", "dashboard", "composer", "review", "detail"]).toContain(s.screen);
    }
  });

  it("over-limit seed is 143 characters over the 2,000 limit", () => {
    expect(overLimitText().length).toBe(MAX_PARSE_CHARS + 143);
    expect(reducer(start(), { type: "scenario", id: "over-limit" }).composer.text.length).toBe(
      2143,
    );
  });

  it("PayPal states target the intended fixture and override", () => {
    const disabled = reducer(start(), { type: "scenario", id: "paypal-disabled" });
    expect(disabled.ppDisabled).toBe(true);
    expect(disabled.detailId).toBe(FIXTURE_IDS.eurNone);
    const refused = reducer(start(), { type: "scenario", id: "paypal-refused" });
    expect(refused.ppOverride).toEqual({ state: "refused", code: "tax_with_discount_multiline" });
    expect(reducer(start(), { type: "scenario", id: "paypal-unknown" }).ppOverride?.state).toBe(
      "unknown",
    );
    expect(reducer(start(), { type: "scenario", id: "paypal-creating" }).detailId).toBe(
      FIXTURE_IDS.jpyCreating,
    );
  });

  it("validation-errors seeds a review form that opens with errors shown", () => {
    const s = reducer(start(), { type: "scenario", id: "validation-errors" });
    expect(s.screen).toBe("review");
    expect(s.review?.showErrors).toBe(true);
  });
});

describe("flow transitions", () => {
  it("sign-in reaches the dashboard and sign-out returns to login with a notice", () => {
    let s = reducer(start(), { type: "sign-in" });
    expect(s.screen).toBe("dashboard");
    expect(s.authed).toBe(true);
    s = reducer(s, { type: "sign-out" });
    expect(s.screen).toBe("login");
    expect(s.authed).toBe(false);
    expect(s.loginNotice).toBe("signed-out");
  });

  it("saving adds a simulated draft, opens its detail with a notice, and never mutates fixtures", () => {
    const before = start();
    const invoice = {
      ...FIXTURE_INVOICES[1]!,
      id: "00000000-0000-4000-8000-000000000001",
      simulated: true,
    };
    const after = reducer(before, { type: "save-invoice", invoice, notice: "created" });
    expect(after.invoices).toHaveLength(FIXTURE_INVOICES.length + 1);
    expect(after.invoices[0]?.simulated).toBe(true);
    expect(after.screen).toBe("detail");
    expect(after.detailNotice).toBe("created");
    expect(FIXTURE_INVOICES).toHaveLength(4);
    expect(before.invoices).toHaveLength(4);
  });

  it("simulated PayPal creation yields a clearly fabricated id", () => {
    const s = reducer(start(), { type: "paypal-created", id: FIXTURE_IDS.eurNone });
    const inv = s.invoices.find((i) => i.id === FIXTURE_IDS.eurNone);
    expect(inv?.paypal.state).toBe("created");
    expect(inv?.paypal.paypalInvoiceId).toMatch(/^INV2-DEMO-FAKE-0000-\d{4}$/);
  });

  it("navigating to New invoice with reset clears composer text; Back to composer keeps it", () => {
    let s = reducer(start(), { type: "scenario", id: "ai-clarification" });
    expect(s.composer.text.length).toBeGreaterThan(0);
    s = reducer(s, { type: "navigate", screen: "composer" });
    expect(s.composer.text.length).toBeGreaterThan(0);
    s = reducer(s, { type: "navigate", screen: "composer", resetComposer: true });
    expect(s.composer.text).toBe("");
  });
});

describe("URL hash carries no invoice content", () => {
  it("encodes only screen, demo state and theme", () => {
    let s = reducer(start(), { type: "scenario", id: "validation-errors" });
    s = reducer(s, { type: "composer", patch: { text: "Invoice Secret Customer 12345 USD" } });
    const h = hashFor(s);
    expect(h).toBe("#screen=review&state=validation-errors&theme=light");
    expect(h).not.toMatch(/Secret|12345|customer/i);
  });

  it("round-trips and ignores unknown or hostile values", () => {
    expect(parseHash("#screen=detail&state=paypal-created&theme=dark")).toEqual({
      screen: "detail",
      scenario: "paypal-created",
      theme: "dark",
    });
    expect(parseHash("#screen=<script>&state=nope&theme=pink")).toEqual({
      screen: null,
      scenario: "default",
      theme: null,
    });
    expect(stateFromHash("#state=over-limit", false).screen).toBe("composer");
    expect(stateFromHash("", true).theme).toBe("dark");
  });
});
