/* eslint-disable -- release-readiness evidence tooling (not production code): Node globals by design. */
// NMI-P7-D (P7-D-AUD-01): fail-closed cleanup of a DISPOSABLE PostgreSQL cluster used by evidence runners.
// The data directory is deleted ONLY after PostgreSQL shutdown is confirmed by an authoritative `pg_ctl status`
// (non-zero = not running). If shutdown cannot be confirmed, nothing is deleted and the caller must report failure.
// Partial startup is handled: a missing data directory means nothing was ever started; an initialised but never started
// directory reports "not running" and is removed. `pgCtl` is injectable so the failure path can be exercised for real.
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

export const makePgCtl = (pgBin, env) => (args) => spawnSync(join(pgBin, "pg_ctl"), args, { encoding: "utf8", env });

export function shutdownAndRemove({ dataDir, removePaths, pgCtl }) {
  const trail = [];
  let down;
  if (!existsSync(dataDir)) {
    down = true;
    trail.push("no data directory: PostgreSQL was never initialised");
  } else {
    pgCtl(["-D", dataDir, "-m", "fast", "-w", "-t", "30", "stop"]);
    let st = pgCtl(["-D", dataDir, "status"]);
    trail.push(`after fast stop, pg_ctl status exit ${st.status}`);
    if (st.status === 0) {
      pgCtl(["-D", dataDir, "-m", "immediate", "-w", "-t", "30", "stop"]);
      st = pgCtl(["-D", dataDir, "status"]);
      trail.push(`after immediate stop, pg_ctl status exit ${st.status}`);
    }
    down = st.status !== 0; // 3 = not running, 4 = no valid data directory; 0 = STILL RUNNING
  }
  if (!down) return { confirmed: false, removed: false, preserved: removePaths.filter((p) => existsSync(p)), trail };
  for (const p of removePaths) rmSync(p, { recursive: true, force: true });
  return { confirmed: true, removed: removePaths.every((p) => !existsSync(p)), preserved: [], trail };
}
