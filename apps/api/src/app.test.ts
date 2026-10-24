import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import pg from "pg";
import { createDb, type AuditEvent } from "@nmi/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

export const baseEnv = {
  NODE_ENV: "test",
  PAYPAL_ENV: "sandbox",
  PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
  OPENAI_API_KEY: "sk-test-secret-value",
  OPENAI_MODEL: "m",
  DATABASE_URL: "postgres://nobody@127.0.0.1:1/nmi_test_unused",
  // Random per run: no secret-looking literal lives in the repository.
  SESSION_SECRET: randomBytes(32).toString("hex"),
  WEB_ORIGIN: "http://localhost:5173",
};

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
  it("marks cookies Secure for production or https origins and normalizes the web origin", () => {
    expect(loadConfig(baseEnv).cookieSecure).toBe(false);
    expect(loadConfig({ ...baseEnv, NODE_ENV: "production" }).cookieSecure).toBe(true);
    const https = loadConfig({ ...baseEnv, WEB_ORIGIN: "https://app.example.com/some/path" });
    expect(https.cookieSecure).toBe(true);
    expect(https.webOrigin).toBe("https://app.example.com");
  });
});
