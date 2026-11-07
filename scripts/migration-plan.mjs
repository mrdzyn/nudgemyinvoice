#!/usr/bin/env node
// Read-only migration journal plan, plus the judge loopback target guard.
// Default CLI prints validated tags and never connects.
// --assert-judge-target validates DATABASE_URL and libpq routing env and never connects.
// --psql runs psql only after that check, pinned to 127.0.0.1:54370/nmi_judge.
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_0008 = "0008_mushy_zarek";

function assertRealDirectory(path, label) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    throw new Error(`${label} is missing`);
  }
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error(`${label} must be a real directory, not a symlink`);
  }
}

function assertRealNonEmptyFile(path, label) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    throw new Error(`${label} is missing`);
  }
  if (st.isSymbolicLink() || !st.isFile() || st.size === 0) {
    throw new Error(`${label} must be a non-empty regular file, not a symlink`);
  }
}

export function migrationTags(root = process.cwd()) {
  assertRealDirectory(join(root, "packages"), "packages directory");
  assertRealDirectory(join(root, "packages/db"), "packages/db directory");
  const directory = join(root, "packages/db/migrations");
  assertRealDirectory(directory, "migrations directory");
  const metaDirectory = join(directory, "meta");
  assertRealDirectory(metaDirectory, "migrations meta directory");
  const journalPath = join(metaDirectory, "_journal.json");
  assertRealNonEmptyFile(journalPath, "migration journal");

  let journal;
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf8"));
  } catch {
    throw new Error("migration journal is missing or invalid JSON");
  }
  const entries = journal && typeof journal === "object" ? journal.entries : null;
  if (journal?.dialect !== "postgresql" || !Array.isArray(entries) || entries.length < 9) {
    throw new Error("PostgreSQL journal must contain at least nine ordered migrations");
  }
  if (entries[8]?.tag !== REQUIRED_0008) {
    throw new Error("migration 0008_mushy_zarek is missing or not at journal index 8");
  }

  const seen = new Set();
  const tags = entries.map((entry, i) => {
    const tag = entry?.tag;
    const prefix = String(i).padStart(4, "0") + "_";
    if (
      !entry ||
      typeof entry !== "object" ||
      entry.idx !== i ||
      typeof tag !== "string" ||
      !/^[0-9]{4}_[a-z0-9_]+$/.test(tag) ||
      !tag.startsWith(prefix) ||
      seen.has(tag)
    ) {
      throw new Error(`invalid, duplicated or out-of-order migration at index ${i}`);
    }
    seen.add(tag);
    const sqlPath = join(directory, `${tag}.sql`);
    assertRealNonEmptyFile(sqlPath, `migration SQL at index ${i} (${tag})`);
    const sqlContent = readFileSync(sqlPath, "utf8");
    if (sqlContent.includes("\0") || sqlContent.trim().length === 0) {
      throw new Error(`migration SQL is empty or invalid text at index ${i}: ${tag}`);
    }
    return tag;
  });

  const expectedFiles = new Set(tags.map((tag) => `${tag}.sql`));
  for (const name of readdirSync(directory)) {
    if (name === "meta") continue;
    if (!expectedFiles.has(name)) {
      throw new Error(`unexpected file or entry in migrations directory: ${name}`);
    }
  }

  return tags;
}

export const JUDGE_HOST = "127.0.0.1";
export const JUDGE_PORT = "54370";
export const JUDGE_DATABASE = "nmi_judge";
export const JUDGE_CONNINFO = "host=127.0.0.1 hostaddr=127.0.0.1 port=54370 dbname=nmi_judge";

const JUDGE_URL = /^postgres(?:ql)?:\/\/([^:/?#@]+)(?::([^/?#@]*))?@127\.0\.0\.1:54370\/nmi_judge$/;

class JudgeTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = "JudgeTargetError";
  }
}

function refuseTarget(message) {
  throw new JudgeTargetError(message);
}

function hasControlChar(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function decodeUserinfo(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    refuseTarget(`DATABASE_URL ${label} is invalid`);
  }
  return "";
}

function envString(env, name) {
  if (env == null || typeof env !== "object") refuseTarget("environment is invalid");
  const value = env[name];
  if (value == null) return "";
  if (typeof value !== "string") refuseTarget(`${name} is not a string`);
  return value;
}

