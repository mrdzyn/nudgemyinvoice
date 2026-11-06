/* eslint-disable -- release-readiness evidence tooling (not production code): Node globals and console output by design. */
// NMI-P7-C backup / recovery drill v2 (migrations 0000-0008 incl. invoice_nudges). DISPOSABLE, LOCAL, SYNTHETIC ONLY.
//
//   node design/evidence/NMI-P7/run-nudge-recovery-drill.mjs
//
// A NEW runner. The P4 runner (design/evidence/NMI-RENDER-P4/run-backup-restore-drill.mjs) and its historical 26/26
// result are not modified. This builds a private PostgreSQL 16 cluster in a temp dir (loopback, short socket dir, its
// own port), applies ALL nine migrations as a NON-superuser owner, applies packages/db/ops/runtime-role.sql, seeds
// synthetic invoices and invoice_nudges in every review state, takes a custom-format pg_dump, simulates data loss,
// restores as the NON-superuser owner and proves: identical content and schema/ACL fingerprints, ownership and
// constraint relationships, the one-pending-per-invoice rule, the runtime role's allowed and denied nudge operations
// (before the dump AND after the restore), and that truncated/garbage archives fail closed. Nothing here touches
// Render, an existing database, a provider or the network. Cleanup is single-flight; the data directory is deleted
// only after PostgreSQL shutdown is confirmed. It proves LOCAL PostgreSQL 16 recovery only, not Render-managed recovery.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const B = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PORT = 54392;
const SUPER = "p7super";
const OWNER = "nmi_owner";
const work = mkdtempSync(join(tmpdir(), "nmi-p7-drill-"));
const sock = mkdtempSync("/tmp/p7s.");
const data = join(work, "data");
const results = [];
const commands = [];
const check = (name, ok, detail = "") => {
  results.push({ name, result: ok ? "PASS" : "FAIL", detail: ok ? "" : String(detail).slice(0, 500) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " - " + String(detail).slice(0, 300)}`);
};
const run = (bin, args, o = {}) => spawnSync(join(B, bin), args, { encoding: "utf8", ...o });
const conn = (user, db) => ["-h", "127.0.0.1", "-p", String(PORT), "-U", user, ...(db ? ["-d", db] : [])];
const sql = (user, db, text) => run("psql", [...conn(user, db), "-v", "ON_ERROR_STOP=1", "-X", "-A", "-t", "-c", text]);
const file = (user, db, f) => run("psql", [...conn(user, db), "-v", "ON_ERROR_STOP=1", "-X", "-q", "-1", "-f", f]);
const one = (user, db, text) => {
  const r = sql(user, db, text);
  return r.status === 0 ? r.stdout.trim() : `ERR:${r.stderr.trim()}`;
};
const err = (r) => (r.status === 0 ? "" : (r.stderr.match(/ERROR:\s+(.*)/) || [, r.stderr])[1]);
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();

const MIGRATIONS = [
  "0000_young_mister_fear", "0001_complete_spot", "0002_light_proteus", "0003_audit_log_immutable",
  "0004_zippy_namorita", "0005_glorious_giant_girl", "0006_known_colleen_wing", "0007_perfect_doomsday",
  "0008_mushy_zarek",
];
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

let pgVersion = "";
try {
  const sourceSha = git("rev-parse", "HEAD");
  const dirty = git("status", "--porcelain").split("\n").filter(Boolean);
  let r = run("initdb", ["-D", data, "-A", "trust", "-U", SUPER]);
  commands.push(`initdb -D <tmp>/data -A trust -U ${SUPER}`);
  if (r.status !== 0) throw new Error("initdb failed: " + r.stderr);
  r = run("pg_ctl", ["-D", data, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -k ${sock}`, "-l", join(work, "log"), "-w", "start"]);
  commands.push(`pg_ctl -D <tmp>/data -o "-p ${PORT} -c listen_addresses=127.0.0.1 -k <short sock dir>" -w start`);
  if (r.status !== 0) throw new Error("start failed: " + r.stderr);
  started = true;
  pgVersion = one(SUPER, "postgres", "select version()");
  check("disposable PostgreSQL 16 cluster started (loopback only, private temp dir)", /PostgreSQL 16\./.test(pgVersion), pgVersion);

  sql(SUPER, "postgres", `CREATE ROLE ${OWNER} LOGIN NOSUPERUSER CREATEDB NOCREATEROLE`);
  sql(SUPER, "postgres", "CREATE ROLE nmi_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION");
  check("owner role is not a superuser", one(SUPER, "postgres", `select rolsuper from pg_roles where rolname='${OWNER}'`) === "f");
  check("runtime role is not a superuser and cannot create databases or roles", one(SUPER, "postgres", "select rolsuper or rolcreatedb or rolcreaterole from pg_roles where rolname='nmi_runtime'") === "f");

  sql(SUPER, "postgres", `CREATE DATABASE nmi_p7_src OWNER ${OWNER}`);
  let allMig = true;
  for (const m of MIGRATIONS) if (file(OWNER, "nmi_p7_src", join(root, "packages/db/migrations", m + ".sql")).status !== 0) allMig = false;
  check("migrations 0000-0008 (9 files, incl. 0008_mushy_zarek) apply as the non-superuser owner, one transaction each", allMig && MIGRATIONS.length === 9);
  check("runtime-role.sql applies as the owner", file(OWNER, "nmi_p7_src", join(root, "packages/db/ops/runtime-role.sql")).status === 0);
  check("invoice_nudges exists and is owned by the non-superuser owner", one(OWNER, "nmi_p7_src", "select tableowner from pg_tables where tablename='invoice_nudges'") === OWNER);

  // ---- Synthetic seed: the single operator the schema allows, 12 invoices, 12 nudges in every state. No real names, e-mails or hashes. ----
  const U = (n) => `('00000000-0000-4000-8000-${String(n).padStart(12, "0")}')::uuid`;
  const OPA = "'a0000000-0000-4000-8000-00000000000a'::uuid";
  const facts = (n) => `'{"currency":"USD","total":"${n}00.00","dueDate":"2026-10-30","asOf":"2026-11-05","daysAfterDue":6}'::jsonb`;
  const nudge = (n, inv, op, status, extra = "") =>
    `(${U(n)}, ${U(inv)}, ${op}, 'professional', '${status}', 'Synthetic message ${n}', 'Synthetic AI original ${n}', 'Synthetic rationale ${n}', ${facts(inv)}, 'synthetic-fake-model', 'p6-nudge-v2', false, 1, ${extra || "null, null, null"})`;
  const seed = `
    INSERT INTO operators (id, username, password_hash) VALUES
      (${OPA}, 'p7-synthetic-operator', 'scrypt$synthetic-not-a-real-hash');
    INSERT INTO invoices (id, created_by, customer_name, customer_email, currency, subtotal_minor, total_minor, due_date)
      SELECT ${"('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid"},
             ${OPA},
             'Synthetic Client ' || g, 'client' || g || '@example.invalid', (ARRAY['USD','EUR','JPY'])[1 + g % 3],
             10000 * g, 10000 * g, DATE '2026-10-30' FROM generate_series(1, 12) g;
    INSERT INTO invoice_items (invoice_id, description, quantity_hundredths, unit_price_minor)
      SELECT id, 'Synthetic item', 100, subtotal_minor FROM invoices;
    INSERT INTO invoice_nudges (id, invoice_id, operator_id, tone, status, message, ai_message, rationale, facts, model, prompt_version, edited, version, approved_at, rejected_at, superseded_at) VALUES
      ${nudge(101, 1, OPA, "superseded", "null, null, now()")},
      ${nudge(102, 1, OPA, "pending_review")},
      ${nudge(103, 2, OPA, "pending_review")},
      ${nudge(104, 3, OPA, "approved", "now(), null, null")},
      ${nudge(105, 4, OPA, "rejected", "null, now(), null")},
      ${nudge(106, 5, OPA, "pending_review")},
      ${nudge(107, 6, OPA, "approved", "now(), null, null")},
      ${nudge(108, 7, OPA, "rejected", "null, now(), null")},
      ${nudge(109, 8, OPA, "superseded", "null, null, now()")},
      ${nudge(110, 8, OPA, "superseded", "null, null, now()")},
      ${nudge(111, 9, OPA, "superseded", "null, null, now()")},
      ${nudge(112, 9, OPA, "approved", "now(), null, null")};
    INSERT INTO audit_log (actor, action, outcome) VALUES ('p7-drill', 'seed', 'success');`;
  const seeded = sql(OWNER, "nmi_p7_src", seed);
  check("synthetic rows seeded by the owner (1 operator, 12 invoices, 12 items, 12 nudges)", seeded.status === 0 && one(OWNER, "nmi_p7_src", "select (select count(*) from operators)||'/'||(select count(*) from invoices)||'/'||(select count(*) from invoice_items)||'/'||(select count(*) from invoice_nudges)") === "1/12/12/12", seeded.stderr);
  check("nudges cover all four states (3 pending, 3 approved, 2 rejected, 4 superseded), all owned by the operator", one(OWNER, "nmi_p7_src", "select string_agg(status||'='||n, ',' order by status) from (select status, count(*) n from invoice_nudges group by status) q") === "approved=3,pending_review=3,rejected=2,superseded=4" && one(OWNER, "nmi_p7_src", "select count(distinct operator_id) from invoice_nudges") === "1");

  // ---- Constraint / ownership battery. Every statement here is REJECTED, so it never changes any row. ----
  const rt = (db, text) => sql("nmi_runtime", db, text);
  const ow = (db, text) => sql(OWNER, db, text);
  const insNudge = (inv, op, status, extra = "") =>
    `INSERT INTO invoice_nudges (invoice_id, operator_id, tone, status, message, ai_message, rationale, facts, model, prompt_version${extra ? ", " + extra.split("|")[0] : ""}) VALUES (${U(inv)}, ${op}, 'firm', '${status}', 'm', 'a', 'r', '{}'::jsonb, 'm', 'p'${extra ? ", " + extra.split("|")[1] : ""})`;
  const denials = (db, label) => {
    const D = (name, who, text, re) => {
      const r = who(db, text);
      check(`${label}: ${name}`, r.status !== 0 && re.test(err(r)), r.stderr || "statement unexpectedly succeeded");
    };
    const PD = /permission denied/;
    D("one-pending-per-invoice: a second pending draft for invoice 2 is rejected by invoice_nudges_one_pending_uq", rt, insNudge(2, OPA, "pending_review"), /invoice_nudges_one_pending_uq/);
    D("one-pending-per-invoice also binds the owner (invoice 5 already has a pending draft)", ow, insNudge(5, OPA, "pending_review"), /invoice_nudges_one_pending_uq/);
    D("runtime DELETE FROM invoice_nudges denied", rt, "delete from invoice_nudges", PD);
    D("runtime TRUNCATE invoice_nudges denied", rt, "truncate invoice_nudges", PD);
    for (const col of ["ai_message", "rationale", "facts", "model", "prompt_version", "tone", "invoice_id", "operator_id", "id", "created_at"]) {
      const v = col === "facts" ? "'{}'::jsonb" : col === "invoice_id" || col === "operator_id" || col === "id" ? "gen_random_uuid()" : col === "created_at" ? "now()" : col === "tone" ? "'firm'" : "'x'";
      D(`runtime UPDATE of immutable column ${col} denied`, rt, `update invoice_nudges set ${col} = ${v}`, PD);
    }
    D("runtime CREATE TABLE (schema change) denied", rt, "create table p7_zz(x int)", PD);
    D("runtime ALTER TABLE invoice_nudges denied", rt, "alter table invoice_nudges add column p7_zz int", /must be owner|permission denied/);
    D("runtime DROP TABLE invoice_nudges denied", rt, "drop table invoice_nudges", /must be owner|permission denied/);
    D("runtime UPDATE audit_log denied", rt, "update audit_log set actor='x'", PD);
    D("runtime DELETE FROM audit_log denied", rt, "delete from audit_log", PD);
    D("runtime TRUNCATE audit_log denied", rt, "truncate audit_log", PD);
    D("runtime cannot change operator credentials (password_hash)", rt, "update operators set password_hash='x'", PD);
    D("runtime cannot change credential_version or disabled_at", rt, "update operators set credential_version = credential_version + 1", PD);
    D("runtime cannot rewrite saved invoices (customer_name)", rt, "update invoices set customer_name='x'", PD);
    D("runtime DELETE FROM invoices denied", rt, "delete from invoices", PD);
    D("append-only trigger rejects even the OWNER's UPDATE of audit_log", ow, "update audit_log set actor='tamper'", /append-only|immutable|not allowed|cannot/i);
    D("single-operator rule: a second operators row is rejected (operators_single_row_uq), so no cross-operator nudge ownership can exist", ow, "INSERT INTO operators (username, password_hash) VALUES ('p7-second', 'scrypt$synthetic-second')", /operators_single_row_uq/);
    D("check constraint: an unknown status is rejected (invoice_nudges_status_chk)", ow, insNudge(10, OPA, "sent"), /invoice_nudges_status_chk/);
    D("check constraint: approved without approved_at is rejected (invoice_nudges_closed_at_chk)", ow, insNudge(10, OPA, "approved"), /invoice_nudges_closed_at_chk/);
    D("foreign key: a nudge for an unknown operator is rejected (invoice_nudges_operator_id_operators_id_fk)", ow, insNudge(10, "gen_random_uuid()", "pending_review"), /invoice_nudges_operator_id_operators_id_fk/);
    D("foreign key: a nudge for an unknown invoice is rejected (invoice_nudges_invoice_id_invoices_id_fk)", ow, `INSERT INTO invoice_nudges (invoice_id, operator_id, tone, status, message, ai_message, rationale, facts, model, prompt_version) VALUES (gen_random_uuid(), ${OPA}, 'firm', 'pending_review', 'm', 'a', 'r', '{}'::jsonb, 'm', 'p')`, /invoice_nudges_invoice_id_invoices_id_fk/);
    D("foreign key ON DELETE RESTRICT: the OWNER cannot delete an invoice that has nudges", ow, `delete from invoices where id = ${U(1)}`, /invoice_nudges_invoice_id_invoices_id_fk/);
  };
  denials("nmi_p7_src", "source");

  // ---- Fingerprints (content, schema+constraints+indexes+triggers, and ACLs) ----
  const tables = one(OWNER, "nmi_p7_src", "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname='public'").split(",");
  const fingerprint = (db) =>
    tables.map((t) => `${t}=${one(OWNER, db, `select count(*)||':'||coalesce(md5(string_agg(x::text, '|' order by x::text)),'-') from ${t} x`)}`).join(";");
  const nudgeFp = (db) => one(OWNER, db, "select count(*)||':'||md5(string_agg(x::text, '|' order by x::text)) from invoice_nudges x");
  // pg_dump/pg_restore re-prints the AND nesting of some CHECK expressions; compared without parentheses/whitespace.
  const schemaPrint = (db) =>
    one(OWNER, db, `select md5(string_agg(s, '|' order by s)) from (
      select 'c:'||table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') as s from information_schema.columns where table_schema='public'
      union all select 'k:'||conrelid::regclass||':'||conname||':'||regexp_replace(pg_get_constraintdef(oid), '[()[:space:]]', '', 'g') from pg_constraint where connamespace='public'::regnamespace
      union all select 't:'||tgrelid::regclass||':'||tgname from pg_trigger where not tgisinternal
      union all select 'i:'||indexname||':'||indexdef from pg_indexes where schemaname='public') q`);
  const aclPrint = (db) =>
    one(OWNER, db, `select md5(string_agg(s, '|' order by s)) from (
      select 'tbl:'||table_name||':'||privilege_type as s from information_schema.role_table_grants where grantee='nmi_runtime' and table_schema='public'
      union all select 'col:'||table_name||'.'||column_name||':'||privilege_type from information_schema.column_privileges where grantee='nmi_runtime' and table_schema='public'
      union all select 'sch:'||nspname||':'||has_schema_privilege('nmi_runtime', oid, 'USAGE')||has_schema_privilege('nmi_runtime', oid, 'CREATE') from pg_namespace where nspname='public') q`);
  const nudgeShape = (db) =>
    one(OWNER, db, `select (select count(*) from pg_constraint where conrelid='invoice_nudges'::regclass and contype='c')||'c/'||
      (select count(*) from pg_constraint where conrelid='invoice_nudges'::regclass and contype='f')||'f/'||
      (select count(*) from pg_indexes where tablename='invoice_nudges')||'i/'||
      (select count(*) from pg_attribute where attrelid='invoice_nudges'::regclass and attnum>0 and not attisdropped)||'col'`);
  const fpSrc = fingerprint("nmi_p7_src");
  const nudgeSrc = nudgeFp("nmi_p7_src");
  const schSrc = schemaPrint("nmi_p7_src");
  const aclSrc = aclPrint("nmi_p7_src");
  const shapeSrc = nudgeShape("nmi_p7_src");
  check(`source fingerprints taken (${tables.length} tables incl. invoice_nudges)`, tables.includes("invoice_nudges") && tables.length >= 9 && !fpSrc.includes("ERR:") && /^[0-9a-f]{32}$/.test(schSrc) && /^[0-9a-f]{32}$/.test(aclSrc) && /^12:/.test(nudgeSrc), fpSrc + schSrc + aclSrc + nudgeSrc);
  check("source invoice_nudges shape: 10 check constraints, 2 foreign keys, 4 indexes (pkey + 3), 18 columns", shapeSrc === "10c/2f/4i/18col", shapeSrc);

  // ---- Backup ----
  const dump = join(work, "backup.dump");
  const t0 = Date.now();
  commands.push(`pg_dump -h 127.0.0.1 -p ${PORT} -U ${OWNER} -d nmi_p7_src -Fc --no-owner -f <tmp>/backup.dump`);
  r = run("pg_dump", [...conn(OWNER, "nmi_p7_src"), "-Fc", "--no-owner", "-f", dump]);
  chmodSync(dump, 0o600);
  check("pg_dump (custom format) succeeded as the non-superuser owner; file mode 0600", r.status === 0 && (statSync(dump).mode & 0o777) === 0o600, r.stderr);
  check("pg_restore --list can read the archive and lists invoice_nudges", /TABLE DATA public invoice_nudges/.test(run("pg_restore", ["--list", dump]).stdout || ""));

  // ---- Disaster ----
  const del = sql("p7super", "nmi_p7_src", "DELETE FROM invoice_nudges");
  check("simulated data loss (superuser deletes every nudge; the runtime role could not)", del.status === 0 && one(OWNER, "nmi_p7_src", "select count(*) from invoice_nudges") === "0");
  check("lost database dropped", sql(SUPER, "postgres", "DROP DATABASE nmi_p7_src").status === 0);

  // ---- Recovery as the NON-superuser owner ----
  sql(SUPER, "postgres", `CREATE DATABASE nmi_p7_restored OWNER ${OWNER}`);
  commands.push(`pg_restore -h 127.0.0.1 -p ${PORT} -U ${OWNER} -d nmi_p7_restored --no-owner --exit-on-error <tmp>/backup.dump`);
  r = run("pg_restore", [...conn(OWNER, "nmi_p7_restored"), "--no-owner", "--exit-on-error", dump]);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check(`pg_restore as the non-superuser owner succeeded (backup + disaster + restore ${secs}s on synthetic data)`, r.status === 0, r.stderr);
  const fpRes = fingerprint("nmi_p7_restored");
  check("restored CONTENT fingerprint equals the pre-loss source (every table, rows + md5)", fpRes === fpSrc, fpRes + " vs " + fpSrc);
  check("restored invoice_nudges CONTENT equals the source (12 rows, ai_message/facts/rationale/state/version/timestamps)", nudgeFp("nmi_p7_restored") === nudgeSrc, nudgeFp("nmi_p7_restored") + " vs " + nudgeSrc);
  check("restored SCHEMA fingerprint equals the source (columns+defaults, constraints, triggers, indexes)", schemaPrint("nmi_p7_restored") === schSrc);
  check("restored invoice_nudges shape equals the source (10c/2f/4i/18col)", nudgeShape("nmi_p7_restored") === shapeSrc, nudgeShape("nmi_p7_restored"));
  check("restored runtime GRANTS (table, column and schema privileges) equal the source", aclPrint("nmi_p7_restored") === aclSrc);
  check("restored ownership: table owner is the non-superuser owner; nudge operator and invoice references resolve", one(OWNER, "nmi_p7_restored", "select tableowner from pg_tables where tablename='invoice_nudges'") === OWNER && one(OWNER, "nmi_p7_restored", "select count(*) from invoice_nudges n join invoices i on i.id=n.invoice_id join operators o on o.id=n.operator_id") === "12");
  check("restored one-pending-per-invoice index exists and is partial/unique", /CREATE UNIQUE INDEX invoice_nudges_one_pending_uq .*WHERE \(?status = 'pending_review'/.test(one(OWNER, "nmi_p7_restored", "select indexdef from pg_indexes where indexname='invoice_nudges_one_pending_uq'")));
  check("restored ownership scoping: every nudge's operator_id and its invoice's created_by are the one operator", one(OWNER, "nmi_p7_restored", `select count(*) from invoice_nudges n join invoices i on i.id=n.invoice_id where n.operator_id=${OPA} and i.created_by=n.operator_id`) === "12");

  // Sensitivity control: the fingerprint must notice a one-row change (so equality above is meaningful).
  sql(SUPER, "postgres", `CREATE DATABASE nmi_p7_probe OWNER ${OWNER}`);
  run("pg_restore", [...conn(OWNER, "nmi_p7_probe"), "--no-owner", "--exit-on-error", dump]);
  sql("p7super", "nmi_p7_probe", "update invoice_nudges set message = message || '.' where id = " + U(103));
  check("SENSITIVITY CONTROL: changing one nudge message in a second restore changes the nudge fingerprint", nudgeFp("nmi_p7_probe") !== nudgeSrc);

  // ---- Runtime role on the RESTORED database ----
  denials("nmi_p7_restored", "restored");
  const q = (text) => rt("nmi_p7_restored", text);
  check("restored: runtime can read nudges (SELECT)", q("select count(*) from invoice_nudges").status === 0);
  const ins = q(insNudge(10, OPA, "pending_review"));
  check("restored: runtime can INSERT a pending nudge for an invoice without one", ins.status === 0, ins.stderr);
  const upd = q(`update invoice_nudges set message='Synthetic edited text', edited=true, version=version+1, updated_at=now() where invoice_id=${U(10)} and status='pending_review'`);
  check("restored: runtime can edit the reviewed text of a pending nudge (message, edited, version, updated_at)", upd.status === 0, upd.stderr);
  const appr = q(`update invoice_nudges set status='approved', approved_at=now(), version=version+1, updated_at=now() where invoice_id=${U(10)} and status='pending_review'`);
  check("restored: runtime can approve it (status, approved_at, version)", appr.status === 0, appr.stderr);
  check("restored: the AI original of that nudge is untouched by the edit and approval", one(OWNER, "nmi_p7_restored", `select ai_message from invoice_nudges where invoice_id=${U(10)}`) === "a");
  check("restored: once approved, a NEW pending draft for the same invoice is allowed (the partial index frees the slot)", q(insNudge(10, OPA, "pending_review")).status === 0);
  check("restored: runtime audit INSERT still works", q("INSERT INTO audit_log (actor, action, outcome) VALUES ('p7-runtime','post-restore','success')").status === 0);

  // ---- Negative controls: corrupted archives fail closed ----
  const bytes = readFileSync(dump);
  const trunc = join(work, "truncated.dump");
  writeFileSync(trunc, bytes.subarray(0, Math.floor(bytes.length / 2)));
  const garbage = join(work, "garbage.dump");
  writeFileSync(garbage, Buffer.concat([Buffer.from("NOTPGDMP"), bytes.subarray(8)]));
  for (const [label, f] of [["truncated", trunc], ["wrong-header", garbage]]) {
    sql(SUPER, "postgres", `CREATE DATABASE nmi_p7_bad_${label.replace("-", "_")} OWNER ${OWNER}`);
    const db = `nmi_p7_bad_${label.replace("-", "_")}`;
    const bad = run("pg_restore", [...conn(OWNER, db), "--no-owner", "--exit-on-error", f]);
    const fpBad = fingerprint(db);
    check(`NEGATIVE CONTROL: a ${label} archive is rejected by pg_restore (non-zero exit)`, bad.status !== 0, bad.stderr);
    check(`NEGATIVE CONTROL: the ${label} restore does not reproduce the source fingerprint`, fpBad.includes("ERR:") || fpBad !== fpSrc);
  }
  check("the archive contains operator credential hashes and customer rows (must be stored privately)", /scrypt\$synthetic-not-a-real-hash/.test(run("pg_restore", ["-f", "-", "--data-only", dump]).stdout));

  var meta = {
    sourceSha,
    sourceTreeDirtyAtRun: dirty.length > 0 ? dirty : false,
    migrations: Object.fromEntries([...MIGRATIONS.map((m) => [m + ".sql", sha256(join(root, "packages/db/migrations", m + ".sql"))]), ["runtime-role.sql", sha256(join(root, "packages/db/ops/runtime-role.sql"))]]),
    node: process.version,
    pgServer: pgVersion,
    pgDump: run("pg_dump", ["--version"]).stdout.trim(),
    pgRestore: run("pg_restore", ["--version"]).stdout.trim(),
    host: `${process.platform}-${process.arch}`,
    pgBin: B,
    port: PORT,
    runner: "node design/evidence/NMI-P7/run-nudge-recovery-drill.mjs",
    commands,
  };
} catch (e) {
  check("drill ran to completion without an exception", false, e && e.stack);
} finally {
  cleanup();
}
const fails = results.filter((x) => x.result === "FAIL").length;
writeFileSync(join(here, "recovery-results.json"), JSON.stringify({ at: new Date().toISOString(), scope: "local PostgreSQL 16 only; not Render-managed recovery", total: results.length, failed: fails, ...(typeof meta === "undefined" ? {} : meta), results }, null, 2) + "\n");
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
