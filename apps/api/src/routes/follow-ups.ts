import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  FOLLOW_UP_MAX_MESSAGE,
  FOLLOW_UP_MAX_NOTE,
  PostgresFollowUpStore,
  type AuditSink,
  type Db,
  type FollowUp,
  type FollowUpFailure,
  type FollowUpResult,
  type FollowUpWithInvoice,
} from "@nmi/db";

/** A follow-up may be scheduled at most this far ahead, and at most this far in the past (an "as of now" pick). */
export const FOLLOW_UP_MAX_AHEAD_MS = 730 * 24 * 60 * 60 * 1000;
export const FOLLOW_UP_PAST_GRACE_MS = 5 * 60 * 1000;

const idParams = z.strictObject({ id: z.uuid() });
// Printable text and ordinary whitespace (newline, tab, carriage return) only; no other control characters.
const noControl = (v: string) =>
  [...v].every((ch) => {
    const c = ch.charCodeAt(0);
    return !((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127);
  });

function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz);
  } catch {
    return false;
  }
}

const fields = {
  // A real UTC instant (the browser converts the operator's local pick); never a local wall time.
  dueAt: z.iso.datetime(),
  timezone: z.string().min(1).max(64).refine(validZone, "unknown time zone"),
  note: z
    .string()
    .trim()
    .max(FOLLOW_UP_MAX_NOTE)
    .refine(noControl, "control characters are not allowed")
    .nullish()
    .transform((v) => (v ? v : null)),
  message: z
    .string()
    .trim()
    .min(1)
    .max(FOLLOW_UP_MAX_MESSAGE)
    .refine(noControl, "control characters are not allowed"),
};
const createBody = z.strictObject({ invoiceId: z.uuid(), ...fields });
const rescheduleBody = z.strictObject(fields);
const emptyBody = z.union([z.undefined(), z.null(), z.strictObject({})]);

const issues = (e: z.ZodError) =>
  e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

const present = (f: FollowUp) => ({
  id: f.id,
  invoiceId: f.invoiceId,
  dueAt: f.dueAt.toISOString(),
  timezone: f.timezone,
  note: f.note,
  message: f.message,
  status: f.status,
  state: f.state,
  createdAt: f.createdAt.toISOString(),
  completedAt: f.completedAt?.toISOString() ?? null,
  canceledAt: f.canceledAt?.toISOString() ?? null,
  // A local reminder for the operator. Always false: nothing here contacts the customer.
  sentToCustomer: false as const,
});
const presentWithInvoice = (f: FollowUpWithInvoice) => ({ ...present(f), invoice: f.invoice });

export interface FollowUpRouteDeps {
  db: Db;
  audit: AuditSink;
  clock?: ((req?: FastifyRequest) => Date) | undefined;
}

/**
 * NMI-FUP-01 local follow-up reminders. Authenticated, CSRF/Origin protected (via requireOperator and
 * the global mutating-request hook), operator-scoped and strictly validated. No route here, and no
 * background job, contacts a customer, PayPal or OpenAI.
 */
