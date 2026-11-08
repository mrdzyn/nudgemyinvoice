import { execFileSync } from "node:child_process";
import {
  RELEASE_BRANCH,
  allOk,
  checkReleaseEnv,
  checkReleaseSource,
  type Finding,
} from "../release-preflight.js";

/**
 * Usage (reads the process environment and git; the only network read is `git ls-remote` against the named git
 * remote to learn the CURRENT branch tips; nothing is sent to Render or any provider; prints rule ids and names,
 * never values):
 *   pnpm --filter @nmi/api release-preflight env
 *   pnpm --filter @nmi/api release-preflight source --expect <40-hex sha> [--remote origin] [--release-branch <name>]
 * `source` always requires an allowlisted release branch (default: the original judges branch;
 * `--release-branch release/nmi-openai-judges-2026` checks the proposed OpenAI candidate instead;
 * `--release-branch release/nmi-judges-2026` checks the audited `846608ab` judges candidate
 * under the one-time manual-CI exception, once that branch exists);
 * local remote-tracking refs are never trusted. The candidate branch must already exist on the remote —
 * this command never creates, moves or protects it.
 */
const run = (args: string[], cwd?: string): string | null => {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
      ...(cwd !== undefined ? { cwd } : {}),
    }).trim();
  } catch {
    return null;
  }
};
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function report(title: string, findings: Finding[]): void {
  process.stdout.write(`${title}\n`);
  for (const f of findings)
    process.stdout.write(`${f.ok ? "PASS" : "FAIL"}  ${f.id} - ${f.detail}\n`);
  process.stdout.write(allOk(findings) ? "RESULT: PASS\n" : "RESULT: FAIL (do not deploy)\n");
  process.exitCode = allOk(findings) ? 0 : 1;
}

/** Exactly one line per requested ref, each a full SHA; anything else is unverifiable. */
function parseLsRemote(
  out: string | null,
  releaseBranch: string,
): { main: string; release: string } | null {
  if (out === null) return null;
  const tips = new Map<string, string[]>();
  for (const line of out.split("\n").filter(Boolean)) {
    const [sha, ref] = line.split(/\s+/);
    if (!sha || !ref) return null;
    tips.set(ref, [...(tips.get(ref) ?? []), sha]);
  }
  const one = (ref: string) => (tips.get(ref)?.length === 1 ? tips.get(ref)?.[0] : undefined);
  const main = one("refs/heads/main");
  const release = one(`refs/heads/${releaseBranch}`);
  if (!main || !release) return null;
  return { main, release };
}

const mode = process.argv[2];
if (mode === "env") {
  report("NMI release environment matrix (names only)", checkReleaseEnv(process.env));
} else if (mode === "source") {
  const expectedSha = flag("--expect") ?? "";
  const remote = flag("--remote") ?? "origin";
  // Default keeps the original judges branch; the raw flag value flows into the allowlist check,
  // so an arbitrary or empty name fails closed with src.release-branch-allowlisted (never trusted).
  const releaseBranch = flag("--release-branch") ?? RELEASE_BRANCH;
  // Anchor every git call to the REPOSITORY ROOT, whatever directory pnpm --filter started us in.
  const root = run(["rev-parse", "--show-toplevel"]);
  const g = (args: string[]) => (root ? run(args, root) : null);
  const tips = root
    ? parseLsRemote(
        g(["ls-remote", "--exit-code", remote, "refs/heads/main", `refs/heads/${releaseBranch}`]),
        releaseBranch,
      )
    : null;
  const validExpected = /^[0-9a-f]{40}$/.test(expectedSha);
  // Ancestry is judged against the FRESH remote main tip; if that object is not local the answer is "no".
  const onMain =
    !!tips &&
    validExpected &&
    g(["cat-file", "-e", `${tips.main}^{commit}`]) !== null &&
    g(["cat-file", "-e", `${expectedSha}^{commit}`]) !== null &&
    g(["merge-base", "--is-ancestor", expectedSha, tips.main]) !== null;
  report(
    "NMI release source controls",
    checkReleaseSource({
      releaseBranch,
      expectedSha,
      headSha: g(["rev-parse", "HEAD"]) ?? "",
      // A failed `git status` must not look clean.
      porcelain: g(["status", "--porcelain"]) ?? "git status failed",
      lockfileClean: g(["diff", "--quiet", "HEAD", "--", "pnpm-lock.yaml"]) !== null,
      remoteVerified: tips !== null,
      remoteMainTip: tips?.main,
      remoteReleaseTip: tips?.release,
      onMain,
    }),
  );
} else {
  process.stderr.write(
    "usage: release-preflight env | source --expect <sha> [--remote <name>] [--release-branch <name>]\n",
  );
  process.exitCode = 2;
}
