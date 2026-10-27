import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AuthResult } from "../../auth/api.js";
import type { AuthNotice } from "../../auth/authState.js";
import { Notice } from "../../components/Notice.js";
import { useFocusOnMount } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";

function NoticeFor({ kind, retryAfter }: { kind: AuthNotice; retryAfter: number | null }) {
  switch (kind) {
    case "login-error":
      return (
        <Notice kind="err" role="alert">
          <strong>Sign-in failed.</strong> The username or password is incorrect.
        </Notice>
      );
    case "login-invalid":
      return (
        <Notice kind="err" role="alert">
          <strong>Sign-in failed.</strong> The request could not be processed. Check both fields and
          try again.
        </Notice>
      );
    case "login-throttled":
      return (
        <Notice kind="warn" role="alert">
          <strong>Too many sign-in attempts.</strong>{" "}
          {retryAfter !== null
            ? `Wait about ${retryAfter} second${retryAfter === 1 ? "" : "s"}, then try again.`
            : "Wait a moment, then try again."}
        </Notice>
      );
    case "unavailable":
      return (
        <Notice kind="err" role="alert">
          <strong>The server is unavailable.</strong> Sign-in could not be completed. Try again
          shortly.
        </Notice>
      );
    case "offline":
      return (
        <Notice kind="warn" role="alert">
          <strong>You appear to be offline.</strong> Sign-in needs a connection to the server.
        </Notice>
      );
    case "session-expired":
      return (
        <Notice kind="warn" role="status">
          <strong>Your session has ended.</strong> Sign in again to continue. Unsaved edits are not
          kept.
        </Notice>
      );
    case "logout-unconfirmed":
      return (
        <Notice kind="warn" role="alert">
          <strong>Sign-out could not be confirmed.</strong> This browser no longer shows your work,
          but the server session may remain valid until it expires or is revoked.
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

function noticeForResult(r: AuthResult): { notice: AuthNotice; retryAfter: number | null } | null {
  switch (r.kind) {
    case "unauthorized":
    case "forbidden":
      return { notice: "login-error", retryAfter: null };
    case "invalid":
      return { notice: "login-invalid", retryAfter: null };
    case "throttled":
      return { notice: "login-throttled", retryAfter: r.retryAfterSeconds };
    case "offline":
      return { notice: "offline", retryAfter: null };
    case "unavailable":
      return { notice: "unavailable", retryAfter: null };
    case "ok":
    case "aborted":
      return null;
  }
}

export interface RealLoginProps {
  notice: AuthNotice | null;
  retryAfter: number | null;
  login: (username: string, password: string, signal: AbortSignal) => Promise<AuthResult>;
}

/** Real operator sign-in: posts to `POST /api/auth/login` through the injected transport. */
export function RealLoginScreen({
  notice: initial,
  retryAfter: initialRetry,
  login,
}: RealLoginProps) {
  const { announce } = useApp();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(initial !== null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<{ notice: AuthNotice; retryAfter: number | null } | null>(
    null,
  );
  const inFlight = useRef<AbortController | null>(null);
  const shown = local ?? (initial ? { notice: initial, retryAfter: initialRetry } : null);

  // Cancel any pending request when the screen goes away.
  useEffect(() => () => inFlight.current?.abort(), []);

  const submit = async (e: FormEvent) => {
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
    const ac = new AbortController();
    inFlight.current = ac;
    setBusy(true);
    setLocal(null);
    announce("Signing in");
    let result: AuthResult;
    try {
      result = await login(username.trim(), password, ac.signal);
    } finally {
      // The secret never outlives the request, whatever the outcome.
      setPassword("");
    }
    if (inFlight.current === ac) inFlight.current = null;
    if (ac.signal.aborted) return;
    setBusy(false);
    const n = noticeForResult(result);
    if (n) {
      setLocal(n);
      document.getElementById("login-password")?.focus();
    }
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
          {shown ? <NoticeFor kind={shown.notice} retryAfter={shown.retryAfter} /> : null}
          <form onSubmit={(e) => void submit(e)} noValidate autoComplete="on">
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
            Credentials are sent only to this site&apos;s own server and are never stored in the
            browser.
          </p>
        </div>
      </div>
    </section>
  );
}
