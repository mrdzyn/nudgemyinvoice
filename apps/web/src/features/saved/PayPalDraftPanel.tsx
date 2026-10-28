import { useEffect, useMemo, useReducer, useRef } from "react";
import { PayPalStatusBadge } from "../../components/Badge.js";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import { Spinner } from "../../components/Spinner.js";
import { formatCurrency } from "../../domain/money.js";
import type { ServerInvoice } from "../../domain/serverInvoice.js";
import type { PayPalDraftResult } from "../../invoices/api.js";
import { createPayPalRunner } from "../../invoices/paypalRunner.js";
import {
  canOfferCreate,
  initialPanel,
  panelReducer,
  REFUSAL_COPY,
  type PanelUi,
} from "../../invoices/paypalPanel.js";
import { formatDate } from "../dashboard/DashboardScreen.js";

export type RefreshOutcome = "ok" | "failed";

/** Notice for the last POST answer. Plain statements only: nothing here claims a send or a payment. */
function OutcomeNotice({ r }: { r: PayPalDraftResult }) {
  switch (r.kind) {
    case "created":
      return (
        <Notice kind="ok" role="status" icon="✓" id="pp-outcome">
          <strong>
            {r.replayed
              ? "The PayPal Sandbox DRAFT already existed (HTTP 200, replayed)."
              : "PayPal Sandbox DRAFT created (HTTP 201)."}
          </strong>{" "}
          The server verified a <strong>DRAFT</strong> with id <code>{r.paypalInvoiceId}</code>.{" "}
          {r.replayed ? "No second draft was created. " : ""}It was not sent: the customer was not
          emailed and no payment was requested or collected.
        </Notice>
      );
    case "in-progress":
      return (
        <Notice kind="warn" role="status" icon="◔" id="pp-outcome">
          <strong>Another creation attempt is still in flight (HTTP 409 in_progress).</strong>{" "}
          Nothing was created by this request, and it will not be repeated automatically. Use “Check
          status” to read the saved state.
        </Notice>
      );
    case "reconciliation-pending":
      return (
        <Notice kind="warn" role="status" icon="◔" id="pp-outcome">
          <strong>
            Checking PayPal before doing anything else (HTTP 409 reconciliation_pending).
          </strong>{" "}
          An earlier attempt is unresolved, so the server is avoiding a duplicate draft. No new
          create request was made or will be made automatically. Use “Check status” later.
        </Notice>
      );
    case "mapping-refused":
      return (
        <Notice kind="warn" role="alert" icon="–" id="pp-outcome">
          <strong>
            This invoice cannot be created as a PayPal draft (HTTP 422 mapping_refused).
          </strong>{" "}
          {REFUSAL_COPY[r.reason]} The server never rounds silently and refused before contacting
          PayPal. The local invoice is unchanged; drafts cannot be edited in this version.
        </Notice>
      );
    case "paypal-unknown":
      return (
        <Notice kind="warn" role="alert" icon="?" id="pp-outcome">
          <strong>A PayPal draft may or may not exist.</strong> PayPal did not confirm the result
          (HTTP 502 paypal_outcome_unknown{r.code ? `, code ${r.code}` : ""}). This is neither a
          failure nor a success. Use “Check status” to read the saved state.
        </Notice>
      );
    case "paypal-rejected":
      return (
        <Notice kind="err" role="alert" icon="✕" id="pp-outcome">
          <strong>PayPal rejected the request (HTTP 502 paypal_rejected).</strong>
          {r.code ? ` Code ${r.code}.` : ""} No draft was created. The local invoice is unchanged.
        </Notice>
      );
    case "paypal-mismatch":
      return (
        <Notice kind="err" role="alert" icon="!" id="pp-outcome">
          <strong>
            The draft found in PayPal does not match this invoice (HTTP 502 paypal_mismatch).
          </strong>
          {r.code ? ` Code ${r.code}.` : ""} Manual investigation is required. No retry is offered.
        </Notice>
      );
    case "disabled":
      return (
        <Notice kind="warn" role="status" icon="ℹ" id="pp-outcome">
          <strong>
            PayPal Sandbox drafting is switched off on the server (HTTP 503 paypal_disabled).
          </strong>{" "}
          Nothing was sent anywhere. Your local invoices keep working. No further attempts are made
          from this page.
        </Notice>
      );
    case "unavailable":
      return (
        <Notice kind="warn" role="alert" icon="!" id="pp-outcome">
          <strong>The server could not process the request right now (HTTP 503).</strong> It is not
          known whether a draft was started. Use “Check status” before trying again.
        </Notice>
      );
    case "uncertain":
      return (
        <Notice kind="warn" role="alert" icon="?" id="pp-outcome">
          <strong>A PayPal draft may or may not exist.</strong>{" "}
          {r.cause === "timeout"
            ? "The server did not answer in time."
            : r.cause === "network"
              ? "The connection was lost before an answer arrived."
              : r.cause === "malformed"
                ? "The server's answer could not be verified."
                : "The server reported an error."}{" "}
          Stopping the browser request does not prove the server stopped, and nothing is retried
          automatically. Use “Check status” to read the saved state.
        </Notice>
      );
    case "unauthorized":
    case "aborted":
      return null;
    case "forbidden":
      return (
        <Notice kind="err" role="alert" id="pp-outcome">
          <strong>The server did not accept this request.</strong> Nothing was created. Reload the
          page and try again.
        </Notice>
      );
    case "not-found":
      return (
        <Notice kind="err" role="alert" id="pp-outcome">
          <strong>This invoice could not be found on the server.</strong> Nothing was created.
        </Notice>
      );
    case "bad-request":
      return (
        <Notice kind="err" role="alert" id="pp-outcome">
          <strong>The server refused the request.</strong> Nothing was created.
        </Notice>
      );
  }
}

