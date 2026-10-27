import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Objective: statically guarantee the UI shell cannot talk to a backend or provider and cannot
 * persist unsaved invoice data, so the phase boundary (no real API wiring) cannot regress silently.
 * The Chrome QA harness proves the same at runtime (zero requests, empty storage).
 */
const root = join(import.meta.dirname, ".");
const webRoot = join(root, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}
const files = sources(root);
const read = (p: string) => readFileSync(p, "utf8");

const FORBIDDEN: [string, RegExp][] = [
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["IndexedDB", /\bindexedDB\b|\bIDBFactory\b/i],
  ["cookies", /document\.cookie/],
  ["fetch", /\bfetch\s*\(/],
  ["XMLHttpRequest", /XMLHttpRequest/],
  ["WebSocket/EventSource", /\bWebSocket\b|\bEventSource\b/],
  ["sendBeacon", /sendBeacon/],
  [
    "query-string writes",
    /URLSearchParams\([^)]*\)\.set\(\s*["'](customer|email|name|amount|text)/i,
  ],
  ["console logging", /\bconsole\./],
  ["inline style props", /\bstyle=\{\{/],
  ["raw HTML injection", /dangerouslySetInnerHTML|\.innerHTML\s*=/],
  ["external URLs", /https?:\/\/(?!(?:www\.)?w3\.org)/],
  ["analytics", /gtag|analytics|segment\.|mixpanel|sentry/i],
];

describe("UI shell boundaries", () => {
  it("finds the source files it audits", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(FORBIDDEN)("source never uses %s", (_name, pattern) => {
    const hits = files.filter((f) => pattern.test(read(f))).map((f) => relative(webRoot, f));
    expect(hits).toEqual([]);
  });

  it("history API is used only to mirror screen, demo state and theme", () => {
    const users = files
      .filter((f) => /history\.(replaceState|pushState)/.test(read(f)))
      .map((f) => relative(webRoot, f));
    expect(users).toEqual(["src/App.tsx"]);
  });

  it("adds no runtime dependency beyond React (no AG Studio, router, state manager, icon or font package)", () => {
    const pkg = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["react", "react-dom"]);
  });

  it("does not embed the real Sandbox smoke invoice id or any credential-like literal", () => {
    const all = files.map(read).join("\n");
    expect(all).not.toContain(["INV2", "U92W", "76NX", "3P2E", "AGUZ"].join("-"));
    expect(all).not.toMatch(/client[_-]?secret|api[_-]?key|bearer\s+[A-Za-z0-9]/i);
  });

  it("production CSP forbids network connections and inline styles", () => {
    const vite = readFileSync(join(webRoot, "vite.config.ts"), "utf8");
    expect(vite).toContain("connect-src 'none'");
    expect(vite).toContain("default-src 'none'");
    expect(vite).not.toMatch(/style-src[^"]*unsafe-inline/);
    expect(vite).not.toMatch(/script-src[^"]*unsafe/);
  });
});
