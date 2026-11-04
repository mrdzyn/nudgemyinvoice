import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditSink, createDb, PostgresAuthStore } from "@nmi/db";
import { createScratchDatabase, testDatabaseUrl, type ScratchDatabase } from "@nmi/db/testing";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv } from "./test-support.js";
import { provisionOperator } from "./auth/provision.js";

/** P5: the AG Studio licence is released only to an authenticated operator, uncached, and never logged. */
const url = testDatabaseUrl();
const password = randomBytes(16).toString("hex");
// Random per run: a synthetic stand-in, never the owner's licence.
const LICENCE = `synthetic-studio-licence-${randomBytes(24).toString("hex")}`;

describe.skipIf(!url)("GET /api/studio/licence (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let licensed: FastifyInstance;
  let unconfigured: FastifyInstance;
  let cookie = "";
  let logs = "";

  const sink = new Writable({
    write(chunk, _enc, cb) {
      logs += String(chunk);
      cb();
    },
  });

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 20);
    const db = createDb(scratch.pool);
    await provisionOperator(
      {
        store: new PostgresAuthStore(db),
        audit: createAuditSink(db),
        params: { N: 1024, r: 8, p: 1 },
      },
      { username: "studio-operator", password },
    );
    const env = { ...baseEnv, DATABASE_URL: url as string };
    licensed = buildApp(loadConfig({ ...env, AG_STUDIO_LICENSE_KEY: LICENCE }), {
      db,
      passwordParams: { N: 1024, r: 8, p: 1 },
      logStream: sink,
    });
    unconfigured = buildApp(loadConfig(env), { db, passwordParams: { N: 1024, r: 8, p: 1 } });
    const r = await licensed.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: baseEnv.WEB_ORIGIN },
      payload: { username: "studio-operator", password },
    });
    expect(r.statusCode, r.body).toBe(200);
    cookie = `nmi_session=${r.cookies.find((c) => c.name === "nmi_session")?.value ?? ""}`;
  });

  afterAll(async () => {
    await licensed?.close();
    await unconfigured?.close();
    await scratch?.drop();
  });

  const get = (app: FastifyInstance, headers: Record<string, string>) =>
    app.inject({ method: "GET", url: "/api/studio/licence", headers });

  it("refuses an anonymous request without revealing the licence", async () => {
    const r = await get(licensed, { "x-nmi-studio": "1" });
    expect(r.statusCode).toBe(401);
    expect(r.body).not.toContain(LICENCE);
  });

  it("refuses a forged or stale session cookie", async () => {
    const r = await get(licensed, { "x-nmi-studio": "1", cookie: "nmi_session=forged" });
    expect(r.statusCode).toBe(401);
    expect(r.body).not.toContain(LICENCE);
  });

  it("requires the custom header even for the signed-in operator", async () => {
    const r = await get(licensed, { cookie });
    expect(r.statusCode).toBe(400);
    expect(r.body).not.toContain(LICENCE);
  });

  it("releases the licence to the signed-in operator, never cacheable", async () => {
    const r = await get(licensed, { cookie, "x-nmi-studio": "1" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ licenseKey: LICENCE });
    expect(r.headers["cache-control"]).toBe("no-store, private");
    expect(r.headers["pragma"]).toBe("no-cache");
    expect(String(r.headers["vary"])).toContain("cookie");
    expect(r.headers["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it("does not let another origin send the custom header (CORS preflight not granted)", async () => {
    const r = await licensed.inject({
      method: "OPTIONS",
      url: "/api/studio/licence",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-nmi-studio",
      },
    });
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
    expect(String(r.headers["access-control-allow-headers"] ?? "")).not.toContain("x-nmi-studio");
  });

  it("answers 404 (no key) when the server has no licence configured", async () => {
    const login = await unconfigured.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: baseEnv.WEB_ORIGIN },
      payload: { username: "studio-operator", password },
    });
    const c = `nmi_session=${login.cookies.find((x) => x.name === "nmi_session")?.value ?? ""}`;
    const r = await get(unconfigured, { cookie: c, "x-nmi-studio": "1" });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: "studio_licence_not_configured" });
    expect(r.headers["cache-control"]).toBe("no-store, private");
  });

  it("never writes the licence value to the request logs", () => {
    expect(logs).toContain("/api/studio/licence");
    expect(logs).not.toContain(LICENCE);
  });
});
