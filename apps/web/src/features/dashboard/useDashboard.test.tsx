// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsQuery, AnalyticsResult, ListQuery, ListResult } from "../../invoices/api.js";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { ListItem } from "../../domain/serverList.js";
import { NO_FILTERS, type DashAction, type DashState } from "./dashboardState.js";
import { useDashboard, type AnalyticsFn, type ListFn } from "./useDashboard.js";

const item: ListItem = {
  id: "00000000-0000-4000-8000-000000000001",
  customerName: "Synthetic client",
  customerEmail: "synthetic@example.test",
  currency: "USD",
  dueDate: "2030-01-15",
  total: "10.00",
  createdAt: "2026-10-27T10:00:00.000Z",
  paypalState: "none",
};
const emptySummary = (query: AnalyticsQuery): AnalyticsSummary => ({
  version: 1,
  fromInclusive: query.fromInclusive,
  toExclusive: query.toExclusive,
  timeZone: query.timeZone,
  currencies: [],
  days: [],
});
const answer = (query: AnalyticsQuery): AnalyticsSummary => ({
  version: 1,
  fromInclusive: query.fromInclusive,
  toExclusive: query.toExclusive,
  timeZone: query.timeZone,
  currencies: [
    {
      currency: "USD",
      exponent: 2,
      invoiceCount: 1,
      totalMinor: "1000",
      stateCounts: { none: 1, progress: 0, created: 0, attention: 0 },
    },
  ],
  days: [{ day: "2026-10-27", currency: "USD", exponent: 2, invoiceCount: 1, totalMinor: "1000" }],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

let root: Root | null = null;
let node: HTMLDivElement;
let state: DashState | null = null;
let dispatch: ((action: DashAction) => void) | null = null;
function Harness({
  list,
  analytics,
  expired,
}: {
  list: ListFn;
  analytics: AnalyticsFn;
  expired: () => void;
}) {
  const result = useDashboard(list, analytics, expired);
  state = result.state;
  dispatch = result.dispatch;
  return null;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  state = null;
  dispatch = null;
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  node.remove();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
});

const listResult = (items: ListItem[]): ListResult => ({
  kind: "ok",
  page: { items, nextCursor: null },
});
const analyticsResult = (summary: AnalyticsSummary): AnalyticsResult => ({ kind: "ok", summary });

describe("useDashboard request lifetimes", () => {
  it("drops old list and aggregate answers after a newer shared filter epoch completes", async () => {
    const listReads: Array<{
      query: ListQuery;
      signal: AbortSignal;
      work: ReturnType<typeof deferred<ListResult>>;
    }> = [];
    const aggregateReads: Array<{
      query: AnalyticsQuery;
      signal: AbortSignal;
      work: ReturnType<typeof deferred<AnalyticsResult>>;
    }> = [];
    const list: ListFn = (query, signal) => {
      const work = deferred<ListResult>();
      listReads.push({ query, signal, work });
      return work.promise;
    };
    const analytics: AnalyticsFn = (query, signal) => {
      const work = deferred<AnalyticsResult>();
      aggregateReads.push({ query, signal, work });
      return work.promise;
    };
    const expired = vi.fn();
    await act(async () =>
      root?.render(<Harness list={list} analytics={analytics} expired={expired} />),
    );
    expect(listReads).toHaveLength(1);
    expect(aggregateReads).toHaveLength(1);
    await act(async () => {
      dispatch?.({ type: "filters", filters: { ...NO_FILTERS, currency: "EUR" } });
    });
    expect(listReads[0]?.signal.aborted).toBe(true);
    expect(aggregateReads[0]?.signal.aborted).toBe(true);
    expect(listReads).toHaveLength(2);
    expect(aggregateReads).toHaveLength(2);

    await act(async () => {
      listReads[1]?.work.resolve(listResult([]));
      aggregateReads[1]?.work.resolve(analyticsResult(emptySummary(aggregateReads[1]!.query)));
    });
    expect(state?.status).toBe("loaded");
    expect(state?.filters.currency).toBe("EUR");
    expect(state?.analytics?.currencies).toEqual([]);

    await act(async () => {
      listReads[0]?.work.resolve(listResult([item]));
      aggregateReads[0]?.work.resolve(analyticsResult(answer(aggregateReads[0]!.query)));
    });
    expect(state?.filters.currency).toBe("EUR");
    expect(state?.items).toEqual([]);
    expect(state?.analytics?.currencies).toEqual([]);
    expect(expired).not.toHaveBeenCalled();
  });

  it("expires the active session for a 401 returned after internal filter cancellation", async () => {
    const listReads: Array<{ signal: AbortSignal; work: ReturnType<typeof deferred<ListResult>> }> =
      [];
    const list: ListFn = (query, signal) => {
      const work = deferred<ListResult>();
      listReads.push({ signal, work });
      return work.promise;
    };
    const analytics: AnalyticsFn = async (query) => analyticsResult(emptySummary(query));
    const expired = vi.fn();
    await act(async () =>
      root?.render(<Harness list={list} analytics={analytics} expired={expired} />),
    );
    await act(async () =>
      dispatch?.({ type: "filters", filters: { ...NO_FILTERS, currency: "EUR" } }),
    );
    expect(listReads[0]?.signal.aborted).toBe(true);
    await act(async () => listReads[0]?.work.resolve({ kind: "unauthorized" }));
    expect(expired).toHaveBeenCalledTimes(1);
  });
});
