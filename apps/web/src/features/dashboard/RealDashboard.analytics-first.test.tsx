import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { ListItem } from "../../domain/serverList.js";
import { NO_FILTERS, initialDash, type DashState } from "./dashboardState.js";
import { RealDashboardView } from "./RealDashboard.js";

// Opt-in Studio is normally off in tests. This small inert marker proves the real
// authenticated view places the Studio slot without loading licensed dependencies.
vi.mock("../studio/StudioSlot.js", () => ({
  StudioSlot: ({ range }: { range: { currency: string } }) => (
    <section id="studio-panel" data-chart-currency={range.currency}>
      Activity analytics
    </section>
  ),
}));

const usd: ListItem = {
  id: "00000000-0000-4000-8000-000000000001",
  customerName: "Synthetic Client",
  customerEmail: "sample@example.invalid",
  currency: "USD",
  dueDate: "2030-01-15",
  total: "10.00",
  createdAt: "2026-10-27T10:00:00.000Z",
  paypalState: "none",
};
const data: AnalyticsSummary = {
  version: 1,
  fromInclusive: NO_FILTERS.fromInclusive,
  toExclusive: NO_FILTERS.toExclusive,
  timeZone: NO_FILTERS.timeZone,
  currencies: [
    {
      currency: "USD",
      exponent: 2,
      invoiceCount: 1,
      totalMinor: "1000",
      stateCounts: { none: 1, progress: 0, created: 0, attention: 0 },
    },
    {
      currency: "EUR",
      exponent: 2,
      invoiceCount: 1,
      totalMinor: "2000",
      stateCounts: { none: 1, progress: 0, created: 0, attention: 0 },
    },
  ],
  days: [],
};

function view(filters: DashState["filters"], summary: AnalyticsSummary = data) {
  const state: DashState = {
    ...initialDash,
    ready: true,
    status: "loaded",
    items: [filters.currency === "EUR" ? { ...usd, currency: "EUR" } : usd],
    filters,
    analyticsStatus: "loaded",
    analytics: summary,
  };
  return renderToString(
    <RealDashboardView
      state={state}
      searchText=""
      startDate={filters.startDate}
      endDate={filters.endDate}
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
}

describe("NMI UI analytics-first layout", () => {
  it("positions the shared currency filters before analytics, analytics before totals, and totals before invoices", () => {
    const html = view(NO_FILTERS);
    const filter = html.indexOf('aria-label="Filter by currency"');
    const chart = html.indexOf('id="studio-panel"');
    const cards = html.indexOf('id="dash-cards"');
    const rows = html.indexOf('data-testid="invoice-grid"');
    expect(filter).toBeGreaterThan(-1);
    expect(chart).toBeGreaterThan(filter);
    expect(cards).toBeGreaterThan(chart);
    expect(rows).toBeGreaterThan(cards);
  });

  it("passes the active top-level currency filter to analytics and identifies the selected pill", () => {
    const filters = { ...NO_FILTERS, currency: "EUR" as const };
    const summary = { ...data, currencies: data.currencies.filter((c) => c.currency === "EUR") };
    const html = view(filters, summary);
    expect(html).toContain('data-chart-currency="EUR"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>EUR<\/button>/);
    expect(html).toContain("Full matching operator-owned EUR total");
    expect(html).not.toContain("Full matching operator-owned USD total");
  });
});
