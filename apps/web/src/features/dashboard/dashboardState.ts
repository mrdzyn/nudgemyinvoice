import type { ListItem, ListPage } from "../../domain/serverList.js";
import type { CurrencyCode } from "../../domain/types.js";

export type StatusFilter = "ALL" | "none" | "progress" | "created" | "attention";

export interface Filters {
  currency: CurrencyCode | "ALL";
  status: StatusFilter;
  /** Applied (debounced) search text, already trimmed. */
  q: string;
}

export const NO_FILTERS: Filters = { currency: "ALL", status: "ALL", q: "" };
export const hasFilters = (f: Filters) => f.currency !== "ALL" || f.status !== "ALL" || f.q !== "";

export type FailureKind = "offline" | "unavailable" | "malformed" | "forbidden" | "rejected";

export interface DashState {
  filters: Filters;
  /** Bumped by every filter change and every retry; anything tagged with another value is stale. */
  generation: number;
  /** True once any page has loaded: from then on the filter bar stays mounted through loads and errors. */
  ready: boolean;
  status: "loading" | "loaded" | "loading-more" | "error";
  items: ListItem[];
  nextCursor: string | null;
  /** Initial/first-page failure (items are empty). */
  error: FailureKind | null;
  /** Failure of a later page: the rows already loaded stay on screen. */
  moreError: FailureKind | null;
}

export const initialDash: DashState = {
  filters: NO_FILTERS,
  generation: 0,
  ready: false,
  status: "loading",
  items: [],
  nextCursor: null,
  error: null,
  moreError: null,
};

export type DashAction =
  | { type: "filters"; filters: Filters }
  /** The debounced search text only: merged into the LATEST filters so a pill clicked meanwhile survives. */
  | { type: "search"; q: string }
  | { type: "retry" }
  | { type: "page"; generation: number; page: ListPage; append: boolean }
  | { type: "failed"; generation: number; kind: FailureKind; append: boolean }
  | { type: "load-more" };

/**
 * Pure state of the real dashboard list. Every asynchronous outcome carries the generation it was
 * requested under; a result for any other generation (a superseded filter, a retried request, an
 * out-of-order answer) is dropped. Changing a filter resets rows and cursor, so a cursor can never
 * be replayed against different filters. Appended pages that repeat a loaded id are refused.
 */
export function dashReducer(s: DashState, a: DashAction): DashState {
  switch (a.type) {
    case "filters":
      if (JSON.stringify(a.filters) === JSON.stringify(s.filters)) return s;
      return {
        ...initialDash,
        ready: s.ready,
        filters: a.filters,
        generation: s.generation + 1,
      };
    case "search":
      return dashReducer(s, { type: "filters", filters: { ...s.filters, q: a.q } });
    case "retry":
      return {
        ...s,
        generation: s.generation + 1,
        status: "loading",
        error: null,
        moreError: null,
      };
    case "load-more":
      // Only from a settled list that really has another page; a double click is a no-op.
      if (s.status !== "loaded" || !s.nextCursor) return s;
      return { ...s, status: "loading-more", moreError: null, generation: s.generation + 1 };
    case "page": {
      if (a.generation !== s.generation) return s;
      if (a.append) {
        const have = new Set(s.items.map((i) => i.id));
        // A repeated row means the paging contract broke: fail closed instead of showing duplicates.
        if (a.page.items.some((i) => have.has(i.id)))
          return { ...s, status: "loaded", moreError: "malformed" };
        return {
          ...s,
          ready: true,
          status: "loaded",
          items: [...s.items, ...a.page.items],
          nextCursor: a.page.nextCursor,
          moreError: null,
        };
      }
      return {
        ...s,
        ready: true,
        status: "loaded",
        items: a.page.items,
        nextCursor: a.page.nextCursor,
        error: null,
        moreError: null,
      };
    }
    case "failed":
      if (a.generation !== s.generation) return s;
      return a.append
        ? { ...s, status: "loaded", moreError: a.kind }
        : { ...s, status: "error", error: a.kind, items: [], nextCursor: null };
  }
}

export const apiStatus = (s: StatusFilter) => (s === "ALL" ? null : s);

/** Cursor to send for the current request: only while appending. */
export const cursorFor = (s: DashState) => (s.status === "loading-more" ? s.nextCursor : null);
