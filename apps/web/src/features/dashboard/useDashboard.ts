import { useEffect, useReducer, useRef } from "react";
import type { ListQuery, ListResult } from "../../invoices/api.js";
import { PAGE_SIZE } from "../../domain/serverList.js";
import {
  apiStatus,
  dashReducer,
  initialDash,
  type DashAction,
  type DashState,
} from "./dashboardState.js";

export type ListFn = (query: ListQuery, signal: AbortSignal) => Promise<ListResult>;

/**
 * Drives the real dashboard from `GET /api/invoice-drafts`. Exactly one request belongs to the
 * current generation; leaving the screen, signing out, a 401, a filter change or a retry aborts it,
 * and the reducer drops any answer tagged with another generation.
 */
export function useDashboard(list: ListFn, onExpired: () => void) {
  const [s, dispatch] = useReducer(dashReducer, initialDash);
  const latest = useRef<DashState>(s);
  latest.current = s;
  const expired = useRef(onExpired);
  expired.current = onExpired;

  useEffect(() => {
    const cur = latest.current;
    if (cur.status !== "loading" && cur.status !== "loading-more") return;
    const append = cur.status === "loading-more";
    const generation = cur.generation;
    const ac = new AbortController();
    void list(
      {
        limit: PAGE_SIZE,
        cursor: append ? cur.nextCursor : null,
        currency: cur.filters.currency === "ALL" ? null : cur.filters.currency,
        status: apiStatus(cur.filters.status),
        q: cur.filters.q === "" ? null : cur.filters.q,
      },
      ac.signal,
    ).then((r) => {
      if (ac.signal.aborted) return;
      switch (r.kind) {
        case "ok":
          dispatch({ type: "page", generation, page: r.page, append });
          return;
        case "unauthorized":
          expired.current();
          return;
        case "aborted":
          return;
        default:
          dispatch({ type: "failed", generation, kind: r.kind, append });
      }
    });
    return () => ac.abort();
  }, [s.generation, list]);

  return { state: s, dispatch: dispatch as (a: DashAction) => void };
}
