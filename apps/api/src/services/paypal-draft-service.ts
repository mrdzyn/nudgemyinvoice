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
}

const LEASE_SECONDS = 120;
const COOL_OFF_SECONDS = 300;

/**
 * Creates AT MOST ONE PayPal sandbox DRAFT invoice for a local draft, durably.
 *
 * Why this shape: PayPal documents `PayPal-Request-Id` only for some Invoicing endpoints, not for
 * create-invoice, so remote idempotency cannot be assumed. The guarantees therefore come from here:
 *  1. one `paypal_draft_operations` row per invoice (unique), reserved before any external call;
 *  2. a single-statement fenced claim, so concurrent requests cannot both call PayPal;
 *  3. the claim and a `create_attempted_at` timestamp are durable BEFORE the request leaves;
 *  4. a deterministic remote `invoice_number` (+ `reference` = local id) lets an unclear outcome be
 *     looked up; after any unclear outcome we RECONCILE (search/get) before ever creating again, and
 *     only create again if PayPal shows nothing AND a cool-off since the last attempt has passed;
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

  const today = deps.clock().toISOString().slice(0, 10);
  try {
    assertExactMapping(saved.draft, today);
  } catch (e) {
    if (e instanceof PayPalMappingError) return { kind: "mapping_refused", reason: e.reason };
    throw e;
  }
  const body = buildInvoiceRequest(saved.draft, { localInvoiceId: saved.id, invoiceDate: today });
  const expected = {
    currency: saved.draft.currency,
    total: saved.totals.total,
    dueDate: saved.draft.dueDate,
    invoiceNumber: invoiceNumberFor(saved.id),
    localInvoiceId: saved.id,
  };

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

  const existing = await ops.reserve({
    invoiceId: saved.id,
    operatorId: input.operatorId,
    invoiceNumber: expected.invoiceNumber,
    payloadDigest: requestDigest(body),
  });
  const settledResult = asSettled(existing);
  if (settledResult) return settledResult;

  const claim = await ops.claim(saved.id, lease);
  if (!claim.claimed) {
    return asSettled(claim.op) ?? { kind: "in_progress", retryAfterSeconds: 5 };
  }
  const fence = claim.op.attempts;

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

    // PayPal shows nothing. Search may lag, so only create again after the cool-off.
    const since = claim.secondsSinceCreateAttempt;
    if (since !== null && since < coolOff) {
      await ops.markUnknown(saved.id, fence, "reconcile_wait");
      await auditBestEffort("denied", "unknown", "reconcile_wait");
      return { kind: "reconciliation_pending", retryAfterSeconds: Math.ceil(coolOff - since) };
    }
  }

  // ---- Create. The intent is audited first: no audit trail, no external write. ----
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
