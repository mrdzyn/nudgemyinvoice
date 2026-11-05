import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { Badge } from "../components/Badge.js";
import { Dialog } from "../components/Dialog.js";
import { Notice } from "../components/Notice.js";
import { Spinner } from "../components/Spinner.js";
import { useFocusOnMount } from "../components/hooks.js";
import { useApp } from "../demo/AppContext.js";
import { formatDateOnly } from "../followups/schedule.js";
import { requestNudgeyChat } from "../nudgey/openRequest.js";
import {
  NUDGE_MAX_MESSAGE,
  NUDGE_TONES,
  type NudgeCounts,
  type NudgeItem,
  type NudgeTone,
  type NudgeView,
  type TransitionOutcome,
} from "./api.js";
import type { NudgesController } from "./controller.js";
import {
  TONE_BADGE,
  TONE_LABEL,
  dueDateBadge,
  dueDateText,
  editProblem,
  factsAsOf,
  formatWhen,
  generateFailureText,
} from "./format.js";

export const NOT_SENT_LINE = "Not sent · for your manual use";

export function ToneBadge({ tone }: { tone: NudgeTone }) {
  return <Badge kind={TONE_BADGE[tone]}>{TONE_LABEL[tone]}</Badge>;
}

export function NudgeCounters({ counts }: { counts: NudgeCounts | null }) {
  const n = (v: number | undefined) => (counts ? String(v) : "—");
  return (
    <dl className="nq-counters" aria-label="Nudge counts">
      <div>
        <dt>Pending review</dt>
        <dd className="num" data-testid="count-pending">
          {n(counts?.pending)}
        </dd>
      </div>
      <div>
        <dt>Approved for manual use</dt>
        <dd className="num" data-testid="count-approved">
          {n(counts?.approved)}
        </dd>
      </div>
      <div>
        <dt>History</dt>
        <dd className="num" data-testid="count-history">
          {counts ? String(counts.rejected + counts.superseded) : "—"}
        </dd>
      </div>
    </dl>
  );
}

const VIEWS: { key: NudgeView; label: string }[] = [
  { key: "pending", label: "Pending review" },
  { key: "approved", label: "Approved" },
  { key: "history", label: "History" },
];

const viewCount = (c: NudgeCounts | null, v: NudgeView): number | null =>
  c
    ? v === "pending"
      ? c.pending
      : v === "approved"
        ? c.approved
        : c.rejected + c.superseded
    : null;

/** ARIA tablist: arrow keys / Home / End move between tabs; only the selected tab is in the Tab order. */
export function NudgeTabs({
  view,
  counts,
  panelId,
  onChange,
}: {
  view: NudgeView;
  counts: NudgeCounts | null;
  panelId: string;
  onChange: (v: NudgeView) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = VIEWS.findIndex((v) => v.key === view);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % VIEWS.length
        : e.key === "ArrowLeft"
          ? (i - 1 + VIEWS.length) % VIEWS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? VIEWS.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    const k = VIEWS[next]!.key;
    onChange(k);
    refs.current[k]?.focus();
  };
  return (
    <div className="tablist nq-tabs" role="tablist" aria-label="Nudge queue">
      {VIEWS.map((v) => {
        const c = viewCount(counts, v.key);
        return (
          <button
            key={v.key}
            ref={(el) => {
              refs.current[v.key] = el;
            }}
            type="button"
            role="tab"
            className="tab"
            id={`nq-tab-${v.key}`}
            aria-selected={view === v.key}
            aria-controls={panelId}
            tabIndex={view === v.key ? 0 : -1}
            onClick={() => onChange(v.key)}
            onKeyDown={onKey}
          >
            {v.label}
            {c === null ? null : <span className="nq-count">{c}</span>}
          </button>
        );
      })}
    </div>
  );
}

function customer(n: NudgeItem) {
  return n.invoice?.customerName ?? `Invoice ${n.facts.invoiceRef}`;
}

