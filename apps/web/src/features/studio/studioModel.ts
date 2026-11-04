import { addCalendarDays } from "../../domain/dateRange.js";
import { formatCurrency, formatMinor } from "../../domain/money.js";
import {
  ANALYTICS_STATES,
  type AnalyticsState,
  type AnalyticsSummary,
} from "../../domain/serverAnalytics.js";
import type { CurrencyCode } from "../../domain/types.js";

/** Owner-approved density rule (A5-D): daily bars up to 90 local calendar days, weekly beyond. */
export const WEEKLY_AFTER_DAYS = 90;
/**
 * A bucket above this many minor units is not plotted: chart geometry and Studio's number formatting use
 * doubles, so beyond ~15 significant digits a plotted label could be wrong. The exact table stays.
 */
export const MAX_CHART_MINOR = 10n ** 13n;
const MAX_DAYS = 366;

export interface StudioRange {
  startDate: string;
  endDate: string;
  timeZone: string;
  fromInclusive: string;
  toExclusive: string;
}

/** One local calendar day of the selected range; zero-invoice days are real rows with an exact zero. */
export interface StudioDayRow {
  day: string;
  label: string;
  count: number;
  minor: bigint;
  total: string;
}

/** One plotted bar: a local day (<= 90 days) or a Monday-start local week (> 90 days). */
export interface StudioBucket {
  index: number;
  key: string;
  axis: string;
  title: string;
  count: number;
  minor: bigint;
  total: string;
}

export interface StudioCurrency {
  currency: CurrencyCode;
  exponent: number;
  mode: "daily" | "weekly";
  days: StudioDayRow[];
  buckets: StudioBucket[];
  invoiceCount: number;
  totalMinor: bigint;
  total: string;
  stateCounts: Record<AnalyticsState, number>;
  /** False when a bucket is too large to plot without risking a wrong label; the table stays exact. */
  chartSafe: boolean;
}

export type StudioModel =
  | {
      ok: true;
      dayCount: number;
      weekly: boolean;
      startDate: string;
      endDate: string;
      timeZone: string;
      currencies: StudioCurrency[];
    }
  | { ok: false; reason: string };

const parts = (date: string): [number, number, number] => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return [y, m, d];
};
const utcMidnight = (date: string): Date => {
  const [y, m, d] = parts(date);
  const out = new Date(0);
  out.setUTCFullYear(y, m - 1, d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
};
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    utcMidnight(date),
  );
const dayLabelYear = (date: string) => `${dayLabel(date)}, ${date.slice(0, 4)}`;
/** Monday of the calendar week containing a local calendar date (pure calendar arithmetic, DST-free). */
export function mondayOf(date: string): string {
  const dow = utcMidnight(date).getUTCDay();
  return addCalendarDays(date, -((dow + 6) % 7)) ?? date;
}

/** Every local calendar date from start to end inclusive, or null when the range is not usable. */
export function calendarDays(startDate: string, endDate: string): string[] | null {
  const days: string[] = [];
  let cursor: string | null = startDate;
  while (cursor !== null && cursor <= endDate) {
    days.push(cursor);
    if (days.length > MAX_DAYS) return null;
    cursor = addCalendarDays(cursor, 1);
  }
  return days.length > 0 && days[days.length - 1] === endDate ? days : null;
}

const money = (minor: bigint, currency: CurrencyCode) =>
  formatCurrency(formatMinor(minor, currency), currency);

/**
 * Normalises the EXISTING authenticated analytics answer into the only data Studio and the accessible table
 * receive: per currency, per local day/week, exact integer minor units and counts. No customer, invoice,
 * operator or provider field is part of the input type, so none can reach Studio. Fails closed (never a
 * partial or approximate chart) when the answer does not match the filters or does not add up to the cards.
 */
