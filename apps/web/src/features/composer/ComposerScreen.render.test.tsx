import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProvider } from "../../demo/AppContext.js";
import { initialState, type ComposerState } from "../../demo/appState.js";
import { ComposerScreen } from "./ComposerScreen.js";

/**
 * Objective: the real composer shows server-origin states honestly. Real mode never offers the
 * fixture example prompts or claims the parse call is simulated; the preview keeps both. Every
 * failure state offers manual entry and renders server text as escaped text.
 */
const render = (real: boolean, parse: ComposerState["parse"], text = "") =>
  renderToString(
    <AppProvider
      state={{ ...initialState("light"), screen: "composer", composer: { text, tab: "ai", parse } }}
      dispatch={() => undefined}
      session={
        real
          ? {
              username: "op",
              signOut: () => undefined,
              parse: () => new Promise(() => undefined),
            }
          : null
      }
    >
      <ComposerScreen />
    </AppProvider>,
  ).replace(/<!-- -->/g, "");

describe("composer real mode vs synthetic preview", () => {
  it("real mode: no fixture prompts, no 'simulated' parse claim, honest provider note", () => {
    const html = render(true, { status: "idle" });
    expect(html).not.toContain("Synthetic example prompts");
    expect(html).not.toContain("is not called");
    expect(html).toContain("Parsing calls the server");
    expect(html).toContain("Saving is");
    expect(html).toContain("not verified live provider parsing");
    expect(html).toContain("Parse with AI");
  });
  it("preview keeps its example prompts and simulated caption", () => {
    const html = render(false, { status: "idle" });
    expect(html).toContain("Synthetic example prompts");
    expect(html).toContain("is not called");
  });
});

describe("composer real-mode result states", () => {
  const manual = "Continue with manual entry";
  it("loading disables the field and shows progress", () => {
    const html = render(true, { status: "loading", clarified: false }, "Invoice Acme");
    expect(html).toContain("Analyzing invoice text");
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
  it("unavailable/ai_not_configured says nothing reached a provider and offers manual entry", () => {
    const html = render(true, { status: "unavailable", reason: "ai_not_configured" });
    expect(html).toContain("not configured on the server");
    expect(html).toContain("not sent to any AI provider");
    expect(html).toContain(manual);
  });
  it("other unavailable reasons do not claim nothing was sent", () => {
    const html = render(true, { status: "unavailable", reason: "model_unavailable" });
    expect(html).toContain("could not complete the AI parse");
    expect(html).not.toContain("not sent to any AI provider");
  });
  it.each([
    [
      { status: "failed", reason: "throttled", retryAfterSeconds: 120 } as const,
      "about 120 seconds",
    ],
    [{ status: "failed", reason: "throttled", retryAfterSeconds: null } as const, "Wait a little"],
    [{ status: "failed", reason: "forbidden" } as const, "did not accept this request"],
    [{ status: "failed", reason: "offline" } as const, "nothing was parsed"],
    [{ status: "failed", reason: "malformed" } as const, "not in the expected format"],
    [{ status: "failed", reason: "service" } as const, "did not respond successfully"],
  ])("failure %j explains itself and offers manual entry", (parse, copy) => {
    const html = render(true, parse, "Invoice Acme");
    expect(html).toContain(copy);
    expect(html).toContain(manual);
    expect(html).toContain("Invoice Acme");
    expect(html).not.toMatch(/csrf|stack|ECONN/i);
  });
  it("renders server-authored messages as escaped text", () => {
    const html = render(true, {
      status: "failed",
      reason: "rejected",
      messages: ['<img src=x onerror="alert(1)">'],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("renders clarification questions as labelled inputs", () => {
    const html = render(true, {
      status: "clarify",
      scenarioId: "",
      questions: [{ field: "dueDate", question: "What is the due date?" }],
    });
    expect(html).toContain("What is the due date?");
    expect(html).toContain("Add answers and parse again");
  });
});
