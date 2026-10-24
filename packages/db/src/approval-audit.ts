import { ApprovalError, requireApproval } from "@nmi/domain";
import type { ApprovalStore, PrivilegedRequest } from "@nmi/domain";
import type { AuditSink } from "./audit.js";

/**
 * `requireApproval` plus an audit row for the decision. Audit is written AFTER the decision; if the
 * audit write fails on a success the error propagates, so the privileged action does not run (the
 * grant is already consumed and must be re-issued). That is deliberately fail-closed.
 */
export async function requireApprovalAudited(
  deps: { store: ApprovalStore; audit: AuditSink },
  approvalId: string | undefined,
  request: PrivilegedRequest,
  now: Date,
  ctx: { requestId?: string },
): Promise<void> {
  const base = {
    requestId: ctx.requestId,
    actor: request.actor?.id ?? "anonymous",
    action: "approval.consume" as const,
    resourceId: request.resourceId,
  };
  const detail = { approvalId, privilegedAction: request.action };
  try {
    await requireApproval(deps.store, approvalId, request, now);
  } catch (e) {
    if (e instanceof ApprovalError) {
      await deps.audit.record({
        ...base,
        outcome: "denied",
        detail: { ...detail, reason: e.reason },
      });
    } else {
      await deps.audit.record({ ...base, outcome: "error", detail }).catch(() => undefined);
    }
    throw e;
  }
  await deps.audit.record({ ...base, outcome: "success", detail });
}
