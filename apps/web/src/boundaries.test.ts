import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Objective: statically guarantee the web app can talk ONLY to the three same-origin operator-auth
 * routes (never a provider, never an invoice route) and cannot persist credentials or unsaved
 * invoice data, so the C1 phase boundary cannot regress silently.
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

/** [name, pattern, the files (relative to apps/web) allowed to match]. */
const FORBIDDEN: [string, RegExp, string[]?][] = [
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["IndexedDB", /\bindexedDB\b|\bIDBFactory\b/i],
  ["cookies", /document\.cookie/],
  [
    "fetch outside the auth transport",
    /\bfetch\s*\(/,
    ["src/auth/api.ts", "src/parse/api.ts", "src/invoices/api.ts"],
  ],
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

  it.each(FORBIDDEN)("source never uses %s", (_name, pattern, allowed) => {
    const hits = files
      .filter((f) => pattern.test(read(f)))
      .map((f) => relative(webRoot, f))
      .filter((f) => !allowed?.includes(f));
    expect(hits).toEqual([]);
  });

  it("only the auth, parse and saved-invoice transports call the network, each on its own routes", () => {
    const hits = files.filter((f) => /\bfetch\s*\(/.test(read(f))).map((f) => relative(webRoot, f));
    expect(hits.sort()).toEqual(["src/auth/api.ts", "src/invoices/api.ts", "src/parse/api.ts"]);
    const routes = (f: string) =>
      [...read(join(root, f)).matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)].map((m) => m[1]);
    expect(new Set(routes("auth/api.ts"))).toEqual(
      new Set(["/api/auth/session", "/api/auth/login", "/api/auth/logout"]),
    );
    expect(new Set(routes("parse/api.ts"))).toEqual(new Set(["/api/invoice-drafts/parse"]));
    expect(new Set(routes("invoices/api.ts"))).toEqual(
      new Set([
        "/api/invoice-drafts",
        "/api/invoice-drafts?${params.toString()}",
        "/api/invoice-drafts/${id}",
        "/api/invoice-drafts/${id}/paypal-draft",
      ]),
    );
  });

  it("C5-P1 wires exactly one PayPal route (POST draft creation, in invoices/api.ts); no direct PayPal/OpenAI host or other provider route", () => {
    const all = files.map(read).join("\n");
    const apiPaths = [...all.matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)].map((m) => m[1] ?? "");
    expect(
      apiPaths.filter(
        (p) =>
          !/^\/api\/(auth\/(session|login|logout)|invoice-drafts(\/parse|\/\$\{id\}(\/paypal-draft)?|\?\$\{params\.toString\(\)\})?)$/.test(
            p,
          ),
      ),
    ).toEqual([]);
    expect(all).not.toMatch(/paypal\.com|openai\.com|api\.openai/i);
    // the PayPal route string lives in exactly one file
    expect(
      files
        .filter((f) => /["'`]\/api\/[^"'`]*paypal-draft/.test(read(f)))
        .map((f) => relative(webRoot, f)),
    ).toEqual(["src/invoices/api.ts"]);
  });

  it("the list request is a GET (its q parameter is part of the HTTP request URL) and the real dashboard never writes search text to the browser navigation URL or storage", () => {
    const api = read(join(root, "invoices/api.ts"));
    const listBlock = api.slice(
      api.indexOf("async list("),
      api.indexOf("async createPayPalDraft("),
    );
    expect(listBlock).toMatch(/method: "GET"/);
    expect(listBlock).not.toMatch(/method: "(POST|PUT|PATCH|DELETE)"|body:/);
    const dash = [
      "features/dashboard/RealDashboard.tsx",
      "features/dashboard/useDashboard.ts",
      "features/dashboard/dashboardState.ts",
    ]
      .map((f) => read(join(root, f)))
      .join("\n");
    expect(dash).not.toMatch(
      /location\.|history\.|localStorage|sessionStorage|indexedDB|document\.cookie/,
    );
  });

  it("the saved-invoice transport sends only the save body, never totals, ids or status", () => {
    const src = read(join(root, "invoices/api.ts"));
    expect(src).toMatch(/body: JSON\.stringify\(saveBody\(draft\)\)/);
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });

  it("the real app never imports the synthetic preview, demo controls or hash routing", () => {
    for (const f of [
      "RealApp.tsx",
      "auth/useAuthController.ts",
      "auth/api.ts",
      "auth/authState.ts",
      "parse/api.ts",
      "parse/runner.ts",
      "invoices/api.ts",
      "invoices/saveRunner.ts",
      "invoices/useRealSave.ts",
      "features/saved/SavedDetailScreen.tsx",
      "features/dashboard/RealDashboard.tsx",
      "features/dashboard/useDashboard.ts",
      "features/dashboard/dashboardState.ts",
      "domain/serverList.ts",
    ]) {
      expect(read(join(root, f)), f).not.toMatch(
        /DemoControls|demo\/hash|from "\.\/App\.js"|location\.hash/,
      );
    }
  });

  it("the synthetic preview is loaded only behind the dev-server build constant", () => {
    const main = read(join(root, "main.tsx"));
    expect(main).toContain("import.meta.env.DEV");
    expect(main).toContain("VITE_NMI_SYNTHETIC_PREVIEW");
    expect(main.split('import("./App.js")')).toHaveLength(2);
    expect(main).not.toMatch(/^import .* from "\.\/App\.js"/m);
  });

  it("never reads or writes cookies or the CSRF token outside memory", () => {
    const all = files.map(read).join("\n");
    expect(all).not.toMatch(/document\.cookie|Set-Cookie/i);
    expect(all).not.toMatch(/(local|session)Storage\.\w+\([^)]*csrf/i);
  });

  it("history API is used only to mirror screen, demo state and theme", () => {
    const users = files
      .filter((f) => /history\.(replaceState|pushState)/.test(read(f)))
      .map((f) => relative(webRoot, f));
    expect(users).toEqual(["src/App.tsx"]);
  });

  it("adds no runtime dependency beyond React and the two AG Grid Community packages (no AG Studio, Enterprise, router, state manager, icon or font package)", () => {
    const pkg = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "ag-grid-community",
      "ag-grid-react",
      "react",
      "react-dom",
    ]);
    // Exact pins, never a range: the licensed-for-free Community build is what was verified.
    expect(pkg.dependencies["ag-grid-community"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies["ag-grid-react"]).toBe(pkg.dependencies["ag-grid-community"]);
  });

  it("uses AG Grid Community only: no Enterprise, Studio or license-key code, and only the grid file imports it", () => {
    const all = files.map(read).join("\n");
    expect(all).not.toMatch(/ag-grid-enterprise|ag-grid-charts|ag-studio|@ag-grid-enterprise/i);
    expect(all).not.toMatch(/LicenseManager|setLicenseKey|licenseKey/);
    const importers = files.filter((f) => /from "ag-grid-|import "ag-grid-/.test(read(f)));
    expect(importers.map((f) => f.split("/").pop()).sort()).toEqual(["InvoiceGrid.tsx"]);
  });

  it("the grid keeps AG Grid's cell keyboard navigation: cell focus is never suppressed and no timer-driven focus handoff exists", () => {
    const grid = read(files.find((f) => f.endsWith("InvoiceGrid.tsx")) as string);
    expect(grid).not.toMatch(/suppressCellFocus|suppressHeaderFocus|suppressKeyboardEvent/);
    expect(grid).not.toMatch(/setTimeout|requestAnimationFrame|\.focus\(\)/);
    expect(grid).toMatch(/onCellKeyDown=/);
  });

  it("does not embed the real Sandbox smoke invoice id or any credential-like literal", () => {
    const all = files.map(read).join("\n");
    expect(all).not.toContain(["INV2", "U92W", "76NX", "3P2E", "AGUZ"].join("-"));
    expect(all).not.toMatch(/client[_-]?secret|api[_-]?key|bearer\s+[A-Za-z0-9]/i);
  });

  it("production CSP allows only same-origin connections and no inline styles", () => {
    const vite = readFileSync(join(webRoot, "vite.config.ts"), "utf8");
    expect(vite).toContain("connect-src 'self'");
    const csp = /content:\s*"([^"]*)"/.exec(vite)?.[1] ?? "";
    expect(csp).toMatch(/connect-src 'self';/);
    expect(csp).not.toMatch(/\*|https?:|wss?:|unsafe/);
    expect(vite).toContain("default-src 'none'");
    expect(vite).not.toMatch(/style-src[^"]*unsafe-inline/);
    expect(vite).not.toMatch(/script-src[^"]*unsafe/);
  });
});
