import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "../components/Badge.js";
import { Spinner } from "../components/Spinner.js";
import { useApp } from "../demo/AppContext.js";
import type { ListItem } from "../domain/serverList.js";
import { formatDateOnly } from "../followups/schedule.js";
import {
  NUDGE_TONES,
  type GenerateOutcome,
  type NudgeItem,
  type NudgeTone,
  type PendingRef,
} from "../nudges/api.js";
import { TONE_LABEL, generateFailureText } from "../nudges/format.js";

export const NUDGE_CANDIDATE_PAGE = 20;
const PREVIEW_CHARS = 180;

type Phase =
  | { kind: "searching" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "truncated" }
  | { kind: "choose"; items: ListItem[] }
  | { kind: "drafting"; items: ListItem[] }
  | { kind: "pending-exists"; items: ListItem[]; pending: PendingRef }
  | {
      kind: "failed";
      items: ListItem[];
      outcome: Exclude<
        GenerateOutcome,
        { kind: "ok" } | { kind: "pending-exists" } | { kind: "aborted" }
      >;
    }
  | { kind: "done"; nudge: NudgeItem; customer: string }
  | { kind: "cancelled" };

const preview = (t: string) =>
  t.length > PREVIEW_CHARS ? `${t.slice(0, PREVIEW_CHARS).trimEnd()}…` : t;

/**
 * One proposed nudge draft inside the Nudgey conversation (approved D7). It searches the operator's OWN saved
 * invoices with the existing owner-scoped lookup, requires the exact invoice to be chosen (only a single match is
 * preselected) and an explicit confirmation before the ONE costed AI call. The result goes to the queue as
 * "Pending review". Nothing is sent, scheduled or dispatched.
 */
