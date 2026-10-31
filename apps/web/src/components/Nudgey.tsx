import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { useApp } from "../demo/AppContext.js";
import type { Action } from "../demo/appState.js";
import type { FollowUpView, MutationOutcome } from "../followups/api.js";
import type { FollowUpsSnapshot } from "../followups/controller.js";
import {
  FollowUpList,
  FollowUpSummary,
  ScheduleForm,
  type InvoiceOption,
} from "../followups/FollowUpUi.js";
import { browserTimeZone, formatInstant } from "../followups/schedule.js";
import { StatusPicker } from "../nudgey/StatusPicker.js";
import { statusOpenAction } from "../nudgey/statusLookup.js";
import { useStatusLookup } from "../nudgey/useStatusLookup.js";

export type NudgeyChoice = "create" | "browse" | "status";

/**
 * Navigation shortcuts only: no network request, generated text, invoice mutation or PayPal operation.
 * "status" is NOT a navigation: it opens the invoice-status selector inside Nudgey, so it has no
 * action here (it used to duplicate "browse" and did nothing visible on the dashboard).
 */
export function nudgeyAction(choice: NudgeyChoice): Action | null {
  switch (choice) {
    case "create":
      return { type: "navigate", screen: "composer", resetComposer: true };
    case "browse":
      return { type: "navigate", screen: "dashboard" };
    case "status":
      return null;
  }
}

export function NudgeyPanel({
  username,
  onChoose,
  onClose,
  titleId,
  firstActionRef,
  onSchedule,
}: {
  username: string;
  onChoose: (choice: NudgeyChoice) => void;
  onClose: () => void;
  titleId: string;
  firstActionRef?: Ref<HTMLButtonElement>;
  /** Present only in a real session: opens the local follow-up scheduler. */
  onSchedule?: () => void;
}) {
  return (
    <>
      <div className="nudgey-heading">
        <div>
          <h2 id={titleId} className="nudgey-title">
            Nudgey
          </h2>
          <p className="nudgey-kicker">Your invoice companion</p>
        </div>
        <button type="button" className="nudgey-close" aria-label="Close Nudgey" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p className="nudgey-greeting">
        Hi, {username}! <span aria-hidden="true">👋</span>
      </p>
      <p className="nudgey-question">What would you like to do today?</p>
      <div className="nudgey-actions">
        <button
          ref={firstActionRef}
          type="button"
          className="nudgey-action"
          onClick={() => onChoose("create")}
        >
          <span aria-hidden="true" className="nudgey-action-icon">
            ＋
          </span>
          <span className="nudgey-action-copy">
            <strong>Create an invoice</strong>
            <small>Use AI or enter it manually</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className="nudgey-action" onClick={() => onChoose("browse")}>
          <span aria-hidden="true" className="nudgey-action-icon">
            ▤
          </span>
          <span className="nudgey-action-copy">
            <strong>View my invoices</strong>
            <small>Browse your AG Grid dashboard</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className="nudgey-action" onClick={() => onChoose("status")}>
          <span aria-hidden="true" className="nudgey-action-icon">
            ✓
          </span>
          <span className="nudgey-action-copy">
            <strong>Check invoice status</strong>
            <small>Pick an invoice to see its PayPal draft state</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        {onSchedule ? (
          <button type="button" className="nudgey-action" onClick={onSchedule}>
            <span aria-hidden="true" className="nudgey-action-icon">
              ⏰
            </span>
            <span className="nudgey-action-copy">
              <strong>Schedule a follow-up</strong>
              <small>A reminder for you, not a message to the customer</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        ) : null}
      </div>
      <p className="nudgey-footnote">You're in control. Nothing is sent automatically.</p>
    </>
  );
}

const NO_SNAPSHOT: FollowUpsSnapshot = {
  status: "idle",
  error: null,
  items: [],
  counts: { due: 0, upcoming: 0 },
  serverNow: null,
  version: 0,
};
const noSubscribe = () => () => undefined;
const emptySnapshot = () => NO_SNAPSHOT;

type View =
  | { kind: "home" }
  | { kind: "status" }
  | { kind: "schedule" }
  | { kind: "reschedule"; item: FollowUpView };

const MUTATION_MESSAGE: Partial<Record<MutationOutcome["kind"], string>> = {
  duplicate: "This invoice already has an active follow-up. Reschedule or complete it first.",
  "not-active": "That follow-up was already completed or canceled. The list was refreshed.",
  "not-found": "That invoice or follow-up could not be found.",
  invalid: "The server did not accept those values. Check the date, time and text.",
  forbidden: "The server did not accept this request. Reload the page and try again.",
  unavailable: "The server could not save this right now. Nothing was changed.",
  malformed: "The server's answer was not in the expected format. Check the list before retrying.",
  offline: "Could not reach the server. Nothing was changed.",
};

