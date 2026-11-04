import { describe, expect, it } from "vitest";
import { labScenario } from "../../../studio-lab/synthetic.js";
import {
  buildStudioModel,
  calendarDays,
  defaultChartCurrency,
  mondayOf,
  WEEKLY_AFTER_DAYS,
} from "./studioModel.js";

/**
 * Objective: the data handed to AG Studio and to the accessible table is exact and complete: every calendar
 * day (zero-invoice days included), daily up to 90 days and Monday-start weekly beyond, per-currency BigInt
 * sums that equal the cards, and a fail-closed refusal whenever anything is inconsistent.
 */
const buildStatusModel = (s: ReturnType<typeof labScenario>) =>
  buildStudioModel(s.summary, s.range);
const ok = (m: ReturnType<typeof buildStudioModel>) => {
  if (!m.ok) throw new Error(m.reason);
  return m;
};

describe("studioModel", () => {
  it.each([30, 90, 120, 366])(
    "keeps exactly %i calendar-day rows per currency, zero days included",
    (days) => {
      const { summary, range } = labScenario({ days });
      const m = ok(buildStudioModel(summary, range));
      expect(m.dayCount).toBe(days);
      for (const c of m.currencies) {
        expect(c.days).toHaveLength(days);
        expect(new Set(c.days.map((d) => d.day)).size).toBe(days);
        const reported = new Set(
          summary.days.filter((d) => d.currency === c.currency).map((d) => d.day),
        );
        const zero = c.days.filter((d) => d.count === 0);
        expect(zero.length).toBe(days - reported.size);
        for (const z of zero) {
          expect(z.minor).toBe(0n);
          expect(z.total).toBe(
            c.currency === "JPY" ? "¥0" : c.currency === "EUR" ? "€0.00" : "$0.00",
          );
        }
      }
      // JPY is sparse in the synthetic data, so a zero-invoice day always exists for it.
      expect(m.currencies.find((c) => c.currency === "JPY")?.days.some((d) => d.count === 0)).toBe(
        true,
      );
    },
  );

  it.each([
    [30, "daily"],
    [WEEKLY_AFTER_DAYS, "daily"],
    [WEEKLY_AFTER_DAYS + 1, "weekly"],
    [120, "weekly"],
  ] as const)("a %i-day range is plotted %s", (days, mode) => {
    const { summary, range } = labScenario({ days });
    const m = ok(buildStudioModel(summary, range));
    expect(m.weekly).toBe(mode === "weekly");
    for (const c of m.currencies) {
      expect(c.mode).toBe(mode);
      if (mode === "daily") expect(c.buckets).toHaveLength(days);
      else expect(c.buckets.length).toBeLessThan(days / 5);
    }
  });

  it("plotted buckets, the daily rows and the card total agree exactly in integer minor units", () => {
    for (const days of [30, 90, 120]) {
      const { summary, range } = labScenario({ days });
      const m = ok(buildStudioModel(summary, range));
      for (const c of m.currencies) {
        const card = summary.currencies.find((x) => x.currency === c.currency);
        expect(c.totalMinor).toBe(BigInt(card?.totalMinor ?? "-1"));
        expect(c.days.reduce((a, d) => a + d.minor, 0n)).toBe(c.totalMinor);
        expect(c.buckets.reduce((a, b) => a + b.minor, 0n)).toBe(c.totalMinor);
        expect(c.buckets.reduce((a, b) => a + b.count, 0)).toBe(c.invoiceCount);
      }
    }
  });

  it("weekly buckets start on Monday, keep partial boundary weeks, and never mix currencies", () => {
    // 2026-07-07 is a Tuesday: the first bar is the partial week starting Monday 2026-07-06.
    const { summary, range } = labScenario({ days: 120, end: "2026-11-03" });
    const m = ok(buildStudioModel(summary, range));
    const usd = m.currencies.find((c) => c.currency === "USD");
    expect(usd?.buckets[0]?.key).toBe("2026-07-06");
    expect(usd?.buckets[0]?.title).toContain("partial week");
    expect(usd?.buckets.at(-1)?.key).toBe("2026-11-02");
    expect(usd?.buckets.at(-1)?.title).toContain("partial week");
    for (const b of usd?.buckets ?? []) expect(new Date(`${b.key}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(m.currencies.map((c) => c.currency).sort()).toEqual(["EUR", "JPY", "USD"]);
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // a Sunday belongs to the previous Monday's week
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
  });

  it("local calendar days are DST-free: a range across the New York fall-back is 8 whole days", () => {
    expect(calendarDays("2026-10-30", "2026-11-06")).toHaveLength(8);
    const { summary, range } = labScenario({
      days: 8,
      end: "2026-11-06",
      timeZone: "America/New_York",
    });
    const m = ok(buildStudioModel(summary, range));
    expect(m.currencies.every((c) => c.days.length === 8)).toBe(true);
    expect(m.currencies[0]?.days.map((d) => d.day)).toContain("2026-11-01");
  });

  it("JPY keeps zero-decimal exact labels and USD two decimals", () => {
    const { summary, range } = labScenario({ days: 30 });
    const m = ok(buildStudioModel(summary, range));
    expect(m.currencies.find((c) => c.currency === "JPY")?.total).toMatch(/^¥[\d,]+$/);
    expect(m.currencies.find((c) => c.currency === "USD")?.total).toMatch(/^\$[\d,]+\.\d{2}$/);
  });

  it("fails closed when the answer does not match the filters or does not add up", () => {
    const { summary, range } = labScenario({ days: 30 });
    expect(buildStudioModel(summary, { ...range, timeZone: "UTC" }).ok).toBe(false);
    expect(
      buildStudioModel(summary, { ...range, fromInclusive: "2000-01-01T00:00:00.000Z" }).ok,
    ).toBe(false);
    expect(buildStudioModel(labScenario({ days: 30, mismatch: true }).summary, range).ok).toBe(
      false,
    );
    const outside = {
      ...summary,
      days: [
        ...summary.days,
        {
          day: "2030-01-01",
          currency: "USD" as const,
          exponent: 2,
          invoiceCount: 1,
          totalMinor: "1",
        },
      ],
    };
    expect(buildStudioModel(outside, range).ok).toBe(false);
    const dup = summary.days[0];
    if (!dup) throw new Error("fixture");
    expect(buildStudioModel({ ...summary, days: [...summary.days, dup] }, range).ok).toBe(false);
    expect(
      buildStudioModel(summary, { ...range, startDate: "2026-11-03", endDate: "2026-10-01" }).ok,
    ).toBe(false);
  });

  it("does not plot a bucket above the safe limit but keeps the exact table", () => {
    const { summary, range } = labScenario({ days: 30, huge: true });
    const m = ok(buildStudioModel(summary, range));
    const first = m.currencies.find((c) => c.currency === "USD");
    expect(first?.chartSafe).toBe(false);
    expect(first?.days.some((d) => d.minor === 10n ** 15n)).toBe(true);
    expect(first?.days.find((d) => d.minor === 10n ** 15n)?.total).toBe("$10,000,000,000,000.00");
    expect(m.currencies.find((c) => c.currency === "EUR")?.chartSafe).toBe(true);
  });

  it("handles a single-currency answer and picks the busiest currency first", () => {
    const single = labScenario({ days: 30, currencies: ["EUR"] });
    const one = ok(buildStatusModel(single));
    expect(one.currencies).toHaveLength(1);
    expect(defaultChartCurrency(one)).toBe("EUR");
    const { summary, range } = labScenario({ days: 30 });
    expect(defaultChartCurrency(ok(buildStudioModel(summary, range)))).toBe("USD");
  });

  it("the model carries only aggregates: no customer, invoice, operator or provider field", () => {
    const { summary, range } = labScenario({ days: 30 });
    const m = ok(buildStudioModel(summary, range));
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
      }
    };
    walk(m);
    expect(
      [...keys].filter((k) => /customer|email|name|invoiceId|operator|paypal|token/i.test(k)),
    ).toEqual([]);
  });
});
