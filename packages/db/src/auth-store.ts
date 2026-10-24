import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { operators } from "./schema.js";

export interface OperatorRecord {
  id: string;
  username: string;
  passwordHash: string;
  /** Version of the credential the caller is about to verify; echoed back to createSession. */
  credentialVersion: number;
}

export interface ValidSession {
  sessionId: string;
  operatorId: string;
  username: string;
  expiresAt: Date;
}

export class OperatorConflictError extends Error {
  constructor() {
    super("A different operator is already provisioned; only one operator is allowed");
    this.name = "OperatorConflictError";
  }
}

/**
 * Operator and session persistence. All expiry/idle decisions use the DATABASE clock
 * (`clock_timestamp()`); the application never supplies "now". Only token HASHES are handled here.
 */
export class PostgresAuthStore {
  constructor(private readonly db: Db) {}

  async findOperatorByUsername(username: string): Promise<OperatorRecord | null> {
    const rows = await this.db
      .select({
        id: operators.id,
        username: operators.username,
        passwordHash: operators.passwordHash,
        credentialVersion: operators.credentialVersion,
      })
      .from(operators)
      .where(sql`${operators.username} = ${username} AND ${operators.disabledAt} IS NULL`)
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Issues a session ONLY IF the operator's credential is still the one the caller verified.
   *
   * One statement: `INSERT ... SELECT ... FOR UPDATE OF o`. The operator row lock is taken here, after
   * the (slow) password verification, and held only for this statement. A concurrent rotation that
   * already holds the lock makes this statement wait, then re-evaluate the WHERE against the
   * committed row: the bumped `credential_version` no longer matches and nothing is inserted. If this
   * statement wins the lock first, the rotation waits and then revokes the session it just created.
   * Returns null (fail closed) when the credential changed or the operator was disabled.
   */
  async createSession(input: {
    operatorId: string;
    credentialVersion: number;
    tokenHash: string;
    ttlMinutes: number;
  }): Promise<{ sessionId: string; expiresAt: Date } | null> {
    const res = await this.db.execute<{ id: string; expires_at: Date | string }>(sql`
      INSERT INTO sessions (operator_id, token_hash, expires_at)
      SELECT o.id, ${input.tokenHash}, clock_timestamp() + make_interval(mins => ${input.ttlMinutes})
      FROM operators o
      WHERE o.id = ${input.operatorId}
        AND o.credential_version = ${input.credentialVersion}
        AND o.disabled_at IS NULL
      FOR UPDATE OF o
      RETURNING id, expires_at`);
    const r = res.rows[0];
    return r ? { sessionId: r.id, expiresAt: new Date(r.expires_at) } : null;
  }

  /**
   * One statement: finds a session that is not revoked, not past its absolute expiry, not idle for
   * too long, whose operator is not disabled, and refreshes `last_seen_at`. Returns null otherwise.
   */
  async validateAndTouchSession(input: {
    tokenHash: string;
    idleMinutes: number;
  }): Promise<ValidSession | null> {
    const res = await this.db.execute<{
      session_id: string;
      operator_id: string;
      username: string;
      expires_at: Date | string; // raw execute() is not mapped by drizzle
    }>(sql`
      UPDATE sessions s SET last_seen_at = clock_timestamp()
      FROM operators o
      WHERE s.operator_id = o.id
        AND s.token_hash = ${input.tokenHash}
        AND s.revoked_at IS NULL
        AND o.disabled_at IS NULL
        AND s.expires_at > clock_timestamp()
        AND s.last_seen_at > clock_timestamp() - make_interval(mins => ${input.idleMinutes})
      RETURNING s.id AS session_id, o.id AS operator_id, o.username, s.expires_at`);
    const r = res.rows[0];
    return r
      ? {
          sessionId: r.session_id,
          operatorId: r.operator_id,
          username: r.username,
          expiresAt: new Date(r.expires_at),
        }
      : null;
  }

  /** Immediate server-side invalidation. Returns whether a live session was revoked. */
  async revokeSession(sessionId: string): Promise<boolean> {
    const res = await this.db.execute(
      sql`UPDATE sessions SET revoked_at = clock_timestamp() WHERE id = ${sessionId} AND revoked_at IS NULL`,
    );
    return (res.rowCount ?? 0) === 1;
  }

  /**
   * Idempotent provisioning of THE operator, in ONE transaction that locks the operator row first.
   * Same username: set the new hash, bump `credential_version` and revoke every live session, all or
   * nothing. A different username while one exists: OperatorConflictError (single-row unique index).
   * Serialization with `createSession` is by the row lock, so a login that verified the old password
   * either committed its session before this transaction's revoke (and is revoked) or is refused.
   */
  async upsertOperator(input: {
    username: string;
    passwordHash: string;
  }): Promise<{ id: string; created: boolean }> {
    return this.db.transaction(async (tx) => {
      const locked = await tx.execute<{ id: string; username: string }>(
        sql`SELECT id, username FROM operators LIMIT 1 FOR UPDATE`,
      );
      const row = locked.rows[0];
      if (row) {
        if (row.username !== input.username) throw new OperatorConflictError();
        await tx.execute(sql`
          UPDATE operators
          SET password_hash = ${input.passwordHash},
              credential_version = credential_version + 1,
              disabled_at = NULL
          WHERE id = ${row.id}`);
        await tx.execute(
          sql`UPDATE sessions SET revoked_at = clock_timestamp() WHERE operator_id = ${row.id} AND revoked_at IS NULL`,
        );
        return { id: row.id, created: false };
      }
      try {
        const ins = await tx
          .insert(operators)
          .values({ username: input.username, passwordHash: input.passwordHash })
          .returning({ id: operators.id });
        return { id: (ins[0] as { id: string }).id, created: true };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new OperatorConflictError();
        throw e;
      }
    });
  }
}
