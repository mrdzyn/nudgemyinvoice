import { useId, useState, type FormEvent } from "react";
import type { FollowUpView, ForInvoiceOutcome } from "./api.js";
import type { FollowUpsSnapshot } from "./controller.js";
import {
  MAX_MESSAGE,
  MAX_NOTE,
  buildFollowUpMessage,
  checkSchedule,
  defaultFollowUpFields,
  describeZone,
  formatInstant,
  toLocalFields,
} from "./schedule.js";

/** A saved invoice the operator can pick, with just the facts needed to draft a message. */
export interface InvoiceOption {
  id: string;
  customerName: string;
  currency: string;
  total: string;
  dueDate: string;
}

export const LOCAL_ONLY_COPY =
  "This is a reminder for you inside NudgeMyInvoice. Nothing is sent to the customer, PayPal is not contacted, and no payment status is assumed.";

const optionLabel = (o: InvoiceOption) =>
  `${o.customerName} · ${o.currency} ${o.total} · due ${o.dueDate}`;

function currentBrowserZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return null;
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return zone;
  } catch {
    return null;
  }
}

/** Due / Upcoming counts as read from the server. Never a local guess. */
export function FollowUpSummary({ snap }: { snap: FollowUpsSnapshot }) {
  if (snap.status === "idle" || (snap.status === "loading" && snap.serverNow === null))
    return <p className="followup-summary">Loading your follow-ups…</p>;
  if (snap.status === "error")
    return (
      <p className="followup-summary followup-error" role="alert">
        Follow-ups could not be loaded (
        {snap.error === "offline" ? "offline" : "server unavailable"}).
      </p>
    );
  return (
    <p className="followup-summary">
      <span className="followup-count followup-count-due">
        <strong>{snap.counts.due}</strong> Due
      </span>
      <span className="followup-count">
        <strong>{snap.counts.upcoming}</strong> Upcoming
      </span>
    </p>
  );
}

