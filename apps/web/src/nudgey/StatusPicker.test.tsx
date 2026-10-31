import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NudgeyPanel } from "../components/Nudgey.js";
import type { ListItem } from "../domain/serverList.js";
import { DRAFT_ONLY_NOTE, StatusPicker } from "./StatusPicker.js";
import { STATUS_PAGE, type StatusState } from "./statusLookup.js";

const clean = (h: string) => h.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
const noop = () => undefined;
const item = (n: number, over: Partial<ListItem> = {}): ListItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  customerName: `Customer ${n}`,
  customerEmail: `c${n}@example.com`,
  currency: "USD",
  dueDate: "2030-01-15",
  total: "540.00",
  createdAt: "2026-10-30T12:00:00.000Z",
  paypalState: "none",
  ...over,
});
const st = (over: Partial<StatusState> = {}): StatusState => ({
  phase: "ready",
  term: "",
  items: [],
  more: false,
  failure: null,
  invalidTerm: false,
  selectedId: null,
  ...over,
});
const view = (state: StatusState) =>
  clean(
    renderToString(
      <StatusPicker
        state={state}
        onSearch={noop}
        onSelect={noop}
        onRetry={noop}
        onOpen={noop}
        onBack={noop}
        onCreate={noop}
      />,
    ),
  );

describe("Nudgey home: the status action is its own, distinct entry", () => {
  const base = { username: "op", onChoose: noop, onClose: noop, titleId: "t" };
  it("keeps 'View my invoices' unchanged and describes the status action as picking an invoice's draft state", () => {
    const html = clean(renderToString(<NudgeyPanel {...base} />));
    for (const t of [
      "Create an invoice",
      "View my invoices",
      "Browse your AG Grid dashboard",
      "Check invoice status",
      "Pick an invoice to see its PayPal draft state",
      "Nothing is sent automatically",
    ])
      expect(html).toContain(t);
    expect(html).not.toContain("Open an invoice to see its PayPal status");
  });
});

