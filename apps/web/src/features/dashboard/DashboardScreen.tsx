import { useMemo, useState } from "react";
import { Badge, PayPalStatusBadge } from "../../components/Badge.js";
import { Notice } from "../../components/Notice.js";
import { useFocusOnMount } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";
import { CURRENCY_CODES, type CurrencyCode, type SavedInvoice } from "../../domain/types.js";
import { formatCurrency, formatMinor, parseMoney } from "../../domain/money.js";
import { RealDashboard } from "./RealDashboard.js";

type StatusFilter = "ALL" | "none" | "progress" | "created" | "attention";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return "—";
  return `${MONTHS[Number(m[2]) - 1] ?? "?"} ${Number(m[3])}, ${m[1]}`;
}
export const shortId = (id: string) => id.slice(0, 8);

function ppGroup(state: SavedInvoice["paypal"]["state"]): Exclude<StatusFilter, "ALL"> {
  if (state === "created") return "created";
  if (state === "pending" || state === "creating") return "progress";
  if (state === "unknown" || state === "rejected" || state === "mismatch") return "attention";
  return "none";
}

function Skeleton({ h, w }: { h: number; w?: string }) {
  return <div className={`skeleton sk-h${h}${w ? ` sk-w${w}` : ""}`} />;
}

/**
 * Real mode (a server session that can list) renders the PostgreSQL-backed dashboard and nothing
 * else; only the synthetic design preview ever reaches the fixture body below.
 */
export function DashboardScreen() {
  const { session } = useApp();
  if (session?.listInvoices) return <RealDashboard list={session.listInvoices} />;
  return <SyntheticDashboard />;
}

