import type {
  AuditSink,
  PayPalOperation,
  PostgresInvoiceDraftStore,
  PostgresPayPalOperationStore,
} from "@nmi/db";
import {
  PayPalMappingError,
  PayPalOutcomeUnknownError,
  PayPalRejectedError,
  assertExactMapping,
  buildInvoiceRequest,
  invoiceNumberFor,
  requestDigest,
  verifyRemoteDraft,
  type MappingRefusal,
  type PayPalInvoicingReadDraft,
} from "@nmi/paypal";

export type PayPalDraftResult =
  | { kind: "created"; paypalInvoiceId: string; replayed: boolean }
  | { kind: "in_progress"; retryAfterSeconds: number }
  | { kind: "reconciliation_pending"; retryAfterSeconds: number }
  | { kind: "mismatch"; code: string }
  | { kind: "rejected"; code: string }
  | { kind: "unknown"; code: string }
  | { kind: "mapping_refused"; reason: MappingRefusal }
  | { kind: "audit_unavailable" }
  | { kind: "not_found" };

export interface PayPalDraftDeps {
  drafts: PostgresInvoiceDraftStore;
  ops: PostgresPayPalOperationStore;
  paypal: PayPalInvoicingReadDraft;
  audit: AuditSink;
  clock: () => Date;
  /** How long a `creating` claim is honoured before another request may take over (as a reconcile). */
  leaseSeconds?: number;
  /** After a create request was sent, wait this long before a second create may be considered. */
  coolOffSeconds?: number;
  /** Maximum age in seconds after create_attempted_at beyond which idempotency retention expires. */
  maxIdempotencyAgeSeconds?: number;
}

const LEASE_SECONDS = 120;
const COOL_OFF_SECONDS = 300;
const MAX_IDEMPOTENCY_AGE_SECONDS = 45 * 24 * 3600; // 45 days (PayPal documented retention)

/**
 * Creates AT MOST ONE PayPal sandbox DRAFT invoice for a local draft, durably.
 *
 * Why this shape: PayPal documents `PayPal-Request-Id` only for some Invoicing endpoints, not for
 * create-invoice, so remote idempotency cannot be assumed. The guarantees therefore come from here:
 *  1. one `paypal_draft_operations` row per invoice (unique), reserved before any external call;
 *  2. a single-statement fenced claim, so concurrent requests cannot both call PayPal;
 *  3. the claim and a `create_attempted_at` timestamp are durable BEFORE the request leaves;
 *  4. a deterministic remote `invoice_number` (+ `reference` = local id) lets an unclear outcome be
 *     looked up; after any unclear outcome we RECONCILE (search/get) and NEVER automatically re-create;
 *     an empty search result fails closed to `reconciliation_pending` (relying on human review or
 *     delayed visibility rather than an unproven provider exactly-once guarantee);
 *  5. success is claimed only after GET shows a DRAFT with identical currency, total, due date,
 *     invoice number and reference.
 * Nothing here sends, reminds, cancels, pays or refunds.
 */
