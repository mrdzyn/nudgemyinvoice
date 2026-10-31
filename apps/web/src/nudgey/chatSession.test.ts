import { describe, expect, it, vi } from "vitest";
import type { ListQuery, ListResult } from "../invoices/api.js";
import type { ListItem } from "../domain/serverList.js";
import { ChatSession, MAX_MESSAGES, type ChatDeps } from "./chatSession.js";
import { ScheduleCandidateController } from "./scheduleCandidate.js";

const item = (n: number): ListItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  customerName: `Customer ${n}`,
  customerEmail: `c${n}@example.com`,
  currency: "USD",
  dueDate: "2030-01-15",
  total: "540.00",
  createdAt: "2026-10-30T12:00:00.000Z",
  paypalState: "none",
});
const ok = (items: ListItem[]): ListResult => ({ kind: "ok", page: { items, nextCursor: null } });

function make(over: Partial<ChatDeps> = {}) {
  const announced: string[] = [];
  const expired = vi.fn();
  const gates: { resolve: (r: ListResult) => void; signal: AbortSignal; q: ListQuery }[] = [];
  const deps: ChatDeps = {
    listInvoices: (q, signal) =>
      new Promise<ListResult>((resolve) => gates.push({ resolve, signal, q })),
    followUps: {
      readFresh: async () => ({
        kind: "ok",
        now: "2026-10-30T12:00:00.000Z",
        counts: { due: 0, upcoming: 0 },
        items: [],
      }),
    },
    expired,
    announce: (m) => announced.push(m),
    ...over,
  };
  return { s: new ChatSession(deps), gates, announced, expired };
}

