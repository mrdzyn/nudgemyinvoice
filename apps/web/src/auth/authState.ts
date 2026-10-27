import type { Session } from "./api.js";

/** Why the login screen is showing. None of these carries credentials or customer data. */
export type AuthNotice =
  | "signed-out"
  | "session-expired"
  | "login-error"
  | "login-invalid"
  | "login-throttled"
  | "unavailable"
  | "offline"
  | "logout-unconfirmed";

export type AuthState =
  | { status: "checking"; session: null; notice: null; epoch: number; retryAfter: null }
  | {
      status: "anonymous";
      session: null;
      notice: AuthNotice | null;
      epoch: number;
      retryAfter: number | null;
    }
  | {
      status: "authenticated";
      session: Session;
      notice: null;
      epoch: number;
      retryAfter: null;
      /** True right after an interactive sign-in (move focus into the workspace); false on restore. */
      fresh: boolean;
    };

export type AuthAction =
  | { type: "session-restored"; session: Session }
  | { type: "no-session"; notice: AuthNotice | null; retryAfter?: number | null }
  | { type: "signed-in"; session: Session }
  | { type: "ended"; notice: AuthNotice };

/**
 * Pure auth state. The server is the only authority: `authenticated` is reachable solely through a
 * validated server session payload. Every transition away from `authenticated` bumps `epoch`, which
 * keys the protected workspace so ALL in-memory drafts, composer text and review state are dropped.
 */
export const initialAuthState: AuthState = {
  status: "checking",
  session: null,
  notice: null,
  epoch: 0,
  retryAfter: null,
};

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  const epoch = state.epoch + 1;
  switch (action.type) {
    case "session-restored":
    case "signed-in":
      return {
        status: "authenticated",
        session: action.session,
        notice: null,
        epoch,
        retryAfter: null,
        fresh: action.type === "signed-in",
      };
    case "no-session":
      return {
        status: "anonymous",
        session: null,
        notice: action.notice,
        epoch,
        retryAfter: action.retryAfter ?? null,
      };
    case "ended":
      return { status: "anonymous", session: null, notice: action.notice, epoch, retryAfter: null };
  }
}
