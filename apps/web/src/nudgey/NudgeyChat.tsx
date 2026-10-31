import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { FollowUpView } from "../followups/api.js";
import { describeZone, formatDateOnly, formatInstant } from "../followups/schedule.js";
import type { ListItem } from "../domain/serverList.js";
import { EXAMPLE_QUESTIONS, MAX_PROMPT_CHARS } from "./intent.js";
import { statusLabel, type Failure, type InvoiceGroup, type LookupResult } from "./lookup.js";
import type { ChatMessage } from "./chatSession.js";
import type { ScheduleCandidateState } from "./scheduleCandidate.js";

export const DRAFT_STATE_NOTE =
  "PayPal draft state is not payment status: nothing here says whether an invoice has been paid.";

const FAILURE_TEXT: Record<Failure, string> = {
  offline: "I couldn't reach the server, so I can't show your records right now.",
  unavailable: "The server couldn't answer right now. Nothing was changed; try again in a moment.",
  malformed: "The server's answer wasn't in the expected format, so I didn't show it.",
  forbidden: "The server didn't accept this request. Reload the page and try again.",
  rejected: "The server didn't accept that search. Try rephrasing it.",
};

export function InvoiceCard({ item, onOpen }: { item: ListItem; onOpen: (id: string) => void }) {
  return (
    <li className="chat-card">
      <div className="chat-card-head">
        <strong>{item.customerName}</strong>
        <span className="chat-amount">
          {item.currency} {item.total}
        </span>
      </div>
      <div className="chat-card-meta">
        Invoice due {formatDateOnly(item.dueDate)} · {statusLabel(item.paypalState)}
      </div>
      <button type="button" className="followup-btn" onClick={() => onOpen(item.id)}>
        Open invoice
        <span className="sr-only"> for {item.customerName}</span>
      </button>
    </li>
  );
}

function FollowUpCard({
  f,
  at,
  onOpen,
}: {
  f: FollowUpView;
  at: Date;
  onOpen: (id: string) => void;
}) {
  return (
    <li className={`chat-card chat-card-${f.state}`}>
      <div className="chat-card-head">
        <strong>{f.invoice?.customerName ?? "Invoice"}</strong>
        <span className="followup-state">{f.state === "due" ? "Due" : "Upcoming"}</span>
      </div>
      <div className="chat-card-meta">
        {formatInstant(f.dueAt, f.timezone)} · {describeZone(f.timezone, at)}
      </div>
      {f.note ? <div className="chat-card-meta">Note: {f.note}</div> : null}
      <button type="button" className="followup-btn" onClick={() => onOpen(f.invoiceId)}>
        Open invoice
        <span className="sr-only"> for {f.invoice?.customerName ?? "this follow-up"}</span>
      </button>
    </li>
  );
}

