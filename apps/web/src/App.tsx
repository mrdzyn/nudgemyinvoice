import { useEffect, useReducer } from "react";
import { AppShell } from "./components/AppShell.js";
import { AppProvider } from "./demo/AppContext.js";
import { DemoControls } from "./demo/DemoControls.js";
import { reducer } from "./demo/appState.js";
import { hashFor, parseHash, stateFromHash } from "./demo/hash.js";
import { LoginScreen } from "./features/login/LoginScreen.js";
import { CurrentScreen, SkipLink, TITLES } from "./screens.js";

/**
 * SYNTHETIC PREVIEW (NMI-UI-01B shell), development-only: reached only through the explicit
 * `VITE_NMI_SYNTHETIC_PREVIEW=1` dev toggle in main.tsx, never in a production build and never as
 * a fallback for the real sign-in. Its "sign-in" is a simulation and is NOT authentication. All
 * data is synthetic and every "server" result is simulated in memory: this component tree never
 * performs a network request and never touches browser storage.
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
      <SkipLink />
      <DemoControls />
      <AppShell>
        {state.screen === "login" ? <LoginScreen /> : <CurrentScreen screen={state.screen} />}
      </AppShell>
    </AppProvider>
  );
}
