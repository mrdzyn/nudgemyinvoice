import { describe, expect, it, vi } from "vitest";
import type { FollowUpApi, FollowUpView, MutationOutcome } from "./api.js";
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
