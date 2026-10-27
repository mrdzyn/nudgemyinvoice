import { useEffect, useReducer } from "react";
import { AppShell } from "./components/AppShell.js";
import { AppProvider } from "./demo/AppContext.js";
import { DemoControls } from "./demo/DemoControls.js";
import { reducer, type Screen } from "./demo/appState.js";
import { hashFor, parseHash, stateFromHash } from "./demo/hash.js";
import { ComposerScreen } from "./features/composer/ComposerScreen.js";
import { DashboardScreen } from "./features/dashboard/DashboardScreen.js";
import { DetailScreen } from "./features/detail/DetailScreen.js";
import { LoginScreen } from "./features/login/LoginScreen.js";
import { ReviewScreen } from "./features/review/ReviewScreen.js";

const TITLES: Record<Screen, string> = {
  login: "Operator sign in",
  dashboard: "Invoice drafts",
  composer: "New invoice",
  review: "Review invoice",
  detail: "Invoice draft",
};

function CurrentScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case "login":
      return <LoginScreen />;
    case "dashboard":
      return <DashboardScreen />;
    case "composer":
      return <ComposerScreen />;
    case "review":
      return <ReviewScreen />;
    case "detail":
      return <DetailScreen />;
  }
}

/**
 * NMI-UI-01B shell. All data is synthetic and every "server" result is simulated in memory: this
 * component tree never performs a network request and never touches browser storage.
 * `initialHash` exists so tests can render a specific screen/state without a browser.
 */
export function App({ initialHash }: { initialHash?: string }) {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    stateFromHash(
      initialHash ?? (typeof location === "undefined" ? "" : location.hash),
      typeof matchMedia === "undefined"
        ? false
        : matchMedia("(prefers-color-scheme: dark)").matches,
    ),
  );

  useEffect(() => {
    document.documentElement.dataset["theme"] = state.theme;
  }, [state.theme]);

  useEffect(() => {
    document.title = `${TITLES[state.screen]} · NudgeMyInvoice (demo)`;
    const next = hashFor(state);
    if (location.hash !== next) history.replaceState(null, "", next);
  }, [state]);

  useEffect(() => {
    const online = () => dispatch({ type: "set-offline", offline: false });
    const offline = () => dispatch({ type: "set-offline", offline: true });
    if (!navigator.onLine) offline();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    const onHash = () => {
      if (location.hash === hashFor(state)) return;
      const h = parseHash(location.hash);
      if (h.theme && h.theme !== state.theme) dispatch({ type: "set-theme", theme: h.theme });
      if (h.scenario !== "default" && h.scenario !== state.scenario)
        dispatch({ type: "scenario", id: h.scenario });
      else if (h.screen && h.screen !== state.screen)
        dispatch({ type: "navigate", screen: h.screen });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [state]);

  return (
    <AppProvider state={state} dispatch={dispatch}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to main content
      </a>
      <DemoControls />
      <AppShell>
        <CurrentScreen screen={state.screen} />
      </AppShell>
    </AppProvider>
  );
}