export function FollowUpList({
  items,
  busyId,
  onComplete,
  onReschedule,
  onCancel,
  onOpen,
  at,
}: {
  items: FollowUpView[];
  busyId: string | null;
  onComplete: (f: FollowUpView) => void;
  onReschedule: (f: FollowUpView) => void;
  onCancel: (f: FollowUpView) => void;
  onOpen: (f: FollowUpView) => void;
  at: Date;
}) {
  if (items.length === 0)
    return (
      <p className="followup-empty">
        No follow-ups scheduled yet. Pick a saved invoice and a time to add one.
      </p>
    );
  const group = (state: "due" | "upcoming", title: string) => {
    const rows = items.filter((i) => i.state === state);
    if (rows.length === 0) return null;
    return (
      <section aria-label={title} className="followup-group">
        <h3 className="followup-group-title">
          {title} ({rows.length})
        </h3>
        <ul className="followup-items">
          {rows.map((f) => (
            <li key={f.id} className={`followup-item followup-${state}`}>
              <div className="followup-item-head">
                <strong>{f.invoice?.customerName ?? "Invoice"}</strong>
                <span className="followup-state">{state === "due" ? "Due" : "Upcoming"}</span>
              </div>
              <div className="followup-when">
                {formatInstant(f.dueAt, f.timezone)}
                <small> · {describeZone(f.timezone, at)}</small>
              </div>
              {f.invoice ? (
                <div className="followup-inv">
                  {f.invoice.currency} {f.invoice.total} · invoice due {f.invoice.dueDate}
                </div>
              ) : null}
              {f.note ? <div className="followup-note">Note: {f.note}</div> : null}
              <div className="followup-buttons">
                <button
                  type="button"
                  className="followup-btn"
                  disabled={busyId === f.id}
                  onClick={() => onOpen(f)}
                >
                  Open invoice
                </button>
                <button
                  type="button"
                  className="followup-btn"
                  disabled={busyId === f.id}
                  onClick={() => onComplete(f)}
                >
                  Mark complete
                </button>
                <button
                  type="button"
                  className="followup-btn"
                  disabled={busyId === f.id}
                  onClick={() => onReschedule(f)}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  className="followup-btn followup-btn-danger"
                  disabled={busyId === f.id}
                  onClick={() => onCancel(f)}
                >
                  Cancel
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  };
  return (
    <div className="followup-lists">
      {group("due", "Due")}
      {group("upcoming", "Upcoming")}
    </div>
  );
}

export interface ScheduleSubmit {
  invoiceId: string;
  dueAt: string;
  timezone: string;
  note: string | null;
  message: string;
}

/** Schedule a new follow-up, or reschedule one (the invoice is then fixed). */
export function ScheduleForm({
  mode,
  invoices,
  invoicesStatus,
  initial,
  prefill,
  busy,
  error,
  now,
  timeZone,
  onSubmit,
  onBack,
}: {
  mode: "create" | "reschedule";
  invoices: InvoiceOption[];
  invoicesStatus: "loading" | "ready" | "error";
  initial?: {
    invoiceId: string;
    dueAt: string;
    note: string | null;
    message: string;
    timezone: string;
  };
  /** A reviewed, explicit candidate proposal from Ask Nudgey; never a saved schedule. */
  prefill?: {
    invoiceId: string;
    date: string;
    time: string;
    timeZone: string;
    message: string;
  };
  busy: boolean;
  error: string | null;
  now: Date;
  /** The browser's own zone: every time typed here is in this zone. */
  timeZone: string;
  onSubmit: (s: ScheduleSubmit) => void;
  onBack: () => void;
}) {
  const ids = {
    inv: useId(),
    date: useId(),
    time: useId(),
    note: useId(),
    msg: useId(),
    tz: useId(),
  };
  const start = initial ? toLocalFields(new Date(initial.dueAt)) : defaultFollowUpFields(now);
  const [invoiceId, setInvoiceId] = useState(initial?.invoiceId ?? prefill?.invoiceId ?? "");
  const [date, setDate] = useState(prefill?.date ?? start.date);
  const [time, setTime] = useState(prefill?.time ?? start.time);
  const [note, setNote] = useState(initial?.note ?? "");
  const [message, setMessage] = useState(initial?.message ?? prefill?.message ?? "");
  const [edited, setEdited] = useState(Boolean(initial));
  const [confirmedZone, setConfirmedZone] = useState(prefill?.timeZone ?? timeZone);
  const currentZone = currentBrowserZone();
  const [local, setLocal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const suggest = (id: string) => {
    const o = invoices.find((x) => x.id === id);
    return o
      ? buildFollowUpMessage({
          customerName: o.customerName,
          currency: o.currency,
          total: o.total,
          dueDate: o.dueDate,
        })
      : "";
  };
  const pick = (id: string) => {
    setInvoiceId(id);
    if (!edited) setMessage(suggest(id));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!invoiceId) return setLocal("Choose a saved invoice.");
    const liveZone = currentBrowserZone();
    if (prefill && !liveZone)
      return setLocal("I can't verify the current browser time zone. Nothing was saved.");
    if (prefill && confirmedZone !== liveZone) {
      return setLocal(
        `Your time zone changed. Review the date and time in ${liveZone}, then choose Save follow-up again.`,
      );
    }
    const c = checkSchedule({ date, time, note, message }, new Date());
    if (!c.ok) return setLocal(c.error);
    setLocal(null);
    onSubmit({
      invoiceId,
      dueAt: c.dueAt,
      timezone: liveZone ?? timeZone,
      note: c.note,
      message: c.message,
    });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const shown = local ?? error;
  const zoneChanged = Boolean(prefill && currentZone && confirmedZone !== currentZone);
  return (
    <form
      className="followup-form"
      onSubmit={submit}
      noValidate
      aria-label={mode === "create" ? "Schedule a follow-up" : "Reschedule follow-up"}
    >
      <h3 className="followup-form-title">
        {mode === "create" ? "Schedule a follow-up" : "Reschedule follow-up"}
      </h3>
      {prefill ? (
        <>
          <p className="followup-hint" role="status">
            Proposed from your question. Review and edit every field; nothing is scheduled until you
            choose Save follow-up.
          </p>
          {zoneChanged ? (
            <div className="followup-error" role="alert">
              Your time zone changed from {prefill.timeZone}. Confirm the proposed date and time in{" "}
              {currentZone ?? timeZone} before saving.
              <button
                type="button"
                className="followup-btn"
                onClick={() => {
                  const liveZone = currentBrowserZone();
                  if (liveZone) setConfirmedZone(liveZone);
                }}
              >
                Confirm date and time
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      <p className="followup-hint">{LOCAL_ONLY_COPY}</p>
      <label htmlFor={ids.inv}>Saved invoice</label>
      {mode === "create" ? (
        <select
          id={ids.inv}
          value={invoiceId}
          onChange={(e) => pick(e.target.value)}
          disabled={busy || invoicesStatus !== "ready"}
        >
          <option value="">
            {invoicesStatus === "loading"
              ? "Loading your invoices…"
              : invoicesStatus === "error"
                ? "Could not load invoices"
                : invoices.length
                  ? "Choose an invoice…"
                  : "No saved invoices yet"}
          </option>
          {invoices.map((o) => (
            <option key={o.id} value={o.id}>
              {optionLabel(o)}
            </option>
          ))}
        </select>
      ) : (
        <p id={ids.inv} className="followup-fixed">
          {invoices.find((o) => o.id === invoiceId)?.customerName ?? "This invoice"}
        </p>
      )}
      <div className="followup-row">
        <div>
          <label htmlFor={ids.date}>Date</label>
          <input
            id={ids.date}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div>
          <label htmlFor={ids.time}>Time</label>
          <input
            id={ids.time}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={busy}
            required
          />
        </div>
      </div>
      <p id={ids.tz} className="followup-tz">
        Your time zone: <strong>{describeZone(timeZone, now)}</strong>. The exact moment is saved in
        UTC.
      </p>
      <label htmlFor={ids.note}>Note (optional)</label>
      <input
        id={ids.note}
        type="text"
        maxLength={MAX_NOTE}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
      />
      <label htmlFor={ids.msg}>Follow-up message (editable draft)</label>
      <textarea
        id={ids.msg}
        rows={7}
        maxLength={MAX_MESSAGE}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setEdited(true);
        }}
        disabled={busy}
      />
      <div className="followup-buttons">
        <button
          type="button"
          className="followup-btn"
          onClick={() => {
            setMessage(suggest(invoiceId));
            setEdited(false);
          }}
          disabled={busy || !invoiceId}
        >
          Use suggested message
        </button>
        <button
          type="button"
          className="followup-btn"
          onClick={() => void copy()}
          disabled={!message}
        >
          Copy message
        </button>
      </div>
      {copied ? (
        <p className="followup-hint" role="status">
          Copied to your clipboard. Nothing was sent.
        </p>
      ) : null}
      {shown ? (
        <p className="followup-error" role="alert">
          {shown}
        </p>
      ) : null}
      <div className="followup-buttons">
        <button
          type="submit"
          className="followup-btn followup-btn-primary"
          disabled={busy || zoneChanged}
        >
          {busy ? "Saving…" : mode === "create" ? "Save follow-up" : "Save new time"}
        </button>
        <button type="button" className="followup-btn" onClick={onBack} disabled={busy}>
          Back
        </button>
      </div>
    </form>
  );
}

export type InvoiceFollowUpLoad = { status: "loading" } | ({ status: "done" } & ForInvoiceOutcome);

/** Read-only card on the saved-invoice page. */
export function InvoiceFollowUpCard({ load, at }: { load: InvoiceFollowUpLoad; at: Date }) {
  return (
    <section
      className="card followup-card"
      aria-labelledby="followup-card-title"
      id="followup-card"
    >
      <h2 className="card-title" id="followup-card-title">
        Follow-up reminder
      </h2>
      {load.status === "loading" ? <p>Loading the follow-up from the server…</p> : null}
      {load.status === "done" && load.kind !== "ok" ? (
        <p className="followup-error" role="alert">
          {load.kind === "offline"
            ? "Could not reach the server to load the follow-up."
            : "The follow-up could not be loaded right now."}
        </p>
      ) : null}
      {load.status === "done" && load.kind === "ok" ? (
        <>
          {load.active ? (
            <div className={`followup-item followup-${load.active.state}`}>
              <div className="followup-item-head">
                <strong>
                  {load.active.state === "due" ? "Follow-up due" : "Follow-up scheduled"}
                </strong>
                <span className="followup-state">
                  {load.active.state === "due" ? "Due" : "Upcoming"}
                </span>
              </div>
              <div className="followup-when">
                {formatInstant(load.active.dueAt, load.active.timezone)}
                <small> · {describeZone(load.active.timezone, at)}</small>
              </div>
              {load.active.note ? (
                <div className="followup-note">Note: {load.active.note}</div>
              ) : null}
              <pre className="followup-message">{load.active.message}</pre>
            </div>
          ) : (
            <p>
              No follow-up is scheduled for this invoice. Use Nudgey, then Schedule a follow-up.
            </p>
          )}
          {load.recent.length ? (
            <ul className="followup-history" aria-label="Earlier follow-ups">
              {load.recent.map((f) => (
                <li key={f.id}>
                  {f.status === "completed" ? "Completed" : "Canceled"} · was set for{" "}
                  {formatInstant(f.dueAt, f.timezone)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <p className="hint mt-8">{LOCAL_ONLY_COPY}</p>
    </section>
  );
}
