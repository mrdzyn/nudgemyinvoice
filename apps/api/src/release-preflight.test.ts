import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  isReleaseBranch,
  OPENAI_RELEASE_BRANCH,
  RELEASE_BRANCH,
  RELEASE_BRANCHES,
  type SourceInput,
} from "./release-preflight.js";

/**
 * Objective (NMI-RENDER-P4 + P5, offline): the hosted release matrix is provider-disabled and licensed-Studio, the
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
  NMI_WEB_STUDIO: "licensed",
  // Synthetic stand-in shaped like a licence; never the owner's key.
  AG_STUDIO_LICENSE_KEY: "Synthetic [Studio] licence with spaces 0123456789abcdef",
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
      c.studioLicenceKey !== null,
    ]).toEqual([null, false, null, 1, true, true]);
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
    ["Community build selected", { NMI_WEB_STUDIO: undefined }, "env.NMI_WEB_STUDIO"],
    ["mistyped variant", { NMI_WEB_STUDIO: "Licensed" }, "env.NMI_WEB_STUDIO"],
    ["no licence", { AG_STUDIO_LICENSE_KEY: undefined }, "env.AG_STUDIO_LICENSE_KEY"],
    ["blank licence", { AG_STUDIO_LICENSE_KEY: "   " }, "env.AG_STUDIO_LICENSE_KEY"],
    [
      "malformed licence",
      { AG_STUDIO_LICENSE_KEY: "has\ta tab 0123456789abcdef" },
      "env.AG_STUDIO_LICENSE_KEY",
    ],
    ["short licence", { AG_STUDIO_LICENSE_KEY: "short" }, "env.AG_STUDIO_LICENSE_KEY"],
  ])("fails closed: %s", (_n, patch, id) => {
    expect(failing({ ...good, ...patch })).toContain(id);
  });

  it.each([
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "AG_STUDIO_TRIAL_KEY",
    "AG_STUDIO_LICENSE_KEY_BACKUP",
    "NMI_WEB_STUDIO_OVERRIDE",
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

  describe("P7-B: NUDGE_AI_DRAFTING_ENABLED is checked by name (default-off drafting)", () => {
    const ID = "env.NUDGE_AI_DRAFTING_ENABLED";
    const withFlag = (v: string | undefined) => {
      const e: Record<string, string | undefined> = { ...good };
      if (v === undefined) delete e["NUDGE_AI_DRAFTING_ENABLED"];
      else e["NUDGE_AI_DRAFTING_ENABLED"] = v;
      return e;
    };

    it.each([
      ["absent", undefined],
      ["the exact string false", "false"],
    ])("accepts %s, and the real config loader agrees (drafting off, no model client)", (_n, v) => {
      const e = withFlag(v);
      expect(failing(e)).toEqual([]);
      expect(allOk(checkReleaseEnv(e))).toBe(true);
      const c = loadConfig(e as Record<string, string>);
      expect(c.nudgeDrafting).toBeNull();
      expect(c.openai).toBeNull();
    });

    it.each([
      ["true", "true"],
      ["empty", ""],
      ["uppercase", "FALSE"],
      ["mixed case", "False"],
      ["uppercase true", "TRUE"],
      ["padded with a space", " false"],
      ["trailing space", "false "],
      ["newline padded", "false\n"],
      ["numeric", "0"],
      ["yes", "yes"],
      ["malformed", "fals"],
    ])("fails closed on %s with the stable finding id, and the loader refuses it too", (_n, v) => {
      const e = withFlag(v);
      expect(failing(e)).toContain(ID);
      expect(allOk(checkReleaseEnv(e))).toBe(false);
      if (v !== "true") expect(() => loadConfig(e as Record<string, string>)).toThrow();
    });

    it("true is rejected by name even WITH parser credentials, and independently of the OpenAI-name rule", () => {
      const withCreds = {
        ...good,
        NUDGE_AI_DRAFTING_ENABLED: "true",
        OPENAI_API_KEY: SECRET,
        OPENAI_MODEL: "m",
      };
      expect(failing(withCreds)).toEqual(expect.arrayContaining([ID, "env.forbidden-absent"]));
      // true without credentials: only the flag rule fires, proving the new check stands on its own.
      expect(failing(withFlag("true"))).toEqual([ID]);
    });

    it("parser credentials alone still fail via the forbidden-name rule, not the flag rule", () => {
      const f = failing({ ...good, OPENAI_API_KEY: SECRET, OPENAI_MODEL: "m" });
      expect(f).toContain("env.forbidden-absent");
      expect(f).not.toContain(ID);
    });

    it("never echoes the flag value or a secret in any finding", () => {
      for (const v of ["true", "", "FALSE", ` ${SECRET} `]) {
        const out = JSON.stringify(checkReleaseEnv({ ...withFlag(v), OPENAI_API_KEY: SECRET }));
        expect(out).not.toContain(SECRET);
        if (v) expect(out).not.toContain(`"${v}"`);
      }
    });

    it("the existing PayPal and Studio rules are unchanged by the new check", () => {
      expect(failing({ ...good, PAYPAL_DRAFTS_ENABLED: "true" })).toContain(
        "env.PAYPAL_DRAFTS_ENABLED",
      );
      expect(failing({ ...good, PAYPAL_ENV: "live" })).toContain("env.PAYPAL_ENV");
      expect(failing({ ...good, NMI_WEB_STUDIO: "" })).toContain("env.NMI_WEB_STUDIO");
      expect(failing({ ...good, AG_STUDIO_LICENSE_KEY: undefined })).toContain(
        "env.AG_STUDIO_LICENSE_KEY",
      );
    });
  });

  it("never echoes any value, even when every check fails", () => {
    const all = checkReleaseEnv({
      ...good,
      SESSION_SECRET: SECRET.slice(0, 8),
      DATABASE_URL: `postgres://nmi_owner:${SECRET}@h/x`,
      OPENAI_API_KEY: SECRET,
      AG_STUDIO_LICENSE_KEY: `${SECRET}\twith a tab`,
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

describe("NMI-JUDGE-LIVE-OPENAI-01: limited real OpenAI release option (pure, offline)", () => {
  const limited = {
    ...good,
    NMI_JUDGE_AI_MODE: "limited",
    OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret",
    OPENAI_MODEL: "gpt-6-luna",
    OPENAI_MAX_OUTPUT_TOKENS: "4096",
    NUDGE_AI_DRAFTING_ENABLED: "true",
  };

  it("accepts exactly the reviewed OpenAI parser and nudge opt-in with PayPal absent", () => {
    expect(failing(limited)).toEqual([]);
    const c = loadConfig(limited);
    expect(c.judgeAiMode).toBe("limited");
    expect(c.openai?.model).toBe("gpt-6-luna");
    expect(c.nudgeDrafting?.maxOutputTokens).toBe(600);
    expect(c.paypalCredentials).toBeNull();
    expect(c.paypalDraftsEnabled).toBe(false);
  });

  it.each([
    [{ OPENAI_API_KEY: undefined }, "env.OPENAI_API_KEY"],
    [{ OPENAI_MODEL: "unknown-model" }, "env.OPENAI_MODEL"],
    [{ OPENAI_MAX_OUTPUT_TOKENS: "1024" }, "env.OPENAI_MAX_OUTPUT_TOKENS"],
    [{ NUDGE_AI_DRAFTING_ENABLED: "false" }, "env.NUDGE_AI_DRAFTING_ENABLED"],
    [{ PAYPAL_DRAFTS_ENABLED: "true" }, "env.PAYPAL_DRAFTS_ENABLED"],
    [{ PAYPAL_CLIENT_SECRET: "synthetic" }, "env.forbidden-absent"],
    [{ NMI_JUDGE_AI_MODE: "LIMITED" }, "env.NMI_JUDGE_AI_MODE"],
    [{ NMI_SIMULATED_EVAL: "1" }, "env.forbidden-absent"],
  ] as const)(
    "rejects a broken live judge configuration without a provider call",
    (patch, finding) => {
      expect(failing({ ...limited, ...patch })).toContain(finding);
    },
  );

  it("fails startup on incomplete limited settings or explicit disabled mode with credentials", () => {
    for (const patch of [
      { OPENAI_MODEL: "unknown-model" },
      { OPENAI_API_KEY: undefined },
      { OPENAI_MAX_OUTPUT_TOKENS: "1024" },
      { NUDGE_AI_DRAFTING_ENABLED: "false" },
      { PAYPAL_CLIENT_SECRET: "synthetic" },
      { NMI_JUDGE_AI_MODE: "off" },
    ]) {
      expect(() => loadConfig({ ...limited, ...patch })).toThrow();
    }
  });

  it("retains default provider-disabled release and never echoes live credentials", () => {
    expect(failing(good)).toEqual([]);
    expect(failing({ ...good, NMI_JUDGE_AI_MODE: "off" })).toEqual([]);
    expect(
      failing({ ...good, OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret" }),
    ).toContain("env.forbidden-absent");
    expect(JSON.stringify(checkReleaseEnv(limited))).not.toContain(limited.OPENAI_API_KEY);
  });
});

describe("combined judge mode env matrix (OpenAI + PayPal Sandbox)", () => {
  const combined = {
    ...good,
    NMI_JUDGE_AI_MODE: "combined",
    OPENAI_API_KEY: "sk-test-only-combined-synthetic-not-a-real-secret",
    OPENAI_MODEL: "gpt-6-luna",
    OPENAI_MAX_OUTPUT_TOKENS: "4096",
    NUDGE_AI_DRAFTING_ENABLED: "true",
    PAYPAL_DRAFTS_ENABLED: "true",
    PAYPAL_CLIENT_ID: "synthetic-combined-client-id",
    PAYPAL_CLIENT_SECRET: "synthetic-combined-client-secret",
  };

  it("accepts the full combined matrix and agrees with the real config loader", () => {
    expect(failing(combined)).toEqual([]);
    expect(allOk(checkReleaseEnv(combined))).toBe(true);
    const c = loadConfig(combined);
    expect(c.judgeAiMode).toBe("combined");
    expect(c.openai?.model).toBe("gpt-6-luna");
    expect(c.nudgeDrafting?.model).toBe("gpt-6-luna");
    expect(c.paypalDraftsEnabled).toBe(true);
    expect(c.paypalCredentials).not.toBeNull();
    expect(JSON.stringify(checkReleaseEnv(combined))).not.toContain(combined.PAYPAL_CLIENT_SECRET);
  });

  it.each([
    ["drafts off", { PAYPAL_DRAFTS_ENABLED: "false" }, "env.PAYPAL_DRAFTS_ENABLED"],
    ["missing client id", { PAYPAL_CLIENT_ID: undefined }, "env.PAYPAL_credentials_present"],
    [
      "missing client secret",
      { PAYPAL_CLIENT_SECRET: undefined },
      "env.PAYPAL_credentials_present",
    ],
    [
      "missing nudge opt-in",
      { NUDGE_AI_DRAFTING_ENABLED: "false" },
      "env.NUDGE_AI_DRAFTING_ENABLED",
    ],
    ["wrong model", { OPENAI_MODEL: "other-model" }, "env.OPENAI_MODEL"],
  ] as const)("rejects %s without a provider call", (_n, patch, id) => {
    expect(failing({ ...combined, ...patch })).toContain(id);
    expect(() => loadConfig({ ...combined, ...patch } as Record<string, string>)).toThrow();
  });

  it("refuses live PayPal even with the combined flag", () => {
    expect(() => loadConfig({ ...combined, PAYPAL_ENV: "live" } as Record<string, string>)).toThrow(
      /sandbox/,
    );
    expect(() =>
      loadConfig({
        ...combined,
        PAYPAL_API_BASE_URL: "https://api-m.paypal.com",
      } as Record<string, string>),
    ).toThrow(/sandbox/);
  });

  it("OpenAI-only mode still forbids any PayPal credential", () => {
    expect(
      failing({ ...good, NMI_JUDGE_AI_MODE: "limited", PAYPAL_CLIENT_ID: "synthetic" }),
    ).toContain("env.forbidden-absent");
  });
});

const sha = "a".repeat(40);
const okSrc: SourceInput = {
  releaseBranch: RELEASE_BRANCH,
  expectedSha: sha,
  headSha: sha,
  porcelain: "",
  lockfileClean: true,
  remoteVerified: true,
  remoteMainTip: sha,
  remoteReleaseTip: sha,
  onMain: true,
};
const failingSrc = (patch: Partial<SourceInput>) =>
  checkReleaseSource({ ...okSrc, ...patch })
    .filter((f) => !f.ok)
    .map((f) => f.id);

describe("release source controls (pure)", () => {
  it("passes only with a verified remote, the release branch at the SHA, a clean tree and main ancestry", () => {
    expect(allOk(checkReleaseSource(okSrc))).toBe(true);
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
    ["remote unverified", { remoteVerified: false }, "src.remote-verified"],
    ["remote unverified cannot pass ancestry", { remoteVerified: false }, "src.on-main"],
    [
      "remote unverified cannot pass the release tip",
      { remoteVerified: false },
      "src.release-branch-tip-equals-expected",
    ],
    ["not on main", { onMain: false }, "src.on-main"],
    [
      "release tip moved",
      { remoteReleaseTip: "c".repeat(40) },
      "src.release-branch-tip-equals-expected",
    ],
    [
      "release branch absent",
      { remoteReleaseTip: undefined },
      "src.release-branch-tip-equals-expected",
    ],
    [
      "release branch absent (verified flag lies)",
      { remoteReleaseTip: undefined },
      "src.remote-verified",
    ],
  ] as const)("fails closed: %s", (_n, patch, id) => {
    expect(failingSrc(patch as Partial<SourceInput>)).toContain(id);
  });
  it("has no optional path around the release branch (the input type requires remote proof)", () => {
    const { remoteVerified: _drop, ...rest } = okSrc;
    void _drop;
    expect(allOk(checkReleaseSource(rest as unknown as SourceInput))).toBe(false);
  });

  it("allowlist holds exactly the original and the proposed OpenAI candidate branch", () => {
    expect(RELEASE_BRANCHES).toEqual([
      "release/nmi-render-judges-2026",
      "release/nmi-openai-judges-2026",
    ]);
    expect(isReleaseBranch(RELEASE_BRANCH)).toBe(true);
    expect(isReleaseBranch(OPENAI_RELEASE_BRANCH)).toBe(true);
    expect(isReleaseBranch("release/nmi-render-judges")).toBe(false);
  });

  it("verifies the allowlisted OpenAI candidate branch independently of the original", () => {
    expect(allOk(checkReleaseSource({ ...okSrc, releaseBranch: OPENAI_RELEASE_BRANCH }))).toBe(
      true,
    );
    // A moved tip on the new branch fails the tip check but not the allowlist check.
    const moved = checkReleaseSource({
      ...okSrc,
      releaseBranch: OPENAI_RELEASE_BRANCH,
      remoteReleaseTip: "c".repeat(40),
    })
      .filter((f) => !f.ok)
      .map((f) => f.id);
    expect(moved).toEqual(["src.release-branch-tip-equals-expected"]);
  });

  it.each([
    ["arbitrary branch", "release/evil-judges"],
    ["main is not a release branch", "main"],
    ["empty value", ""],
    ["ref path instead of branch name", "refs/heads/release/nmi-render-judges-2026"],
    ["prefix typo of the original", "release/nmi-render-judges"],
    ["prefix typo of the candidate", "release/nmi-openai-judges"],
  ] as const)("fails closed: unallowlisted %s", (_n, releaseBranch) => {
    const bad = checkReleaseSource({ ...okSrc, releaseBranch })
      .filter((f) => !f.ok)
      .map((f) => f.id);
    expect(bad).toContain("src.release-branch-allowlisted");
    // The operator value is never echoed in findings.
    expect(JSON.stringify(checkReleaseSource({ ...okSrc, releaseBranch }))).not.toContain("evil");
  });
});

describe("release-preflight CLI against a disposable Git remote", () => {
  const cli = fileURLToPath(new URL("./cli/release-preflight.ts", import.meta.url));
  const apiDir = fileURLToPath(new URL("..", import.meta.url));
  const tsx = join(apiDir, "node_modules/.bin/tsx");
  const git = (cwd: string, ...a: string[]) =>
    execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  const run = (cwd: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync(tsx, [cli, ...args], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", HOME: tmpdir(), ...env },
    });
  const ids = (out: string, verdict: "PASS" | "FAIL") =>
    out
      .split("\n")
      .filter((l) => l.startsWith(`${verdict}  `))
      .map((l) => l.split(" ")[2]);

  interface Fixture {
    base: string;
    remote: string;
    clone: string; // working checkout (deployer) with apps/api inside
    other: string; // second clone used to move the remote
    one: string;
    cleanup: () => void;
  }
  /** bare remote with main and (optionally) the release branch both at commit `one`; clone at one. */
  function fixture(withRelease = true): Fixture {
    const base = mkdtempSync(join(tmpdir(), "nmi-p4-remote-"));
    const remote = join(base, "remote.git");
    const seed = join(base, "seed");
    const clone = join(base, "clone");
    const other = join(base, "other");
    git(base, "init", "-q", "--bare", "-b", "main", remote);
    git(base, "init", "-q", "-b", "main", seed);
    for (const d of [seed]) {
      git(d, "config", "user.email", "t@example.invalid");
      git(d, "config", "user.name", "t");
    }
    mkdirSync(join(seed, "apps/api"), { recursive: true });
    writeFileSync(join(seed, "pnpm-lock.yaml"), "lock\n");
    writeFileSync(join(seed, "apps/api/keep.txt"), "k\n");
    git(seed, "add", "-A");
    git(seed, "commit", "-q", "-m", "one");
    const one = git(seed, "rev-parse", "HEAD");
    git(seed, "remote", "add", "origin", remote);
    git(seed, "push", "-q", "origin", "main");
    if (withRelease) git(seed, "push", "-q", "origin", `main:refs/heads/${RELEASE_BRANCH}`);
    for (const d of [clone, other]) {
      git(base, "clone", "-q", remote, d);
      git(d, "config", "user.email", "t@example.invalid");
      git(d, "config", "user.name", "t");
    }
    return {
      base,
      remote,
      clone,
      other,
      one,
      cleanup: () => rmSync(base, { recursive: true, force: true }),
    };
  }
  const commitIn = (dir: string, file: string) => {
    writeFileSync(join(dir, file), file);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", file);
    return git(dir, "rev-parse", "HEAD");
  };

  it("a correctly pinned release passes, from the repo root and from apps/api (pnpm --filter cwd)", () => {
    const f = fixture();
    try {
      for (const cwd of [f.clone, join(f.clone, "apps/api")]) {
        const r = run(cwd, ["source", "--expect", f.one]);
        expect(r.stdout).toContain("RESULT: PASS");
        expect(r.status).toBe(0);
        expect(ids(r.stdout, "FAIL")).toEqual([]);
      }
    } finally {
      f.cleanup();
    }
  });

  it("a stale remote-tracking ref cannot pass after the remote release branch moves", () => {
    const f = fixture();
    try {
      const moved = commitIn(f.other, "later.txt");
      git(f.other, "push", "-q", "origin", `HEAD:refs/heads/${RELEASE_BRANCH}`);
      // Precondition (the audit's reproduction): the deployer's cached ref still says `one`.
      expect(git(f.clone, "rev-parse", `origin/${RELEASE_BRANCH}`)).toBe(f.one);
      expect(git(f.clone, "ls-remote", "origin", `refs/heads/${RELEASE_BRANCH}`)).toContain(moved);
      const r = run(f.clone, ["source", "--expect", f.one]);
      expect(r.status).toBe(1);
      expect(ids(r.stdout, "FAIL")).toContain("src.release-branch-tip-equals-expected");
      expect(r.stdout).not.toContain("RESULT: PASS");
    } finally {
      f.cleanup();
    }
  });

  it("a stale local origin/main cannot vouch for ancestry once the remote main moved without a fetch", () => {
    const f = fixture();
    try {
      commitIn(f.other, "main2.txt");
      git(f.other, "push", "-q", "origin", "main");
      const r = run(f.clone, ["source", "--expect", f.one]);
      // The fresh main tip's commit is not in the deployer's object store: unverifiable, so fail closed.
      expect(ids(r.stdout, "FAIL")).toContain("src.on-main");
      git(f.clone, "fetch", "-q", "origin");
      expect(run(f.clone, ["source", "--expect", f.one]).stdout).toContain("RESULT: PASS");
    } finally {
      f.cleanup();
    }
  });

  it("an absent release branch fails, and there is no flag that makes it optional", () => {
    const f = fixture(false);
    try {
      for (const extra of [[], ["--release-ref", "origin/main"], ["--release-ref", "none"]]) {
        const r = run(f.clone, ["source", "--expect", f.one, ...extra]);
        expect(r.status).toBe(1);
        expect(ids(r.stdout, "FAIL")).toEqual(
          expect.arrayContaining(["src.remote-verified", "src.release-branch-tip-equals-expected"]),
        );
      }
    } finally {
      f.cleanup();
    }
  });

  it("checks the allowlisted OpenAI candidate branch only when --release-branch names it", () => {
    const f = fixture();
    try {
      // The candidate branch does not exist yet: asking for it fails the tip check, not silently the old branch.
      const missing = run(f.clone, [
        "source",
        "--expect",
        f.one,
        "--release-branch",
        OPENAI_RELEASE_BRANCH,
      ]);
      expect(missing.status).toBe(1);
      expect(ids(missing.stdout, "FAIL")).toContain("src.release-branch-tip-equals-expected");
      expect(ids(missing.stdout, "FAIL")).not.toContain("src.release-branch-allowlisted");
      // After the owner creates the candidate at the same audited SHA, it verifies independently.
      git(f.other, "push", "-q", "origin", `HEAD:refs/heads/${OPENAI_RELEASE_BRANCH}`);
      const r = run(f.clone, [
        "source",
        "--expect",
        f.one,
        "--release-branch",
        OPENAI_RELEASE_BRANCH,
      ]);
      expect(r.stdout).toContain("RESULT: PASS");
      expect(r.status).toBe(0);
      // The default still checks the original branch: both paths stay independently verifiable.
      expect(run(f.clone, ["source", "--expect", f.one]).stdout).toContain("RESULT: PASS");
    } finally {
      f.cleanup();
    }
  });

  it("an arbitrary --release-branch fails closed without echoing the value", () => {
    const f = fixture();
    try {
      const r = run(f.clone, ["source", "--expect", f.one, "--release-branch", "release/evil-x"]);
      expect(r.status).toBe(1);
      expect(ids(r.stdout, "FAIL")).toContain("src.release-branch-allowlisted");
      expect(r.stdout).not.toContain("RESULT: PASS");
      expect(r.stdout).not.toContain("evil");
    } finally {
      f.cleanup();
    }
  });

  it("an unreachable or unknown remote fails closed", () => {
    const f = fixture();
    try {
      const r = run(f.clone, ["source", "--expect", f.one, "--remote", "no-such-remote"]);
      expect(r.status).toBe(1);
      expect(ids(r.stdout, "FAIL")).toContain("src.remote-verified");
      git(f.clone, "remote", "set-url", "origin", join(f.base, "gone.git"));
      expect(run(f.clone, ["source", "--expect", f.one]).status).toBe(1);
    } finally {
      f.cleanup();
    }
  });

  it("HEAD mismatch, a dirty tree and missing main ancestry each still fail", () => {
    const f = fixture();
    try {
      // HEAD mismatch: remote and expected agree on `one`, but the checkout moved to a newer local commit.
      commitIn(f.clone, "local.txt");
      expect(ids(run(f.clone, ["source", "--expect", f.one]).stdout, "FAIL")).toContain(
        "src.head-equals-expected",
      );
      git(f.clone, "reset", "-q", "--hard", f.one);

      // Dirty tree.
      writeFileSync(join(f.clone, "stray.txt"), "x");
      expect(ids(run(f.clone, ["source", "--expect", f.one]).stdout, "FAIL")).toContain(
        "src.worktree-clean",
      );
      rmSync(join(f.clone, "stray.txt"));

      // Missing main ancestry: the release branch carries a commit that is NOT on main.
      const off = commitIn(f.other, "off-main.txt");
      git(f.other, "push", "-q", "origin", `HEAD:refs/heads/${RELEASE_BRANCH}`);
      git(f.clone, "fetch", "-q", "origin");
      git(f.clone, "reset", "-q", "--hard", off);
      const r = run(f.clone, ["source", "--expect", off]);
      expect(ids(r.stdout, "FAIL")).toEqual(["src.on-main"]);
      expect(r.status).toBe(1);
    } finally {
      f.cleanup();
    }
  });

  it("modifying the ROOT lockfile fails the lockfile check even when launched from apps/api", () => {
    const f = fixture();
    try {
      const sub = join(f.clone, "apps/api");
      expect(ids(run(sub, ["source", "--expect", f.one]).stdout, "FAIL")).toEqual([]);
      writeFileSync(join(f.clone, "pnpm-lock.yaml"), "tampered\n");
      const r = run(sub, ["source", "--expect", f.one]);
      expect(ids(r.stdout, "FAIL")).toContain("src.lockfile-clean");
      expect(r.status).toBe(1);
      // A lockfile placed under apps/api must not satisfy or confuse the root check.
      git(f.clone, "checkout", "--", "pnpm-lock.yaml");
      writeFileSync(join(sub, "pnpm-lock.yaml"), "decoy\n");
      const d = run(sub, ["source", "--expect", f.one]);
      expect(ids(d.stdout, "FAIL")).toEqual(["src.worktree-clean"]);
    } finally {
      f.cleanup();
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

describe("P5 licensed Studio release", () => {
  it("the licence value is never part of any finding, passing or failing", () => {
    const pass = checkReleaseEnv(good);
    expect(allOk(pass)).toBe(true);
    expect(JSON.stringify(pass)).not.toContain(good["AG_STUDIO_LICENSE_KEY"]);
  });
});
