import { useState, type FormEvent } from "react";
import { Notice } from "../../components/Notice.js";
import { useFocusOnMount, useScheduler } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";
import type { LoginNotice } from "../../demo/appState.js";

function NoticeFor({ kind }: { kind: LoginNotice }) {
  switch (kind) {
    case "login-error":
      return (
        <Notice kind="err" role="alert">
          <strong>Sign-in failed.</strong> The username or password is incorrect. (Demo of HTTP 401{" "}
          <code>invalid_credentials</code>: the same message is shown whichever of the two is
          wrong.)
        </Notice>
      );
    case "login-throttled":
      return (
        <Notice kind="warn" role="alert">
          <strong>Too many sign-in attempts.</strong> Wait about 30 seconds, then try again. (Demo
          of HTTP 429 <code>too_many_attempts</code> with a Retry-After header.)
        </Notice>
      );
    case "session-expired":
      return (
        <Notice kind="warn" role="status">
          <strong>Your session has expired.</strong> Sign in again to continue. Unsaved edits are
          not kept by the server.
        </Notice>
      );
    case "signed-out":
      return (
        <Notice kind="ok" role="status">
          You have been signed out.
        </Notice>
      );
  }
}

export function LoginScreen() {
  const { state, dispatch, announce } = useApp();
  const schedule = useScheduler();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<LoginNotice | null>(null);
  const notice = local ?? state.loginNotice;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (!username.trim()) next.username = "Enter your username.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (next.username || next.password) {
      document.getElementById(next.username ? "login-username" : "login-password")?.focus();
      return;
    }
    if (state.offline) {
      setLocal(null);
      announce("You appear to be offline. Sign-in needs a connection.");
      return;
    }
    setBusy(true);
    announce("Signing in");
    schedule(() => {
      setBusy(false);
      setPassword("");
      if (state.scenario === "login-error" || state.scenario === "login-throttled") {
        setLocal(state.scenario);
        document.getElementById("login-password")?.focus();
        return;
      }
      dispatch({ type: "sign-in" });
    }, 500);
  };

  return (
    <section aria-labelledby="login-title">
      <div className="login-wrap">
        <div className="card login-card">
          <div className="login-head">
            <div className="brand-mark" aria-hidden="true">
              N
            </div>
            <h1 className="screen-title" id="login-title" tabIndex={-1} ref={headingRef}>
              Operator sign in
            </h1>
            <p className="subtitle">Single-operator console for the PayPal Sandbox demo</p>
          </div>
          <Notice kind="info" role="note" icon="ℹ" className="notice-compact">
            <strong>Simulated sign-in.</strong> This shell uses fixtures: any non-empty username and
            password continue, and nothing is sent anywhere.
          </Notice>
          {notice ? <NoticeFor kind={notice} /> : null}
          <form onSubmit={submit} noValidate autoComplete="on">
            <div className="field">
              <label htmlFor="login-username">
                Username{" "}
                <span className="req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="input"
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={64}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={errors.username ? true : undefined}
                aria-describedby="err-login-username"
              />
              <p className="field-error" id="err-login-username" hidden={!errors.username}>
                {errors.username}
              </p>
            </div>
            <div className="field">
              <label htmlFor="login-password">
                Password{" "}
                <span className="req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="input"
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby="err-login-password"
              />
              <p className="field-error" id="err-login-password" hidden={!errors.password}>
                {errors.password}
              </p>
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="hint mt-16 text-center">
            The real form will post <code>username</code> and <code>password</code> to{" "}
            <code>POST /api/auth/login</code> in a later, separately approved phase.
          </p>
        </div>
      </div>
    </section>
  );
}
