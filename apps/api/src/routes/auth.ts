import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuditSink, PostgresAuthStore } from "@nmi/db";
import type { AppConfig } from "../config.js";
import {
  dummyHash,
  verifyPassword,
  type ScryptParams,
  DEFAULT_SCRYPT_PARAMS,
} from "../auth/password.js";
import { FailureLimiter } from "../auth/rate-limiter.js";
import { csrfTokenFor, newSessionToken } from "../auth/session-token.js";
import { sessionCookieName } from "../plugins/auth.js";

const loginBody = z.strictObject({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export interface AuthRouteDeps {
  config: AppConfig;
  store: PostgresAuthStore;
  audit: AuditSink;
  passwordParams?: ScryptParams;
  now?: () => number;
}

export function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { config, store, audit } = deps;
  const params = deps.passwordParams ?? DEFAULT_SCRYPT_PARAMS;
  const WINDOW = 15 * 60 * 1000;
  // Per (ip, username) so one attacker cannot lock the lone operator out from other addresses,
  // plus a coarser per-ip cap. In-memory: resets on restart and is per process (documented limit).
  const perAccount = new FailureLimiter(5, WINDOW, deps.now);
  const perIp = new FailureLimiter(20, WINDOW, deps.now);

  const auditSafe = (e: Parameters<AuditSink["record"]>[0], log: { error: (m: string) => void }) =>
    audit.record(e).catch(() => log.error("audit write failed"));

  app.post("/api/auth/login", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const username = parsed.data.username.trim().toLowerCase();
    const accountKey = `${req.ip}|${username}`;

    const wait = Math.max(
      perAccount.retryAfterSeconds(accountKey),
      perIp.retryAfterSeconds(req.ip),
    );
    if (wait > 0) {
      await auditSafe(
        {
          requestId: req.id,
          actor: "anonymous",
          action: "auth.login",
          outcome: "denied",
          detail: { reason: "rate_limited" },
        },
        req.log,
      );
      return reply
        .code(429)
        .header("retry-after", String(wait))
        .send({ error: "too_many_attempts" });
    }

    const operator = await store.findOperatorByUsername(username);
    // Always spend one scrypt verification so timing does not reveal whether the username exists.
    const ok = await verifyPassword(
      parsed.data.password,
      operator?.passwordHash ?? (await dummyHash(params)),
    );
    if (!operator || !ok) {
      perAccount.recordFailure(accountKey);
      perIp.recordFailure(req.ip);
      await auditSafe(
        {
          requestId: req.id,
          actor: operator?.id ?? "anonymous",
          action: "auth.login",
          outcome: "failure",
          detail: { reason: "bad_credentials", usernameKnown: Boolean(operator) },
        },
        req.log,
      );
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    perAccount.reset(accountKey);
    const { token, tokenHash } = newSessionToken();
    const session = await store.createSession({
      operatorId: operator.id,
      tokenHash,
      ttlMinutes: config.sessionTtlMinutes,
    });
    try {
      await audit.record({
        requestId: req.id,
        actor: operator.id,
        action: "auth.login",
        outcome: "success",
        detail: { sessionId: session.sessionId },
      });
    } catch {
      // No audit record, no session: fail closed.
      await store.revokeSession(session.sessionId).catch(() => undefined);
      return reply.code(503).send({ error: "unavailable" });
    }
    void reply.setCookie(sessionCookieName(config), token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlMinutes * 60,
    });
    return reply.send({
      operator: { id: operator.id, username: operator.username },
      csrfToken: csrfTokenFor(config.sessionSecret, tokenHash),
      expiresAt: session.expiresAt.toISOString(),
    });
  });

  app.get("/api/auth/session", { preHandler: app.requireOperator }, async (req, reply) => {
    const s = req.session as NonNullable<typeof req.session>;
    return reply.header("cache-control", "no-store").send({
      operator: { id: s.operatorId, username: s.username },
      csrfToken: csrfTokenFor(config.sessionSecret, s.tokenHash),
      expiresAt: s.expiresAt.toISOString(),
    });
  });

  app.post("/api/auth/logout", { preHandler: app.requireOperator }, async (req, reply) => {
    const s = req.session as NonNullable<typeof req.session>;
    await store.revokeSession(s.sessionId);
    await auditSafe(
      {
        requestId: req.id,
        actor: s.operatorId,
        action: "auth.logout",
        outcome: "success",
        detail: { sessionId: s.sessionId },
      },
      req.log,
    );
    void reply.clearCookie(sessionCookieName(config), {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
      path: "/",
    });
    return reply.code(204).header("cache-control", "no-store").send();
  });
}
