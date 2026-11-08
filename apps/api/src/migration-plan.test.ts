import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

// All fixtures are disposable files. No PostgreSQL connection is made.
const cli = resolve("scripts/migration-plan.mjs");
const current = JSON.parse(readFileSync("packages/db/migrations/meta/_journal.json", "utf8")) as {
  dialect: string;
  entries: Array<{ idx: number; tag: string }>;
};
const scratch: string[] = [];

const run = (cwd: string) =>
  spawnSync(process.execPath, [cli], {
    cwd,
    encoding: "utf8",
    timeout: 3000,
  });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "nmi-migration-plan-"));
  scratch.push(root);
  const migrations = join(root, "packages/db/migrations");
  mkdirSync(join(migrations, "meta"), { recursive: true });
  const entries = current.entries.map((entry) => ({ ...entry }));
  const writeJournal = () => {
    writeFileSync(
      join(migrations, "meta/_journal.json"),
      JSON.stringify({ dialect: "postgresql", entries }),
    );
  };
  for (const { tag } of entries) {
    writeFileSync(join(migrations, `${tag}.sql`), "-- isolated fixture\nSELECT 1;\n");
  }
  writeJournal();
  return { root, migrations, entries, writeJournal };
}

function entryAt(entries: Array<{ idx: number; tag: string }>, index: number) {
  const entry = entries[index];
  if (!entry) throw new Error(`missing fixture entry at index ${index}`);
  return entry;
}

