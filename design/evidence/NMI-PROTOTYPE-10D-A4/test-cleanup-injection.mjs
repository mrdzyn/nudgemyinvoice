/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-PROTOTYPE-10D-A4 MINOR-1: deterministic failure-injection test for run-a4-rehearsal.mjs cleanup.
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-PROTOTYPE-10D-A4/test-cleanup-injection.mjs
//
// For each of: an uncaught exception, an unhandled rejection, SIGINT and SIGTERM, the REAL harness is run
// to the point where every resource exists (private PostgreSQL, sandboxed API, vite preview, headless
// Chrome, temp dirs) and the failure is injected via A4_INJECT_FAILURE. The test then proves:
//   * the harness exits nonzero with the expected code (1 / 1 / 130 / 143) and reports the abort;
//   * no process is left (nothing listening on 3164/4164/9364/54364, no postgres/chrome/vite/tsx of the run);
//   * no database artifact is left (no nmi-a4-* / nmi-qa-a4-* directory in the temp dir);
//   * qa-results.json was not rewritten by the aborted run.
// Synthetic only; same prerequisites as the rehearsal (macOS sandbox-exec, PG16 binaries, Chrome).
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(here, "run-a4-rehearsal.mjs");
const PORTS = [3164, 4164, 9364, 54364];
const CASES = [
  { mode: "throw", code: 1 },
  { mode: "reject", code: 1 },
  { mode: "sigint", code: 130 },
  { mode: "sigterm", code: 143 },
];
const results = [];
const check = (name, cond, detail = "") => {
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : " - " + detail}`);
};
const listening = (port) =>
  new Promise((res) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: 1000 });
    s.on("connect", () => (s.destroy(), res(true)));
    s.on("error", () => res(false));
    s.on("timeout", () => (s.destroy(), res(false)));
  });
const openPorts = async () => (await Promise.all(PORTS.map(async (p) => ((await listening(p)) ? p : null)))).filter(Boolean);
const tempArtifacts = () => readdirSync(tmpdir()).filter((n) => /^nmi-(a4|qa-a4)-/.test(n));
const strayProcesses = () =>
  (spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" }).stdout || "")
    .split("\n")
    .filter((l) => /nmi-a4-|nmi-qa-a4-|remote-debugging-port=9364|--port 4164|postgres.*54364/.test(l) && !l.includes("test-cleanup-injection"));
const mtime = () => statSync(join(here, "qa-results.json")).mtimeMs;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

check("precondition: ports free and no stale run artifacts", (await openPorts()).length === 0 && tempArtifacts().length === 0 && strayProcesses().length === 0, "a previous run is still active");
const baseMtime = mtime();

for (const { mode, code } of CASES) {
  const out = [];
  const child = spawn(process.execPath, [HARNESS], { env: { ...process.env, A4_INJECT_FAILURE: mode }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => out.push(String(d)));
  child.stderr.on("data", (d) => out.push(String(d)));
  const exit = await new Promise((res) => {
    const t = setTimeout(() => (child.kill("SIGKILL"), res({ code: "timeout" })), 300000);
    child.on("close", (c, sig) => (clearTimeout(t), res({ code: c ?? sig })));
  });
  const text = out.join("");
  check(`[${mode}] harness exits with code ${code}`, exit.code === code, `got ${exit.code}`);
  check(`[${mode}] the abort is reported`, /A4 rehearsal aborted/.test(text), text.slice(-300));
  check(`[${mode}] the injection point was reached after the stack was up (50+ checks had passed)`, (text.match(/^PASS /gm) || []).length >= 50, `${(text.match(/^PASS /gm) || []).length} PASS lines`);
  await sleep(500);
  check(`[${mode}] no port left open`, (await openPorts()).length === 0, JSON.stringify(await openPorts()));
  check(`[${mode}] no orphaned process`, strayProcesses().length === 0, strayProcesses().join(" | "));
  check(`[${mode}] no database/profile artifact left in the temp dir`, tempArtifacts().length === 0, tempArtifacts().join(","));
  check(`[${mode}] qa-results.json untouched by the aborted run`, mtime() === baseMtime);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
