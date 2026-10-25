import { OperatorConflictError, type AuditSink, type PostgresAuthStore } from "@nmi/db";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  type ScryptParams,
  DEFAULT_SCRYPT_PARAMS,
} from "./password.js";

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

export class ProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionError";
  }
}

/**
 * Explicit, idempotent creation or rotation of the single operator. Messages never include the
 * password. Nothing here runs during migrations or application start-up.
 */
export async function provisionOperator(
  deps: { store: PostgresAuthStore; audit: AuditSink; params?: ScryptParams },
  input: { username: string; password: string },
): Promise<{ created: boolean }> {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new ProvisionError("Username must be 3-64 characters of a-z, 0-9, '.', '_' or '-'");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH || input.password.length > MAX_PASSWORD_LENGTH) {
    throw new ProvisionError(
      `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`,
    );
  }
  const passwordHash = await hashPassword(input.password, deps.params ?? DEFAULT_SCRYPT_PARAMS);
  try {
    const { id, created } = await deps.store.upsertOperator({ username, passwordHash });
    await deps.audit.record({
      actor: "system",
      action: "operator.provision",
      resourceId: id,
      outcome: "success",
      detail: { reason: created ? "created" : "rotated" },
    });
    return { created };
  } catch (e) {
    if (e instanceof OperatorConflictError) {
      await deps.audit
        .record({
          actor: "system",
          action: "operator.provision",
          outcome: "denied",
          detail: { reason: "operator_exists" },
        })
        .catch(() => undefined);
      throw new ProvisionError(
        "A different operator already exists; only one operator is supported",
      );
    }
    throw e;
  }
}
