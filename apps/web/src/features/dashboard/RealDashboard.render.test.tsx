import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProvider } from "../../demo/AppContext.js";
import { initialState } from "../../demo/appState.js";
import { FIXTURE_INVOICES } from "../../demo/fixtures.js";
import type { ListItem } from "../../domain/serverList.js";
import { DashboardScreen } from "./DashboardScreen.js";
import { initialDash, type DashState } from "./dashboardState.js";
import { RealDashboardView, summarize } from "./RealDashboard.js";

/**
 * Objective: the real dashboard renders only what the server listed. Every state (loading, empty, no
 * match, loaded, loading more, end, errors) is honest; a failed load never shows a fixture; amounts
 * of different currencies are never combined and summaries are labelled as covering loaded rows only;
 * the synthetic preview keeps its fixtures and the real component never reaches them.
 */
const item = (n: number, over: Partial<ListItem> = {}): ListItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  customerName: `Customer ${n}`,
  customerEmail: `c${n}@example.test`,
  currency: "USD",
  dueDate: "2030-01-15",
  total: "10.00",
  createdAt: "2026-10-27T10:00:00.000Z",
  paypalState: "none",
  ...over,
});
const view = (s: Partial<DashState>, search = "") =>
  renderToString(
    <RealDashboardView
      state={{ ...initialDash, ...s }}
      searchText={search}
      onSearchText={() => undefined}
      onFilters={() => undefined}
      onRetry={() => undefined}
      onLoadMore={() => undefined}
      onOpen={() => undefined}
      onNew={() => undefined}
    />,
  ).replace(/<!-- -->/g, "");
const fixtureLeak = (html: string) => {
  for (const f of FIXTURE_INVOICES) {
    expect(html).not.toContain(f.draft.customerName);
    expect(html).not.toContain(f.id);
  }
  expect(html).not.toMatch(/DEMO \/ SYNTHETIC|fabricated|synthetic fixtures/i);
};

describe("states", () => {
  it("A. loading shows skeletons and a status, no rows and no fixtures", () => {
    const h = view({ status: "loading" });
    expect(h).toContain("Loading invoices");
    expect(h).toContain('aria-busy="true"');
    expect(h).not.toContain("<table");
    fixtureLeak(h);
  });
  it("B. loaded rows come from the server list, newest first, each with a View action", () => {
    const h = view({ status: "loaded", items: [item(2), item(1)] });
    // AG Grid draws its rows in the browser (it has no server-side markup), so row content, order and
    // the View actions are asserted in InvoiceGrid.test.tsx and the real-browser journeys.
    expect(h).toContain('data-testid="invoice-grid"');
    expect(h).toContain('class="nmi-grid ag-theme-quartz"');
    expect(h).not.toContain("<table");
    expect(h).toContain("2 invoices loaded");
    expect(h).not.toMatch(/Create PayPal|Send|Delete|Edit/);
    fixtureLeak(h);
  });
  it("C. no invoices at all: an honest empty state that does not mention samples", () => {
    const h = view({ status: "loaded", items: [] });
    expect(h).toContain("No saved invoices yet");
    expect(h).toContain("Create your first invoice");
    expect(h).not.toContain("<table");
    fixtureLeak(h);
  });
  it("D. filters with no match: a distinct state with a working clear action", () => {
    const h = view({
      status: "loaded",
      items: [],
      filters: { currency: "EUR", status: "ALL", q: "" },
    });
    expect(h).toContain("No invoices match these filters");
    expect(h).toContain("Clear filters");
    expect(h).not.toContain("No saved invoices yet");
    expect(view({ status: "loaded", items: [] }, "zebra")).toContain(
      "No invoices match these filters",
    );
  });
  it.each(["offline", "unavailable", "malformed", "forbidden", "rejected"] as const)(
    "E-I. %s: an alert with a genuine Retry and NO substituted data",
    (kind) => {
      const h = view({ status: "error", error: kind });
      expect(h).toContain('role="alert"');
      expect(h).toContain("Could not load your invoices");
      expect(h).toContain('id="dash-retry"');
      expect(h).toContain("no sample data is substituted");
      expect(h).not.toContain("<table");
      expect(h).not.toContain("Customer");
      fixtureLeak(h);
    },
  );
  it("J. loading the next page keeps the rows and shows progress", () => {
    const h = view({ status: "loading-more", items: [item(2), item(1)], nextCursor: "c" });
    expect(h).toContain("Loading more invoices");
    expect(h).toContain('data-testid="invoice-grid"');
    expect(h).not.toContain('id="dash-more"');
  });
  it("a next page that is available offers Load more; K. the end says everything is loaded", () => {
    const more = view({ status: "loaded", items: [item(1)], nextCursor: "c" });
    expect(more).toContain("Load more invoices");
    expect(more).toContain("more are available");
    const end = view({ status: "loaded", items: [item(1)], nextCursor: null });
    expect(end).toContain("All matching invoices are loaded.");
    expect(end).not.toContain("Load more invoices");
  });
  it("a failed next page keeps the loaded rows and offers a retry", () => {
    const h = view({ status: "loaded", items: [item(1)], nextCursor: "c", moreError: "offline" });
    expect(h).toContain("Could not load more invoices");
    expect(h).toContain('data-testid="invoice-grid"');
    expect(h).toContain('id="dash-more-retry"');
  });
});

