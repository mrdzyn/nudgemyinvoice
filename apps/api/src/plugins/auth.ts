import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { TrustedActor } from "@nmi/domain";
import type { AuditSink, PostgresAuthStore } from "@nmi/db";
import type { AppConfig } from "../config.js";
import { actorFromValidatedSession } from "../auth/trusted-actor.js";
import { csrfTokenFor, hashToken, isWellFormedToken, safeEqual } from "../auth/session-token.js";

export interface AuthDeps {
  config: AppConfig;
  store: PostgresAuthStore;
  audit: AuditSink;
}

export interface AuthenticatedSession {
  sessionId: string;
  operatorId: string;
  username: string;
  expiresAt: Date;
  tokenHash: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set only by `requireOperator` after the database validated the session cookie. */
    session?: AuthenticatedSession;
    /** Derived from `session` only. Never from the body, headers, model output or tools. */
    trustedActor?: TrustedActor;
  }
  interface FastifyInstance {
    requireOperator: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function sessionCookieName(config: AppConfig): string {
  return config.cookieSecure ? "__Host-nmi_session" : "nmi_session";
}

export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  const { config, store, audit } = deps;
  app.decorateRequest("session", undefined);
  app.decorateRequest("trustedActor", undefined);

  const deny = async (
    req: FastifyRequest,
    reply: FastifyReply,
    status: 401 | 403,
    error: string,
    reason: string,
    actor = "anonymous",
  ) => {
    await audit
      .record({
        requestId: req.id,
        actor,
        action: "auth.request_denied",
        outcome: "denied",
        detail: { reason },
      })
      .catch(() => req.log.error("audit write failed"));
    await reply.code(status).header("cache-control", "no-store").send({ error });
  };

  /** preHandler: 401 without a valid server-side session; 403 for mutating requests without a valid CSRF token. */
  app.decorate("requireOperator", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[sessionCookieName(config)];
    if (!isWellFormedToken(token)) return deny(req, reply, 401, "unauthorized", "no_session");
    const tokenHash = hashToken(token);
    let valid;
    try {
      valid = await store.validateAndTouchSession({
        tokenHash,
        idleMinutes: config.sessionIdleMinutes,
      });
    } catch {
      // Database unavailable: fail closed.
      return reply.code(503).header("cache-control", "no-store").send({ error: "unavailable" });
    }
    if (!valid) return deny(req, reply, 401, "unauthorized", "invalid_session");

    if (!SAFE_METHODS.has(req.method)) {
      const header = req.headers["x-csrf-token"];
      const expected = csrfTokenFor(config.sessionSecret, tokenHash);
      if (typeof header !== "string" || !safeEqual(header, expected)) {
        return deny(req, reply, 403, "csrf_rejected", "csrf", valid.operatorId);
      }
    }
    req.session = { ...valid, tokenHash };
    req.trustedActor = actorFromValidatedSession(valid);
  });
}
