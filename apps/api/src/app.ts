import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { Writable } from "node:stream";
import { PostgresAuthStore, createAuditSink, type AuditSink, type Db } from "@nmi/db";
import type { AppConfig } from "./config.js";
import type { ScryptParams } from "./auth/password.js";
import { registerAuth } from "./plugins/auth.js";
import { authRoutes, type AuthRouteSeams } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";

export interface AppDeps {
  db: Db;
  /** Test seams only. */
  audit?: AuditSink;
  passwordParams?: ScryptParams;
  logStream?: Writable;
  now?: () => number;
  authSeams?: AuthRouteSeams;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function buildApp(config: AppConfig, deps: AppDeps): FastifyInstance {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    trustProxy: config.trustProxy,
    logger: {
      level: config.nodeEnv === "test" && !deps.logStream ? "silent" : "info",
      ...(deps.logStream ? { stream: deps.logStream } : {}),
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-csrf-token']",
          "req.headers['paypal-auth-algo']",
          "res.headers['set-cookie']",
          "headers.authorization",
          "headers.cookie",
          "headers['x-csrf-token']",
          "headers['set-cookie']",
        ],
        censor: "[redacted]",
      },
    },
  });

  const store = new PostgresAuthStore(deps.db);
  const audit = deps.audit ?? createAuditSink(deps.db);

  // Only the configured web origin may make credentialed cross-origin calls.
  void app.register(cors, {
    origin: (origin, cb) => cb(null, origin === config.webOrigin),
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["content-type", "x-csrf-token"],
  });
  void app.register(cookie);

  app.addHook("onSend", async (_req, reply) => {
    void reply.header("x-content-type-options", "nosniff");
  });

  // Every state-changing request must come from the configured web origin. A missing Origin is
  // rejected too (fail closed); browsers always send it on cross-site POSTs.
  app.addHook("onRequest", async (req, reply) => {
    if (!MUTATING.has(req.method)) return;
    if (req.headers.origin === config.webOrigin) return;
    await audit
      .record({
        requestId: req.id,
        actor: "anonymous",
        action: "auth.request_denied",
        outcome: "denied",
        detail: { reason: "origin" },
      })
      .catch(() => req.log.error("audit write failed"));
    return reply.code(403).header("cache-control", "no-store").send({ error: "origin_rejected" });
  });

  registerAuth(app, { config, store, audit });
  healthRoutes(app, config);
  authRoutes(app, {
    config,
    store,
    audit,
    ...(deps.passwordParams ? { passwordParams: deps.passwordParams } : {}),
    ...(deps.now ? { now: deps.now } : {}),
    ...(deps.authSeams ? { seams: deps.authSeams } : {}),
  });
  return app;
}
