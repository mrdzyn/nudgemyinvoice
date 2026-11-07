import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProvider } from "../../demo/AppContext.js";
import { initialState } from "../../demo/appState.js";
import { FIXTURE_INVOICES } from "../../demo/fixtures.js";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { ListItem } from "../../domain/serverList.js";
import { NO_FILTERS, initialDash, type DashState } from "./dashboardState.js";
import { DashboardScreen } from "./DashboardScreen.js";
import { RealDashboardView } from "./RealDashboard.js";

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
const range = NO_FILTERS;
const summary: AnalyticsSummary = {
  version: 1,
  fromInclusive: range.fromInclusive,
  toExclusive: range.toExclusive,
  timeZone: range.timeZone,
  currencies: [
    {
      currency: "USD",
      exponent: 2,
      invoiceCount: 2,
      totalMinor: "2000",
      stateCounts: { none: 1, progress: 0, created: 1, attention: 0 },
    },
  ],
  days: [{ day: "2026-10-27", currency: "USD", exponent: 2, invoiceCount: 2, totalMinor: "2000" }],
};
const view = (s: Partial<DashState>, search = "") => {
  const state = { ...initialDash, ...s };
  return renderToString(
    <RealDashboardView
      state={state}
      searchText={search}
      startDate={state.filters.startDate}
      endDate={state.filters.endDate}
      onSearchText={() => undefined}
      onFilters={() => undefined}
      onDateRange={() => undefined}
      onRetry={() => undefined}
      onAnalyticsRetry={() => undefined}
      onClearFilters={() => undefined}
      onLoadMore={() => undefined}
      onOpen={() => undefined}
      onNew={() => undefined}
    />,
  ).replace(/<!-- -->/g, "");
};
const fixtureLeak = (html: string) => {
  for (const f of FIXTURE_INVOICES) {
    expect(html).not.toContain(f.draft.customerName);
    expect(html).not.toContain(f.id);
  }
  expect(html).not.toMatch(/DEMO \/ SYNTHETIC|fabricated|synthetic fixtures/i);
};

describe("authenticated dashboard states", () => {
  it("keeps rows and totals loading states explicit without substituting fixtures", () => {
    const h = view({ status: "loading", ready: true });
    expect(h).toContain('id="dash-search"');
    expect(h).toContain("Loading matching invoice rows");
    expect(h).toContain("Loading full-population totals");
    expect(h).not.toContain("Customer 1");
    fixtureLeak(h);
  });

  it("renders only server-provided full-population totals beside loaded rows", () => {
    const h = view({
      status: "loaded",
      items: [item(1, { paypalState: "created" }), item(2)],
      analyticsStatus: "loaded",
      analytics: summary,
    });
    expect(h).toContain('data-testid="invoice-grid"');
    expect(h).toContain("Full matching operator-owned USD total");
    expect(h).toContain("2 invoices");
    expect(h).toContain("$20.00");
    expect(h).toContain("PayPal Sandbox drafts created:");
    expect(h).toContain("not only rows loaded below");
    expect(h).toContain("Matching invoices owned by this operator");
    expect(h).not.toMatch(/Grand total|All currencies total/i);
    fixtureLeak(h);
  });

  it("shows the real matching-invoice total in the head once analytics load, nothing before", () => {
    const loaded = view({
      status: "loaded",
      items: [item(1), item(2)],
      analyticsStatus: "loaded",
      analytics: summary,
    });
    expect(loaded).toContain('data-testid="dash-match-total"');
    expect(loaded).toContain("2");
    expect(loaded).toContain("matching invoice");
    expect(loaded).not.toMatch(/Grand total|All currencies total/i);
    const loading = view({ status: "loading", ready: true });
    expect(loading).not.toContain("dash-match-total");
    fixtureLeak(loaded);
  });

  it("does not substitute loaded-row estimates when full analytics fail", () => {
    const h = view({
      status: "loaded",
      items: [item(1)],
      analyticsStatus: "error",
      analyticsError: "offline",
    });
    expect(h).toContain("Could not load full-population totals");
    expect(h).toContain("No loaded-row estimate is substituted");
    expect(h).toContain('id="dash-analytics-retry"');
    expect(h).not.toContain("currency-card");
  });

  it("keeps search/date/currency controls during a new filter load and debounce", () => {
    const loading = view({ status: "loading", ready: true, searchPending: true }, "zeta");
    expect(loading).toContain('id="dash-search"');
    expect(loading).toContain('value="zeta"');
    expect(loading).toContain('id="dash-date-start"');
    expect(loading).toContain("Applying the search");
    expect(loading).not.toContain("currency-card");
  });

  it("blocks invalid date ranges and hides previously loaded rows and totals", () => {
    const h = view({
      ready: true,
      status: "loaded",
      items: [item(1)],
      analyticsStatus: "loaded",
      analytics: summary,
      rangeError: "Choose a valid range.",
    });
    expect(h).toContain("Choose a valid created-date range");
    expect(h).not.toContain('data-testid="invoice-grid"');
    expect(h).not.toContain("currency-card");
  });
});

describe("isolation from the synthetic preview", () => {
  const html = (mode: "real" | "list-only" | "preview") =>
    renderToString(
      <AppProvider
        state={{ ...initialState("light"), screen: "dashboard" }}
        dispatch={() => undefined}
        session={
          mode !== "preview"
            ? {
                username: "op",
                signOut: () => undefined,
                listInvoices: () => new Promise(() => undefined),
                ...(mode === "real"
                  ? { analyticsInvoices: () => new Promise(() => undefined) }
                  : {}),
              }
            : null
        }
      >
        <DashboardScreen />
      </AppProvider>,
    ).replace(/<!-- -->/g, "");
  it("a real session renders loading state and no fixtures", () => {
    const h = html("real");
    expect(h).toContain("Loading matching invoices and full-population totals");
    fixtureLeak(h);
  });
  it("the preview keeps its fixture rows and DEMO / SYNTHETIC label", () => {
    const h = html("preview");
    expect(h).toContain("DEMO / SYNTHETIC");
    expect(h).toContain(FIXTURE_INVOICES[0]?.draft.customerName);
    expect(h).not.toContain("Loading invoices");
  });
  it("a real session missing its aggregate fails closed instead of showing the fixture preview", () => {
    const h = html("list-only");
    expect(h).toContain("Full-population dashboard analytics are unavailable");
    expect(h).toContain("no synthetic preview data has been substituted");
    fixtureLeak(h);
  });
});
