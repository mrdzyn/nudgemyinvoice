import { useEffect, useState } from "react";
import { Badge } from "../../components/Badge.js";
import { Notice } from "../../components/Notice.js";
import { Spinner } from "../../components/Spinner.js";
import { useFocusOnMount } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";
import { formatCurrency, formatMinor } from "../../domain/money.js";
import { MAX_SEARCH_CHARS } from "../../domain/serverList.js";
import { CURRENCY_CODES } from "../../domain/types.js";
import { buildDashboardDateRange } from "../../domain/dateRange.js";
import { StudioSlot, StudioSlotPlaceholder } from "../studio/StudioSlot.js";
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
import { useDashboard, type AnalyticsFn, type ListFn } from "./useDashboard.js";

const FAILURE: Record<FailureKind, string> = {
  offline: "Could not reach the server.",
  timeout: "The request took too long.",
  unavailable: "The server could not complete this request right now.",
  malformed: "The server's answer was not in the expected format, so it was not shown.",
  forbidden: "The server did not accept this request. Reload the page and try again.",
  rejected: "The server refused this request. Reload the page and try again.",
};

function Skeleton({ h, w }: { h: number; w?: string }) {
  return <div className={`skeleton sk-h${h}${w ? ` sk-w${w}` : ""}`} />;
}

function displayDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(instant);
}

function Coverage({ filters }: { filters: Filters }) {
  return (
    <p className="hint" id="dash-coverage">
      Matching invoices owned by this operator, created {displayDate(filters.startDate)} through{" "}
      {displayDate(filters.endDate)} inclusive ({filters.timeZone}).
    </p>
  );
}