describe("filter bar stays mounted once the list has been shown", () => {
  it("first load of an unfiltered list shows only skeletons (no controls to lose)", () => {
    expect(view({ status: "loading" })).not.toContain('id="dash-search"');
  });
  it("after a first page, a reload under a new filter keeps the search box and pills (focus is not lost)", () => {
    const h = view({
      status: "loading",
      ready: true,
      items: [],
      filters: { currency: "EUR", status: "ALL", q: "" },
    });
    expect(h).toContain('id="dash-search"');
    expect(h).toContain('aria-busy="true"');
    expect(h).toMatch(/aria-pressed="true">EUR</);
  });
  it("a typed search that is still loading keeps its input", () => {
    const h = view({ status: "loading", ready: true, items: [] }, "zeta");
    expect(h).toContain('id="dash-search"');
    expect(h).toContain('value="zeta"');
  });
  it("an error after a first page keeps the filters next to the Retry", () => {
    const h = view({ status: "error", ready: true, error: "offline" });
    expect(h).toContain('id="dash-search"');
    expect(h).toContain('id="dash-retry"');
  });
  it("an error before anything ever loaded shows just the alert", () => {
    const h = view({ status: "error", ready: false, error: "offline" });
    expect(h).toContain('id="dash-retry"');
    expect(h).not.toContain('id="dash-search"');
  });
});

describe("currency separation and honest summaries", () => {
  const mixed = [
    item(1, { currency: "USD", total: "1000.50", paypalState: "created" }),
    item(2, { currency: "USD", total: "0.55" }),
    item(3, { currency: "EUR", total: "999.99" }),
    item(4, { currency: "JPY", total: "2200", paypalState: "created" }),
    item(5, { currency: "JPY", total: "800" }),
  ];
  it("sums each currency separately with exact integer arithmetic and never across currencies", () => {
    const s = summarize(mixed);
    const by = Object.fromEntries(s.map((c) => [c.currency, c]));
    expect(s.map((c) => c.currency)).toEqual(["USD", "EUR", "JPY"]);
    expect(by["USD"]).toMatchObject({ count: 2, sumMinor: 100105n, paypalCreated: 1 });
    expect(by["EUR"]).toMatchObject({ count: 1, sumMinor: 99999n, paypalCreated: 0 });
    expect(by["JPY"]).toMatchObject({ count: 2, sumMinor: 3000n, paypalCreated: 1 });
  });
  it("is float-safe: classic 0.1 + 0.2 style sums stay exact", () => {
    const tens = Array.from({ length: 3 }, (_, i) => item(i + 1, { total: "0.10" }));
    expect(summarize(tens)[0]?.sumMinor).toBe(30n);
  });
  it("renders one card per currency with the correct formatted sum and a page-summary label", () => {
    const h = view({ status: "loaded", items: mixed, nextCursor: "c" });
    expect(h.match(/class="currency-card"/g)).toHaveLength(3);
    expect(h).toContain("$1,001.05");
    expect(h).toContain("€999.99");
    expect(h).toContain("¥3,000");
    expect(h).toContain("Sum of the 2 loaded invoices in USD");
    expect(h).toContain("Page summary");
    expect(h).toContain("not a total of all your invoices");
    expect(h).toContain("never added together or converted");
    // no cross-currency grand total anywhere
    expect(h).not.toMatch(/Grand total|All currencies total/i);
  });
  it("PayPal counts are scoped to the loaded invoices", () => {
    const h = view({ status: "loaded", items: mixed });
    expect(h).toContain("PayPal Sandbox drafts created among them: 1");
  });
});

describe("filters", () => {
  it("lists every supported currency server-side, not just those on the current page", () => {
    const h = view({ status: "loaded", items: [item(1)] });
    for (const c of ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"])
      expect(h).toContain(`>${c}</button>`);
    expect(h).toContain("PayPal draft created");
    expect(h).toContain("Needs attention");
  });
  it("shows the applied filter as pressed", () => {
    const h = view({
      status: "loaded",
      items: [item(1)],
      filters: { currency: "USD", status: "ALL", q: "" },
    });
    expect(h).toMatch(/aria-pressed="true">USD</);
  });
});

describe("isolation from the synthetic preview", () => {
  const html = (withList: boolean) =>
    renderToString(
      <AppProvider
        state={{ ...initialState("light"), screen: "dashboard" }}
        dispatch={() => undefined}
        session={
          withList
            ? {
                username: "op",
                signOut: () => undefined,
                listInvoices: () => new Promise(() => undefined),
              }
            : null
        }
      >
        <DashboardScreen />
      </AppProvider>,
    ).replace(/<!-- -->/g, "");
  it("a real session renders the loading state and no fixture, even before any answer arrives", () => {
    const h = html(true);
    expect(h).toContain("Loading invoices");
    fixtureLeak(h);
  });
  it("the preview (no session) keeps its fixture rows and DEMO / SYNTHETIC labelling unchanged", () => {
    const h = html(false);
    expect(h).toContain("DEMO / SYNTHETIC");
    expect(h).toContain(FIXTURE_INVOICES[0]?.draft.customerName);
    expect(h).not.toContain("Loading invoices");
  });
});
