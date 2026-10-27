import { useCallback, useEffect, useReducer, useState } from "react";
import { createAuthApi, type AuthApi, type AuthResult, type Session } from "./auth/api.js";
import type { AuthState } from "./auth/authState.js";
import { useAuthController } from "./auth/useAuthController.js";
import { AppShell } from "./components/AppShell.js";
import { Spinner } from "./components/Spinner.js";
import { createInvoiceApi, type InvoiceApi } from "./invoices/api.js";
import { createParseApi, type ParseApi } from "./parse/api.js";
import { AppProvider } from "./demo/AppContext.js";
import { initialState, reducer, type Action, type Theme } from "./demo/appState.js";
import type { InvoiceDraft } from "./domain/types.js";
import { RealLoginScreen } from "./features/login/RealLoginScreen.js";
import { CurrentScreen, SkipLink, TITLES } from "./screens.js";

const defaultApi = createAuthApi();
const defaultParseApi = createParseApi();
const defaultInvoiceApi = createInvoiceApi();

function systemTheme(): Theme {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * The demo reducer can express "sign in", "sign out", scenario jumps and the login screen. In real
 * mode none of those may be reachable from inside the workspace: authentication state belongs to
 * the server-backed controller, never to this reducer.
 */
export function isBlockedInRealMode(a: Action): boolean {
  return (
    a.type === "sign-in" ||
    a.type === "sign-out" ||
    a.type === "scenario" ||
    // Fixture records, simulated saves and simulated PayPal creation never exist in real mode.
    a.type === "open-detail" ||
    a.type === "save-invoice" ||
    a.type === "paypal-created" ||
    a.type === "paypal-override" ||
    (a.type === "navigate" &&
      (a.screen === "detail" || a.screen === "saved" || a.screen === "review")) ||
    (a.type === "navigate" && a.screen === "login")
  );
}

function Workspace({
  session,
  fresh,
  signOut,
  expire,
  parseApi,
  invoiceApi,
  theme,
}: {
  session: Session;
  fresh: boolean;
  signOut: () => void;
  expire: () => void;
  parseApi: ParseApi;
  invoiceApi: InvoiceApi;
  theme: Theme;
}) {
  const csrfToken = session.csrfToken;
  const save = useCallback(
    (draft: InvoiceDraft, key: string, signal: AbortSignal) =>
      invoiceApi.save(draft, key, csrfToken, signal),
    [invoiceApi, csrfToken],
  );
  const getInvoice = useCallback(
    (id: string, signal: AbortSignal) => invoiceApi.get(id, signal),
    [invoiceApi],
  );
  const parse = useCallback(
    (description: string, signal: AbortSignal) => parseApi.parse(description, csrfToken, signal),
    [parseApi, csrfToken],
  );
  const [state, rawDispatch] = useReducer(reducer, theme, (t) => ({
    ...reducer(initialState(t), { type: "navigate", screen: "dashboard" }),
    navigated: fresh,
  }));
  const dispatch = useCallback((a: Action) => {
    if (!isBlockedInRealMode(a)) rawDispatch(a);
  }, []);

  useEffect(() => {
    document.title = `${TITLES[state.screen]} · NudgeMyInvoice (fixture data)`;
  }, [state.screen]);

  useEffect(() => {
    const online = () => rawDispatch({ type: "set-offline", offline: false });
    const offline = () => rawDispatch({ type: "set-offline", offline: true });
    if (!navigator.onLine) offline();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  return (
    <AppProvider
      state={state}
      dispatch={dispatch}
      session={{
        username: session.operator.username,
        signOut,
        parse,
        save,
        getInvoice,
        sessionExpired: expire,
      }}
    >
      <SkipLink />
      <AppShell>
        <CurrentScreen screen={state.screen === "login" ? "dashboard" : state.screen} />
      </AppShell>
    </AppProvider>
  );
}

const noopDispatch = () => undefined;

export interface RealViewProps {
  state: AuthState;
  theme: Theme;
  login: (username: string, password: string, signal: AbortSignal) => Promise<AuthResult>;
  logout: () => void;
  expire?: (epoch: number) => void;
  parseApi?: ParseApi;
  invoiceApi?: InvoiceApi;
}

function StatusCard({ id, children }: { id: string; children: string }) {
  return (
    <section aria-labelledby={id}>
      <div className="login-wrap">
        <div className="card login-card" role="status" aria-live="polite">
          <h1 className="screen-title" id={id}>
            <Spinner /> {children}
          </h1>
        </div>
      </div>
    </section>
  );
}

/**
 * Pure view of the auth state. The protected workspace exists ONLY while `authenticated`: while a
 * sign-out is pending (`signing-out`) it is already gone, with every in-memory draft.
 */
export function RealView({
  state,
  theme,
  login,
  logout,
  expire = noopDispatch,
  parseApi = defaultParseApi,
  invoiceApi = defaultInvoiceApi,
}: RealViewProps) {
  if (state.status === "authenticated") {
    const epoch = state.epoch;
    return (
      <Workspace
        key={epoch}
        session={state.session}
        fresh={state.fresh}
        signOut={logout}
        expire={() => expire(epoch)}
        parseApi={parseApi}
        invoiceApi={invoiceApi}
        theme={theme}
      />
    );
  }
  return (
    <AppProvider state={initialState(theme)} dispatch={noopDispatch}>
      <SkipLink />
      <AppShell>
        {state.status === "checking" ? (
          <StatusCard id="checking-title">Checking your session…</StatusCard>
        ) : state.status === "signing-out" ? (
          <StatusCard id="signing-out-title">Signing out…</StatusCard>
        ) : (
          <RealLoginScreen
            key={state.epoch}
            notice={state.notice}
            retryAfter={state.retryAfter}
            login={login}
          />
        )}
      </AppShell>
    </AppProvider>
  );
}

/**
 * Real application root. Nothing protected renders until the SERVER has confirmed a session; the URL
 * hash, direct links and demo controls have no influence on that decision.
 */
export function RealApp({
  api = defaultApi,
  parseApi = defaultParseApi,
  invoiceApi = defaultInvoiceApi,
}: {
  api?: AuthApi;
  parseApi?: ParseApi;
  invoiceApi?: InvoiceApi;
}) {
  const auth = useAuthController(api);
  const [theme] = useState(systemTheme);
  const { state } = auth;

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);
  useEffect(() => {
    if (state.status !== "authenticated")
      document.title = `${
        state.status === "checking"
          ? "Checking session"
          : state.status === "signing-out"
            ? "Signing out"
            : "Operator sign in"
      } · NudgeMyInvoice`;
  }, [state.status]);

  return (
    <RealView
      state={state}
      theme={theme}
      login={auth.login}
      logout={auth.logout}
      expire={auth.expire}
      parseApi={parseApi}
      invoiceApi={invoiceApi}
    />
  );
}
