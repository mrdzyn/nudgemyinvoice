import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/Badge.js";
import { Notice } from "../../components/Notice.js";
import { Spinner } from "../../components/Spinner.js";
import { useFocusOnMount } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";
import { formatCurrency, formatMinor } from "../../domain/money.js";
import { MAX_SEARCH_CHARS, minorOf, type ListItem } from "../../domain/serverList.js";
import { CURRENCY_CODES, type CurrencyCode } from "../../domain/types.js";
import { InvoiceGrid } from "./InvoiceGrid.js";
import {
  hasFilters,
  MAX_LOADED_ROWS,
  NO_FILTERS,
  type DashState,
  type FailureKind,
  type Filters,
  type StatusFilter,
} from "./dashboardState.js";
import { useDashboard, type ListFn } from "./useDashboard.js";

const FAILURE: Record<FailureKind, string> = {
  offline: "Could not reach the server, so the invoices could not be loaded.",
  unavailable: "The server could not load your invoices right now.",
  malformed: "The server's answer was not in the expected format, so it was not shown.",
  forbidden: "The server did not accept this request. Reload the page and try again.",
  rejected: "The server refused the list request. Reload the page and try again.",
};

/** Per-currency summary of the LOADED invoices only; amounts of different currencies never meet. */
export function summarize(items: readonly ListItem[]) {
  const order = CURRENCY_CODES.filter((c) => items.some((i) => i.currency === c));
  return order.map((c) => {
    const mine = items.filter((i) => i.currency === c);
    return {
      currency: c as CurrencyCode,
      count: mine.length,
      sumMinor: mine.reduce((a, i) => a + minorOf(i.total), 0n),
      paypalCreated: mine.filter((i) => i.paypalState === "created").length,
    };
  });
}

function Skeleton({ h, w }: { h: number; w?: string }) {
  return <div className={`skeleton sk-h${h}${w ? ` sk-w${w}` : ""}`} />;
}

