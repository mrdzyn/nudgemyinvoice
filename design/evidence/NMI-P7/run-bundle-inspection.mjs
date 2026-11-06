/* eslint-disable -- release-readiness evidence tooling (not production code): Node globals and console output by design. */
// NMI-P7-D bundle inspection (offline, SYNTHETIC configuration only).
//
//   node design/evidence/NMI-P7/run-bundle-inspection.mjs
//
// Builds BOTH web variants and scans them. The AG Studio licence value used here is a synthetic canary string, set only in
// the child processes' environment; the owner's real key is never read or needed (the scanner prefers the process
// environment, and the builds do not read the variable at all). Proves, for the built files:
//   - Community: no Studio code, no licence variable name, no secret-name markers, no canary value.
//   - Licensed: Studio only in lazy chunk(s); no licence variable name, no secret-name markers, no canary value.
//   - Negative control: a canary injected into a built file makes the scanner fail (so the clean verdict is meaningful).
// It leaves apps/web/dist as a Community build. Results go to bundle-inspection.json (names, sizes, hashes; never a value).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const dist = join(root, "apps/web/dist");
const CANARY = "SYNTHETIC-AGSTUDIO-LICENCE-CANARY-0123456789abcdef";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, result: ok ? "PASS" : "FAIL", detail: ok ? "" : String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " - " + String(detail).slice(0, 300)}`);
};
const baseEnv = () => {
  const e = { ...process.env };
  delete e.NMI_WEB_STUDIO;
  delete e.AG_STUDIO_LICENSE_KEY;
  return e;
};
const sh = (cmd, args, env) => spawnSync(cmd, args, { cwd: root, env, encoding: "utf8" });
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const listing = () => walk(dist).map((f) => ({ file: relative(dist, f), bytes: statSync(f).size, sha256: createHash("sha256").update(readFileSync(f)).digest("hex") }));
const text = () => walk(dist).map((f) => readFileSync(f, "utf8"));
const count = (re) => text().filter((t) => re.test(t)).length;
const markers = [/AG_STUDIO_LICENSE_KEY/, /studio-licence/, /__nmi_dev/, /x-nmi-dev-studio/, /OPENAI_API_KEY/, /PAYPAL_CLIENT_SECRET/, /SESSION_SECRET/, /BEGIN [A-Z ]*PRIVATE KEY/];
const studio = [/ag-studio/i, /AgStudio/, /ag-charts-enterprise/];
const out = { sourceSha: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(), node: process.version, note: "synthetic canary only; the owner's real licence value is never used", variants: {} };

for (const variant of ["licensed", "community"]) {
  const lic = variant === "licensed";
  const env = { ...baseEnv(), AG_STUDIO_LICENSE_KEY: CANARY, ...(lic ? { NMI_WEB_STUDIO: "licensed" } : {}) };
  const b = sh("pnpm", lic ? ["build:web:licensed"] : ["--filter", "@nmi/web", "build"], env);
  check(`${variant}: web build succeeded with a synthetic licence value in the environment`, b.status === 0, b.stderr.slice(-300));
  const files = listing();
  const scan = sh("node", ["scripts/check-bundle-secrets.mjs"], env);
  check(`${variant}: scripts/check-bundle-secrets.mjs passes (${lic ? "licensed" : "Community"} mode)`, scan.status === 0, scan.stdout + scan.stderr);
  check(`${variant}: the scanner confirmed the licence value was checked and absent`, /licence value absent from every file/.test(scan.stdout), scan.stdout);
  check(`${variant}: the synthetic licence value appears in no built file (independent grep)`, count(new RegExp(CANARY)) === 0);
  for (const m of markers) check(`${variant}: no built file contains ${m.source}`, count(m) === 0);
  if (lic) {
    const withStudio = count(studio[0]) + count(studio[1]) + count(studio[2]);
    check("licensed: Studio code is present only in lazy chunk(s), never the entry file", /Studio in \d+ lazy chunk/.test(scan.stdout) && !/ag-studio/i.test(readFileSync(join(dist, "index.html"), "utf8")) && withStudio >= 1, scan.stdout);
  } else for (const m of studio) check(`community: no Studio marker ${m.source}`, count(m) === 0);
  out.variants[variant] = { files, scanOutput: scan.stdout.trim() };
}

// Negative control on the Community build currently in dist: an injected canary must make the scanner fail.
const target = walk(dist).find((f) => f.endsWith(".js"));
const original = readFileSync(target);
appendFileSync(target, `\n/* ${CANARY} */\n`);
const neg = sh("node", ["scripts/check-bundle-secrets.mjs"], { ...baseEnv(), AG_STUDIO_LICENSE_KEY: CANARY });
writeFileSync(target, original);
check("NEGATIVE CONTROL: a licence value injected into a built file makes the scanner FAIL", neg.status !== 0, neg.stdout);
const rescan = sh("node", ["scripts/check-bundle-secrets.mjs"], { ...baseEnv(), AG_STUDIO_LICENSE_KEY: CANARY });
check("the injected file was restored and the Community build scans clean again", rescan.status === 0, rescan.stdout + rescan.stderr);

const fails = results.filter((r) => r.result === "FAIL").length;
writeFileSync(join(here, "bundle-inspection.json"), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: fails, ...out, results }, null, 2) + "\n");
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
