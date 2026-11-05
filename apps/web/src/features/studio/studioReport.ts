import type { AgReportState, AgStudioProperties } from "ag-studio";
import type { AnalyticsState } from "../../domain/serverAnalytics.js";
import type { StudioCurrency } from "./studioModel.js";

// Type-only imports: nothing from the licensed packages is bundled by this module.

/** Display order and wording of the draft states. "created" means a Sandbox DRAFT exists: not sent, not paid. */
export const STATUS_SERIES: ReadonlyArray<{ state: AnalyticsState; label: string; short: string }> =
  [
    { state: "none", label: "No PayPal draft", short: "No draft" },
    { state: "progress", label: "In progress", short: "In progress" },
    { state: "created", label: "PayPal draft created", short: "Draft created" },
    { state: "attention", label: "Needs attention", short: "Attention" },
  ];

type StudioData = NonNullable<AgStudioProperties["data"]>;

/** The only rows Studio ever sees: bucket label, exact decimal value, invoice count. No customer/invoice fields. */
export interface TrendRow {
  seq: number;
  period: string;
  title: string;
  value: number;
  invoices: number;
}

export function trendRows(cur: StudioCurrency): TrendRow[] {
  return cur.buckets.map((b) => ({
    seq: b.index,
    period: b.axis,
    title: b.title,
    // Safe only because chartSafe bounds every bucket far below 2^53; the exact string is in the table.
    value: Number(b.minor) / 10 ** cur.exponent,
    invoices: b.count,
  }));
}

export function currencyNumberFormat(
  cur: Pick<StudioCurrency, "currency" | "exponent">,
): Intl.NumberFormat {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur.currency,
    minimumFractionDigits: cur.exponent,
    maximumFractionDigits: cur.exponent,
  });
}

export function buildTrendData(cur: StudioCurrency): StudioData {
  return {
    sources: [
      {
        id: "trend",
        name: `${cur.currency} invoice value`,
        data: trendRows(cur),
        fields: [
          { id: "seq", name: "Order", format: "integerFormat", hide: true },
          {
            id: "period",
            name: cur.mode === "weekly" ? "Week starting" : "Day",
            format: "textFormat",
          },
          { id: "title", name: cur.mode === "weekly" ? "Week" : "Date", format: "textFormat" },
          {
            id: "value",
            name: `Invoice value (${cur.currency})`,
            format: "currencyFormat",
            formatOptions: { format: currencyNumberFormat(cur) },
          },
          { id: "invoices", name: "Invoices", format: "integerFormat" },
        ],
      },
    ],
  };
}

export function buildStatusData(currencies: readonly StudioCurrency[]): StudioData {
  return {
    sources: [
      {
        id: "status",
        name: "PayPal Sandbox draft status",
        data: currencies.map((c) => ({
          currency: c.currency,
          ...Object.fromEntries(STATUS_SERIES.map(({ state }) => [state, c.stateCounts[state]])),
        })),
        fields: [
          { id: "currency", name: "Currency", format: "textFormat" },
          ...STATUS_SERIES.map(({ state, label }) => ({
            id: state,
            name: label,
            format: "integerFormat" as const,
          })),
        ],
      },
    ],
  };
}

/** View-only: no filters panel, no cross-filtering, no titles (the page supplies headings), no legend zoom/navigator. */
const quiet = {
  common: { legend: { enabled: false }, zoom: { enabled: false }, navigator: { enabled: false } },
};
const widgetChrome = (surface: string) => ({
  backgroundColor: surface,
  borderEnabled: false,
  borderRadius: 0,
});

/** Page layout: no padding, no frame, the NMI card surface, and a compact row height on narrow screens. */
const pageLayout = (surface: string, compact: boolean) => ({
  minWidth: 240,
  columns: 24,
  rowHeight: compact ? 11 : 14,
  pagePadding: 0,
  widgetPadding: 0,
  backgroundColor: surface,
  widgetBackgroundColor: surface,
  widgetBorderEnabled: false,
});

/** Desktop / narrow-screen Studio row height (px) used by `pageLayout`. */
const rowPx = (compact: boolean) => (compact ? 11 : 14);

/** Trend chart container height in px (studio.css .studio-canvas-trend uses the same numbers). */
export const TREND_HEIGHT_PX = { desktop: 252, compact: 220 } as const;

/**
 * Status chart height in px for `rows` currencies: one slim bar per currency plus room for the axis. Matches the
 * .studio-rows-N classes in studio.css, so bars stay proportionate instead of filling a fixed tall box.
 */
export const statusHeightPx = (rows: number): number => 56 + 26 * Math.min(Math.max(rows, 1), 8);

/** Muted, smaller axis text; the page heading already names the measure and currency. */
const axisLabel = { fontSize: 11 } as const;

export function buildTrendState(
  cur: StudioCurrency,
  surface: string,
  compact: boolean,
): AgReportState {
  return {
    selectedPageId: "page",
    pages: [
      {
        id: "page",
        layout: pageLayout(surface, compact),
        widgets: {
          trend: {
            type: "column-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "trend.period" }],
              valueKey: [{ id: "trend.value", aggregation: "sum" }],
              tooltipKey: [
                { id: "trend.title", aggregation: "first" },
                { id: "trend.invoices", aggregation: "sum" },
              ],
            },
            sort: [{ field: { id: "trend.seq" }, direction: "asc" }],
            format: {
              title: { enabled: false },
              crossFilter: "none",
              widget: widgetChrome(surface),
              style: {
                theme: quiet,
                custom: {
                  // The heading above says "Daily invoice value · USD"; a rotated duplicate title only costs width.
                  valueAxis: { title: { enabled: false }, label: axisLabel },
                  categoryAxis: { title: { enabled: false }, label: axisLabel },
                },
              },
            },
          },
        },
        widgetLayout: {
          trend: {
            xTrack: 0,
            yTrack: 0,
            xSpan: 24,
            ySpan: Math.floor(
              (compact ? TREND_HEIGHT_PX.compact : TREND_HEIGHT_PX.desktop) / rowPx(compact),
            ),
          },
        },
      },
    ],
  } as AgReportState;
}

export function buildStatusState(
  surface: string,
  compact: boolean,
  rows: number = 1,
): AgReportState {
  return {
    selectedPageId: "page",
    pages: [
      {
        id: "page",
        layout: pageLayout(surface, compact),
        widgets: {
          status: {
            type: "bar-chart-stacked-100",
            dataMapping: {
              categoryKey: [{ id: "status.currency" }],
              valueKey: STATUS_SERIES.map(({ state }) => ({
                id: `status.${state}`,
                aggregation: "sum" as const,
              })),
            },
            format: {
              title: { enabled: false },
              crossFilter: "none",
              widget: widgetChrome(surface),
              style: {
                theme: {
                  common: {
                    legend: { enabled: false },
                    zoom: { enabled: false },
                    navigator: { enabled: false },
                  },
                },
                custom: {
                  valueAxis: { title: { enabled: false }, label: axisLabel },
                  categoryAxis: { title: { enabled: false }, label: axisLabel },
                },
              },
            },
          },
        },
        widgetLayout: {
          status: {
            xTrack: 0,
            yTrack: 0,
            xSpan: 24,
            ySpan: Math.floor(statusHeightPx(rows) / rowPx(compact)),
          },
        },
      },
    ],
  } as AgReportState;
}
