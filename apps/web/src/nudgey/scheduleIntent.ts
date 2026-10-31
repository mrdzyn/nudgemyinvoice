/** Deterministic C2 command parsing and IANA-zone wall-time resolution. No I/O, storage or ambient clock. */
export interface ScheduleProposal {
  term: string;
  date: string;
  time: string;
  timeZone: string;
  dueAt: string;
}

export type ScheduleIntent =
  | { kind: "not-scheduling" }
  | { kind: "proposal"; proposal: ScheduleProposal }
  | { kind: "clarify"; message: string }
  | { kind: "unsupported"; message: string };

const SCHEDULING_START = /^(?:remind me to follow up|schedule a follow-up)\b/i;
const NEVER_ACTION =
  /\b(?:send|e-?mail|mail|cancel|mark|paid|refund|charge|auto(?:matically)?|recurr(?:ing|ence)?)\b/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type WallParts = { year: number; month: number; day: number; hour: number; minute: number };

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return null;
  }
}

/** The browser's validated IANA zone, or null when the runtime cannot provide one reliably. */
export function browserTimeZoneOrNull(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zoneFormatter(zone) ? zone : null;
  } catch {
    return null;
  }
}

function partsAt(formatter: Intl.DateTimeFormat, instant: number): WallParts | null {
  const raw = new Map(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  const values = (["year", "month", "day", "hour", "minute"] as const).map((key) =>
    Number(raw.get(key)),
  );
  if (!values.every(Number.isInteger)) return null;
  const [year, month, day, hour, minute] = values as [number, number, number, number, number];
  return { year, month, day, hour, minute };
}

function sameParts(a: WallParts | null, b: WallParts): boolean {
  return Boolean(
    a &&
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute,
  );
}

function toUtcFields(p: WallParts): number {
  const date = new Date(0);
  date.setUTCFullYear(p.year, p.month - 1, p.day);
  date.setUTCHours(p.hour, p.minute, 0, 0);
  return date.getTime();
}

function isValidDate(date: string): boolean {
  const m = DATE.exec(date);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(0, 0, 0, 0);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function addOneDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
}

function localDateAt(now: Date, formatter: Intl.DateTimeFormat): string | null {
  const p = partsAt(formatter, now.getTime());
  return p
    ? `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
    : null;
}

type TimeParse = { kind: "ok"; time: string } | { kind: "missing" } | { kind: "invalid" };

function parseTime(raw: string | undefined): TimeParse {
  if (!raw?.trim()) return { kind: "missing" };
  const text = raw.trim();
  const twelve = /^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)$/i.exec(text);
  if (twelve) {
    const h = Number(twelve[1]);
    if (h < 1 || h > 12) return { kind: "invalid" };
    const hour = (h % 12) + (twelve[3]!.toUpperCase() === "PM" ? 12 : 0);
    return { kind: "ok", time: `${String(hour).padStart(2, "0")}:${twelve[2] ?? "00"}` };
  }
  const twentyFour = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return twentyFour
    ? { kind: "ok", time: `${twentyFour[1]}:${twentyFour[2]}` }
    : { kind: "invalid" };
}

type WallResolution =
  { kind: "ok"; dueAt: string } | { kind: "gap" } | { kind: "overlap" } | { kind: "invalid-zone" };

/** Resolve a local wall time only when exactly one UTC instant represents it in this IANA zone. */
export function resolveWallTime(date: string, time: string, timeZone: string): WallResolution {
  const formatter = zoneFormatter(timeZone);
  const d = DATE.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!formatter) return { kind: "invalid-zone" };
  if (!d || !t || !isValidDate(date)) return { kind: "gap" };
  const wanted: WallParts = {
    year: Number(d[1]),
    month: Number(d[2]),
    day: Number(d[3]),
    hour: Number(t[1]),
    minute: Number(t[2]),
  };
  const wallMillis = toUtcFields(wanted);
  const offsets = new Set<number>();
  // Sampling both sides captures either offset in a DST transition without assuming the host zone.
  for (let deltaHours = -48; deltaHours <= 48; deltaHours += 6) {
    const instant = wallMillis + deltaHours * 3_600_000;
    const observed = partsAt(formatter, instant);
    if (!observed) continue;
    const offset = toUtcFields(observed) - Math.floor(instant / 60_000) * 60_000;
    offsets.add(offset);
  }
  const matches = [...offsets]
    .map((offset) => wallMillis - offset)
    .filter((instant) => sameParts(partsAt(formatter, instant), wanted));
  if (matches.length === 0) return { kind: "gap" };
  if (matches.length > 1) return { kind: "overlap" };
  return { kind: "ok", dueAt: new Date(matches[0]!).toISOString() };
}

const clarify = (message: string): ScheduleIntent => ({ kind: "clarify", message });
const unsupported = (message: string): ScheduleIntent => ({ kind: "unsupported", message });

/** Parse the deliberately narrow C2 grammar using the supplied current time and IANA zone. */
export function parseScheduleIntent(
  raw: string,
  now: Date,
  timeZone: string | null,
): ScheduleIntent {
  if (!SCHEDULING_START.test(raw.trim())) return { kind: "not-scheduling" };
  if (raw.length > 200) return clarify("Please keep the scheduling request under 200 characters.");
  if (Array.from(raw).some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f))
    return clarify("Please retype the request without line breaks or control characters.");
  if (NEVER_ACTION.test(raw))
    return unsupported(
      "I can only prepare a local reminder for you. I can't send or change anything from a chat command.",
    );
  if (!Number.isFinite(now.getTime()))
    return clarify("I can't verify the current time. Use the manual scheduler instead.");
  if (!timeZone || !zoneFormatter(timeZone))
    return clarify(
      "I can't verify your browser's IANA time zone. Use the manual scheduler and confirm the zone.",
    );

  const text = raw.trim().replace(/\s+/g, " ");
  const reminder = /^remind me to follow up with (.+)$/i.exec(text);
  const scheduled = /^schedule a follow-up for (.+)$/i.exec(text);
  const command = reminder
    ? { body: reminder[1] ?? "", kind: "relative" as const }
    : scheduled
      ? { body: scheduled[1] ?? "", kind: "absolute" as const }
      : null;
  if (!command)
    return clarify(
      "Use “Remind me to follow up with [customer] today/tomorrow at [time]” or “Schedule a follow-up for [customer] on YYYY-MM-DD at [time]”.",
    );

  const at = command.body.lastIndexOf(" at ");
  const beforeTime = at < 0 ? command.body : command.body.slice(0, at);
  const rawTime = at < 0 ? undefined : command.body.slice(at + 4);
  const relative =
    command.kind === "relative" ? /^(.*)\s+(today|tomorrow)$/i.exec(beforeTime) : null;
  const absolute =
    command.kind === "absolute" ? /^(.*)\s+on\s+(\d{4}-\d{2}-\d{2})$/i.exec(beforeTime) : null;
  const term = (relative?.[1] ?? absolute?.[1] ?? beforeTime)
    .replace(/[?.!,;:]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (term.length < 2 || term.length > 100)
    return clarify("Tell me the customer name to search for (2–100 characters).");
  if (command.kind === "relative" && !relative)
    return clarify(
      "Use “today” or “tomorrow” for the date. Other date phrases need the manual scheduler.",
    );
  if (command.kind === "absolute" && !absolute)
    return clarify(
      "Use a full YYYY-MM-DD date. Relative or locale-ambiguous dates need the manual scheduler.",
    );
  const formatter = zoneFormatter(timeZone);
  if (!formatter)
    return clarify(
      "I couldn't verify your browser's IANA time zone. Use the manual scheduler and confirm the zone.",
    );
  const current = localDateAt(now, formatter);
  if (!current)
    return clarify(
      "I couldn't read the current date in your browser's time zone. Use the manual scheduler.",
    );
  const date = relative
    ? relative[2]!.toLowerCase() === "today"
      ? current
      : addOneDay(current)
    : absolute![2]!;
  if (!isValidDate(date)) return clarify("Use a real calendar date in YYYY-MM-DD format.");
  const time = parseTime(rawTime);
  if (time.kind === "missing")
    return clarify("Add an explicit time, such as 9 AM, 9:30 PM, or 21:30.");
  if (time.kind === "invalid")
    return clarify(
      "Use an unambiguous time such as 9 AM, 9:30 PM, or 21:30. A bare 9 needs AM or PM.",
    );
  const resolved = resolveWallTime(date, time.time, timeZone);
  if (resolved.kind === "invalid-zone")
    return clarify(
      "I couldn't verify that time zone. Use the manual scheduler and confirm the zone.",
    );
  if (resolved.kind === "gap")
    return clarify(
      "That local time does not exist because the clocks change. Choose another time.",
    );
  if (resolved.kind === "overlap")
    return clarify(
      "That local time occurs twice because the clocks change. Choose another time outside the clock change.",
    );
  if (Date.parse(resolved.dueAt) <= now.getTime())
    return clarify("That time is in the past. Choose a future date and time.");
  return {
    kind: "proposal",
    proposal: { term, date, time: time.time, timeZone, dueAt: resolved.dueAt },
  };
}
