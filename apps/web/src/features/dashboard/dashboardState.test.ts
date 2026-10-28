import { describe, expect, it } from "vitest";
import type { ListItem } from "../../domain/serverList.js";
import {
  dashReducer,
  initialDash,
  MAX_LOADED_ROWS,
  NO_FILTERS,
  type DashState,
} from "./dashboardState.js";

/**
 * Objective: the real dashboard list can never show a stale, duplicated or reordered page. Every
 * async outcome is tagged with the generation it was requested under; filter changes reset rows and
 * cursor; load-more is single-flight; a repeated row fails closed.
 */
const item = (n: number): ListItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  customerName: `Customer ${n}`,
  customerEmail: `c${n}@example.test`,
  currency: "USD",
  dueDate: "2030-01-15",
  total: "10.00",
  createdAt: "2026-10-27T10:00:00.000Z",
  paypalState: "none",
});
const page = (ns: number[], nextCursor: string | null = null) => ({
  items: ns.map(item),
  nextCursor,
});
const loaded = (ns: number[], next: string | null = null): DashState =>
  dashReducer(initialDash, { type: "page", generation: 0, page: page(ns, next), append: false });

describe("dashReducer", () => {
  it("starts loading with no rows", () => {
    expect(initialDash.status).toBe("loading");
    expect(initialDash.items).toEqual([]);
  });
  it("loads a first page", () => {
    const s = loaded([3, 2, 1], "cur1");
    expect(s.status).toBe("loaded");
    expect(s.items.map((i) => i.customerName)).toEqual(["Customer 3", "Customer 2", "Customer 1"]);
    expect(s.nextCursor).toBe("cur1");
  });
  it("an empty first page is loaded-empty, not an error", () => {
    const s = loaded([]);
    expect(s.status).toBe("loaded");
    expect(s.items).toEqual([]);
    expect(s.nextCursor).toBeNull();
  });

  describe("stale and out-of-order protection", () => {
    it("drops a page for a superseded generation after a filter change", () => {
      const s1 = dashReducer(initialDash, {
        type: "filters",
        filters: { ...NO_FILTERS, currency: "EUR" },
      });
      expect(s1.generation).toBe(1);
      const stale = dashReducer(s1, {
        type: "page",
        generation: 0,
        page: page([9]),
        append: false,
      });
      expect(stale).toBe(s1);
      expect(stale.items).toEqual([]);
      const fresh = dashReducer(s1, {
        type: "page",
        generation: 1,
        page: page([1]),
        append: false,
      });
      expect(fresh.items).toHaveLength(1);
    });
    it("two quick filter changes: only the last generation's answer is accepted, whatever the order", () => {
      let s = dashReducer(initialDash, {
        type: "filters",
        filters: { ...NO_FILTERS, status: "created" },
      }); // gen 1
      s = dashReducer(s, { type: "filters", filters: { ...NO_FILTERS, status: "none" } }); // gen 2
      s = dashReducer(s, { type: "page", generation: 2, page: page([2]), append: false });
      s = dashReducer(s, { type: "page", generation: 1, page: page([1]), append: false }); // late, older
      expect(s.items.map((i) => i.customerName)).toEqual(["Customer 2"]);
    });
    it("a late failure of an older generation does not replace a good list", () => {
      let s = loaded([1]);
      s = dashReducer(s, { type: "filters", filters: { ...NO_FILTERS, q: "x" } });
      s = dashReducer(s, { type: "page", generation: 1, page: page([5]), append: false });
      const after = dashReducer(s, {
        type: "failed",
        generation: 0,
        kind: "offline",
        append: false,
      });
      expect(after).toBe(s);
    });
    it("an identical filter set is a no-op (no refetch)", () => {
      const s = loaded([1]);
      expect(dashReducer(s, { type: "filters", filters: NO_FILTERS })).toBe(s);
    });
  });

  describe("ready flag (filter bar persistence)", () => {
    it("is false until a page loads, then survives every filter change, retry and error", () => {
      expect(initialDash.ready).toBe(false);
      let s = loaded([1]);
      expect(s.ready).toBe(true);
      s = dashReducer(s, { type: "filters", filters: { ...NO_FILTERS, currency: "EUR" } });
      expect(s.ready).toBe(true);
      s = dashReducer(s, {
        type: "failed",
        generation: s.generation,
        kind: "offline",
        append: false,
      });
      expect(s.ready).toBe(true);
      s = dashReducer(s, { type: "retry" });
      expect(s.ready).toBe(true);
      expect(
        dashReducer(initialDash, { type: "failed", generation: 0, kind: "offline", append: false })
          .ready,
      ).toBe(false);
    });
  });

  describe("debounced search", () => {
    it("is merged into the latest filters, so a pill clicked while typing is not undone", () => {
      let s = dashReducer(initialDash, {
        type: "filters",
        filters: { ...NO_FILTERS, currency: "EUR" },
      });
      s = dashReducer(s, { type: "search", q: "zeta" });
      expect(s.filters).toEqual({ currency: "EUR", status: "ALL", q: "zeta" });
      expect(s.generation).toBe(2);
    });
    it("the same search text again is a no-op (no refetch)", () => {
      const s = dashReducer(initialDash, { type: "search", q: "zeta" });
      expect(dashReducer(s, { type: "search", q: "zeta" })).toBe(s);
    });
  });

  describe("filters reset the cursor and rows", () => {
    it("changing a filter clears rows and cursor so a cursor is never replayed under other filters", () => {
      const s = loaded([3, 2, 1], "cursorA");
      const t = dashReducer(s, { type: "filters", filters: { ...NO_FILTERS, currency: "JPY" } });
      expect(t.items).toEqual([]);
      expect(t.nextCursor).toBeNull();
      expect(t.status).toBe("loading");
      expect(t.filters.currency).toBe("JPY");
    });
  });

  describe("pagination", () => {
    it("load-more is only possible from a settled list with a cursor; a double click is a no-op", () => {
      expect(dashReducer(loaded([1]), { type: "load-more" }).status).toBe("loaded"); // no cursor
      const s = loaded([2, 1], "c1");
      const a = dashReducer(s, { type: "load-more" });
      expect(a.status).toBe("loading-more");
      expect(a.generation).toBe(s.generation + 1);
      expect(dashReducer(a, { type: "load-more" })).toBe(a);
      expect(dashReducer(initialDash, { type: "load-more" })).toBe(initialDash);
    });
    it("appends the next page in order and finishes when the cursor is null", () => {
      let s = loaded([4, 3], "c1");
      s = dashReducer(s, { type: "load-more" });
      s = dashReducer(s, {
        type: "page",
        generation: s.generation,
        page: page([2, 1], null),
        append: true,
      });
      expect(s.items.map((i) => i.customerName)).toEqual([
        "Customer 4",
        "Customer 3",
        "Customer 2",
        "Customer 1",
      ]);
      expect(s.nextCursor).toBeNull();
      expect(s.status).toBe("loaded");
    });
    it("refuses a page that repeats an already loaded row (no duplicates ever shown)", () => {
      let s = loaded([3, 2], "c1");
      s = dashReducer(s, { type: "load-more" });
      s = dashReducer(s, {
        type: "page",
        generation: s.generation,
        page: page([2, 1], null),
        append: true,
      });
      expect(s.items.map((i) => i.customerName)).toEqual(["Customer 3", "Customer 2"]);
      expect(s.moreError).toBe("malformed");
    });
    it("a failed next page keeps the loaded rows and offers a retry that re-requests the same cursor", () => {
      let s = loaded([3, 2], "c1");
      s = dashReducer(s, { type: "load-more" });
      s = dashReducer(s, {
        type: "failed",
        generation: s.generation,
        kind: "offline",
        append: true,
      });
      expect(s.items).toHaveLength(2);
      expect(s.moreError).toBe("offline");
      expect(s.nextCursor).toBe("c1");
      s = dashReducer(s, { type: "load-more" });
      expect(s.status).toBe("loading-more");
      expect(s.moreError).toBeNull();
    });
  });

  describe("failures and retry", () => {
    it("a first-page failure empties the list and shows the error; retry loads again", () => {
      let s = dashReducer(initialDash, {
        type: "failed",
        generation: 0,
        kind: "unavailable",
        append: false,
      });
      expect(s.status).toBe("error");
      expect(s.error).toBe("unavailable");
      expect(s.items).toEqual([]);
      s = dashReducer(s, { type: "retry" });
      expect(s.status).toBe("loading");
      expect(s.error).toBeNull();
      expect(s.generation).toBe(1);
      // the failed attempt's late echo (generation 0) cannot resurrect the error
      expect(
        dashReducer(s, { type: "failed", generation: 0, kind: "offline", append: false }),
      ).toBe(s);
    });
  });
});

describe("rendering bound", () => {
  it("offers no further page once MAX_LOADED_ROWS invoices are loaded, even with a cursor", () => {
    const full = loaded(
      Array.from({ length: MAX_LOADED_ROWS }, (_, i) => i + 1),
      "more",
    );
    expect(full.nextCursor).toBe("more");
    expect(dashReducer(full, { type: "load-more" })).toBe(full);
  });
  it("still pages below the bound", () => {
    const s = loaded(
      Array.from({ length: MAX_LOADED_ROWS - 20 }, (_, i) => i + 1),
      "more",
    );
    expect(dashReducer(s, { type: "load-more" }).status).toBe("loading-more");
  });
});
