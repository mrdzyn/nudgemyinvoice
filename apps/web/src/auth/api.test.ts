import { describe, expect, it } from "vitest";
import { createAuthApi, parseSession, type FetchLike } from "./api.js";

/**
 * Objective: the typed transport maps every documented server outcome to one fail-closed result,
 * sends exactly the documented same-origin request shape, and never invents a session.
 * (Simulated transport: real server/DB behaviour is covered by the browser journey in
 * design/evidence/NMI-UI-01C1.)
 */
const PAYLOAD = {
  operator: { id: "11111111-1111-4111-8111-111111111111", username: "operator" },
  csrfToken: "csrf-test-token",
  expiresAt: "2026-10-27T18:00:00.000Z",
};
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

interface Seen {
  url: string;
  init: RequestInit;
}
function recorder(respond: () => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const f: FetchLike = async (url, init) => {
    seen.push({ url, init });
    return respond();
  };
  return { api: createAuthApi(f), seen };
}
const sig = () => new AbortController().signal;

describe("parseSession", () => {
  it("accepts the documented payload", () => {
    expect(parseSession(PAYLOAD)).toEqual({
      operator: PAYLOAD.operator,
      csrfToken: "csrf-test-token",
      expiresAtMs: Date.parse(PAYLOAD.expiresAt),
    });
  });
  it.each([
    ["null", null],
    ["array", []],
    ["no operator", { ...PAYLOAD, operator: undefined }],
    ["numeric id", { ...PAYLOAD, operator: { id: 1, username: "x" } }],
    ["empty csrf", { ...PAYLOAD, csrfToken: "" }],
    ["missing csrf", { ...PAYLOAD, csrfToken: undefined }],
    ["bad date", { ...PAYLOAD, expiresAt: "tomorrow-ish" }],
    ["numeric date", { ...PAYLOAD, expiresAt: 5 }],
  ])("rejects %s", (_n, body) => {
    expect(parseSession(body)).toBeNull();
  });
});

describe("request shape", () => {
  it("login posts JSON to the relative same-origin route with cookies managed by the browser", async () => {
    const { api, seen } = recorder(() => json(200, PAYLOAD));
    const r = await api.login("operator", "pw-value", sig());
    expect(r.kind).toBe("ok");
    expect(seen).toHaveLength(1);
    const { url, init } = seen[0] as Seen;
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toEqual({ username: "operator", password: "pw-value" });
    expect(init.headers).toEqual({ "content-type": "application/json" });
  });

  it("session restore is a credentialed GET with no body and no CSRF header", async () => {
    const { api, seen } = recorder(() => json(200, PAYLOAD));
    await api.getSession(sig());
    const { url, init } = seen[0] as Seen;
    expect(url).toBe("/api/auth/session");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toBeUndefined();
  });

  it("logout sends the CSRF token header and no body", async () => {
    const { api, seen } = recorder(() => new Response(null, { status: 204 }));
    const r = await api.logout("csrf-test-token", sig());
    expect(r).toEqual({ kind: "ok" });
    const { url, init } = seen[0] as Seen;
    expect(url).toBe("/api/auth/logout");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "x-csrf-token": "csrf-test-token" });
    expect(init.body).toBeUndefined();
  });

  it("only ever requests relative /api/auth paths", async () => {
    const { api, seen } = recorder(() => json(200, PAYLOAD));
    await api.getSession(sig());
    await api.login("a", "b", sig());
    for (const s of seen) expect(s.url).toMatch(/^\/api\/auth\/(session|login|logout)$/);
  });
});

describe("outcome mapping", () => {
  it.each([
    [400, { error: "invalid_request" }, { kind: "invalid" }],
    [401, { error: "invalid_credentials" }, { kind: "unauthorized" }],
    [403, { error: "csrf_rejected" }, { kind: "forbidden" }],
    [503, { error: "unavailable" }, { kind: "unavailable" }],
    [500, { error: "x" }, { kind: "unavailable" }],
    [502, "<html>bad gateway</html>", { kind: "unavailable" }],
  ])("login %i", async (status, body, expected) => {
    const { api } = recorder(() => json(status, body));
    expect(await api.login("a", "b", sig())).toEqual(expected);
  });

  it("login 429 carries a validated Retry-After", async () => {
    const { api } = recorder(() =>
      json(429, { error: "too_many_attempts" }, { "retry-after": "42" }),
    );
    expect(await api.login("a", "b", sig())).toEqual({ kind: "throttled", retryAfterSeconds: 42 });
  });

  it.each(["", "soon", "-3", "1.5", "99999999"])(
    "ignores a malformed Retry-After %j",
    async (h) => {
      const { api } = recorder(() => json(429, {}, h ? { "retry-after": h } : {}));
      expect(await api.login("a", "b", sig())).toEqual({
        kind: "throttled",
        retryAfterSeconds: null,
      });
    },
  );

  it("a 200 with an invalid body never becomes a session", async () => {
    for (const body of [{}, { operator: { id: "x" } }, "ok", null]) {
      const { api } = recorder(() => json(200, body));
      expect(await api.login("a", "b", sig())).toEqual({ kind: "unavailable" });
      expect(await api.getSession(sig())).toEqual({ kind: "unavailable" });
    }
  });

  it("a 200 that is not JSON never becomes a session", async () => {
    const { api } = recorder(() => new Response("not json", { status: 200 }));
    expect(await api.getSession(sig())).toEqual({ kind: "unavailable" });
  });

  it("session restore maps 401 to unauthorized and 503 to unavailable", async () => {
    expect(await recorder(() => json(401, {})).api.getSession(sig())).toEqual({
      kind: "unauthorized",
    });
    expect(await recorder(() => json(503, {})).api.getSession(sig())).toEqual({
      kind: "unavailable",
    });
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [503, "unavailable"],
    [500, "unavailable"],
    [200, "unavailable"], // logout success is exactly 204
  ])("logout %i is never reported as success", async (status, kind) => {
    const { api } = recorder(() => json(status, {}));
    expect((await api.logout("t", sig())).kind).toBe(kind);
  });

  it("a network failure is offline; an aborted request is aborted", async () => {
    const down: FetchLike = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await createAuthApi(down).login("a", "b", sig())).toEqual({ kind: "offline" });
    const ac = new AbortController();
    const aborting: FetchLike = (_u, init) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () =>
          rej(new DOMException("aborted", "AbortError")),
        );
      });
    const p = createAuthApi(aborting).getSession(ac.signal);
    ac.abort();
    expect(await p).toEqual({ kind: "aborted" });
  });

  it("error results never echo server-provided text", async () => {
    const { api } = recorder(() => json(401, { error: "SECRET-DETAIL", message: "SECRET-DETAIL" }));
    expect(JSON.stringify(await api.login("a", "b", sig()))).not.toContain("SECRET");
  });
});
