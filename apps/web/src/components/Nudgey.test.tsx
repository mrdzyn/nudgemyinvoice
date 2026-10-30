import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NudgeyPanel, nudgeyAction } from "./Nudgey.js";

describe("Nudgey quick actions (no provider calls)", () => {
  it("maps only to existing, guarded app navigation actions", () => {
    expect(nudgeyAction("create")).toEqual({
      type: "navigate",
      screen: "composer",
      resetComposer: true,
    });
    expect(nudgeyAction("browse")).toEqual({ type: "navigate", screen: "dashboard" });
    expect(nudgeyAction("status")).toEqual({ type: "navigate", screen: "dashboard" });
  });

  it("renders personalized, bounded shortcuts and clear no-send copy", () => {
    const html = renderToString(
      <NudgeyPanel
        username="operator-x"
        onChoose={() => undefined}
        onClose={() => undefined}
        titleId="nudgey-title"
      />,
    );
    for (const text of [
      "Nudgey",
      "Hi, operator-x!",
      "What would you like to do today?",
      "Create an invoice",
      "View my invoices",
      "Check invoice status",
      "Nothing is sent automatically",
    ])
      expect(html).toContain(text);
    expect(html).not.toMatch(/paypal-draft|createPayPalDraft|href=/);
  });

  it("escapes the supplied username instead of treating it as HTML", () => {
    const html = renderToString(
      <NudgeyPanel
        username={'<script>alert("x")</script>'}
        onChoose={() => undefined}
        onClose={() => undefined}
        titleId="nudgey-title"
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
