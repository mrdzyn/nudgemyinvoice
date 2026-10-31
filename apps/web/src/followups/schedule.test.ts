import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildFollowUpMessage,
  checkPrefilledSchedule,
  checkSchedule,
  defaultFollowUpFields,
  describeZone,
  formatInstant,
  formatDateOnly,
  toLocalFields,
  toUtcInstant,
} from "./schedule.js";

const realTz = process.env["TZ"];
const withTz = (tz: string) => {
  process.env["TZ"] = tz;
};
beforeEach(() => withTz("Asia/Manila"));
afterEach(() => {
  if (realTz === undefined) delete process.env["TZ"];
  else process.env["TZ"] = realTz;
});

describe("follow-up time handling (browser zone in, real UTC instant out)", () => {
  it("converts the operator's local pick to the exact UTC instant", () => {
    expect(toUtcInstant("2026-11-02", "09:30")).toBe("2026-11-02T01:30:00.000Z"); // GMT+8
    withTz("America/New_York");
    expect(toUtcInstant("2026-11-02", "09:30")).toBe("2026-11-02T14:30:00.000Z"); // EST
    expect(toUtcInstant("2026-10-30", "09:30")).toBe("2026-10-30T13:30:00.000Z"); // EDT
  });

  it("rejects impossible or malformed local times, including a skipped daylight-saving hour", () => {
    withTz("America/New_York");
    expect(toUtcInstant("2027-03-14", "02:30")).toBeNull(); // does not exist
    for (const [d, t] of [
      ["2026-02-30", "09:00"],
      ["2026-13-01", "09:00"],
      ["2026-11-02", "25:00"],
      ["2026-11-02", "09:60"],
      ["", "09:00"],
      ["2026-11-02", ""],
      ["11/02/2026", "09:00"],
      ["2026-11-02", "9:00"],
    ] as const)
      expect(toUtcInstant(d, t), `${d} ${t}`).toBeNull();
  });

  it("defaults to tomorrow 09:00 local and round-trips local fields", () => {
    const now = new Date("2026-10-30T22:15:00+08:00");
    expect(defaultFollowUpFields(now)).toEqual({ date: "2026-10-31", time: "09:00" });
    expect(toLocalFields(new Date("2026-11-02T01:30:00.000Z"))).toEqual({
      date: "2026-11-02",
      time: "09:30",
    });
  });

  it("displays an instant in its stored zone WITH the zone shown", () => {
    const text = formatInstant("2026-11-02T01:30:00.000Z", "America/New_York");
    expect(text).toMatch(/Nov 1, 2026/);
    expect(text).toMatch(/8:30 PM/);
    expect(text).toMatch(/EST|GMT-5/);
    expect(formatInstant("2026-11-02T01:30:00.000Z", "Asia/Manila")).toMatch(/9:30 AM GMT\+8/);
    expect(describeZone("Asia/Manila", new Date("2026-11-02T00:00:00Z"))).toBe(
      "Asia/Manila (GMT+8)",
    );
    expect(formatInstant("not a date", "UTC")).toBe("Invalid time");
    expect(formatInstant("2026-11-02T01:30:00.000Z", "Mars/Olympus")).toMatch(/UTC/); // falls back, still labelled
    expect(formatDateOnly("2030-01-15")).toBe("January 15, 2030");
  });
});

describe("local follow-up message template (no provider)", () => {
  const msg = buildFollowUpMessage({
    customerName: "Northwind Studio",
    currency: "USD",
    total: "540.00",
    dueDate: "2030-01-15",
  });

  it("is polite, specific and editable plain text", () => {
    for (const piece of [
      "Hi Northwind Studio,",
      "USD 540.00",
      "January 15, 2030",
      "friendly reminder",
      "Thank you!",
    ])
      expect(msg).toContain(piece);
    expect(msg.length).toBeLessThan(2000);
  });

  it("never claims the invoice is unpaid or overdue, and never claims anything was sent", () => {
    expect(msg).not.toMatch(
      /unpaid|overdue|past due|outstanding|late|owe|demand|final notice|sent/i,
    );
    expect(msg).toMatch(/already taken care of/i);
  });
});

describe("schedule form validation", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const good = {
    date: "2026-11-02",
    time: "09:30",
    note: "  ask about PO  ",
    message: "  Hello  ",
  };

  it("accepts a valid schedule and trims text", () => {
    expect(checkSchedule(good, now)).toEqual({
      ok: true,
      dueAt: "2026-11-02T01:30:00.000Z",
      note: "ask about PO",
      message: "Hello",
    });
    expect(checkSchedule({ ...good, note: "   " }, now)).toMatchObject({ ok: true, note: null });
  });

  it("refuses bad input with a plain message", () => {
    expect(checkSchedule({ ...good, date: "" }, now)).toMatchObject({ ok: false });
    expect(checkSchedule({ ...good, date: "2026-10-29" }, now)).toEqual({
      ok: false,
      error: "Choose a time that is not in the past.",
    });
    expect(checkSchedule({ ...good, message: "   " }, now)).toMatchObject({ ok: false });
    expect(checkSchedule({ ...good, message: "x".repeat(2001) }, now)).toMatchObject({ ok: false });
    expect(checkSchedule({ ...good, note: "n".repeat(501) }, now)).toMatchObject({ ok: false });
  });
});

describe("Ask Nudgey prefilled schedule validation", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const base = { date: "2026-11-02", time: "09:30", note: "", message: "Reviewed draft" };

  it("rejects edited wall times in a DST gap or overlap instead of selecting an instant implicitly", () => {
    expect(
      checkPrefilledSchedule(
        { ...base, date: "2026-11-01", time: "01:30" },
        now,
        "America/New_York",
      ),
    ).toEqual({
      ok: false,
      error: "That local time occurs twice because of a clock change. Choose another time.",
    });
    expect(
      checkPrefilledSchedule(
        { ...base, date: "2027-03-14", time: "02:30" },
        now,
        "America/New_York",
      ),
    ).toEqual({
      ok: false,
      error: "That local time does not exist. Choose another date or time.",
    });
  });

  it("accepts a unique wall time only when host conversion matches the current IANA zone", () => {
    withTz("America/New_York");
    expect(
      checkPrefilledSchedule(
        { ...base, date: "2026-11-01", time: "03:30" },
        now,
        "America/New_York",
      ),
    ).toEqual({
      ok: true,
      dueAt: "2026-11-01T08:30:00.000Z",
      note: null,
      message: "Reviewed draft",
    });
    withTz("Asia/Manila");
    expect(checkPrefilledSchedule(base, now, "America/New_York")).toMatchObject({
      ok: false,
      error: "I couldn't verify this local time. Choose another date or time.",
    });
  });
});
