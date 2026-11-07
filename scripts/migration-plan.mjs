#!/usr/bin/env node
// Read-only migration plan used by the local judge runbook and disposable operator preflight.
// Never applies migrations. Reject malformed, missing, reordered, symlinked, empty or unexpected SQL files before any SQL.
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

// Command-line mode prints only validated tags, one per line. Any error means no tags on stdout.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error("unexpected arguments");
    process.stdout.write(migrationTags().join("\n") + "\n");
  } catch (error) {
    console.error(`MIGRATION PLAN REFUSED: ${error.message}`);
    process.exitCode = 1;
  }
}
