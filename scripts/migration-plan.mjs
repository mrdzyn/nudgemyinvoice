#!/usr/bin/env node
// Read-only migration plan used by the local judge runbook and disposable operator preflight.
// Never applies migrations. Reject malformed, missing, reordered or unsafe entries before any SQL.
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_0008 = "0008_mushy_zarek";

export function migrationTags(root = process.cwd()) {
  const directory = join(root, "packages/db/migrations");
  let journal;
  try {
    journal = JSON.parse(readFileSync(join(directory, "meta/_journal.json"), "utf8"));
  } catch {
    throw new Error("migration journal is missing or invalid JSON");
  }
  const entries = journal?.entries;
  if (journal.dialect !== "postgresql" || !Array.isArray(entries) || entries.length < 9) {
    throw new Error("PostgreSQL journal must contain at least nine ordered migrations");
  }
  if (entries[8]?.tag !== REQUIRED_0008) {
    throw new Error("migration 0008_mushy_zarek is missing or not at journal index 8");
  }

  const seen = new Set();
  return entries.map((entry, i) => {
    const tag = entry?.tag;
    const prefix = String(i).padStart(4, "0") + "_";
    if (
      entry?.idx !== i ||
      typeof tag !== "string" ||
      !/^[0-9]{4}_[a-z0-9_]+$/.test(tag) ||
      !tag.startsWith(prefix) ||
      seen.has(tag)
    ) {
      throw new Error(`invalid, duplicated or out-of-order migration at index ${i}`);
    }
    seen.add(tag);
    try {
      const file = statSync(join(directory, `${tag}.sql`));
      if (!file.isFile() || file.size === 0) throw new Error("empty or non-file");
    } catch {
      throw new Error(`migration SQL is missing or empty at index ${i}: ${tag}`);
    }
    return tag;
  });
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
