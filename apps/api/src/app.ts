import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { Writable } from "node:stream";
import { PostgresAuthStore, createAuditSink, type AuditSink, type Db } from "@nmi/db";
import type { AppConfig } from "./config.js";
import type { ScryptParams } from "./auth/password.js";
import { registerAuth } from "./plugins/auth.js";
import { authRoutes, type AuthRouteSeams } from "./routes/auth.js";
import { invoiceDraftRoutes, type InvoiceDraftSeams } from "./routes/invoice-drafts.js";
import type { InvoiceModelClient } from "@nmi/ai";
import type { PayPalInvoicingReadDraft } from "@nmi/paypal";
import { healthRoutes } from "./routes/health.js";
import { API_CSP, PAGE_CSP, registerWebStatic } from "./plugins/web-static.js";

export interface AppDeps {
  db: Db;
  /** Test seams only. */
  audit?: AuditSink;
  passwordParams?: ScryptParams;
  logStream?: Writable;
  now?: () => number;
  authSeams?: AuthRouteSeams;
  /** OpenAI-backed parser client; absent => manual-entry fallback. */
  modelClient?: InvoiceModelClient;
  /** Real (or fake in tests) PayPal sandbox client; absent => PayPal drafting is disabled. */
  paypal?: PayPalInvoicingReadDraft;
  clock?: ((req?: FastifyRequest) => Date) | undefined;
  invoiceSeams?: InvoiceDraftSeams;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function buildApp(config: AppConfig, deps: AppDeps): FastifyInstance {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    // A number is a hop count: trust exactly that many proxies from the server side, so the client
    // address is the entry the nearest trusted proxy appended, never a client-supplied one.
    trustProxy:
      typeof config.trustProxy === "number"
        ? (_addr: string, hop: number) => hop < (config.trustProxy as number)
        : config.trustProxy,
    logger: {
      level: config.nodeEnv === "test" && !deps.logStream ? "silent" : "info",
      ...(deps.logStream ? { stream: deps.logStream } : {}),
      // Request logs keep the PATH only. Query strings can carry the operator's invoice search text
      // (customer names or e-mail addresses), which must never reach the logs.
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: (req.url ?? "").split("?")[0] ?? "",
            host: req.host,
            remoteAddress: req.ip,
            ...(req.socket?.remotePort === undefined ? {} : { remotePort: req.socket.remotePort }),
          };
        },
      },
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
    allowedHeaders: ["content-type", "x-csrf-token", "idempotency-key"],
  });
  void app.register(cookie);

  app.addHook("onSend", async (_req, reply) => {
    void reply.header("x-content-type-options", "nosniff");
    // Header-level policy for every response (a <meta> CSP cannot carry frame-ancestors).
    const type = String(reply.getHeader("content-type") ?? "");
    void reply.header("content-security-policy", type.startsWith("text/html") ? PAGE_CSP : API_CSP);
    void reply.header("referrer-policy", "no-referrer");
    void reply.header("x-frame-options", "DENY");
    void reply.header("cross-origin-opener-policy", "same-origin");
    void reply.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (config.cookieSecure) {
      void reply.header("strict-transport-security", "max-age=15552000");
    }
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

  // Never echo internal error messages (SQL, stack, provider text) to clients.
  app.setErrorHandler((error: unknown, req, reply) => {
    const e = error as { statusCode?: number; name?: string };
    const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 500 ? e.statusCode : 500;
    req.log.error({ err: e.name ?? "error", status }, "request failed");
    return reply
      .code(status)
      .header("cache-control", "no-store")
      .send({ error: status === 500 ? "internal" : "bad_request" });
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
  invoiceDraftRoutes(app, {
    config,
    db: deps.db,
    audit,
    modelClient: deps.modelClient,
    paypal: deps.paypal,
    clock: deps.clock,
    seams: deps.invoiceSeams,
  });
  if (config.webDistDir) registerWebStatic(app, config.webDistDir);
  return app;
}
