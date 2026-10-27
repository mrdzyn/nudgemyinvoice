import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RealApp, RealView, isBlockedInRealMode } from "./RealApp.js";
import { authReducer, initialAuthState, type AuthState } from "./auth/authState.js";
import { createAuthApi } from "./auth/api.js";

/**
 * Objective: in real mode nothing protected is rendered before the server confirms a session, and
 * no hash, direct link or demo action can express "signed in". (Server rendering never runs effects,
 * so this is exactly the first paint a visitor gets; the browser journey covers what follows.)
 */
const api = createAuthApi(() => Promise.reject(new Error("no network in render tests")));
const render = () => renderToString(<RealApp api={api} />).replace(/<!-- -->/g, "");

describe("real app first paint", () => {
  it("shows only a status message while the server session is being checked", () => {
    const html = render();
    expect(html).toContain("Checking your session");
    expect(html).toContain('role="status"');
    for (const protectedCopy of [
      "Invoice drafts",
      "New invoice",
      "Sign out",
      "$702.00",
      "Acme Design",
      "DEMO / SYNTHETIC",
      "Signed in as",
    ])
      expect(html).not.toContain(protectedCopy);
  });

  it("has no design-review controls, scenario picker or simulated-login copy", () => {
    const html = render();
    expect(html).not.toMatch(/Design review controls|state-select|Simulated sign-in|rc-btn/);
    expect(html).not.toMatch(/Demo of HTTP/);
  });

  it("ignores a protected hash in the URL", () => {
    const g = globalThis as { location?: unknown };
    const prev = g.location;
    g.location = { hash: "#screen=dashboard&state=default" };
    try {
      const html = render();
      expect(html).toContain("Checking your session");
      expect(html).not.toContain("Invoice drafts");
    } finally {
      g.location = prev;
    }
  });
});

describe("real mode blocks every demo path to an authenticated or login state", () => {
  it.each([
    [{ type: "sign-in" }, true],
    [{ type: "sign-out" }, true],
    [{ type: "scenario", id: "dashboard-empty" }, true],
    [{ type: "navigate", screen: "login" }, true],
    [{ type: "navigate", screen: "dashboard" }, false],
    [{ type: "navigate", screen: "composer" }, false],
  ] as const)("%j blocked=%s", (action, blocked) => {
    expect(isBlockedInRealMode(action as never)).toBe(blocked);
  });
});

/** Audit MEDIUM-1: while a sign-out is pending, no protected UI may be rendered. */
describe("real view while sign-out is pending", () => {
  const session = {
    operator: { id: "op", username: "operator-x" },
    csrfToken: "csrf-secret-value",
    expiresAtMs: 1,
  };
  const authed = authReducer(initialAuthState, { type: "signed-in", session });
  const locked = authReducer(authed, { type: "sign-out-started" });
  const view = (state: AuthState) =>
    renderToString(
      <RealView
        state={state}
        theme="light"
        login={() => Promise.reject(new Error("no network"))}
        logout={() => undefined}
      />,
    ).replace(/<!-- -->/g, "");

  it("the authenticated view shows the workspace (control for the assertions below)", () => {
    const html = view(authed);
    expect(html).toContain("Invoice drafts");
    expect(html).toContain("Signed in as operator-x");
    expect(html).toContain("Sign out");
  });

  it("the signing-out view contains none of it: no navigation, drafts, composer, operator name or sign-out control", () => {
    const html = view(locked);
    for (const protectedCopy of [
      "Invoice drafts",
      "New invoice",
      "Sign out",
      "Signed in as",
      "operator-x",
      "$702.00",
      "Acme Design",
      "DEMO / SYNTHETIC",
      "comp-text",
      "app-nav",
      "mobile-nav",
    ])
      expect(html, protectedCopy).not.toContain(protectedCopy);
    expect(html).toContain("Signing out");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("csrf-secret-value");
  });

  it("the signing-out view is not a sign-in form either (no new login while revocation is pending)", () => {
    expect(view(locked)).not.toContain("login-password");
  });

  it("after the sign-out ends the unconfirmed notice is shown on a clean sign-in form, never the workspace", () => {
    const html = view(authReducer(locked, { type: "ended", notice: "logout-unconfirmed" }));
    expect(html).toContain("Sign-out could not be confirmed");
    expect(html).toContain("login-password");
    expect(html).not.toContain("Invoice drafts");
  });

  it("a confirmed sign-out is announced only for notice 'signed-out'", () => {
    expect(view(authReducer(locked, { type: "ended", notice: "signed-out" }))).toContain(
      "You have been signed out",
    );
    expect(
      view(authReducer(locked, { type: "ended", notice: "logout-unconfirmed" })),
    ).not.toContain("You have been signed out");
  });
});