export function NudgeListRow({
  n,
  selected,
  onSelect,
}: {
  n: NudgeItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="nq-row"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(n.id)}
      >
        <span className="nq-row-top">
          <strong>{customer(n)}</strong>
          <span className="num">{n.facts.amount}</span>
        </span>
        <span className="nq-row-meta">
          {n.status === "approved" ? (
            <Badge kind="ok" glyph="✓">
              Approved
            </Badge>
          ) : (
            <Badge kind={dueDateBadge(n.facts.daysPastDue)}>
              {dueDateText(n.facts.daysPastDue)}
            </Badge>
          )}
          <ToneBadge tone={n.tone} />
          {n.edited ? <Badge kind="neutral">Edited</Badge> : null}
        </span>
        <span className="cell-sub">
          {n.status === "approved" && n.approvedAt
            ? `${formatWhen(n.approvedAt)} · ${NOT_SENT_LINE}`
            : `Drafted ${formatWhen(n.createdAt)}`}
        </span>
      </button>
    </li>
  );
}

export function NudgeFactsList({ n }: { n: NudgeItem }) {
  return (
    <dl className="nq-facts">
      <div>
        <dt>Amount</dt>
        <dd className="num">{n.facts.amount}</dd>
      </div>
      <div>
        <dt>Due date</dt>
        <dd>{formatDateOnly(n.facts.dueDate)}</dd>
      </div>
      <div>
        <dt>As of {factsAsOf(n.facts)}</dt>
        <dd>{dueDateText(n.facts.daysPastDue)}</dd>
      </div>
      <div>
        <dt>Invoice</dt>
        <dd className="mono">{n.facts.invoiceRef}</dd>
      </div>
    </dl>
  );
}

type PanelNotice = {
  kind: "ok" | "info" | "warn" | "err";
  title: string;
  body: string;
  reload?: boolean;
} | null;

function transitionNotice(
  r: Exclude<TransitionOutcome, { kind: "ok" } | { kind: "aborted" }>,
): PanelNotice {
  switch (r.kind) {
    case "version-conflict":
      return {
        kind: "warn",
        title: "This draft changed in another tab.",
        body: "Reload it to see the latest text before approving.",
        reload: true,
      };
    case "not-pending":
    case "not-found":
      return {
        kind: "warn",
        title: "This draft is no longer waiting for review.",
        body: "It was approved, rejected or replaced elsewhere. Reload the queue to see where it went.",
        reload: true,
      };
    case "invalid":
      return {
        kind: "err",
        title: "The server refused this text.",
        body: "Check the message and try again.",
      };
    case "offline":
      return {
        kind: "err",
        title: "Could not reach the server.",
        body: "Nothing changed. Check your connection and try again.",
      };
    case "forbidden":
      return {
        kind: "err",
        title: "The server did not accept this request.",
        body: "Reload the page and try again. Nothing changed.",
      };
    default:
      return {
        kind: "err",
        title: "That didn't work.",
        body: "Nothing changed. Try again in a moment.",
      };
  }
}

function PanelNoticeView({ notice, onReload }: { notice: PanelNotice; onReload: () => void }) {
  if (!notice) return null;
  return (
    <Notice
      kind={notice.kind}
      role={notice.kind === "err" ? "alert" : "status"}
      className="notice-compact"
      id="nq-panel-notice"
    >
      <strong>{notice.title}</strong> {notice.body}
      {notice.reload ? (
        <div className="mt-8">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onReload}>
            Reload draft
          </button>
        </div>
      ) : null}
    </Notice>
  );
}

