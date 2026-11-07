import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  draftNudge,
  dueBucket,
  groupedAmount,
  longDate,
  NUDGE_PROMPT_VERSION,
  NUDGE_TONES,
  type NudgeModelClient,
} from "@nmi/ai";
import {
  NUDGE_MAX_MESSAGE,
  PostgresNudgeStore,
  type AuditSink,
  type Db,
  type Nudge,
  type NudgeFailure,
  type NudgeWithInvoice,
} from "@nmi/db";
import { JUDGE_AI_WINDOW_MS } from "../config.js";
import { WindowBudget } from "../auth/window-budget.js";
import { BoundedWorkGate } from "../auth/work-gate.js";

const idParams = z.strictObject({ id: z.uuid() });
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
const version = z.number().int().min(1).max(1_000_000);
const generateBody = z.strictObject({
  tone: z.enum(NUDGE_TONES),
  timeZone: z.string().min(1).max(64).refine(validZone, "unknown time zone"),
  // Regenerating while a draft is pending must name exactly the pending draft the operator saw.
  replace: z.strictObject({ id: z.uuid(), version }).nullish(),
});
const editBody = z.strictObject({
  version,
  message: z
    .string()
    .trim()
    .min(1)
    .max(NUDGE_MAX_MESSAGE)
    .refine(noControl, "control characters are not allowed"),
});
const versionBody = z.strictObject({ version });
const listQuery = z.strictObject({
  view: z.enum(["pending", "approved", "history"]).default("pending"),
  invoiceId: z.uuid().optional(),
});

const issues = (e: z.ZodError) =>
  e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