export function followUpRoutes(app: FastifyInstance, deps: FollowUpRouteDeps): void {
  const store = new PostgresFollowUpStore(deps.db);
  const clock = (req?: FastifyRequest) => (deps.clock ? deps.clock(req) : new Date());
  const operatorId = (req: FastifyRequest) =>
    (req.session as NonNullable<typeof req.session>).operatorId;
  const noStore = (reply: FastifyReply) => reply.header("cache-control", "no-store");
  const note = (
    req: FastifyRequest,
    action: "followup.schedule" | "followup.reschedule" | "followup.complete" | "followup.cancel",
    resourceId: string,
    outcome: "success" | "denied",
    reason?: string,
  ) =>
    deps.audit
      .record({
        requestId: req.id,
        actor: operatorId(req),
        action,
        resourceId,
        outcome,
        ...(reason ? { detail: { reason } } : {}),
      })
      .catch(() => req.log.error("audit write failed"));

  const inWindow = (dueAt: Date, now: Date) =>
    dueAt.getTime() >= now.getTime() - FOLLOW_UP_PAST_GRACE_MS &&
    dueAt.getTime() <= now.getTime() + FOLLOW_UP_MAX_AHEAD_MS;

  const failure = (reply: FastifyReply, reason: FollowUpFailure) =>
    reason === "not_found"
      ? reply.code(404).send({ error: "not_found" })
      : reply.code(409).send({ error: reason });

  // Active follow-ups with due/upcoming computed NOW, on the server, from stored instants.
  app.get("/api/follow-ups", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    const now = clock(req);
    const { items, due, upcoming } = await store.listActive(operatorId(req), now);
    return reply.send({
      now: now.toISOString(),
      counts: { due, upcoming },
      items: items.map(presentWithInvoice),
    });
  });

  app.get(
    "/api/invoice-drafts/:id/follow-ups",
    { preHandler: app.requireOperator },
    async (req, reply) => {
      noStore(reply);
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(404).send({ error: "not_found" });
      const now = clock(req);
      const found = await store.forInvoice(operatorId(req), params.data.id, now);
      if (!found) return reply.code(404).send({ error: "not_found" });
      return reply.send({
        now: now.toISOString(),
        active: found.active ? present(found.active) : null,
        recent: found.recent.map(present),
      });
    },
  );

  app.post("/api/follow-ups", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    const body = createBody.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: "invalid_request", issues: issues(body.error) });
    const now = clock(req);
    const dueAt = new Date(body.data.dueAt);
    if (!inWindow(dueAt, now)) return reply.code(400).send({ error: "invalid_schedule_time" });
    const result = await store.create(
      operatorId(req),
      body.data.invoiceId,
      {
        dueAt,
        timezone: body.data.timezone,
        note: body.data.note,
        message: body.data.message,
      },
      now,
    );
    if (!result.ok) {
      await note(req, "followup.schedule", body.data.invoiceId, "denied", result.reason);
      return failure(reply, result.reason);
    }
    await note(req, "followup.schedule", result.value.id, "success");
    return reply.code(201).send(present(result.value));
  });

  app.post(
    "/api/follow-ups/:id/reschedule",
    { preHandler: app.requireOperator },
    async (req, reply) => {
      noStore(reply);
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(404).send({ error: "not_found" });
      const body = rescheduleBody.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send({ error: "invalid_request", issues: issues(body.error) });
      const now = clock(req);
      const dueAt = new Date(body.data.dueAt);
      if (!inWindow(dueAt, now)) return reply.code(400).send({ error: "invalid_schedule_time" });
      const result = await store.reschedule(
        operatorId(req),
        params.data.id,
        { dueAt, timezone: body.data.timezone, note: body.data.note, message: body.data.message },
        now,
      );
      return finish(req, reply, result, "followup.reschedule", params.data.id);
    },
  );

  for (const [path, action, run] of [
    ["complete", "followup.complete", (o: string, id: string, n: Date) => store.complete(o, id, n)],
    ["cancel", "followup.cancel", (o: string, id: string, n: Date) => store.cancel(o, id, n)],
  ] as const) {
    app.post(
      `/api/follow-ups/:id/${path}`,
      { preHandler: app.requireOperator },
      async (req, reply) => {
        noStore(reply);
        const params = idParams.safeParse(req.params);
        if (!params.success) return reply.code(404).send({ error: "not_found" });
        if (!emptyBody.safeParse(req.body).success)
          return reply.code(400).send({ error: "invalid_request" });
        const result = await run(operatorId(req), params.data.id, clock(req));
        return finish(req, reply, result, action, params.data.id);
      },
    );
  }

  async function finish(
    req: FastifyRequest,
    reply: FastifyReply,
    result: FollowUpResult<FollowUp>,
    action: Parameters<typeof note>[1],
    id: string,
  ) {
    if (!result.ok) {
      await note(req, action, id, "denied", result.reason);
      return failure(reply, result.reason);
    }
    await note(req, action, id, "success");
    return reply.send(present(result.value));
  }
}