/** Review panel for ONE pending draft. Every action is bound to the version the operator is looking at. */
export function PendingReviewPanel({
  n,
  aiAvailable,
  controller,
  onReload,
  onDone,
}: {
  n: NudgeItem;
  aiAvailable: boolean;
  controller: Pick<NudgesController, "edit" | "approve" | "reject" | "generate">;
  onReload: () => void;
  onDone: (event: "approved" | "rejected" | "saved" | "regenerated", nudge: NudgeItem) => void;
}) {
  const { announce } = useApp();
  const textId = useId();
  const countId = useId();
  const errId = useId();
  const toneId = useId();
  const [text, setText] = useState(n.message);
  const [busy, setBusy] = useState<null | "save" | "approve" | "reject" | "regen">(null);
  const [notice, setNotice] = useState<PanelNotice>(null);
  const [tone, setTone] = useState<NudgeTone>(n.tone);
  const [confirm, setConfirm] = useState<null | "reject" | "regen">(null);
  const work = useRef<AbortController | null>(null);
  useEffect(() => () => work.current?.abort(), []);
  // A different draft, or a new server version of this one, resets the editor to the server text.
  useEffect(() => {
    setText(n.message);
    setTone(n.tone);
  }, [n.id, n.version, n.message, n.tone]);

  const dirty = text !== n.message;
  const problem = dirty ? editProblem(text) : null;
  const run = async (
    kind: "save" | "approve" | "reject",
    call: (signal: AbortSignal) => Promise<TransitionOutcome>,
  ) => {
    work.current?.abort();
    const ac = new AbortController();
    work.current = ac;
    setBusy(kind);
    setNotice(null);
    const r = await call(ac.signal);
    if (ac.signal.aborted || r.kind === "aborted") return;
    setBusy(null);
    if (r.kind === "ok") {
      const merged = { ...r.nudge, invoice: n.invoice };
      onDone(kind === "save" ? "saved" : kind === "approve" ? "approved" : "rejected", merged);
      return;
    }
    if (r.kind === "unauthorized") return;
    const msg = transitionNotice(r);
    setNotice(msg);
    if (msg) announce(`${msg.title} ${msg.body}`);
  };

  const regenerate = async () => {
    work.current?.abort();
    const ac = new AbortController();
    work.current = ac;
    setBusy("regen");
    setNotice(null);
    const r = await controller.generate(
      n.invoiceId,
      tone,
      { id: n.id, version: n.version },
      ac.signal,
    );
    if (ac.signal.aborted || r.kind === "aborted") return;
    setBusy(null);
    if (r.kind === "ok") {
      onDone("regenerated", { ...r.nudge, invoice: n.invoice });
      return;
    }
    if (r.kind === "unauthorized") return;
    if (r.kind === "pending-exists") {
      setNotice({
        kind: "warn",
        title: "A different draft is now pending for this invoice.",
        body: "Reload the queue to review it.",
        reload: true,
      });
      return;
    }
    const f = generateFailureText(r);
    setNotice({ ...f, reload: r.kind === "version-conflict" });
    announce(`${f.title} ${f.body}`);
  };

  return (
    <section className="card nq-review" aria-labelledby="nq-review-title" aria-busy={busy !== null}>
      <div>
        <h2 className="card-title mb-0" id="nq-review-title">
          {customer(n)}
        </h2>
        <p className="cell-sub nq-tight nq-badges">
          Drafted {formatWhen(n.createdAt)} <ToneBadge tone={n.tone} />{" "}
          <Badge kind="info">Pending review</Badge>
          {n.edited ? <Badge kind="neutral">Edited by you</Badge> : null}
        </p>
      </div>
      <Notice kind="ai" role="note" className="notice-compact">
        <strong>AI draft — review before use.</strong> The amount, due date and reference were
        filled in from your saved invoice; the AI never saw them. Nothing is sent.
      </Notice>
      <h3 className="nq-h3">Verified facts used</h3>
      <NudgeFactsList n={n} />
      <label className="label-strong" htmlFor={textId}>
        Message
      </label>
      <textarea
        id={textId}
        className="textarea nq-text"
        rows={9}
        value={text}
        maxLength={NUDGE_MAX_MESSAGE + 200}
        disabled={busy !== null}
        aria-invalid={problem ? true : undefined}
        aria-describedby={`${countId}${problem ? ` ${errId}` : ""}`}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="cell-sub nq-tight" id={countId}>
        {text.trim().length} / {NUDGE_MAX_MESSAGE} characters
        {dirty ? " · Unsaved edits — save them before approving." : ""}
      </p>
      {problem ? (
        <p className="field-error" id={errId}>
          {problem}
        </p>
      ) : null}
      <details className="nq-why">
        <summary>Why this wording (AI rationale)</summary>
        <p>{n.rationale}</p>
      </details>
      <PanelNoticeView notice={notice} onReload={onReload} />
      <div className="nq-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null || dirty}
          aria-describedby={dirty ? countId : undefined}
          onClick={() => void run("approve", (s) => controller.approve(n.id, n.version, s))}
        >
          {busy === "approve" ? (
            <>
              <Spinner /> Approving…
            </>
          ) : (
            "Approve for manual use"
          )}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy !== null || !dirty || problem !== null}
          onClick={() => void run("save", (s) => controller.edit(n.id, n.version, text.trim(), s))}
        >
          {busy === "save" ? (
            <>
              <Spinner /> Saving…
            </>
          ) : (
            "Save edits"
          )}
        </button>
        <div className="nq-regen">
          <label className="sr-only" htmlFor={toneId}>
            Tone for a new draft
          </label>
          <select
            id={toneId}
            className="select nq-tone-select"
            value={tone}
            disabled={busy !== null || !aiAvailable}
            onChange={(e) => setTone(e.target.value as NudgeTone)}
          >
            {NUDGE_TONES.map((t) => (
              <option key={t} value={t}>
                {TONE_LABEL[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy !== null || !aiAvailable}
            onClick={() => setConfirm("regen")}
          >
            {busy === "regen" ? (
              <>
                <Spinner /> Drafting…
              </>
            ) : (
              "Regenerate"
            )}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-secondary nq-reject"
          disabled={busy !== null}
          onClick={() => setConfirm("reject")}
        >
          Reject
        </button>
      </div>
      {busy === "regen" ? (
        <p className="nq-busy" role="status">
          <Spinner /> Drafting a {TONE_LABEL[tone].toLowerCase()} nudge… this usually takes a few
          seconds.
        </p>
      ) : null}
      <p className="hint nq-tight">
        {aiAvailable
          ? "Copy becomes available after approval. Approving does not send anything."
          : "AI drafting isn't available on this server, so Regenerate is off. You can still edit, approve and copy."}
      </p>
      <Dialog
        open={confirm === "reject"}
        title="Reject this draft?"
        confirmLabel="Reject draft"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run("reject", (s) => controller.reject(n.id, n.version, s));
        }}
      >
        <p>It moves to History and can't be approved later. Nothing is sent.</p>
      </Dialog>
      <Dialog
        open={confirm === "regen"}
        title={`Draft a new ${TONE_LABEL[tone].toLowerCase()} nudge?`}
        confirmLabel="Draft new version"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void regenerate();
        }}
      >
        <p>
          This makes one AI call. The new draft replaces this one, which moves to History as
          “Replaced”{dirty ? ", and your unsaved edits are discarded" : ""}. Nothing is sent.
        </p>
      </Dialog>
    </section>
  );
}

