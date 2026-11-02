export interface DashboardDateRange {
  startDate: string;
  endDate: string;
  timeZone: string;
  fromInclusive: string;
  toExclusive: string;
}

export type DateRangeResult =
  { ok: true; value: DashboardDateRange } | { ok: false; reason: string };

const DAY_MS = 86_400_000;
const MAX_RANGE_MS = 366 * DAY_MS;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function partsFrom(
  formatter: Intl.DateTimeFormat,
  instant: number,
): [number, number, number, number, number, number] {
  const parts = formatter.formatToParts(instant);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return [
    Number(values["year"]),
    Number(values["month"]),
    Number(values["day"]),
    Number(values["hour"]),
    Number(values["minute"]),
    Number(values["second"]),
  ];
}

function partsFor(
  instant: number,
  timeZone: string,
): [number, number, number, number, number, number] {
  return partsFrom(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }),
    instant,
  );
}

export function isValidLocalDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  probe.setUTCHours(0, 0, 0, 0);
  return (
    year >= 1970 &&
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function addCalendarDays(date: string, days: number): string | null {
  if (!isValidLocalDate(date) || !Number.isInteger(days)) return null;
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day + days);
  d.setUTCHours(0, 0, 0, 0);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(d.getUTCDate()).padStart(2, "0");
  const result = `${y}-${m}-${dayOfMonth}`;
  return isValidLocalDate(result) ? result : null;
}

export function localDateInZone(instant: Date, timeZone: string): string | null {
  if (!Number.isFinite(instant.getTime())) return null;
  try {
    const [year, month, day] = partsFor(instant.getTime(), timeZone);
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

/** Resolve local midnight only when the IANA rules identify exactly one UTC instant. */
export function localMidnightToUtc(date: string, timeZone: string): number | null {
  if (!isValidLocalDate(date)) return null;
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const target = [year, month, day, 0, 0, 0];
  const wallClockAsUtc = Date.UTC(year, month - 1, day);
  const offsets = new Set<number>();
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    // Sample both sides of transitions around the target date. Unique round-tripping below rejects
    // nonexistent and ambiguous midnight boundaries, including historical IANA rule changes.
    for (let delta = -48 * 60; delta <= 48 * 60; delta += 30) {
      const sample = wallClockAsUtc + delta * 60_000;
      const local = partsFrom(formatter, sample);
      const localAsUtc = Date.UTC(local[0], local[1] - 1, local[2], local[3], local[4], local[5]);
      offsets.add(localAsUtc - sample);
    }
  } catch {
    return null;
  }
  const matches = new Set<number>();
  for (const offset of offsets) {
    const candidate = wallClockAsUtc - offset;
    const actual = partsFrom(formatter, candidate);
    if (actual.every((v, i) => v === target[i])) matches.add(candidate);
  }
  return matches.size === 1 ? [...matches][0]! : null;
}

export function buildDashboardDateRange(
  startDate: string,
  endDate: string,
  timeZone: string,
): DateRangeResult {
  if (!isValidLocalDate(startDate) || !isValidLocalDate(endDate))
    return { ok: false, reason: "Enter valid start and end dates." };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return { ok: false, reason: "Your browser time zone is unavailable. Reload and try again." };
  }
  if (startDate > endDate)
    return { ok: false, reason: "Start date must be on or before end date." };
  const endExclusiveDate = addCalendarDays(endDate, 1);
  if (!endExclusiveDate)
    return { ok: false, reason: "The selected date range cannot be represented." };
  const from = localMidnightToUtc(startDate, timeZone);
  const to = localMidnightToUtc(endExclusiveDate, timeZone);
  if (from === null || to === null)
    return {
      ok: false,
      reason:
        "A selected date begins at an ambiguous or unavailable local midnight. Choose different dates.",
    };
  if (to <= from || to - from > MAX_RANGE_MS)
    return { ok: false, reason: "Select an interval of no more than 366 days." };
  return {
    ok: true,
    value: {
      startDate,
      endDate,
      timeZone,
      fromInclusive: new Date(from).toISOString(),
      toExclusive: new Date(to).toISOString(),
    },
  };
}

export function defaultDashboardDateRange(now = new Date(), timeZone?: string): DateRangeResult {
  let zone = timeZone;
  if (!zone) {
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return { ok: false, reason: "Your browser time zone is unavailable. Reload and try again." };
    }
  }
  if (!zone)
    return { ok: false, reason: "Your browser time zone is unavailable. Reload and try again." };
  const today = localDateInZone(now, zone);
  const start = today ? addCalendarDays(today, -29) : null;
  if (!today || !start)
    return { ok: false, reason: "Your browser time zone is unavailable. Reload and try again." };
  return buildDashboardDateRange(start, today, zone);
}
