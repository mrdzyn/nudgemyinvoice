import { describe, expect, it } from "vitest";
import { labScenario } from "../../../studio-lab/synthetic.js";
import { buildStudioModel, type StudioCurrency } from "./studioModel.js";
import {
  buildStatusData,
  buildStatusState,
  buildTrendData,
  buildTrendState,
  STATUS_SERIES,
  trendRows,
} from "./studioReport.js";

const currencies = (days: number): StudioCurrency[] => {
  const { summary, range } = labScenario({ days });
  const m = buildStudioModel(summary, range);
  if (!m.ok) throw new Error(m.reason);
  return m.currencies;
};

describe("studioReport (what AG Studio receives)", () => {
  it("trend rows hold only period, exact decimal value and count, one per plotted bucket", () => {
    for (const days of [30, 120]) {
      const usd = currencies(days).find((c) => c.currency === "USD");
      if (!usd) throw new Error("fixture");
      const rows = trendRows(usd);
      expect(rows).toHaveLength(usd.buckets.length);
      for (const r of rows)
        expect(Object.keys(r).sort()).toEqual(["invoices", "period", "seq", "title", "value"]);
      const sum = usd.buckets.reduce((a, b) => a + b.minor, 0n);
      expect(Math.round(rows.reduce((a, r) => a + r.value, 0) * 100)).toBe(Number(sum));
      expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i));
    }
  });

  it("uses the currency's own exponent (JPY has no decimals)", () => {
    const jpy = currencies(30).find((c) => c.currency === "JPY");
    if (!jpy) throw new Error("fixture");
    const first = jpy.buckets.find((b) => b.minor > 0n);
    const row = trendRows(jpy).find((r) => r.invoices > 0);
    expect(row?.value).toBe(Number(first?.minor));
    expect(Number.isInteger(row?.value)).toBe(true);
  });

  it("the data source exposes exactly the aggregate fields and no personal field", () => {
    const usd = currencies(30)[0];
    if (!usd) throw new Error("fixture");
    const data = buildTrendData(usd);
    const sources = "sources" in data ? data.sources : [];
    expect(sources).toHaveLength(1);
    const ids = (sources[0] as { fields?: { id: string }[] }).fields?.map((f) => f.id);
    expect(ids).toEqual(["seq", "period", "title", "value", "invoices"]);
    const status = buildStatusData(currencies(30));
    const rows = ("sources" in status ? status.sources[0] : undefined) as
      { data: Record<string, unknown>[] } | undefined;
    for (const r of rows?.data ?? [])
      expect(Object.keys(r).sort()).toEqual([
        "attention",
        "created",
        "currency",
        "none",
        "progress",
      ]);
  });

  it("status rows are per currency counts that add up and are never summed across currencies", () => {
    const cs = currencies(30);
    const status = buildStatusData(cs);
    const rows =
      "sources" in status
        ? (status.sources[0] as { data: Record<string, number | string>[] }).data
        : [];
    expect(rows.map((r) => r["currency"])).toEqual(cs.map((c) => c.currency));
    for (const [i, c] of cs.entries()) {
      const r = rows[i] ?? {};
      expect(STATUS_SERIES.reduce((a, s) => a + Number(r[s.state]), 0)).toBe(c.invoiceCount);
    }
    expect(STATUS_SERIES.map((s) => s.label)).toEqual([
      "No PayPal draft",
      "In progress",
      "PayPal draft created",
      "Needs attention",
    ]);
  });

  it("both reports are view-only widgets: no cross-filtering, no titles, no legend, zoom or navigator", () => {
    const usd = currencies(30)[0];
    if (!usd) throw new Error("fixture");
    for (const state of [buildTrendState(usd, "#fff", false), buildStatusState("#fff", true)]) {
      const widgets = state.pages[0]?.widgets ?? {};
      expect(Object.keys(widgets)).toHaveLength(1);
      const w = Object.values(widgets)[0] as {
        type: string;
        format?: {
          crossFilter?: string;
          title?: { enabled?: boolean };
          style?: { theme?: { common?: Record<string, { enabled?: boolean }> } };
        };
      };
      expect(w.format?.crossFilter).toBe("none");
      expect(w.format?.title?.enabled).toBe(false);
      const common = w.format?.style?.theme?.common ?? {};
      expect(common["legend"]?.enabled).toBe(false);
      expect(common["zoom"]?.enabled).toBe(false);
      expect(common["navigator"]?.enabled).toBe(false);
      expect(state.pages[0]?.layout?.pagePadding).toBe(0);
    }
    const widget = Object.values(
      buildTrendState(usd, "#fff", false).pages[0]?.widgets ?? {},
    )[0] as { type: string };
    expect(widget.type).toBe("column-chart-grouped");
  });
});