export function buildStudioModel(summary: AnalyticsSummary, range: StudioRange): StudioModel {
  if (
    summary.timeZone !== range.timeZone ||
    summary.fromInclusive !== range.fromInclusive ||
    summary.toExclusive !== range.toExclusive
  )
    return { ok: false, reason: "The analytics answer does not match the current filters." };
  const calendar = calendarDays(range.startDate, range.endDate);
  if (!calendar) return { ok: false, reason: "The selected date range cannot be charted." };
  const weekly = calendar.length > WEEKLY_AFTER_DAYS;
  const inRange = new Set(calendar);

  const currencies: StudioCurrency[] = [];
  for (const c of summary.currencies) {
    const byDay = new Map<string, { count: number; minor: bigint }>();
    for (const d of summary.days) {
      if (d.currency !== c.currency) continue;
      if (!inRange.has(d.day) || byDay.has(d.day))
        return { ok: false, reason: "The analytics answer contains an unexpected day." };
      byDay.set(d.day, { count: d.invoiceCount, minor: BigInt(d.totalMinor) });
    }
    const days: StudioDayRow[] = calendar.map((day) => {
      const v = byDay.get(day) ?? { count: 0, minor: 0n };
      return {
        day,
        label: dayLabelYear(day),
        count: v.count,
        minor: v.minor,
        total: money(v.minor, c.currency),
      };
    });

    const buckets: StudioBucket[] = [];
    if (!weekly) {
      for (const [i, r] of days.entries())
        buckets.push({
          index: i,
          key: r.day,
          axis: dayLabel(r.day),
          title: r.label,
          count: r.count,
          minor: r.minor,
          total: r.total,
        });
    } else {
      const weeks = new Map<
        string,
        { first: string; last: string; count: number; minor: bigint }
      >();
      for (const r of days) {
        const k = mondayOf(r.day);
        const w = weeks.get(k) ?? { first: r.day, last: r.day, count: 0, minor: 0n };
        w.count += r.count;
        w.minor += r.minor;
        w.last = r.day;
        weeks.set(k, w);
      }
      for (const [key, w] of weeks) {
        const partial = w.first !== key || w.last !== addCalendarDays(key, 6);
        buckets.push({
          index: buckets.length,
          key,
          axis: dayLabel(key),
          title: `${dayLabel(w.first)} – ${dayLabelYear(w.last)}${partial ? " (partial week)" : ""}`,
          count: w.count,
          minor: w.minor,
          total: money(w.minor, c.currency),
        });
      }
    }

    // Studio groups by category text, so two bars must never share an axis label (possible only across a
    // year boundary in very long weekly ranges): fall back to labels that include the year.
    if (new Set(buckets.map((b) => b.axis)).size !== buckets.length)
      for (const b of buckets) b.axis = dayLabelYear(b.key);

    const sumMinor = days.reduce((a, r) => a + r.minor, 0n);
    const sumCount = days.reduce((a, r) => a + r.count, 0);
    const bucketMinor = buckets.reduce((a, r) => a + r.minor, 0n);
    const bucketCount = buckets.reduce((a, r) => a + r.count, 0);
    const totalMinor = BigInt(c.totalMinor);
    if (
      sumMinor !== totalMinor ||
      bucketMinor !== totalMinor ||
      sumCount !== c.invoiceCount ||
      bucketCount !== c.invoiceCount
    )
      return { ok: false, reason: "The daily figures do not add up to the currency totals." };
    for (const s of ANALYTICS_STATES)
      if (!Number.isSafeInteger(c.stateCounts[s]))
        return { ok: false, reason: "The draft-status counts are not usable." };

    currencies.push({
      currency: c.currency,
      exponent: c.exponent,
      mode: weekly ? "weekly" : "daily",
      days,
      buckets,
      invoiceCount: c.invoiceCount,
      totalMinor,
      total: money(totalMinor, c.currency),
      stateCounts: { ...c.stateCounts },
      chartSafe: buckets.every((b) => b.minor <= MAX_CHART_MINOR),
    });
  }
  return {
    ok: true,
    dayCount: calendar.length,
    weekly,
    startDate: range.startDate,
    endDate: range.endDate,
    timeZone: range.timeZone,
    currencies,
  };
}

/** The currency shown first: the most invoices, ties alphabetical (approved A5-D rule). */
export function defaultChartCurrency(
  model: Extract<StudioModel, { ok: true }>,
): CurrencyCode | null {
  const sorted = [...model.currencies].sort(
    (a, b) => b.invoiceCount - a.invoiceCount || a.currency.localeCompare(b.currency),
  );
  return sorted[0]?.currency ?? null;
}
