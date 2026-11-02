import { minorOf, type ListItem, type ListPage } from "../../domain/serverList.js";
import type { CurrencyCode } from "../../domain/types.js";
import { defaultDashboardDateRange, type DashboardDateRange } from "../../domain/dateRange.js";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";

export type StatusFilter = "ALL" | "none" | "progress" | "created" | "attention";

export interface Filters extends DashboardDateRange {
  currency: CurrencyCode | "ALL";
  status: StatusFilter;
  /** Applied (debounced) search text, already trimmed. */
  q: string;
}

/**
 * Rendering bound. The server pages 20 at a time and the grid keeps every loaded row in the DOM (so
 * assistive technology sees real rows), therefore the dashboard stops offering "Load more" once this
 * many invoices are loaded. Older invoices stay reachable through the server-side search and the
 * currency/status filters, which search the whole account.
 */
export const MAX_LOADED_ROWS = 200;

const initialRange = defaultDashboardDateRange();
const emptyRange: DashboardDateRange = {
  startDate: "",
  endDate: "",
  timeZone: "",
  fromInclusive: "",
  toExclusive: "",
};
export const NO_FILTERS: Filters = {
  ...(initialRange.ok ? initialRange.value : emptyRange),
  currency: "ALL",
  status: "ALL",
  q: "",
};
export const hasFilters = (f: Filters) =>
  f.currency !== "ALL" ||
  f.status !== "ALL" ||
  f.q !== "" ||
  f.startDate !== NO_FILTERS.startDate ||
  f.endDate !== NO_FILTERS.endDate;

export type FailureKind =
  "offline" | "timeout" | "unavailable" | "malformed" | "forbidden" | "rejected";

export interface DashState {
  filters: Filters;
  /** Bumped by every filter change and every retry; anything tagged with another value is stale. */
  generation: number;
  /** Shared filter epoch for aggregate and page searches; pagination advances only `generation`. */
  filterGeneration: number;
  analyticsGeneration: number;
  /** True once any page has loaded: from then on the filter bar stays mounted through loads and errors. */
  ready: boolean;
  status: "loading" | "loaded" | "loading-more" | "error";
  items: ListItem[];
  nextCursor: string | null;
  /** Initial/first-page failure (items are empty). */
  error: FailureKind | null;
  /** Failure of a later page: the rows already loaded stay on screen. */
  moreError: FailureKind | null;
  analyticsStatus: "loading" | "loaded" | "error";
  analytics: AnalyticsSummary | null;
  analyticsError: FailureKind | null;
  /** During the search debounce, old results are hidden and both request families are paused. */
  searchPending: boolean;
  rangeError: string | null;
}

export const initialDash: DashState = {
  filters: NO_FILTERS,
  generation: 0,
  filterGeneration: 0,
  analyticsGeneration: 0,
  ready: false,
  status: "loading",
  items: [],
  nextCursor: null,
  error: null,
  moreError: null,
  analyticsStatus: "loading",
  analytics: null,
  analyticsError: null,
  searchPending: false,
  rangeError: initialRange.ok ? null : initialRange.reason,
};

