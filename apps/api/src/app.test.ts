import { describe, expect, it } from "vitest";
import pg from "pg";
import { createDb, type AuditEvent } from "@nmi/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv } from "./test-support.js";

/** No database is reachable in these tests; a recording fake stands in for the audit sink. */
function offlineApp() {
  const events: AuditEvent[] = [];
  const pool = new pg.Pool({ connectionString: baseEnv.DATABASE_URL });
  const app = buildApp(loadConfig(baseEnv), {
    db: createDb(pool),
    audit: { record: async (e) => void events.push(e) },
  });
  return { app, events, pool };
}

describe("api (no database)", () => {
  it("GET /health reports sandbox and never leaks secrets", async () => {
    const { app, pool } = offlineApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", paypalEnvironment: "sandbox", aiConfigured: true });
    for (const secret of ["sk-test-secret-value", baseEnv.SESSION_SECRET, baseEnv.DATABASE_URL]) {
      expect(res.body).not.toContain(secret);
    }
    await app.close();
    await pool.end();
  });

  it("anonymous requests to protected routes get 401 and an audit denial", async () => {
    const { app, events, pool } = offlineApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/session" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    expect(events).toMatchObject([
      { action: "auth.request_denied", outcome: "denied", actor: "anonymous" },
    ]);
    await app.close();
    await pool.end();
  });

  it("mutating requests with a missing or foreign Origin are rejected before any handler runs", async () => {
    const { app, events, pool } = offlineApp();
    for (const headers of [
      {},
      { origin: "https://evil.example" },
      { origin: "http://localhost:5174" },
    ]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers,
        payload: { username: "demo-operator", password: "x" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "origin_rejected" });
    }
    expect(events).toHaveLength(3);
    await app.close();
    await pool.end();
  });

  it("answers CORS preflight only for the configured web origin", async () => {
    const { app, pool } = offlineApp();
    const ok = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/login",
      headers: { origin: baseEnv.WEB_ORIGIN, "access-control-request-method": "POST" },
    });
    expect(ok.headers["access-control-allow-origin"]).toBe(baseEnv.WEB_ORIGIN);
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");
    const bad = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/login",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
    await pool.end();
  });

  it("answers browser CORS preflight for /api/invoice-drafts including Idempotency-Key", async () => {
    const { app, pool } = offlineApp();

    // Browser preflight with Content-Type, X-CSRF-Token, and Idempotency-Key from configured web origin
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/invoice-drafts",
      headers: {
        origin: baseEnv.WEB_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-csrf-token, idempotency-key",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(baseEnv.WEB_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const allowHeaders = String(res.headers["access-control-allow-headers"]).toLowerCase();
    expect(allowHeaders).toContain("content-type");
    expect(allowHeaders).toContain("x-csrf-token");
    expect(allowHeaders).toContain("idempotency-key");

    // Case-insensitive request headers (e.g. standard browser Capitalized casing)
    const mixedCase = await app.inject({
      method: "OPTIONS",
      url: "/api/invoice-drafts",
      headers: {
        origin: baseEnv.WEB_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "Content-Type, X-CSRF-Token, Idempotency-Key",
      },
    });
    expect(mixedCase.statusCode).toBe(204);
    expect(mixedCase.headers["access-control-allow-origin"]).toBe(baseEnv.WEB_ORIGIN);
    expect(mixedCase.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(mixedCase.headers["access-control-allow-headers"]).toLowerCase()).toContain(
      "idempotency-key",
    );

    // Disallowed origin does not receive CORS authorization
    const badOrigin = await app.inject({
      method: "OPTIONS",
      url: "/api/invoice-drafts",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-csrf-token, idempotency-key",
      },
    });
    expect(badOrigin.headers["access-control-allow-origin"]).toBeUndefined();
    expect(badOrigin.headers["access-control-allow-credentials"]).toBeUndefined();

    // Unknown request headers are not automatically added to the allowlist
    const unlisted = await app.inject({
      method: "OPTIONS",
      url: "/api/invoice-drafts",
      headers: {
        origin: baseEnv.WEB_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-unlisted-custom-header",
      },
    });
    expect(String(unlisted.headers["access-control-allow-headers"]).toLowerCase()).not.toContain(
      "x-unlisted-custom-header",
    );

    await app.close();
    await pool.end();
  });

  it("unknown audit-looking routes do not exist", async () => {
    const { app, pool } = offlineApp();
    for (const url of ["/api/audit", "/api/audit-log", "/audit", "/api/auth/audit"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    }
    await app.close();
    await pool.end();
  });
});

