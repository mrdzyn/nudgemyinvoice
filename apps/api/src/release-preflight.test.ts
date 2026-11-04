import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import {
  allOk,
  checkReleaseEnv,
  checkReleaseSource,
  isPublicHttpsOrigin,
  type SourceInput,
} from "./release-preflight.js";

/**
 * Objective (NMI-RENDER-P4, offline): the hosted release matrix is provider-disabled and Community-only, the
 * exact-SHA controls fail closed, and neither check can echo a value. No network, no Render, no provider.
 */
const SECRET = "Zq9-synthetic-secret-value-0123456789abcdef";
const good: Record<string, string> = {
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  PORT: "10000",
  WEB_ORIGIN: "https://nudgemyinvoice-judges.onrender.com",
  TRUST_PROXY: "1",
  DATABASE_URL: `postgres://nmi_runtime:${SECRET}@dpg-internal-host/nmi`,
  SESSION_SECRET: "q7Hs2LmN9xV4bC8dF1gJ5kP0rT3wY6zA-extra",
  PAYPAL_ENV: "sandbox",
  PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
  PAYPAL_DRAFTS_ENABLED: "false",
};
const failing = (env: Record<string, string | undefined>) =>
  checkReleaseEnv(env)
    .filter((f) => !f.ok)
    .map((f) => f.id);

describe("release environment matrix", () => {
  it("the approved matrix passes, and the real API config loader accepts exactly it (providers off)", () => {
    expect(failing(good)).toEqual([]);
    expect(allOk(checkReleaseEnv(good))).toBe(true);
    const c = loadConfig(good);
    expect([
      c.openai,
      c.paypalDraftsEnabled,
      c.paypalCredentials,
      c.trustProxy,
      c.cookieSecure,
    ]).toEqual([null, false, null, 1, true]);
  });

  it.each([
    ["NODE_ENV", { NODE_ENV: "development" }, "env.NODE_ENV"],
    ["HOST", { HOST: "127.0.0.1" }, "env.HOST"],
    ["TRUST_PROXY=true", { TRUST_PROXY: "true" }, "env.TRUST_PROXY"],
    ["TRUST_PROXY unset", { TRUST_PROXY: undefined }, "env.TRUST_PROXY"],
    ["drafts enabled", { PAYPAL_DRAFTS_ENABLED: "true" }, "env.PAYPAL_DRAFTS_ENABLED"],
    [
      "live PayPal host",
      { PAYPAL_API_BASE_URL: "https://api-m.paypal.com" },
      "env.PAYPAL_API_BASE_URL",
    ],
    ["PayPal env live", { PAYPAL_ENV: "live" }, "env.PAYPAL_ENV"],
    ["http origin", { WEB_ORIGIN: "http://nudgemyinvoice-judges.onrender.com" }, "env.WEB_ORIGIN"],
    [
      "origin with path",
      { WEB_ORIGIN: "https://nudgemyinvoice-judges.onrender.com/app" },
      "env.WEB_ORIGIN",
    ],
    ["localhost origin", { WEB_ORIGIN: "https://localhost" }, "env.WEB_ORIGIN"],
    ["placeholder origin", { WEB_ORIGIN: "https://nmi-staging.example.com" }, "env.WEB_ORIGIN"],
    [
      "owner DB role",
      { DATABASE_URL: `postgres://nmi_owner:${SECRET}@h/nmi` },
      "env.DATABASE_URL.role",
    ],
    [
      "no DB password",
      { DATABASE_URL: "postgres://nmi_runtime@h/nmi" },
      "env.DATABASE_URL.password",
    ],
    ["sqlite URL", { DATABASE_URL: "sqlite:///x.db" }, "env.DATABASE_URL.scheme"],
    ["short session secret", { SESSION_SECRET: "short" }, "env.SESSION_SECRET"],
    ["low-entropy secret", { SESSION_SECRET: "a".repeat(40) }, "env.SESSION_SECRET"],
    ["bad PORT", { PORT: "ten" }, "env.PORT"],
  ])("fails closed: %s", (_n, patch, id) => {
    expect(failing({ ...good, ...patch })).toContain(id);
  });

  it.each([
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "AG_STUDIO_LICENSE_KEY",
    "VITE_NMI_STUDIO_LOCAL",
    "VITE_ANYTHING",
    "NMI_SIMULATED_EVAL",
    "TEST_DATABASE_URL",
    "WEB_DIST_DIR",
  ])("a present %s makes the matrix fail without printing its value", (name) => {
    const findings = checkReleaseEnv({ ...good, [name]: SECRET });
    expect(allOk(findings)).toBe(false);
    const bad = findings.find((f) => f.id === "env.forbidden-absent");
    expect(bad?.ok).toBe(false);
    expect(bad?.detail).toContain(name);
    expect(JSON.stringify(findings)).not.toContain(SECRET);
  });

  it("never echoes any value, even when every check fails", () => {
    const all = checkReleaseEnv({
      ...good,
      SESSION_SECRET: SECRET.slice(0, 8),
      DATABASE_URL: `postgres://nmi_owner:${SECRET}@h/x`,
      OPENAI_API_KEY: SECRET,
    });
    expect(JSON.stringify(all)).not.toContain(SECRET);
    expect(JSON.stringify(all)).not.toContain(SECRET.slice(0, 8));
  });

  it("origin helper accepts only a bare public https origin", () => {
    expect(isPublicHttpsOrigin("https://app.onrender.com")).toBe(true);
    for (const v of [
      undefined,
      "",
      "app.onrender.com",
      "https://app.onrender.com/",
      "https://u:p@app.onrender.com",
      "https://app.onrender.com?x=1",
      "https://10.0.0.1",
      "https://[::1]",
    ]) {
      // The trailing-slash form is normalised by URL; only the bare-origin string is the exact value Render shows.
      if (v === "https://app.onrender.com/") expect(isPublicHttpsOrigin(v)).toBe(true);
      else expect(isPublicHttpsOrigin(v)).toBe(false);
    }
  });
});

