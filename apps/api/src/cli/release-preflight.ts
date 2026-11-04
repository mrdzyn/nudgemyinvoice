import { execFileSync } from "node:child_process";
import { allOk, checkReleaseEnv, checkReleaseSource, type Finding } from "../release-preflight.js";

/**
 * Usage (offline; reads only the process environment and local git; prints rule ids and names, never values):
 *   pnpm --filter @nmi/api release-preflight env
 *   pnpm --filter @nmi/api release-preflight source --expect <40-hex sha> [--release-ref origin/release/nmi-render-judges-2026]
 */
const git = (args: string[]): string => {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};
const gitOk = (args: string[]): boolean => {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
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

const mode = process.argv[2];
if (mode === "env") {
  report("NMI release environment matrix (names only)", checkReleaseEnv(process.env));
} else if (mode === "source") {
  const expectedSha = flag("--expect") ?? "";
  const releaseRef = flag("--release-ref");
  const headSha = git(["rev-parse", "HEAD"]);
  report(
    "NMI release source controls",
    checkReleaseSource({
      expectedSha,
      headSha,
      porcelain: git(["status", "--porcelain"]),
      lockfileClean: gitOk(["diff", "--quiet", "HEAD", "--", "pnpm-lock.yaml"]),
      onMain:
        /^[0-9a-f]{40}$/.test(expectedSha) &&
        gitOk(["merge-base", "--is-ancestor", expectedSha, "origin/main"]),
      ...(releaseRef !== undefined
        ? { releaseRef, releaseTipSha: git(["rev-parse", "--verify", releaseRef]) }
        : {}),
    }),
  );
} else {
  process.stderr.write(
    "usage: release-preflight env | source --expect <sha> [--release-ref <ref>]\n",
  );
  process.exitCode = 2;
}