/** Pure view: every state of the panel can be rendered and tested without a network. */
export function PayPalDraftPanelView({
  invoice,
  ui,
  onOpen,
  onCancel,
  onConfirm,
  onCheck,
}: {
  invoice: ServerInvoice;
  ui: PanelUi;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onCheck: () => void;
}) {
  const pp = invoice.paypal;
  const durable = pp?.state ?? "none";
  const d = invoice.draft;
  const c = d.currency;
  const busy = ui.phase === "creating";
  const offer = canOfferCreate(durable, ui);
  const outcome = ui.outcome;

  const createButton = (label: string) => (
    <button
      type="button"
      className="btn btn-primary"
      id="create-pp-btn"
      onClick={onOpen}
      disabled={!offer}
    >
      {label}
    </button>
  );
  const checkButton = (
    <button
      type="button"
      className="btn btn-secondary"
      id="check-pp-btn"
      onClick={onCheck}
      disabled={ui.phase !== "idle"}
      aria-busy={ui.phase === "checking"}
    >
      {ui.phase === "checking" ? "Checking…" : "Check status"}
    </button>
  );

  let body;
  if (busy) {
    body = (
      <p className="paypal-status" role="status" id="pp-creating">
        <Spinner /> Creating the PayPal Sandbox draft… Please wait; do not close this page. Another
        request cannot be started while this one is in flight.
      </p>
    );
  } else if (ui.unverified && durable === "none") {
    // The last answer was uncertain and the saved state has not been re-read: say so instead of "not created".
    body = (
      <div className="row">
        <div>
          <PayPalStatusBadge state="unknown" />
          <div className="paypal-status">Saved state not yet confirmed</div>
          <p>
            A PayPal draft may or may not exist. Read the saved state before doing anything else; a
            new create is not offered until you have.
          </p>
        </div>
        {checkButton}
      </div>
    );
  } else {
    switch (durable) {
      case "created":
        body = (
          <>
            <PayPalStatusBadge state="created" />
            <div className="paypal-status">The draft exists in the PayPal Sandbox</div>
            <dl className="meta-list mt-8">
              <div>
                <dt>PayPal invoice id (from the server)</dt>
                <dd className="mono" id="pp-id">
                  {pp?.paypalInvoiceId ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>DRAFT</dd>
              </div>
            </dl>
            <p className="mt-12">
              <strong>The customer has not been emailed.</strong> This version cannot send, remind
              or collect payment.
            </p>
          </>
        );
        break;
      case "pending":
      case "creating":
        body = (
          <div className="row">
            <div>
              <PayPalStatusBadge state="creating" />
              <div className="paypal-status">Creation in progress</div>
              <p>
                An attempt is being processed on the server. Do not create it again: read the saved
                state with “Check status”.
              </p>
            </div>
            {checkButton}
          </div>
        );
        break;
      case "unknown":
        body = (
          <div className="row">
            <div>
              <PayPalStatusBadge state="unknown" />
              <div className="paypal-status">PayPal did not confirm the result</div>
              <p>
                A PayPal draft may or may not exist
                {pp?.lastErrorCode ? (
                  <>
                    {" "}
                    (code <code>{pp.lastErrorCode}</code>)
                  </>
                ) : null}
                . This is neither a failure nor a success. A retry is a new, explicit action and the
                server checks PayPal first instead of blindly creating a second draft.
              </p>
            </div>
            <div className="stack-buttons">
              {checkButton}
              {createButton("Retry (checks PayPal first)…")}
            </div>
          </div>
        );
        break;
      case "rejected":
        body = (
          <div className="row">
            <div>
              <PayPalStatusBadge state="rejected" />
              <div className="paypal-status">PayPal rejected the request</div>
              <p>
                No draft was created
                {pp?.lastErrorCode ? (
                  <>
                    {" "}
                    (code <code>{pp.lastErrorCode}</code>)
                  </>
                ) : null}
                . The local invoice is unchanged. Trying again is an explicit action.
              </p>
            </div>
            <div className="stack-buttons">
              {checkButton}
              {createButton("Try again…")}
            </div>
          </div>
        );
        break;
      case "mismatch":
        body = (
          <div>
            <PayPalStatusBadge state="mismatch" />
            <div className="paypal-status">The PayPal draft does not match this invoice</div>
            <Notice kind="err" role="alert" className="mt-12 notice-flush" id="pp-mismatch">
              <strong>Manual investigation required.</strong> The draft found in PayPal differs from
              this saved invoice
              {pp?.lastErrorCode ? (
                <>
                  {" "}
                  (code <code>{pp.lastErrorCode}</code>)
                </>
              ) : null}
              . This app does not change it and offers no retry. Review it in the PayPal Sandbox
              dashboard.
            </Notice>
            <div className="mt-12">{checkButton}</div>
          </div>
        );
        break;
      default:
        body = (
          <div className="row">
            <div>
              <PayPalStatusBadge state="none" />
              <div className="paypal-status">Not created in PayPal Sandbox</div>
              <p>
                This invoice is saved in PostgreSQL only. Creating the PayPal Sandbox draft makes
                one <strong>DRAFT</strong> invoice in the Sandbox. It does <strong>not</strong>{" "}
                email or notify the customer, does not send an invoice and does not request payment.
              </p>
              {ui.disabledSeen ? (
                <p className="hint">
                  Drafting is switched off on the server, so it is not offered.
                </p>
              ) : null}
            </div>
            <div className="stack-buttons">{createButton("Create PayPal Sandbox draft…")}</div>
          </div>
        );
    }
  }

  return (
    <>
      <section className="paypal-panel" aria-labelledby="pp-title" aria-busy={busy}>
        <span className="sandbox-pill">PayPal Sandbox</span>
        <h2 className="card-title mt-8 mb-0" id="pp-title">
          PayPal Sandbox draft
        </h2>
        {outcome ? <div className="mt-12">{<OutcomeNotice r={outcome} />}</div> : null}
        {ui.readFailed ? (
          <Notice kind="warn" role="alert" className="mt-12 notice-flush" id="pp-read-failed">
            <strong>The saved state could not be re-read.</strong> What is shown may be out of date.
            Nothing was created by this check.
          </Notice>
        ) : null}
        <div id="pp-body" aria-live="polite" className="mt-12">
          {body}
        </div>
      </section>
      <Dialog
        open={ui.phase === "confirming"}
        title="Create a PayPal Sandbox draft?"
        confirmLabel="Create PayPal Sandbox draft"
        cancelLabel="Cancel"
        onCancel={onCancel}
        onConfirm={onConfirm}
      >
        <dl className="meta-list" id="pp-confirm-target">
          <div>
            <dt>Saved invoice</dt>
            <dd className="mono">{invoice.id}</dd>
          </div>
          <div>
            <dt>Customer</dt>
            <dd>{d.customerName}</dd>
          </div>
          <div>
            <dt>Total (server-computed)</dt>
            <dd>
              <strong>{formatCurrency(invoice.totals.total, c)}</strong> {c}
            </dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{formatDate(d.dueDate)}</dd>
          </div>
        </dl>
        <p className="mt-12">
          This prepares one <strong>DRAFT</strong> invoice in the PayPal <strong>Sandbox</strong>.
        </p>
        <Notice kind="warn" className="mt-14">
          <strong>The customer will not be emailed.</strong> No payment will be collected and this
          does not send an invoice. It happens only because you confirm it here.
        </Notice>
      </Dialog>
    </>
  );
}

/**
 * Container. A POST is issued ONLY from the confirm action of the open dialog (one request per
 * confirmation, single flight). Mounting, rendering, navigating or reloading never POSTs, and
 * "Check status" only re-reads GET detail. A 401 ends the session; late answers are dropped.
 */
export function PayPalDraftPanel({
  invoice,
  create,
  refresh,
  onExpired,
}: {
  invoice: ServerInvoice;
  create: (signal: AbortSignal) => Promise<PayPalDraftResult>;
  /** Re-reads GET /api/invoice-drafts/:id (never a POST); calls in flight are coalesced. */
  refresh: () => Promise<RefreshOutcome>;
  onExpired: () => void;
}) {
  const [ui, dispatch] = useReducer(panelReducer, initialPanel);
  const live = useRef(true);
  const latest = useRef({ refresh, onExpired });
  latest.current = { refresh, onExpired };

  const readBack = () => {
    void latest.current.refresh().then((r) => {
      if (live.current) dispatch({ type: "readback", ok: r === "ok" });
    });
  };

  const runner = useMemo(
    () =>
      createPayPalRunner(create, (r) => {
        if (!live.current) return;
        if (r.kind === "unauthorized") {
          latest.current.onExpired(); // ends the auth epoch: this whole workspace unmounts
          return;
        }
        dispatch({ type: "result", result: r });
        // Whatever the answer, the durable record is the authority: re-read it (read-only).
        if (r.kind !== "aborted") readBack();
      }),
    [create],
  );

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      runner.abort(); // sign-out, session end, navigation: nothing may land afterwards
    };
  }, [runner]);

  return (
    <PayPalDraftPanelView
      invoice={invoice}
      ui={ui}
      onOpen={() => dispatch({ type: "open-confirm" })}
      onCancel={() => dispatch({ type: "cancel-confirm" })}
      onConfirm={() => {
        if (runner.pending || ui.phase !== "confirming") return; // a double click is one request
        dispatch({ type: "confirm" });
        runner.start();
      }}
      onCheck={() => {
        if (ui.phase !== "idle") return;
        dispatch({ type: "check-start" });
        void latest.current.refresh().then((r) => {
          if (live.current) dispatch({ type: "check-done", ok: r === "ok" });
        });
      }}
    />
  );
}
