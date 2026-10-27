import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { AuthApi, AuthResult } from "./api.js";
import { authReducer, initialAuthState, type AuthState } from "./authState.js";
import { createLogoutRunner } from "./logout.js";

const MAX_TIMER_MS = 2 ** 31 - 1;

export interface AuthController {
  state: AuthState;
  /** Resolves with the server outcome; on success the controller itself moves to `authenticated`. */
  login: (username: string, password: string, signal: AbortSignal) => Promise<AuthResult>;
  logout: () => void;
}

/**
 * Owns the operator session in volatile React memory only. The server decides everything: the
 * initial `GET /api/auth/session` runs before any protected UI is revealed, a 401 at any later
 * check drops the whole workspace, and local expiry is only a convenience (the cookie and the
 * server session expire on their own).
 */
export function useAuthController(api: AuthApi, now: () => number = Date.now): AuthController {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const stateRef = useRef(state);
  const runner = useMemo(() => createLogoutRunner(api, dispatch), [api]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Session restore. Cancelled on unmount, so a late response can never mutate state.
  useEffect(() => {
    const ac = new AbortController();
    void api.getSession(ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      switch (r.kind) {
        case "ok":
          dispatch({ type: "session-restored", session: r.session });
          break;
        case "unauthorized":
          dispatch({ type: "no-session", notice: null });
          break;
        case "offline":
          dispatch({ type: "no-session", notice: "offline" });
          break;
        case "aborted":
          break;
        default:
          dispatch({ type: "no-session", notice: "unavailable" });
      }
    });
    return () => ac.abort();
  }, [api]);

  // While authenticated: drop everything at expiry, and re-ask the server when the tab returns.
  const authedEpoch = state.status === "authenticated" ? state.epoch : null;
  useEffect(() => {
    const s = stateRef.current;
    if (s.status !== "authenticated") return;
    const ac = new AbortController();
    const timer = setTimeout(
      () => dispatch({ type: "ended", notice: "session-expired" }),
      Math.min(Math.max(s.session.expiresAtMs - now(), 0), MAX_TIMER_MS),
    );
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      void api.getSession(ac.signal).then((r) => {
        // Only a definite 401 ends the session; a transient outage must not wipe unsaved work.
        if (!ac.signal.aborted && r.kind === "unauthorized")
          dispatch({ type: "ended", notice: "session-expired" });
      });
    };
    document.addEventListener("visibilitychange", recheck);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", recheck);
      ac.abort();
    };
  }, [api, authedEpoch, now]);

  useEffect(() => () => runner.abort(), [runner]);

  const login = useCallback(
    async (username: string, password: string, signal: AbortSignal) => {
      const r = await api.login(username, password, signal);
      if (r.kind === "ok" && !signal.aborted) dispatch({ type: "signed-in", session: r.session });
      return r;
    },
    [api],
  );

  // Locks the UI synchronously (see createLogoutRunner); the network request follows.
  const logout = useCallback(() => {
    const s = stateRef.current;
    runner.start(s.status === "authenticated" ? s.session : null);
  }, [runner]);

  return { state, login, logout };
}