/** Pure view so every state can be rendered and tested without a network. */
export function RealDashboardView({
  state,
  searchText,
  onSearchText,
  onFilters,
  onRetry,
  onLoadMore,
  onOpen,
  onNew,
  headingRef,
}: {
  state: DashState;
  searchText: string;
  onSearchText: (v: string) => void;
  onFilters: (f: Filters) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const f = state.filters;
  const items = state.items;
  const cards = useMemo(() => summarize(items), [items]);
  const filtered = hasFilters(f) || searchText.trim() !== "";

  const filters = (
    <div className="filters">
      <div className="pills" role="group" aria-label="Filter by currency">
        {(["ALL", ...CURRENCY_CODES] as const).map((c) => (
          <button
            key={c}
            type="button"
            className="pill"
            aria-pressed={f.currency === c}
            onClick={() => onFilters({ ...f, currency: c })}
          >
            {c === "ALL" ? "All currencies" : c}
          </button>
        ))}
      </div>
      <div className="filter-controls">
        <div>
          <label className="sr-only" htmlFor="dash-search">
            Search invoices
          </label>
          <input
            className="input search-input"
            id="dash-search"
            type="search"
            placeholder="Search invoices"
            autoComplete="off"
            maxLength={MAX_SEARCH_CHARS}
            value={searchText}
            onChange={(e) => onSearchText(e.target.value)}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="dash-status">
            PayPal Sandbox status
          </label>
          <select
            className="select"
            id="dash-status"
            value={f.status}
            onChange={(e) => {
              const v = e.target.value;
              if (
                v === "ALL" ||
                v === "none" ||
                v === "progress" ||
                v === "created" ||
                v === "attention"
              )
                onFilters({ ...f, status: v as StatusFilter });
            }}
          >
            <option value="ALL">All PayPal statuses</option>
            <option value="none">No PayPal draft</option>
            <option value="progress">In progress</option>
            <option value="created">PayPal draft created</option>
            <option value="attention">Needs attention</option>
          </select>
        </div>
      </div>
    </div>
  );

  // Once any page has loaded (or a filter is active) the filter bar stays mounted through loads and
  // errors, so focus, the typed search and the operator's ability to change filters are never lost.
  const showBar = state.ready || filtered;
  const skeleton = (
    <div aria-busy="true" id="dash-loading">
      <p className="sr-only" role="status">
        Loading invoices…
      </p>
      {showBar ? null : (
        <div className="currency-grid">
          {[1, 2, 3].map((n) => (
            <div className="currency-card" key={n}>
              <Skeleton h={18} w="40" />
              <Skeleton h={30} w="70" />
              <Skeleton h={14} w="55" />
            </div>
          ))}
        </div>
      )}
      <div className="table-card pad-16">
        {[1, 2, 3, 4].map((n) => (
          <Skeleton h={22} key={n} />
        ))}
      </div>
    </div>
  );

  let body;
  if (state.status === "loading" && items.length === 0) {
    body = showBar ? (
      <div className="table-card">
        {filters}
        {skeleton}
      </div>
    ) : (
      skeleton
    );
  } else if (state.status === "error" && state.error) {
    const alert = (
      <Notice kind="err" role="alert" id="dash-error">
        <strong>Could not load your invoices.</strong> {FAILURE[state.error]} Nothing is shown in
        their place: no sample data is substituted.
        <div className="mt-12">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            id="dash-retry"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      </Notice>
    );
    body = showBar ? (
      <div className="table-card">
        {filters}
        {alert}
      </div>
    ) : (
      alert
    );
  } else if (items.length === 0) {
    body = filtered ? (
      <div className="table-card">
        {filters}
        <div className="empty" id="dash-no-match">
          <h2>No invoices match these filters</h2>
          <p>Try another currency, status or search term.</p>
          <button
            type="button"
            className="btn btn-secondary"
            id="dash-clear"
            onClick={() => {
              onSearchText("");
              onFilters(NO_FILTERS);
            }}
          >
            Clear filters
          </button>
        </div>
      </div>
    ) : (
      <div className="table-card">
        <div className="empty" id="dash-empty">
          <h2>No saved invoices yet</h2>
          <p>
            Describe the work in plain language or enter an invoice by hand, then save it. Saved
            invoices are stored in PostgreSQL and listed here.
          </p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            Create your first invoice
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <h2 className="sr-only">Totals by currency (loaded invoices only)</h2>
        <div className="currency-grid" id="dash-cards">
          {cards.map((c) => (
            <div className="currency-card" key={c.currency}>
              <div className="top">
                <span>{c.currency}</span>
                <Badge kind="neutral">{`${c.count} loaded`}</Badge>
              </div>
              <div className="amount num">
                {formatCurrency(formatMinor(c.sumMinor, c.currency), c.currency)}
              </div>
              <div className="meta">
                Sum of the {c.count} loaded invoice{c.count === 1 ? "" : "s"} in {c.currency} ·
                PayPal Sandbox drafts created among them: {c.paypalCreated}
              </div>
            </div>
          ))}
        </div>
        <p className="hint" id="dash-card-note">
          Page summary: each card adds up only the invoices loaded so far
          {state.nextCursor ? " (more are available)" : ""}, one currency at a time. It is not a
          total of all your invoices, and amounts in different currencies are never added together
          or converted.
        </p>
        <div className="table-card">
          {filters}
          <p className="sr-only" role="status" data-testid="result-count">
            {items.length} invoice{items.length === 1 ? "" : "s"} loaded
            {state.nextCursor ? ", more available" : ", end of list"}
          </p>
          <p className="hint grid-note" id="dash-sort-note">
            Sorting a column reorders only the {items.length} invoice
            {items.length === 1 ? "" : "s"} loaded so far. Search and the currency and PayPal status
            filters look through all your saved invoices.
          </p>
          <InvoiceGrid items={items} onOpen={onOpen} />
          <div className="grid-footer" id="dash-footer">
            {state.status === "loading-more" ? (
              <span role="status">
                <Spinner /> Loading more invoices…
              </span>
            ) : state.nextCursor && items.length >= MAX_LOADED_ROWS ? (
              <span id="dash-limit">
                {MAX_LOADED_ROWS} invoices are loaded, the most this list shows at once. To find
                others, search or use the currency and PayPal status filters: they look through all
                your saved invoices.
              </span>
            ) : state.nextCursor ? (
              <button
                type="button"
                className="btn btn-secondary"
                id="dash-more"
                onClick={onLoadMore}
              >
                Load more invoices
              </button>
            ) : (
              <span id="dash-end">All matching invoices are loaded.</span>
            )}
          </div>
          {state.moreError ? (
            <Notice kind="warn" role="alert" id="dash-more-error">
              <strong>Could not load more invoices.</strong> {FAILURE[state.moreError]} The{" "}
              {items.length} already loaded are unchanged.
              <div className="mt-8">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  id="dash-more-retry"
                  onClick={onLoadMore}
                >
                  Try loading more again
                </button>
              </div>
            </Notice>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="screen-title" id="dash-title" tabIndex={-1} ref={headingRef}>
            Invoice drafts
          </h1>
          <p className="subtitle">Saved invoices and their PayPal Sandbox draft status</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          New invoice
        </button>
      </div>
      {body}
    </>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

/** Container: real list from the server; nothing here can show a fixture. */
export function RealDashboard({ list }: { list: ListFn }) {
  const { state, dispatch: appDispatch, session } = useApp();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const { state: dash, dispatch } = useDashboard(list, () => session?.sessionExpired?.());
  const [searchText, setSearchText] = useState("");

  // The typed search is applied after a short pause so each keystroke is not a request.
  useEffect(() => {
    const t = setTimeout(
      () => dispatch({ type: "search", q: searchText.trim() }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [searchText]);

  return (
    <RealDashboardView
      state={dash}
      searchText={searchText}
      onSearchText={setSearchText}
      onFilters={(f) => dispatch({ type: "filters", filters: { ...f, q: dash.filters.q } })}
      onRetry={() => dispatch({ type: "retry" })}
      onLoadMore={() => dispatch({ type: "load-more" })}
      onOpen={(id) => appDispatch({ type: "open-saved", id, notice: "opened" })}
      onNew={() => appDispatch({ type: "navigate", screen: "composer", resetComposer: true })}
      headingRef={headingRef}
    />
  );
}
