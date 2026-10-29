#!/usr/bin/env node
// NMI-RENDER-P1-PREFLIGHT (test-only, offline). Runs the ACTUAL `pnpm --filter @nmi/api
// provision-operator` CLI against an isolated, disposable PostgreSQL 16 instance that enforces
// SCRAM-SHA-256 password authentication, using the runbook's exact owner-run convention:
// non-secret PG* parameters + a temporary 0600 PGPASSFILE + a passwordless DATABASE_URL.
//
// All credentials are synthetic, random per run, held in memory (or in the 0600/0700 temp dir that
// is always removed) and never printed, passed as arguments or written to the repository.
// Output is a sanitized JSON report on stdout. Exit 0 only if every check passed.
//
//   node scripts/preflight-provision-operator.mjs [--report <path>]
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearInterval, setInterval } from "node:timers";

const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const ROOT = process.cwd();
const DB = "nmi_preflight";
const OWNER = "nmi_owner";
const HOST = "127.0.0.1";
const MIGRATIONS = [
  "0000_young_mister_fear",
  "0001_complete_spot",
  "0002_light_proteus",
  "0003_audit_log_immutable",
  "0004_zippy_namorita",
  "0005_glorious_giant_girl",
  "0006_known_colleen_wing",
];

const rnd = (n) => randomBytes(n).toString("hex");
// Both special characters the runbook must escape (':' and '\') are guaranteed present.
const mk = () => `Pw:${rnd(6)}\\${rnd(6)}:z`;
const OWNER_PW = mk();
const OP_PW_1 = mk();
const OP_PW_2 = mk();
const WRONG_PW = mk();
const OP_USER = `op-${rnd(3)}`;
const SECRETS = [OWNER_PW, OP_PW_1, OP_PW_2, WRONG_PW];

const checks = [];
const check = (id, desc, ok, note) => {
  checks.push({ id, desc, ok: Boolean(ok), ...(note ? { note } : {}) });
  if (!ok) process.exitCode = 1;
};
const captured = []; // every byte the children printed, scanned for secrets at the end

let work;
let dataDir;
let port = 0;
let started = false;

const bin = (n) => join(PG_BIN, n);
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });

/** Escape ':' and '\' exactly as docs/NMI-RENDER-P1-RUNBOOK.md §5 step 2 does. */
const escapePgpass = (pw) => pw.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
function writePgpass(path, pw, mode = 0o600) {
  writeFileSync(path, `${HOST}:${port}:${DB}:${OWNER}:${escapePgpass(pw)}\n`, { mode });
  chmodSync(path, mode);
}

