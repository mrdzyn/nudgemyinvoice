import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthApi, LogoutResult, Session } from "./api.js";
import { authReducer, initialAuthState, type AuthAction, type AuthState } from "./authState.js";
import { LOGOUT_TIMEOUT_MS, createLogoutRunner, performLogout } from "./logout.js";

/**
 * Objective (audit MEDIUM-1): clicking Sign out locks the browser IMMEDIATELY, before and
 * independent of the network. Server revocation continues with the CSRF token, is reported as
 * confirmed only on HTTP 204, is bounded in time, and duplicate or stale results are ignored.
 * A deferred logout Promise stands in for the network so every moment is deterministic.
 */
const session: Session = {
  operator: { id: "op", username: "operator" },
  csrfToken: "csrf-A",
  expiresAtMs: 1,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

/** A fake AuthApi whose logout stays pending until the test settles it. */
function harness() {
  const d = deferred<LogoutResult>();
  const calls: { csrf: string; signal: AbortSignal }[] = [];
  const api: AuthApi = {
    getSession: () => Promise.reject(new Error("unused")),
    login: () => Promise.reject(new Error("unused")),
    logout: (csrf, signal) => {
      calls.push({ csrf, signal });
      return d.promise;
    },
  };
  let state: AuthState = authReducer(initialAuthState, { type: "signed-in", session });
  const actions: AuthAction[] = [];
  const dispatch = (a: AuthAction) => {
    actions.push(a);
    state = authReducer(state, a);
  };
  const runner = createLogoutRunner(api, dispatch);
  const click = () => runner.start(state.status === "authenticated" ? state.session : null);
  return {
    d,
    calls,
    runner,
    click,
    actions,
    get state() {
      return state;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sign-out locks the browser before the network answers", () => {
  it("the click leaves `authenticated` synchronously, while the request is still pending", async () => {
    const h = harness();
    expect(h.state.status).toBe("authenticated");
    expect(h.click()).toBe(true);
    // No await has happened: the lock must already be in place.
    expect(h.state.status).toBe("signing-out");
    await flush();
    expect(h.calls).toHaveLength(1);
    expect(h.state.status).toBe("signing-out"); // still pending, still locked
    expect(h.actions.map((a) => a.type)).toEqual(["sign-out-started"]);
  });

  it("the revocation request still carries the CSRF token held privately in memory", async () => {
    const h = harness();
    h.click();
    await flush();
    expect(h.calls[0]?.csrf).toBe("csrf-A");
  });

  it("stays locked (never back to authenticated) for as long as the request is pending", async () => {
    const h = harness();
    h.click();
    await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS - 1);
    expect(h.state.status).toBe("signing-out");
  });
});

describe("outcomes", () => {
  it("204 -> confirmed 'signed-out'", async () => {
    const h = harness();
    h.click();
    h.d.resolve({ kind: "ok" });
    await flush();
    expect(h.state).toMatchObject({ status: "anonymous", session: null, notice: "signed-out" });
  });

  it("401 -> the session had already ended", async () => {
    const h = harness();
    h.click();
    h.d.resolve({ kind: "unauthorized" });
    await flush();
    expect(h.state).toMatchObject({ status: "anonymous", notice: "session-expired" });
  });

  it.each([
    ["403", { kind: "forbidden" }],
    ["503", { kind: "unavailable" }],
    ["offline", { kind: "offline" }],
    ["429", { kind: "throttled", retryAfterSeconds: 3 }],
    ["aborted", { kind: "aborted" }],
  ] as const)(
    "%s -> unconfirmed, never a success claim and never the old workspace",
    async (_n, result) => {
      const h = harness();
      h.click();
      h.d.resolve(result);
      await flush();
      expect(h.state).toMatchObject({
        status: "anonymous",
        session: null,
        notice: "logout-unconfirmed",
      });
      expect(h.actions.some((a) => a.type === "ended" && a.notice === "signed-out")).toBe(false);
    },
  );
});

describe("bounded wait", () => {
  it("a transport that never answers is reported as unconfirmed at the timeout and aborted", async () => {
    const h = harness();
    h.click();
    await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS);
    expect(h.state).toMatchObject({
      status: "anonymous",
      session: null,
      notice: "logout-unconfirmed",
    });
    expect(h.calls[0]?.signal.aborted).toBe(true);
  });

  it("a late 204 after the timeout is ignored (no second transition, notice unchanged)", async () => {
    const h = harness();
    h.click();
    await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS);
    const epoch = h.state.epoch;
    h.d.resolve({ kind: "ok" });
    await flush();
    expect(h.state.epoch).toBe(epoch);
    expect(h.state.notice).toBe("logout-unconfirmed");
    expect(h.actions.filter((a) => a.type === "ended")).toHaveLength(1);
  });

  it("an answer before the timeout clears the timer (nothing fires later)", async () => {
    const h = harness();
    h.click();
    h.d.resolve({ kind: "ok" });
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS * 2);
    expect(h.actions.filter((a) => a.type === "ended")).toHaveLength(1);
  });

  it("performLogout alone always settles, even if the transport ignores the abort signal", async () => {
    const never: AuthApi = {
      getSession: () => new Promise(() => undefined),
      login: () => new Promise(() => undefined),
      logout: () => new Promise(() => undefined),
    };
    const p = performLogout(never, "t", 50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBe("logout-unconfirmed");
  });
});

describe("duplicates and stale results", () => {
  it("rapid repeated clicks start exactly one request and one lock", async () => {
    const h = harness();
    // Three clicks in the same tick: the state variable the UI would read has not changed yet.
    const stale = h.state;
    const results = [
      h.runner.start(stale.session),
      h.runner.start(stale.session),
      h.runner.start(stale.session),
    ];
    await flush();
    expect(results).toEqual([true, false, false]);
    expect(h.calls).toHaveLength(1);
    expect(h.actions.filter((a) => a.type === "sign-out-started")).toHaveLength(1);
  });

  it("a click while already locked or signed out does nothing", async () => {
    const h = harness();
    h.click();
    expect(h.click()).toBe(false);
    h.d.resolve({ kind: "ok" });
    await flush();
    expect(h.click()).toBe(false); // anonymous: no session to revoke
    expect(h.calls).toHaveLength(1);
  });

  it("abort() (unmount) discards a later result without dispatching", async () => {
    const h = harness();
    h.click();
    h.runner.abort();
    h.d.resolve({ kind: "ok" });
    await flush();
    expect(h.actions.map((a) => a.type)).toEqual(["sign-out-started"]);
  });
});

describe("fresh re-authentication after sign-out", () => {
  it("every end of a sign-out, confirmed or not, is followed by a brand-new workspace epoch", async () => {
    for (const result of [{ kind: "ok" }, { kind: "unavailable" }] as LogoutResult[]) {
      const h = harness();
      const before = h.state.epoch;
      h.click();
      h.d.resolve(result);
      await flush();
      expect(h.actions).toHaveLength(2); // sign-out-started + ended
      const next = authReducer(h.state, { type: "signed-in", session });
      expect(next).toMatchObject({ status: "authenticated", fresh: true });
      expect(new Set([before, h.state.epoch, next.epoch]).size).toBe(3);
    }
  });
});
