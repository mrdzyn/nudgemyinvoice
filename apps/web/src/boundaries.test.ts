import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Objective: statically guarantee the web app can talk only to the existing same-origin operator
 * APIs (including the first-party aggregate route), never a provider, and cannot persist credentials
 * or unsaved invoice data. The browser QA harness also observes that all requests remain local.
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
    [
      "src/auth/api.ts",
      "src/parse/api.ts",
      "src/invoices/api.ts",
      "src/followups/api.ts",
      // A5-I1: dev-server-only licence fetch; unreachable in production (see the AG Studio boundaries below).
      "src/features/studio/studioLicence.ts",
    ],
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
  [
    "third-party analytics SDKs",
    /gtag|googletagmanager|segment\.|mixpanel|sentry|posthog|amplitude/i,
  ],
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

  it("only the auth, parse, saved-invoice/aggregate and local follow-up transports call the network, each on its own routes", () => {
    const hits = files.filter((f) => /\bfetch\s*\(/.test(read(f))).map((f) => relative(webRoot, f));
    expect(hits.sort()).toEqual([
      "src/auth/api.ts",
      "src/features/studio/studioLicence.ts",
      "src/followups/api.ts",
      "src/invoices/api.ts",
      "src/parse/api.ts",
    ]);
    const routes = (f: string) =>
      [...read(join(root, f)).matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)].map((m) => m[1]);
    expect(new Set(routes("auth/api.ts"))).toEqual(
      new Set(["/api/auth/session", "/api/auth/login", "/api/auth/logout"]),
    );
    expect(new Set(routes("parse/api.ts"))).toEqual(new Set(["/api/invoice-drafts/parse"]));
    // Local follow-up reminders only: none of these routes can reach a customer, PayPal or OpenAI.
    expect(new Set(routes("followups/api.ts"))).toEqual(
      new Set([
        "/api/follow-ups",
        "/api/invoice-drafts/${invoiceId}/follow-ups",
        "/api/follow-ups/${id}/reschedule",
        "/api/follow-ups/${id}/complete",
        "/api/follow-ups/${id}/cancel",
      ]),
    );
    expect(new Set(routes("invoices/api.ts"))).toEqual(
      new Set([
        "/api/invoice-drafts",
        "/api/invoice-drafts/search",
        "/api/invoice-drafts/${id}",
        "/api/invoice-drafts/${id}/paypal-draft",
        "/api/analytics/summary",
      ]),
    );
  });

  it("C5-P1 wires exactly one PayPal route (POST draft creation, in invoices/api.ts); no direct PayPal/OpenAI host or other provider route", () => {
    const all = files.map(read).join("\n");
    const apiPaths = [...all.matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)].map((m) => m[1] ?? "");
    expect(
      apiPaths.filter(
        (p) =>
          !/^\/api\/(auth\/(session|login|logout)|analytics\/summary|studio\/licence|invoice-drafts(\/parse|\/search|\/\$\{id\}(\/paypal-draft)?|\/\$\{invoiceId\}\/follow-ups)?|follow-ups(\/\$\{id\}\/(reschedule|complete|cancel))?)$/.test(
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

  it("the list request is a POST whose URL carries no query string (search text lives only in the body) and the real dashboard never writes search text to the browser navigation URL or storage", () => {
    const api = read(join(root, "invoices/api.ts"));
    const listBlock = api.slice(
      api.indexOf("async list("),
      api.indexOf("async createPayPalDraft("),
    );
    expect(listBlock).toMatch(/method: "POST"/);
    expect(listBlock).toMatch(/"\/api\/invoice-drafts\/search"/);
    expect(listBlock).not.toMatch(/method: "(GET|PUT|PATCH|DELETE)"|URLSearchParams|\?\$\{|\?q=/);
    expect(listBlock).toMatch(/"x-csrf-token": csrfToken/);
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

  it("adds no runtime dependency beyond React, AG Grid Community and the two A5-I1 AG Studio packages (no router, state manager, icon, font, AI or charts package)", () => {
    const pkg = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "ag-grid-community",
      "ag-grid-react",
      "ag-studio",
      "ag-studio-react",
      "react",
      "react-dom",
    ]);
    // Exact pins, never a range. Community is what the default dashboard uses; the Studio pair (A5-I1) is
    // reachable only through the dev-gated slot (see the AG Studio boundaries below).
    expect(pkg.dependencies["ag-grid-community"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies["ag-grid-react"]).toBe(pkg.dependencies["ag-grid-community"]);
    expect(pkg.dependencies["ag-studio"]).toBe("3.0.0");
    expect(pkg.dependencies["ag-studio-react"]).toBe("3.0.0");
  });

  it("uses AG Grid Community only outside the dev-gated Studio folder: no Enterprise, Studio or license-key code, and only the grid file imports it", () => {
    const outside = files.filter((f) => !relative(webRoot, f).startsWith("src/features/studio/"));
    const all = outside.map(read).join("\n");
    expect(all).not.toMatch(/ag-grid-enterprise|ag-grid-charts|ag-studio|@ag-grid-enterprise/i);
    expect(all).not.toMatch(/LicenseManager|setLicenseKey|licenseKey/);
    // No licence-manager API anywhere, including the Studio folder (the key only ever flows via the provider prop).
    expect(files.map(read).join("\n")).not.toMatch(
      /LicenseManager|setLicenseKey|AgStudioLicenseManager/,
    );
    const importers = outside.filter((f) => /from "ag-grid-|import "ag-grid-/.test(read(f)));
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

  describe("AG Studio (A5-I1 local development + P5 licensed production build)", () => {
    const code = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const studioDir = join(root, "features/studio");
    const studioFiles = sources(studioDir).map((f) => relative(webRoot, f));
    const vite = readFileSync(join(webRoot, "vite.config.ts"), "utf8");
    const bridge = readFileSync(join(webRoot, "vite.studio-dev.ts"), "utf8");

    it("only StudioCharts imports the licensed packages as values; everything else is type-only", () => {
      const valueImport = /^import\s+(?!type\b)[^;]*from\s+["'](ag-studio|ag-studio-react)["']/m;
      const hits = files.filter((f) => valueImport.test(read(f))).map((f) => relative(webRoot, f));
      expect(hits).toEqual(["src/features/studio/StudioCharts.tsx"]);
      expect(read(join(root, "features/studio/studioReport.ts"))).toMatch(
        /import type \{[^}]*\} from "ag-studio"/,
      );
    });

    it("the dashboard reaches Studio only through the build-gated lazy slot, never statically", () => {
      const dash = read(join(root, "features/dashboard/RealDashboard.tsx"));
      expect(dash).toContain('from "../studio/StudioSlot.js"');
      expect(dash).not.toMatch(/StudioPanel|StudioCharts|studioLoader|ag-studio/);
      const slot = read(join(root, "features/studio/StudioSlot.tsx"));
      expect(slot).toContain("import.meta.env.DEV");
      expect(slot).toContain("VITE_NMI_STUDIO_LOCAL");
      expect(slot).toContain("__NMI_STUDIO_LICENSED__");
      expect(code(slot).match(/import\("\.\/StudioPanel\.js"\)/g)).toHaveLength(1);
      expect(slot).not.toMatch(/^import .* from "\.\/Studio(Panel|Charts)\.js"/m);
      const loader = code(read(join(root, "features/studio/studioLoader.ts")));
      expect(loader.match(/(?<!typeof )import\("\.\/StudioCharts\.js"\)/g)).toHaveLength(1);
    });

    it("the licence key is never in app source or defined into a bundle; only a boolean variant flag is defined", () => {
      for (const f of files) expect(read(f), f).not.toMatch(/AG_STUDIO_LICENSE_KEY/);
      expect(vite).not.toMatch(/AG_STUDIO_LICENSE_KEY|envPrefix|loadEnv\([^)]*,\s*["']["']/);
      // The ONLY define is the derived boolean, never a string taken from the environment.
      const defines = [...vite.matchAll(/define\s*:\s*\{([^}]*)\}/g)].map((m) => m[1]?.trim());
      expect(defines).toEqual(['__NMI_STUDIO_LICENSED__: JSON.stringify(variant === "licensed")']);
      expect(vite).toContain('studioVariant(process.env["NMI_WEB_STUDIO"])');
      expect(vite).toContain("studioBuildGuard(variant)");
      expect(bridge).toContain('apply: "serve"');
      expect(code(bridge)).not.toMatch(/\btransform\b|\bload\s*\(|\bdefine\b|process\.env/);
    });

    it("the licence fetch targets only the authenticated API route or the dev bridge and never stores or logs the key", () => {
      const lic = read(join(root, "features/studio/studioLicence.ts"));
      expect([...lic.matchAll(/fetch\(\s*["']([^"']+)["']/g)].map((m) => m[1])).toEqual([
        "/api/studio/licence",
        "/__nmi_dev/studio-licence",
      ]);
      expect(lic).toMatch(
        /import\.meta\s*\.env\.DEV\s*\?\s*fetchDevLicenceKey\s*:\s*fetchProdLicenceKey/,
      );
      for (const f of studioFiles) {
        const src = readFileSync(join(webRoot, f), "utf8");
        expect(src, f).not.toMatch(/console\.|localStorage|sessionStorage|document\.cookie/);
      }
    });

    it("SEC-N1: no app code patches DOM prototypes (the page-wide createElement nonce shim stays removed)", () => {
      for (const f of files)
        expect(code(read(f)), relative(webRoot, f)).not.toMatch(
          /(Document|Node|Element|HTMLElement)\.prototype|defineProperty\([^)]*createElement|\.createElement\s*=/,
        );
    });

    it("Studio receives no customer-facing fields", () => {
      for (const f of ["studioModel.ts", "studioReport.ts", "StudioCharts.tsx"]) {
        expect(code(read(join(studioDir, f))), f).not.toMatch(
          /customer|email|invoiceId|operator|paypalInvoice|csrf|authToken|accessToken|sessionToken|bearer/i,
        );
      }
    });
  });
});