describe("Nudgey chat session (in memory only)", () => {
  it("shows the question with a pending reply, then replaces it with the real result and announces briefly", async () => {
    const { s, gates, announced } = make();
    const p = s.ask("Show my invoices");
    expect(s.getSnapshot().map((m) => [m.role, m.pending ?? false])).toEqual([
      ["user", false],
      ["nudgey", true],
    ]);
    expect(s.busy).toBe(true);
    gates[0]?.resolve(ok([item(1)]));
    await p;
    const last = s.getSnapshot().at(-1);
    expect(last?.pending).toBeUndefined();
    expect(last?.result).toMatchObject({
      kind: "invoices",
      items: [{ customerName: "Customer 1" }],
    });
    expect(announced).toEqual(["Showing 1 invoice."]);
    expect(s.busy).toBe(false);
  });

  it("a new question aborts the previous one and a late answer for it is never rendered", async () => {
    const { s, gates } = make();
    const first = s.ask("Show my USD invoices");
    const second = s.ask("Find invoices for Northwind Studio");
    expect(gates[0]?.signal.aborted).toBe(true);
    expect(gates[1]?.signal.aborted).toBe(false);
    gates[1]?.resolve(ok([item(2)]));
    gates[0]?.resolve(ok([item(9)])); // arrives late
    await Promise.all([first, second]);
    const snap = s.getSnapshot();
    expect(snap.map((m) => m.role)).toEqual(["user", "nudgey"]); // the abandoned question was dropped
    expect(snap[0]?.text).toBe("Find invoices for Northwind Studio");
    expect(JSON.stringify(snap)).not.toContain("Customer 9");
    expect(JSON.stringify(snap)).toContain("Customer 2");
  });

  it("clear() aborts the lookup, forgets everything and drops the late answer", async () => {
    const { s, gates } = make();
    const p = s.ask("Show my invoices");
    s.clear();
    expect(gates[0]?.signal.aborted).toBe(true);
    expect(s.getSnapshot()).toEqual([]);
    gates[0]?.resolve(ok([item(1)]));
    await p;
    expect(s.getSnapshot()).toEqual([]);
  });

  it("a 401 empties the conversation and ends the session", async () => {
    const { s, gates, expired } = make();
    const p = s.ask("Show my invoices");
    gates[0]?.resolve({ kind: "unauthorized" });
    await p;
    expect(expired).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).toEqual([]);
  });

  it("empty, over-long and unreadable prompts never reach the API", async () => {
    const { s, gates } = make();
    await s.ask("   ");
    await s.ask("x".repeat(500));
    await s.ask("bad\u0000input");
    expect(gates).toEqual([]);
    const texts = s
      .getSnapshot()
      .filter((m) => m.role === "nudgey")
      .map((m) => m.text);
    expect(texts[0]).toMatch(/Type a question first/);
    expect(texts[1]).toMatch(/under 200 characters/);
    expect(texts[2]).toMatch(/characters I can't read/);
    // the typed text is capped, not stored whole
    expect(s.getSnapshot().find((m) => m.role === "user")?.text?.length).toBeLessThanOrEqual(200);
  });

  it("answers payment and unknown questions locally, with no request at all", async () => {
    const { s, gates } = make();
    await s.ask("Is Northwind Studio paid?");
    await s.ask("what's for lunch");
    expect(gates).toEqual([]);
    const results = s.getSnapshot().flatMap((m) => (m.result ? [m.result] : []));
    expect(results.map((r) => (r.kind === "message" ? r.tone : r.kind))).toEqual(["limit", "info"]);
  });

  it("routes a supported scheduling command only to the authenticated invoice reader and shows a proposal, never saving", async () => {
    const gates: { resolve: (r: ListResult) => void; query: ListQuery; signal: AbortSignal }[] = [];
    const listInvoices = (query: ListQuery, signal: AbortSignal) =>
      new Promise<ListResult>((resolve) => gates.push({ resolve, query, signal }));
    const create = vi.fn();
    const candidates = new ScheduleCandidateController({
      listInvoices,
      expired: vi.fn(),
      now: () => new Date("2026-10-31T04:00:00.000Z"),
      timeZone: () => "Asia/Manila",
    });
    const s = new ChatSession({
      listInvoices,
      followUps: { readFresh: async () => ({ kind: "unavailable" }) },
      expired: vi.fn(),
      announce: vi.fn(),
      scheduleCandidates: candidates,
      now: () => new Date("2026-10-31T04:00:00.000Z"),
      timeZone: () => "Asia/Manila",
    });
    const pending = s.ask("Remind me to follow up with Northwind Studio tomorrow at 9 AM");
    expect(gates[0]?.query).toEqual({
      limit: 20,
      cursor: null,
      currency: null,
      status: null,
      q: "Northwind Studio",
    });
    expect(gates[0]?.signal.aborted).toBe(false);
    expect(create).not.toHaveBeenCalled();
    gates[0]?.resolve(ok([item(1), item(2)]));
    await pending;
    expect(s.getSnapshot().at(-1)?.schedule).toMatchObject({ kind: "ready", selectedId: null });
    expect(s.getSnapshot().some((m) => m.pending)).toBe(false);
  });

  it("typing a replacement prompt immediately removes old candidate actions while a late 401 still expires the session", async () => {
    let finish!: (result: ListResult) => void;
    let signal!: AbortSignal;
    const expired = vi.fn();
    const listInvoices = (_query: ListQuery, requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<ListResult>((resolve) => (finish = resolve));
    };
    const candidates = new ScheduleCandidateController({
      listInvoices,
      expired,
      now: () => new Date("2026-10-31T04:00:00.000Z"),
      timeZone: () => "Asia/Manila",
    });
    const s = new ChatSession({
      listInvoices,
      followUps: undefined,
      expired,
      announce: vi.fn(),
      scheduleCandidates: candidates,
      now: () => new Date("2026-10-31T04:00:00.000Z"),
      timeZone: () => "Asia/Manila",
    });
    const request = s.ask("Remind me to follow up with Northwind Studio tomorrow at 9 AM");
    expect(s.getSnapshot().some((message) => message.schedule)).toBe(true);
    s.replaceScheduleCandidate(); // called synchronously by Ask input on the first replacement character
    expect(signal.aborted).toBe(true);
    expect(s.getSnapshot().some((message) => message.schedule)).toBe(false);
    finish({ kind: "unauthorized" });
    await request;
    expect(expired).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).toEqual([]);
  });

  it("keeps at most the last messages and writes nothing to browser storage", async () => {
    const stores = { local: 0, session: 0 };
    const g = globalThis as Record<string, unknown>;
    g["localStorage"] = { setItem: () => stores.local++ };
    g["sessionStorage"] = { setItem: () => stores.session++ };
    try {
      const { s } = make({ listInvoices: async () => ok([]) });
      for (let i = 0; i < 15; i++) await s.ask("show my invoices");
      expect(s.getSnapshot().length).toBeLessThanOrEqual(MAX_MESSAGES);
      expect(stores).toEqual({ local: 0, session: 0 });
    } finally {
      delete g["localStorage"];
      delete g["sessionStorage"];
    }
  });

  it("a disposed session (workspace gone) renders nothing late and does not call expired or announce", async () => {
    const { s, gates, announced } = make();
    const p = s.ask("Show my invoices");
    s.dispose();
    gates[0]?.resolve(ok([item(1)]));
    await p;
    expect(announced).toEqual([]);
    expect(s.getSnapshot().some((m) => m.result)).toBe(false);
    s.attach(); // StrictMode remount
    const p2 = s.ask("show my invoices");
    gates[1]?.resolve(ok([item(2)]));
    await p2;
    expect(s.getSnapshot().some((m) => m.result)).toBe(true);
  });

  it("a REJECTED replacement question still cancels the lookup in flight (review M2)", async () => {
    for (const bad of ["x".repeat(500), "bad\u0000input", "tab\there", "   "]) {
      const { s, gates, announced, expired } = make();
      const a = s.ask("Show my invoices");
      expect(gates[0]?.signal.aborted).toBe(false);
      await s.ask(bad); // invalid, over-long or empty: no new request, but the old one must end
      expect(gates[0]?.signal.aborted, JSON.stringify(bad.slice(0, 10))).toBe(true);
      expect(gates).toHaveLength(1);
      gates[0]?.resolve(ok([item(1)])); // the late answer for the replaced question
      await a;
      expect(announced).toEqual([]);
      expect(expired).not.toHaveBeenCalled();
      expect(s.getSnapshot().some((m) => m.result || m.pending)).toBe(false);
      expect(JSON.stringify(s.getSnapshot())).not.toContain("Customer 1");
    }
  });

  it("a late 401 for a replaced (rejected-over) question does not end the session or clear the new state", async () => {
    const { s, gates, expired } = make();
    const a = s.ask("Show my invoices");
    await s.ask("x".repeat(500));
    gates[0]?.resolve({ kind: "unauthorized" });
    await a;
    expect(expired).not.toHaveBeenCalled();
    expect(s.getSnapshot().some((m) => m.text?.includes("under 200 characters"))).toBe(true);
  });
});
