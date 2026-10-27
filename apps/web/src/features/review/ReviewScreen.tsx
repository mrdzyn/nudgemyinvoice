import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import { useFocusOnMount, useScheduler } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";
import type { ReviewSeed } from "../../demo/appState.js";
import { saveBody } from "../../invoices/api.js";
import { useRealSave, type SaveUi } from "../../invoices/useRealSave.js";
import { CURRENCY_CODES, type CurrencyCode, type InvoiceDraft } from "../../domain/types.js";
import {
  MAX_LINE_ITEMS,
  MAX_TEXT,
  controlId,
  toDraft,
  validateForm,
  type FormState,
} from "../../domain/invoiceForm.js";
import {
  CURRENCY_INFO,
  DEMO_TODAY,
  REFUSAL_TEXT,
  estimateTotals,
  formatCurrency,
  formatMinor,
  MoneyError,
  paypalRefusal,
  parseMoney,
  parseQuantity,
  type EstimatedTotals,
} from "../../domain/money.js";

function tryEstimate(draft: InvoiceDraft): { totals: EstimatedTotals } | { error: string } {
  try {
    return { totals: estimateTotals(draft) };
  } catch (e) {
    if (e instanceof MoneyError) return { error: e.message };
    throw e;
  }
}

function lineEstimate(form: FormState, i: number): string {
  const l = form.lines[i];
  if (!l) return "—";
  try {
    const t =
      (parseMoney(l.unitPrice, form.currency) * parseQuantity(l.quantity) * 2n + 100n) / 200n;
    return formatCurrency(formatMinor(t, form.currency), form.currency);
  } catch {
    return "—";
  }
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return (
    <p className="field-error" id={`err-${id}`} hidden={!message}>
      {message}
    </p>
  );
}

/** Mounted with the seed the composer (or a demo state) prepared; keyed so it re-initialises on a new seed. */
export function ReviewScreen() {
  const { state } = useApp();
  if (!state.review) return null;
  return <ReviewForm key={state.seedKey} seed={state.review} />;
}

export const NO_SAVE = () => Promise.resolve({ kind: "aborted" as const });

