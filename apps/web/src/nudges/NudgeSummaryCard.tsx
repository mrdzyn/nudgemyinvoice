import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge } from "../components/Badge.js";
import { useApp } from "../demo/AppContext.js";
import { requestNudgeyChat } from "../nudgey/openRequest.js";
import type { NudgeItem } from "./api.js";
import type { NudgesController } from "./controller.js";
import { dueDateBadge, dueDateText, formatWhen } from "./format.js";
import { NudgeCounters, ToneBadge } from "./NudgeQueueScreen.js";

export const SUMMARY_PREVIEW = 3;

type Recent = { status: "loading" } | { status: "ok"; items: NudgeItem[] } | { status: "error" };

/** Pure view (fixtures in tests; the container below supplies real server data). */
/**
 * P1 action-led hero: the single most recent pending draft, featured with its real tone,
 * amount and text. Review-only from here: approval and copy stay explicit in the queue
 * (`onReview` opens the queue on this draft). Tones are type-locked to
 * friendly/professional/firm — there is no Final Notice.
 */
export function Spotlight({ n, onReview }: { n: NudgeItem; onReview: (id: string) => void }) {
  return (
    <div className="nq-spotlight" aria-label="AI Nudge Spotlight" data-testid="nudge-spotlight">
      <p className="nq-spotlight-kicker">AI Nudge Spotlight</p>
      <div className="nq-mini-main">
        <strong>{n.invoice?.customerName ?? n.facts.invoiceRef}</strong>
        <span className="num">{n.facts.amount}</span>
        <Badge kind={dueDateBadge(n.facts.daysPastDue)}>{dueDateText(n.facts.daysPastDue)}</Badge>
        <ToneBadge tone={n.tone} />
      </div>
      <p className="nq-spotlight-text">{n.message}</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onReview(n.id)}>
        Review in queue
        <span className="sr-only"> the draft for {n.invoice?.customerName ?? "this invoice"}</span>
      </button>
    </div>
  );
}

export function NudgeSummaryView({
  counts,
  countsStatus,
  aiAvailable,
  recent,
  onOpenQueue,
  onReview,
  onDraft,
  onRetry,
}: {
  counts: Parameters<typeof NudgeCounters>[0]["counts"];
  countsStatus: "loading" | "ok" | "error";
  aiAvailable: boolean;
  recent: Recent;
  onOpenQueue: () => void;
  onReview: (id: string) => void;
  onDraft: () => void;
  onRetry: () => void;
}) {
  const failed = countsStatus === "error" || recent.status === "error";
  return (
    <section className="card nq-summary" aria-labelledby="nq-sum-title" data-testid="nudge-summary">
      <div className="nq-summary-head">
        <div>
          <h2 className="card-title mb-0" id="nq-sum-title">
            AI Nudge Queue
          </h2>
          <p className="hint nq-tight">
            AI-drafted payment follow-ups waiting for your review.{" "}
            <strong>Nothing is ever sent</strong> — approved messages are yours to copy and send
            yourself.
          </p>
        </div>
        <div className="nq-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!aiAvailable}
            onClick={onDraft}
          >
            Draft a nudge
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenQueue}>
            Open queue
          </button>
        </div>
      </div>
      {failed ? (
        <div className="notice notice-err notice-compact" role="alert">
          <div>
            <strong>Could not load your nudges.</strong> Your invoices are unaffected.{" "}
            <button type="button" className="btn-link" onClick={onRetry}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <NudgeCounters counts={counts} />
      )}
      {countsStatus === "ok" && !aiAvailable ? (
        <p className="hint nq-tight" role="status">
          AI drafting isn't available on this server. Existing drafts can still be reviewed,
          approved and copied.
        </p>
      ) : null}
      {recent.status === "ok" && recent.items.length > 0 ? (
        <Spotlight n={recent.items[0]!} onReview={onReview} />
      ) : null}
      {recent.status === "loading" && !failed ? (
        <div aria-busy="true" aria-label="Loading pending drafts">
          <div className="skeleton sk-h14 sk-w70" />
        </div>
      ) : null}
      {recent.status === "ok" ? (
        recent.items.length === 0 ? (
          <p className="hint nq-tight">
            No drafts waiting for review. Open a saved invoice and choose <em>AI payment nudge</em>,
            or ask Nudgey.
          </p>
        ) : (
          <ul className="nq-mini" aria-label="Pending review">
            {recent.items.map((n) => (
              <li key={n.id}>
                <div className="nq-mini-main">
                  <strong>{n.invoice?.customerName ?? n.facts.invoiceRef}</strong>
                  <span className="num">{n.facts.amount}</span>
                  <Badge kind={dueDateBadge(n.facts.daysPastDue)}>
                    {dueDateText(n.facts.daysPastDue)}
                  </Badge>
                  <ToneBadge tone={n.tone} />
                </div>
                <div className="nq-mini-side">
                  <span className="cell-sub">{formatWhen(n.createdAt)}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onReview(n.id)}
                  >
                    Review
                    <span className="sr-only">
                      {" "}
                      the draft for {n.invoice?.customerName ?? "this invoice"}
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

export function NudgeSummaryCard({ controller }: { controller: NudgesController }) {
  const { dispatch } = useApp();
  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [recent, setRecent] = useState<Recent>({ status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void controller.refresh();
  }, [controller, tick]);
  useEffect(() => {
    const ac = new AbortController();
    void controller.list("pending", null, ac.signal).then((r) => {
      if (ac.signal.aborted || r.kind === "aborted" || r.kind === "unauthorized") return;
      setRecent(
        r.kind === "ok"
          ? { status: "ok", items: r.items.slice(0, SUMMARY_PREVIEW) }
          : { status: "error" },
      );
    });
    return () => ac.abort();
  }, [controller, snap.version, tick]);
  return (
    <NudgeSummaryView
      counts={snap.counts}
      countsStatus={snap.status}
      aiAvailable={snap.aiAvailable}
      recent={recent}
      onOpenQueue={() => dispatch({ type: "open-nudges", view: "pending", id: null })}
      onReview={(id) => dispatch({ type: "open-nudges", view: "pending", id })}
      onDraft={() => requestNudgeyChat()}
      onRetry={() => {
        setRecent({ status: "loading" });
        setTick((t) => t + 1);
      }}
    />
  );
}