function Group({ g, onOpen }: { g: InvoiceGroup; onOpen: (id: string) => void }) {
  return (
    <section className="chat-group" aria-label={g.label}>
      <h4 className="chat-group-title">
        {g.label}
        {g.failed ? "" : ` (${g.items.length}${g.more ? "+" : ""})`}
      </h4>
      <p className="chat-hint">{g.hint}</p>
      {g.failed ? (
        <p className="followup-error">Could not load this group. {FAILURE_TEXT[g.failed]}</p>
      ) : g.items.length === 0 ? (
        <p className="chat-hint">None.</p>
      ) : (
        <ul className="chat-cards">
          {g.items.map((i) => (
            <InvoiceCard key={i.id} item={i} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {g.more ? (
        <p className="chat-hint">
          Showing up to {g.items.length} records; more exist. Open the dashboard to see them all.
        </p>
      ) : null}
    </section>
  );
}

const displayTime = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  const h = hour! % 12 || 12;
  return `${h}:${String(minute).padStart(2, "0")} ${hour! < 12 ? "AM" : "PM"}`;
};

export function ScheduleCandidateView({
  state,
  at,
  onSelect,
  onReview,
  onRetry,
  onManual,
}: {
  state: ScheduleCandidateState;
  at: Date;
  onSelect: (id: string) => void;
  onReview: () => void;
  onRetry: () => void;
  onManual: () => void;
}) {
  if (state.kind === "idle") return null;
  if (state.kind === "reconfirm")
    return (
      <div className="schedule-candidate" role="group" aria-label="Follow-up proposal needs review">
        <p className="followup-error" role="alert">
          {state.message}
        </p>
        <button type="button" className="followup-btn" onClick={onManual}>
          Schedule manually
        </button>
      </div>
    );
  const proposal = state.proposal;
  return (
    <section className="schedule-candidate" aria-label="Follow-up proposal">
      <h4>Review this follow-up proposal</h4>
      <p className="schedule-candidate-badge">Proposal only — nothing scheduled</p>
      <p className="chat-hint">
        Proposed: {formatDateOnly(proposal.date)} · {displayTime(proposal.time)} ·{" "}
        {proposal.timeZone} (
        {describeZone(proposal.timeZone, at).split(" (")[1]?.replace(/\)$/, "") ??
          proposal.timeZone}
        )
      </p>
      {state.kind === "loading" ? (
        <p className="chat-hint">Searching your saved invoices…</p>
      ) : null}
      {state.kind === "ready" ? (
        <>
          <p className="chat-hint">
            Choose the exact saved invoice. No match is selected automatically.
          </p>
          <ul className="chat-cards schedule-candidate-list">
            {state.items.map((item) => (
              <li key={item.id}>
                <label
                  className={`schedule-candidate-option${state.selectedId === item.id ? " is-selected" : ""}`}
                  aria-label={`${item.customerName}, ${item.currency} ${item.total}, invoice due ${formatDateOnly(item.dueDate)}, ${statusLabel(item.paypalState)}`}
                >
                  <input
                    type="radio"
                    name="nudgey-schedule-candidate"
                    value={item.id}
                    checked={state.selectedId === item.id}
                    onChange={() => onSelect(item.id)}
                  />
                  <span className="schedule-candidate-option-head">
                    <strong>{item.customerName}</strong>
                    <span>
                      {item.currency} {item.total}
                    </span>
                  </span>
                  <span className="chat-card-meta">
                    Invoice due {formatDateOnly(item.dueDate)} · {statusLabel(item.paypalState)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="chat-hint">
            The PayPal draft state is not payment status. This is a local reminder for you.
          </p>
          <div className="followup-buttons">
            <button
              type="button"
              className="followup-btn followup-btn-primary"
              disabled={!state.selectedId}
              onClick={onReview}
            >
              Review in scheduler
            </button>
            <button type="button" className="followup-btn" onClick={onManual}>
              Schedule manually
            </button>
          </div>
        </>
      ) : null}
      {state.kind === "empty" ? (
        <>
          <p>
            No saved invoices matched “{proposal.term}”. Refine the customer name or choose manual
            entry.
          </p>
          <button type="button" className="followup-btn" onClick={onManual}>
            Schedule manually
          </button>
        </>
      ) : null}
      {state.kind === "truncated" ? (
        <>
          <p>
            More than 20 invoices matched “{proposal.term}”. Refine the search so the exact invoice
            can be verified, or choose manual entry.
          </p>
          <button type="button" className="followup-btn" onClick={onManual}>
            Schedule manually
          </button>
        </>
      ) : null}
      {state.kind === "error" ? (
        <>
          <p className="followup-error" role="alert">
            {state.failure === "offline"
              ? "I couldn't reach the server to verify an invoice."
              : state.failure === "forbidden"
                ? "The server did not accept this lookup. Reload and try again."
                : state.failure === "rejected"
                  ? "The server rejected this invoice search. Refine the customer name."
                  : "The invoice lookup could not be completed safely. Try again or use the manual scheduler."}
          </p>
          <div className="followup-buttons">
            <button type="button" className="followup-btn" onClick={onRetry}>
              Try again
            </button>
            <button type="button" className="followup-btn" onClick={onManual}>
              Schedule manually
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function ResultView({
  result,
  at,
  onOpenInvoice,
  onOpenDashboard,
}: {
  result: LookupResult;
  at: Date;
  onOpenInvoice: (id: string) => void;
  onOpenDashboard: () => void;
}) {
  switch (result.kind) {
    case "message":
      return <p className={result.tone === "limit" ? "chat-limit" : undefined}>{result.text}</p>;
    case "error":
      return <p className="followup-error">{FAILURE_TEXT[result.failure]}</p>;
    case "overview": {
      const total = result.groups.reduce((n, g) => n + g.items.length, 0);
      return (
        <div>
          <p>
            Here are your saved invoices grouped by PayPal Sandbox draft state. {DRAFT_STATE_NOTE}
          </p>
          {total === 0 && result.groups.every((g) => !g.failed) ? (
            <p>You have no saved invoices yet.</p>
          ) : null}
          {result.groups.map((g) => (
            <Group key={g.key} g={g} onOpen={onOpenInvoice} />
          ))}
          <button type="button" className="followup-btn" onClick={onOpenDashboard}>
            Open the full dashboard
          </button>
        </div>
      );
    }
    case "invoices":
      return (
        <div>
          <p className="chat-title">{result.title}</p>
          {result.items.length === 0 ? (
            <p>No matching invoices.</p>
          ) : (
            <ul className="chat-cards">
              {result.items.map((i) => (
                <InvoiceCard key={i.id} item={i} onOpen={onOpenInvoice} />
              ))}
            </ul>
          )}
          <p className="chat-hint">{DRAFT_STATE_NOTE}</p>
          {result.more ? (
            <p className="chat-hint">
              Showing up to {result.items.length} matching records; more exist. Open the dashboard
              and filter to see them all.
            </p>
          ) : null}
          {result.more || result.items.length > 0 ? (
            <button type="button" className="followup-btn" onClick={onOpenDashboard}>
              Open the full dashboard
            </button>
          ) : null}
        </div>
      );
    case "followups": {
      const label = result.which === "all" ? "follow-ups" : `${result.which} follow-ups`;
      return (
        <div>
          <p className="chat-title">
            You have {result.counts.due} due and {result.counts.upcoming} upcoming follow-up
            {result.counts.due + result.counts.upcoming === 1 ? "" : "s"}
            {result.limited ? " (the first 100 active are counted)" : ""}.
          </p>
          {result.items.length === 0 ? (
            <p>No {label} right now.</p>
          ) : (
            <ul className="chat-cards">
              {result.items.map((f) => (
                <FollowUpCard key={f.id} f={f} at={at} onOpen={onOpenInvoice} />
              ))}
            </ul>
          )}
          <p className="chat-hint">
            Follow-ups are reminders for you. A due follow-up does not mean an invoice is unpaid,
            and nothing was sent to the customer.
          </p>
        </div>
      );
    }
    case "expired":
    case "aborted":
      return null;
  }
}

export function ChatView({
  messages,
  busy,
  at,
  onAsk,
  onBack,
  onOpenInvoice,
  onOpenDashboard,
  onSchedule,
  onSelectSchedule,
  onReviewSchedule,
  onRetrySchedule,
  onDraftChange,
}: {
  messages: ChatMessage[];
  busy: boolean;
  at: Date;
  onAsk: (text: string) => void;
  onBack: () => void;
  onOpenInvoice: (id: string) => void;
  onOpenDashboard: () => void;
  onSchedule: () => void;
  onSelectSchedule: (id: string) => void;
  onReviewSchedule: () => void;
  onRetrySchedule: () => void;
  onDraftChange: () => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (!log.current) return;
    log.current.scrollTop = log.current.scrollHeight;
    const panel = log.current.closest(".nudgey-panel");
    if (panel instanceof HTMLElement) panel.scrollTop = panel.scrollHeight;
  }, [messages]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onAsk(t);
    setText("");
  };
  return (
    <section className="chat" aria-label="Ask Nudgey">
      <h3 className="followup-form-title">Ask Nudgey</h3>
      <p className="followup-hint">
        Read-only lookups of your own saved invoices and follow-ups. Nothing is sent, changed or
        scheduled from here.
      </p>
      <div className="chat-chips" role="group" aria-label="Example questions">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button key={q} type="button" className="chat-chip" onClick={() => onAsk(q)}>
            {q}
          </button>
        ))}
        <button type="button" className="chat-chip" onClick={onSchedule}>
          Schedule a follow-up
        </button>
      </div>
      <div
        ref={log}
        className="chat-log"
        role="log"
        aria-live="off"
        aria-label="Conversation with Nudgey"
      >
        {messages.length === 0 ? (
          <p className="chat-hint">Ask a question or pick an example above.</p>
        ) : null}
        {messages.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="chat-msg chat-user">
              <span className="sr-only">You: </span>
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="chat-msg chat-bot" aria-busy={m.pending ? true : undefined}>
              <span className="sr-only">Nudgey: </span>
              {m.pending ? <p className="chat-hint">Looking that up…</p> : null}
              {m.text ? <p>{m.text}</p> : null}
              {m.result ? (
                <ResultView
                  result={m.result}
                  at={at}
                  onOpenInvoice={onOpenInvoice}
                  onOpenDashboard={onOpenDashboard}
                />
              ) : null}
              {m.schedule ? (
                <ScheduleCandidateView
                  state={m.schedule}
                  at={at}
                  onSelect={onSelectSchedule}
                  onReview={onReviewSchedule}
                  onRetry={onRetrySchedule}
                  onManual={onSchedule}
                />
              ) : null}
            </div>
          ),
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <label htmlFor={inputId}>Ask Nudgey a question</label>
        <input
          ref={input}
          id={inputId}
          type="text"
          autoComplete="off"
          maxLength={MAX_PROMPT_CHARS}
          value={text}
          onChange={(e) => {
            if (e.target.value.trim()) onDraftChange();
            setText(e.target.value);
          }}
          placeholder="What are my pending invoices?"
        />
        <div className="followup-buttons">
          <button
            type="submit"
            className="followup-btn followup-btn-primary"
            disabled={!text.trim()}
          >
            {busy ? "Ask (replaces the current lookup)" : "Ask"}
          </button>
          <button type="button" className="followup-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </section>
  );
}