export function NudgeDraftFlow({
  request,
  onOpenQueue,
}: {
  request: { tone: NudgeTone | null; term: string };
  onOpenQueue: (id: string | null) => void;
}) {
  const { session, announce } = useApp();
  const listInvoices = session?.listInvoices;
  const nudges = session?.nudges;
  const expired = session?.sessionExpired;
  const name = useId();
  const toneId = useId();
  const [tone, setTone] = useState<NudgeTone>(request.tone ?? "professional");
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "searching" });
  const [tick, setTick] = useState(0);
  const work = useRef<AbortController | null>(null);
  useEffect(() => () => work.current?.abort(), []);

  useEffect(() => {
    if (!listInvoices || !nudges) {
      setPhase({ kind: "unavailable" });
      return;
    }
    const ac = new AbortController();
    setPhase({ kind: "searching" });
    void listInvoices(
      { limit: NUDGE_CANDIDATE_PAGE, cursor: null, currency: null, status: null, q: request.term },
      ac.signal,
    ).then((r) => {
      // P6-AUD-03: a received 401 ends the session even if this lookup was cancelled meanwhile.
      if (r.kind === "unauthorized") {
        expired?.();
        return;
      }
      if (ac.signal.aborted || r.kind === "aborted") return;
      if (r.kind !== "ok") setPhase({ kind: "error" });
      else if (r.page.nextCursor !== null) setPhase({ kind: "truncated" });
      else if (r.page.items.length === 0) setPhase({ kind: "empty" });
      else {
        setSelected(r.page.items.length === 1 ? r.page.items[0]!.id : null);
        setPhase({ kind: "choose", items: r.page.items });
        announce(
          r.page.items.length === 1
            ? "Found 1 matching invoice. Confirm to draft a nudge."
            : `Found ${r.page.items.length} matching invoices. Choose one, then confirm.`,
        );
      }
    });
    return () => ac.abort();
  }, [listInvoices, nudges, expired, request.term, tick, announce]);

  const items =
    phase.kind === "choose" ||
    phase.kind === "drafting" ||
    phase.kind === "pending-exists" ||
    phase.kind === "failed"
      ? phase.items
      : [];
  const chosen = items.find((i) => i.id === selected) ?? null;

  const draft = async (replace: PendingRef | null) => {
    if (!nudges || !chosen) return;
    work.current?.abort();
    const ac = new AbortController();
    work.current = ac;
    setPhase({ kind: "drafting", items });
    const r = await nudges.generate(chosen.id, tone, replace, ac.signal);
    if (ac.signal.aborted || r.kind === "aborted" || r.kind === "unauthorized") return;
    if (r.kind === "ok") {
      setPhase({ kind: "done", nudge: r.nudge, customer: chosen.customerName });
      announce("Draft ready for review in your Nudge queue. Nothing was sent.");
    } else if (r.kind === "pending-exists") {
      setPhase({ kind: "pending-exists", items, pending: r.pending });
      announce("This invoice already has a draft waiting for review.");
    } else {
      setPhase({ kind: "failed", items, outcome: r });
      const f = generateFailureText(r);
      announce(`${f.title} ${f.body}`);
    }
  };

  if (phase.kind === "unavailable")
    return <p>I can't draft nudges right now. Open a saved invoice and use AI payment nudge.</p>;
  if (phase.kind === "searching")
    return (
      <p className="chat-hint" role="status">
        <Spinner /> Looking for your saved invoices matching “{request.term}”…
      </p>
    );
  if (phase.kind === "error")
    return (
      <div>
        <p className="followup-error" role="alert">
          I couldn't search your saved invoices right now. Nothing was drafted.
        </p>
        <button type="button" className="followup-btn" onClick={() => setTick((t) => t + 1)}>
          Try again
        </button>
      </div>
    );
  if (phase.kind === "empty")
    return (
      <p>No saved invoices matched “{request.term}”. Check the customer name and ask again.</p>
    );
  if (phase.kind === "truncated")
    return (
      <p>
        More than {NUDGE_CANDIDATE_PAGE} invoices matched “{request.term}”. Use a more specific
        customer name so the exact invoice can be chosen.
      </p>
    );
  if (phase.kind === "cancelled") return <p>Okay — nothing was drafted.</p>;
  if (phase.kind === "done")
    return (
      <section className="nq-chat" aria-label="Draft ready for review">
        <p className="chat-title">Draft ready for review</p>
        <blockquote className="nq-quote">{preview(phase.nudge.message)}</blockquote>
        <p className="chat-hint">
          <Badge kind="info">Pending review</Badge> in your Nudge queue for {phase.customer}.
          Approve it there; copying and sending it is up to you. Nothing was sent.
        </p>
        <div className="followup-buttons">
          <button
            type="button"
            className="followup-btn followup-btn-primary"
            onClick={() => onOpenQueue(phase.nudge.id)}
          >
            Open in queue
          </button>
        </div>
      </section>
    );

  const drafting = phase.kind === "drafting";
  const failure = phase.kind === "failed" ? generateFailureText(phase.outcome) : null;
  return (
    <section className="nq-chat" aria-label="Nudge draft proposal">
      <p className="chat-title">
        {items.length === 1
          ? "I found 1 matching invoice"
          : `I found ${items.length} matching invoices — choose one`}
      </p>
      <ul className="chat-cards schedule-candidate-list">
        {items.map((item) => (
          <li key={item.id}>
            <label
              className={`schedule-candidate-option${selected === item.id ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={item.id}
                checked={selected === item.id}
                disabled={drafting}
                onChange={() => setSelected(item.id)}
              />
              <span className="schedule-candidate-option-head">
                <strong>{item.customerName}</strong>
                <span>
                  {item.currency} {item.total}
                </span>
              </span>
              <span className="chat-card-meta">Invoice due {formatDateOnly(item.dueDate)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="nq-chat-tone">
        <label htmlFor={toneId}>Tone</label>
        <select
          id={toneId}
          className="select nq-tone-select"
          value={tone}
          disabled={drafting}
          onChange={(e) => setTone(e.target.value as NudgeTone)}
        >
          {NUDGE_TONES.map((t) => (
            <option key={t} value={t}>
              {TONE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      {phase.kind === "pending-exists" ? (
        <>
          <p className="chat-hint" role="status">
            This invoice already has a draft waiting for review. Drafting again replaces it (the old
            one moves to History) and makes one AI call.
          </p>
          <div className="followup-buttons">
            <button
              type="button"
              className="followup-btn followup-btn-primary"
              onClick={() => void draft(phase.pending)}
            >
              Replace with a new {TONE_LABEL[tone].toLowerCase()} draft
            </button>
            <button
              type="button"
              className="followup-btn"
              onClick={() => onOpenQueue(phase.pending.id)}
            >
              Open existing in queue
            </button>
            <button
              type="button"
              className="followup-btn"
              onClick={() => setPhase({ kind: "cancelled" })}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="chat-hint">
            {chosen
              ? `Draft a ${TONE_LABEL[tone].toLowerCase()} nudge for ${chosen.customerName}? This makes one AI call. It goes to your queue for review — nothing is sent.`
              : "Choose the exact saved invoice first. No match is selected for you."}
          </p>
          {failure ? (
            <p className={failure.kind === "err" ? "followup-error" : "chat-hint"} role="alert">
              <strong>{failure.title}</strong> {failure.body}
            </p>
          ) : null}
          {drafting ? (
            <p className="chat-hint" role="status">
              <Spinner /> Drafting… this usually takes a few seconds.
            </p>
          ) : null}
          <div className="followup-buttons">
            <button
              type="button"
              className="followup-btn followup-btn-primary"
              disabled={!chosen || drafting}
              onClick={() => void draft(null)}
            >
              Draft {TONE_LABEL[tone].toLowerCase()} nudge
            </button>
            <button
              type="button"
              className="followup-btn"
              disabled={drafting}
              onClick={() => setPhase({ kind: "cancelled" })}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}