function DateRangeFields({
  startDate,
  endDate,
  error,
  disabled,
  onChange,
}: {
  startDate: string;
  endDate: string;
  error: string | null;
  disabled: boolean;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <fieldset className="date-range-filter" disabled={disabled}>
      <legend>Created date range</legend>
      <div className="date-range-fields">
        <label>
          <span>From</span>
          <input
            className="input date-range-input"
            id="dash-date-start"
            type="date"
            value={startDate}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "dash-range-error" : "dash-coverage"}
            onChange={(e) => onChange(e.target.value, endDate)}
          />
        </label>
        <label>
          <span>Through</span>
          <input
            className="input date-range-input"
            id="dash-date-end"
            type="date"
            value={endDate}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "dash-range-error" : "dash-coverage"}
            onChange={(e) => onChange(startDate, e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p className="date-range-error" id="dash-range-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Pure view so each authenticated state can be tested without fixtures or a network. */
export function RealDashboardView({
  state,
  searchText,
  startDate,
  endDate,
  onSearchText,
  onFilters,
  onDateRange,
  onRetry,
  onAnalyticsRetry,
  onClearFilters,
  onLoadMore,
  onOpen,
  onNew,
  headingRef,
}: {
  state: DashState;
  searchText: string;
  startDate: string;
  endDate: string;
  onSearchText: (v: string) => void;
  onFilters: (f: Filters) => void;
  onDateRange: (start: string, end: string) => void;
  onRetry: () => void;
  onAnalyticsRetry: () => void;
  onClearFilters: () => void;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const f = state.filters;
  const filtered = hasFilters(f) || searchText.trim() !== "";
  const disabled = Boolean(state.rangeError);
  const filters = (
    <div className="filters">
      <div className="pills" role="group" aria-label="Filter by currency">
        {(["ALL", ...CURRENCY_CODES] as const).map((c) => (
          <button
            key={c}
            type="button"
            className="pill"
            aria-pressed={f.currency === c}
            disabled={disabled}
            onClick={() => onFilters({ ...f, currency: c })}
          >
            {c === "ALL" ? "All currencies" : c}
          </button>
        ))}
      </div>
      {filtered ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClearFilters}>
          Clear filters
        </button>
      ) : null}
      <div className="filter-controls">
        <DateRangeFields
          startDate={startDate}
          endDate={endDate}
          error={state.rangeError}
          disabled={false}
          onChange={onDateRange}
        />
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
            disabled={disabled}
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
            disabled={disabled}
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

  const showBar = state.ready || filtered || Boolean(state.rangeError);
  const skeleton = (
    <div aria-busy="true" id="dash-loading">
      <p className="sr-only" role="status">
        Loading matching invoices and full-population totals…
      </p>
      <div className="currency-grid">
        {[1, 2, 3].map((n) => (
          <div className="currency-card" key={n}>
            <Skeleton h={18} w="40" />
            <Skeleton h={30} w="70" />
            <Skeleton h={14} w="55" />
          </div>
        ))}
      </div>
      <div className="table-card pad-16">
        {[1, 2, 3, 4].map((n) => (
          <Skeleton h={22} key={n} />
        ))}
      </div>
    </div>
  );

  const rangeBlocked = state.rangeError ? (
    <Notice kind="err" role="alert" id="dash-range-blocked">
      <strong>Choose a valid created-date range.</strong> Analytics and invoice rows stay hidden
      until the local dates can be converted safely. Edit the start or end date above.
    </Notice>
  ) : null;

  const pending = state.searchPending ? (
    <div className="table-card pad-16" aria-busy="true">
      <p role="status" className="muted">
        <Spinner /> Applying the search and loading the matching rows and totals…
      </p>
    </div>
  ) : null;

  const analyticsError =
    state.analyticsStatus === "error" && state.analyticsError ? (
      <Notice kind="err" role="alert" id="dash-analytics-error">
        <strong>Could not load full-population totals.</strong> {FAILURE[state.analyticsError]} No
        loaded-row estimate is substituted.
        <div className="mt-12">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            id="dash-analytics-retry"
            onClick={onAnalyticsRetry}
          >
            Retry totals
          </button>
        </div>
      </Notice>
    ) : null;

  const analyticsLoading =
    state.analyticsStatus === "loading" ? (
      <>
        <StudioSlotPlaceholder />
        <div className="currency-grid" aria-busy="true" aria-label="Loading full-population totals">
          {[1, 2, 3].map((n) => (
            <div className="currency-card" key={n}>
              <Skeleton h={18} w="40" />
              <Skeleton h={30} w="70" />
              <Skeleton h={14} w="55" />
            </div>
          ))}
        </div>
      </>
    ) : null;

  const analyticsCards =
    state.analyticsStatus === "loaded" && state.analytics ? (
      state.analytics.currencies.length ? (
        <>
          <StudioSlot summary={state.analytics} range={f} />
          <h2 className="sr-only" id="dash-totals-heading">
            Full matching totals by currency
          </h2>
          <div className="currency-grid" id="dash-cards" aria-labelledby="dash-totals-heading">
            {state.analytics.currencies.map((c) => (
              <div className="currency-card" key={c.currency}>
                <div className="top">
                  <span>{c.currency}</span>
                  <Badge kind="neutral">
                    {`${c.invoiceCount} invoice${c.invoiceCount === 1 ? "" : "s"}`}
                  </Badge>
                </div>
                <div className="amount num">
                  {formatCurrency(formatMinor(BigInt(c.totalMinor), c.currency), c.currency)}
                </div>
                <div className="meta">
                  Full matching operator-owned {c.currency} total · PayPal Sandbox drafts created:{" "}
                  {c.stateCounts.created}
                </div>
              </div>
            ))}
          </div>
          <p className="hint" id="dash-card-note">
            Totals cover the full matching invoice population, not only rows loaded below. Each card
            uses one currency; currencies are never added together or converted.
          </p>
        </>
      ) : (
        <div className="empty" id="dash-empty-range">
          <h2>No invoices match these filters</h2>
          <p>Try a wider date range or clear your filters, or create a new invoice draft.</p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            Create an invoice
          </button>
        </div>
      )
    ) : null;

  let listContent;
  if (state.status === "loading" && state.items.length === 0) {
    listContent = (
      <div className="table-card pad-16" aria-busy="true">
        <p className="sr-only" role="status">
          Loading matching invoice rows…
        </p>
        {[1, 2, 3, 4].map((n) => (
          <Skeleton h={22} key={n} />
        ))}
      </div>
    );
  } else if (state.status === "error" && state.error) {
    listContent = (
      <Notice kind="err" role="alert" id="dash-error">
        <strong>Could not load invoice rows.</strong> {FAILURE[state.error]} The independent totals
        above remain authoritative.
        <div className="mt-12">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            id="dash-retry"
            onClick={onRetry}
          >
            Retry invoice rows
          </button>
        </div>
      </Notice>
    );
  } else if (state.items.length === 0) {
    // Non-empty analytics with an empty row page is rejected by the shared reducer consistency guard.
    listContent = null;
  } else {
    listContent = (
      <div className="table-card">
        <p className="sr-only" role="status" data-testid="result-count">
          {state.items.length} matching invoice{state.items.length === 1 ? "" : "s"} loaded
          {state.nextCursor ? ", more available" : ", end of list"}
        </p>
        <p className="hint grid-note" id="dash-sort-note">
          Sorting reorders only the {state.items.length} rows loaded so far. The totals above cover
          all matching invoices. Search, date, currency and PayPal status filters apply on the
          server.
        </p>
        <InvoiceGrid items={state.items} onOpen={onOpen} />
        <div className="grid-footer" id="dash-footer">
          {state.status === "loading-more" ? (
            <span role="status">
              <Spinner /> Loading more invoices…
            </span>
          ) : state.nextCursor && state.items.length >= MAX_LOADED_ROWS ? (
            <span id="dash-limit">
              {MAX_LOADED_ROWS} invoices are loaded, the most this list shows at once. Search or
              change filters to find others; the currency totals remain for the full matching set.
            </span>
          ) : state.nextCursor ? (
            <button type="button" className="btn btn-secondary" id="dash-more" onClick={onLoadMore}>
              Load more invoices
            </button>
          ) : (
            <span id="dash-end">All matching invoices are loaded.</span>
          )}
        </div>
        {state.moreError ? (
          <Notice kind="warn" role="alert" id="dash-more-error">
            <strong>Could not load more invoices.</strong> {FAILURE[state.moreError]} The{" "}
            {state.items.length} already loaded remain visible.
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
    );
  }

  const body = (
    <>
      {showBar ? <div className="table-card">{filters}</div> : null}
      {rangeBlocked ?? pending ?? (
        <>
          <Coverage filters={f} />
          {analyticsError}
          {analyticsLoading}
          {analyticsCards}
          {listContent}
        </>
      )}
    </>
  );

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
      {!showBar && state.status === "loading" ? skeleton : body}
    </>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

/** Authenticated real mode only; this component receives no synthetic invoice rows. */
export function RealDashboard({ list, analytics }: { list: ListFn; analytics: AnalyticsFn }) {
  const { state, dispatch: appDispatch, session } = useApp();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const { state: dash, dispatch } = useDashboard(list, analytics, () =>
    session?.sessionExpired?.(),
  );
  const [searchText, setSearchText] = useState("");
  const [rangeDraft, setRangeDraft] = useState({
    startDate: dash.filters.startDate,
    endDate: dash.filters.endDate,
  });

  useEffect(() => {
    const t = setTimeout(
      () => dispatch({ type: "search", q: searchText.trim() }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [searchText, dispatch]);

  const changeRange = (startDate: string, endDate: string) => {
    setRangeDraft({ startDate, endDate });
    const result = buildDashboardDateRange(startDate, endDate, dash.filters.timeZone);
    if (!result.ok) {
      dispatch({ type: "range-invalid", reason: result.reason });
      return;
    }
    dispatch({ type: "filters", filters: { ...dash.filters, ...result.value } });
  };

  return (
    <RealDashboardView
      state={dash}
      searchText={searchText}
      startDate={rangeDraft.startDate}
      endDate={rangeDraft.endDate}
      onSearchText={(v) => {
        setSearchText(v);
        dispatch({ type: "search-input", q: v });
      }}
      onFilters={(filters) => dispatch({ type: "filters", filters })}
      onDateRange={changeRange}
      onRetry={() => dispatch({ type: "retry" })}
      onAnalyticsRetry={() => dispatch({ type: "analytics-retry" })}
      onClearFilters={() => {
        setSearchText("");
        setRangeDraft({ startDate: NO_FILTERS.startDate, endDate: NO_FILTERS.endDate });
        dispatch({ type: "filters", filters: NO_FILTERS });
      }}
      onLoadMore={() => dispatch({ type: "load-more" })}
      onOpen={(id) => appDispatch({ type: "open-saved", id, notice: "opened" })}
      onNew={() => appDispatch({ type: "navigate", screen: "composer", resetComposer: true })}
      headingRef={headingRef}
    />
  );
}