describe("status selector states", () => {
  it("loading: an honest loading message (not an empty list), a labelled search box and Back", () => {
    for (const s of [st({ phase: "idle" }), st({ phase: "loading" })]) {
      const html = view(s);
      expect(html).toContain("Loading your invoices…");
      expect(html).toContain("Search your invoices");
      expect(html).toContain('type="search"');
      expect(html).toContain('maxLength="100"');
      expect(html).toContain("Back");
      expect(html).not.toContain("You have no saved invoices yet");
    }
    expect(view(st({ phase: "loading" }))).toContain('aria-busy="true"');
  });

  it("states the draft-only meaning up front and never claims a payment state", () => {
    const html = view(st({ items: [item(1, { paypalState: "created" }), item(2)] }));
    expect(html).toContain(DRAFT_ONLY_NOTE);
    expect(html.replaceAll(DRAFT_ONLY_NOTE, "")).not.toMatch(
      /\bpaid\b|unpaid|overdue|settled|payment received/i,
    );
  });

  it("shows each saved invoice with its own currency, total, due date and PayPal draft state", () => {
    const html = view(
      st({
        items: [
          item(1, { paypalState: "created" }),
          item(2, { currency: "EUR", total: "431.98" }),
          item(3, { paypalState: "rejected" }),
        ],
      }),
    );
    expect(html).toContain("USD 540.00");
    expect(html).toContain("EUR 431.98");
    expect(html).toContain("Invoice due January 15, 2030");
    expect(html).toContain("PayPal draft created");
    expect(html).toContain("No PayPal draft");
    expect(html).toContain("PayPal rejected");
    expect(html).toContain("Showing 3 invoices.");
    expect(html).not.toMatch(/971\.98|combined|total of/i);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Select an invoice to see its draft state and open its details.");
  });

  it("a selected invoice shows its draft state and offers 'Open invoice details' with an accessible name", () => {
    const html = view(
      st({ items: [item(1, { paypalState: "created" }), item(2)], selectedId: item(1).id }),
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("PayPal Sandbox draft: <strong>PayPal draft created</strong>");
    expect(html).toContain("Open invoice details");
    expect(html).toContain(" for Customer 1");
    const none = view(st({ items: [item(2)], selectedId: item(2).id }));
    expect(none).toContain("PayPal Sandbox draft: <strong>No PayPal draft</strong>");
  });

  it("empty account: says so and offers Create an invoice; no match: names the search", () => {
    const empty = view(st({ items: [] }));
    expect(empty).toContain("You have no saved invoices yet.");
    expect(empty).toContain("Create an invoice");
    const none = view(st({ items: [], term: "Nobody Ltd" }));
    expect(none).toContain("No saved invoices match “Nobody Ltd”.");
    expect(none).not.toContain("You have no saved invoices yet");
  });

  it("truncation is disclosed and never presented as a total", () => {
    const html = view(st({ items: [item(1)], more: true }));
    expect(html).toContain(`This is only the first ${STATUS_PAGE}`);
    expect(html).toContain("search by customer");
    const matching = view(st({ items: [item(1)], term: "Acme" }));
    expect(matching).toContain("Showing 1 invoice matching “Acme”.");
  });

  it("each failure is an alert with its own text and a retry, and never an empty-account message", () => {
    for (const [failure, text] of [
      ["offline", "couldn't reach the server"],
      ["unavailable", "couldn't load your invoices right now"],
      ["malformed", "wasn't in the expected format"],
      ["forbidden", "didn't accept this request"],
      ["rejected", "didn't accept that search"],
    ] as const) {
      const html = view(st({ phase: "error", failure }));
      expect(html, failure).toContain(text);
      expect(html).toContain('role="alert"');
      expect(html).toContain("Try again");
      expect(html).not.toContain("You have no saved invoices yet");
    }
  });

  it("an unusable search term is an alert and shows no stale matches", () => {
    const html = view(st({ invalidTerm: true }));
    expect(html).toContain("That search can't be used");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("You have no saved invoices yet");
  });

  it("escapes customer-controlled text everywhere", () => {
    const evil = item(1, { customerName: "<img src=x onerror=alert(1)>" });
    for (const state of [
      st({ items: [evil] }),
      st({ items: [evil], selectedId: evil.id }),
      st({ items: [], term: "<script>alert(1)</script>" }),
    ]) {
      const html = renderToString(
        <StatusPicker
          state={state}
          onSearch={noop}
          onSelect={noop}
          onRetry={noop}
          onOpen={noop}
          onBack={noop}
          onCreate={noop}
        />,
      );
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<script>");
    }
  });
});

describe("security boundary of the status selector sources", () => {
  const dir = join(import.meta.dirname);
  const files = readdirSync(dir).filter((f) =>
    /^(statusLookup|useStatusLookup|StatusPicker)\.tsx?$/.test(f),
  );
  const src = files
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("finds the files it audits", () => {
    expect(files.sort()).toEqual(["StatusPicker.tsx", "statusLookup.ts", "useStatusLookup.ts"]);
    expect(statSync(join(dir, files[0] as string)).isFile()).toBe(true);
  });
  it("makes no network call of its own, touches no storage, URL, provider or mail code", () => {
    expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(src).not.toMatch(
      /localStorage|sessionStorage|indexedDB|document\.cookie|location\.|history\./,
    );
    expect(src).not.toMatch(
      /paypal-draft|createPayPalDraft|openai|smtp|nodemailer|mailto:|https?:\/\//i,
    );
    expect(src).not.toMatch(/dangerouslySetInnerHTML|innerHTML|style=\{\{/);
  });
  it("is wired only to the existing session.listInvoices (no new endpoint) and the guarded dispatch", () => {
    const nudgey = readFileSync(join(dir, "..", "components", "Nudgey.tsx"), "utf8");
    expect(nudgey).toContain("useStatusLookup({ listInvoices, expired })");
    expect(nudgey).toContain("dispatch(statusOpenAction(id))");
    const all = (function walk(d: string): string[] {
      return readdirSync(d).flatMap((f) =>
        statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
      );
    })(join(dir, ".."));
    const apiFiles = all
      .filter(
        (f) =>
          /\.(ts|tsx)$/.test(f) &&
          !/\.test\./.test(f) &&
          /\bfetch\s*\(/.test(readFileSync(f, "utf8")),
      )
      .map((f) => relative(join(dir, ".."), f));
    expect(apiFiles.sort()).toEqual([
      "auth/api.ts",
      "followups/api.ts",
      "invoices/api.ts",
      "parse/api.ts",
    ]);
  });
});
