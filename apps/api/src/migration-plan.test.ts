import { spawnSync } from "node:child_process";
import {
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

test("real journal prints ordered SQL migrations through 0008", () => {
  const result = run(process.cwd());
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const tags = current.entries.map((entry) => entry.tag);
  expect(result.stdout.trim().split("\n")).toEqual(tags);
  expect(tags[8]).toBe("0008_mushy_zarek");
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
