/* eslint-disable -- release-readiness evidence tooling (not production code): Node globals and console output by design. */
// NMI-RENDER-P4 backup / recovery drill (DISPOSABLE, LOCAL, SYNTHETIC ONLY).
//
//   node design/evidence/NMI-RENDER-P4/run-backup-restore-drill.mjs
//
// Builds a private PostgreSQL 16 cluster in a temp dir (loopback, short socket dir), applies migrations
// 0000-0007 as a NON-superuser owner role, applies packages/db/ops/runtime-role.sql, seeds synthetic rows, takes a
// custom-format pg_dump, simulates data loss, restores into a fresh database and proves: identical content and
// schema fingerprints, runtime-role denials intact, append-only audit trigger intact; plus a corrupted-dump
// negative control that must fail closed. Nothing here touches Render, an owner database or any provider.
// Cleanup is single-flight and the data directory is deleted only after PostgreSQL shutdown is confirmed.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, openSync, readSync, closeSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const B = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PORT = 54391;
const work = mkdtempSync(join(tmpdir(), "nmi-p4-drill-"));
const sock = mkdtempSync("/tmp/p4s.");
const data = join(work, "data");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, result: ok ? "PASS" : "FAIL", detail: ok ? "" : String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " - " + String(detail).slice(0, 300)}`);
};
const run = (bin, args, o = {}) =>
  spawnSync(join(B, bin), args, { encoding: "utf8", ...o });
const conn = (user, db) => ["-h", "127.0.0.1", "-p", String(PORT), "-U", user, ...(db ? ["-d", db] : [])];
const sql = (user, db, text, extra = []) =>
  run("psql", [...conn(user, db), "-v", "ON_ERROR_STOP=1", "-X", "-A", "-t", ...extra, "-c", text]);
const file = (user, db, f) => run("psql", [...conn(user, db), "-v", "ON_ERROR_STOP=1", "-X", "-q", "-1", "-f", f]);
const one = (user, db, text) => {
  const r = sql(user, db, text);
  return r.status === 0 ? r.stdout.trim() : `ERR:${r.stderr.trim()}`;
};
const MIGRATIONS = [
  "0000_young_mister_fear", "0001_complete_spot", "0002_light_proteus", "0003_audit_log_immutable",
  "0004_zippy_namorita", "0005_glorious_giant_girl", "0006_known_colleen_wing", "0007_perfect_doomsday",
];
const OWNER = "nmi_owner";
let started = false;
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  let down = !started;
  if (started) {
    run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    down = run("pg_ctl", ["-D", data, "status"]).status !== 0;
  }
  if (down) {
    rmSync(work, { recursive: true, force: true });
    rmSync(sock, { recursive: true, force: true });
  } else console.error("PostgreSQL shutdown NOT confirmed; data dir kept:", work);
  check("cleanup: PostgreSQL shutdown confirmed before the data directory was deleted", down, "kept " + work);
}
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { cleanup(); process.exit(130); });

try {
  let r = run("initdb", ["-D", data, "-A", "trust", "-U", "p4super"]);
  if (r.status !== 0) throw new Error("initdb failed: " + r.stderr);
  r = run("pg_ctl", ["-D", data, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -k ${sock}`, "-l", join(work, "log"), "-w", "start"]);
  if (r.status !== 0) throw new Error("start failed: " + r.stderr);
  started = true;
  check("disposable PostgreSQL 16 cluster started", /PostgreSQL 16\./.test(one("p4super", "postgres", "select version()")), one("p4super", "postgres", "select version()"));

  // Roles: a NON-superuser owner (like the host's database user) and the least-privilege runtime role.
  sql("p4super", "postgres", `CREATE ROLE ${OWNER} LOGIN NOSUPERUSER CREATEDB NOCREATEROLE`);
  sql("p4super", "postgres", "CREATE ROLE nmi_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION");
  check("owner role is not a superuser", one("p4super", "postgres", `select rolsuper from pg_roles where rolname='${OWNER}'`) === "f");

  sql("p4super", "postgres", `CREATE DATABASE nmi_p4_src OWNER ${OWNER}`);
  let ok = true;
  for (const m of MIGRATIONS) if (file(OWNER, "nmi_p4_src", join(root, "packages/db/migrations", m + ".sql")).status !== 0) ok = false;
  check("migrations 0000-0007 apply as the non-superuser owner, one transaction each", ok);
  check("runtime-role.sql applies as the owner", file(OWNER, "nmi_p4_src", join(root, "packages/db/ops/runtime-role.sql")).status === 0);

  // Synthetic seed (no real names, e-mails or hashes).
  const seed = `
    INSERT INTO operators (username, password_hash) VALUES ('p4-synthetic-operator', 'scrypt$synthetic-not-a-real-hash');
    INSERT INTO invoices (customer_name, customer_email, currency, subtotal_minor, total_minor, due_date)
      SELECT 'Synthetic Client ' || g, 'client' || g || '@example.invalid', (ARRAY['USD','EUR','JPY'])[1 + g % 3],
             10000 * g, 10000 * g, DATE '2026-12-01' + g FROM generate_series(1, 25) g;
    INSERT INTO invoice_items (invoice_id, description, quantity_hundredths, unit_price_minor)
      SELECT id, 'Synthetic item', 100, subtotal_minor FROM invoices;
    INSERT INTO audit_log (actor, action, outcome) VALUES ('p4-drill', 'seed', 'success');`;
  const seeded = sql(OWNER, "nmi_p4_src", seed);
  check("synthetic rows seeded by the owner (25 invoices, 25 items)", seeded.status === 0 && one(OWNER, "nmi_p4_src", "select (select count(*) from invoices)||'/'||(select count(*) from invoice_items)") === "25/25", seeded.stderr);
  check("runtime role can append to the audit log (INSERT)", sql("nmi_runtime", "nmi_p4_src", "INSERT INTO audit_log (actor, action, outcome) VALUES ('p4-runtime','probe','success')").status === 0);

  const tables = one(OWNER, "nmi_p4_src", "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname='public'").split(",");
  const fingerprint = (db) =>
    tables.map((t) => `${t}=${one(OWNER, db, `select count(*)||':'||coalesce(md5(string_agg(x::text, '|' order by x::text)),'-') from ${t} x`)}`).join(";");
  // Constraint text is compared without parentheses/whitespace: pg_dump/pg_restore re-prints the AND nesting of
  // one CHECK expression (invoices_customer_fields_bounded) differently; the logic is identical.
  const schemaPrint = (db) =>
    one(OWNER, db, `select md5(string_agg(s, '|' order by s)) from (
      select 'c:'||table_name||'.'||column_name||':'||data_type||':'||is_nullable as s from information_schema.columns where table_schema='public'
      union all select 'k:'||conrelid::regclass||':'||conname||':'||regexp_replace(pg_get_constraintdef(oid), '[()[:space:]]', '', 'g') from pg_constraint where connamespace='public'::regnamespace
      union all select 't:'||tgrelid::regclass||':'||tgname from pg_trigger where not tgisinternal
      union all select 'i:'||indexname||':'||indexdef from pg_indexes where schemaname='public') q`);
  const fpSrc = fingerprint("nmi_p4_src");
  const schSrc = schemaPrint("nmi_p4_src");
  check("source fingerprints taken (tables: " + tables.length + ")", tables.length >= 8 && !fpSrc.includes("ERR:") && /^[0-9a-f]{32}$/.test(schSrc), fpSrc + schSrc);

  // Backup as the owner role.
  const dump = join(work, "backup.dump");
  const t0 = Date.now();
  r = run("pg_dump", [...conn(OWNER, "nmi_p4_src"), "-Fc", "--no-owner", "-f", dump]);
  chmodSync(dump, 0o600);
  check("pg_dump (custom format) succeeded; file mode 0600", r.status === 0 && (statSync(dump).mode & 0o777) === 0o600, r.stderr);
  check("pg_restore --list can read the archive", run("pg_restore", ["--list", dump]).status === 0);

  // Disaster: wrong change by the owner, then the whole database lost.
  check("simulated data loss (owner deletes invoices)", sql(OWNER, "nmi_p4_src", "DELETE FROM invoices").status === 0 && one(OWNER, "nmi_p4_src", "select count(*) from invoices") === "0");
  check("lost database dropped", sql("p4super", "postgres", "DROP DATABASE nmi_p4_src").status === 0);

  // Recovery: fresh database owned by the owner role; restore as that NON-superuser role.
  sql("p4super", "postgres", `CREATE DATABASE nmi_p4_restored OWNER ${OWNER}`);
  r = run("pg_restore", [...conn(OWNER, "nmi_p4_restored"), "--no-owner", "--exit-on-error", dump]);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check(`pg_restore as the non-superuser owner succeeded (backup+disaster+restore ${secs}s on synthetic data)`, r.status === 0, r.stderr);
  check("restored CONTENT fingerprint equals the pre-loss source (every table, rows + md5)", fingerprint("nmi_p4_restored") === fpSrc, fingerprint("nmi_p4_restored") + " vs " + fpSrc);
  check("restored SCHEMA fingerprint equals the source (columns, constraints, triggers, indexes)", schemaPrint("nmi_p4_restored") === schSrc, schemaPrint("nmi_p4_restored") + " vs " + schSrc);

  // Least privilege and immutability must survive a restore (grants are part of the archive).
  const rt = (text) => sql("nmi_runtime", "nmi_p4_restored", text);
  const code = (res) => (res.stderr.match(/ERROR:\s+(.*)/) || [, ""])[1];
  check("restored: runtime SELECT on invoices works", rt("select count(*) from invoices").status === 0);
  check("restored: runtime DELETE FROM invoices denied", /permission denied/.test(code(rt("delete from invoices"))), rt("delete from invoices").stderr);
  check("restored: runtime CREATE TABLE denied", /permission denied/.test(code(rt("create table zz(x int)"))));
  check("restored: runtime UPDATE audit_log denied", /permission denied/.test(code(rt("update audit_log set actor='x'"))));
  check("restored: runtime TRUNCATE denied", /permission denied/.test(code(rt("truncate invoices"))));
  check("restored: runtime cannot touch operators credentials", /permission denied/.test(code(rt("update operators set password_hash='x'"))));
  check("restored: runtime audit INSERT still works", rt("INSERT INTO audit_log (actor, action, outcome) VALUES ('p4-runtime','post-restore','success')").status === 0);
  const own = sql(OWNER, "nmi_p4_restored", "update audit_log set actor='tamper'");
  check("restored: the append-only trigger rejects even the OWNER's UPDATE of audit_log", own.status !== 0 && /append-only|immutable|not allowed|cannot/i.test(own.stderr), own.stderr);

  // Negative control: a corrupted archive must fail closed and not be mistaken for a recovery.
  const bytes = readFileSync(dump);
  const bad = join(work, "corrupt.dump");
  writeFileSync(bad, bytes.subarray(0, Math.floor(bytes.length / 2)));
  sql("p4super", "postgres", `CREATE DATABASE nmi_p4_bad OWNER ${OWNER}`);
  const badR = run("pg_restore", [...conn(OWNER, "nmi_p4_bad"), "--no-owner", "--exit-on-error", bad]);
  check("NEGATIVE CONTROL: a truncated dump is rejected by pg_restore (non-zero exit)", badR.status !== 0);
  check("NEGATIVE CONTROL: the fingerprint of the failed restore does not match the source", fingerprint("nmi_p4_bad").includes("ERR:") || fingerprint("nmi_p4_bad") !== fpSrc);
  // Dump content sensitivity note (informational, asserted so the runbook wording stays true).
  check("the archive contains operator credential hashes and customer rows (must be stored privately)", /scrypt\$synthetic-not-a-real-hash/.test(run("pg_restore", ["-f", "-", "--data-only", dump]).stdout));
} catch (e) {
  check("drill ran to completion without an exception", false, e && e.stack);
} finally {
  cleanup();
}
const fails = results.filter((x) => x.result === "FAIL").length;
writeFileSync(join(here, "backup-restore-results.json"), JSON.stringify({ at: new Date().toISOString(), pg: "16", total: results.length, failed: fails, results }, null, 2) + "\n");
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