export async function createPayPalDraft(
  deps: PayPalDraftDeps,
  input: { invoiceId: string; operatorId: string; requestId: string },
): Promise<PayPalDraftResult> {
  const lease = deps.leaseSeconds ?? LEASE_SECONDS;
  const coolOff = deps.coolOffSeconds ?? COOL_OFF_SECONDS;
  const { drafts, ops, paypal } = deps;

  const saved = await drafts.get(input.invoiceId);
  if (!saved) return { kind: "not_found" };
  if (saved.paypalInvoiceId) {
    return { kind: "created", paypalInvoiceId: saved.paypalInvoiceId, replayed: true };
  }

  // Capture clock once per request to avoid sampling drift across UTC midnight
  const clockNow = deps.clock();
  const today = clockNow.toISOString().slice(0, 10);

  const existingOp = await ops.get(saved.id);
  const isExistingAttempt =
    existingOp !== null &&
    (existingOp.state === "unknown" ||
      existingOp.state === "creating" ||
      existingOp.createAttemptedAt !== null);

  // Candidate invoice date for the atomic reservation attempt.
  // Reconstruct exact immutable invoice_date from persisted operation if already present,
  // otherwise use today from the single captured clock sample.
  const candidateInvoiceDate =
    existingOp?.invoiceDate ??
    (existingOp ? existingOp.createdAt.toISOString().slice(0, 10) : today);

  try {
    if (isExistingAttempt) {
      // For existing in-flight / unknown operations, validate mapping against the persisted original invoice date
      // so an expired due date does not block verification or reconciliation of an already-created remote draft.
      assertExactMapping(saved.draft, candidateInvoiceDate);
    } else {
      // New create attempts must have a due date >= today
      assertExactMapping(saved.draft, today);
    }
  } catch (e) {
    if (e instanceof PayPalMappingError) return { kind: "mapping_refused", reason: e.reason };
    throw e;
  }

  const expectedInvoiceNumber = invoiceNumberFor(saved.id);
  // Candidate body used to compute the reservation payload digest.
  // Note: requestDigest intentionally excludes invoice_date so the payload digest is stable across dates.
  const candidateBody = buildInvoiceRequest(saved.draft, {
    localInvoiceId: saved.id,
    invoiceDate: candidateInvoiceDate,
  });

  const audit = (
    outcome: "success" | "failure" | "denied" | "error",
    state: string,
    reason?: string,
  ) =>
    deps.audit.record({
      requestId: input.requestId,
      actor: input.operatorId,
      action: "paypal.draft_create",
      resourceId: saved.id,
      outcome,
      detail: { invoiceId: saved.id, state, reason },
    });
  const auditBestEffort = (...a: Parameters<typeof audit>) => audit(...a).catch(() => undefined);

  // Atomically insert or retrieve the durable operation row.
  // In a concurrent race across midnight, the winning reservation's row is returned to both callers.
  const existing = await ops.reserve({
    invoiceId: saved.id,
    operatorId: input.operatorId,
    invoiceNumber: expectedInvoiceNumber,
    payloadDigest: requestDigest(candidateBody),
    invoiceDate: candidateInvoiceDate,
  });
  const settledResult = asSettled(existing);
  if (settledResult) return settledResult;

  // DERIVE CANONICAL REQUEST IDENTITY FROM THE PERSISTED OPERATION (C6):
  // If a concurrent competing request won the reservation first, adopt its persisted invoice_date.
  // Legacy rows with invoice_date IS NULL fall back to created_at (or today).
  const canonicalInvoiceDate =
    existing.invoiceDate ??
    (existing.createdAt ? existing.createdAt.toISOString().slice(0, 10) : today);

  const isAttempted =
    existing.state === "unknown" ||
    existing.state === "creating" ||
    existing.createAttemptedAt !== null;

  try {
    if (isAttempted) {
      assertExactMapping(saved.draft, canonicalInvoiceDate);
    } else {
      // Even if adopting an earlier reservation date, fresh create attempts must have dueDate >= today
      assertExactMapping(saved.draft, today);
    }
  } catch (e) {
    if (e instanceof PayPalMappingError) return { kind: "mapping_refused", reason: e.reason };
    throw e;
  }

  // Rebuild the canonical request body and expected values using canonicalInvoiceDate from the persisted operation
  const body = buildInvoiceRequest(saved.draft, {
    localInvoiceId: saved.id,
    invoiceDate: canonicalInvoiceDate,
  });
  const expected = {
    currency: saved.draft.currency,
    total: saved.totals.total,
    dueDate: saved.draft.dueDate,
    invoiceNumber: expectedInvoiceNumber,
    localInvoiceId: saved.id,
  };

  const claim = await ops.claim(saved.id, lease);
  if (!claim.claimed) {
    return asSettled(claim.op) ?? { kind: "in_progress", retryAfterSeconds: 5 };
  }
  const fence = claim.op.attempts;

  // Enforce both payload digest and date identity against the persisted operation
  if (
    existing.payloadDigest !== requestDigest(body) ||
    (claim.op.invoiceDate !== null && claim.op.invoiceDate !== body.detail.invoice_date)
  ) {
    await ops.markMismatch(saved.id, fence, "", "payload_digest_mismatch");
    await auditBestEffort("failure", "mismatch", "payload_digest_mismatch");
    return { kind: "mismatch", code: "payload_digest_mismatch" };
  }

  /** Verifies a known remote id and records the verified outcome. */
  const verifyAndRecord = async (remoteId: string): Promise<PayPalDraftResult> => {
    let remote;
    try {
      remote = await paypal.getInvoice(remoteId);
    } catch (e) {
      const code = e instanceof PayPalOutcomeUnknownError ? e.code : "verify_failed";
      await ops.markUnknown(saved.id, fence, code, remoteId);
      await auditBestEffort("error", "unknown", code);
      return { kind: "unknown", code };
    }
    if (!remote) {
      await ops.markUnknown(saved.id, fence, "created_not_visible", remoteId);
      await auditBestEffort("error", "unknown", "created_not_visible");
      return { kind: "unknown", code: "created_not_visible" };
    }
    const verdict = verifyRemoteDraft(remote, expected);
    if (!verdict.ok) {
      await ops.markMismatch(saved.id, fence, remoteId, verdict.code);
      await auditBestEffort("failure", "mismatch", verdict.code);
      return { kind: "mismatch", code: verdict.code };
    }
    if (!(await ops.markCreated(saved.id, fence, remoteId))) {
      // Our claim was superseded while we verified; the newer claimant owns the outcome.
      return { kind: "in_progress", retryAfterSeconds: 5 };
    }
    await auditBestEffort("success", "created");
    return { kind: "created", paypalInvoiceId: remoteId, replayed: false };
  };

  // ---- Reconcile first after any unclear earlier outcome: look before creating again. ----
  if (claim.mode === "reconcile") {
    let remoteId: string | null = claim.op.paypalInvoiceId;
    if (!remoteId) {
      let ids: string[];
      try {
        ids = await paypal.findInvoiceIdsByNumber(expected.invoiceNumber);
      } catch (e) {
        const code = e instanceof PayPalOutcomeUnknownError ? e.code : "reconcile_failed";
        await ops.markUnknown(saved.id, fence, code);
        await auditBestEffort("error", "unknown", code);
        return { kind: "unknown", code };
      }
      if (ids.length > 1) {
        await ops.markUnknown(saved.id, fence, "ambiguous_remote");
        await auditBestEffort("error", "unknown", "ambiguous_remote");
        return { kind: "unknown", code: "ambiguous_remote" };
      }
      remoteId = ids[0] ?? null;
    }
    if (remoteId) return verifyAndRecord(remoteId);

    // Search returned 0 matching invoice IDs.
    // Check if the previous create attempt is older than PayPal's idempotency retention window.
    const maxAge = deps.maxIdempotencyAgeSeconds ?? MAX_IDEMPOTENCY_AGE_SECONDS;
    const since = claim.secondsSinceCreateAttempt;
    if (since !== null && since > maxAge) {
      // Exceeded provider's idempotency retention limit (45 days).
      // Automatic reconciliation cannot be proven safe; require human operator intervention.
      await ops.markUnknown(saved.id, fence, "idempotency_expired");
      await auditBestEffort("failure", "unknown", "idempotency_expired");
      return { kind: "unknown", code: "idempotency_expired" };
    }

    // PayPal search returned no matches. However, search indexing can lag (delayed visibility),
    // and an empty search response NEVER proves the invoice was not created remotely.
    // To guarantee at-most-one remote invoice, we fail closed: NEVER automatically create again.
    // Instead, return reconciliation_pending for retry/operator review.
    await ops.markUnknown(saved.id, fence, "reconciliation_pending");
    await auditBestEffort("denied", "unknown", "reconciliation_pending");
    const retryAfter =
      since !== null && since < coolOff ? Math.max(5, Math.ceil(coolOff - since)) : 30;
    return { kind: "reconciliation_pending", retryAfterSeconds: retryAfter };
  }

  // ---- Create. The intent is audited first: no audit trail, no external write. ----
  if (saved.draft.dueDate < today) {
    await ops.markRejected(saved.id, fence, "due_date_past");
    await auditBestEffort("failure", "rejected", "due_date_past");
    return { kind: "mapping_refused", reason: "due_date_past" };
  }
  try {
    await audit("success", "creating", "intent");
  } catch {
    await ops.markRejected(saved.id, fence, "audit_unavailable"); // nothing was sent
    return { kind: "audit_unavailable" };
  }
  if (!(await ops.markCreateAttempt(saved.id, fence))) {
    return { kind: "in_progress", retryAfterSeconds: 5 };
  }

  let remoteId: string;
  try {
    remoteId = (await paypal.createDraftInvoice({ body, requestId: claim.op.requestId }))
      .paypalInvoiceId;
  } catch (e) {
    if (e instanceof PayPalRejectedError) {
      await ops.markRejected(saved.id, fence, e.code);
      await auditBestEffort("failure", "rejected", e.code);
      return { kind: "rejected", code: e.code };
    }
    const code = e instanceof PayPalOutcomeUnknownError ? e.code : "internal";
    await ops.markUnknown(saved.id, fence, code);
    await auditBestEffort("error", "unknown", code);
    return { kind: "unknown", code };
  }
  return verifyAndRecord(remoteId);
}

function asSettled(op: PayPalOperation): PayPalDraftResult | null {
  if (op.state === "created" && op.paypalInvoiceId) {
    return { kind: "created", paypalInvoiceId: op.paypalInvoiceId, replayed: true };
  }
  if (op.state === "mismatch") return { kind: "mismatch", code: op.lastErrorCode ?? "mismatch" };
  return null;
}
