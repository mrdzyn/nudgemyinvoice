import { describe, expect, it, vi } from "vitest";
import type { ListItem } from "../domain/serverList.js";
import { mustConfirmLeave } from "../invoices/leaveGuard.js";
import type { ListQuery, ListResult } from "../invoices/api.js";
import { nudgeyAction } from "../components/Nudgey.js";
import {
  STATUS_MAX_TERM,
  STATUS_PAGE,
  StatusLookup,
  statusOpenAction,
  type StatusDeps,
} from "./statusLookup.js";

const item = (n: number, over: Partial<ListItem> = {}): ListItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  customerName: `Customer ${n}`,
  customerEmail: `c${n}@example.com`,
  currency: "USD",
  dueDate: "2030-01-15",
  total: "540.00",
  createdAt: "2026-10-30T12:00:00.000Z",
  paypalState: "none",
  ...over,
});
const ok = (items: ListItem[], next: string | null = null): ListResult => ({
  kind: "ok",
  page: { items, nextCursor: next },
});

function make(respond?: (q: ListQuery) => ListResult | Promise<ListResult>) {
  const queries: ListQuery[] = [];
  const gates: { resolve: (r: ListResult) => void; signal: AbortSignal; q: ListQuery }[] = [];
  const expired = vi.fn();
  const deps: StatusDeps = {
    listInvoices: respond
      ? async (q) => (queries.push(q), respond(q))
      : (q, signal) =>
          new Promise<ListResult>(
            (resolve) => (queries.push(q), gates.push({ resolve, signal, q })),
          ),
    expired,
  };
  return { s: new StatusLookup(deps), queries, gates, expired };
}

