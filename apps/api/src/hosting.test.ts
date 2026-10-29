import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@nmi/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { baseEnv } from "./test-support.js";

/**
 * Objective (NMI-RENDER-P1, offline): the hosted shape of the app works on ONE origin. Config fails
 * closed for hosting mistakes; the built web app is served by Fastify with a SPA fallback that can
 * never shadow /api or /health; traversal and missing assets are 404; every response carries the
 * header-level security policy; the real server process binds loopback by default and the injected
 * PORT on 0.0.0.0 only when production explicitly says so. No network beyond localhost.
 */
const prodEnv = {
  ...baseEnv,
  NODE_ENV: "production",
  WEB_ORIGIN: "https://nmi-staging.example.com",
  OPENAI_API_KEY: "",
};
delete (prodEnv as Record<string, unknown>)["OPENAI_API_KEY"];
delete (prodEnv as Record<string, unknown>)["OPENAI_MODEL"];

describe("hosting configuration (fails closed)", () => {
  it("defaults to loopback, no web dist and no proxy trust", () => {
    const c = loadConfig(baseEnv);
    expect([c.host, c.webDistDir, c.trustProxy]).toEqual(["127.0.0.1", null, false]);
  });
  it("accepts a wildcard host only in production", () => {
    for (const host of ["0.0.0.0", "::"]) {
      expect(() => loadConfig({ ...baseEnv, HOST: host })).toThrow(
        /only accepted with NODE_ENV=production/,
      );
      expect(loadConfig({ ...prodEnv, HOST: host }).host).toBe(host);
    }
    expect(() => loadConfig({ ...baseEnv, HOST: "localhost" })).toThrow(/IP address/);
    expect(() => loadConfig({ ...baseEnv, HOST: "" })).toThrow();
  });
  it("reads the platform-injected PORT", () => {
    expect(loadConfig({ ...prodEnv, PORT: "10000" }).port).toBe(10000);
    expect(() => loadConfig({ ...prodEnv, PORT: "0" })).toThrow();
    expect(() => loadConfig({ ...prodEnv, PORT: "abc" })).toThrow();
  });
  it("production requires an https WEB_ORIGIN and never trusts every proxy hop", () => {
    expect(() => loadConfig({ ...prodEnv, WEB_ORIGIN: "http://nmi-staging.example.com" })).toThrow(
      /https/,
    );
    expect(() => loadConfig({ ...prodEnv, TRUST_PROXY: "true" })).toThrow(/hop count/);
    const c = loadConfig({ ...prodEnv, TRUST_PROXY: "1" });
    expect([c.trustProxy, c.cookieSecure]).toEqual([1, true]);
    expect(() => loadConfig({ ...prodEnv, TRUST_PROXY: "9" })).toThrow();
  });
  it("production serves the built web app by default and keeps every provider off without credentials", () => {
    const c = loadConfig(prodEnv);
    expect(c.webDistDir).toMatch(/apps[\\/]web[\\/]dist$/);
    expect([c.openai, c.paypalDraftsEnabled, c.paypalCredentials, c.aiConfigured]).toEqual([
      null,
      false,
      null,
      false,
    ]);
  });
});

