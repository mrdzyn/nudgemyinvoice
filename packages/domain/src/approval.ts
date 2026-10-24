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

export interface PrivilegedRequest {
  action: PrivilegedAction;
  resourceId: string;
  payload: unknown;
}

export type ApprovalDecision = { ok: true } | { ok: false; reason: string };

/** Pure check. Persistence must additionally consume the grant atomically (see ApprovalStore). */
export function verifyApproval(
  grant: ApprovalGrant | null | undefined,
  request: PrivilegedRequest,
  now: Date,
): ApprovalDecision {
  if (!grant) return { ok: false, reason: "no_approval" };
  if (grant.consumedAt) return { ok: false, reason: "already_consumed" };
  if (grant.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (grant.action !== request.action) return { ok: false, reason: "action_mismatch" };
  if (grant.resourceId !== request.resourceId) return { ok: false, reason: "resource_mismatch" };
  if (grant.payloadDigest !== payloadDigest(request.payload)) {
    return { ok: false, reason: "payload_changed" };
  }
  return { ok: true };
}

/** Implementations must make consume() a single atomic compare-and-set (e.g. UPDATE ... WHERE consumed_at IS NULL). */
export interface ApprovalStore {
  get(id: string): Promise<ApprovalGrant | null>;
  consume(id: string, now: Date): Promise<boolean>;
}

export class ApprovalError extends Error {
  constructor(public readonly reason: string) {
    super(`Privileged action refused: ${reason}`);
    this.name = "ApprovalError";
  }
}

/** The single gate every privileged call must cross. Throws unless approved and consumed once. */
export async function requireApproval(
  store: ApprovalStore,
  approvalId: string | undefined,
  request: PrivilegedRequest,
  now: Date,
): Promise<void> {
  const grant = approvalId ? await store.get(approvalId) : null;
  const decision = verifyApproval(grant, request, now);
  if (!decision.ok) throw new ApprovalError(decision.reason);
  if (!(await store.consume(grant!.id, now))) throw new ApprovalError("already_consumed");
}
