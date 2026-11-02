import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  buildDashboardDateRange,
  defaultDashboardDateRange,
  localDateInZone,
  localMidnightToUtc,
} from "./dateRange.js";

describe("dashboard local date ranges", () => {
  it("defaults to 30 local calendar dates including today without assuming UTC", () => {
    const result = defaultDashboardDateRange(
      new Date("2026-03-08T18:00:00.000Z"),
      "America/New_York",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      startDate: "2026-02-07",
      endDate: "2026-03-08",
      timeZone: "America/New_York",
    });
    expect(result.value.fromInclusive).toBe("2026-02-07T05:00:00.000Z");
    expect(result.value.toExclusive).toBe("2026-03-09T04:00:00.000Z");
  });

  it("uses actual UTC durations for local dates across spring and fall DST changes", () => {
    const spring = buildDashboardDateRange("2026-03-08", "2026-03-08", "America/New_York");
    const fall = buildDashboardDateRange("2026-11-01", "2026-11-01", "America/New_York");
    expect(spring).toMatchObject({
      ok: true,
      value: { fromInclusive: "2026-03-08T05:00:00.000Z", toExclusive: "2026-03-09T04:00:00.000Z" },
    });
    expect(fall).toMatchObject({
      ok: true,
      value: { fromInclusive: "2026-11-01T04:00:00.000Z", toExclusive: "2026-11-02T05:00:00.000Z" },
    });
    if (spring.ok && fall.ok) {
      expect(Date.parse(spring.value.toExclusive) - Date.parse(spring.value.fromInclusive)).toBe(
        23 * 60 * 60 * 1000,
      );
      expect(Date.parse(fall.value.toExclusive) - Date.parse(fall.value.fromInclusive)).toBe(
        25 * 60 * 60 * 1000,
      );
    }
  });

  it("includes the selected end date and validates range/timezone boundaries", () => {
    const result = buildDashboardDateRange("2026-11-01", "2026-11-03", "Asia/Manila");
    expect(result).toMatchObject({
      ok: true,
      value: { fromInclusive: "2026-10-31T16:00:00.000Z", toExclusive: "2026-11-03T16:00:00.000Z" },
    });
    expect(buildDashboardDateRange("2026-11-04", "2026-11-03", "UTC").ok).toBe(false);
    expect(buildDashboardDateRange("2026-01-01", "2027-01-03", "UTC").ok).toBe(false);
    expect(buildDashboardDateRange("2026-01-01", "2026-01-02", "Not/AZone").ok).toBe(false);
  });

  it("validates actual calendar dates and resolves a local date only when midnight exists", () => {
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(localMidnightToUtc("2026-03-08", "America/New_York")).toBe(
      Date.parse("2026-03-08T05:00:00.000Z"),
    );
    expect(localMidnightToUtc("2026-02-30", "America/New_York")).toBeNull();
    expect(localDateInZone(new Date("2026-03-08T05:00:00.000Z"), "America/New_York")).toBe(
      "2026-03-08",
    );
  });
});
