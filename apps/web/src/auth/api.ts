/**
 * Typed same-origin transport for the three operator-auth routes. This is the ONLY module in the
 * web app allowed to call fetch. It uses relative `/api` URLs, lets the browser manage the HttpOnly
 * session cookie, and never reads, logs or stores credentials, cookies or the CSRF token.
 */
export interface Session {
  operator: { id: string; username: string };
  csrfToken: string;
  /** Epoch milliseconds. */
  expiresAtMs: number;
}

export type AuthResult =
  | { kind: "ok"; session: Session }
  | { kind: "unauthorized" } // 401: no or invalid credentials / session
  | { kind: "invalid" } // 400: request rejected as malformed
  | { kind: "forbidden" } // 403: Origin or CSRF rejected
  | { kind: "throttled"; retryAfterSeconds: number | null } // 429
  | { kind: "unavailable" } // 503, other server errors, unparsable body
  | { kind: "offline" } // network failure
  | { kind: "aborted" };

export type LogoutResult =
  { kind: "ok" } | Exclude<AuthResult, { kind: "ok" } | { kind: "invalid" }> | { kind: "invalid" };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates the success payload shared by login and session restore. Anything else fails closed. */
export function parseSession(body: unknown): Session | null {
  if (!isRecord(body)) return null;
  const { operator, csrfToken, expiresAt } = body;
  if (!isRecord(operator)) return null;
  if (typeof operator["id"] !== "string" || typeof operator["username"] !== "string") return null;
  if (typeof csrfToken !== "string" || csrfToken.length === 0) return null;
  if (typeof expiresAt !== "string") return null;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;
  return {
    operator: { id: operator["id"], username: operator["username"] },
    csrfToken,
    expiresAtMs,
  };
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (raw === null || !/^\d{1,5}$/.test(raw.trim())) return null;
  return Number(raw);
}

function classifyError(status: number, res: Response): AuthResult {
  if (status === 400) return { kind: "invalid" };
  if (status === 401) return { kind: "unauthorized" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 429) return { kind: "throttled", retryAfterSeconds: retryAfter(res) };
  return { kind: "unavailable" };
}

export interface AuthApi {
  getSession(signal: AbortSignal): Promise<AuthResult>;
  login(username: string, password: string, signal: AbortSignal): Promise<AuthResult>;
  logout(csrfToken: string, signal: AbortSignal): Promise<LogoutResult>;
}

export function createAuthApi(doFetch: FetchLike = (input, init) => fetch(input, init)): AuthApi {
  const base: RequestInit = { credentials: "same-origin", cache: "no-store", redirect: "error" };

  async function call(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response | "aborted" | "offline"> {
    try {
      return await doFetch(path, { ...base, ...init, signal });
    } catch {
      return signal.aborted ? "aborted" : "offline";
    }
  }

  async function sessionResult(res: Response): Promise<AuthResult> {
    if (res.status !== 200) return classifyError(res.status, res);
    try {
      const session = parseSession(await res.json());
      return session ? { kind: "ok", session } : { kind: "unavailable" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  return {
    async getSession(signal) {
      const res = await call("/api/auth/session", { method: "GET" }, signal);
      if (typeof res === "string") return { kind: res };
      return sessionResult(res);
    },
    async login(username, password, signal) {
      const res = await call(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
        signal,
      );
      if (typeof res === "string") return { kind: res };
      return sessionResult(res);
    },
    async logout(csrfToken, signal) {
      const res = await call(
        "/api/auth/logout",
        { method: "POST", headers: { "x-csrf-token": csrfToken } },
        signal,
      );
      if (typeof res === "string") return { kind: res };
      if (res.status === 204) return { kind: "ok" };
      const r = classifyError(res.status, res);
      return r.kind === "ok" ? { kind: "unavailable" } : r;
    },
  };
}
