import { useCallback, useEffect, useReducer, useState } from "react";
import { createAuthApi, type AuthApi, type Session } from "./auth/api.js";
import { useAuthController } from "./auth/useAuthController.js";
import { AppShell } from "./components/AppShell.js";
import { Spinner } from "./components/Spinner.js";
import { AppProvider } from "./demo/AppContext.js";
import { initialState, reducer, type Action, type Theme } from "./demo/appState.js";
import { RealLoginScreen } from "./features/login/RealLoginScreen.js";
import { CurrentScreen, SkipLink, TITLES } from "./screens.js";

const defaultApi = createAuthApi();

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
    (a.type === "navigate" && a.screen === "login")
  );
}

function Workspace({
  session,
  fresh,
  signOut,
  signingOut,
  theme,
}: {
  session: Session;
  fresh: boolean;
  signOut: () => void;
  signingOut: boolean;
  theme: Theme;
}) {
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
      session={{ username: session.operator.username, signOut, signingOut }}
    >
      <SkipLink />
      <AppShell>
        <CurrentScreen screen={state.screen === "login" ? "dashboard" : state.screen} />
      </AppShell>
    </AppProvider>
  );
}

const noopDispatch = () => undefined;

/**
 * Real application root. Nothing protected renders until the SERVER has confirmed a session; the URL
 * hash, direct links and demo controls have no influence on that decision.
 */
export function RealApp({ api = defaultApi }: { api?: AuthApi }) {
  const auth = useAuthController(api);
  const [theme] = useState(systemTheme);
  const { state } = auth;

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);
  useEffect(() => {
    if (state.status !== "authenticated")
      document.title = `${state.status === "checking" ? "Checking session" : "Operator sign in"} · NudgeMyInvoice`;
  }, [state.status]);

  if (state.status === "authenticated") {
    return (
      <Workspace
        key={state.epoch}
        session={state.session}
        fresh={state.fresh}
        signOut={auth.logout}
        signingOut={auth.signingOut}
        theme={theme}
      />
    );
  }

  return (
    <AppProvider state={initialState(theme)} dispatch={noopDispatch}>
      <SkipLink />
      <AppShell>
        {state.status === "checking" ? (
          <section aria-labelledby="checking-title">
            <div className="login-wrap">
              <div className="card login-card" role="status" aria-live="polite">
                <h1 className="screen-title" id="checking-title">
                  <Spinner /> Checking your session…
                </h1>
              </div>
            </div>
          </section>
        ) : (
          <RealLoginScreen
            key={state.epoch}
            notice={state.notice}
            retryAfter={state.retryAfter}
            login={auth.login}
          />
        )}
      </AppShell>
    </AppProvider>
  );
}
