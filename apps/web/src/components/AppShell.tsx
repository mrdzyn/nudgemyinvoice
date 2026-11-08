import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useApp } from "../demo/AppContext.js";
import { Nudgey } from "./Nudgey.js";
import type { Screen } from "../demo/appState.js";
import type { NudgesController, NudgeSnapshot } from "../nudges/controller.js";

const noSubscribe = () => () => undefined;
const NO_NUDGES: NudgeSnapshot = {
  counts: null,
  aiAvailable: false,
  status: "loading",
  version: 0,
};
const noNudges = () => NO_NUDGES;

/** Real pending-review count for the nav badge (NMI-P6); null until the server has answered. */
function usePendingCount(nudges: NudgesController | undefined): number | null {
  const snap = useSyncExternalStore(
    nudges ? nudges.subscribe : noSubscribe,
    nudges ? nudges.getSnapshot : noNudges,
    noNudges,
  );
  return snap.counts?.pending ?? null;
}

function NavButton({
  target,
  label,
  current,
  count,
}: {
  target: Screen;
  label: string;
  current: boolean;
  count?: number | null;
}) {
  const { dispatch } = useApp();
  return (
    <button
      type="button"
      className="nav-link"
      aria-current={current ? "page" : undefined}
      onClick={() =>
        dispatch({ type: "navigate", screen: target, resetComposer: target === "composer" })
      }
    >
      {label}
      {count ? (
        <span className="nq-count" data-testid="nav-nudge-count">
          {count}
          <span className="sr-only"> pending review</span>
        </span>
      ) : null}
    </button>
  );
}

/**
 * Sandbox Safe Mode status (P1 action-led header). The pill names the mode at a glance; opening
 * it shows the exact safeguards inline (same copy as the banner, condensed). Safe mode itself
 * cannot be turned off from the UI: Sandbox-only, draft-only, no send, no money movement.
 */
export function SandboxStatusButton({
  open,
  detailId,
  onToggle,
}: {
  open: boolean;
  detailId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="sandbox-pill"
      aria-expanded={open}
      aria-controls={detailId}
      onClick={onToggle}
    >
      Sandbox Safe Mode
      <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      <span className="sr-only"> (show safeguards)</span>
    </button>
  );
}

export function SandboxStatusDetail({ id }: { id: string }) {
  return (
    <div className="sandbox-detail" id={id} role="region" aria-label="Sandbox safeguards">
      <p>
        <strong>Safe mode is always on.</strong> Nothing here moves real money.
      </p>
      <ul>
        <li>PayPal Sandbox only: drafts are never sent and the customer is never emailed.</li>
        <li>
          A PayPal draft is created only when you confirm it on a saved invoice, and only if the
          server has drafting enabled.
        </li>
        <li>No payment is collected, refunded or captured from this workspace.</li>
      </ul>
    </div>
  );
}

/** Persistent PayPal Sandbox identity, header, navigation and the main landmark. */
export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch, session } = useApp();
  const signOut = () => (session ? session.signOut() : dispatch({ type: "sign-out" }));
  const shell = state.screen !== "login";
  const onDashboard = state.screen === "dashboard" || state.screen === "detail";
  const onComposer = state.screen === "composer" || state.screen === "review";
  const onNudges = state.screen === "nudges";
  const nudges = session?.nudges;
  const pending = usePendingCount(nudges);
  const [safeOpen, setSafeOpen] = useState(false);
  const safeId = useId();
  // P1 UX-01: the large global banner is gone — the always-visible Sandbox Safe Mode
  // disclosure in the header below is the single Safe Mode identity, with safeguards inline on
  // demand and precise confirmations at each point of action.
  return (
    <>
      {state.offline ? (
        <div className="banner-offline" role="alert">
          Offline. Parsing, saving and PayPal draft creation are unavailable until the connection
          returns.
        </div>
      ) : null}
      <header className="app-header">
        {shell ? (
          <button
            type="button"
            className="brand brand-button"
            onClick={() => {
              if (state.authed) dispatch({ type: "navigate", screen: "dashboard" });
            }}
          >
            <img
              className="brand-wordmark"
              src="/brand/nudge-horizontal-logo.jpg"
              alt="NudgeMyInvoice"
              width={220}
              height={62}
            />
          </button>
        ) : (
          // Nothing to navigate to before sign-in, so no focusable control.
          <div className="brand">
            <img
              className="brand-wordmark"
              src="/brand/nudge-horizontal-logo.jpg"
              alt="NudgeMyInvoice"
              width={220}
              height={62}
            />
          </div>
        )}
        <div className="header-controls">
          <SandboxStatusButton
            open={safeOpen}
            detailId={safeId}
            onToggle={() => setSafeOpen((o) => !o)}
          />
          {shell ? (
            <span className="cell-sub">
              {session ? `Signed in as ${session.username}` : "Signed in as operator (demo)"}
            </span>
          ) : null}
          {shell ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>
      {safeOpen ? <SandboxStatusDetail id={safeId} /> : null}
      {shell ? (
        <nav className="app-nav" aria-label="Main">
          <NavButton target="dashboard" label="Invoice drafts" current={onDashboard} />
          {nudges ? (
            <NavButton target="nudges" label="Nudge queue" current={onNudges} count={pending} />
          ) : null}
          <NavButton target="composer" label="New invoice" current={onComposer} />
        </nav>
      ) : null}
      <main id="main-content" tabIndex={-1}>
        {/* P1 UX-01: the verbose signed-in/server explainer is gone — the Safe Mode disclosure
            in the header carries the safeguards, and each point of action keeps its precise
            confirmation. */}
        {children}
      </main>
      {session ? <Nudgey /> : null}
      {shell ? (
        <nav className="mobile-nav" aria-label="Main (mobile)">
          <button
            type="button"
            aria-current={onDashboard ? "page" : undefined}
            onClick={() => dispatch({ type: "navigate", screen: "dashboard" })}
          >
            Drafts
          </button>
          {nudges ? (
            <button
              type="button"
              aria-current={onNudges ? "page" : undefined}
              onClick={() => dispatch({ type: "navigate", screen: "nudges" })}
            >
              Nudges
              {pending ? (
                <span className="nq-count">
                  {pending}
                  <span className="sr-only"> pending review</span>
                </span>
              ) : null}
            </button>
          ) : null}
          <button
            type="button"
            aria-current={onComposer ? "page" : undefined}
            onClick={() => dispatch({ type: "navigate", screen: "composer", resetComposer: true })}
          >
            New invoice
          </button>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </nav>
      ) : null}
    </>
  );
}