describe("single-origin static serving", () => {
  const dist = mkdtempSync(join(tmpdir(), "nmi-dist-"));
  const outside = mkdtempSync(join(tmpdir(), "nmi-outside-"));
  const pool = new pg.Pool({ connectionString: baseEnv.DATABASE_URL });
  let app: ReturnType<typeof buildApp>;
  beforeAll(async () => {
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>shell</title>");
    writeFileSync(join(dist, "assets", "app-abc123.js"), "console.log(1)");
    writeFileSync(join(dist, "assets", "app-abc123.css"), "a{}");
    writeFileSync(join(dist, ".secret"), "dotfile");
    writeFileSync(join(dist, "notes.exe"), "unknown type");
    writeFileSync(join(outside, "leak.txt"), "OUTSIDE-SECRET");
    symlinkSync(join(outside, "leak.txt"), join(dist, "linked.txt"));
    app = buildApp(loadConfig({ ...prodEnv, WEB_DIST_DIR: dist }), { db: createDb(pool) });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
    rmSync(dist, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const get = (url: string, method: "GET" | "HEAD" | "POST" = "GET") =>
    app.inject({
      method,
      url,
      ...(method === "POST" ? { headers: { origin: "https://nmi-staging.example.com" } } : {}),
    });

  it("serves the shell at / and for deep links, no-cache, as HTML", async () => {
    for (const u of [
      "/",
      "/dashboard",
      "/invoices/0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11",
      "/index.html",
      "/x?y=1",
    ]) {
      const r = await get(u);
      expect(r.statusCode, u).toBe(200);
      expect(r.headers["content-type"], u).toBe("text/html; charset=utf-8");
      expect(r.headers["cache-control"], u).toBe("no-cache");
      expect(r.body, u).toContain("<title>shell</title>");
    }
    expect((await get("/", "HEAD")).statusCode).toBe(200);
  });
  it("serves hashed assets with the right type and long immutable caching", async () => {
    const js = await get("/assets/app-abc123.js");
    expect([js.statusCode, js.headers["content-type"], js.headers["cache-control"]]).toEqual([
      200,
      "text/javascript; charset=utf-8",
      "public, max-age=31536000, immutable",
    ]);
    expect((await get("/assets/app-abc123.css")).headers["content-type"]).toBe(
      "text/css; charset=utf-8",
    );
  });
  it("/health is JSON, never the SPA shell; /api never falls back to HTML", async () => {
    const h = await get("/health");
    expect(h.headers["content-type"]).toMatch(/application\/json/);
    expect(h.json()).toMatchObject({ status: "ok" });
    for (const u of [
      "/api",
      "/api/",
      "/api/nope",
      "/api/invoice-drafts/search/x",
      "/health/x",
      "/health.json",
      "/api%2Fx",
    ]) {
      const r = await get(u);
      expect(r.statusCode, u).toBe(404);
      expect(r.headers["content-type"], u).toMatch(/application\/json/);
      expect(r.body, u).not.toMatch(/<html|<title|shell/);
    }
    // a GET on a POST-only API route is answered by the API (JSON), never by the SPA shell
    const g = await get("/api/invoice-drafts/search");
    expect(g.headers["content-type"]).toMatch(/json/);
    expect(g.body).not.toMatch(/<html|<title/);
  });
  it("missing assets, unknown types, dotfiles, symlinks and traversal are 404, never HTML or file contents", async () => {
    for (const u of [
      "/assets/missing.js",
      "/favicon.ico",
      "/notes.exe",
      "/.secret",
      "/linked.txt",
      "/../etc/passwd",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/assets/..%2f..%2findex.html",
      "/assets/%2e%2e/app-abc123.js/x.js",
      "/a\\b.js",
      "/%00.js",
    ]) {
      const r = await get(u);
      // Extensionless "traversal" strings are just unknown app routes (the shell, which is public
      // anyway); anything else is refused. Never file contents.
      if (r.statusCode === 200) expect(r.body, u).toBe("<!doctype html><title>shell</title>");
      else expect([404, 400], u).toContain(r.statusCode);
      expect(r.body, u).not.toMatch(/dotfile|OUTSIDE-SECRET|root:|unknown type/);
    }
    expect((await get("/%E0%A4%A")).statusCode).toBe(400);
  });
  it("non-GET requests to unknown paths are a JSON 404 (and a foreign-origin POST is refused first)", async () => {
    expect((await get("/dashboard", "POST")).statusCode).toBe(404);
    const foreign = await app.inject({
      method: "POST",
      url: "/dashboard",
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.statusCode).toBe(403);
  });
  it("every response carries the header-level security policy", async () => {
    const page = await get("/");
    expect(page.headers["content-security-policy"]).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    for (const r of [
      page,
      await get("/health"),
      await get("/assets/app-abc123.js"),
      await get("/nope.js"),
    ]) {
      expect(r.headers["x-content-type-options"]).toBe("nosniff");
      expect(r.headers["x-frame-options"]).toBe("DENY");
      expect(r.headers["referrer-policy"]).toBe("no-referrer");
      expect(r.headers["strict-transport-security"]).toBe("max-age=15552000");
      expect(r.headers["cross-origin-opener-policy"]).toBe("same-origin");
    }
    expect((await get("/health")).headers["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    // no permissive CORS on any of them
    expect(page.headers["access-control-allow-origin"]).toBeUndefined();
  });
  it("refuses to start with a web dist that has no index.html", () => {
    const empty = mkdtempSync(join(tmpdir(), "nmi-empty-"));
    try {
      expect(() =>
        buildApp(loadConfig({ ...prodEnv, WEB_DIST_DIR: empty }), { db: createDb(pool) }),
      ).toThrow(/no index\.html/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("real server process: listen host and PORT", () => {
  const dist = mkdtempSync(join(tmpdir(), "nmi-proc-"));
  const children: ChildProcess[] = [];
  const freePort = () =>
    new Promise<number>((resolve) => {
      const s = createServer().listen(0, "127.0.0.1", () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p));
      });
    });
  const lanAddress = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;

  beforeAll(() =>
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>proc-shell</title>"),
  );
  afterAll(() => {
    for (const c of children) c.kill("SIGINT");
    rmSync(dist, { recursive: true, force: true });
  });

  async function start(env: Record<string, string>, port: number) {
    const child = spawn(
      join(import.meta.dirname, "..", "node_modules", ".bin", "tsx"),
      ["src/server.ts"],
      {
        cwd: join(import.meta.dirname, ".."),
        env: { PATH: process.env["PATH"] ?? "", ...env, PORT: String(port) },
        stdio: "ignore",
      },
    );
    children.push(child);
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) return child;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("server did not start");
  }
  const reach = async (host: string, port: number) => {
    try {
      return (await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(1500) }))
        .ok;
    } catch {
      return false;
    }
  };
  const common = {
    PAYPAL_ENV: "sandbox",
    PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
    DATABASE_URL: baseEnv.DATABASE_URL,
    SESSION_SECRET: baseEnv.SESSION_SECRET,
  };

  it("local default binds loopback only", async () => {
    const port = await freePort();
    await start({ ...common, WEB_ORIGIN: "http://localhost:5173" }, port);
    expect(await reach("127.0.0.1", port)).toBe(true);
    if (lanAddress) expect(await reach(lanAddress, port)).toBe(false);
  }, 30_000);

  it("production + HOST=0.0.0.0 serves health and the SPA on the injected PORT (reachable on every interface)", async () => {
    const port = await freePort();
    await start(
      {
        ...common,
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        WEB_ORIGIN: "https://nmi-staging.example.com",
        WEB_DIST_DIR: dist,
        TRUST_PROXY: "1",
      },
      port,
    );
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.headers.get("content-type")).toMatch(/json/);
    const home = await fetch(`http://127.0.0.1:${port}/deep/link`);
    expect(await home.text()).toContain("proc-shell");
    if (lanAddress) expect(await reach(lanAddress, port)).toBe(true);
  }, 30_000);

  it("production without HOST still binds loopback (the wildcard is an explicit opt-in)", async () => {
    const port = await freePort();
    await start(
      {
        ...common,
        NODE_ENV: "production",
        WEB_ORIGIN: "https://nmi-staging.example.com",
        WEB_DIST_DIR: dist,
      },
      port,
    );
    if (lanAddress) expect(await reach(lanAddress, port)).toBe(false);
  }, 30_000);

  it("refuses to start with an unsafe hosted configuration", async () => {
    const port = await freePort();
    const child = spawn(
      join(import.meta.dirname, "..", "node_modules", ".bin", "tsx"),
      ["src/server.ts"],
      {
        cwd: join(import.meta.dirname, ".."),
        env: {
          PATH: process.env["PATH"] ?? "",
          ...common,
          NODE_ENV: "production",
          WEB_ORIGIN: "http://insecure.example.com",
          PORT: String(port),
        },
        stdio: "ignore",
      },
    );
    const code = await new Promise<number | null>((res) => child.on("exit", res));
    expect(code).not.toBe(0);
    expect(await reach("127.0.0.1", port)).toBe(false);
  }, 30_000);
});
