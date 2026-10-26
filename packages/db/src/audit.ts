import { PRIVILEGED_ACTIONS } from "@nmi/domain";
import type { Db } from "./client.js";
import { auditLog } from "./schema.js";

export type AuditOutcome = "success" | "failure" | "denied" | "error";

export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.request_denied",
  "operator.provision",
  "approval.consume",
  "invoice.parse",
  "invoice.draft_save",
  "paypal.draft_create",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Closed set of detail keys. Anything else is dropped, so secrets/PII cannot be logged by accident. */
export interface AuditDetail {
  reason?: string | undefined;
  approvalId?: string | undefined;
  sessionId?: string | undefined;
  usernameKnown?: boolean | undefined;
  privilegedAction?: string | undefined;
  invoiceId?: string | undefined;
  /** Closed-token state such as `created`, `unknown`, `needs_clarification`. */
  state?: string | undefined;
}

export interface AuditEvent {
  requestId?: string | undefined;
  /** Operator id, `anonymous`, or `system`. Never a username, email or token. */
  actor: string;
  action: AuditAction;
  resourceId?: string | undefined;
  outcome: AuditOutcome;
  detail?: AuditDetail | undefined;
}

export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safe = (v: string | undefined): string | null => (v && SAFE_TOKEN.test(v) ? v : null);

export function sanitizeAuditDetail(
  detail: AuditDetail | undefined,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (!detail) return out;
  const d = detail as Record<string, unknown>;
  if (typeof d["reason"] === "string" && SAFE_TOKEN.test(d["reason"])) out["reason"] = d["reason"];
  if (typeof d["approvalId"] === "string" && UUID.test(d["approvalId"]))
    out["approvalId"] = d["approvalId"];
  if (typeof d["sessionId"] === "string" && UUID.test(d["sessionId"]))
    out["sessionId"] = d["sessionId"];
  if (typeof d["usernameKnown"] === "boolean") out["usernameKnown"] = d["usernameKnown"];
  if (
    typeof d["privilegedAction"] === "string" &&
    (PRIVILEGED_ACTIONS as readonly string[]).includes(d["privilegedAction"])
  ) {
    out["privilegedAction"] = d["privilegedAction"];
  }
  if (typeof d["invoiceId"] === "string" && UUID.test(d["invoiceId"]))
    out["invoiceId"] = d["invoiceId"];
  if (typeof d["state"] === "string" && SAFE_TOKEN.test(d["state"])) out["state"] = d["state"];
  return out;
}

/** Appends one sanitized row. Free-form identifiers that are not simple tokens are replaced, not stored. */
export function createAuditSink(db: Db): AuditSink {
  return {
    async record(e) {
      await db.insert(auditLog).values({
        actor: safe(e.actor) ?? "invalid",
        action: e.action,
        resourceId: e.resourceId === undefined ? null : (safe(e.resourceId) ?? "invalid"),
        requestId: safe(e.requestId),
        outcome: e.outcome,
        detail: sanitizeAuditDetail(e.detail),
      });
    },
  };
}
