// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShell, SandboxStatusButton, SandboxStatusDetail } from "./AppShell.js";
import { AppProvider } from "../demo/AppContext.js";
import { initialState, type AppState } from "../demo/appState.js";

/** P1 action-led header: Safe Mode status disclosure, nav tabs and sign-out. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
  root = null;
});
const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => await Promise.resolve());
};
const state = (over: Partial<AppState> = {}): AppState => ({
  ...initialState("light"),
  authed: true,
  screen: "dashboard",
  ...over,
});
const shell = (s: AppState = state()) =>
  renderToString(
    <AppProvider
      state={s}
      dispatch={() => undefined}
      session={{ username: "op", signOut: () => undefined }}
    >
      <AppShell>
        <p>child</p>
      </AppShell>
    </AppProvider>,
  ).replace(/<!-- -->/g, "");
async function mount(s: AppState = state()) {
  const noop = () => undefined;
  await act(async () => {
    root?.render(
      <AppProvider state={s} dispatch={noop} session={{ username: "op", signOut: noop }}>
        <AppShell>
          <p>child</p>
        </AppShell>
      </AppProvider>,
    );
  });
  await flush();
}
const pill = () => host.querySelector("button.sandbox-pill") as HTMLButtonElement | null;

describe("Safe Mode status disclosure", () => {
  it("names the mode in the header without opening the safeguards", () => {
    const html = shell();
    expect(html).toContain("Sandbox Safe Mode");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("sandbox-detail");
    // Header, tabs and sign-out are untouched.
    expect(html).toContain("NudgeMyInvoice");
    expect(html).toContain("/brand/nudge-horizontal-logo.jpg");
    expect(html).toContain('alt="NudgeMyInvoice"');
    expect(html).toContain("Invoice drafts");
    expect(html).toContain("New invoice");
    expect(html).toContain("Sign out");
    expect(html).toContain("Signed in as op");
  });

  it("opens the exact safeguards on click and closes again (button, labelled region)", async () => {
    await mount();
    expect(pill()?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".sandbox-detail")).toBeNull();
    await act(async () => pill()?.click());
    expect(pill()?.getAttribute("aria-expanded")).toBe("true");
    const detail = host.querySelector(".sandbox-detail");
    expect(detail?.getAttribute("role")).toBe("region");
    expect(detail?.getAttribute("aria-label")).toBe("Sandbox safeguards");
    expect(detail?.textContent).toContain("Safe mode is always on.");
    expect(detail?.textContent).toContain(
      "drafts are never sent and the customer is never emailed",
    );
    expect(detail?.textContent).toContain("No payment is collected, refunded or captured");
    expect(detail?.textContent).not.toMatch(/unpaid|overdue|Final Notice/i);
    await act(async () => pill()?.click());
    expect(pill()?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".sandbox-detail")).toBeNull();
  });

  it("the pure pieces carry the accessible wiring", () => {
    const button = renderToString(
      <SandboxStatusButton open={true} detailId="safe-1" onToggle={() => undefined} />,
    );
    expect(button).toContain('aria-expanded="true"');
    expect(button).toContain('aria-controls="safe-1"');
    const detail = renderToString(<SandboxStatusDetail id="safe-1" />).replace(/<!-- -->/g, "");
    expect(detail).toContain('id="safe-1"');
    expect(detail).toContain("Safe mode is always on.");
  });
});