/** Local calendar date (YYYY-MM-DD) of an instant in an IANA zone. */
export function localIsoDate(now: Date, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p["year"]}-${p["month"]}-${p["day"]}`;
}
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

const present = (n: Nudge) => ({
  id: n.id,
  invoiceId: n.invoiceId,
  tone: n.tone,
  status: n.status,
  message: n.message,
  aiMessage: n.aiMessage,
  rationale: n.rationale,
  facts: n.facts,
  model: n.model,
  promptVersion: n.promptVersion,
  edited: n.edited,
  version: n.version,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
  approvedAt: n.approvedAt?.toISOString() ?? null,
  rejectedAt: n.rejectedAt?.toISOString() ?? null,
  supersededAt: n.supersededAt?.toISOString() ?? null,
  // A draft for the operator's own manual use. Always false: nothing here contacts the customer.
  sentToCustomer: false as const,
});
const presentWithInvoice = (n: NudgeWithInvoice) => ({ ...present(n), invoice: n.invoice });

export interface NudgeRouteDeps {
  db: Db;
  audit: AuditSink;
  /** Absent => AI drafting is unavailable (503); review of existing drafts still works. */
  nudgeClient?: NudgeModelClient | undefined;
  clock?: ((req?: FastifyRequest) => Date) | undefined;
  seams?: { generateBudgetMax?: number; generateConcurrency?: number } | undefined;
}

/**
 * NMI-P6 AI nudge queue. Authenticated, CSRF/Origin protected (requireOperator + the global mutating-request
 * hook), operator-scoped and strictly validated. Generation is one bounded model call per request, under a
 * per-operator budget and a tiny in-flight cap; the model sees no customer data. NOTHING here sends, schedules
 * or dispatches a message: "approve" means approved for the operator's own manual use.
 */
export function nudgeRoutes(app: FastifyInstance, deps: NudgeRouteDeps): void {
  const store = new PostgresNudgeStore(deps.db);
  const clock = (req?: FastifyRequest) => (deps.clock ? deps.clock(req) : new Date());
  const budget = new WindowBudget(deps.seams?.generateBudgetMax ?? 20, JUDGE_AI_WINDOW_MS);
  const gate = new BoundedWorkGate(deps.seams?.generateConcurrency ?? 2, 0);
  const operatorId = (req: FastifyRequest) =>
    (req.session as NonNullable<typeof req.session>).operatorId;
  const noStore = (reply: FastifyReply) => reply.header("cache-control", "no-store");
  const note = (
    req: FastifyRequest,
    action: "nudge.generate" | "nudge.edit" | "nudge.approve" | "nudge.reject",
    resourceId: string,
    outcome: "success" | "denied" | "failure" | "error",
    detail: { invoiceId?: string; state?: string; reason?: string } = {},
  ) =>
    deps.audit
      .record({ requestId: req.id, actor: operatorId(req), action, resourceId, outcome, detail })
      .catch(() => req.log.error("audit write failed"));
  const failure = (reply: FastifyReply, reason: NudgeFailure) =>
    reason === "not_found"
      ? reply.code(404).send({ error: "not_found" })
      : reply.code(409).send({ error: reason });

  app.get("/api/nudges/summary", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    return reply.send({
      counts: await store.summary(operatorId(req)),
      aiAvailable: Boolean(deps.nudgeClient),
    });
  });

  app.get("/api/nudges", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    const q = listQuery.safeParse(req.query ?? {});
    if (!q.success)
      return reply.code(400).send({ error: "invalid_request", issues: issues(q.error) });
    const items = await store.list(operatorId(req), q.data.view, {
      ...(q.data.invoiceId ? { invoiceId: q.data.invoiceId } : {}),
    });
    return reply.send({ view: q.data.view, items: items.map(presentWithInvoice) });
  });

  app.get("/api/nudges/:id", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    const p = idParams.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const n = await store.get(operatorId(req), p.data.id);
    return n ? reply.send(presentWithInvoice(n)) : reply.code(404).send({ error: "not_found" });
  });

  app.post(
    "/api/invoice-drafts/:id/nudges",
    { preHandler: app.requireOperator },
    async (req, reply) => {
      noStore(reply);
      const p = idParams.safeParse(req.params);
      if (!p.success) return reply.code(404).send({ error: "not_found" });
      const body = generateBody.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send({ error: "invalid_request", issues: issues(body.error) });
      const actor = operatorId(req);
      const invoiceId = p.data.id;
      const { tone, timeZone } = body.data;
      const replace = body.data.replace ?? null;

      // Every check that needs no model call happens first, so a refused request costs nothing.
      const ctx = await store.invoiceContext(actor, invoiceId);
      if (!ctx) return reply.code(404).send({ error: "not_found" });
      if (ctx.pending && !replace) {
        return reply.code(409).send({ error: "pending_exists", pending: ctx.pending });
      }
      if (replace && (ctx.pending?.id !== replace.id || ctx.pending.version !== replace.version)) {
        return reply.code(409).send({ error: "version_conflict", pending: ctx.pending });
      }
      if (!deps.nudgeClient) {
        note(req, "nudge.generate", invoiceId, "failure", { invoiceId, reason: "ai_unavailable" });
        return reply.code(503).send({ error: "ai_unavailable" });
      }
      const taken = budget.tryTake(actor);
      if (!taken.ok) {
        note(req, "nudge.generate", invoiceId, "denied", { invoiceId, reason: "rate_limited" });
        return reply
          .code(429)
          .header("retry-after", String(taken.retryAfterSeconds))
          .send({ error: "rate_limited", retryAfterSeconds: taken.retryAfterSeconds });
      }
      const slot = gate.reserve();
      if (!slot) {
        note(req, "nudge.generate", invoiceId, "denied", { invoiceId, reason: "busy" });
        return reply.code(429).header("retry-after", "2").send({ error: "busy" });
      }

      const asOfDate = localIsoDate(clock(req), timeZone);
      const daysPastDue = Math.round(dayNumber(asOfDate) - dayNumber(ctx.dueDate));
      const invoiceRef = ctx.id.slice(0, 8);
      const amount = groupedAmount(ctx.currency, ctx.total);
      const client = deps.nudgeClient;
      const outcome = await slot.run(() =>
        draftNudge(
          client,
          { tone, currency: ctx.currency, dueStatus: dueBucket(daysPastDue), repeat: ctx.repeat },
          {
            customerName: ctx.customerName,
            invoiceRef,
            amount,
            dueDate: longDate(ctx.dueDate),
          },
        ),
      );
      if (outcome.status === "unavailable") {
        note(req, "nudge.generate", invoiceId, "error", { invoiceId, reason: "ai_unavailable" });
        return reply.code(503).send({ error: "ai_unavailable" });
      }
      if (outcome.status === "invalid") {
        // Nothing partial is stored or shown; the operator can simply try again.
        note(req, "nudge.generate", invoiceId, "failure", { invoiceId, reason: outcome.issue });
        return reply.code(422).send({ error: "ai_output_rejected" });
      }
      const saved = await store.create(
        actor,
        invoiceId,
        {
          tone,
          message: outcome.message,
          rationale: outcome.rationale,
          facts: {
            currency: ctx.currency,
            amount,
            dueDate: ctx.dueDate,
            daysPastDue,
            asOfDate,
            timeZone,
            invoiceRef,
          },
          model: outcome.model,
          promptVersion: NUDGE_PROMPT_VERSION,
        },
        replace,
      );
      if (!saved.ok) {
        note(req, "nudge.generate", invoiceId, "denied", { invoiceId, reason: saved.reason });
        return failure(reply, saved.reason);
      }
      note(req, "nudge.generate", saved.value.id, "success", { invoiceId, state: tone });
      return reply.code(201).send(present(saved.value));
    },
  );

  const transition =
    (
      action: "nudge.edit" | "nudge.approve" | "nudge.reject",
      schema: typeof editBody | typeof versionBody,
      apply: (
        actor: string,
        id: string,
        b: { version: number; message?: string },
      ) => ReturnType<PostgresNudgeStore["approve"]>,
    ) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      noStore(reply);
      const p = idParams.safeParse(req.params);
      if (!p.success) return reply.code(404).send({ error: "not_found" });
      const body = schema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send({ error: "invalid_request", issues: issues(body.error) });
      const r = await apply(operatorId(req), p.data.id, body.data);
      if (!r.ok) {
        note(req, action, p.data.id, "denied", { reason: r.reason });
        return failure(reply, r.reason);
      }
      note(req, action, r.value.id, "success", { invoiceId: r.value.invoiceId });
      return reply.send(present(r.value));
    };

  app.post(
    "/api/nudges/:id/edit",
    { preHandler: app.requireOperator },
    transition("nudge.edit", editBody, (a, id, b) =>
      store.edit(a, id, b.version, b.message as string),
    ),
  );
  app.post(
    "/api/nudges/:id/approve",
    { preHandler: app.requireOperator },
    transition("nudge.approve", versionBody, (a, id, b) => store.approve(a, id, b.version)),
  );
  app.post(
    "/api/nudges/:id/reject",
    { preHandler: app.requireOperator },
    transition("nudge.reject", versionBody, (a, id, b) => store.reject(a, id, b.version)),
  );
}
