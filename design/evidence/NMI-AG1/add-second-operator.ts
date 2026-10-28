/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// TEST-ONLY. Creates a SECOND operator in a DISPOSABLE database so the browser journey can prove
// owner isolation. Production allows exactly one operator (unique index `operators_single_row_uq`
// and the app-level OperatorConflictError); this script drops that index in the throw-away database
// only, then inserts operator B with a real scrypt hash so B can log in through the real login route.
// It refuses to run against any database whose name does not start with "nmi_test".
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(root, "apps/api/package.json"));
const pg = require("pg");
const { hashPassword } = await import(resolve(root, "apps/api/src/auth/password.ts"));

const url = process.env.DATABASE_URL as string;
const username = process.env.NMI_OPERATOR_B_USERNAME as string;
const password = process.env.NMI_OPERATOR_B_PASSWORD as string;
if (!/\/nmi_test[A-Za-z0-9_]*$/.test(new URL(url).pathname)) throw new Error("refusing: not a disposable nmi_test* database");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("DROP INDEX IF EXISTS operators_single_row_uq");
await c.query("INSERT INTO operators (username, password_hash) VALUES ($1, $2)", [username, await hashPassword(password)]);
await c.end();
console.log("second operator created in the disposable database");
