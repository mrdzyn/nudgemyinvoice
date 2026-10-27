import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import type { Action, AppState } from "./appState.js";

/** Present only in real (server-authenticated) mode. */
export interface SessionInfo {
  username: string;
  signOut: () => void;
}

interface AppContextValue {
  state: AppState;
  session: SessionInfo | null;
  dispatch: Dispatch<Action>;
  /** Politely announce a status change to assistive technology. */
  announce: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  state,
  dispatch,
  session = null,
  children,
}: {
  state: AppState;
  dispatch: Dispatch<Action>;
  session?: SessionInfo | null;
  children: ReactNode;
}) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((m: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage("");
    timer.current = setTimeout(() => setMessage(m), 30);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <AppContext.Provider value={{ state, session, dispatch, announce }}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" data-testid="live-region">
        {message}
      </div>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
