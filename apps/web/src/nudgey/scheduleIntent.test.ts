import { describe, expect, it } from "vitest";
import { parseScheduleIntent, resolveWallTime } from "./scheduleIntent.js";

const now = new Date("2026-10-31T04:00:00.000Z"); // noon in Manila

describe("deterministic follow-up command interpretation", () => {
  it("turns supported relative and explicit-date commands into future local-wall-time proposals", () => {
    expect(
      parseScheduleIntent(
        "Remind me to follow up with Northwind Studio tomorrow at 9 AM",
        now,
        "Asia/Manila",
      ),
    ).toMatchObject({
      kind: "proposal",
      proposal: {
        term: "Northwind Studio",
        date: "2026-11-01",
        time: "09:00",
        timeZone: "Asia/Manila",
        dueAt: "2026-11-01T01:00:00.000Z",
      },
    });
    expect(
      parseScheduleIntent(
        "Schedule a follow-up for Acme on 2026-11-02 at 21:30",
        now,
        "Asia/Manila",
      ),
    ).toMatchObject({
      kind: "proposal",
      proposal: {
        term: "Acme",
        date: "2026-11-02",
        time: "21:30",
        dueAt: "2026-11-02T13:30:00.000Z",
      },
    });
  });

  it("asks for clarification for ambiguous, malformed, past, or unsupported dates/times", () => {
    for (const text of [
      "Remind me to follow up with Acme tomorrow at 9",
      "Remind me to follow up with Acme tomorrow",
      "Remind me to follow up with Acme next Friday at 9 AM",
      "Schedule a follow-up for Acme on 11/02/2026 at 9 AM",
      "Schedule a follow-up for Acme on 2026-02-30 at 9 AM",
      "Schedule a follow-up for Acme on 2026-10-31 at 11 AM",
    ])
      expect(parseScheduleIntent(text, now, "Asia/Manila").kind).toBe("clarify");
    expect(
      parseScheduleIntent("Remind me to follow up with Acme today at 9 AM", now, "Asia/Manila"),
    ).toMatchObject({ kind: "clarify" });
  });

  it("fails closed for unsafe actions and unsupported zones without issuing an intent", () => {
    expect(
      parseScheduleIntent(
        "Remind me to follow up with Acme tomorrow at 9 AM and send it",
        now,
        "Asia/Manila",
      ).kind,
    ).toBe("unsupported");
    expect(
      parseScheduleIntent("Remind me to follow up with Acme tomorrow at 9 AM", now, null).kind,
    ).toBe("clarify");
    expect(parseScheduleIntent("Show my invoices", now, "Asia/Manila").kind).toBe("not-scheduling");
  });

  it("rejects daylight-saving gaps and overlaps rather than guessing an instant", () => {
    expect(resolveWallTime("2026-03-08", "02:30", "America/New_York").kind).toBe("gap");
    expect(resolveWallTime("2026-11-01", "01:30", "America/New_York").kind).toBe("overlap");
    expect(resolveWallTime("2026-11-01", "03:30", "America/New_York").kind).toBe("ok");
  });
});