afterEach(() => {
  for (const root of scratch.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

test("real journal prints ordered SQL migrations through 0009", () => {
  const result = run(process.cwd());
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const tags = current.entries.map((entry) => entry.tag);
  expect(result.stdout.trim().split("\n")).toEqual(tags);
  expect(tags[8]).toBe("0008_mushy_zarek");
  expect(tags[9]).toBe("0009_quiet_nightmare");
});

test("valid isolated journal passes", () => {
  const { root } = fixture();
  expect(run(root).status).toBe(0);
});

test("correctly ordered future migration is included", () => {
  const { root, migrations, entries, writeJournal } = fixture();
  const nextTag = String(entries.length).padStart(4, "0") + "_valid_future";
  entries.push({ idx: entries.length, tag: nextTag });
  writeFileSync(join(migrations, `${nextTag}.sql`), "SELECT 1;\n");
  writeJournal();
  const result = run(root);
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\n").at(-1)).toBe(nextTag);
});

test("truncated journal fails closed without tags", () => {
  const { root, entries, writeJournal } = fixture();
  entries.splice(8, 1);
  writeJournal();
  const result = run(root);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("MIGRATION PLAN REFUSED");
});

test("missing or empty SQL file fails closed", () => {
  const { root, migrations } = fixture();
  const sql = join(migrations, "0008_mushy_zarek.sql");
  unlinkSync(sql);
  expect(run(root).stdout).toBe("");
  expect(run(root).status).not.toBe(0);
  writeFileSync(sql, "");
  expect(run(root).status).not.toBe(0);
});

test("out-of-order or duplicated journal entries are refused", () => {
  const { root, entries, writeJournal } = fixture();
  entryAt(entries, 5).idx = 4;
  writeJournal();
  expect(run(root).status).not.toBe(0);
  entryAt(entries, 5).idx = 5;
  entryAt(entries, 4).tag = entryAt(entries, 3).tag;
  writeJournal();
  expect(run(root).status).not.toBe(0);
});

test("unsafe migration tag cannot reach SQL runner", () => {
  const { root, entries, writeJournal } = fixture();
  entryAt(entries, 3).tag = "../outside";
  writeJournal();
  const result = run(root);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
});

test("invalid JSON or missing journal fails closed", () => {
  const { root, migrations } = fixture();
  const journal = join(migrations, "meta/_journal.json");
  writeFileSync(journal, "{ malformed");
  expect(run(root).status).not.toBe(0);
  writeFileSync(journal, "null");
  const nullResult = run(root);
  expect(nullResult.status).not.toBe(0);
  expect(nullResult.stdout).toBe("");
  expect(nullResult.stderr).toContain("MIGRATION PLAN REFUSED");
  unlinkSync(journal);
  expect(run(root).status).not.toBe(0);
});

test("whitespace-only or NUL-byte SQL file fails closed", () => {
  const { root, migrations } = fixture();
  const sql = join(migrations, "0008_mushy_zarek.sql");
  writeFileSync(sql, "   \n\t\n");
  const wsResult = run(root);
  expect(wsResult.status).not.toBe(0);
  expect(wsResult.stdout).toBe("");
  writeFileSync(sql, "SELECT 1;\0\n");
  const nulResult = run(root);
  expect(nulResult.status).not.toBe(0);
  expect(nulResult.stdout).toBe("");
});

test("wrong tag at index 8 or non-postgresql dialect fails closed", () => {
  const { root, migrations, entries, writeJournal } = fixture();
  entryAt(entries, 8).tag = "0008_other_migration";
  writeFileSync(join(migrations, "0008_other_migration.sql"), "SELECT 1;\n");
  unlinkSync(join(migrations, "0008_mushy_zarek.sql"));
  writeJournal();
  const wrong0008 = run(root);
  expect(wrong0008.status).not.toBe(0);
  expect(wrong0008.stdout).toBe("");
  expect(wrong0008.stderr).toContain("0008_mushy_zarek");

  entryAt(entries, 8).tag = "0008_mushy_zarek";
  writeFileSync(join(migrations, "0008_mushy_zarek.sql"), "SELECT 1;\n");
  unlinkSync(join(migrations, "0008_other_migration.sql"));
  writeFileSync(
    join(migrations, "meta/_journal.json"),
    JSON.stringify({ dialect: "sqlite", entries }),
  );
  const wrongDialect = run(root);
  expect(wrongDialect.status).not.toBe(0);
  expect(wrongDialect.stdout).toBe("");
});

test("symlinked SQL file, journal, or migrations directory fails closed", () => {
  const { root, migrations, writeJournal } = fixture();
  const outsideSql = join(root, "outside.sql");
  writeFileSync(outsideSql, "SELECT 1;\n");

  const sql = join(migrations, "0008_mushy_zarek.sql");
  unlinkSync(sql);
  symlinkSync(outsideSql, sql);
  const symSqlResult = run(root);
  expect(symSqlResult.status).not.toBe(0);
  expect(symSqlResult.stdout).toBe("");
  expect(symSqlResult.stderr).toContain("not a symlink");

  unlinkSync(sql);
  writeFileSync(sql, "SELECT 1;\n");
  const journal = join(migrations, "meta/_journal.json");
  const outsideJournal = join(root, "outside-journal.json");
  writeFileSync(outsideJournal, readFileSync(journal, "utf8"));
  unlinkSync(journal);
  symlinkSync(outsideJournal, journal);
  const symJournalResult = run(root);
  expect(symJournalResult.status).not.toBe(0);
  expect(symJournalResult.stdout).toBe("");
  expect(symJournalResult.stderr).toContain("not a symlink");

  unlinkSync(journal);
  writeJournal();
  const realMigCopy = join(root, "real-migrations");
  mkdirSync(realMigCopy, { recursive: true });
  rmSync(migrations, { recursive: true, force: true });
  symlinkSync(realMigCopy, migrations);
  const symDirResult = run(root);
  expect(symDirResult.status).not.toBe(0);
  expect(symDirResult.stdout).toBe("");
  expect(symDirResult.stderr).toContain("not a symlink");
});

test("unexpected unjournaled SQL file or dangling symlink in migrations directory fails closed", () => {
  const { root, migrations } = fixture();
  const rogueSql = join(migrations, "0009_unjournaled.sql");
  writeFileSync(rogueSql, "SELECT 1;\n");
  const rogueResult = run(root);
  expect(rogueResult.status).not.toBe(0);
  expect(rogueResult.stdout).toBe("");
  expect(rogueResult.stderr).toContain("unexpected file or entry in migrations directory");

  unlinkSync(rogueSql);
  const danglingLink = join(migrations, "0009_dangling.sql");
  symlinkSync(join(root, "does-not-exist.sql"), danglingLink);
  const danglingResult = run(root);
  expect(danglingResult.status).not.toBe(0);
  expect(danglingResult.stdout).toBe("");
  expect(danglingResult.stderr).toContain("unexpected file or entry in migrations directory");
});

test("unexpected CLI arguments fail closed without printing tags", () => {
  const extraArgResult = spawnSync(process.execPath, [cli, "--extra"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 3000,
  });
  expect(extraArgResult.status).not.toBe(0);
  expect(extraArgResult.stdout).toBe("");
  expect(extraArgResult.stderr).toContain("MIGRATION PLAN REFUSED");
});

const canonicalUrl = "postgres://nmi@127.0.0.1:54370/nmi_judge";
const dockerUrl = "postgresql://postgres:s3cret@127.0.0.1:54370/nmi_judge";

function targetEnv(overrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: canonicalUrl };
  for (const name of [
    "PGHOST",
    "PGHOSTADDR",
    "PGPORT",
    "PGDATABASE",
    "PGSERVICE",
    "PGSERVICEFILE",
  ]) {
    delete env[name];
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  return env;
}

function assertTarget(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [cli, "--assert-judge-target"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 3000,
    env,
  });
}

function writeFakePsql(dir: string) {
  const argsPath = join(dir, "args");
  const envPath = join(dir, "env");
  const binDir = join(dir, "bin");
  mkdirSync(binDir);
  const psql = join(binDir, "psql");
  writeFileSync(
    psql,
    `#!/bin/sh
printf '%s\\n' "$@" > "$NMI_FAKE_PSQL_ARGS"
{
  printf 'PGHOST=%s\\n' "$PGHOST"
  printf 'PGHOSTADDR=%s\\n' "$PGHOSTADDR"
  printf 'PGPORT=%s\\n' "$PGPORT"
  printf 'PGDATABASE=%s\\n' "$PGDATABASE"
  printf 'PGUSER=%s\\n' "$PGUSER"
  printf 'PGPASSWORD=%s\\n' "$PGPASSWORD"
  if [ -z "\${PGSERVICE+x}" ]; then printf 'PGSERVICE=unset\\n'; else printf 'PGSERVICE=%s\\n' "$PGSERVICE"; fi
  if [ -z "\${PGSERVICEFILE+x}" ]; then printf 'PGSERVICEFILE=unset\\n'; else printf 'PGSERVICEFILE=%s\\n' "$PGSERVICEFILE"; fi
  if [ -z "\${DATABASE_URL+x}" ]; then printf 'DATABASE_URL=unset\\n'; else printf 'DATABASE_URL=%s\\n' "$DATABASE_URL"; fi
} > "$NMI_FAKE_PSQL_ENV"
exit 0
`,
  );
  chmodSync(psql, 0o755);
  return { argsPath, envPath, binDir };
}

test("journal plan stays read-only when DATABASE_URL and routing env are hostile", () => {
  const result = spawnSync(process.execPath, [cli], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 3000,
    env: targetEnv({
      DATABASE_URL: "postgres://nmi@127.0.0.1:54370/nmi_judge?hostaddr=203.0.113.10",
      PGHOSTADDR: "203.0.113.10",
      PGSERVICE: "remote",
    }),
  });
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\n")[8]).toBe("0008_mushy_zarek");
});

test("canonical loopback URL and Docker userinfo pass without connecting", () => {
  for (const databaseUrl of [canonicalUrl, dockerUrl]) {
    const result = assertTarget(targetEnv({ DATABASE_URL: databaseUrl }));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  }
  const pinned = assertTarget(
    targetEnv({ PGHOST: "127.0.0.1", PGPORT: "54370", PGDATABASE: "nmi_judge" }),
  );
  expect(pinned.status).toBe(0);
});

test("query, fragment, and percent-encoded destination overrides are refused before psql", () => {
  const refused = [
    "postgres://nmi@127.0.0.1:54370/nmi_judge?host=203.0.113.10",
    "postgres://nmi@127.0.0.1:54370/nmi_judge?hostaddr=203.0.113.10",
    "postgres://nmi@127.0.0.1:54370/nmi_judge?port=5432",
    "postgres://nmi@127.0.0.1:54370/nmi_judge?hostaddr=203%2e0%2e113%2e10",
    "postgres://nmi@127.0.0.1:54370/nmi_judge?host=%32%30%33.0.113.10",
    "postgres://nmi@127.0.0.1:54370/nmi_judge?port=%35%34%33%32",
    "postgres://nmi@127.0.0.1:54370/nmi_judge?%68ostaddr=203.0.113.10",
    "postgres://nmi@127.0.0.1:54370/nmi_judge#hostaddr=203.0.113.10",
    "postgres://nmi@127.0.0.1:54370/nmi_judge?",
    "postgres://nmi@127.0.0.1:54370/nmi_judge#",
    "postgres://nmi@127%2e0%2e0%2e1:54370/nmi_judge",
    "postgres://nmi@203.0.113.10:5432/nmi_judge",
  ];
  for (const databaseUrl of refused) {
    const dir = mkdtempSync(join(tmpdir(), "nmi-judge-target-"));
    scratch.push(dir);
    const fake = writeFakePsql(dir);
    const result = spawnSync(process.execPath, [cli, "--psql", "--", "-c", "SELECT 1"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 3000,
      env: targetEnv({
        DATABASE_URL: databaseUrl,
        PATH: fake.binDir,
        NMI_FAKE_PSQL_ARGS: fake.argsPath,
        NMI_FAKE_PSQL_ENV: fake.envPath,
      }),
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("JUDGE TARGET REFUSED");
    expect(existsSync(fake.argsPath)).toBe(false);
  }
});

test("libpq routing environment overrides are refused before psql or operator provisioning", () => {
  const cases = [
    { PGHOSTADDR: "203.0.113.10" },
    { PGHOSTADDR: "127.0.0.1" },
    { PGSERVICE: "remote" },
    { PGSERVICEFILE: "/tmp/pg_service.conf" },
    { PGHOST: "203.0.113.10" },
    { PGPORT: "5432" },
    { PGDATABASE: "other" },
  ];
  for (const overrides of cases) {
    const dir = mkdtempSync(join(tmpdir(), "nmi-judge-env-"));
    scratch.push(dir);
    const fake = writeFakePsql(dir);
    const env = targetEnv({
      ...overrides,
      PATH: fake.binDir,
      NMI_FAKE_PSQL_ARGS: fake.argsPath,
      NMI_FAKE_PSQL_ENV: fake.envPath,
    });
    const asserted = assertTarget(env);
    expect(asserted.status).not.toBe(0);
    expect(asserted.stdout).toBe("");
    expect(asserted.stderr).toContain("JUDGE TARGET REFUSED");
    const psql = spawnSync(process.execPath, [cli, "--psql", "--", "-c", "SELECT 1"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 3000,
      env,
    });
    expect(psql.status).not.toBe(0);
    expect(psql.stdout).toBe("");
    expect(existsSync(fake.argsPath)).toBe(false);
  }
});

test("accepted psql is pinned to 127.0.0.1:54370/nmi_judge and drops the original URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "nmi-judge-pin-"));
  scratch.push(dir);
  const fake = writeFakePsql(dir);
  const result = spawnSync(process.execPath, [cli, "--psql", "--", "-X", "-c", "SELECT 1"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 3000,
    env: targetEnv({
      DATABASE_URL: dockerUrl,
      PGUSER: "evil",
      PGPASSWORD: "inherited",
      PATH: `${fake.binDir}:${process.env.PATH ?? ""}`,
      NMI_FAKE_PSQL_ARGS: fake.argsPath,
      NMI_FAKE_PSQL_ENV: fake.envPath,
    }),
  });
  expect(result.status).toBe(0);
  const args = readFileSync(fake.argsPath, "utf8");
  expect(args).toContain("host=127.0.0.1 hostaddr=127.0.0.1 port=54370 dbname=nmi_judge");
  expect(args).toContain("postgres\n");
  expect(args).not.toContain(dockerUrl);
  expect(args).not.toContain("s3cret");
  expect(args).not.toContain("203.0.113.10");
  const recorded = readFileSync(fake.envPath, "utf8");
  expect(recorded).toContain("PGHOST=127.0.0.1\n");
  expect(recorded).toContain("PGHOSTADDR=127.0.0.1\n");
  expect(recorded).toContain("PGPORT=54370\n");
  expect(recorded).toContain("PGDATABASE=nmi_judge\n");
  expect(recorded).toContain("PGUSER=postgres\n");
  expect(recorded).toContain("PGPASSWORD=s3cret\n");
  expect(recorded).toContain("PGSERVICE=unset\n");
  expect(recorded).toContain("PGSERVICEFILE=unset\n");
  expect(recorded).toContain("DATABASE_URL=unset\n");
});

test("psql connection flags and a missing command are refused before spawn", () => {
  const dir = mkdtempSync(join(tmpdir(), "nmi-judge-flags-"));
  scratch.push(dir);
  const fake = writeFakePsql(dir);
  const env = targetEnv({
    PATH: fake.binDir,
    NMI_FAKE_PSQL_ARGS: fake.argsPath,
    NMI_FAKE_PSQL_ENV: fake.envPath,
  });
  for (const args of [
    ["--psql", "--"],
    ["--psql", "--", "-h", "203.0.113.10"],
    ["--psql", "--", "-d", "postgres://nmi@203.0.113.10/nmi_judge"],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 3000,
      env,
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(fake.argsPath)).toBe(false);
  }
});

test("bash and zsh refuse routing overrides before psql and accept the canonical URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "nmi-judge-shell-"));
  scratch.push(dir);
  const fake = writeFakePsql(dir);
  const node = process.execPath;
  const script = `
(
  "${node}" scripts/migration-plan.mjs --assert-judge-target || { echo REFUSED >&2; exit 1; }
  "${node}" scripts/migration-plan.mjs --psql -- -X -c "SELECT 1"
)
`;
  for (const shell of ["/bin/bash", "/bin/zsh"]) {
    const refused = spawnSync(shell, ["-c", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 3000,
      env: targetEnv({
        DATABASE_URL: "postgres://nmi@127.0.0.1:54370/nmi_judge?hostaddr=203.0.113.10",
        PGHOSTADDR: "203.0.113.10",
        PATH: `${fake.binDir}:${process.env.PATH ?? ""}`,
        NMI_FAKE_PSQL_ARGS: fake.argsPath,
        NMI_FAKE_PSQL_ENV: fake.envPath,
      }),
    });
    expect(refused.status).not.toBe(0);
    expect(existsSync(fake.argsPath)).toBe(false);
    const accepted = spawnSync(shell, ["-c", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 3000,
      env: targetEnv({
        PATH: `${fake.binDir}:${process.env.PATH ?? ""}`,
        NMI_FAKE_PSQL_ARGS: fake.argsPath,
        NMI_FAKE_PSQL_ENV: fake.envPath,
      }),
    });
    expect(accepted.status).toBe(0);
    expect(readFileSync(fake.argsPath, "utf8")).toContain("hostaddr=127.0.0.1");
    rmSync(fake.argsPath);
  }
});

test("judge runbook pins migration SQL and refuses before operator provisioning", () => {
  const runbook = readFileSync("docs/NMI-DEMO-JUDGE-RUNBOOK.md", "utf8");
  const migration = runbook.slice(runbook.indexOf("## 4."), runbook.indexOf("## 5."));
  const provision = runbook.slice(runbook.indexOf("## 5."), runbook.indexOf("## 6."));
  expect(migration).not.toContain('psql "$DATABASE_URL"');
  expect(migration).toContain("--assert-judge-target");
  expect(migration).toContain("node scripts/migration-plan.mjs --psql --");
  expect(migration).not.toContain("?hostaddr=");
  expect(provision).toContain("if ! node scripts/migration-plan.mjs --assert-judge-target");
  expect(provision.indexOf("provision-operator")).toBeGreaterThan(
    provision.indexOf("--assert-judge-target"),
  );
});
