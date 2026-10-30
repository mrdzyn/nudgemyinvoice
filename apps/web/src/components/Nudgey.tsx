import { useEffect, useId, useRef, useState, type Ref } from "react";
import { useApp } from "../demo/AppContext.js";
import type { Action } from "../demo/appState.js";

export type NudgeyChoice = "create" | "browse" | "status";

/** Shortcuts only: no network request, generated text, invoice mutation or PayPal operation. */
export function nudgeyAction(choice: NudgeyChoice): Action {
  return choice === "create"
    ? { type: "navigate", screen: "composer", resetComposer: true }
    : { type: "navigate", screen: "dashboard" };
}

export function NudgeyPanel({
  username,
  onChoose,
  onClose,
  titleId,
  firstActionRef,
}: {
  username: string;
  onChoose: (choice: NudgeyChoice) => void;
  onClose: () => void;
  titleId: string;
  firstActionRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <>
      <div className="nudgey-heading">
        <div>
          <h2 id={titleId} className="nudgey-title">Nudgey</h2>
          <p className="nudgey-kicker">Your invoice companion</p>
        </div>
        <button
          type="button"
          className="nudgey-close"
          aria-label="Close Nudgey"
          onClick={onClose}
        >
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
          <span aria-hidden="true" className="nudgey-action-icon">＋</span>
          <span className="nudgey-action-copy">
            <strong>Create an invoice</strong>
            <small>Use AI or enter it manually</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="nudgey-action"
          onClick={() => onChoose("browse")}
        >
          <span aria-hidden="true" className="nudgey-action-icon">▤</span>
          <span className="nudgey-action-copy">
            <strong>View my invoices</strong>
            <small>Browse your AG Grid dashboard</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="nudgey-action"
          onClick={() => onChoose("status")}
        >
          <span aria-hidden="true" className="nudgey-action-icon">✓</span>
          <span className="nudgey-action-copy">
            <strong>Check invoice status</strong>
            <small>Open an invoice to see its PayPal status</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <p className="nudgey-footnote">You're in control. Nothing is sent automatically.</p>
    </>
  );
}

/** Only mounted inside the server-authenticated AppShell; never on a sign-in screen. */
export function Nudgey() {
  const { session, state, dispatch, announce } = useApp();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    firstAction.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [open]);

  // The popover never survives navigation to another protected screen.
  useEffect(() => setOpen(false), [state.screen]);

  if (!session) return null;
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (choice: NudgeyChoice) => {
    setOpen(false);
    dispatch(nudgeyAction(choice)); // The existing unsaved-review guard still runs.
    if (choice === "status")
      announce("Choose an invoice and select View to check its PayPal Sandbox status.");
  };
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
          <NudgeyPanel
            username={session.username}
            onChoose={choose}
            onClose={close}
            titleId={titleId}
            firstActionRef={firstAction}
          />
        </section>
      ) : null}
      <button
        type="button"
        ref={trigger}
        className="nudgey-launcher"
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-label="Open Nudgey quick actions"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="nudgey-sparkle">✦</span>
        <span>Nudgey</span>
      </button>
    </div>
  );
}
