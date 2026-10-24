import { createHash } from "node:crypto";

/** Actions that move money or notify external parties. Never callable by the model, cron or webhooks. */
export const PRIVILEGED_ACTIONS = [
  "sendInvoice",
  "sendReminder",
  "cancelInvoice",
  "refundPayment",
  "capturePayment",
  "markPaid",
] as const;
export type PrivilegedAction = (typeof PRIVILEGED_ACTIONS)[number];

export function isPrivilegedAction(name: string): name is PrivilegedAction {
  return (PRIVILEGED_ACTIONS as readonly string[]).includes(name);
}

/** Deterministic JSON with sorted keys, so equal payloads always hash equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function payloadDigest(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export interface ApprovalGrant {
  id: string;
  action: PrivilegedAction;
  resourceId: string;
  payloadDigest: string;
  approverId: string; // authenticated human; never a model, job or webhook identity
  expiresAt: Date;
  consumedAt: Date | null;
}

declare const trustedActorBrand: unique symbol;

/**
 * The authenticated human making the request, taken from the backend security context
 * (verified session). NEVER build this from model output, tool arguments or a client field.
 * Only the future authentication middleware may call {@link asTrustedActor}; the brand makes
 * accidental construction a compile error, and the runtime checks below fail closed.
 */
export interface TrustedActor {
  readonly [trustedActorBrand]: true;
  readonly kind: "human";
  readonly id: string;
}

export function asTrustedActor(verifiedHumanId: string): TrustedActor {
  return { kind: "human", id: verifiedHumanId } as TrustedActor;
}

export interface PrivilegedRequest {
  action: PrivilegedAction;
  resourceId: string;
  payload: unknown;
  /** Absent or untrusted means the request is refused. */
  actor: TrustedActor | undefined;
}

export type ApprovalDecision = { ok: true } | { ok: false; reason: string };

function actorIsTrusted(actor: TrustedActor | undefined): actor is TrustedActor {
  return (
    actor !== undefined &&
    actor !== null &&
    actor.kind === "human" &&
    typeof actor.id === "string" &&
    actor.id.length > 0
  );
}

/** Pure check on an inspected grant. It is advisory: consumption re-checks everything atomically. */
export function verifyApproval(
  grant: ApprovalGrant | null | undefined,
  request: PrivilegedRequest,
  now: Date,
): ApprovalDecision {
  if (!actorIsTrusted(request.actor)) return { ok: false, reason: "untrusted_actor" };
  if (!grant) return { ok: false, reason: "no_approval" };
  if (grant.consumedAt) return { ok: false, reason: "already_consumed" };
  if (grant.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (grant.action !== request.action) return { ok: false, reason: "action_mismatch" };
  if (grant.resourceId !== request.resourceId) return { ok: false, reason: "resource_mismatch" };
  if (grant.approverId !== request.actor.id) return { ok: false, reason: "approver_mismatch" };
  if (grant.payloadDigest !== payloadDigest(request.payload)) {
    return { ok: false, reason: "payload_changed" };
  }
  return { ok: true };
}

/** Every value the stored grant must still equal at the instant of consumption. */
export interface ConsumeExpectation {
  id: string;
  action: PrivilegedAction;
  resourceId: string;
  payloadDigest: string;
  approverId: string;
  now: Date;
}

/**
 * Persistence contract for approvals.
 *
 * `consumeIfMatches` MUST be ONE conditional atomic operation, e.g. in PostgreSQL:
 *   UPDATE approvals SET consumed_at = $now
 *   WHERE id = $id AND action = $action AND resource_id = $resource
 *     AND payload_digest = $digest AND approver_id = $approver
 *     AND consumed_at IS NULL AND expires_at > $now
 * and return true only if exactly one row was updated. It must never read-then-write, and must
 * never trust a previously inspected copy. Under concurrency at most one caller may get true.
 *
 * NOTE: database atomicity is NOT proven until a PostgreSQL adapter passes the shared contract
 * tests (`runApprovalStoreContract`) against a real database.
 */
export interface ApprovalStore {
  get(id: string): Promise<ApprovalGrant | null>;
  consumeIfMatches(expected: ConsumeExpectation): Promise<boolean>;
}

export class ApprovalError extends Error {
  constructor(public readonly reason: string) {
    super(`Privileged action refused: ${reason}`);
    this.name = "ApprovalError";
  }
}

/**
 * The single gate every privileged call must cross. Throws unless the trusted actor holds an
 * exact, unexpired grant, and that grant is consumed exactly once. The expectation passed to the
 * store is derived from the REQUEST (not from the inspected grant), so a grant changed between
 * inspection and consumption cannot authorize a different request.
 */
export async function requireApproval(
  store: ApprovalStore,
  approvalId: string | undefined,
  request: PrivilegedRequest,
  now: Date,
): Promise<void> {
  if (!actorIsTrusted(request.actor)) throw new ApprovalError("untrusted_actor");
  const grant = approvalId ? await store.get(approvalId) : null;
  const decision = verifyApproval(grant, request, now);
  if (!decision.ok) throw new ApprovalError(decision.reason);
  const consumed = await store.consumeIfMatches({
    id: (grant as ApprovalGrant).id,
    action: request.action,
    resourceId: request.resourceId,
    payloadDigest: payloadDigest(request.payload),
    approverId: request.actor.id,
    now,
  });
  if (!consumed) throw new ApprovalError("consume_failed");
}
