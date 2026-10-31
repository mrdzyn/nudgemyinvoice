import { useEffect, useId, useRef, useState } from "react";
import type { ListItem } from "../domain/serverList.js";
import { statusLabel } from "../features/dashboard/invoiceGridSort.js";
import { formatDateOnly } from "../followups/schedule.js";
import {
  STATUS_MAX_TERM,
  STATUS_PAGE,
  type StatusFailure,
  type StatusState,
} from "./statusLookup.js";

export const DRAFT_ONLY_NOTE =
  "This is the state of the PayPal Sandbox draft only. It does not show whether an invoice has been sent, paid, unpaid, overdue or settled.";

const FAILURE_TEXT: Record<StatusFailure, string> = {
  offline: "I couldn't reach the server, so I can't show your invoices right now.",
  unavailable: "The server couldn't load your invoices right now. Nothing was changed.",
  malformed: "The server's answer wasn't in the expected format, so I didn't show it.",
  forbidden: "The server didn't accept this request. Reload the page and try again.",
  rejected: "The server didn't accept that search. Try different words.",
};

export const SEARCH_DEBOUNCE_MS = 250;

function Option({
  item,
  selected,
  onSelect,
}: {
  item: ListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button type="button" className="status-option" aria-pressed={selected} onClick={onSelect}>
        <span className="status-option-head">
          <strong>{item.customerName}</strong>
          <span className="chat-amount">
            {item.currency} {item.total}
          </span>
        </span>
        <span className="status-option-meta">
          Invoice due {formatDateOnly(item.dueDate)} ·{" "}
          <strong>{statusLabel(item.paypalState)}</strong>
        </span>
      </button>
    </li>
  );
}

export function StatusPicker({
  state,
  onSearch,
  onTermChange,
  onSelect,
  onRetry,
  onOpen,
  onBack,
  onCreate,
}: {
  state: StatusState;
  /** Called on entry (empty term) and, debounced, as the operator types. */
  onSearch: (term: string) => void;
  /** Immediately clears old selectable results before the debounce schedules the next request. */
  onTermChange: (term: string) => void;
  onSelect: (id: string | null) => void;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
  onCreate: () => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const first = useRef(true);
  useEffect(() => {
    input.current?.focus();
  }, []);
  // The first load is immediate; later keystrokes wait for a short pause so each request is deliberate.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      onSearch("");
      return;
    }
    const t = setTimeout(() => onSearch(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // onSearch is a stable callback from the owner of the lookup.
  }, [text]);

  const selected = state.items.find((i) => i.id === state.selectedId) ?? null;
  const searching = state.term !== "";
  return (
    <section className="status-picker" aria-label="Check invoice status">
      <h3 className="followup-form-title">Check invoice status</h3>
      <p className="followup-hint">
        Pick a saved invoice to see its PayPal Sandbox draft state. {DRAFT_ONLY_NOTE}
      </p>
      <label htmlFor={inputId}>Search your invoices</label>
      <input
        ref={input}
        id={inputId}
        type="search"
        autoComplete="off"
        maxLength={STATUS_MAX_TERM}
        placeholder="Customer name or email"
        value={text}
        onChange={(e) => {
          onTermChange(e.target.value);
          setText(e.target.value);
        }}
      />
      <div className="status-results" aria-busy={state.phase === "loading" ? true : undefined}>
        {state.phase === "idle" || (state.phase === "loading" && state.items.length === 0) ? (
          <p className="chat-hint" role="status">
            Loading your invoices…
          </p>
        ) : null}
        {state.phase === "error" && state.failure ? (
          <div role="alert">
            <p className="followup-error">{FAILURE_TEXT[state.failure]}</p>
            <button type="button" className="followup-btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : null}
        {state.invalidTerm ? (
          <p className="followup-error" role="alert">
            That search can't be used: keep it under {STATUS_MAX_TERM} characters without tabs or
            line breaks.
          </p>
        ) : null}
        {state.phase === "ready" && !state.invalidTerm && state.items.length === 0 ? (
          searching ? (
            <p role="status">No saved invoices match “{state.term}”.</p>
          ) : (
            <div role="status">
              <p>You have no saved invoices yet.</p>
              <button type="button" className="followup-btn" onClick={onCreate}>
                Create an invoice
              </button>
            </div>
          )
        ) : null}
        {state.items.length > 0 ? (
          <>
            <p className="chat-hint" role="status">
              Showing {state.items.length} invoice{state.items.length === 1 ? "" : "s"}
              {searching ? ` matching “${state.term}”` : ""}.
              {state.more
                ? ` This is only the first ${STATUS_PAGE}; search by customer to narrow it down, or open the dashboard for the rest.`
                : ""}
            </p>
            <ul className="status-list" aria-label="Your invoices">
              {state.items.map((i) => (
                <Option
                  key={i.id}
                  item={i}
                  selected={i.id === state.selectedId}
                  onSelect={() => onSelect(i.id === state.selectedId ? null : i.id)}
                />
              ))}
            </ul>
          </>
        ) : null}
      </div>
      {selected ? (
        <div className="status-selected" role="group" aria-label="Selected invoice">
          <p>
            <strong>{selected.customerName}</strong> · {selected.currency} {selected.total}
          </p>
          <p>
            PayPal Sandbox draft: <strong>{statusLabel(selected.paypalState)}</strong>
          </p>
          <p className="chat-hint">{DRAFT_ONLY_NOTE}</p>
          <button
            type="button"
            className="followup-btn followup-btn-primary"
            onClick={() => onOpen(selected.id)}
          >
            Open invoice details
            <span className="sr-only"> for {selected.customerName}</span>
          </button>
        </div>
      ) : state.items.length > 0 ? (
        <p className="chat-hint">Select an invoice to see its draft state and open its details.</p>
      ) : null}
      <div className="followup-buttons">
        <button type="button" className="followup-btn" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
