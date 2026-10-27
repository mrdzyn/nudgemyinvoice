import { useEffect, useState } from "react";
import { PayPalStatusBadge } from "../../components/Badge.js";
import { Notice } from "../../components/Notice.js";
import { Spinner } from "../../components/Spinner.js";
import { useFocusOnMount } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";
import type { SavedRef } from "../../demo/appState.js";
import { formatCurrency } from "../../domain/money.js";
import type { ServerInvoice } from "../../domain/serverInvoice.js";
import { formatDate } from "../dashboard/DashboardScreen.js";

export type SavedLoad =
  | { status: "loading" }
  | { status: "ok"; invoice: ServerInvoice }
  | { status: "not-found" | "offline" | "unavailable" | "malformed" | "forbidden" };

const FAILURE: Record<Exclude<SavedLoad["status"], "loading" | "ok">, string> = {
  "not-found": "This saved invoice could not be found on the server.",
  offline: "Could not reach the server, so the saved invoice could not be loaded.",
  unavailable: "The server could not load this saved invoice right now.",
  malformed:
    "The server's answer for this invoice was not in the expected format, so it was not shown.",
  forbidden: "The server did not accept this request. Reload the page and try again.",
};

/**
 * Pure view of a SERVER-loaded record. It renders only what the server returned: there is no
 * fixture, estimate or placeholder path, so a failed load shows an error and never a made-up invoice.
 */