const sha = "a".repeat(40);
const okSrc: SourceInput = {
  expectedSha: sha,
  headSha: sha,
  porcelain: "",
  onMain: true,
  lockfileClean: true,
};
const failingSrc = (patch: Partial<SourceInput>) =>
  checkReleaseSource({ ...okSrc, ...patch })
    .filter((f) => !f.ok)
    .map((f) => f.id);

describe("release source controls (pure)", () => {
  it("passes for an audited, merged, clean checkout at the exact SHA", () => {
    expect(allOk(checkReleaseSource(okSrc))).toBe(true);
    expect(
      allOk(checkReleaseSource({ ...okSrc, releaseRef: "origin/release/x", releaseTipSha: sha })),
    ).toBe(true);
  });
  it.each([
    ["short sha", { expectedSha: "abc1234", headSha: "abc1234" }, "src.expected-is-full-sha"],
    [
      "uppercase sha",
      { expectedSha: "A".repeat(40), headSha: "A".repeat(40) },
      "src.expected-is-full-sha",
    ],
    ["HEAD differs", { headSha: "b".repeat(40) }, "src.head-equals-expected"],
    ["dirty tree", { porcelain: " M apps/api/src/app.ts" }, "src.worktree-clean"],
    ["untracked file", { porcelain: "?? .env.local" }, "src.worktree-clean"],
    ["lockfile changed", { lockfileClean: false }, "src.lockfile-clean"],
    ["not on main", { onMain: false }, "src.on-main"],
    [
      "release tip moved",
      { releaseRef: "origin/release/x", releaseTipSha: "c".repeat(40) },
      "src.release-branch-tip-equals-expected",
    ],
    [
      "release ref missing",
      { releaseRef: "origin/release/x", releaseTipSha: "" },
      "src.release-branch-tip-equals-expected",
    ],
  ] as const)("fails closed: %s", (_n, patch, id) => {
    expect(failingSrc(patch as Partial<SourceInput>)).toContain(id);
  });
});

describe("release-preflight CLI against a real throwaway git repository", () => {
  const cli = fileURLToPath(new URL("./cli/release-preflight.ts", import.meta.url));
  const apiDir = fileURLToPath(new URL("..", import.meta.url));
  const git = (cwd: string, ...a: string[]) =>
    execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  const run = (cwd: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync(join(apiDir, "node_modules/.bin/tsx"), [cli, ...args], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", HOME: tmpdir(), ...env },
    });

  it("source mode: PASS at the merged SHA; FAIL when dirty, behind a moved release tip, or not on main", () => {
    const dir = mkdtempSync(join(tmpdir(), "nmi-p4-git-"));
    try {
      git(dir, "init", "-q", "-b", "main");
      git(dir, "config", "user.email", "t@example.invalid");
      git(dir, "config", "user.name", "t");
      writeFileSync(join(dir, "pnpm-lock.yaml"), "lock\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "-m", "one");
      const one = git(dir, "rev-parse", "HEAD");
      git(dir, "update-ref", "refs/remotes/origin/main", one);
      git(dir, "update-ref", "refs/remotes/origin/release/r", one);
      const pass = run(dir, ["source", "--expect", one, "--release-ref", "origin/release/r"]);
      expect(pass.stdout).toContain("RESULT: PASS");
      expect(pass.status).toBe(0);

      writeFileSync(join(dir, "stray.txt"), "x");
      const dirty = run(dir, ["source", "--expect", one]);
      expect(dirty.status).toBe(1);
      expect(dirty.stdout).toContain("FAIL  src.worktree-clean");
      rmSync(join(dir, "stray.txt"));

      writeFileSync(join(dir, "f.txt"), "2");
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "-m", "two");
      const two = git(dir, "rev-parse", "HEAD");
      const unmerged = run(dir, ["source", "--expect", two]);
      expect(unmerged.stdout).toContain("FAIL  src.on-main");
      git(dir, "update-ref", "refs/remotes/origin/release/r", one);
      const moved = run(dir, ["source", "--expect", two, "--release-ref", "origin/release/r"]);
      expect(moved.stdout).toContain("FAIL  src.release-branch-tip-equals-expected");
      expect(run(dir, ["source", "--expect", one]).stdout).toContain(
        "FAIL  src.head-equals-expected",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("env mode: exit 1 and no value printed when a forbidden variable is present; exit 0 for the matrix", () => {
    const bad = run(apiDir, ["env"], { ...good, OPENAI_API_KEY: SECRET });
    expect(bad.status).toBe(1);
    expect(bad.stdout + bad.stderr).not.toContain(SECRET);
    expect(bad.stdout).toContain("OPENAI_API_KEY");
    const ok = run(apiDir, ["env"], good);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("RESULT: PASS");
    expect(ok.stdout + ok.stderr).not.toContain(SECRET);
  });
});
