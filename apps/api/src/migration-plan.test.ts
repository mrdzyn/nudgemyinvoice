import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

// These tests invoke the exact CLI called from the judge runbook. The fixtures live
// in temporary directories and never connect to or mutate any PostgreSQL database.
const cli = resolve("scripts/migration-plan.mjs");
const current = JSON.parse(
  readFileSync("packages/db/migrations/meta/_journal.json", "utf8"),
) as { dialect: string; entries: Array<{ idx: number; tag: string }> };
const scratch: string[] = [];
const run = (cwd: string) =>
  spawnSync(process.execPath, [cli], { cwd, encoding: "utf8", timeout: 3000 });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "nmi-migration-plan-"));
  scratch.push(root);
  const migrations = join(root, "packages/db/migrations");
  mkdirSync(join(migrations, "meta"), { recursive: true });
  const entries = current.entries.map((e) => ({ ...e }));
  const writeJournal = () =>
    writeFileSync(join(migrations, "meta/_journal.json"), JSON.stringify({
      dialect: "postgresql",
      entries,
    }));
  for (const { tag } of entries) {
    writeFileSync(join(migrations, `${tag}.sql`), "-- isolated fixture\nSELECT 1;\n");
  }
  writeJournal();
  return { root, migrations, entries, writeJournal };
}

afterEach(() => {
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("real journal prints every ordered SQL migration through 0008", () => {
  const result = run(process.cwd());
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim().split("\n")).toEqual(current.entries.map((e) => e.tag));
  expect(current.entries[8]?.tag).toBe("0008_mushy_zarek");
});

test("valid isolated nine-migration journal passes", () => {
  const { root } = fixture();
  expect(run(root).status).toBe(0);
});

test("a future correctly ordered migration is applied by plan without a fixed count", () => {
  const { root, migrations, entries, writeJournal } = fixture();
  entries.push({ idx: entries.length, tag: "0009_valid_future" });
  writeFileSync(join(migrations, "0009_valid_future.sql"), "SELECT 1;\n");
  writeJournal();
  const result = run(root);
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\n").at(-1)).toBe("0009_valid_future");
});

test("missing 0008 or a short journal fails closed with no stdout", () => {
  const { root, entries, writeJournal } = fixture();
  entries.pop();
  writeJournal();
  const result = run(root);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("MIGRATION PLAN REFUSED");
});

test("missing or empty SQL file fails closed with no tags", () => {
  const { root, migrations } = fixture();
  unlinkSync(join(migrations, "0008_mushy_zarek.sql"));
  expect(run(root).stdout).toBe("");
  expect(run(root).status).not.toBe(0);
  writeFileSync(join(migrations, "0008_mushy_zarek.sql"), "");
  expect(run(root).status).not.toBe(0);
});

test("reordered, duplicated and malformed journal entries are refused", () => {
  const { root, entries, writeJournal } = fixture();
  entries[5].idx = 4;
  writeJournal();
  expect(run(root).status).not.toBe(0);
  entries[5].idx = 5;
  entries[4].tag = entries[3].tag;
  writeJournal();
  expect(run(root).status).not.toBe(0);
});

test("unsafe migration path components cannot reach the SQL runner", () => {
  const { root, entries, writeJournal } = fixture();
  entries[3].tag = "../outside";
  writeJournal();
  const result = run(root);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
});

test("invalid JSON and an absent journal fail closed", () => {
  const { root, migrations } = fixture();
  const path = join(migrations, "meta/_journal.json");
  writeFileSync(path, "{ malformed");
  expect(run(root).status).not.toBe(0);
  unlinkSync(path);
  expect(run(root).status).not.toBe(0);
});