function ReviewForm({ seed }: { seed: ReviewSeed }) {
  const { state, dispatch, announce, session } = useApp();
  const schedule = useScheduler();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState>(seed.form);
  const [showErrors, setShowErrors] = useState(seed.showErrors);
  const [demoSaving, setSaving] = useState(false);
  const real = Boolean(session?.save);
  const rs = useRealSave({
    save: session?.save ?? NO_SAVE,
    onSaved: (inv, replayed) => {
      dispatch({ type: "open-saved", id: inv.id, notice: replayed ? "replayed" : "created" });
      announce(replayed ? "Existing saved draft returned" : "Draft saved");
    },
    onExpired: () => session?.sessionExpired?.(),
  });
  const saving = real ? rs.ui.status === "saving" : demoSaving;
  const uncertain = real && rs.ui.status === "uncertain";

  // Tell the workspace whether leaving would abandon an unresolved save (and its idempotency key).
  const setSaveGuard = session?.setSaveGuard;
  const guardNow = !real
    ? "none"
    : rs.ui.status === "saving"
      ? "pending"
      : uncertain
        ? "uncertain"
        : "none";
  useEffect(() => {
    setSaveGuard?.(guardNow);
  }, [setSaveGuard, guardNow]);
  // Only unmounting clears it; a pending -> uncertain change must not close an open leave dialog.
  useEffect(() => () => setSaveGuard?.("none"), [setSaveGuard]);
  const [conflict, setConflict] = useState(false);
  const [keyRenewed, setKeyRenewed] = useState(false);
  const [idemKey, setIdemKey] = useState(seed.saveKey);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [summaryTick, setSummaryTick] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (focusTarget) {
      document.getElementById(focusTarget)?.focus();
      setFocusTarget(null);
    }
  }, [focusTarget]);
  useEffect(() => {
    if (summaryTick > 0) summaryRef.current?.focus();
  }, [summaryTick]);

  const { errors } = useMemo(() => validateForm(form), [form]);
  const errorById = useMemo(() => new Map(errors.map((e) => [e.id, e.message])), [errors]);
  const msg = (id: string) => (showErrors ? errorById.get(id) : undefined);
  const draft = useMemo(() => toDraft(form), [form]);
  const estimate = useMemo(() => tryEstimate(draft), [draft]);
  const refusal = useMemo(() => {
    if (!("totals" in estimate)) return null;
    try {
      return paypalRefusal(draft);
    } catch {
      return null;
    }
  }, [draft, estimate]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setLine = (i: number, k: "description" | "quantity" | "unitPrice", v: string) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const invalid = (id: string) => (msg(id) ? true : undefined);

  const retry = () => {
    if (state.offline) {
      announce("You are offline. Saving is unavailable.");
      return;
    }
    if (rs.submit(draft, JSON.stringify(saveBody(draft)))) announce("Retrying the same save");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (state.offline) {
      announce("You are offline. Saving is unavailable.");
      return;
    }
    setShowErrors(true);
    if (errors.length > 0) {
      setSummaryTick((t) => t + 1);
      announce(`${errors.length} problems to fix before saving`);
      return;
    }
    if (real) {
      if (rs.submit(draft, JSON.stringify(saveBody(draft)))) announce("Saving draft");
      return;
    }
    setSaving(true);
    announce("Saving draft");
    schedule(() => {
      setSaving(false);
      if (seed.saveMode === "conflict" && !keyRenewed) {
        setConflict(true);
        announce("Save rejected: idempotency conflict");
        return;
      }
      const est = tryEstimate(draft);
      if (!("totals" in est)) return;
      const { currency, lineTotals, subtotal, discount, tax, total } = est.totals;
      const replay = state.idempotency[idemKey] !== undefined;
      dispatch({
        type: "save-invoice",
        key: idemKey,
        draft,
        totals: { currency, lineTotals, subtotal, discount, tax, total },
      });
      announce(replay ? "Duplicate save: existing draft returned" : "Local draft saved");
    }, 800);
  };

  const c: CurrencyCode = form.currency;
  const exp = CURRENCY_INFO[c].exponent;
  const pastDue = /^\d{4}-\d{2}-\d{2}$/.test(form.dueDate) && form.dueDate < DEMO_TODAY;

  return (
    <section aria-labelledby="rev-title">
      <div className="page-head">
        <div>
          <h1 className="screen-title" id="rev-title" tabIndex={-1} ref={headingRef}>
            Review invoice
          </h1>
          <p className="subtitle">
            {seed.source === "ai"
              ? "Check what the AI proposed before saving"
              : "Enter the invoice details"}
          </p>
        </div>
        <span className="badge badge-neutral">Not saved yet</span>
      </div>
      {seed.source === "ai" ? (
        <Notice kind="ai" role="note" icon="✦">
          <strong>Proposed by the AI parser.</strong> It can be wrong. Check the customer, email,
          currency, due date and every amount, then save. Nothing is sent to PayPal.
          {session?.parse ? (
            <>
              {" "}
              This proposal came from the server&apos;s parser and is not saved yet. Saving writes
              it to PostgreSQL; it does not create a PayPal invoice or notify the customer.
            </>
          ) : null}
        </Notice>
      ) : (
        <Notice kind="info" role="note" icon="✎">
          <strong>Manual entry.</strong> Required fields are marked with *.
        </Notice>
      )}
      <div
        ref={summaryRef}
        id="err-summary"
        className="notice notice-err"
        role="alert"
        tabIndex={-1}
        hidden={!(showErrors && errors.length > 0)}
      >
        {showErrors && errors.length > 0 ? (
          <>
            <span aria-hidden="true">⚠</span>
            <div>
              <strong>
                {errors.length} problem{errors.length === 1 ? "" : "s"} to fix before saving
              </strong>
              <ul>
                {errors.map((e) => (
                  <li key={e.id}>
                    <a
                      href={`#${controlId(e.id)}`}
                      onClick={(ev) => {
                        ev.preventDefault();
                        document.getElementById(controlId(e.id))?.focus();
                      }}
                    >
                      {e.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
      <form onSubmit={submit} noValidate>
        {/* Outside the fieldset: its buttons must stay usable while the form itself is locked. */}
        {real ? <RealSaveNotices ui={rs.ui} rs={rs} announce={announce} onRetry={retry} /> : null}
        <fieldset className="plain-fieldset" disabled={saving || uncertain}>
          <div className="review-grid">
            <div>
              <div className="card">
                <h2 className="card-title">Customer and terms</h2>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="f-customerName">
                      Customer name{" "}
                      <span className="req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      className="input"
                      id="f-customerName"
                      type="text"
                      autoComplete="off"
                      required
                      maxLength={200}
                      value={form.customerName}
                      onChange={(e) => set("customerName", e.target.value)}
                      aria-invalid={invalid("customerName")}
                      aria-describedby="err-customerName"
                    />
                    <FieldError id="customerName" message={msg("customerName")} />
                  </div>
                  <div className="field">
                    <label htmlFor="f-customerEmail">
                      Customer email{" "}
                      <span className="req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      className="input"
                      id="f-customerEmail"
                      type="email"
                      autoComplete="off"
                      required
                      maxLength={254}
                      value={form.customerEmail}
                      onChange={(e) => set("customerEmail", e.target.value)}
                      aria-invalid={invalid("customerEmail")}
                      aria-describedby="err-customerEmail"
                    />
                    <FieldError id="customerEmail" message={msg("customerEmail")} />
                  </div>
                  <div className="field">
                    <label htmlFor="f-currency">
                      Currency{" "}
                      <span className="req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <select
                      className="select"
                      id="f-currency"
                      value={form.currency}
                      aria-describedby="hint-currency"
                      onChange={(e) => {
                        const v = CURRENCY_CODES.find((x) => x === e.target.value);
                        if (v) {
                          set("currency", v);
                          announce(`Currency set to ${v}. Existing amounts were not converted.`);
                        }
                      }}
                    >
                      {CURRENCY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {code} · {CURRENCY_INFO[code].name}
                        </option>
                      ))}
                    </select>
                    <p className="hint" id="hint-currency">
                      One currency per invoice. Changing it does not convert amounts.
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="f-dueDate">
                      Due date{" "}
                      <span className="req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      className="input"
                      id="f-dueDate"
                      type="date"
                      required
                      value={form.dueDate}
                      onChange={(e) => set("dueDate", e.target.value)}
                      aria-invalid={invalid("dueDate")}
                      aria-describedby="err-dueDate hint-dueDate"
                    />
                    <p className="hint" id="hint-dueDate">
                      {pastDue
                        ? "This date is in the past. It can be saved locally, but a PayPal Sandbox draft will be refused."
                        : "Choose the date the customer should pay by."}
                    </p>
                    <FieldError id="dueDate" message={msg("dueDate")} />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h2 className="card-title" id="lines-title">
                    Line items
                  </h2>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    id="add-line-btn"
                    disabled={form.lines.length >= MAX_LINE_ITEMS}
                    onClick={() => {
                      const i = form.lines.length;
                      setForm((f) => ({
                        ...f,
                        lines: [...f.lines, { description: "", quantity: "1", unitPrice: "" }],
                      }));
                      setFocusTarget(`f-line-${i}-description`);
                      announce(`Line ${i + 1} added`);
                    }}
                  >
                    Add line item
                  </button>
                </div>
                <div role="group" aria-labelledby="lines-title">
                  <div className="line-head" aria-hidden="true">
                    <span>Description</span>
                    <span>Quantity</span>
                    <span>Unit price</span>
                    <span className="text-right">Line total</span>
                    <span />
                  </div>
                  <div>
                    {form.lines.map((l, i) => (
                      <div
                        className="line-row"
                        role="group"
                        aria-label={`Line item ${i + 1}`}
                        key={i}
                      >
                        <div className="field f-desc">
                          <span className="m-label" aria-hidden="true">
                            Description
                          </span>
                          <input
                            className="input"
                            id={`f-line-${i}-description`}
                            aria-label={`Description, line ${i + 1}`}
                            value={l.description}
                            maxLength={MAX_TEXT}
                            autoComplete="off"
                            onChange={(e) => setLine(i, "description", e.target.value)}
                            aria-invalid={invalid(`line-${i}-description`)}
                            aria-describedby={`err-line-${i}-description`}
                          />
                          <FieldError
                            id={`line-${i}-description`}
                            message={msg(`line-${i}-description`)}
                          />
                        </div>
                        <div className="field">
                          <span className="m-label" aria-hidden="true">
                            Quantity
                          </span>
                          <input
                            className="input num"
                            id={`f-line-${i}-quantity`}
                            aria-label={`Quantity, line ${i + 1}`}
                            inputMode="decimal"
                            value={l.quantity}
                            autoComplete="off"
                            onChange={(e) => setLine(i, "quantity", e.target.value)}
                            aria-invalid={invalid(`line-${i}-quantity`)}
                            aria-describedby={`err-line-${i}-quantity`}
                          />
                          <FieldError
                            id={`line-${i}-quantity`}
                            message={msg(`line-${i}-quantity`)}
                          />
                        </div>
                        <div className="field">
                          <span className="m-label" aria-hidden="true">
                            Unit price ({c})
                          </span>
                          <input
                            className="input num"
                            id={`f-line-${i}-unitPrice`}
                            aria-label={`Unit price in ${c}, line ${i + 1}`}
                            inputMode="decimal"
                            placeholder={exp === 0 ? "0" : "0.00"}
                            value={l.unitPrice}
                            autoComplete="off"
                            onChange={(e) => setLine(i, "unitPrice", e.target.value)}
                            aria-invalid={invalid(`line-${i}-unitPrice`)}
                            aria-describedby={`err-line-${i}-unitPrice`}
                          />
                          <FieldError
                            id={`line-${i}-unitPrice`}
                            message={msg(`line-${i}-unitPrice`)}
                          />
                        </div>
                        <div className="f-total">
                          <span className="m-label" aria-hidden="true">
                            Line total (estimate)
                          </span>
                          <div className="line-total num">{lineEstimate(form, i)}</div>
                        </div>
                        <div className="f-remove">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-label={`Remove line ${i + 1}`}
                            disabled={form.lines.length === 1}
                            onClick={() => {
                              setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }));
                              setFocusTarget(
                                `f-line-${Math.min(i, form.lines.length - 2)}-description`,
                              );
                              announce(`Line ${i + 1} removed`);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <FieldError id="lines" message={msg("lines")} />
                <p className="hint">
                  {form.lines.length} of {MAX_LINE_ITEMS} line items.{" "}
                  {exp === 0 ? "JPY has no decimal places." : ""}
                </p>
              </div>

              <div className="card">
                <h2 className="card-title">
                  Tax and discount <span className="hint hint-normal">(optional)</span>
                </h2>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="f-taxPercent">Tax rate (percent)</label>
                    <input
                      className="input"
                      id="f-taxPercent"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={form.taxPercent}
                      onChange={(e) => set("taxPercent", e.target.value)}
                      aria-invalid={invalid("taxPercent")}
                      aria-describedby="err-taxPercent hint-tax"
                    />
                    <p className="hint" id="hint-tax">
                      Percent only, up to 2 decimals, for example 8.25. A fixed tax amount is not
                      supported.
                    </p>
                    <FieldError id="taxPercent" message={msg("taxPercent")} />
                  </div>
                  <div>
                    <div className="discount-grid">
                      <div className="field">
                        <label htmlFor="f-discountKind">Discount type</label>
                        <select
                          className="select"
                          id="f-discountKind"
                          value={form.discountKind}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "none" || v === "percent" || v === "amount")
                              setForm((f) => ({
                                ...f,
                                discountKind: v,
                                discountValue: v === "none" ? "" : f.discountValue,
                              }));
                          }}
                        >
                          <option value="none">None</option>
                          <option value="percent">Percent</option>
                          <option value="amount">Fixed amount</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="f-discountValue">Discount value</label>
                        <input
                          className="input"
                          id="f-discountValue"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={form.discountValue}
                          onChange={(e) => set("discountValue", e.target.value)}
                          aria-invalid={invalid("discountValue")}
                          aria-describedby="err-discountValue"
                        />
                        <FieldError id="discountValue" message={msg("discountValue")} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside aria-labelledby="totals-title">
              <div className="totals">
                <h2 className="card-title" id="totals-title">
                  Estimated totals
                </h2>
                <p className="hint mb-10">
                  A preview calculation in the browser. The server recomputes the totals when you
                  save and its result is the only authoritative figure.
                </p>
                <div aria-live="polite" data-testid="totals-body">
                  {"totals" in estimate ? (
                    <>
                      <div className="totals-row">
                        <span>Subtotal</span>
                        <span className="num">{formatCurrency(estimate.totals.subtotal, c)}</span>
                      </div>
                      {draft.discount ? (
                        <div className="totals-row">
                          <span>
                            Discount (
                            {draft.discount.kind === "percent"
                              ? `${draft.discount.value}%`
                              : "fixed"}
                            )
                          </span>
                          <span className="num">
                            −{formatCurrency(estimate.totals.discount, c)}
                          </span>
                        </div>
                      ) : null}
                      {draft.taxPercent ? (
                        <div className="totals-row">
                          <span>Tax ({draft.taxPercent}%)</span>
                          <span className="num">+{formatCurrency(estimate.totals.tax, c)}</span>
                        </div>
                      ) : null}
                      <div className="totals-row final">
                        <span>Estimated total ({c})</span>
                        <span className="num">{formatCurrency(estimate.totals.total, c)}</span>
                      </div>
                      {estimate.totals.rounded ? (
                        <Notice kind="warn" role="note" className="mt-12 notice-flush">
                          <strong>Rounding applied.</strong> A figure was rounded half up to the
                          smallest currency unit. The server computes the final amounts; PayPal
                          Sandbox drafting refuses totals that depend on rounding.
                        </Notice>
                      ) : null}
                    </>
                  ) : (
                    <p className="hint">
                      Totals appear once every amount is valid.
                      {estimate.error.includes("exceeds") ? ` ${estimate.error}` : ""}
                    </p>
                  )}
                </div>
                <div className="mt-12" id="paypal-hint">
                  {"totals" in estimate ? (
                    refusal ? (
                      <Notice kind="warn" role="note" className="notice-flush">
                        <strong>PayPal Sandbox draft would be refused.</strong>{" "}
                        {REFUSAL_TEXT[refusal]} You can still save the local draft. The server makes
                        the final decision.
                      </Notice>
                    ) : (
                      <p className="hint">
                        PayPal Sandbox draft: eligible under the exact-mapping rules. The server
                        makes the final decision.
                      </p>
                    )
                  ) : null}
                </div>
                {!real && conflict ? (
                  <Notice kind="err" role="alert" className="mt-12 notice-flush">
                    <strong>Save rejected (HTTP 409).</strong> This Idempotency-Key was already used
                    for a different invoice body, so the server refused it. (Simulated.)
                    <div className="mt-8">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setIdemKey(`${seed.saveKey}-b`);
                          setConflict(false);
                          setKeyRenewed(true);
                          announce("New idempotency key generated");
                        }}
                      >
                        Use a new key and keep my edits
                      </button>
                    </div>
                  </Notice>
                ) : null}
                {state.offline ? (
                  <Notice kind="warn" role="note" className="mt-12 notice-flush">
                    You are offline. Saving is unavailable until the connection returns. Your edits
                    stay on this page.
                  </Notice>
                ) : null}
                <div className="stack-buttons">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    id="save-btn"
                    aria-disabled={saving || uncertain || state.offline ? true : undefined}
                  >
                    {saving ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        Saving draft…
                      </>
                    ) : real ? (
                      "Save draft"
                    ) : (
                      "Save local draft"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => dispatch({ type: "navigate", screen: "composer" })}
                  >
                    Back to composer
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setDiscardOpen(true)}
                  >
                    Discard
                  </button>
                </div>
                {real ? (
                  <p className="hint mt-12" id="save-hint">
                    Saving writes this draft to PostgreSQL (<code>POST /api/invoice-drafts</code>).
                    That is not a PayPal invoice: nothing is sent to PayPal and the customer is not
                    notified.
                  </p>
                ) : (
                  <p className="hint mt-12">
                    Simulated save: nothing is written anywhere. The real save will call{" "}
                    <code>POST /api/invoice-drafts</code> with{" "}
                    <code id="idem-key">Idempotency-Key: {idemKey}</code>. Nothing is sent to
                    PayPal.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </fieldset>
      </form>
      <Dialog
        open={discardOpen}
        title="Discard this invoice?"
        confirmLabel="Discard"
        danger
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          dispatch({ type: "discard-review" });
        }}
      >
        <p>Nothing has been saved yet, so the entered details will be lost.</p>
      </Dialog>
    </section>
  );
}

