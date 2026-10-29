import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createAuditSink,
  decodeCursor,
  encodeCursor,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  LIST_MAX_SEARCH,
  PAYPAL_STATUS_GROUPS,
  PostgresInvoiceDraftStore,
  PostgresInvoiceListStore,
  PostgresPayPalOperationStore,
  type AuditSink,
  type Db,
} from "@nmi/db";
import { parseInvoiceRequest, type InvoiceModelClient } from "@nmi/ai";
import { CURRENCY_CODES, MoneyError, invoiceDraftSchema, type CurrencyCode } from "@nmi/shared";
import type { PayPalInvoicingReadDraft } from "@nmi/paypal";
import type { AppConfig } from "../config.js";
import { BoundedWorkGate } from "../auth/work-gate.js";
import { WindowBudget } from "../auth/window-budget.js";
import { createPayPalDraft, type PayPalDraftDeps } from "../services/paypal-draft-service.js";

export const MAX_PARSE_CHARS = 2000;

const parseBody = z.strictObject({ text: z.string().trim().min(1).max(MAX_PARSE_CHARS) });
const idParams = z.strictObject({ id: z.uuid() });
// Strict: unknown or repeated query parameters are rejected, never ignored.
const listQuery = z.strictObject({
  limit: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(LIST_MAX_LIMIT))
    .optional(),
  cursor: z.string().min(1).max(120).optional(),
  currency: z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]]).optional(),
  status: z.enum(PAYPAL_STATUS_GROUPS).optional(),
  q: z.string().trim().min(1).max(LIST_MAX_SEARCH).optional(),
});
// Search transport that keeps customer text out of every request URL: the whole query travels in an
// authenticated, CSRF-protected POST body. Same fields and limits as the GET query, same strictness.
const searchBody = z.strictObject({
  limit: z.number().int().min(1).max(LIST_MAX_LIMIT).optional(),
  cursor: z.string().min(1).max(120).optional(),
  currency: z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]]).optional(),
  status: z.enum(PAYPAL_STATUS_GROUPS).optional(),
  q: z.string().trim().min(1).max(LIST_MAX_SEARCH).optional(),
});
const idempotencyHeader = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

export interface InvoiceDraftRouteDeps {
  config: AppConfig;
  db: Db;
  audit: AuditSink;
  /** Absent when OpenAI is not configured: parsing then returns the manual-entry fallback. */
  modelClient?: InvoiceModelClient | undefined;
  /** Absent unless real sandbox drafting is enabled and configured. */
  paypal?: PayPalInvoicingReadDraft | undefined;
  clock?: ((req?: FastifyRequest) => Date) | undefined;
  seams?: InvoiceDraftSeams | undefined;
}

/** Test seams only; production passes none. */
export interface InvoiceDraftSeams {
  parseBudgetMax?: number;
  parseConcurrency?: number;
  leaseSeconds?: number;
  coolOffSeconds?: number;
  maxIdempotencyAgeSeconds?: number;
  ops?: PayPalDraftDeps["ops"] | ((req: FastifyRequest) => PayPalDraftDeps["ops"]);
}

const issues = (e: z.ZodError) =>
  e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

