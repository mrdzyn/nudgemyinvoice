import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import pg from "pg";

/**
 * Test-only helpers for real-PostgreSQL suites. A suite runs only when TEST_DATABASE_URL names a
 * disposable database whose name starts with "nmi_test"; otherwise it is skipped (never "passed").
 * Each suite applies the committed migrations into its own scratch schema and drops it afterwards.
 */
export function testDatabaseUrl(): string | undefined {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url && process.env["REQUIRE_DB_TESTS"] === "1") {
    throw new Error("REQUIRE_DB_TESTS=1 but TEST_DATABASE_URL is not set; refusing to skip");
  }
  if (url) {
    const dbName = new URL(url).pathname.replace(/^\//, "");
    if (!/^nmi_test/.test(dbName)) {
      throw new Error(
        `Refusing to run: database "${dbName}" is not a disposable nmi_test* database`,
      );
    }
  }
  return url;
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

export function migrationStatements(): string[] {
  const journal = JSON.parse(
    readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  return journal.entries.flatMap((e) =>
    readFileSync(join(migrationsDir, `${e.tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Drizzle qualifies FK targets as "public"."table"; point them at the scratch schema. */
export async function applyMigrations(client: pg.ClientBase, schema: string): Promise<void> {
  for (const stmt of migrationStatements()) {
    await client.query(stmt.replaceAll('"public".', `"${schema}".`));
  }
}

export interface ScratchDatabase {
  schema: string;
  /** application_name of every pooled connection; lets tests find THEIR backends in pg_stat_activity. */
  appName: string;
  /** Pool whose every connection uses the scratch schema (several real connections). */
  pool: pg.Pool;
  drop(): Promise<void>;
}

export async function createScratchDatabase(
  url: string,
  maxConnections = 10,
): Promise<ScratchDatabase> {
  const schema = `t_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await applyMigrations(admin, schema);
  } finally {
    await admin.end();
  }
  const pool = new pg.Pool({
    connectionString: url,
    max: maxConnections,
    options: `-c search_path=${schema}`,
    application_name: `nmi_${schema}`,
  });
  return {
    schema,
    appName: `nmi_${schema}`,
    pool,
    async drop() {
      await pool.end();
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      try {
        await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await c.end();
      }
    },
  };
}

/**
 * Deterministic barrier: resolves once at least `count` of this scratch database's backends are
 * blocked waiting on a lock (observed in pg_stat_activity). No fixed sleeps decide ordering; the
 * short pause only paces the polling loop, and the wait fails loudly instead of guessing.
 */
export async function waitForBlockedBackends(
  admin: pg.Pool,
  appName: string,
  count: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await admin.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE application_name = $1 AND wait_event_type = 'Lock'`,
      [appName],
    );
    if ((r.rows[0].n as number) >= count) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${count} blocked backend(s)`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
