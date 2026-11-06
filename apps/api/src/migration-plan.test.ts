import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

// All fixtures are disposable files. No PostgreSQL connection is made.
const cli = resolve("scripts/migration-plan.mjs");
const current = JSON.parse(
  readFileSync("packages/db/migrations/meta/_journal.json", "utf8"),
) as { dialect: string; entries: Array<{ idx: number; tag: string }> };
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
    writeFileSync(
      join(migrations, `${tag}.sql`),
      "-- isolated fixture\nSELECT 1;\n",
    );
  }
  writeJournal();
  return { root, migrations, entries, writeJournal };
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
  entries[5].idx = 4;
  writeJournal();
  expect(run(root).status).not.toBe(0);
  entries[5].idx = 5;
  entries[4].tag = entries[3].tag;
  writeJournal();
  expect(run(root).status).not.toBe(0);
});

test("unsafe migration tag cannot reach SQL runner", () => {
  const { root, entries, writeJournal } = fixture();
  entries[3].tag = "../outside";
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
  unlinkSync(journal);
  expect(run(root).status).not.toBe(0);
});
