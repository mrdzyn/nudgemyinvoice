import { describe, expect, it, vi } from "vitest";
import type { FollowUpApi, FollowUpView, ListOutcome, MutationOutcome } from "./api.js";
import { FollowUpsController } from "./controller.js";

const view = (n: number, state: "due" | "upcoming"): FollowUpView => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  invoiceId: `10000000-0000-4000-8000-00000000000${n}`,
  dueAt: "2026-11-02T01:30:00.000Z",
  timezone: "UTC",
  note: null,
  message: "Hi",
  status: "active",
  state,
  invoice: { customerName: `Cust ${n}`, currency: "USD", total: "1.00", dueDate: "2030-01-15" },
});
const sig = () => new AbortController().signal;
const input = { dueAt: "2026-11-02T01:30:00.000Z", timezone: "UTC", note: null, message: "Hi" };

function fakeApi(server: { items: FollowUpView[] }, over: Partial<FollowUpApi> = {}) {
  const calls: string[] = [];
  const api: FollowUpApi = {
    async list() {
      calls.push("list");
      const due = server.items.filter((i) => i.state === "due").length;
      return {
        kind: "ok",
        now: "2026-10-30T12:00:00.000Z",
        counts: { due, upcoming: server.items.length - due },
        items: [...server.items],
      };
    },
    async forInvoice() {
      return { kind: "ok", active: null, recent: [] };
    },
    async create(invoiceId) {
      calls.push("create");
      server.items.push({ ...view(server.items.length + 1, "upcoming"), invoiceId });
      return { kind: "ok", followUp: server.items.at(-1) as FollowUpView };
    },
    async reschedule() {
      calls.push("reschedule");
      return { kind: "ok", followUp: server.items[0] as FollowUpView };
    },
    async complete(id) {
      calls.push("complete");
      server.items = server.items.filter((i) => i.id !== id);
      return { kind: "ok", followUp: view(9, "upcoming") };
    },
    async cancel(id) {
      calls.push("cancel");
      server.items = server.items.filter((i) => i.id !== id);
      return { kind: "ok", followUp: view(9, "upcoming") };
    },
    ...over,
  };
  return { api, calls };
}

