import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  PostgresInvoiceDraftStore,
  PostgresPayPalImportStore,
  type AuditSink,
  type Db,
} from "@nmi/db";
import { formatMoney } from "@nmi/shared";
import type { PayPalInvoicingReadDraft } from "@nmi/paypal";
import type { AppConfig } from "../config.js";
import { BoundedWorkGate } from "../auth/work-gate.js";
import { WindowBudget } from "../auth/window-budget.js";
import { syncPaypalDrafts } from "../services/paypal-sync-service.js";

const emptyBody = z.union([z.undefined(), z.null(), z.strictObject({})]);
const listQuery = z.strictObject({
  limit: z
    .string()
    .regex(/^\d{1,3}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional(),
});

const issues = (e: z.ZodError) =>
  e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

export interface PayPalSyncRouteDeps {
  config: AppConfig;
  db: Db;
  audit: AuditSink;
  /** Absent unless sandbox credentials are configured: sync then answers 503. */
  paypal?: PayPalInvoicingReadDraft | undefined;
  clock?: ((req?: FastifyRequest) => Date) | undefined;
  seams?: { syncBudgetMax?: number; syncConcurrency?: number } | undefined;
}

const SYNC_WINDOW_MS = 10 * 60 * 1000;

/**
 * Manual, authenticated, one-way PayPal Sandbox DRAFT import.
 *
 * - POST /api/paypal/imports/sync runs one bounded read-only list import for the operator.
 * - GET  /api/paypal/imports reads back that operator's imported rows for the dashboard.
 *
 * Both routes are inert unless PAYPAL_SYNC_ENABLED=true (default OFF) and a server-side
 * PayPal client exists. The sync never sends, reminds, cancels, pays, creates or modifies
 * anything in PayPal, and never writes to local invoices or the draft-operation fence.
 */
export function paypalSyncRoutes(app: FastifyInstance, deps: PayPalSyncRouteDeps): void {
  const { config, audit } = deps;
  const clock = (req?: FastifyRequest) => (deps.clock ? deps.clock(req) : new Date());
  const drafts = new PostgresInvoiceDraftStore(deps.db);
  const imports = new PostgresPayPalImportStore(deps.db);
  const budget = new WindowBudget(deps.seams?.syncBudgetMax ?? 5, SYNC_WINDOW_MS);
  const gate = new BoundedWorkGate(deps.seams?.syncConcurrency ?? 1, 0);

  const operatorId = (req: FastifyRequest) =>
    (req.session as NonNullable<typeof req.session>).operatorId;
  const noStore = (reply: FastifyReply) => reply.header("cache-control", "no-store");

  app.post("/api/paypal/imports/sync", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    // Fail closed: the read-sync flag and a configured client gate every import.
    if (!config.paypalSyncEnabled) return reply.code(503).send({ error: "sync_disabled" });
    if (!deps.paypal) return reply.code(503).send({ error: "sync_unavailable" });
    const bodyOk = emptyBody.safeParse(req.body);
    if (!bodyOk.success)
      return reply.code(400).send({ error: "invalid_request", issues: issues(bodyOk.error) });
    const actor = operatorId(req);

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
      const result = await syncPaypalDrafts(
        { drafts, imports, paypal: deps.paypal, audit, clock: () => clock(req) },
        { operatorId: actor, requestId: req.id },
      );
      if (!result.auditOk) {
        // The import wrote rows but the audit trail is missing: fail closed and say so.
        // Already committed rows are preserved (a retry is idempotent, never a duplicate).
        return reply.code(500).send({
          error: "audit_failed",
          counts: result.counts,
          syncedAt: result.syncedAt.toISOString(),
          truncated: result.truncated,
          partialFailure: true,
        });
      }
      return reply.send({
        counts: result.counts,
        syncedAt: result.syncedAt.toISOString(),
        truncated: result.truncated,
        partialFailure: result.counts.failed > 0 || result.truncated,
      });
    } finally {
      slot.release();
    }
  });

  app.get("/api/paypal/imports", { preHandler: app.requireOperator }, async (req, reply) => {
    noStore(reply);
    if (!config.paypalSyncEnabled) return reply.code(503).send({ error: "sync_disabled" });
    const query = listQuery.safeParse(req.query);
    if (!query.success)
      return reply.code(400).send({ error: "invalid_query", issues: issues(query.error) });
    const rows = await imports.list({
      operatorId: operatorId(req),
      limit: query.data.limit ?? 50,
    });
    return reply.send({
      items: rows.map((r) => ({
        remoteInvoiceId: r.remoteInvoiceId,
        invoiceNumber: r.invoiceNumber,
        currency: r.currency,
        // Decimal string in the row's own currency; rows are never summed or converted.
        total: formatMoney(BigInt(r.totalMinor), r.currency),
        dueDate: r.dueDate,
        linkedInvoiceId: r.linkedInvoiceId,
        lastSyncedAt: r.lastSyncedAt.toISOString(),
      })),
    });
  });
}

export type { PayPalSyncCounts } from "../services/paypal-sync-service.js";