async function copyText(t: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}

export function ApprovedPanel({ n }: { n: NudgeItem }) {
  const { announce } = useApp();
  const pre = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState<null | "ok" | "manual">(null);
  useEffect(() => setCopied(null), [n.id]);
  const copy = async () => {
    if (await copyText(n.message)) {
      setCopied("ok");
      announce("Message copied to the clipboard. Nothing was sent.");
      return;
    }
    // Clipboard blocked: select the text so the operator can copy it themselves.
    const el = pre.current;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (el && sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setCopied("manual");
    announce("Copying isn't available here. The message is selected; copy it with your keyboard.");
  };
  return (
    <section className="card nq-review" aria-labelledby="nq-approved-title">
      <div>
        <h2 className="card-title mb-0" id="nq-approved-title">
          {customer(n)}
        </h2>
        <p className="cell-sub nq-tight nq-badges">
          <ToneBadge tone={n.tone} />{" "}
          <Badge kind="ok" glyph="✓">
            Approved
          </Badge>
          {n.edited ? <Badge kind="neutral">Edited by you</Badge> : null}
        </p>
      </div>
      <Notice kind="ok" role="note" className="notice-compact">
        <strong>
          Approved for manual use{n.approvedAt ? ` on ${formatWhen(n.approvedAt)}` : ""}.
        </strong>{" "}
        Not sent — copy it into your own email or messaging app.
      </Notice>
      <NudgeFactsList n={n} />
      <pre className="nq-final" ref={pre} aria-label="Approved message">
        {n.message}
      </pre>
      <div className="nq-actions">
        <button type="button" className="btn btn-primary" onClick={() => void copy()}>
          Copy message
        </button>
        {copied === "ok" ? (
          <span className="nq-copied">
            <span aria-hidden="true">✓ </span>Copied to clipboard
          </span>
        ) : copied === "manual" ? (
          <span className="hint">The message is selected — copy it with your keyboard.</span>
        ) : null}
      </div>
      <details className="nq-why">
        <summary>{n.edited ? "Original AI draft and rationale" : "AI rationale"}</summary>
        {n.edited ? (
          <>
            <p className="cell-sub">Kept unchanged for your records.</p>
            <pre className="nq-final nq-original">{n.aiMessage}</pre>
          </>
        ) : null}
        <p>{n.rationale}</p>
      </details>
    </section>
  );
}

export function HistoryTable({ items }: { items: NudgeItem[] }) {
  return (
    <div className="table-card nq-history">
      <table className="data">
        <caption className="sr-only">Closed nudges: rejected or replaced. None were sent.</caption>
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Amount</th>
            <th scope="col">Tone</th>
            <th scope="col">Outcome</th>
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((n) => (
            <tr key={n.id}>
              <td>{customer(n)}</td>
              <td className="num">{n.facts.amount}</td>
              <td>
                <ToneBadge tone={n.tone} />
              </td>
              <td>
                {n.status === "rejected" ? (
                  <Badge kind="err" glyph="✕">
                    Rejected
                  </Badge>
                ) : (
                  <Badge kind="neutral" glyph="↻">
                    Replaced by a newer draft
                  </Badge>
                )}
              </td>
              <td className="cell-sub">
                {formatWhen(n.rejectedAt ?? n.supersededAt ?? n.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QueueSkeleton() {
  return (
    <div className="card" aria-busy="true" role="status" aria-label="Loading nudges">
      <div className="skeleton sk-h18 sk-w40" />
      <div className="skeleton sk-h30 sk-w70 mt-8" />
      <div className="skeleton sk-h14 sk-w55 mt-8" />
    </div>
  );
}

const EMPTY: Record<NudgeView, { title: string; body: string }> = {
  pending: {
    title: "No nudges waiting for review.",
    body: "Draft one from a saved invoice, or ask Nudgey: “draft a friendly nudge for Northwind”.",
  },
  approved: {
    title: "No approved nudges yet.",
    body: "Approve a pending draft to copy it into your own email or messaging app.",
  },
  history: {
    title: "No rejected or replaced drafts.",
    body: "Rejected drafts and drafts replaced by a newer one appear here. Nothing in history was sent.",
  },
};

type Load =
  | { status: "loading" }
  | { status: "ok"; items: NudgeItem[]; view: NudgeView }
  | { status: "error" };
type Flash = { kind: "ok" | "info"; text: string; go?: NudgeView } | null;

/** Container: real counts and lists from the server; review actions go through the controller. */
export function NudgeQueue({ controller }: { controller: NudgesController }) {
  const { state, dispatch, announce } = useApp();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const focus = state.nudgeFocus;
  const [view, setView] = useState<NudgeView>(focus?.view ?? "pending");
  const [selected, setSelected] = useState<string | null>(focus?.id ?? null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState<Flash>(null);
  const panelId = useId();

  useEffect(() => {
    void controller.refresh();
  }, [controller, tick]);

  useEffect(() => {
    const ac = new AbortController();
    // A view change shows a skeleton; a background re-read after a change keeps the current list visible.
    setLoad((l) => (l.status === "ok" && l.view === view ? l : { status: "loading" }));
    void controller.list(view, null, ac.signal).then((r) => {
      if (ac.signal.aborted || r.kind === "aborted" || r.kind === "unauthorized") return;
      if (r.kind === "ok") setLoad({ status: "ok", items: r.items, view });
      else setLoad({ status: "error" });
    });
    return () => ac.abort();
  }, [controller, view, snap.version, tick]);

  const items = load.status === "ok" && load.view === view ? load.items : [];
  const current = items.find((i) => i.id === selected) ?? items[0] ?? null;

  const changeView = (v: NudgeView) => {
    setView(v);
    setSelected(null);
    setFlash(null);
  };
  const reload = useCallback(() => {
    setFlash(null);
    setTick((t) => t + 1);
  }, []);

  const onDone = (event: "approved" | "rejected" | "saved" | "regenerated", n: NudgeItem) => {
    const who = n.invoice?.customerName ?? "this invoice";
    if (event === "approved") {
      setFlash({
        kind: "ok",
        text: `Approved for manual use: the nudge for ${who}. Nothing was sent — copy it from Approved.`,
        go: "approved",
      });
      announce(`Approved for manual use. Nothing was sent.`);
      setSelected(null);
    } else if (event === "rejected") {
      setFlash({
        kind: "info",
        text: `Rejected. The draft for ${who} moved to History. Nothing was sent.`,
      });
      announce("Draft rejected and moved to History.");
      setSelected(null);
    } else if (event === "saved") {
      setFlash({ kind: "ok", text: "Edits saved. The original AI draft is kept unchanged." });
      announce("Edits saved.");
      setSelected(n.id);
    } else {
      setFlash({
        kind: "ok",
        text: `New ${TONE_LABEL[n.tone].toLowerCase()} draft ready for review. The previous draft moved to History.`,
      });
      announce("New draft ready for review.");
      setSelected(n.id);
    }
  };

  const draftButton = (
    <button
      type="button"
      className="btn btn-primary"
      disabled={!snap.aiAvailable}
      onClick={() => requestNudgeyChat()}
    >
      Draft a nudge
    </button>
  );

  return (
    <section aria-labelledby="nq-title">
      <div className="page-head">
        <div>
          <h1 className="screen-title" id="nq-title" tabIndex={-1} ref={headingRef}>
            Nudge queue
          </h1>
          <p className="subtitle">
            AI-drafted payment follow-ups for your review — nothing is ever sent automatically
          </p>
        </div>
        {draftButton}
      </div>
      {snap.status === "ok" && !snap.aiAvailable ? (
        <Notice kind="warn" role="status" className="notice-compact" id="nq-ai-off">
          <strong>AI drafting isn't available on this server.</strong> You can still review, approve
          and copy existing drafts.
        </Notice>
      ) : null}
      <NudgeCounters counts={snap.counts} />
      <NudgeTabs view={view} counts={snap.counts} panelId={panelId} onChange={changeView} />
      <div role="tabpanel" id={panelId} aria-labelledby={`nq-tab-${view}`} tabIndex={-1}>
        {flash ? (
          <Notice kind={flash.kind} role="status" className="notice-compact" id="nq-flash">
            {flash.text}
            {flash.go ? (
              <>
                {" "}
                <button type="button" className="btn-link" onClick={() => changeView(flash.go!)}>
                  Open Approved
                </button>
              </>
            ) : null}
          </Notice>
        ) : null}
        {load.status === "loading" || (load.status === "ok" && load.view !== view) ? (
          <QueueSkeleton />
        ) : load.status === "error" ? (
          <Notice kind="err" role="alert" id="nq-error">
            <strong>Could not load your nudges.</strong> Your invoices are unaffected.
            <div className="mt-8">
              <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
                Retry
              </button>
            </div>
          </Notice>
        ) : items.length === 0 ? (
          <Notice kind="info" role="status" id="nq-empty">
            <strong>{EMPTY[view].title}</strong> {EMPTY[view].body}
            {view === "pending" ? (
              <div className="mt-8 nq-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => dispatch({ type: "navigate", screen: "dashboard" })}
                >
                  Choose a saved invoice
                </button>
              </div>
            ) : null}
          </Notice>
        ) : view === "history" ? (
          <>
            <HistoryTable items={items} />
            <p className="hint">
              History keeps rejected drafts and drafts replaced by a newer one. Nothing in history
              was sent.
            </p>
          </>
        ) : (
          <div className="nq-split">
            <ul className="nq-list" aria-label={view === "pending" ? "Pending review" : "Approved"}>
              {items.map((n) => (
                <NudgeListRow
                  key={n.id}
                  n={n}
                  selected={current?.id === n.id}
                  onSelect={(id) => {
                    setSelected(id);
                    setFlash(null);
                  }}
                />
              ))}
            </ul>
            {current ? (
              view === "pending" ? (
                <PendingReviewPanel
                  key={current.id}
                  n={current}
                  aiAvailable={snap.aiAvailable}
                  controller={controller}
                  onReload={reload}
                  onDone={onDone}
                />
              ) : (
                <ApprovedPanel n={current} />
              )
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export function NudgeQueueScreen() {
  const { session } = useApp();
  if (!session?.nudges)
    return (
      <Notice kind="info" role="status">
        The AI nudge queue is available only when you are signed in to the server.
      </Notice>
    );
  return <NudgeQueue controller={session.nudges} />;
}
