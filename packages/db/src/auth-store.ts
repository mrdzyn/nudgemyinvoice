import { eq, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { operators, sessions } from "./schema.js";

export interface OperatorRecord {
  id: string;
  username: string;
  passwordHash: string;
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
      })
      .from(operators)
      .where(sql`${operators.username} = ${username} AND ${operators.disabledAt} IS NULL`)
      .limit(1);
    return rows[0] ?? null;
  }

  async createSession(input: {
    operatorId: string;
    tokenHash: string;
    ttlMinutes: number;
  }): Promise<{ sessionId: string; expiresAt: Date }> {
    const rows = await this.db
      .insert(sessions)
      .values({
        operatorId: input.operatorId,
        tokenHash: input.tokenHash,
        expiresAt: sql`clock_timestamp() + make_interval(mins => ${input.ttlMinutes})`,
      })
      .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
    const r = rows[0];
    if (!r) throw new Error("session insert returned no row");
    return { sessionId: r.id, expiresAt: r.expiresAt };
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
   * Idempotent provisioning of THE operator. Same username: rotate the hash and revoke all sessions.
   * A different username while one exists: OperatorConflictError (single-row unique index).
   */
  async upsertOperator(input: {
    username: string;
    passwordHash: string;
  }): Promise<{ id: string; created: boolean }> {
    const existing = await this.db
      .select({ id: operators.id, username: operators.username })
      .from(operators)
      .limit(1);
    const row = existing[0];
    if (row) {
      if (row.username !== input.username) throw new OperatorConflictError();
      await this.db
        .update(operators)
        .set({ passwordHash: input.passwordHash, disabledAt: null })
        .where(eq(operators.id, row.id));
      await this.db.execute(
        sql`UPDATE sessions SET revoked_at = clock_timestamp() WHERE operator_id = ${row.id} AND revoked_at IS NULL`,
      );
      return { id: row.id, created: false };
    }
    try {
      const ins = await this.db
        .insert(operators)
        .values({ username: input.username, passwordHash: input.passwordHash })
        .returning({ id: operators.id });
      return { id: (ins[0] as { id: string }).id, created: true };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new OperatorConflictError();
      throw e;
    }
  }
}