describe("config", () => {
  it("refuses to start against a live PayPal host or missing sandbox config", () => {
    expect(() =>
      loadConfig({ ...baseEnv, PAYPAL_API_BASE_URL: "https://api-m.paypal.com" }),
    ).toThrow();
    expect(() => loadConfig({ NODE_ENV: "test" })).toThrow();
  });
  it("reports AI as unconfigured without a key", () => {
    expect(loadConfig({ ...baseEnv, OPENAI_API_KEY: "" }).aiConfigured).toBe(false);
  });
  it("requires PostgreSQL and a strong session secret (no insecure authenticated mode)", () => {
    const { DATABASE_URL: _d, ...noDb } = baseEnv;
    void _d;
    expect(() => loadConfig(noDb)).toThrow();
    expect(() => loadConfig({ ...baseEnv, DATABASE_URL: "file:./data/x.sqlite" })).toThrow(
      /postgres/,
    );
    expect(() => loadConfig({ ...baseEnv, SESSION_SECRET: "short" })).toThrow(/32/);
    expect(() => loadConfig({ ...baseEnv, SESSION_SECRET: undefined })).toThrow();
  });
  it("keeps real PayPal sandbox drafting OFF by default and refuses to enable it without credentials", () => {
    const off = loadConfig(baseEnv);
    expect(off.paypalDraftsEnabled).toBe(false);
    expect(off.paypalCredentials).toBeNull();
    const credsButOff = loadConfig({
      ...baseEnv,
      PAYPAL_CLIENT_ID: "id-1234567890",
      PAYPAL_CLIENT_SECRET: "secret-1234567890",
    });
    expect(credsButOff.paypalDraftsEnabled).toBe(false);
    expect(credsButOff.paypalCredentials).toBeNull(); // credentials are not even loaded when disabled
    expect(() => loadConfig({ ...baseEnv, PAYPAL_DRAFTS_ENABLED: "true" })).toThrow(
      /PAYPAL_CLIENT_ID/,
    );
    expect(() =>
      loadConfig({ ...baseEnv, PAYPAL_DRAFTS_ENABLED: "true", PAYPAL_CLIENT_ID: "only-id" }),
    ).toThrow();
    expect(() => loadConfig({ ...baseEnv, PAYPAL_DRAFTS_ENABLED: "yes" })).toThrow();
    const on = loadConfig({
      ...baseEnv,
      PAYPAL_DRAFTS_ENABLED: "true",
      PAYPAL_CLIENT_ID: "id-1234567890",
      PAYPAL_CLIENT_SECRET: "secret-1234567890",
    });
    expect(on.paypalDraftsEnabled).toBe(true);
    expect(on.paypalCredentials).toEqual({
      clientId: "id-1234567890",
      clientSecret: "secret-1234567890",
    });
  });
  it("never allows a live PayPal host even with drafting enabled", () => {
    const enabled = {
      ...baseEnv,
      PAYPAL_DRAFTS_ENABLED: "true",
      PAYPAL_CLIENT_ID: "id-1234567890",
      PAYPAL_CLIENT_SECRET: "secret-1234567890",
    };
    expect(() =>
      loadConfig({ ...enabled, PAYPAL_API_BASE_URL: "https://api-m.paypal.com" }),
    ).toThrow();
    expect(() => loadConfig({ ...enabled, PAYPAL_ENV: "live" })).toThrow();
  });
  it("loads OpenAI settings only when both key and model are present", () => {
    expect(loadConfig({ ...baseEnv, OPENAI_API_KEY: "", OPENAI_MODEL: "m" }).openai).toBeNull();
    expect(
      loadConfig({ ...baseEnv, OPENAI_API_KEY: "sk-test-secret-value", OPENAI_MODEL: "" }).openai,
    ).toBeNull();
    expect(loadConfig(baseEnv).openai).toEqual({
      apiKey: "sk-test-secret-value",
      model: "m",
      maxOutputTokens: 1024,
    });
    expect(() => loadConfig({ ...baseEnv, OPENAI_MAX_OUTPUT_TOKENS: "999999" })).toThrow();
  });
  it("marks cookies Secure for production or https origins and normalizes the web origin", () => {
    expect(loadConfig(baseEnv).cookieSecure).toBe(false);
    expect(loadConfig({ ...baseEnv, NODE_ENV: "production" }).cookieSecure).toBe(true);
    const https = loadConfig({ ...baseEnv, WEB_ORIGIN: "https://app.example.com/some/path" });
    expect(https.cookieSecure).toBe(true);
    expect(https.webOrigin).toBe("https://app.example.com");
  });
});