describe("'Check invoice status' is a read-only selector, not a duplicate dashboard shortcut", () => {
  it("has no navigation action of its own, while View my invoices still goes to the dashboard", () => {
    expect(nudgeyAction("status")).toBeNull();
    expect(nudgeyAction("browse")).toEqual({ type: "navigate", screen: "dashboard" });
    expect(nudgeyAction("create")).toEqual({
      type: "navigate",
      screen: "composer",
      resetComposer: true,
    });
  });

  it("loads ONE bounded page of the operator's invoices through the existing search (empty term = q null)", async () => {
    const { s, queries } = make(() => ok([item(1, { paypalState: "created" }), item(2)], "next"));
    await s.search("");
    expect(queries).toEqual([
      { limit: STATUS_PAGE, cursor: null, currency: null, status: null, q: null },
    ]);
    expect(s.getSnapshot()).toMatchObject({ phase: "ready", more: true, failure: null, term: "" });
    expect(s.getSnapshot().items.map((i) => i.paypalState)).toEqual(["created", "none"]);
  });

  it("searches by customer with the term only in the request body, normalised, never a cursor", async () => {
    const { s, queries } = make(() => ok([item(1, { customerName: "Northwind Studio" })]));
    await s.search("  Northwind    Studio ");
    expect(queries).toEqual([
      { limit: STATUS_PAGE, cursor: null, currency: null, status: null, q: "Northwind Studio" },
    ]);
    expect(s.getSnapshot().term).toBe("Northwind Studio");
  });

  it("an empty answer is 'ready' with no items and no error (so the UI can say 'no invoices' / 'no match')", async () => {
    const { s } = make(() => ok([]));
    await s.search("Nobody");
    expect(s.getSnapshot()).toMatchObject({
      phase: "ready",
      items: [],
      more: false,
      failure: null,
      term: "Nobody",
    });
  });

  it("shows loading first, and each server failure as its own honest error (never as an empty list)", async () => {
    for (const kind of ["offline", "unavailable", "malformed", "forbidden", "rejected"] as const) {
      const { s } = make(() => ({ kind }) as ListResult);
      const p = s.search("");
      expect(s.getSnapshot().phase).toBe("loading");
      await p;
      expect(s.getSnapshot(), kind).toMatchObject({ phase: "error", failure: kind, items: [] });
    }
  });

  it("a 401 ends the session and leaves nothing behind", async () => {
    const { s, expired } = make(() => ({ kind: "unauthorized" }));
    await s.search("");
    expect(expired).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).toMatchObject({ phase: "idle", items: [], selectedId: null });
  });

  it("a new search aborts the previous request and a late answer for it is never shown", async () => {
    const { s, gates } = make();
    const first = s.search("North");
    const second = s.search("Vienna");
    expect(gates[0]?.signal.aborted).toBe(true);
    gates[1]?.resolve(ok([item(2, { customerName: "Vienna Cafe" })]));
    gates[0]?.resolve(ok([item(1, { customerName: "Northwind Studio" })])); // late
    await Promise.all([first, second]);
    expect(s.getSnapshot().items.map((i) => i.customerName)).toEqual(["Vienna Cafe"]);
    expect(s.getSnapshot().term).toBe("Vienna");
  });

  it("an internally aborted old search still expires the active session on HTTP 401", async () => {
    const { s, gates, expired } = make();
    const first = s.search("North");
    const second = s.search("Vienna");
    expect(gates[0]?.signal.aborted).toBe(true);
    gates[1]?.resolve(ok([item(2, { customerName: "Vienna Cafe" })]));
    await second;
    expect(s.getSnapshot().items.map((i) => i.customerName)).toEqual(["Vienna Cafe"]);
    gates[0]?.resolve({ kind: "unauthorized" });
    await first;
    expect(expired).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).toMatchObject({ phase: "idle", items: [], selectedId: null });
  });

  it("clears old invoices synchronously while the debounced term is waiting to be sent", async () => {
    let result = ok([item(1), item(2)]);
    const { s, queries } = make(() => result);
    await s.search("");
    s.select(item(2).id);
    expect(s.getSnapshot().selectedId).toBe(item(2).id);

    // StatusPicker calls prepareSearch from the input event; no 250 ms timer or second request has
    // fired yet, but old rows and the previously actionable selection are already gone.
    s.prepareSearch("Customer 1");
    expect(s.getSnapshot()).toMatchObject({
      phase: "loading",
      term: "Customer 1",
      items: [],
      more: false,
      selectedId: null,
    });
    expect(queries).toHaveLength(1);

    result = ok([item(1)]);
    await s.search("Customer 1");
    expect(queries).toHaveLength(2);
    expect(s.getSnapshot().items.map((i) => i.id)).toEqual([item(1).id]);
  });

  it("reset() (panel closed / Back / sign-out) aborts, forgets and drops the late answer; dispose() likewise", async () => {
    const { s, gates, expired } = make();
    const p = s.search("");
    s.reset();
    expect(gates[0]?.signal.aborted).toBe(true);
    gates[0]?.resolve({ kind: "unauthorized" });
    await p;
    expect(s.getSnapshot()).toMatchObject({ phase: "idle", items: [] });
    expect(expired).not.toHaveBeenCalled();
    const q = s.search("");
    s.dispose();
    gates[1]?.resolve({ kind: "unauthorized" });
    await q;
    expect(s.getSnapshot().items).toEqual([]);
    expect(expired).not.toHaveBeenCalled();
    s.attach(); // StrictMode remount
    const r = s.search("");
    gates[2]?.resolve(ok([item(3)]));
    await r;
    expect(s.getSnapshot().items).toHaveLength(1);
  });

  it("refuses control characters and over-long terms WITHOUT a request and without stale matches", async () => {
    const { s, queries } = make(() => ok([item(1)]));
    await s.search("");
    expect(s.getSnapshot().items).toHaveLength(1);
    for (const bad of ["a\tb", "a\nb", "a\u0000b", "x".repeat(STATUS_MAX_TERM + 1)]) {
      await s.search(bad);
      expect(s.getSnapshot(), JSON.stringify(bad.slice(0, 6))).toMatchObject({
        invalidTerm: true,
        items: [],
        selectedId: null,
      });
    }
    expect(queries).toHaveLength(1); // only the first, valid search reached the server
    await s.search("x".repeat(STATUS_MAX_TERM));
    expect(queries).toHaveLength(2);
    expect(s.getSnapshot().invalidTerm).toBe(false);
  });

  it("selection only accepts a loaded invoice and is cleared as soon as a new search starts", async () => {
    let answer = ok([item(1), item(2)]);
    const { s } = make(() => answer);
    await s.search("");
    s.select("00000000-0000-4000-8000-000000000009"); // not loaded: ignored
    expect(s.getSnapshot().selectedId).toBeNull();
    s.select(item(2).id);
    expect(s.getSnapshot().selectedId).toBe(item(2).id);
    answer = ok([item(2)]); // still contains the selection
    await s.search("Customer 2");
    expect(s.getSnapshot().selectedId).toBeNull(); // a different term always requires a fresh selection
    answer = ok([item(1)]); // no longer contains it
    await s.search("Customer 1");
    expect(s.getSnapshot().selectedId).toBeNull();
    s.select(item(1).id);
    s.select(null);
    expect(s.getSnapshot().selectedId).toBeNull();
  });

  it("retry() repeats the last search", async () => {
    let n = 0;
    const { s, queries } = make(() => (n++ === 0 ? { kind: "offline" } : ok([item(1)])));
    await s.search("Acme");
    expect(s.getSnapshot().phase).toBe("error");
    await s.retry();
    expect(queries.map((q) => q.q)).toEqual(["Acme", "Acme"]);
    expect(s.getSnapshot()).toMatchObject({ phase: "ready", items: [{ id: item(1).id }] });
  });
});

describe("opening the selected invoice keeps the unsaved-save guard", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("uses the existing real-mode open-saved action", () => {
    expect(statusOpenAction(id)).toEqual({ type: "open-saved", id, notice: "opened" });
  });
  it("asks first while a save is pending or uncertain, and is free otherwise", () => {
    for (const g of ["pending", "uncertain"] as const)
      expect(mustConfirmLeave(g, statusOpenAction(id))).toBe(true);
    expect(mustConfirmLeave("none", statusOpenAction(id))).toBe(false);
    // the save's OWN outcome is still never blocked
    expect(mustConfirmLeave("pending", { type: "open-saved", id, notice: "created" })).toBe(false);
  });
});