describe("follow-up controller (every number comes from a server read)", () => {
  it("loads real counts and exposes them; mutations bump the version and re-read", async () => {
    const server = { items: [view(1, "due"), view(2, "upcoming")] };
    const { api, calls } = fakeApi(server);
    const c = new FollowUpsController(api, "csrf", () => undefined, 0);
    expect(c.getSnapshot().status).toBe("idle");
    await c.refresh();
    expect(c.getSnapshot()).toMatchObject({
      status: "ready",
      counts: { due: 1, upcoming: 1 },
      version: 0,
    });
    const seen: number[] = [];
    c.subscribe(() => seen.push(c.getSnapshot().version));
    const created = await c.create("30000000-0000-4000-8000-000000000003", input, sig());
    expect(created.kind).toBe("ok");
    expect(c.getSnapshot()).toMatchObject({ version: 1, counts: { due: 1, upcoming: 2 } });
    await c.complete((server.items[0] as FollowUpView).id, sig());
    expect(c.getSnapshot().counts).toEqual({ due: 0, upcoming: 2 });
    await c.cancel((server.items[0] as FollowUpView).id, sig());
    expect(c.getSnapshot().counts).toEqual({ due: 0, upcoming: 1 });
    expect(calls.filter((x) => x === "list").length).toBeGreaterThanOrEqual(4); // a read after each change
    expect(seen.length).toBeGreaterThan(0);
  });

  it("a stale view (not-active / duplicate / not-found) is corrected by a fresh read", async () => {
    const server = { items: [view(1, "upcoming")] };
    const { api, calls } = fakeApi(server, {
      complete: async () => ({ kind: "not-active" }) as MutationOutcome,
    });
    const c = new FollowUpsController(api, "csrf", () => undefined, 0);
    await c.refresh();
    const before = calls.filter((x) => x === "list").length;
    expect((await c.complete("x", sig())).kind).toBe("not-active");
    expect(calls.filter((x) => x === "list").length).toBe(before + 1);
    expect(c.getSnapshot().version).toBe(0); // nothing changed, so no version bump
  });

  it("a 401 anywhere ends the session and changes nothing locally", async () => {
    const expired = vi.fn();
    const server = { items: [view(1, "upcoming")] };
    const { api } = fakeApi(server, {
      list: async () => ({ kind: "unauthorized" }),
      create: async () => ({ kind: "unauthorized" }),
      forInvoice: async () => ({ kind: "unauthorized" }),
    });
    const c = new FollowUpsController(api, "csrf", expired, 0);
    await c.refresh();
    await c.create("x", input, sig());
    await c.forInvoice("x", sig());
    expect(expired).toHaveBeenCalledTimes(3);
    expect(c.getSnapshot().items).toEqual([]);
  });

  it("keeps the last real items when a later read fails, and reports the failure", async () => {
    let fail = false;
    const server = { items: [view(1, "due")] };
    const base = fakeApi(server).api;
    const api: FollowUpApi = {
      ...base,
      list: (s) => (fail ? Promise.resolve({ kind: "offline" }) : base.list(s)),
    };
    const c = new FollowUpsController(api, "csrf", () => undefined, 0);
    await c.refresh();
    fail = true;
    await c.refresh();
    expect(c.getSnapshot()).toMatchObject({
      status: "ready",
      error: "offline",
      counts: { due: 1, upcoming: 0 },
    });
    const empty = new FollowUpsController(
      { ...base, list: async () => ({ kind: "unavailable" }) },
      "csrf",
      () => undefined,
      0,
    );
    await empty.refresh();
    expect(empty.getSnapshot()).toMatchObject({ status: "error", error: "unavailable", items: [] });
  });

  it("passes the CSRF token it was given to every mutation, and stop() ignores late answers", async () => {
    const tokens: string[] = [];
    const server = { items: [] as FollowUpView[] };
    const base = fakeApi(server).api;
    const api: FollowUpApi = {
      ...base,
      create: async (_i, _b, t) => (tokens.push(t), { kind: "invalid" }),
      complete: async (_i, t) => (tokens.push(t), { kind: "invalid" }),
      cancel: async (_i, t) => (tokens.push(t), { kind: "invalid" }),
      reschedule: async (_i, _b, t) => (tokens.push(t), { kind: "invalid" }),
    };
    const c = new FollowUpsController(api, "TOKEN-1", () => undefined, 0);
    await c.create("a", input, sig());
    await c.complete("a", sig());
    await c.cancel("a", sig());
    await c.reschedule("a", input, sig());
    expect(tokens).toEqual(["TOKEN-1", "TOKEN-1", "TOKEN-1", "TOKEN-1"]);
    let release: (() => void) | undefined;
    const slow = new FollowUpsController(
      {
        ...base,
        list: () =>
          new Promise(
            (r) =>
              (release = () =>
                r({
                  kind: "ok",
                  now: "2026-10-30T12:00:00.000Z",
                  counts: { due: 0, upcoming: 0 },
                  items: [],
                })),
          ),
      },
      "csrf",
      () => undefined,
      0,
    );
    const p = slow.refresh();
    slow.stop();
    release?.();
    await p;
    expect(slow.getSnapshot().status).toBe("loading");
  });
});

describe("controller.readFresh (the Nudgey lookup's own read)", () => {
  it("is bound to the caller's signal, updates the shared snapshot, and ends the session on 401", async () => {
    const server = { items: [view(1, "due")] };
    const { api } = fakeApi(server);
    const c = new FollowUpsController(api, "csrf", () => undefined, 0);
    const ac = new AbortController();
    const r = await c.readFresh(ac.signal);
    expect(r).toMatchObject({ kind: "ok", counts: { due: 1, upcoming: 0 } });
    expect(c.getSnapshot()).toMatchObject({ status: "ready", counts: { due: 1, upcoming: 0 } });
    // aborted by the caller: the answer is dropped and the snapshot is untouched
    const ac2 = new AbortController();
    const slowApi: FollowUpApi = {
      ...api,
      list: async () => (
        ac2.abort(),
        { kind: "ok", now: "2026-10-30T12:00:00.000Z", counts: { due: 0, upcoming: 0 }, items: [] }
      ),
    };
    const c2 = new FollowUpsController(slowApi, "csrf", () => undefined, 0);
    expect(await c2.readFresh(ac2.signal)).toEqual({ kind: "aborted" });
    expect(c2.getSnapshot().status).toBe("idle");
    const expired = vi.fn();
    const c3 = new FollowUpsController(
      { ...api, list: async () => ({ kind: "unauthorized" }) },
      "csrf",
      expired,
      0,
    );
    expect((await c3.readFresh(new AbortController().signal)).kind).toBe("unauthorized");
    expect(expired).toHaveBeenCalledTimes(1);
  });
});

