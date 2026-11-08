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
    // "Check invoice status" is NOT a navigation any more: it opens the in-panel status selector.
    expect(nudgeyAction("status")).toBeNull();
    expect(nudgeyAction("status")).not.toEqual(nudgeyAction("browse"));
  });

  it("renders personalized, bounded shortcuts and clear no-send copy", () => {
    const html = renderToString(
      <NudgeyPanel
        username="operator-x"
        onChoose={() => undefined}
        onClose={() => undefined}
        titleId="nudgey-title"
      />,
    )
      .replace(/<!-- -->/g, "")
      .replace(/&#x27;/g, "\u0027");
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
    // No navigation anchors or draft affordances; React 19 image preload
    // <link> hints are not navigation and are explicitly allowed.
    expect(html).not.toMatch(/paypal-draft|createPayPalDraft|<a[\s>]/);
    expect(html).toContain('/brand/nudge-logo.jpg');
  });

  it("shows Ask Nudgey without losing the status selector or follow-up action", () => {
    const html = renderToString(
      <NudgeyPanel
        username="operator-x"
        onChoose={() => undefined}
        onClose={() => undefined}
        titleId="nudgey-title"
        onAsk={() => undefined}
        onSchedule={() => undefined}
      />,
    );
    expect(html).toContain("Check invoice status");
    expect(html).toContain("Pick an invoice to see its PayPal draft state");
    expect(html).toContain("Ask Nudgey");
    expect(html).toContain("Look up invoices and follow-ups (read-only)");
    expect(html).toContain("Schedule a follow-up");
    expect(nudgeyAction("status")).toBeNull();
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
