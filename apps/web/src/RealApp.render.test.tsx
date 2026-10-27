import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RealApp, isBlockedInRealMode } from "./RealApp.js";
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