export function SavedDetailView({
  savedRef,
  load,
  onRetry,
  onBack,
  headingRef,
}: {
  savedRef: SavedRef;
  load: SavedLoad;
  onRetry: () => void;
  onBack: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const inv = load.status === "ok" ? load.invoice : null;
  return (
    <section aria-labelledby="saved-title" aria-busy={load.status === "loading"}>
      <div className="page-head">
        <div>
          <h1 className="screen-title" id="saved-title" tabIndex={-1} ref={headingRef}>
            {inv
              ? inv.draft.customerName
              : load.status === "loading"
                ? "Loading saved invoice…"
                : "Saved invoice"}
          </h1>
          <p className="subtitle">
            {inv ? `Saved draft · ${inv.draft.currency}` : "Loaded from the server by its id"}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" id="saved-back" onClick={onBack}>
          Back to drafts
        </button>
      </div>
      {savedRef.notice === "created" ? (
        <Notice kind="ok" role="status" icon="✓" id="saved-notice">
          <strong>Saved in PostgreSQL.</strong> This is a local draft record only. It was not
          created in PayPal, nothing was sent to PayPal, and the customer was not notified.
        </Notice>
      ) : (
        <Notice kind="info" role="status" icon="ℹ" id="saved-notice">
          <strong>Already saved (HTTP 200, replayed).</strong> The same request had been saved
          before, so the existing record is shown. No second draft was created. Nothing was sent to
          PayPal and the customer was not notified.
        </Notice>
      )}
      {load.status === "loading" ? (
        <div className="card" role="status" aria-live="polite">
          <p>
            <Spinner /> Loading the saved invoice from the server…
          </p>
        </div>
      ) : null}
      {load.status !== "loading" && load.status !== "ok" ? (
        <Notice kind="err" role="alert" id="saved-error">
          <strong>The saved invoice could not be shown.</strong> {FAILURE[load.status]}
          <div className="mt-8">
            {load.status !== "not-found" ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                id="saved-retry"
                onClick={onRetry}
              >
                Try loading again
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}
      {inv ? <SavedBody inv={inv} /> : null}
    </section>
  );
}

function SavedBody({ inv }: { inv: ServerInvoice }) {
  const d = inv.draft;
  const t = inv.totals;
  const c = d.currency;
  const pp = inv.paypal;
  return (
    <>
      <section className="paypal-panel" aria-labelledby="pp-title">
        <span className="sandbox-pill">PayPal Sandbox</span>
        <h2 className="card-title mt-8 mb-0" id="pp-title">
          PayPal Sandbox draft (read-only)
        </h2>
        <div className="row">
          <div>
            {pp ? <PayPalStatusBadge state={pp.state} /> : null}
            <div className="paypal-status">
              {pp && pp.state !== "none"
                ? "PayPal state reported by the server"
                : "Not created in PayPal Sandbox"}
            </div>
            {pp?.paypalInvoiceId ? (
              <dl className="meta-list mt-8">
                <div>
                  <dt>PayPal invoice id (from the server)</dt>
                  <dd className="mono">{pp.paypalInvoiceId}</dd>
                </div>
              </dl>
            ) : null}
            {pp?.lastErrorCode ? (
              <p className="hint">
                Last error code: <code>{pp.lastErrorCode}</code>
              </p>
            ) : null}
            <p className="hint mt-8">
              Creating a PayPal Sandbox draft is not available in this build; it arrives in a later
              step. Saving to PostgreSQL does not create a PayPal invoice.
            </p>
          </div>
        </div>
      </section>
      <div className="card">
        <h2 className="card-title">Invoice</h2>
        <dl className="meta-list">
          <div>
            <dt>Storage</dt>
            <dd>
              <span className="badge badge-ok">
                <span aria-hidden="true">✓</span>Saved in PostgreSQL
              </span>
            </dd>
          </div>
          <div>
            <dt>Customer email</dt>
            <dd>{d.customerEmail}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{c}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{formatDate(d.dueDate)}</dd>
          </div>
          <div>
            <dt>Saved on</dt>
            <dd>{formatDate(inv.createdAt)}</dd>
          </div>
          <div>
            <dt>Invoice id</dt>
            <dd className="mono" id="saved-id">
              {inv.id}
            </dd>
          </div>
        </dl>
      </div>
      <div className="card">
        <h2 className="card-title">Line items and totals</h2>
        <table className="data stack static-lines">
          <caption className="sr-only">Line items</caption>
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col" className="r">
                Quantity
              </th>
              <th scope="col" className="r">
                Unit price
              </th>
              <th scope="col" className="r">
                Line total
              </th>
            </tr>
          </thead>
          <tbody>
            {d.lineItems.map((l, i) => (
              <tr key={i}>
                <td data-label="Description">{l.description}</td>
                <td data-label="Quantity" className="r num">
                  {l.quantity}
                </td>
                <td data-label="Unit price" className="r num">
                  {formatCurrency(l.unitPrice, c)}
                </td>
                <td data-label="Line total" className="r num">
                  {formatCurrency(t.lineTotals[i] ?? "0", c)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals-box">
          <div className="totals-row">
            <span>Subtotal</span>
            <span className="num">{formatCurrency(t.subtotal, c)}</span>
          </div>
          {d.discount ? (
            <div className="totals-row">
              <span>
                Discount ({d.discount.kind === "percent" ? `${d.discount.value}%` : "fixed"})
              </span>
              <span className="num">−{formatCurrency(t.discount, c)}</span>
            </div>
          ) : null}
          {d.taxPercent ? (
            <div className="totals-row">
              <span>Tax ({d.taxPercent}%)</span>
              <span className="num">+{formatCurrency(t.tax, c)}</span>
            </div>
          ) : null}
          <div className="totals-row final">
            <span>Total ({c})</span>
            <span className="num" id="saved-total">
              {formatCurrency(t.total, c)}
            </span>
          </div>
          <p className="hint mt-8">
            <span className="badge badge-ok">
              <span aria-hidden="true">✓</span>Server-computed
            </span>{" "}
            These totals come from the saved PostgreSQL record, computed by the server in integer
            minor units.
          </p>
        </div>
      </div>
    </>
  );
}

/** Container: loads the record with GET /api/invoice-drafts/:id; cancels on unmount and drops stale answers. */
export function SavedDetailScreen() {
  const { state, dispatch, session } = useApp();
  const savedRef = state.saved;
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const [load, setLoad] = useState<SavedLoad>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const getInvoice = session?.getInvoice;
  const expired = session?.sessionExpired;
  const id = savedRef?.id;

  useEffect(() => {
    if (!getInvoice || !id) return;
    const ac = new AbortController();
    setLoad({ status: "loading" });
    void getInvoice(id, ac.signal).then((r) => {
      if (ac.signal.aborted || r.kind === "aborted") return;
      if (r.kind === "unauthorized") expired?.();
      else if (r.kind === "ok") setLoad({ status: "ok", invoice: r.invoice });
      else setLoad({ status: r.kind });
    });
    return () => ac.abort();
  }, [getInvoice, id, expired, tick]);

  // Only a real, server-authenticated session can show a saved record; the preview never can.
  if (!getInvoice || !savedRef) return null;
  return (
    <SavedDetailView
      savedRef={savedRef}
      load={load}
      onRetry={() => setTick((t) => t + 1)}
      onBack={() => dispatch({ type: "navigate", screen: "dashboard" })}
      headingRef={headingRef}
    />
  );
}
