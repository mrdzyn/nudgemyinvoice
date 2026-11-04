// A5-I1 development lab: SYNTHETIC aggregates only, in exactly the shape of the real analytics answer.
// Never part of a production build (the lab page is not a build input) and never given customer data.
import { buildDashboardDateRange } from "../src/domain/dateRange.js";
import type { AnalyticsSummary } from "../src/domain/serverAnalytics.js";
import type { CurrencyCode } from "../src/domain/types.js";

export interface LabScenario {
  summary: AnalyticsSummary;
  range: {
    startDate: string;
    endDate: string;
    timeZone: string;
    fromInclusive: string;
    toExclusive: string;
  };
}

const EXP: Record<string, number> = { USD: 2, EUR: 2, JPY: 0 };
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export function labScenario(opts: {
  days: number;
  end?: string;
  timeZone?: string;
  currencies?: CurrencyCode[];
  /** Put one bucket above the plottable limit, to exercise the fail-closed table-only path. */
  huge?: boolean;
  /** Corrupt a currency total so the daily figures no longer add up. */
  mismatch?: boolean;
}): LabScenario {
  const end = opts.end ?? "2026-11-03";
  const timeZone = opts.timeZone ?? "Asia/Manila";
  const start = addDays(end, -(opts.days - 1));
  const r = buildDashboardDateRange(start, end, timeZone);
  if (!r.ok) throw new Error(r.reason);
  let seed = 20261104;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const currencies = opts.currencies ?? (["USD", "EUR", "JPY"] as CurrencyCode[]);
  const per: Record<string, number> = { USD: 5.2, EUR: 2.4, JPY: 0.8 };
  const avg: Record<string, number> = { USD: 21500, EUR: 18200, JPY: 31000 };
  const days: AnalyticsSummary["days"] = [];
  const totals: AnalyticsSummary["currencies"] = [];
  for (const c of currencies) {
    let count = 0;
    let minor = 0n;
    for (let i = 0; i < opts.days; i++) {
      const day = addDays(start, i);
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      const n = Math.max(
        0,
        Math.round(
          (per[c] ?? 1) * (dow === 0 || dow === 6 ? 0.35 : 1) * (0.4 + rnd() * 1.3) -
            (rnd() < 0.15 ? 2 : 0),
        ),
      );
      if (n === 0) continue;
      let t = 0;
      for (let k = 0; k < n; k++) t += Math.round((avg[c] ?? 20000) * (0.25 + rnd() * 1.6));
      if (c === "JPY") t = Math.round(t / 100) * 100;
      let m = BigInt(t);
      if (opts.huge && c === currencies[0] && i === 3) m = 10n ** 15n;
      days.push({
        day,
        currency: c,
        exponent: EXP[c] ?? 2,
        invoiceCount: n,
        totalMinor: m.toString(),
      });
      count += n;
      minor += m;
    }
    const p = Math.floor(count * 0.03);
    const cr = Math.floor(count * 0.07);
    const at = Math.floor(count * 0.02);
    totals.push({
      currency: c,
      exponent: EXP[c] ?? 2,
      invoiceCount: count,
      totalMinor: (opts.mismatch && c === currencies[0] ? minor + 1n : minor).toString(),
      stateCounts: { none: count - p - cr - at, progress: p, created: cr, attention: at },
    });
  }
  return {
    summary: {
      version: 1,
      fromInclusive: r.value.fromInclusive,
      toExclusive: r.value.toExclusive,
      timeZone,
      currencies: totals.filter((t) => t.invoiceCount > 0),
      days,
    },
    range: r.value,
  };
}