const CAUSE_TEXT = {
  timeout: "The server did not answer in time.",
  network: "The connection was lost before an answer arrived.",
  server: "The server reported an error.",
  malformed: "The server's answer could not be read.",
} as const;

/** Outcomes of a real save. Every message keeps the operator's edits on the page. */
export function RealSaveNotices({
  ui,
  rs,
  announce,
  onRetry,
}: {
  ui: SaveUi;
  rs: ReturnType<typeof useRealSave>;
  announce: (m: string) => void;
  onRetry: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const attention = ui.status === "conflict" || ui.status === "uncertain" || ui.status === "failed";
  useEffect(() => {
    if (attention) box.current?.focus();
  }, [attention, ui.status]);
  if (!attention) return null;
  return (
    <div ref={box} tabIndex={-1} className="save-outcome">
      <RealSaveNoticeBody ui={ui} rs={rs} announce={announce} onRetry={onRetry} />
    </div>
  );
}

function RealSaveNoticeBody({
  ui,
  rs,
  announce,
  onRetry,
}: {
  ui: SaveUi;
  rs: ReturnType<typeof useRealSave>;
  announce: (m: string) => void;
  onRetry: () => void;
}) {
  if (ui.status === "conflict")
    return (
      <Notice kind="err" role="alert" className="mt-12 notice-flush" id="save-conflict">
        <strong>Save rejected (HTTP 409).</strong> The key for this request was already used for a
        different invoice body, so the server refused it. Your edits are kept.
        <div className="mt-8">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            id="new-key-btn"
            onClick={() => {
              rs.useNewKey();
              announce("New idempotency key ready");
            }}
          >
            Use a new key and keep my edits
          </button>
        </div>
      </Notice>
    );
  if (ui.status === "uncertain")
    return (
      <Notice kind="warn" role="alert" className="mt-12 notice-flush" id="save-uncertain">
        <strong>We could not confirm whether this draft was saved.</strong> {CAUSE_TEXT[ui.cause]}{" "}
        It may or may not exist. Retrying sends the identical request with the same key, so it
        cannot create a duplicate. The form is locked until you decide.
        <div className="mt-8">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            id="retry-save-btn"
            onClick={onRetry}
          >
            Retry the same save
          </button>{" "}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            id="abandon-save-btn"
            onClick={() => {
              rs.abandonUncertain();
              announce("Form unlocked. Saving again may create a second draft.");
            }}
          >
            Edit details and save as a new draft
          </button>
        </div>
        <p className="hint mt-8">
          Choosing the second option accepts that the earlier attempt may exist: saving again can
          create a second draft.
        </p>
      </Notice>
    );
  if (ui.status === "failed")
    return (
      <Notice kind="err" role="alert" className="mt-12 notice-flush" id="save-failed">
        <strong>The draft was not saved.</strong>{" "}
        {ui.reason === "forbidden"
          ? "The server did not accept this request. Reload the page and try again."
          : ui.reason === "invalid-draft"
            ? "The server could not compute exact totals for these amounts."
            : "The server rejected the details."}
        {ui.messages.length > 0 ? (
          <ul>
            {ui.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}{" "}
        Your edits are kept; fix them and save again.
      </Notice>
    );
  return null;
}