/** Environment for owner-run commands: non-secret PG* parameters + the password file ONLY. */
function ownerEnv(pgpass) {
  const base = {};
  for (const k of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "NODE_OPTIONS"]) {
    if (process.env[k]) base[k] = process.env[k];
  }
  return {
    ...base,
    PGHOST: HOST,
    PGPORT: String(port),
    PGDATABASE: DB,
    PGUSER: OWNER,
    PGSSLMODE: "disable", // loopback fixture has no TLS; the runbook uses `require` against Render
    ...(pgpass ? { PGPASSFILE: pgpass } : { PGPASSFILE: join(work, "does-not-exist") }),
  };
}
const psql = (env, sql, extra = []) =>
  run(bin("psql"), ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", ...extra, "-c", sql], { env });
const q = (env, sql) => {
  const r = psql(env, sql);
  captured.push(r.stdout ?? "", r.stderr ?? "");
  return r;
};
const one = (env, sql) => (q(env, sql).stdout ?? "").trim();

/** Run the real CLI as a child process while sampling the process table for argument leaks. */
async function runCli(env, label) {
  const child = spawn("pnpm", ["--filter", "@nmi/api", "provision-operator"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const argSamples = [];
  const timer = setInterval(() => {
    const ps = run("ps", ["-axo", "command="]).stdout ?? "";
    argSamples.push(ps);
  }, 150);
  const code = await new Promise((resolve) => child.on("close", resolve));
  clearInterval(timer);
  captured.push(out, err, ...argSamples);
  const leaked = argSamples.some((p) => SECRETS.some((s) => p.includes(s)));
  return { label, code, out, err, argSamples: argSamples.length, argLeak: leaked };
}

function cliEnv(pgpass, password, urlHasPassword = false) {
  const e = ownerEnv(pgpass);
  return {
    ...e,
    // Passwordless URL: the pg driver must obtain the password from PGPASSFILE.
    DATABASE_URL: urlHasPassword ? "" : `postgres://${OWNER}@${HOST}:${port}/${DB}?sslmode=disable`,
    NMI_OPERATOR_USERNAME: OP_USER,
    NMI_OPERATOR_PASSWORD: password,
  };
}

const snapshot = (env) => ({
  operators: Number(one(env, "SELECT count(*) FROM operators")),
  audit: Number(one(env, "SELECT count(*) FROM audit_log WHERE action='operator.provision'")),
  version: one(env, "SELECT coalesce(max(credential_version),0) FROM operators"),
  hash: one(env, "SELECT coalesce(max(password_hash),'') FROM operators"),
});

async function main() {
  work = mkdtempSync(join(tmpdir(), "nmi-preflight-")); // mode 0700
  chmodSync(work, 0o700);
  dataDir = join(work, "pg");
  const freePort = await new Promise((resolve) => {
    const s = net.createServer().listen(0, HOST, () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  port = freePort;

  /* ---------- 1. isolated SCRAM-enforcing PostgreSQL 16 ---------- */
  const pwfile = join(work, "initpw");
  writeFileSync(pwfile, OWNER_PW, { mode: 0o600 });
  const init = run(bin("initdb"), [
    "-D",
    dataDir,
    "-U",
    OWNER,
    "-E",
    "UTF8",
    "--auth-host=scram-sha-256",
    "--auth-local=scram-sha-256",
    `--pwfile=${pwfile}`,
  ]);
  rmSync(pwfile, { force: true });
  captured.push(init.stdout ?? "", init.stderr ?? "");
  check("pg.init", "initdb with SCRAM-SHA-256 for host and local connections", init.status === 0);
  const start = run(bin("pg_ctl"), [
    "-D",
    dataDir,
    "-w",
    "-l",
    join(work, "pg.log"),
    "-o",
    `-p ${port} -c unix_socket_directories='' -c listen_addresses=${HOST} -c password_encryption=scram-sha-256`,
    "start",
  ]);
  started = start.status === 0;
  check(
    "pg.start",
    "disposable PostgreSQL 16 started on loopback only (random port, no unix socket)",
    started,
  );
  if (!started) return;

  const pgpass = join(work, "pgpass");
  writePgpass(pgpass, OWNER_PW);
  const env = ownerEnv(pgpass);
  // Bootstrap only: the maintenance database needs its own password-file entry. (The runbook's owner
  // file names the application database, which is what every later command uses.)
  const adminPass = join(work, "pgpass-admin");
  writeFileSync(adminPass, `${HOST}:${port}:postgres:${OWNER}:${escapePgpass(OWNER_PW)}\n`, {
    mode: 0o600,
  });
  const dbCreate = run(
    bin("psql"),
    ["-X", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${DB}`],
    { env: { ...env, PGDATABASE: "postgres", PGPASSFILE: adminPass } },
  );
  rmSync(adminPass, { force: true });
  captured.push(dbCreate.stdout ?? "", dbCreate.stderr ?? "");
  check(
    "pg.createdb",
    "owner created the disposable database over the password file",
    dbCreate.status === 0,
  );

  // Enforced method, not merely "a password was supplied".
  const rules = one(
    env,
    "SELECT string_agg(DISTINCT auth_method, ',') FROM pg_hba_file_rules WHERE type IN ('host','local')",
  );
  check(
    "auth.hba",
    "every pg_hba rule is scram-sha-256",
    rules === "scram-sha-256",
    `methods=${rules}`,
  );
  check(
    "auth.stored",
    "owner role verifier is SCRAM-SHA-256",
    one(env, `SELECT left(rolpassword,14) FROM pg_authid WHERE rolname='${OWNER}'`) ===
      "SCRAM-SHA-256$",
  );
  const noPw = run(bin("psql"), ["-X", "-w", "-d", DB, "-c", "SELECT 1"], {
    env: { ...env, PGPASSFILE: join(work, "none") },
  });
  captured.push(noPw.stdout ?? "", noPw.stderr ?? "");
  check(
    "auth.nopassword",
    "connection with no password source is refused by the server",
    noPw.status !== 0,
    (noPw.stderr ?? "").includes("no password supplied") ? "no password supplied" : "refused",
  );
  writePgpass(join(work, "badpass"), WRONG_PW);
  const bad = run(bin("psql"), ["-X", "-w", "-d", DB, "-c", "SELECT 1"], {
    env: { ...env, PGPASSFILE: join(work, "badpass") },
  });
  captured.push(bad.stdout ?? "", bad.stderr ?? "");
  check(
    "auth.wrongpassword",
    "wrong password is refused (SQLSTATE 28P01 text: password authentication failed)",
    bad.status !== 0 && (bad.stderr ?? "").includes("password authentication failed"),
  );

  /* ---------- 2. password file conventions ---------- */
  const st = statSync(pgpass);
  check(
    "pgpass.mode",
    "temporary PGPASSFILE is mode 0600",
    (st.mode & 0o777) === 0o600,
    `mode=${(st.mode & 0o777).toString(8)}`,
  );
  const line = readFileSync(pgpass, "utf8").trimEnd();
  const fields = line.split(/(?<!\\):/); // split on unescaped ':'
  check(
    "pgpass.fields",
    "five fields; ':' and '\\' in the password escaped",
    fields.length === 5 &&
      fields[4] === escapePgpass(OWNER_PW) &&
      /\\:/.test(fields[4]) &&
      /\\\\/.test(fields[4]),
  );
  check(
    "pgpass.synthetic",
    "synthetic owner password contains both ':' and '\\'",
    OWNER_PW.includes(":") && OWNER_PW.includes("\\"),
  );

  /* ---------- runbook step 2: migrations over the password file ---------- */
  let migrated = true;
  for (const f of MIGRATIONS) {
    const r = run(
      bin("psql"),
      [
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-1",
        "-f",
        join(ROOT, "packages/db/migrations", `${f}.sql`),
      ],
      { env },
    );
    captured.push(r.stdout ?? "", r.stderr ?? "");
    if (r.status !== 0) migrated = false;
  }
  check(
    "migrate",
    "seven committed migrations applied in journal order with psql + PGPASSFILE",
    migrated,
  );
  check("migrate.empty", "no operator before provisioning", snapshot(env).operators === 0);

  /* ---------- 3. actual CLI: create ---------- */
  const r1 = await runCli(cliEnv(pgpass, OP_PW_1), "create");
  check(
    "cli.create.exit",
    "actual CLI exit 0 over passwordless DATABASE_URL + PGPASSFILE",
    r1.code === 0,
    `exit=${r1.code}`,
  );
  check(
    "cli.create.msg",
    "stdout reports exactly one 'Operator created.' line (after the pnpm banner)",
    r1.out.split("\n").some((l) => l === "Operator created.") &&
      r1.out.split("\n").filter((l) => /^Operator /.test(l)).length === 1,
  );
  const warn =
    /DeprecationWarning: pgpass support is deprecated and will be removed in pg@9\.0/.test(r1.err);
  check(
    "cli.warning",
    "pg PGPASSFILE deprecation warning is emitted and left visible (not suppressed)",
    warn,
  );
  const s1 = snapshot(env);
  check("db.operator", "exactly one operator row", s1.operators === 1);
  check(
    "db.hash",
    "stored credential is a salted scrypt hash, never the plaintext",
    /^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/.test(s1.hash) && !s1.hash.includes(OP_PW_1),
  );
  check(
    "db.audit",
    "one operator.provision audit row (reason=created, outcome=success)",
    s1.audit === 1 &&
      one(
        env,
        "SELECT outcome||'/'||(detail->>'reason') FROM audit_log WHERE action='operator.provision' ORDER BY at LIMIT 1",
      ) === "success/created",
  );
  check("db.version", "credential_version is 1 after creation", s1.version === "1");

  // A live session to prove revocation on rotation.
  const opId = one(env, "SELECT id FROM operators");
  q(
    env,
    `INSERT INTO sessions (operator_id, token_hash, expires_at) VALUES ('${opId}', '${rnd(32)}', now() + interval '1 hour')`,
  );
  check(
    "db.session",
    "one live (unrevoked) session exists before rotation",
    Number(one(env, "SELECT count(*) FROM sessions WHERE revoked_at IS NULL")) === 1,
  );

  /* ---------- 4. second invocation rotates ---------- */
  const r2 = await runCli(cliEnv(pgpass, OP_PW_2), "rotate");
  check("cli.rotate.exit", "second CLI invocation exit 0", r2.code === 0, `exit=${r2.code}`);
  check(
    "cli.rotate.msg",
    "stdout reports 'Operator updated; existing sessions revoked.'",
    r2.out.split("\n").some((l) => l === "Operator updated; existing sessions revoked."),
  );
  const s2 = snapshot(env);
  check("rot.single", "single-operator invariant holds (1 row)", s2.operators === 1);
  check("rot.version", "credential_version bumped 1 -> 2", s2.version === "2");
  check(
    "rot.hash",
    "password hash changed and is not the new plaintext",
    s2.hash !== s1.hash && !s2.hash.includes(OP_PW_2),
  );
  check(
    "rot.sessions",
    "the pre-existing session is revoked; no live session remains",
    Number(one(env, "SELECT count(*) FROM sessions WHERE revoked_at IS NULL")) === 0 &&
      Number(one(env, "SELECT count(*) FROM sessions WHERE revoked_at IS NOT NULL")) === 1,
  );
  check(
    "rot.audit",
    "second audit row (reason=rotated)",
    s2.audit === 2 &&
      one(
        env,
        "SELECT detail->>'reason' FROM audit_log WHERE action='operator.provision' ORDER BY at DESC LIMIT 1",
      ) === "rotated",
  );

  /* ---------- 5. negative controls: no usable password source ---------- */
  const before = snapshot(env);
  const sessionsBefore = one(env, "SELECT count(*) FROM sessions");
  const cases = [
    ["missing PGPASSFILE (path does not exist)", cliEnv(null, OP_PW_1)],
    [
      "PGPASSFILE for a different password (wrong credential)",
      (() => {
        const p = join(work, "wrong");
        writePgpass(p, WRONG_PW);
        return cliEnv(p, OP_PW_1);
      })(),
    ],
    [
      "group/world-readable PGPASSFILE (mode 0644)",
      (() => {
        const p = join(work, "open");
        writePgpass(p, OWNER_PW, 0o644);
        return cliEnv(p, OP_PW_1);
      })(),
    ],
  ];
  const permNote = [];
  for (const [label, e] of cases) {
    const r = await runCli(e, label);
    const leakInErr = SECRETS.some((s) => r.out.includes(s) || r.err.includes(s));
    check(
      `neg.${label.split(" ")[0]}.${label.includes("0644") ? "perm" : label.includes("wrong") ? "wrong" : "missing"}`,
      `${label}: clean nonzero exit, no secret in output`,
      r.code !== 0 && !leakInErr,
      `exit=${r.code}; cli_stderr=${JSON.stringify(
        r.err
          .split("\n")
          .filter((l) => /^(Provisioning failed|WARNING|Set DATABASE)/.test(l))
          .map((l) => l.replace(/"[^"]*nmi-preflight-[^"]*"/, "<tmp pgpass>"))
          .join(" | "),
      )}`,
    );
    permNote.push(label);
  }
  const after = snapshot(env);
  check(
    "neg.nomutation",
    "failed invocations changed nothing (operator, audit, version, hash, sessions identical)",
    JSON.stringify(after) === JSON.stringify(before) &&
      one(env, "SELECT count(*) FROM sessions") === sessionsBefore,
  );
  // PGPASSWORD must not be set anywhere in this harness.
  check(
    "env.nopgpassword",
    "no PGPASSWORD / password-bearing URL was ever provided to any command",
    !("PGPASSWORD" in process.env) &&
      cases.every(
        ([, e]) =>
          !("PGPASSWORD" in e) &&
          !/@.*:.*@/.test(e.DATABASE_URL ?? "") &&
          !/:\/\/[^@/]*:[^@/]*@/.test(e.DATABASE_URL ?? ""),
      ),
  );

  // Rotated credential is real: login semantics via the stored hash are covered by unit tests; here we
  // show only that the process-table samples never contained a secret.
  check(
    "leak.args",
    "no secret appeared in any sampled process argument list during CLI runs",
    ![r1].concat([r2]).some((r) => r.argLeak),
    `samples=${r1.argSamples + r2.argSamples}`,
  );
}

function cleanup() {
  const result = { stopped: false, dirRemoved: false, portClosed: false, pgpassRemoved: false };
  try {
    if (started && dataDir) {
      run(bin("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
      result.stopped = true;
    }
  } catch {
    /* best-effort cleanup/scan; failures surface through the cleanup and scan checks */
  }
  try {
    if (work) rmSync(work, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup/scan; failures surface through the cleanup and scan checks */
  }
  result.dirRemoved = !work || !existsSync(work);
  result.pgpassRemoved = !work || !existsSync(join(work, "pgpass"));
  if (port) {
    result.portClosed = run("nc", ["-z", HOST, String(port)]).status !== 0;
  } else result.portClosed = true;
  result.stopped = result.stopped || !started;
  return result;
}

function scanRepo() {
  // The secrets are random per run and exist only in memory: they must not be in any tracked or
  // untracked repository file at the end of the run.
  const listed = run("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT })
    .stdout.split("\n")
    .filter(Boolean);
  let hits = 0;
  for (const f of listed) {
    try {
      const s = statSync(join(ROOT, f));
      if (!s.isFile() || s.size > 5_000_000) continue;
      const t = readFileSync(join(ROOT, f), "utf8");
      if (SECRETS.some((x) => t.includes(x))) hits++;
    } catch {
      /* best-effort cleanup/scan; failures surface through the cleanup and scan checks */
    }
  }
  return { files: listed.length, hits };
}

const versions = () => {
  const pgVer = JSON.parse(
    readFileSync(join(ROOT, "node_modules/.pnpm/pg@8.23.1/node_modules/pg/package.json"), "utf8"),
  ).version;
  const pgpassPkg =
    readdirSync(join(ROOT, "node_modules/.pnpm")).find((d) => d.startsWith("pgpass@")) ?? "unknown";
  return {
    node: process.version,
    pnpm: run("pnpm", ["-v"]).stdout.trim(),
    postgres: run(bin("postgres"), ["--version"]).stdout.trim(),
    "pg (driver)": pgVer,
    pgpass: pgpassPkg,
    os: `${run("uname", ["-sr"]).stdout.trim()} ${run("uname", ["-m"]).stdout.trim()}`,
  };
};

let fatal = null;
try {
  await main();
} catch (e) {
  fatal = e instanceof Error ? e.message.replaceAll(/\S*(Pw:)\S*/g, "[redacted]") : "error";
  process.exitCode = 1;
} finally {
  const cleanupResult = cleanup();
  const repo = scanRepo();
  const all = captured.join("\n");
  const leakedOutput = SECRETS.some((s) => all.includes(s));
  check(
    "leak.output",
    "no synthetic secret in any captured command output (stdout, stderr, process samples)",
    !leakedOutput,
  );
  check(
    "leak.repo",
    "no synthetic secret in any repository file after the run",
    repo.hits === 0,
    `scanned=${repo.files}`,
  );
  check(
    "cleanup",
    "server stopped, temp dir and PGPASSFILE removed, port closed",
    cleanupResult.stopped &&
      cleanupResult.dirRemoved &&
      cleanupResult.pgpassRemoved &&
      cleanupResult.portClosed,
    JSON.stringify(cleanupResult),
  );
  const failed = checks.filter((c) => !c.ok).length;
  const report = {
    task: "NMI-RENDER-P1-PREFLIGHT",
    versions: versions(),
    fatal,
    passed: checks.length - failed,
    total: checks.length,
    failed,
    checks,
  };
  const json = JSON.stringify(report, null, 2);
  if (SECRETS.some((s) => json.includes(s))) {
    console.error("REFUSING to print report: it contains a secret");
    process.exit(3);
  }
  const i = process.argv.indexOf("--report");
  if (i > 0) writeFileSync(process.argv[i + 1], json + "\n");
  console.log(json);
}