function SyntheticDashboard() {
  const { state, dispatch } = useApp();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const [cur, setCur] = useState<CurrencyCode | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const list = state.dashMode === "empty" ? [] : state.invoices;

  const order = useMemo(
    () => CURRENCY_CODES.filter((c) => list.some((i) => i.draft.currency === c)),
    [list],
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((i) => {
      if (cur !== "ALL" && i.draft.currency !== cur) return false;
      if (status !== "ALL" && ppGroup(i.paypal.state) !== status) return false;
      if (
        q &&
        !`${i.draft.customerName} ${i.draft.customerEmail} ${i.id}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [list, cur, query, status]);

  const header = (
    <>
      <Notice kind="info" role="note" icon="ℹ">
        <strong>DEMO / SYNTHETIC data.</strong> The backend has{" "}
        <code>GET /api/invoice-drafts/:id</code> but no list endpoint (
        <code>GET /api/invoice-drafts</code> is not implemented). This dashboard is a design of a
        future list view; every row below is fabricated.
      </Notice>
      <div className="page-head">
        <div>
          <h1 className="screen-title" id="dash-title" tabIndex={-1} ref={headingRef}>
            Invoice drafts
          </h1>
          <p className="subtitle">Local drafts and their PayPal Sandbox draft status</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => dispatch({ type: "navigate", screen: "composer", resetComposer: true })}
        >
          New invoice
        </button>
      </div>
    </>
  );

  let body;
  if (state.dashMode === "loading") {
    body = (
      <div aria-busy="true">
        <p className="sr-only" role="status">
          Loading drafts…
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
        <p className="hint mt-12">
          Loading state, shown for design review. It applies once a list request exists.
        </p>
      </div>
    );
  } else if (state.dashMode === "error") {
    body = (
      <Notice kind="err" role="alert">
        <strong>Could not load invoice drafts.</strong> The request failed (HTTP 500). Your saved
        drafts are not affected.
        <div className="mt-12">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => dispatch({ type: "scenario", id: "default" })}
          >
            Retry
          </button>
        </div>
      </Notice>
    );
  } else if (list.length === 0) {
    body = (
      <div className="table-card">
        <div className="empty">
          <h2>No invoice drafts yet</h2>
          <p>
            Describe the work in plain language or enter an invoice by hand. Drafts stay local until
            you choose to create a PayPal Sandbox draft.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dispatch({ type: "navigate", screen: "composer", resetComposer: true })}
          >
            Create your first invoice
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <h2 className="sr-only">Totals by currency</h2>
        <div className="currency-grid">
          {order.map((c) => {
            const mine = list.filter((i) => i.draft.currency === c);
            const sum = mine.reduce((a, i) => a + parseMoney(i.totals.total, c), 0n);
            const made = mine.filter((i) => i.paypal.state === "created").length;
            return (
              <div className="currency-card" key={c}>
                <div className="top">
                  <span>{c}</span>
                  <Badge kind="neutral">{`${mine.length} draft${mine.length === 1 ? "" : "s"}`}</Badge>
                </div>
                <div className="amount num">{formatCurrency(formatMinor(sum, c), c)}</div>
                <div className="meta">
                  Sum of local draft totals in {c} · PayPal Sandbox drafts created: {made}
                </div>
              </div>
            );
          })}
        </div>
        <p className="hint">
          Each card sums one currency only. Amounts in different currencies are never added together
          or converted.
        </p>
        <div className="table-card">
          <div className="filters">
            <div className="pills" role="group" aria-label="Filter by currency">
              {(["ALL", ...order] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="pill"
                  aria-pressed={cur === c}
                  onClick={() => {
                    setCur(c);
                  }}
                >
                  {c === "ALL" ? "All currencies" : c}
                </button>
              ))}
            </div>
            <div className="filter-controls">
              <div>
                <label className="sr-only" htmlFor="dash-search">
                  Search drafts
                </label>
                <input
                  className="input search-input"
                  id="dash-search"
                  type="search"
                  placeholder="Search drafts"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                />
              </div>
              <div>
                <label className="sr-only" htmlFor="dash-status">
                  PayPal Sandbox status
                </label>
                <select
                  className="select"
                  id="dash-status"
                  value={status}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (
                      v === "ALL" ||
                      v === "none" ||
                      v === "progress" ||
                      v === "created" ||
                      v === "attention"
                    )
                      setStatus(v);
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
          <p className="sr-only" role="status" data-testid="result-count">
            {rows.length} of {list.length} drafts shown
          </p>
          {rows.length === 0 ? (
            <div className="empty">
              <h2>No drafts match these filters</h2>
              <p>Try another currency or search term.</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCur("ALL");
                  setQuery("");
                  setStatus("ALL");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <table className="data stack">
              <caption className="sr-only">
                Invoice drafts (synthetic fixtures), {rows.length} shown of {list.length}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Draft</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="r">
                    Total
                  </th>
                  <th scope="col">PayPal Sandbox</th>
                  <th scope="col" className="r">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Draft">
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => dispatch({ type: "open-detail", id: i.id })}
                      >
                        Draft {shortId(i.id)}
                      </button>
                      <div className="cell-sub">Created {formatDate(i.createdAt)}</div>
                    </td>
                    <td data-label="Customer">
                      <div>{i.draft.customerName}</div>
                      <div className="cell-sub">{i.draft.customerEmail}</div>
                    </td>
                    <td data-label="Due">{formatDate(i.draft.dueDate)}</td>
                    <td data-label="Total" className="r num">
                      <strong>{formatCurrency(i.totals.total, i.draft.currency)}</strong>{" "}
                      <span className="cell-sub">{i.draft.currency}</span>
                    </td>
                    <td data-label="PayPal Sandbox">
                      <PayPalStatusBadge state={i.paypal.state} />
                    </td>
                    <td data-label="" className="r">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-label={`View draft ${shortId(i.id)} for ${i.draft.customerName}`}
                        onClick={() => dispatch({ type: "open-detail", id: i.id })}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="grid-footer">
            Native accessible table. AG Studio is not enabled: its license and trial coverage are
            unconfirmed and need owner confirmation before use.
          </div>
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby="dash-title">
      {header}
      {body}
    </section>
  );
}
