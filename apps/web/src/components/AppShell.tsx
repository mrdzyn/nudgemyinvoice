import type { ReactNode } from "react";
import { useApp } from "../demo/AppContext.js";
import { Notice } from "./Notice.js";
import { Nudgey } from "./Nudgey.js";
import type { Screen } from "../demo/appState.js";

function NavButton({
  target,
  label,
  current,
}: {
  target: Screen;
  label: string;
  current: boolean;
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
    </button>
  );
}

/** Persistent PayPal Sandbox identity, header, navigation and the main landmark. */
export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch, session } = useApp();
  const signOut = () => (session ? session.signOut() : dispatch({ type: "sign-out" }));
  const shell = state.screen !== "login";
  const onDashboard = state.screen === "dashboard" || state.screen === "detail";
  const onComposer = state.screen === "composer" || state.screen === "review";
  return (
    <>
      <div className="sandbox-banner" role="note" aria-label="PayPal Sandbox notice">
        <span>
          <strong>PayPal Sandbox only.</strong> Nothing here moves real money. Creating a PayPal
          draft does not email the customer.
        </span>
        <span className="mono">sandbox · draft-only</span>
      </div>
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
            <span className="brand-mark" aria-hidden="true">
              N
            </span>
            <span>NudgeMyInvoice</span>
          </button>
        ) : (
          // Nothing to navigate to before sign-in, so no focusable control.
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              N
            </span>
            <span>NudgeMyInvoice</span>
          </div>
        )}
        <div className="header-controls">
          <span className="sandbox-pill">PayPal Sandbox</span>
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
      {shell ? (
        <nav className="app-nav" aria-label="Main">
          <NavButton target="dashboard" label="Invoice drafts" current={onDashboard} />
          <NavButton target="composer" label="New invoice" current={onComposer} />
        </nav>
      ) : null}
      <main id="main-content" tabIndex={-1}>
        {session ? (
          <Notice kind="info" role="note" icon="ℹ" className="notice-compact">
            <strong>You are signed in to the server.</strong> Parsing, saving, the invoice list and
            the saved-invoice pages use the server and PostgreSQL. Saving never creates a PayPal
            invoice. A PayPal Sandbox DRAFT is created only when you explicitly confirm it on a
            saved invoice, and only if the server has drafting enabled; the customer is never
            emailed and no payment is collected.
          </Notice>
        ) : null}
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
