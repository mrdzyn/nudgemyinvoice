import { useState } from "react";
import { PayPalStatusBadge } from "../../components/Badge.js";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import { useFocusOnMount, useScheduler } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";
import { REFUSAL_TEXT, formatCurrency, paypalRefusal } from "../../domain/money.js";
import type { PayPalViewState, RefusalReason, SavedInvoice } from "../../domain/types.js";
import { formatDate, shortId } from "../dashboard/DashboardScreen.js";

function refusalOf(inv: SavedInvoice): RefusalReason | null {
  try {
    return paypalRefusal(inv.draft);
  } catch {
    return null;
  }
}

const isRefusalReason = (v: string | null): v is RefusalReason => v !== null && v in REFUSAL_TEXT;

function PayPalPanel({
  invoice,
  onHeadingFocus,
}: {
  invoice: SavedInvoice;
  onHeadingFocus: () => void;
}) {
  const { state, dispatch, announce } = useApp();
  const schedule = useScheduler();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  const ov = state.ppOverride;
  const view: PayPalViewState = ov ? ov.state : invoice.paypal.state;
  const code = ov ? ov.code : invoice.paypal.lastErrorCode;
  const paypalId = invoice.paypal.paypalInvoiceId ?? "INV2-DEMO-FAKE-0000-0002";
  const disabled = state.ppDisabled;

  const confirmCreate = () => {
    setConfirmOpen(false);
    setBusy(true);
    dispatch({ type: "paypal-override", override: null });
    announce("Creating the PayPal Sandbox draft");
    schedule(() => {
      setBusy(false);
      const why = refusalOf(invoice);
      if (why) {
        dispatch({ type: "paypal-override", override: { state: "refused", code: why } });
        announce("PayPal draft refused before contacting PayPal");
      } else {
        dispatch({ type: "paypal-created", id: invoice.id });
        announce("PayPal Sandbox draft created (simulated). The customer was not emailed.");
      }
      onHeadingFocus();
    }, 1000);
  };

  const openConfirm = () => {
    if (state.offline) {
      announce("You are offline. PayPal draft creation is unavailable.");
      return;
    }
    if (!disabled) setConfirmOpen(true);
  };

  const createButton = (label: string) => (
    <button
      type="button"
      className="btn btn-primary"
      id="create-pp-btn"
      disabled={disabled}
      aria-disabled={state.offline ? true : undefined}
      aria-describedby={disabled ? "pp-disabled" : undefined}
      onClick={openConfirm}
    >
      {label}
    </button>
  );
  const disabledNote = disabled ? (
    <Notice kind="warn" role="note" id="pp-disabled" className="mt-12 notice-flush">
      <strong>PayPal Sandbox drafting is switched off.</strong> The server answered HTTP 503{" "}
      <code>paypal_disabled</code> because drafting is turned off in its configuration (
      <code>PAYPAL_DRAFTS_ENABLED=false</code>). Local drafts still work.
    </Notice>
  ) : null;
  const checkButton = (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        setChecked(true);
        announce("Status checked: still the same. The preview shows a fixed state.");
      }}
    >
      Check status
    </button>
  );
  const checkedNote = checked ? (
    <p className="hint">Checked just now: no change. The preview shows a fixed state.</p>
  ) : null;

  let body;
  if (busy) {
    body = (
      <>
        <p className="paypal-status" role="status">
          <span className="spinner" aria-hidden="true" /> Creating the PayPal Sandbox draft…
        </p>
        <p className="hint">
          Simulated. The real server keeps one create attempt in flight at a time.
        </p>
      </>
    );
  } else {
    switch (view) {
      case "created":
        body = (
          <>
            <div className="row">
              <div>
                <PayPalStatusBadge state="created" />
                <div className="paypal-status">The draft exists in the PayPal Sandbox</div>
                <dl className="meta-list mt-8">
                  <div>
                    <dt>PayPal invoice id (fabricated demo id)</dt>
                    <dd className="mono">{paypalId}</dd>
                  </div>
                  <div>
                    <dt>Status when created</dt>
                    <dd>DRAFT</dd>
                  </div>
                </dl>
              </div>
            </div>
            <p className="mt-12">
              <strong>The customer has not been emailed.</strong> This version cannot send, remind
              or collect payment.
            </p>
            <p className="hint">
              Simulated result: no PayPal request was made and this id is not a provider response.
            </p>
          </>
        );
        break;
      case "creating":
      case "pending":
        body = (
          <div className="row">
            <div>
              <PayPalStatusBadge state="creating" />
              <div className="paypal-status">Creation in progress</div>
              <p>
                Another request is creating this draft (HTTP 409 <code>in_progress</code>). Check
                again in a few seconds. You do not need to create it again.
              </p>
              {checkedNote}
            </div>
            {checkButton}
          </div>
        );
        break;
      case "reconciling":
        body = (
          <div className="row">
            <div>
              <PayPalStatusBadge state="reconciling" />
              <div className="paypal-status">Checking PayPal before doing anything else</div>
              <p>
                An earlier attempt had an uncertain result, so the server is reconciling with PayPal
                first (HTTP 409 <code>reconciliation_pending</code>). It will not create a second
                draft blindly.
              </p>
              {checkedNote}
            </div>
            {checkButton}
          </div>
        );
        break;
      case "unknown":
        body = (
          <>
            <div className="row">
              <div>
                <PayPalStatusBadge state="unknown" />
                <div className="paypal-status">PayPal did not confirm the result</div>
                <p>
                  The last attempt ended without a confirmed answer (HTTP 502{" "}
                  <code>paypal_outcome_unknown</code>
                  {code ? (
                    <>
                      , code <code>{code}</code>
                    </>
                  ) : null}
                  ). A draft may or may not exist in PayPal. Retrying is safe: the server checks
                  PayPal first.
                </p>
              </div>
              {createButton("Retry (checks PayPal first)")}
            </div>
            {disabledNote}
          </>
        );
        break;
      case "rejected":
        body = (
          <>
            <div className="row">
              <div>
                <PayPalStatusBadge state="rejected" />
                <div className="paypal-status">PayPal rejected the request</div>
                <p>
                  No draft was created (HTTP 502 <code>paypal_rejected</code>
                  {code ? (
                    <>
                      , code <code>{code}</code>
                    </>
                  ) : null}
                  ). The local draft is unchanged. You can try again.
                </p>
              </div>
              {createButton("Try again")}
            </div>
            {disabledNote}
          </>
        );
        break;
      case "mismatch":
        body = (
          <div className="row">
            <div>
              <PayPalStatusBadge state="mismatch" />
              <div className="paypal-status">The PayPal draft does not match this invoice</div>
              <p>
                The draft found in PayPal differs from this local invoice (HTTP 502{" "}
                <code>paypal_mismatch</code>
                {code ? (
                  <>
                    , code <code>{code}</code>
                  </>
                ) : null}
                ). The app does not change it. Review it in the PayPal Sandbox dashboard. No retry
                is offered.
              </p>
            </div>
          </div>
        );
        break;
      case "refused":
        body = (
          <div className="row">
            <div>
              <PayPalStatusBadge state="refused" />
              <div className="paypal-status">This invoice cannot be created as a PayPal draft</div>
              <p>
                Refused before contacting PayPal (HTTP 422 <code>mapping_refused</code>):{" "}
                {isRefusalReason(code) ? REFUSAL_TEXT[code] : "its totals depend on rounding."}
              </p>
              <p className="mt-8">
                The local draft is unchanged. Drafts cannot be edited in this version, so create a
                new invoice with amounts that need no rounding, or a single line when using both tax
                and a discount.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                dispatch({ type: "navigate", screen: "composer", resetComposer: true })
              }
            >
              Start a new invoice
            </button>
          </div>
        );
        break;
      case "none": {
        const why = refusalOf(invoice);
        body = (
          <>
            <div className="row">
              <div>
                <PayPalStatusBadge state="none" />
                <div className="paypal-status">Not created in PayPal Sandbox</div>
                <p>
                  Creating the draft makes one <strong>DRAFT</strong> invoice in the PayPal Sandbox.
                  It does <strong>not</strong> email or notify the customer and does not request
                  payment.
                </p>
                {why ? (
                  <Notice kind="warn" role="note" className="mt-12 notice-flush">
                    <strong>Expected to be refused.</strong> {REFUSAL_TEXT[why]} You can still try;
                    the server decides.
                  </Notice>
                ) : null}
              </div>
              {createButton("Create PayPal Sandbox draft…")}
            </div>
            {disabledNote}
          </>
        );
        break;
      }
    }
  }

  return (
    <>
      <section className="paypal-panel" aria-labelledby="pp-title" aria-busy={busy}>
        <span className="sandbox-pill">PayPal Sandbox</span>
        <h2 className="card-title mt-8 mb-0" id="pp-title">
          PayPal Sandbox draft
        </h2>
        <div id="pp-body" aria-live="polite">
          {body}
        </div>
      </section>
      <Dialog
        open={confirmOpen}
        title="Create a PayPal Sandbox draft?"
        confirmLabel="Create draft"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmCreate}
      >
        <p>
          This creates one <strong>DRAFT</strong> invoice for{" "}
          <strong>{invoice.draft.customerName}</strong> (
          {formatCurrency(invoice.totals.total, invoice.draft.currency)} {invoice.draft.currency})
          in the PayPal <strong>Sandbox</strong>.
        </p>
        <Notice kind="warn" className="mt-14">
          <strong>The customer will not be emailed.</strong> No money moves. This app version cannot
          send invoices. (In this shell the action is simulated: no request is made.)
        </Notice>
      </Dialog>
    </>
  );
}