/** Only mounted inside the server-authenticated AppShell; never on a sign-in screen. */
export function Nudgey() {
  const { session, state, dispatch, announce } = useApp();
  const followUps = session?.followUps;
  const snap = useSyncExternalStore(
    followUps ? followUps.subscribe : noSubscribe,
    followUps ? followUps.getSnapshot : emptySnapshot,
    followUps ? followUps.getSnapshot : emptySnapshot, // server render: same snapshot
  );
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "home" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [invoicesStatus, setInvoicesStatus] = useState<"loading" | "ready" | "error">("loading");
  const trigger = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const work = useRef<AbortController | null>(null);
  const panelId = useId();
  const titleId = useId();
  const listInvoices = session?.listInvoices;
  const expired = session?.sessionExpired;
  const status = useStatusLookup({ listInvoices, expired });
  const statusLookup = status.lookup;

  useEffect(() => {
    if (!open) return;
    if (view.kind === "home") firstAction.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [open, view.kind]);

  // Opening Nudgey re-reads the real follow-ups (due/upcoming are decided by the server).
  useEffect(() => {
    if (open) void followUps?.refresh();
  }, [open, followUps]);

  // The popover never survives navigation to another protected screen.
  useEffect(() => setOpen(false), [state.screen]);
  useEffect(() => {
    if (!open) {
      work.current?.abort();
      statusLookup.reset();
      setView({ kind: "home" });
      setFormError(null);
      setListError(null);
      setBusyId(null);
    }
  }, [open, statusLookup]);
  useEffect(() => () => work.current?.abort(), []);

  // Saved invoices for the schedule form, loaded only while the form is open.
  useEffect(() => {
    if (!open || (view.kind !== "schedule" && view.kind !== "reschedule") || !listInvoices) return;
    const ac = new AbortController();
    setInvoicesStatus("loading");
    void listInvoices(
      { limit: 50, cursor: null, currency: null, status: null, q: null },
      ac.signal,
    ).then((r) => {
      if (ac.signal.aborted || r.kind === "aborted") return;
      if (r.kind === "unauthorized") return expired?.();
      if (r.kind !== "ok") return setInvoicesStatus("error");
      setInvoices(
        r.page.items.map((i) => ({
          id: i.id,
          customerName: i.customerName,
          currency: i.currency,
          total: i.total,
          dueDate: i.dueDate,
        })),
      );
      setInvoicesStatus("ready");
    });
    return () => ac.abort();
  }, [open, view.kind, listInvoices, expired]);

  const run = useCallback(
    async (id: string | null, task: (signal: AbortSignal) => Promise<MutationOutcome>) => {
      work.current?.abort();
      const ac = new AbortController();
      work.current = ac;
      setBusyId(id ?? "form");
      setFormError(null);
      setListError(null);
      const r = await task(ac.signal);
      if (ac.signal.aborted || r.kind === "aborted") return null;
      setBusyId(null);
      return r;
    },
    [],
  );

  if (!session) return null;
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (choice: NudgeyChoice) => {
    if (choice === "status" && listInvoices) {
      // A dedicated read-only selector inside Nudgey; the panel stays open.
      setView({ kind: "status" });
      return;
    }
    setOpen(false);
    // The existing unsaved-review guard still runs.
    const action = nudgeyAction(choice);
    dispatch(action ?? { type: "navigate", screen: "dashboard" });
  };
  const openStatusInvoice = (id: string) => {
    setOpen(false);
    // The same guarded real-mode navigation the dashboard uses (leave guards apply).
    dispatch(statusOpenAction(id));
  };
  const timeZone = browserTimeZone();
  const now = new Date();
  const failMessage = (k: MutationOutcome["kind"]) =>
    MUTATION_MESSAGE[k] ?? "Something went wrong.";

  const submit = async (s: {
    invoiceId: string;
    dueAt: string;
    note: string | null;
    message: string;
  }) => {
    if (!followUps) return;
    const body = { dueAt: s.dueAt, timezone: timeZone, note: s.note, message: s.message };
    const r = await run(null, (signal) =>
      view.kind === "reschedule"
        ? followUps.reschedule(view.item.id, body, signal)
        : followUps.create(s.invoiceId, body, signal),
    );
    if (!r) return;
    if (r.kind === "ok") {
      setView({ kind: "home" });
      announce(
        `Follow-up saved for ${formatInstant(r.followUp.dueAt, r.followUp.timezone)}. It is a reminder for you; nothing was sent to the customer.`,
      );
    } else if (r.kind !== "unauthorized") setFormError(failMessage(r.kind));
  };
  const act = async (f: FollowUpView, what: "complete" | "cancel") => {
    if (!followUps) return;
    const r = await run(f.id, (signal) =>
      what === "complete" ? followUps.complete(f.id, signal) : followUps.cancel(f.id, signal),
    );
    if (!r) return;
    if (r.kind === "ok")
      announce(what === "complete" ? "Follow-up marked complete." : "Follow-up canceled.");
    else if (r.kind !== "unauthorized") setListError(failMessage(r.kind));
  };
  const openInvoice = (f: FollowUpView) => {
    setOpen(false);
    dispatch({ type: "open-saved", id: f.invoiceId, notice: "opened" });
  };
  const due = snap.counts.due;
  return (
    <div className="nudgey" ref={root}>
      {open ? (
        <section
          className="nudgey-panel"
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
        >
          {view.kind === "home" ? (
            <>
              <NudgeyPanel
                username={session.username}
                onChoose={choose}
                onClose={close}
                titleId={titleId}
                firstActionRef={firstAction}
                {...(followUps ? { onSchedule: () => setView({ kind: "schedule" }) } : {})}
              />
              {followUps ? (
                <div className="followup-section">
                  <h3 className="followup-title">Your follow-ups</h3>
                  <FollowUpSummary snap={snap} />
                  {listError ? (
                    <p className="followup-error" role="alert">
                      {listError}
                    </p>
                  ) : null}
                  <FollowUpList
                    items={snap.items}
                    busyId={busyId}
                    at={now}
                    onComplete={(f) => void act(f, "complete")}
                    onCancel={(f) => void act(f, "cancel")}
                    onReschedule={(f) => setView({ kind: "reschedule", item: f })}
                    onOpen={openInvoice}
                  />
                </div>
              ) : null}
            </>
          ) : view.kind === "status" ? (
            <>
              <div className="nudgey-heading">
                <h2 id={titleId} className="nudgey-title">
                  Nudgey
                </h2>
                <button
                  type="button"
                  className="nudgey-close"
                  aria-label="Close Nudgey"
                  onClick={close}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <StatusPicker
                state={status.state}
                onSearch={(t) => void statusLookup.search(t)}
                onTermChange={(t) => statusLookup.prepareSearch(t)}
                onSelect={(id) => statusLookup.select(id)}
                onRetry={() => void statusLookup.retry()}
                onOpen={openStatusInvoice}
                onBack={() => {
                  statusLookup.reset();
                  setView({ kind: "home" });
                }}
                onCreate={() => choose("create")}
              />
            </>
          ) : (
            <>
              <div className="nudgey-heading">
                <h2 id={titleId} className="nudgey-title">
                  Nudgey
                </h2>
                <button
                  type="button"
                  className="nudgey-close"
                  aria-label="Close Nudgey"
                  onClick={close}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <ScheduleForm
                key={view.kind === "reschedule" ? view.item.id : "new"}
                mode={view.kind === "reschedule" ? "reschedule" : "create"}
                invoices={
                  view.kind === "reschedule" && !invoices.some((o) => o.id === view.item.invoiceId)
                    ? [
                        {
                          id: view.item.invoiceId,
                          customerName: view.item.invoice?.customerName ?? "Invoice",
                          currency: view.item.invoice?.currency ?? "",
                          total: view.item.invoice?.total ?? "",
                          dueDate: view.item.invoice?.dueDate ?? "",
                        },
                        ...invoices,
                      ]
                    : invoices
                }
                invoicesStatus={view.kind === "reschedule" ? "ready" : invoicesStatus}
                {...(view.kind === "reschedule"
                  ? {
                      initial: {
                        invoiceId: view.item.invoiceId,
                        dueAt: view.item.dueAt,
                        note: view.item.note,
                        message: view.item.message,
                        timezone: view.item.timezone,
                      },
                    }
                  : {})}
                busy={busyId !== null}
                error={formError}
                now={now}
                timeZone={timeZone}
                onSubmit={(s) => void submit(s)}
                onBack={() => {
                  setFormError(null);
                  setView({ kind: "home" });
                }}
              />
            </>
          )}
        </section>
      ) : null}
      <button
        type="button"
        ref={trigger}
        className="nudgey-launcher"
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-label={
          due > 0
            ? `Open Nudgey quick actions, ${due} follow-up${due === 1 ? "" : "s"} due`
            : "Open Nudgey quick actions"
        }
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="nudgey-sparkle">
          ✦
        </span>
        <span>Nudgey</span>
        {due > 0 ? (
          <span aria-hidden="true" className="nudgey-badge">
            {due}
          </span>
        ) : null}
      </button>
    </div>
  );
}
