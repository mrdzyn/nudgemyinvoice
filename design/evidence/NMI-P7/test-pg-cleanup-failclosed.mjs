/* eslint-disable -- release-readiness evidence tooling (not production code): Node globals and console output by design. */
// NMI-P7-D (P7-D-AUD-01) failure control for pg-cleanup.mjs, on a REAL disposable PostgreSQL 16 cluster (loopback,
// private temp dir, its own port). Proves the cleanup deletes nothing while PostgreSQL is still running, and does delete
// after confirmed shutdown, after partial startup, and when nothing was ever initialised.
//   node design/evidence/NMI-P7/test-pg-cleanup-failclosed.mjs
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isConfirmedStopped, makePgCtl, shutdownAndRemove } from "./pg-cleanup.mjs";

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
  // 6. P7-D-AUD-01 (status-command errors): INJECTED pg_ctl results on a real, initialised data directory that is NOT
  //    running. Only a clean `status` exit 3 may permit deletion; 4, a launch error, a signal and any other code must not.
  {
    const mk = () => {
      const work = tmp(); leftovers.push(work);
      const data = join(work, "pg");
      initdb(data);
      return { work, data };
    };
    const inject = (statusResult) => (args) => (args.includes("status") ? statusResult : args.includes("stop") ? { status: 0, stdout: "", stderr: "" } : real(args));
    const cases = [
      ["status exit 4 (no accessible data directory)", { status: 4, signal: null }],
      ["status exit 1", { status: 1, signal: null }],
      ["status exit 2", { status: 2, signal: null }],
      ["status exit 5", { status: 5, signal: null }],
      ["status exit 127 (shell could not run it)", { status: 127, signal: null }],
      ["status exit 255", { status: 255, signal: null }],
      ["status null with a launch error (spawn ENOENT)", { status: null, signal: null, error: Object.assign(new Error("spawn pg_ctl ENOENT"), { code: "ENOENT" }) }],
      ["status null with a launch error (spawn EACCES)", { status: null, signal: null, error: Object.assign(new Error("spawn pg_ctl EACCES"), { code: "EACCES" }) }],
      ["status null killed by a signal", { status: null, signal: "SIGKILL" }],
      ["status null with no error and no signal", { status: null, signal: null }],
      ["status undefined", { status: undefined }],
      ["status exit 3 BUT with a launch error reported", { status: 3, signal: null, error: new Error("spawn weirdness") }],
      ["status exit 3 BUT killed by a signal", { status: 3, signal: "SIGTERM" }],
      ["status result missing entirely", null],
    ];
    for (const [label, res] of cases) {
      const { work, data } = mk();
      const r = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: inject(res) });
      check(`STATUS-ERROR CONTROL: ${label} -> shutdown NOT confirmed, the directory is PRESERVED`, r.confirmed === false && r.removed === false && existsSync(data) && existsSync(work), JSON.stringify(r));
    }
    // A status that first reports running (0) and, after the immediate stop, an error (4): still preserved.
    {
      const { work, data } = mk();
      let n = 0;
      const flaky = (args) => (args.includes("status") ? (++n === 1 ? { status: 0, signal: null } : { status: 4, signal: null }) : { status: 0, stdout: "", stderr: "" });
      const r = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: flaky });
      check("STATUS-ERROR CONTROL: running (0) after the fast stop, then status 4 after the immediate stop -> preserved", r.confirmed === false && existsSync(data), JSON.stringify(r));
    }
    // Positive control: an injected clean exit 3 (and nothing else) permits the removal.
    {
      const { work, data } = mk();
      const r = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: inject({ status: 3, signal: null }) });
      check("POSITIVE CONTROL: an injected clean `pg_ctl status` exit 3 confirms shutdown and the directory is removed", r.confirmed === true && r.removed === true && !existsSync(work), JSON.stringify(r));
    }
    check("isConfirmedStopped accepts only exit 3 with no error or signal", [0, 1, 2, 4, 5, 255, null, undefined].every((c) => !isConfirmedStopped({ status: c })) && isConfirmedStopped({ status: 3 }) && !isConfirmedStopped({ status: 3, error: new Error("x") }) && !isConfirmedStopped({ status: 3, signal: "SIGKILL" }) && !isConfirmedStopped(null));
    // A REAL inaccessible data directory (permissions removed): pg_ctl status reports 4, and nothing may be deleted.
    {
      const work = tmp(); leftovers.push(work);
      const data = join(work, "pg");
      initdb(data);
      chmodSync(data, 0o000);
      const st = real(["-D", data, "status"]);
      const r = shutdownAndRemove({ dataDir: data, removePaths: [work], pgCtl: real });
      chmodSync(data, 0o700);
      check("REAL INACCESSIBLE DIRECTORY: the real `pg_ctl status` does not report 3, shutdown is NOT confirmed and the directory is PRESERVED", st.status !== 3 && r.confirmed === false && existsSync(data), `status=${st.status} ${JSON.stringify(r)}`);
    }
    // Explicit uninitialised handling: a readable existing directory with no PG_VERSION / postmaster.pid.
    {
      const work = tmp(); leftovers.push(work);
      mkdirSync(join(work, "pg"));
      let consulted = false;
      const r = shutdownAndRemove({ dataDir: join(work, "pg"), removePaths: [work], pgCtl: () => { consulted = true; return { status: 4 }; } });
      check("UNINITIALISED DIRECTORY: a readable, empty data directory (initdb never completed) is removed without a pg_ctl claim", r.confirmed === true && r.removed === true && consulted === false && /not pg_ctl verified/.test(r.trail.join(" ")), JSON.stringify(r));
    }
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
