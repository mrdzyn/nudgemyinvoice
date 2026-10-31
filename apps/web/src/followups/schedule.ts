import { resolveWallTime } from "../nudgey/scheduleIntent.js";

/**
 * Pure helpers for local follow-up scheduling. No network, no storage, no clock reads except where a
 * `now` is passed in. The scheduled time is picked in the operator's BROWSER time zone, converted to
 * a real UTC instant for storage, and displayed back with its zone so it is never ambiguous.
 */

/** The operator's browser time zone (IANA name), or `UTC` when the browser cannot say. */
export function browserTimeZone(): string {
  try {
    const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

/**
 * Convert a local date + time (as typed in the browser's zone) to a UTC ISO instant. Returns null for
 * an impossible date/time, including a wall time skipped by a daylight-saving jump.
 */
export function toUtcInstant(date: string, time: string): string | null {
  const d = DATE.exec(date);
  const t = TIME.exec(time);
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = [Number(t[1]), Number(t[2])];
  const local = new Date(y, mo - 1, da, h, mi, 0, 0);
  if (
    Number.isNaN(local.getTime()) ||
    local.getFullYear() !== y ||
    local.getMonth() !== mo - 1 ||
    local.getDate() !== da ||
    local.getHours() !== h ||
    local.getMinutes() !== mi
  )
    return null;
  return local.toISOString();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local `YYYY-MM-DD` and `HH:mm` for a Date, in the browser's zone. */
export function toLocalFields(d: Date): { date: string; time: string } {
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** A sensible default for a new follow-up: tomorrow at 09:00 local time. */
export function defaultFollowUpFields(now: Date): { date: string; time: string } {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
  return toLocalFields(d);
}

/** Display an instant in a given IANA zone, always with the zone name, e.g. `Nov 2, 2026, 9:30 AM GMT+8`. */
export function formatInstant(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid time";
  // Explicit fields: `timeZoneName` cannot be combined with dateStyle/timeStyle.
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(date);
  }
}

/** `Asia/Manila (GMT+8)` for the zone at a given moment. */
export function describeZone(timeZone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    const off = parts.find((p) => p.type === "timeZoneName")?.value;
    return off ? `${timeZone} (${off})` : timeZone;
  } catch {
    return timeZone;
  }
}

/** `January 15, 2030` from a `YYYY-MM-DD` date (no zone shifting). */
export function formatDateOnly(ymd: string): string {
  const m = DATE.exec(ymd);
  if (!m) return ymd;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
  );
}

export interface MessageFacts {
  customerName: string;
  currency: string;
  /** Already-formatted amount, e.g. `540.00`. */
  total: string;
  /** `YYYY-MM-DD` */
  dueDate: string;
}

/**
 * A polite, editable follow-up DRAFT for the operator to use however they choose. It is built
 * locally from the saved invoice and never states that the invoice is unpaid or overdue (payment
 * state is not known here) and is never sent by this application.
 */
export function buildFollowUpMessage(f: MessageFacts): string {
  return [
    `Hi ${f.customerName},`,
    "",
    `I hope you're doing well! This is a friendly reminder about your invoice for ${f.currency} ${f.total}, which is due on ${formatDateOnly(f.dueDate)}.`,
    "",
    "If you've already taken care of it, thank you, and please disregard this note. If you have any questions or need anything from me, just reply and I'll be happy to help.",
    "",
    "Thank you!",
  ].join("\n");
}

export const MAX_NOTE = 500;
export const MAX_MESSAGE = 2000;
/** The server accepts a time at most this far in the past (an "as of now" pick). */
export const PAST_GRACE_MS = 5 * 60 * 1000;

export type FormCheck =
  { ok: true; dueAt: string; note: string | null; message: string } | { ok: false; error: string };

/** Strict validation for an Ask Nudgey prefill after the operator edits its local wall time. */
export function checkPrefilledSchedule(
  input: { date: string; time: string; note: string; message: string },
  now: Date,
  timeZone: string,
): FormCheck {
  const wall = resolveWallTime(input.date, input.time, timeZone);
  if (wall.kind === "gap")
    return { ok: false, error: "That local time does not exist. Choose another date or time." };
  if (wall.kind === "overlap")
    return {
      ok: false,
      error: "That local time occurs twice because of a clock change. Choose another time.",
    };
  if (wall.kind === "invalid-zone")
    return { ok: false, error: "I can't verify this time zone. Nothing was saved." };
  const checked = checkSchedule(input, now);
  if (!checked.ok) return checked;
  if (checked.dueAt !== wall.dueAt)
    return { ok: false, error: "I couldn't verify this local time. Choose another date or time." };
  return checked;
}

/** Client-side validation of the schedule form (the server validates again, strictly). */
export function checkSchedule(
  input: { date: string; time: string; note: string; message: string },
  now: Date,
): FormCheck {
  const instant = toUtcInstant(input.date, input.time);
  if (!instant) return { ok: false, error: "Choose a valid date and time." };
  if (Date.parse(instant) < now.getTime() - PAST_GRACE_MS)
    return { ok: false, error: "Choose a time that is not in the past." };
  const message = input.message.trim();
  if (message.length === 0) return { ok: false, error: "The follow-up message cannot be empty." };
  if (message.length > MAX_MESSAGE)
    return { ok: false, error: `Keep the message under ${MAX_MESSAGE} characters.` };
  const note = input.note.trim();
  if (note.length > MAX_NOTE)
    return { ok: false, error: `Keep the note under ${MAX_NOTE} characters.` };
  return { ok: true, dueAt: instant, note: note.length ? note : null, message };
}
