import pg from "pg";
import { PostgresAuthStore, createAuditSink, createDb } from "@nmi/db";
import { ProvisionError, provisionOperator } from "../auth/provision.js";

/**
 * Usage (secrets come from the environment and are never printed):
 *   DATABASE_URL=postgres://... NMI_OPERATOR_USERNAME=... NMI_OPERATOR_PASSWORD=... \
 *     pnpm --filter @nmi/api provision-operator
 * Idempotent: re-running with the same username rotates the password and revokes its sessions.
 */
const { DATABASE_URL, NMI_OPERATOR_USERNAME, NMI_OPERATOR_PASSWORD } = process.env;
if (
  !DATABASE_URL ||
  !/^postgres(ql)?:\/\//.test(DATABASE_URL) ||
  !NMI_OPERATOR_USERNAME ||
  !NMI_OPERATOR_PASSWORD
) {
  process.stderr.write(
    "Set DATABASE_URL (postgres://), NMI_OPERATOR_USERNAME and NMI_OPERATOR_PASSWORD in the environment.\n",
  );
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
try {
  const db = createDb(pool);
  const { created } = await provisionOperator(
    { store: new PostgresAuthStore(db), audit: createAuditSink(db) },
    { username: NMI_OPERATOR_USERNAME, password: NMI_OPERATOR_PASSWORD },
  );
  process.stdout.write(
    created ? "Operator created.\n" : "Operator updated; existing sessions revoked.\n",
  );
} catch (e) {
  process.stderr.write(`${e instanceof ProvisionError ? e.message : "Provisioning failed."}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