export function assertJudgeDatabaseTarget(databaseUrl, env = process.env) {
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    refuseTarget("DATABASE_URL is required");
  }
  if (databaseUrl !== databaseUrl.trim() || hasControlChar(databaseUrl)) {
    refuseTarget("DATABASE_URL contains whitespace or control characters");
  }
  if (databaseUrl.includes("?") || databaseUrl.includes("#")) {
    refuseTarget("DATABASE_URL query parameters and fragments are refused");
  }
  const match = JUDGE_URL.exec(databaseUrl);
  if (!match?.[1]) {
    refuseTarget("require loopback 127.0.0.1:54370/nmi_judge, not hosted SQL");
  }
  const username = decodeUserinfo(match[1], "user");
  const password = decodeUserinfo(match[2] ?? "", "password");
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(username)) {
    refuseTarget("DATABASE_URL user must be a local PostgreSQL role name");
  }
  if (password.length > 1024 || hasControlChar(password)) {
    refuseTarget("DATABASE_URL password is invalid");
  }
  for (const name of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"]) {
    if (envString(env, name) !== "") {
      refuseTarget(`libpq routing environment variable ${name} is refused`);
    }
  }
  if (envString(env, "PGHOST") !== "" && envString(env, "PGHOST") !== JUDGE_HOST) {
    refuseTarget("PGHOST does not match 127.0.0.1");
  }
  if (envString(env, "PGPORT") !== "" && envString(env, "PGPORT") !== JUDGE_PORT) {
    refuseTarget("PGPORT does not match 54370");
  }
  if (envString(env, "PGDATABASE") !== "" && envString(env, "PGDATABASE") !== JUDGE_DATABASE) {
    refuseTarget("PGDATABASE does not match nmi_judge");
  }
  return { username, password, host: JUDGE_HOST, port: JUDGE_PORT, database: JUDGE_DATABASE };
}

function assertForwardedPsqlArgs(args) {
  const banned = new Set([
    "-d",
    "--dbname",
    "-h",
    "--host",
    "-p",
    "--port",
    "-U",
    "--username",
    "--hostaddr",
    "--",
  ]);
  for (const arg of args) {
    if (typeof arg !== "string" || arg.length === 0 || arg.includes("\0")) {
      refuseTarget("invalid psql argument");
    }
    if (
      banned.has(arg) ||
      /^-d./.test(arg) ||
      /^-h./.test(arg) ||
      /^-p./.test(arg) ||
      /^-U./.test(arg) ||
      /^postgres(?:ql)?:\/\//i.test(arg) ||
      /^(?:host|hostaddr|port|dbname)=/i.test(arg)
    ) {
      refuseTarget("psql connection overrides are refused");
    }
  }
}

export function judgePsqlChildEnv(target, parent) {
  const env = { ...parent };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  delete env.DATABASE_URL;
  env.PGHOST = JUDGE_HOST;
  env.PGHOSTADDR = JUDGE_HOST;
  env.PGPORT = JUDGE_PORT;
  env.PGDATABASE = JUDGE_DATABASE;
  env.PGUSER = target.username;
  if (target.password.length > 0) env.PGPASSWORD = target.password;
  else delete env.PGPASSWORD;
  return env;
}

function runPinnedPsql(forwarded) {
  const target = assertJudgeDatabaseTarget(process.env.DATABASE_URL, process.env);
  assertForwardedPsqlArgs(forwarded);
  const result = spawnSync("psql", [...forwarded, "-d", JUDGE_CONNINFO, "-U", target.username], {
    env: judgePsqlChildEnv(target, process.env),
    stdio: "inherit",
  });
  if (result.error) refuseTarget("psql could not be started");
  if (result.signal || result.status == null) refuseTarget("psql terminated before SQL completed");
  process.exitCode = result.status;
}

function runCli(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    process.stdout.write(migrationTags().join("\n") + "\n");
    return;
  }
  if (args.length === 1 && args[0] === "--assert-judge-target") {
    assertJudgeDatabaseTarget(process.env.DATABASE_URL, process.env);
    return;
  }
  if (args[0] === "--psql") {
    if (args[1] !== "--") throw new Error("unexpected arguments");
    const forwarded = args.slice(2);
    if (forwarded.length === 0) refuseTarget("missing psql arguments");
    runPinnedPsql(forwarded);
    return;
  }
  throw new Error("unexpected arguments");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv);
  } catch (error) {
    const prefix =
      error instanceof JudgeTargetError ? "JUDGE TARGET REFUSED" : "MIGRATION PLAN REFUSED";
    console.error(`${prefix}: ${error.message}`);
    process.exitCode = 1;
  }
}
