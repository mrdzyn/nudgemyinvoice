import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AnalyticsQuery, AnalyticsResult, ListQuery, ListResult } from "../../invoices/api.js";
import { PAGE_SIZE } from "../../domain/serverList.js";
import { apiStatus, dashReducer, initialDash, type DashAction } from "./dashboardState.js";

export type ListFn = (query: ListQuery, signal: AbortSignal) => Promise<ListResult>;
export type AnalyticsFn = (query: AnalyticsQuery, signal: AbortSignal) => Promise<AnalyticsResult>;

/**
 * Drives both read surfaces from one filter epoch. Pagination advances only the list request
 * generation, so Load more never refetches the full-population analytics aggregate.
 */
export function useDashboard(list: ListFn, analytics: AnalyticsFn, onExpired: () => void) {
  const [s, dispatch] = useReducer(dashReducer, initialDash);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const mounted = useRef(false);
  const expirationHandled = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const expireIfActive = useCallback(() => {
    if (!mounted.current || expirationHandled.current) return;
    expirationHandled.current = true;
    expired.current();
  }, []);

  useEffect(() => {
    if (s.searchPending || s.rangeError) return;
    if (s.status !== "loading" && s.status !== "loading-more") return;
    const append = s.status === "loading-more";
    const generation = s.generation;
    const ac = new AbortController();
    void list(
      {
        limit: PAGE_SIZE,
        cursor: append ? s.nextCursor : null,
        currency: s.filters.currency === "ALL" ? null : s.filters.currency,
        status: apiStatus(s.filters.status),
        q: s.filters.q === "" ? null : s.filters.q,
        fromInclusive: s.filters.fromInclusive,
        toExclusive: s.filters.toExclusive,
      },
      ac.signal,
    ).then((r) => {
      // A verified 401 remains authoritative after an internal filter-change abort.
      if (r.kind === "unauthorized") {
        expireIfActive();
        return;
      }
      if (ac.signal.aborted || !mounted.current) return;
      switch (r.kind) {
        case "ok":
          dispatch({
            type: "page",
            generation,
            filterGeneration: s.filterGeneration,
            page: r.page,
            append,
          });
          return;
        case "aborted":
          return;
        default:
          dispatch({
            type: "failed",
            generation,
            filterGeneration: s.filterGeneration,
            kind: r.kind,
            append,
          });
      }
    });
    return () => ac.abort();
  }, [
    s.generation,
    s.filterGeneration,
    s.status,
    s.nextCursor,
    s.filters,
    list,
    s.searchPending,
    s.rangeError,
    expireIfActive,
  ]);

  useEffect(() => {
    if (s.searchPending || s.rangeError || s.analyticsStatus !== "loading") return;
    const generation = s.analyticsGeneration;
    const ac = new AbortController();
    void analytics(
      {
        fromInclusive: s.filters.fromInclusive,
        toExclusive: s.filters.toExclusive,
        timeZone: s.filters.timeZone,
        ...(s.filters.currency === "ALL" ? {} : { currency: s.filters.currency }),
        ...(s.filters.status === "ALL" ? {} : { status: s.filters.status }),
        ...(s.filters.q ? { q: s.filters.q } : {}),
      },
      ac.signal,
    ).then((r) => {
      if (r.kind === "unauthorized") {
        expireIfActive();
        return;
      }
      if (ac.signal.aborted || !mounted.current) return;
      switch (r.kind) {
        case "ok":
          dispatch({
            type: "analytics-page",
            generation,
            filterGeneration: s.filterGeneration,
            summary: r.summary,
          });
          return;
        case "aborted":
          return;
        default:
          dispatch({
            type: "analytics-failed",
            generation,
            filterGeneration: s.filterGeneration,
            kind: r.kind,
          });
      }
    });
    return () => ac.abort();
  }, [
    s.analyticsGeneration,
    s.filterGeneration,
    s.analyticsStatus,
    s.filters,
    analytics,
    s.searchPending,
    s.rangeError,
    expireIfActive,
  ]);

  return { state: s, dispatch: dispatch as (a: DashAction) => void };
}
