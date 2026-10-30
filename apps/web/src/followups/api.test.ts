import { describe, expect, it } from "vitest";
import { createFollowUpApi, parseFollowUp, type FollowUpInputBody } from "./api.js";

const ID = "6b3b49ec-a917-4215-85d9-2bc9fccfdea8";
const INV = "f1c2deca-7d18-4718-af52-5650912ec00f";
const CSRF = "c".repeat(43);
const wire = (over: Record<string, unknown> = {}, withInvoice = false) => ({
  id: ID,
  invoiceId: INV,
  dueAt: "2026-11-02T01:30:00.000Z",
  timezone: "Asia/Manila",
  note: "ask about PO",
  message: "Hi there",
  status: "active",
  state: "upcoming",
  createdAt: "2026-10-30T12:00:00.000Z",
  completedAt: null,
  canceledAt: null,
  sentToCustomer: false,
  ...(withInvoice
    ? {
        invoice: {
          customerName: "Northwind Studio",
          currency: "USD",
          total: "540.00",
          dueDate: "2030-01-15",
        },
      }
    : {}),
  ...over,
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Call = { url: string; init: RequestInit };
const fake = (respond: (c: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const api = createFollowUpApi(async (url, init) => {
    calls.push({ url, init });
    return respond({ url, init });
  });
  return { api, calls };
};
const sig = () => new AbortController().signal;
const input: FollowUpInputBody = {
  dueAt: "2026-11-02T01:30:00.000Z",
  timezone: "Asia/Manila",
  note: null,
  message: "Hi",
};

describe("follow-up transport", () => {
  it("lists with a plain GET, same-origin, no query string and no CSRF header", async () => {
    const { api, calls } = fake(() =>
      json(200, {
        now: "2026-10-30T12:00:00.000Z",
        counts: { due: 0, upcoming: 1 },
        items: [wire({}, true)],
      }),
    );
    const r = await api.list(sig());
    expect(r).toMatchObject({ kind: "ok", counts: { due: 0, upcoming: 1 } });
    expect(calls[0]?.url).toBe("/api/follow-ups");
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      redirect: "error",
    });
    expect(JSON.stringify(calls[0]?.init.headers)).not.toMatch(/csrf/i);
  });

  it("rejects an answer whose counts disagree with its items, or that smuggles a closed/sent record", async () => {
    const mismatch = fake(() =>
      json(200, {
        now: "2026-10-30T12:00:00.000Z",
        counts: { due: 5, upcoming: 0 },
        items: [wire({}, true)],
      }),
    );
    expect((await mismatch.api.list(sig())).kind).toBe("malformed");
    const closed = fake(() =>
      json(200, {
        now: "2026-10-30T12:00:00.000Z",
        counts: { due: 0, upcoming: 1 },
        items: [wire({ status: "completed", state: "completed" }, true)],
      }),
    );
    expect((await closed.api.list(sig())).kind).toBe("malformed");
    const sent = fake(() =>
      json(200, {
        now: "2026-10-30T12:00:00.000Z",
        counts: { due: 0, upcoming: 1 },
        items: [wire({ sentToCustomer: true }, true)],
      }),
    );
    expect((await sent.api.list(sig())).kind).toBe("malformed");
  });

  it("validates every field of a record (strictly)", () => {
    expect(parseFollowUp(wire(), false)).toMatchObject({ id: ID, timezone: "Asia/Manila" });
    for (const bad of [
      { id: "x" },
      { invoiceId: "x" },
      { dueAt: "tomorrow" },
      { timezone: "../x" },
      { status: "archived" },
      { state: "overdue" },
      { message: "" },
      { note: "" },
      { sentToCustomer: undefined },
    ]) {
      expect(parseFollowUp(wire(bad), false), JSON.stringify(bad)).toBeNull();
    }
    expect(parseFollowUp(wire(), true)).toBeNull(); // invoice context required when asked
    expect(parseFollowUp("nope", false)).toBeNull();
  });

  it("accepts the multi-line message the template produces, but not other control characters", () => {
    const multi = "Hi Northwind,\n\nA friendly reminder.\r\n\tThank you!";
    expect(
      parseFollowUp(wire({ message: multi, note: "line one\nline two" }), false),
    ).toMatchObject({ message: multi });
    expect(parseFollowUp(wire({ message: "bad\u0000char" }), false)).toBeNull();
    expect(parseFollowUp(wire({ note: "bell\u0007" }), false)).toBeNull();
    expect(parseFollowUp(wire({ message: "x".repeat(2001) }), false)).toBeNull();
  });

  it("maps list failures without ever inventing data", async () => {
    expect((await fake(() => json(401, {})).api.list(sig())).kind).toBe("unauthorized");
    expect((await fake(() => json(500, {})).api.list(sig())).kind).toBe("unavailable");
    expect(
      (
        await fake(() => {
          throw new TypeError("net");
        }).api.list(sig())
      ).kind,
    ).toBe("offline");
    const ac = new AbortController();
    const aborted = fake(() => {
      ac.abort();
      throw new DOMException("x", "AbortError");
    });
    expect((await aborted.api.list(ac.signal)).kind).toBe("aborted");
  });

  it("schedules with a CSRF-protected JSON POST that carries the invoice id in the body only", async () => {
    const { api, calls } = fake(() => json(201, wire()));
    const r = await api.create(INV, input, CSRF, sig());
    expect(r.kind).toBe("ok");
    const c = calls[0] as Call;
    expect(c.url).toBe("/api/follow-ups");
    expect(c.init.method).toBe("POST");
    expect(c.init.headers).toMatchObject({
      "x-csrf-token": CSRF,
      "content-type": "application/json",
    });
    expect(JSON.parse(c.init.body as string)).toEqual({ invoiceId: INV, ...input });
  });

  it("reschedule, complete and cancel hit their own routes; complete/cancel send no body", async () => {
    const { api, calls } = fake(() =>
      json(
        200,
        wire({ status: "completed", state: "completed", completedAt: "2026-10-30T12:05:00.000Z" }),
      ),
    );
    await api.reschedule(ID, input, CSRF, sig());
    await api.complete(ID, CSRF, sig());
    await api.cancel(ID, CSRF, sig());
    expect(calls.map((c) => c.url)).toEqual([
      `/api/follow-ups/${ID}/reschedule`,
      `/api/follow-ups/${ID}/complete`,
      `/api/follow-ups/${ID}/cancel`,
    ]);
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual(input);
    expect(calls[1]?.init.body).toBeUndefined();
    expect(calls[2]?.init.body).toBeUndefined();
    for (const c of calls) expect(c.init.headers).toMatchObject({ "x-csrf-token": CSRF });
  });

  it("maps every documented refusal to its own outcome", async () => {
    const out = async (status: number, body: unknown = {}) =>
      (await fake(() => json(status, body)).api.complete(ID, CSRF, sig())).kind;
    expect(await out(409, { error: "duplicate_active" })).toBe("duplicate");
    expect(await out(409, { error: "not_active" })).toBe("not-active");
    expect(await out(409, { error: "something_else" })).toBe("unavailable");
    expect(await out(400)).toBe("invalid");
    expect(await out(401)).toBe("unauthorized");
    expect(await out(403)).toBe("forbidden");
    expect(await out(404)).toBe("not-found");
    expect(await out(500)).toBe("unavailable");
    expect(await out(200, { not: "a follow-up" })).toBe("malformed");
    expect(
      (
        await fake(() => {
          throw new TypeError("net");
        }).api.cancel(ID, CSRF, sig())
      ).kind,
    ).toBe("offline");
  });

  it("never sends a request for an id that is not a UUID", async () => {
    const { api, calls } = fake(() => json(200, {}));
    expect((await api.complete("../../x", CSRF, sig())).kind).toBe("not-found");
    expect((await api.reschedule("x", input, CSRF, sig())).kind).toBe("not-found");
    expect((await api.create("x", input, CSRF, sig())).kind).toBe("not-found");
    expect((await api.forInvoice("x", sig())).kind).toBe("not-found");
    expect(calls).toEqual([]);
  });

  it("reads one invoice's follow-ups and refuses records for a different invoice", async () => {
    const ok = fake(() =>
      json(200, {
        now: "2026-10-30T12:00:00.000Z",
        active: wire(),
        recent: [
          wire({
            id: "11111111-1111-4111-8111-111111111111",
            status: "completed",
            state: "completed",
            completedAt: "2026-10-30T12:05:00.000Z",
          }),
        ],
      }),
    );
    const r = await ok.api.forInvoice(INV, sig());
    expect(r).toMatchObject({ kind: "ok", active: { id: ID } });
    expect(ok.calls[0]?.url).toBe(`/api/invoice-drafts/${INV}/follow-ups`);
    const wrong = fake(() =>
      json(200, {
        now: "2026-10-30T12:00:00.000Z",
        active: wire({ invoiceId: "22222222-2222-4222-8222-222222222222" }),
        recent: [],
      }),
    );
    expect((await wrong.api.forInvoice(INV, sig())).kind).toBe("malformed");
    expect((await fake(() => json(404, {})).api.forInvoice(INV, sig())).kind).toBe("not-found");
    const none = await fake(() =>
      json(200, { now: "2026-10-30T12:00:00.000Z", active: null, recent: [] }),
    ).api.forInvoice(INV, sig());
    expect(none).toEqual({ kind: "ok", active: null, recent: [] });
  });
});
