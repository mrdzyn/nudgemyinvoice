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
import {
  AttemptLimiter,
  DEFAULT_ATTEMPT_LIMITS,
  type AttemptLimits,
} from "../auth/attempt-limiter.js";
import { BoundedWorkGate } from "../auth/work-gate.js";
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
  /** Test seams. Production leaves all of these undefined. */
  seams?: AuthRouteSeams;
}

export interface AuthRouteSeams {
  limits?: Partial<AttemptLimits>;
  maxConcurrentHashes?: number;
  maxQueuedHashes?: number;
  /** Replaces scrypt verification (counting/parking stubs in tests). */
  verifyPassword?: typeof verifyPassword;
  /** Runs after the password was verified and before the session is issued. */
  beforeSessionIssue?: (ctx: { operatorId: string; credentialVersion: number }) => Promise<void>;
}

export function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { config, store, audit } = deps;
  const params = deps.passwordParams ?? DEFAULT_SCRYPT_PARAMS;
  // Admission is reserved synchronously (see AttemptLimiter) per (address, username) and per address.
  // In-memory and per process: it resets on restart and is not shared between instances.
  const seams = deps.seams ?? {};
  const limiter = new AttemptLimiter({ ...DEFAULT_ATTEMPT_LIMITS, ...seams.limits }, deps.now);
  // At most a few concurrent scrypt hashes (~128 MiB each); the queue is bounded.
  const gate = new BoundedWorkGate(seams.maxConcurrentHashes ?? 4, seams.maxQueuedHashes ?? 16);
  const verify = seams.verifyPassword ?? verifyPassword;

  const auditSafe = (e: Parameters<AuditSink["record"]>[0], log: { error: (m: string) => void }) =>
    audit.record(e).catch(() => log.error("audit write failed"));

  app.post("/api/auth/login", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const username = parsed.data.username.trim().toLowerCase();

    // ---- Synchronous section: nothing below awaits until both reservations are made. ----
    const admission = limiter.tryAdmit(`${req.ip}|${username}`, req.ip);
    if (!admission.ok) {
      void auditSafe(
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
        .header("retry-after", String(admission.retryAfterSeconds))
        .send({ error: "too_many_attempts" });
    }
    const ticket = admission.ticket;
    const slot = gate.reserve();
    if (!slot) {
      ticket.release(); // nothing was evaluated, so the attempt does not count against the budget
      void auditSafe(
        {
          requestId: req.id,
          actor: "anonymous",
          action: "auth.login",
          outcome: "denied",
          detail: { reason: "busy" },
        },
        req.log,
      );
      return reply.code(429).header("retry-after", "1").send({ error: "too_many_attempts" });
    }
    // ---- End of synchronous section. ----

    let verificationStarted = false;
    try {
      const operator = await store.findOperatorByUsername(username);
      // Always spend one scrypt verification so timing does not reveal whether the username exists.
      const ok = await slot.run(async () => {
        verificationStarted = true;
        return verify(parsed.data.password, operator?.passwordHash ?? (await dummyHash(params)));
      });
      if (!operator || !ok) {
        ticket.fail();
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

      await seams.beforeSessionIssue?.({
        operatorId: operator.id,
        credentialVersion: operator.credentialVersion,
      });
      const { token, tokenHash } = newSessionToken();
      // Proves the credential we just verified is still current; null means it was rotated or the
      // operator was disabled while we were hashing. Fail closed: no session.
      const session = await store.createSession({
        operatorId: operator.id,
        credentialVersion: operator.credentialVersion,
        tokenHash,
        ttlMinutes: config.sessionTtlMinutes,
      });
      if (!session) {
        ticket.fail();
        await auditSafe(
          {
            requestId: req.id,
            actor: operator.id,
            action: "auth.login",
            outcome: "failure",
            detail: { reason: "credential_changed" },
          },
          req.log,
        );
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      try {
        await audit.record({
          requestId: req.id,
          actor: operator.id,
          action: "auth.login",
          outcome: "success",
          detail: { sessionId: session.sessionId },
        });
      } catch {
        // No audit record, no session: fail closed. The password was right, so do not count a guess.
        await store.revokeSession(session.sessionId).catch(() => undefined);
        ticket.release();
        return reply.code(503).send({ error: "unavailable" });
      }
      ticket.succeed();
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
    } catch (e) {
      // Infrastructure error. Before any hashing nothing was guessed (refund); after, it may have been.
      if (!verificationStarted) ticket.release();
      else ticket.fail();
      req.log.error({ err: e instanceof Error ? e.name : "error" }, "login failed");
      return reply.code(503).send({ error: "unavailable" });
    } finally {
      slot.release();
    }
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
