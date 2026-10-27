import { describe, expect, it } from "vitest";
import type { Session } from "./api.js";
import { authReducer, initialAuthState } from "./authState.js";

const session: Session = {
  operator: { id: "op", username: "operator" },
  csrfToken: "csrf",
  expiresAtMs: 1,
};

describe("auth state", () => {
  it("starts in `checking` with no session: nothing protected is revealed before the server answers", () => {
    expect(initialAuthState.status).toBe("checking");
    expect(initialAuthState.session).toBeNull();
  });

  it("is authenticated only through a server session payload", () => {
    const restored = authReducer(initialAuthState, { type: "session-restored", session });
    expect(restored).toMatchObject({ status: "authenticated", fresh: false });
    const signedIn = authReducer(initialAuthState, { type: "signed-in", session });
    expect(signedIn).toMatchObject({ status: "authenticated", fresh: true });
  });

  it("every end of a session drops the session and bumps the epoch that keys (and so resets) the workspace", () => {
    const authed = authReducer(initialAuthState, { type: "signed-in", session });
    for (const notice of ["signed-out", "session-expired", "logout-unconfirmed"] as const) {
      const ended = authReducer(authed, { type: "ended", notice });
      expect(ended.status).toBe("anonymous");
      expect(ended.session).toBeNull();
      expect(ended.notice).toBe(notice);
      expect(ended.epoch).toBeGreaterThan(authed.epoch);
    }
  });

  it("a failed restore stays anonymous with the failure notice and no session", () => {
    const s = authReducer(initialAuthState, { type: "no-session", notice: "unavailable" });
    expect(s).toMatchObject({ status: "anonymous", session: null, notice: "unavailable" });
  });

  it("a re-authentication after expiry gets a new epoch (no draft survives from the old one)", () => {
    const a = authReducer(initialAuthState, { type: "signed-in", session });
    const gone = authReducer(a, { type: "ended", notice: "session-expired" });
    const b = authReducer(gone, { type: "signed-in", session });
    expect(new Set([a.epoch, gone.epoch, b.epoch]).size).toBe(3);
  });
});