export function invoiceDraftRoutes(app: FastifyInstance, deps: InvoiceDraftRouteDeps): void {
  const { config, audit } = deps;
  const clock = (req?: FastifyRequest) => (deps.clock ? deps.clock(req) : new Date());
  const drafts = new PostgresInvoiceDraftStore(deps.db);
  const list = new PostgresInvoiceListStore(deps.db);
  const defaultOps = new PostgresPayPalOperationStore(deps.db);
  const resolveOps = (req: FastifyRequest) =>
    typeof deps.seams?.ops === "function" ? deps.seams.ops(req) : (deps.seams?.ops ?? defaultOps);
  // Cost bound for the paid provider call: a per-operator budget plus a tiny in-flight cap.
  const budget = new WindowBudget(deps.seams?.parseBudgetMax ?? 20, 10 * 60 * 1000);
  const gate = new BoundedWorkGate(deps.seams?.parseConcurrency ?? 2, 0);

  const operatorId = (req: FastifyRequest) =>
    (req.session as NonNullable<typeof req.session>).operatorId;
  const note = (req: FastifyRequest, e: Parameters<AuditSink["record"]>[0]) =>
    audit.record({ requestId: req.id, ...e }).catch(() => req.log.error("audit write failed"));
  const noStore = (reply: FastifyReply) => reply.header("cache-control", "no-store");

  // ------------------------------------------------------------------ parse
  app.post("/api/invoice-drafts/parse", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    const body = parseBody.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: "invalid_request", issues: issues(body.error) });
    const actor = operatorId(req);

    // Synchronous cost admission before any await.
    const taken = budget.tryTake(actor);
    if (!taken.ok) {
      return reply
        .code(429)
        .header("retry-after", String(taken.retryAfterSeconds))
        .send({ error: "too_many_requests" });
    }
    const slot = gate.reserve();
    if (!slot) return reply.code(429).header("retry-after", "2").send({ error: "busy" });

    try {
      const today = clock(req).toISOString().slice(0, 10); // UTC calendar date; documented
      const outcome = deps.modelClient
        ? await slot.run(() =>
            parseInvoiceRequest(body.data.text, {
              client: deps.modelClient as InvoiceModelClient,
              today,
            }),
          )
        : ({
            status: "unavailable",
            fallback: "manual_entry",
            reason: "ai_not_configured",
          } as const);
      // The text, the draft and the customer details are deliberately NOT audited or logged.
      await note(req, {
        actor,
        action: "invoice.parse",
        outcome: outcome.status === "unavailable" ? "failure" : "success",
        detail: { state: outcome.status },
      });
      return reply.send(outcome);
    } finally {
      slot.release();
    }
  });

  // ------------------------------------------------------------------- save
  app.post("/api/invoice-drafts", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    const keyRaw = req.headers["idempotency-key"];
    const key = keyRaw === undefined ? undefined : idempotencyHeader.safeParse(keyRaw);
    if (key && !key.success) return reply.code(400).send({ error: "invalid_idempotency_key" });
    // Strict: unknown keys (a client "total", "status", "id", ...) are rejected, never ignored.
    const parsed = invoiceDraftSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "invalid_request", issues: issues(parsed.error) });
    const actor = operatorId(req);

    let result;
    try {
      result = await drafts.save({
        draft: parsed.data,
        operatorId: actor,
        idempotencyKey: key?.data,
        // Same transaction as the rows: no committed draft without its audit row, and vice versa.
        afterWrite: async (tx, info) => {
          await createAuditSink(tx).record({
            requestId: req.id,
            actor,
            action: "invoice.draft_save",
            resourceId: info.invoiceId,
            outcome: "success",
            detail: { invoiceId: info.invoiceId, state: info.replayed ? "replayed" : "created" },
          });
        },
      });
    } catch (e) {
      if (e instanceof MoneyError)
        return reply.code(422).send({ error: "invalid_draft", message: e.message });
      throw e;
    }
    if (result.outcome === "conflict")
      return reply.code(409).send({ error: "idempotency_conflict" });
    return reply
      .code(result.outcome === "created" ? 201 : 200)
      .send(present(result.saved, result.outcome === "replayed"));
  });

  // ------------------------------------------------------------------- list
  // Read-only, owner-scoped (the operator comes from the server session, never from the client),
  // keyset-paginated, bounded. No provider call, no mutation, no audit row (nothing to record).
  type ListInput = {
    limit?: number | undefined;
    cursor?: string | undefined;
    currency?: CurrencyCode | undefined;
    status?: (typeof PAYPAL_STATUS_GROUPS)[number] | undefined;
    q?: string | undefined;
  };
  const runList = async (req: FastifyRequest, reply: FastifyReply, input: ListInput) => {
    let cursor;
    if (input.cursor !== undefined) {
      cursor = decodeCursor(input.cursor);
      if (!cursor) return reply.code(400).send({ error: "invalid_cursor" });
    }
    const page = await list.list({
      operatorId: operatorId(req),
      limit: input.limit ?? LIST_DEFAULT_LIMIT,
      cursor,
      currency: input.currency,
      status: input.status,
      search: input.q,
    });
    return reply.send({
      items: page.items.map((i) => ({
        id: i.id,
        customerName: i.customerName,
        customerEmail: i.customerEmail,
        currency: i.currency,
        dueDate: i.dueDate,
        total: i.total,
        createdAt: i.createdAt.toISOString(),
        paypal: { state: i.paypalState },
      })),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    });
  };

  // Search text must never be sent in a URL: ingress, CDN and platform request logs record URLs.
  // A `q` on the GET list is refused before any lookup (in addition to the authentication check).
  app.get("/api/invoice-drafts", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    if ("q" in (req.query as Record<string, unknown>)) {
      return reply.code(400).send({ error: "search_requires_post" });
    }
    const query = listQuery.safeParse(req.query);
    if (!query.success)
      return reply.code(400).send({ error: "invalid_query", issues: issues(query.error) });
    return runList(req, reply, query.data);
  });

  // Same owner-scoped, read-only list as the GET above, with the search term in the request body.
  app.post(
    "/api/invoice-drafts/search",
    { preHandler: app.requireOperator },
    async (req, reply) => {
      noStore(reply);
      const body = searchBody.safeParse(req.body ?? {});
      if (!body.success)
        return reply.code(400).send({ error: "invalid_query", issues: issues(body.error) });
      return runList(req, reply, body.data);
    },
  );

  // ------------------------------------------------------------------- read
  app.get("/api/invoice-drafts/:id", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not_found" });
    // Operator-scoped: another operator's id and an unknown id are both a plain 404.
    const saved = await drafts.getOwned(params.data.id, operatorId(req));
    if (!saved) return reply.code(404).send({ error: "not_found" });
    const op = await resolveOps(req).get(saved.id);
    return reply.send({
      ...present(saved, false),
      paypal: op
        ? { state: op.state, paypalInvoiceId: op.paypalInvoiceId, lastErrorCode: op.lastErrorCode }
        : { state: "none", paypalInvoiceId: null, lastErrorCode: null },
    });
  });

  // ------------------------------------------------------- PayPal sandbox draft
  app.post(
    "/api/invoice-drafts/:id/paypal-draft",
    { preHandler: app.requireOperator },
    async (req, reply) => {
      noStore(reply);
      // Fail closed before touching anything: real sandbox calls are opt-in AND need a configured client.
      if (!config.paypalDraftsEnabled || !deps.paypal) {
        return reply.code(503).send({ error: "paypal_disabled" });
      }
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(404).send({ error: "not_found" });
      const bodyOk = z.union([z.undefined(), z.null(), z.strictObject({})]).safeParse(req.body);
      if (!bodyOk.success) return reply.code(400).send({ error: "invalid_request" });
      const actor = operatorId(req);
      const reqOps = resolveOps(req);
      const reqClock = () => clock(req);

      const result = await createPayPalDraft(
        {
          drafts,
          ops: reqOps,
          paypal: deps.paypal,
          audit,
          clock: reqClock,
          ...(deps.seams?.leaseSeconds !== undefined
            ? { leaseSeconds: deps.seams.leaseSeconds }
            : {}),
          ...(deps.seams?.coolOffSeconds !== undefined
            ? { coolOffSeconds: deps.seams.coolOffSeconds }
            : {}),
          ...(deps.seams?.maxIdempotencyAgeSeconds !== undefined
            ? { maxIdempotencyAgeSeconds: deps.seams.maxIdempotencyAgeSeconds }
            : {}),
        },
        { invoiceId: params.data.id, operatorId: actor, requestId: req.id },
      );

      switch (result.kind) {
        case "created":
          return reply.code(result.replayed ? 200 : 201).send({
            paypalInvoiceId: result.paypalInvoiceId,
            status: "DRAFT",
            replayed: result.replayed,
          });
        case "not_found":
          return reply.code(404).send({ error: "not_found" });
        case "mapping_refused":
          return reply.code(422).send({ error: "mapping_refused", reason: result.reason });
        case "in_progress":
          return reply
            .code(409)
            .header("retry-after", String(result.retryAfterSeconds))
            .send({ error: "in_progress" });
        case "reconciliation_pending":
          return reply
            .code(409)
            .header("retry-after", String(result.retryAfterSeconds))
            .send({ error: "reconciliation_pending" });
        case "mismatch":
          return reply.code(502).send({ error: "paypal_mismatch", code: result.code });
        case "rejected":
          return reply.code(502).send({ error: "paypal_rejected", code: result.code });
        case "unknown":
          // Never claim a draft exists. The operation stays reconcilable.
          return reply
            .code(502)
            .header("retry-after", "30")
            .send({ error: "paypal_outcome_unknown", code: result.code });
        case "audit_unavailable":
          return reply.code(503).send({ error: "unavailable" });
      }
    },
  );
}

function present(saved: import("@nmi/db").SavedDraft, replayed: boolean) {
  return {
    id: saved.id,
    draft: saved.draft,
    totals: saved.totals,
    paypalInvoiceId: saved.paypalInvoiceId,
    replayed,
    createdAt: saved.createdAt.toISOString(),
  };
}