export type DashAction =
  | { type: "filters"; filters: Filters }
  | { type: "range-invalid"; reason: string }
  | { type: "search-input"; q: string }
  /** The debounced search text only: merged into the LATEST filters so a pill clicked meanwhile survives. */
  | { type: "search"; q: string }
  | { type: "retry" }
  | {
      type: "page";
      generation: number;
      filterGeneration: number;
      page: ListPage;
      append: boolean;
    }
  | {
      type: "failed";
      generation: number;
      filterGeneration: number;
      kind: FailureKind;
      append: boolean;
    }
  | {
      type: "analytics-page";
      generation: number;
      filterGeneration: number;
      summary: AnalyticsSummary;
    }
  | { type: "analytics-failed"; generation: number; filterGeneration: number; kind: FailureKind }
  | { type: "analytics-retry" }
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
      if (JSON.stringify(a.filters) === JSON.stringify(s.filters) && !s.rangeError) return s;
      return {
        ...s,
        status: "loading",
        items: [],
        nextCursor: null,
        error: null,
        moreError: null,
        analyticsStatus: "loading",
        analytics: null,
        analyticsError: null,
        ready: s.ready,
        filters: a.filters,
        generation: s.generation + 1,
        filterGeneration: s.filterGeneration + 1,
        analyticsGeneration: s.analyticsGeneration + 1,
        rangeError: null,
      };
    case "search":
      if (s.filters.q === a.q && !s.searchPending) return s;
      return {
        ...s,
        filters: { ...s.filters, q: a.q },
        generation: s.generation + 1,
        filterGeneration: s.filterGeneration + 1,
        analyticsGeneration: s.analyticsGeneration + 1,
        status: "loading",
        items: [],
        nextCursor: null,
        error: null,
        moreError: null,
        analyticsStatus: "loading",
        analytics: null,
        analyticsError: null,
        searchPending: false,
      };
    case "search-input":
      if (s.filters.q === a.q.trim() && !s.searchPending) return s;
      if (s.searchPending) return s;
      return {
        ...s,
        generation: s.generation + 1,
        filterGeneration: s.filterGeneration + 1,
        analyticsGeneration: s.analyticsGeneration + 1,
        searchPending: true,
      };
    case "range-invalid":
      return {
        ...s,
        generation: s.generation + 1,
        filterGeneration: s.filterGeneration + 1,
        analyticsGeneration: s.analyticsGeneration + 1,
        rangeError: a.reason,
      };
    case "retry":
      return {
        ...s,
        generation: s.generation + 1,
        filterGeneration: s.filterGeneration + 1,
        analyticsGeneration: s.analyticsGeneration + 1,
        status: "loading",
        error: null,
        moreError: null,
        items: [],
        nextCursor: null,
        analyticsStatus: "loading",
        analytics: null,
        analyticsError: null,
      };
    case "analytics-retry":
      return {
        ...s,
        analyticsGeneration: s.analyticsGeneration + 1,
        analyticsStatus: "loading",
        analytics: null,
        analyticsError: null,
      };
    case "load-more":
      // Only from a settled list that really has another page; a double click is a no-op.
      if (s.status !== "loaded" || !s.nextCursor || s.items.length >= MAX_LOADED_ROWS) return s;
      return { ...s, status: "loading-more", moreError: null, generation: s.generation + 1 };
    case "page": {
      if (a.generation !== s.generation || a.filterGeneration !== s.filterGeneration) return s;
      let next: DashState;
      if (a.append) {
        const have = new Set(s.items.map((i) => i.id));
        // A repeated row means the paging contract broke: fail closed instead of showing duplicates.
        if (a.page.items.some((i) => have.has(i.id)))
          return { ...s, status: "loaded", moreError: "malformed" };
        next = {
          ...s,
          ready: true,
          status: "loaded",
          items: [...s.items, ...a.page.items],
          nextCursor: a.page.nextCursor,
          moreError: null,
        };
      } else {
        next = {
          ...s,
          ready: true,
          status: "loaded",
          items: a.page.items,
          nextCursor: a.page.nextCursor,
          error: null,
          moreError: null,
        };
      }
      return matchesAggregate(next) ? next : inconsistent(next);
    }
    case "failed":
      if (a.generation !== s.generation || a.filterGeneration !== s.filterGeneration) return s;
      return a.append
        ? { ...s, status: "loaded", moreError: a.kind }
        : { ...s, status: "error", error: a.kind, items: [], nextCursor: null };
    case "analytics-page":
      if (a.generation !== s.analyticsGeneration || a.filterGeneration !== s.filterGeneration)
        return s;
      {
        const next = {
          ...s,
          analyticsStatus: "loaded" as const,
          analytics: a.summary,
          analyticsError: null,
        };
        return matchesAggregate(next) ? next : inconsistent(next);
      }
    case "analytics-failed":
      if (a.generation !== s.analyticsGeneration || a.filterGeneration !== s.filterGeneration)
        return s;
      return { ...s, analyticsStatus: "error", analytics: null, analyticsError: a.kind };
  }
}

/** Refuse to show two individually valid responses if they cannot describe the same population. */
function matchesAggregate(s: DashState): boolean {
  if (s.searchPending || s.rangeError || s.status !== "loaded" || s.analyticsStatus !== "loaded")
    return true;
  if (!s.analytics) return false;
  const totals = new Map<
    CurrencyCode,
    {
      count: number;
      states: Record<"none" | "progress" | "created" | "attention", number>;
      sum: bigint;
    }
  >();
  for (const item of s.items) {
    const v = totals.get(item.currency) ?? {
      count: 0,
      states: { none: 0, progress: 0, created: 0, attention: 0 },
      sum: 0n,
    };
    v.count += 1;
    const group =
      item.paypalState === "none"
        ? "none"
        : item.paypalState === "pending" || item.paypalState === "creating"
          ? "progress"
          : item.paypalState === "created"
            ? "created"
            : "attention";
    v.states[group] += 1;
    v.sum += minorOf(item.total);
    totals.set(item.currency, v);
  }
  const summary = new Map(s.analytics.currencies.map((c) => [c.currency, c]));
  if (totals.size > summary.size) return false;
  for (const [currency, loaded] of totals) {
    const full = summary.get(currency);
    if (
      !full ||
      loaded.count > full.invoiceCount ||
      (Object.keys(loaded.states) as (keyof typeof loaded.states)[]).some(
        (state) => loaded.states[state] > full.stateCounts[state],
      ) ||
      loaded.sum > BigInt(full.totalMinor)
    )
      return false;
  }
  if (s.items.length === 0 && summary.size > 0) return false;
  return true;
}

function inconsistent(s: DashState): DashState {
  return {
    ...s,
    status: "error",
    error: "malformed",
    items: [],
    nextCursor: null,
    analyticsStatus: "error",
    analytics: null,
    analyticsError: "malformed",
  };
}

export const apiStatus = (s: StatusFilter) => (s === "ALL" ? null : s);

/** Cursor to send for the current request: only while appending. */
export const cursorFor = (s: DashState) => (s.status === "loading-more" ? s.nextCursor : null);
