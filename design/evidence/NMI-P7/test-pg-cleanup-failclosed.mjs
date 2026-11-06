/* eslint-disable -- release-readiness evidence tooling (not production code): Node globals and console output by design. */
// NMI-P7-D (P7-D-AUD-01) failure control for pg-cleanup.mjs, on a REAL disposable PostgreSQL 16 cluster (loopback,
// private temp dir, its own port). Proves the cleanup deletes nothing while PostgreSQL is still running, and does delete
// after confirmed shutdown, after partial startup, and when nothing was ever initialised.
//   node design/evidence/NMI-P7/test-pg-cleanup-failclosed.mjs
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makePgCtl, shutdownAndRemove } from "./pg-cleanup.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const B = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PORT = 54504;
const env = { ...process.env, LC_ALL: "en_US.UTF-8" };
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, result: ok ? "PASS" : "FAIL", detail: ok ? "" : String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " - " + String(detail).slice(0, 300)}`);
};
const real = makePgCtl(B, env);
const initdb = (dir) => spawnSync(join(B, "initdb"), ["-D", dir, "-U", "p7c", "--auth=trust", "-E", "UTF8"], { encoding: "utf8", env });
const sock = mkdtempSync("/tmp/p7cs.");
const start = (dir) => real(["-D", dir, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -k ${sock}`, "-l", join(dir, "..", "log"), "-w", "start"]);
const alive = () => spawnSync(join(B, "psql"), ["-h", "127.0.0.1", "-p", String(PORT), "-U", "p7c", "-d", "postgres", "-Atc", "select 1"], { encoding: "utf8", env }).stdout.trim() === "1";
const tmp = () => mkdtempSync(join(tmpdir(), "nmi-p7-cleanup-ctl-"));
const leftovers = [];

try {
  // 1. Real running cluster; `stop` is made to FAIL (no-op, exit 1) while `status` stays authoritative.
  {
    const work = tmp(); leftovers.push(work);
    const data = join(work, "pg");
    check("setup: initdb and start a real disposable PostgreSQL 16 cluster", initdb(data).status === 0 && start(data).status === 0 && alive());
    const stopFails = (args) => (args.includes("stop") ? { status: 1, stdout: "", stderr: "simulated stop failure" } : real(args));
    const r = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: stopFails });
    check("FAILURE CONTROL: with a failing stop and a still-running server, shutdown is NOT confirmed", r.confirmed === false, JSON.stringify(r));
    check("FAILURE CONTROL: the cluster directory is PRESERVED (nothing deleted)", r.removed === false && existsSync(data) && existsSync(work) && r.preserved.includes(work), JSON.stringify(r));
    check("FAILURE CONTROL: the server is still running and answering queries", alive());
    // 2. Same cluster, real pg_ctl: confirmed shutdown, then removal.
    const ok = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: real });
    check("with the real pg_ctl, shutdown is confirmed and the directory removed", ok.confirmed === true && ok.removed === true && !existsSync(work), JSON.stringify(ok));
    check("after removal the server no longer answers", !alive());
  }
  // 3. Partial startup: initialised but never started.
  {
    const work = tmp(); leftovers.push(work);
    const data = join(work, "pg");
    check("setup: initdb only (server never started)", initdb(data).status === 0 && !alive());
    const r = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: real });
    check("PARTIAL STARTUP: an initialised-but-never-started directory is confirmed down and removed", r.confirmed && r.removed && !existsSync(work), JSON.stringify(r));
  }
  // 4. Nothing initialised (initdb itself failed or never ran).
  {
    const work = tmp(); leftovers.push(work);
    writeFileSync(join(work, "model-script"), "ok");
    const r = shutdownAndRemove({ dataDir: join(work, "pg"), removePaths: [work], pgCtl: real });
    check("NOTHING STARTED: a work directory with no data directory is removed", r.confirmed && r.removed && !existsSync(work), JSON.stringify(r));
  }
  // 5. A stop that reports success but leaves the server running must still preserve the directory.
  {
    const work = tmp(); leftovers.push(work);
    const data = join(work, "pg");
    initdb(data); start(data);
    const lyingStop = (args) => (args.includes("stop") ? { status: 0, stdout: "", stderr: "" } : real(args));
    const r = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: lyingStop });
    check("FAILURE CONTROL: a stop that claims success but leaves the server running does not delete the directory (status is authoritative)", r.confirmed === false && existsSync(data) && alive(), JSON.stringify(r));
    const fin = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: real });
    check("cleanup of the control cluster itself: confirmed down, then removed", fin.confirmed && fin.removed && !existsSync(work), JSON.stringify(fin));
  }
} catch (e) {
  check("control ran to completion without an exception", false, e && e.stack);
} finally {
  for (const d of leftovers) {
    const data = join(d, "pg");
    if (existsSync(data)) {
      const f = shutdownAndRemove({ dataDir: data, removePaths: [d], pgCtl: real });
      if (!f.confirmed) console.error("control cluster still running; preserved:", d);
    } else rmSync(d, { recursive: true, force: true });
  }
  rmSync(sock, { recursive: true, force: true });
}
const fails = results.filter((r) => r.result === "FAIL").length;
const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();
writeFileSync(join(here, "pg-cleanup-failclosed-results.json"), JSON.stringify({ at: new Date().toISOString(), sourceSha: git("rev-parse", "HEAD"), sourceTreeDirtyAtRun: git("status", "--porcelain", "--", ".", ":!design/evidence/NMI-P7").split("\n").filter(Boolean), pg: spawnSync(join(B, "pg_ctl"), ["--version"], { encoding: "utf8" }).stdout.trim(), total: results.length, failed: fails, results }, null, 2) + "\n");
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
