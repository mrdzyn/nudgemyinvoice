import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProvider } from "../../demo/AppContext.js";
import { initialState } from "../../demo/appState.js";
import { blankForm } from "../../domain/invoiceForm.js";
import { realTitle } from "../../RealApp.js";
import { NO_SAVE, ReviewScreen } from "./ReviewScreen.js";

/**
 * Objective: real mode never claims saving is simulated (it writes to PostgreSQL) on the AI-proposal
 * path or anywhere on Review, while the synthetic preview keeps its simulated-save wording; the real
 * tab title never labels Review/Saved as fixture data.
 */
const html = (real: boolean, source: "ai" | "manual") =>
  renderToString(
    <AppProvider
      state={{
        ...initialState("light"),
        screen: "review",
        review: { form: blankForm(), source, showErrors: false, saveMode: "normal", saveKey: "k" },
      }}
      dispatch={() => undefined}
      session={
        real
          ? { username: "op", signOut: () => undefined, parse: NO_SAVE as never, save: NO_SAVE }
          : null
      }
    >
      <ReviewScreen />
    </AppProvider>,
  ).replace(/<!-- -->/g, "");

describe("real parse proposal -> Review -> real save copy", () => {
  const real = html(true, "ai");
  it("states the truth: not saved yet, saving writes to PostgreSQL, no PayPal, no notification", () => {
    expect(real).toContain("Proposed by the AI parser");
    expect(real).toContain("not saved yet");
    expect(real).toContain("writes it to PostgreSQL");
    expect(real).toContain("does not create a PayPal invoice");
    expect(real).toContain("Save draft");
    expect(real).toContain("Saving writes this draft to PostgreSQL");
  });
  it("contains no 'simulated' wording or fake idempotency-key line anywhere", () => {
    expect(real).not.toMatch(/simulated|Simulated|Local draft|Idempotency-Key:|not saved anywhere/);
  });
  it("manual real Review is equally free of simulated wording", () => {
    expect(html(true, "manual")).not.toMatch(/simulated|Simulated|Idempotency-Key:/);
  });
  it("the synthetic preview keeps its simulated-save messaging", () => {
    const preview = html(false, "ai");
    expect(preview).toContain("Simulated save");
    expect(preview).toContain("Save local draft");
    expect(preview).not.toContain("writes it to PostgreSQL");
  });
});

describe("real tab title", () => {
  it("labels only the dashboard as sample rows; Review, composer and Saved are not fixture data", () => {
    expect(realTitle("dashboard")).toContain("(sample rows)");
    for (const s of ["review", "composer", "saved"] as const) {
      expect(realTitle(s)).not.toMatch(/fixture|sample/i);
    }
    expect(realTitle("saved")).toBe("Saved invoice · NudgeMyInvoice");
  });
});
