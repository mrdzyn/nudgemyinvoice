/* eslint-disable -- release-readiness evidence tooling (not production code): Node globals by design. */
// NMI-P7-D (P7-D-AUD-01): fail-closed cleanup of a DISPOSABLE PostgreSQL cluster used by evidence runners.
//
// For an EXISTING data directory the directory is deleted ONLY when `pg_ctl status` ran without a launch error and
// exited with exactly 3 ("server not running", PostgreSQL 16 pg_ctl docs). Every other outcome means shutdown is NOT
// established and the directory is PRESERVED: 0 = running, 4 = no accessible data directory, null (launch error or
// signal) and any other code = unknown.
//
// Two cases are handled explicitly and are NOT claimed to be pg_ctl-verified:
//   - the data directory does not exist (PostgreSQL was never initialised);
//   - the data directory exists and is READABLE but holds neither PG_VERSION nor postmaster.pid (initdb never completed,
//     so no server can have been started from it). An unreadable directory is NOT this case: it is preserved.
// `pgCtl` is injectable so every failure path can be exercised.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const makePgCtl = (pgBin, env) => (args) => spawnSync(join(pgBin, "pg_ctl"), args, { encoding: "utf8", env });

/** True only for a status command that really ran and reported "not running" (exit code exactly 3). */
export const isConfirmedStopped = (r) => !!r && !r.error && r.signal == null && r.status === 3;
const describe = (r) => (!r ? "no result" : r.error ? `launch error (${r.error.code || r.error.message})` : r.signal ? `signal ${r.signal}` : `exit ${r.status}`);

function uninitialisedDirectory(dataDir) {
  try {
    const names = readdirSync(dataDir);
    return !names.includes("PG_VERSION") && !names.includes("postmaster.pid");
  } catch {
    return false; // unreadable or not a directory: cannot be called uninitialised
  }
}

export function shutdownAndRemove({ dataDir, removePaths, pgCtl }) {
  const trail = [];
  let down;
  if (!existsSync(dataDir)) {
    down = true;
    trail.push("no data directory: PostgreSQL was never initialised (not pg_ctl verified)");
  } else if (uninitialisedDirectory(dataDir)) {
    down = true;
    trail.push("readable data directory with no PG_VERSION or postmaster.pid: initdb never completed, no server can exist (not pg_ctl verified)");
  } else {
    pgCtl(["-D", dataDir, "-m", "fast", "-w", "-t", "30", "stop"]);
    let st = pgCtl(["-D", dataDir, "status"]);
    trail.push(`after fast stop, pg_ctl status: ${describe(st)}`);
    if (st && !st.error && st.status === 0) {
      pgCtl(["-D", dataDir, "-m", "immediate", "-w", "-t", "30", "stop"]);
      st = pgCtl(["-D", dataDir, "status"]);
      trail.push(`after immediate stop, pg_ctl status: ${describe(st)}`);
    }
    down = isConfirmedStopped(st);
    if (!down) trail.push("shutdown NOT established (only a clean pg_ctl status exit 3 confirms it): directory preserved");
  }
  if (!down) return { confirmed: false, removed: false, preserved: removePaths.filter((p) => existsSync(p)), trail };
  for (const p of removePaths) rmSync(p, { recursive: true, force: true });
  return { confirmed: true, removed: removePaths.every((p) => !existsSync(p)), preserved: [], trail };
}