export function DetailScreen() {
  const { state, dispatch } = useApp();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const inv = state.invoices.find((i) => i.id === state.detailId) ?? state.invoices[0];
  if (!inv) {
    return (
      <section aria-labelledby="det-title">
        <h1 className="screen-title" id="det-title" tabIndex={-1} ref={headingRef}>
          No invoice selected
        </h1>
      </section>
    );
  }
  const d = inv.draft;
  const t = inv.totals;
  const c = d.currency;
  return (
    <section aria-labelledby="det-title">
      <div className="page-head">
        <div>
          <h1 className="screen-title" id="det-title" tabIndex={-1} ref={headingRef}>
            {d.customerName}
          </h1>
          <p className="subtitle">
            Local draft <span className="mono">{shortId(inv.id)}</span> · {c}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => dispatch({ type: "navigate", screen: "dashboard" })}
        >
          Back to drafts
        </button>
      </div>
      {state.detailNotice === "created" ? (
        <Notice kind="ok" role="status" icon="✓">
          <strong>Local draft saved (simulated).</strong> In this shell it exists only in memory.
          Nothing has been sent to PayPal.
        </Notice>
      ) : null}
      {state.detailNotice === "replayed" ? (
        <Notice kind="info" role="status" icon="ℹ">
          <strong>Duplicate save detected (simulated).</strong> The same Idempotency-Key was sent
          again, so the server returned the existing draft (HTTP 200, <code>replayed: true</code>).
          No second draft was created.
        </Notice>
      ) : null}
      <PayPalPanel
        key={`${inv.id}-${state.seedKey}`}
        invoice={inv}
        onHeadingFocus={() => headingRef.current?.focus()}
      />
      <div className="card">
        <h2 className="card-title">Invoice</h2>
        <dl className="meta-list">
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
            <dt>Created</dt>
            <dd>{formatDate(inv.createdAt)}</dd>
          </div>
          <div>
            <dt>Draft id</dt>
            <dd className="mono">{inv.id}</dd>
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
            <span className="num">{formatCurrency(t.total, c)}</span>
          </div>
          <p className="hint mt-8">
            <span className="badge badge-ok">
              <span aria-hidden="true">✓</span>Server-computed
            </span>{" "}
            {inv.simulated
              ? "Simulated server response in this design preview."
              : "Totals come from the saved record; the server computed them in integer minor units."}
          </p>
        </div>
      </div>
    </section>
  );
}