describe("out-of-order reads never rewind newer state (review M1)", () => {
  type Gate = { resolve: (r: ListOutcome) => void; signal: AbortSignal };
  const okList = (due: number, items: FollowUpView[]): ListOutcome => ({
    kind: "ok",
    now: "2026-10-30T12:00:00.000Z",
    counts: { due, upcoming: items.length - due },
    items,
  });
  function deferred() {
    const gates: Gate[] = [];
    const api: FollowUpApi = {
      ...fakeApi({ items: [] }).api,
      list: (signal) => new Promise<ListOutcome>((resolve) => gates.push({ resolve, signal })),
    };
    return { api, gates };
  }

  it("an older periodic read that finishes AFTER a newer lookup read does not overwrite it", async () => {
    const { api, gates } = deferred();
    const c = new FollowUpsController(api, "csrf", () => undefined, 0);
    const periodic = c.refresh(); // starts first (older)
    const lookup = c.readFresh(new AbortController().signal); // starts second (newer)
    gates[1]?.resolve(okList(2, [view(1, "due"), view(2, "due")]));
    await lookup;
    expect(c.getSnapshot().counts).toEqual({ due: 2, upcoming: 0 });
    gates[0]?.resolve(okList(0, [view(3, "upcoming")])); // the old, stale answer arrives last
    await periodic;
    expect(c.getSnapshot()).toMatchObject({ counts: { due: 2, upcoming: 0 }, status: "ready" });
    expect(c.getSnapshot().items.map((i) => i.state)).toEqual(["due", "due"]);
  });

  it("the reverse order holds too: an older lookup read cannot rewind a newer refresh after a change", async () => {
    const { api, gates } = deferred();
    const c = new FollowUpsController(api, "csrf", () => undefined, 0);
    const lookup = c.readFresh(new AbortController().signal); // older
    const afterChange = c.refresh(); // newer (the read that follows a successful mutation)
    gates[1]?.resolve(okList(1, [view(1, "due")]));
    await afterChange;
    gates[0]?.resolve(okList(0, [])); // stale
    const answer = await lookup;
    expect(c.getSnapshot().counts).toEqual({ due: 1, upcoming: 0 });
    // the lookup's own caller still receives ITS answer (it asked for that read)
    expect(answer).toMatchObject({ kind: "ok", counts: { due: 0, upcoming: 0 } });
  });

  it("a stale FAILURE cannot replace a newer success, a newer failure still can, and a 401 is never ignored", async () => {
    const expired = vi.fn();
    const { api, gates } = deferred();
    const c = new FollowUpsController(api, "csrf", expired, 0);
    const older = c.readFresh(new AbortController().signal);
    const newer = c.readFresh(new AbortController().signal);
    gates[1]?.resolve(okList(1, [view(1, "due")]));
    await newer;
    gates[0]?.resolve({ kind: "offline" });
    await older;
    expect(c.getSnapshot()).toMatchObject({
      status: "ready",
      error: null,
      counts: { due: 1, upcoming: 0 },
    });
    const newest = c.readFresh(new AbortController().signal);
    gates[2]?.resolve({ kind: "unavailable" });
    await newest;
    expect(c.getSnapshot()).toMatchObject({
      error: "unavailable",
      counts: { due: 1, upcoming: 0 },
    });
    // an older 401 that finishes late still ends the session
    const a = c.readFresh(new AbortController().signal);
    const b = c.readFresh(new AbortController().signal);
    gates[4]?.resolve(okList(0, []));
    await b;
    gates[3]?.resolve({ kind: "unauthorized" });
    await a;
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("abort semantics are unchanged: an aborted caller gets 'aborted' and the snapshot is untouched", async () => {
    const { api, gates } = deferred();
    const c = new FollowUpsController(api, "csrf", () => undefined, 0);
    const ac = new AbortController();
    const p = c.readFresh(ac.signal);
    ac.abort();
    gates[0]?.resolve(okList(5, []));
    expect(await p).toEqual({ kind: "aborted" });
    expect(c.getSnapshot().status).toBe("idle");
  });
});
