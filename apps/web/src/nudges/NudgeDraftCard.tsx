import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Notice } from "../components/Notice.js";
import { Spinner } from "../components/Spinner.js";
import { useApp } from "../demo/AppContext.js";
import { NUDGE_TONES, type GenerateOutcome, type NudgeTone, type PendingRef } from "./api.js";
import type { NudgesController } from "./controller.js";
import { TONE_HINT, TONE_LABEL, generateFailureText } from "./format.js";

type Existing =
  { status: "loading" } | { status: "ok"; pending: PendingRef | null } | { status: "error" };
type Result =
  | null
  | { kind: "created"; id: string; tone: NudgeTone }
  | {
      kind: "failed";
      outcome: Exclude<
        GenerateOutcome,
        { kind: "ok" } | { kind: "pending-exists" } | { kind: "aborted" }
      >;
    };

/**
 * "AI payment nudge" on a saved invoice: choose a tone and draft ONE nudge (one costed AI call, only on click).
 * The draft goes to the queue for review; nothing is sent.
 */
export function NudgeDraftCard({
  invoiceId,
  controller,
}: {
  invoiceId: string;
  controller: Pick<NudgesController, "subscribe" | "getSnapshot" | "list" | "generate" | "refresh">;
}) {
  const { dispatch, announce } = useApp();
  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const name = useId();
  const [tone, setTone] = useState<NudgeTone>("professional");
  const [existing, setExisting] = useState<Existing>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const work = useRef<AbortController | null>(null);
  useEffect(() => () => work.current?.abort(), []);

  useEffect(() => {
    void controller.refresh();
  }, [controller]);
  useEffect(() => {
    const ac = new AbortController();
    void controller.list("pending", invoiceId, ac.signal).then((r) => {
      if (ac.signal.aborted || r.kind === "aborted" || r.kind === "unauthorized") return;
      if (r.kind !== "ok") setExisting({ status: "error" });
      else {
        const p = r.items[0];
        setExisting({ status: "ok", pending: p ? { id: p.id, version: p.version } : null });
      }
    });
    return () => ac.abort();
  }, [controller, invoiceId, snap.version]);

  const pending = existing.status === "ok" ? existing.pending : null;
  const aiOff = snap.status === "ok" && !snap.aiAvailable;

  const draft = async (replace: PendingRef | null) => {
    work.current?.abort();
    const ac = new AbortController();
    work.current = ac;
    setBusy(true);
    setResult(null);
    const r = await controller.generate(invoiceId, tone, replace, ac.signal);
    if (ac.signal.aborted || r.kind === "aborted") return;
    setBusy(false);
    if (r.kind === "unauthorized") return;
    if (r.kind === "ok") {
      setResult({ kind: "created", id: r.nudge.id, tone: r.nudge.tone });
      setExisting({ status: "ok", pending: { id: r.nudge.id, version: r.nudge.version } });
      announce("Draft ready for review in your Nudge queue. Nothing was sent.");
      return;
    }
    if (r.kind === "pending-exists") {
      setExisting({ status: "ok", pending: r.pending });
      announce("This invoice already has a draft waiting for review.");
      return;
    }
    // The server reports the CURRENT pending draft on a conflict, so the next replace names the right one.
    if (r.kind === "version-conflict") setExisting({ status: "ok", pending: r.pending });
    setResult({ kind: "failed", outcome: r });
    const f = generateFailureText(r);
    announce(`${f.title} ${f.body}`);
  };

  const failure = result?.kind === "failed" ? generateFailureText(result.outcome) : null;
  return (
    <section className="card nq-draft" aria-labelledby="nq-draft-title" aria-busy={busy}>
      <h2 className="card-title mb-0" id="nq-draft-title">
        AI payment nudge
      </h2>
      <p className="hint nq-tight">
        Draft a follow-up for this invoice. You review and approve it; nothing is sent.
      </p>
      <fieldset className="plain-fieldset nq-tones" disabled={busy}>
        <legend className="label-strong">Tone</legend>
        {NUDGE_TONES.map((t) => (
          <label key={t} className="nq-tone">
            <input
              type="radio"
              name={name}
              value={t}
              checked={tone === t}
              onChange={() => setTone(t)}
            />
            <span>
              <strong>{TONE_LABEL[t]}</strong>
              <span className="cell-sub">{TONE_HINT[t]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Notice kind="info" role="note" className="notice-compact">
        <strong>Privacy:</strong> the AI receives only the tone, the currency code and where today
        falls relative to the due date — not the customer's name, e-mail, items, amount or dates.
        Those are filled in from your saved invoice afterwards.
      </Notice>
      {aiOff ? (
        <Notice kind="warn" role="status" className="notice-compact" id="nq-draft-ai-off">
          <strong>AI drafting isn't available on this server.</strong> Existing drafts can still be
          reviewed, approved and copied in the Nudge queue.
        </Notice>
      ) : null}
      {busy ? (
        <p role="status" className="nq-busy">
          <Spinner /> Drafting a {TONE_LABEL[tone].toLowerCase()} nudge… this usually takes a few
          seconds.
        </p>
      ) : null}
      {result?.kind === "created" ? (
        <Notice kind="ok" role="status" className="notice-compact" id="nq-draft-created">
          <strong>Draft ready for review.</strong> It's in your Nudge queue as Pending review.
          Nothing was sent.
          <div className="mt-8">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => dispatch({ type: "open-nudges", view: "pending", id: result.id })}
            >
              Open in queue
            </button>
          </div>
        </Notice>
      ) : pending && !busy ? (
        <Notice kind="info" role="status" className="notice-compact" id="nq-draft-pending">
          <strong>This invoice already has a draft waiting for review.</strong> Drafting again
          replaces it (the old one moves to History).
          <div className="mt-8 nq-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={aiOff}
              onClick={() => void draft(pending)}
            >
              Replace with a new {TONE_LABEL[tone].toLowerCase()} draft
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => dispatch({ type: "open-nudges", view: "pending", id: pending.id })}
            >
              Review existing
            </button>
          </div>
        </Notice>
      ) : null}
      {failure ? (
        <Notice
          kind={failure.kind}
          role={failure.kind === "err" ? "alert" : "status"}
          className="notice-compact"
          id="nq-draft-failed"
        >
          <strong>{failure.title}</strong> {failure.body}
        </Notice>
      ) : null}
      {existing.status === "error" ? (
        <p className="hint" role="status">
          Couldn't check for an existing draft; drafting will tell you if one is waiting.
        </p>
      ) : null}
      {!pending || result?.kind === "created" ? (
        <div className="nq-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || aiOff || existing.status === "loading" || result?.kind === "created"}
            onClick={() => void draft(null)}
          >
            {busy ? (
              <>
                <Spinner /> Drafting…
              </>
            ) : (
              "Draft nudge"
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}
