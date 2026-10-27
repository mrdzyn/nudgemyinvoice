import type { AuthApi, Session } from "./api.js";
import type { AuthAction, AuthNotice } from "./authState.js";

/** Upper bound on how long a sign-out may stay pending before it is reported as unconfirmed. */
export const LOGOUT_TIMEOUT_MS = 10_000;

/**
 * Asks the server to revoke the session and maps the outcome to the notice the operator sees.
 * Only a 204 is "signed-out"; 401 means the session had already ended; everything else, including
 * running out of time, is "logout-unconfirmed". It always settles: the timeout wins the race even
 * if the transport never answers (and then aborts the request).
 */
export async function performLogout(
  api: AuthApi,
  csrfToken: string,
  timeoutMs: number = LOGOUT_TIMEOUT_MS,
): Promise<AuthNotice> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      ac.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const r = await Promise.race([api.logout(csrfToken, ac.signal), timeout]);
    if (r === "timeout") return "logout-unconfirmed";
    if (r.kind === "ok") return "signed-out";
    if (r.kind === "unauthorized") return "session-expired";
    return "logout-unconfirmed";
  } finally {
    clearTimeout(timer);
  }
}

export interface LogoutRunner {
  /** Returns false (and does nothing) when there is no session or a sign-out is already running. */
  start(session: Session | null): boolean;
  /** Cancels interest in a pending sign-out (unmount); no further action is dispatched. */
  abort(): void;
}

/**
 * Sign-out orchestration. `sign-out-started` is dispatched SYNCHRONOUSLY, before any await, so the
 * protected workspace is unmounted at once and never waits on the network. At most one logout runs
 * at a time; a duplicate click, or a result that arrives after `abort()`, is ignored.
 */
export function createLogoutRunner(
  api: AuthApi,
  dispatch: (a: AuthAction) => void,
  timeoutMs: number = LOGOUT_TIMEOUT_MS,
): LogoutRunner {
  let current: symbol | null = null;
  return {
    start(session) {
      if (!session || current) return false;
      const mine = Symbol("logout");
      current = mine;
      dispatch({ type: "sign-out-started" });
      void performLogout(api, session.csrfToken, timeoutMs).then((notice) => {
        if (current !== mine) return; // aborted or superseded: stale result
        current = null;
        dispatch({ type: "ended", notice });
      });
      return true;
    },
    abort() {
      current = null;
    },
  };
}
