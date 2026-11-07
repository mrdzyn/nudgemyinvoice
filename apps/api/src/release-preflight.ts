/**
 * NMI-RENDER-P4 release preflight (pure, offline). Two independent checks an operator runs BEFORE any Render
 * action; neither calls Render, a provider or the network, and neither ever returns an environment VALUE:
 *  - `checkReleaseEnv`: default provider-disabled matrix, plus a separately reviewed limited AI judge opt-in. Since P5 the release
 *    is the LICENSED AG Studio dashboard: `NMI_WEB_STUDIO=licensed` and a well-formed `AG_STUDIO_LICENSE_KEY` are
 *    REQUIRED; every other Studio/Vite/simulated variable stays forbidden.
 *  - `checkReleaseSource`: the exact-SHA controls (deploy only an audited commit that is on `main`, never a tip).
 */

export interface Finding {
  id: string;
  ok: boolean;
  /** Names and rule text only. Never an environment value. */
  detail: string;
}

export const SANDBOX_API = "https://api-m.sandbox.paypal.com";
export const RUNTIME_ROLE = "nmi_runtime";

/** Variables that must be ABSENT from the hosted web service (provider-disabled build). */
const FORBIDDEN_NAMES = new Set([
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_MAX_OUTPUT_TOKENS",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "WEB_DIST_DIR",
  "TEST_DATABASE_URL",
  "REQUIRE_DB_TESTS",
  "PGPASSFILE",
  "PGPASSWORD",
]);
/** Prefix families that must be absent: other Studio settings, any Vite-exposed variable, simulated switches. */
const FORBIDDEN_PREFIXES = ["AG_STUDIO", "VITE_", "NMI_"] as const;
/**
 * P5 licensed release: the ONLY two names allowed inside those families, and both are required. Render shares one
 * variable set between build and runtime, so `NMI_WEB_STUDIO` selects the licensed web build and the API serves
 * `AG_STUDIO_LICENSE_KEY` to the signed-in operator only. The key is a secret-store value; it never reaches a build.
 */
export const STUDIO_VARIANT_NAME = "NMI_WEB_STUDIO";
export const STUDIO_LICENCE_NAME = "AG_STUDIO_LICENSE_KEY";
const ALLOWED_IN_FAMILIES = new Set([
  STUDIO_VARIANT_NAME,
  STUDIO_LICENCE_NAME,
  "NMI_JUDGE_AI_MODE",
]);
const JUDGE_OPENAI_NAMES = new Set(["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_MAX_OUTPUT_TOKENS"]);
/** Same shape the API config accepts (config.ts); the value itself is never reported. */
const LICENCE_SHAPE = /^[\x20-\x7e]{16,8192}$/;

const isForbidden = (name: string) =>
  !ALLOWED_IN_FAMILIES.has(name) &&
  (FORBIDDEN_NAMES.has(name) || FORBIDDEN_PREFIXES.some((p) => name.startsWith(p)));

function parseUrl(v: string | undefined): URL | null {
  if (!v) return null;
  try {
    return new URL(v);
  } catch {
    return null;
  }
}

/** True for a bare https origin of a real host: no path, query, fragment, credentials, port-less loopback or placeholder. */
export function isPublicHttpsOrigin(v: string | undefined): boolean {
  const u = parseUrl(v);
  if (!u || u.protocol !== "https:") return false;
  if (u.username || u.password || u.search || u.hash) return false;
  if (u.pathname !== "/" || (v ?? "").replace(/\/$/, "") !== u.origin) return false;
  const h = u.hostname;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(":")) return false;
  if (/(^|\.)(example|invalid|test)(\.|$)/.test(h) || h.endsWith(".example.com")) return false;
  return h.includes(".");
}

export function checkReleaseEnv(env: Readonly<Record<string, string | undefined>>): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, ok: boolean, detail: string) => out.push({ id, ok, detail });
  const eq = (name: string, want: string) =>
    add(`env.${name}`, env[name] === want, `${name} must be exactly "${want}"`);

  eq("NODE_ENV", "production");
  eq("HOST", "0.0.0.0");
  eq("TRUST_PROXY", "1");
  eq("PAYPAL_ENV", "sandbox");
  eq("PAYPAL_DRAFTS_ENABLED", "false");
  const judgeMode = env["NMI_JUDGE_AI_MODE"] ?? "off";
  const liveJudgeAi = judgeMode === "limited";
  add(
    "env.NMI_JUDGE_AI_MODE",
    judgeMode === "off" || liveJudgeAi,
    "NMI_JUDGE_AI_MODE must be absent/off (no providers) or limited (separately approved live OpenAI judge release)",
  );
  if (liveJudgeAi) {
    const key = env["OPENAI_API_KEY"] ?? "";
    add(
      "env.OPENAI_API_KEY",
      key.startsWith("sk-") && key.length >= 20 && key.trim() === key,
      "OPENAI_API_KEY must be a real private server-side key, never a placeholder or browser variable",
    );
    eq("OPENAI_MODEL", "gpt-6-luna");
    eq("OPENAI_MAX_OUTPUT_TOKENS", "4096");
    add(
      "env.PAYPAL_credentials_absent",
      !env["PAYPAL_CLIENT_ID"] && !env["PAYPAL_CLIENT_SECRET"],
      "PayPal credentials must be absent while judge AI is enabled",
    );
  }
  // NMI-P7-B: the live AI nudge-drafting opt-in is checked by NAME. Only an absent variable or the exact string
  // "false" passes ("true", empty, wrong case or padded values all fail). This is IN ADDITION to the OpenAI-name
  // prohibition below and the config loader's own enum; the value itself is never reported.
  add(
    "env.NUDGE_AI_DRAFTING_ENABLED",
    liveJudgeAi
      ? env["NUDGE_AI_DRAFTING_ENABLED"] === "true"
      : env["NUDGE_AI_DRAFTING_ENABLED"] === undefined ||
          env["NUDGE_AI_DRAFTING_ENABLED"] === "false",
    liveJudgeAi
      ? 'NUDGE_AI_DRAFTING_ENABLED must be exactly "true" in the separately approved limited judge mode'
      : 'NUDGE_AI_DRAFTING_ENABLED must be absent or exactly "false" in provider-disabled mode',
  );
  add(
    "env.PAYPAL_API_BASE_URL",
    env["PAYPAL_API_BASE_URL"] === SANDBOX_API,
    `PAYPAL_API_BASE_URL must be exactly the sandbox host ${SANDBOX_API}`,
  );
  add(
    "env.WEB_ORIGIN",
    isPublicHttpsOrigin(env["WEB_ORIGIN"]),
    "WEB_ORIGIN must be the exact public https origin (no path, query, credentials, loopback or placeholder host)",
  );
  const db = parseUrl(env["DATABASE_URL"]);
  add(
    "env.DATABASE_URL.scheme",
    !!db && /^postgres(ql)?:$/.test(db.protocol),
    "DATABASE_URL must be a postgres:// URL",
  );
  add(
    "env.DATABASE_URL.role",
    !!db && decodeURIComponent(db.username) === RUNTIME_ROLE,
    `DATABASE_URL must connect as the least-privilege role ${RUNTIME_ROLE}, never the owner role`,
  );
  add(
    "env.DATABASE_URL.password",
    !!db && db.password.length > 0,
    "DATABASE_URL must carry the runtime role password",
  );
  const s = env["SESSION_SECRET"] ?? "";
  add(
    "env.SESSION_SECRET",
    s.length >= 32 && new Set(s).size >= 12,
    "SESSION_SECRET must be at least 32 characters with real entropy (set in the host secret store)",
  );
  const port = env["PORT"];
  add(
    "env.PORT",
    port === undefined || /^\d{1,5}$/.test(port),
    "PORT is injected by the host; if present it must be a port number (never hard-coded here)",
  );

  eq(STUDIO_VARIANT_NAME, "licensed");
  add(
    `env.${STUDIO_LICENCE_NAME}`,
    LICENCE_SHAPE.test((env[STUDIO_LICENCE_NAME] ?? "").trim()),
    `${STUDIO_LICENCE_NAME} must hold the owner's AG Studio deployment licence (16-8192 printable ASCII characters, set in the host secret store; value never shown)`,
  );

  const present = Object.keys(env)
    .filter(
      (n) => env[n] !== undefined && isForbidden(n) && !(liveJudgeAi && JUDGE_OPENAI_NAMES.has(n)),
    )
    .sort();
  add(
    "env.forbidden-absent",
    present.length === 0,
    present.length === 0
      ? "No provider key, other Studio setting, Vite-exposed, simulated-evaluation or test variable is set"
      : `Forbidden variable names present (values not shown): ${present.join(", ")}`,
  );
  return out;
}

/** The original protected release branch (provider-disabled judges deployment + rollback baseline). */
export const RELEASE_BRANCH = "release/nmi-render-judges-2026";
/**
 * Proposed second protected release branch for the separately approved OpenAI judge candidate.
 * Nothing may create, move or protect it until the owner approves the final candidate SHA.
 */
export const OPENAI_RELEASE_BRANCH = "release/nmi-openai-judges-2026";
/**
 * Strict allowlist: exactly these two branches may be release-checked. Any other name — including
 * ref paths, typos, `main` or an empty value — fails closed. Both branches stay independently
 * verifiable; neither is a mutable tip alias.
 */
export const RELEASE_BRANCHES = [RELEASE_BRANCH, OPENAI_RELEASE_BRANCH] as const;
export type ReleaseBranch = (typeof RELEASE_BRANCHES)[number];
export function isReleaseBranch(v: string | undefined): v is ReleaseBranch {
  return v === RELEASE_BRANCH || v === OPENAI_RELEASE_BRANCH;
}

export interface SourceInput {
  /** Which allowlisted release branch the remote tip is read from; arbitrary names fail closed. */
  releaseBranch: string;
  expectedSha: string;
  headSha: string;
  /** `git status --porcelain` output (empty when clean). */
  porcelain: string;
  /** pnpm-lock.yaml (REPOSITORY ROOT) is unchanged from HEAD. */
  lockfileClean: boolean;
  /**
   * True only when the AUTHORITATIVE remote (`git ls-remote`, not a local tracking ref) answered successfully and
   * listed exactly one `refs/heads/main` and one `refs/heads/<RELEASE_BRANCH>`. Any failure is false (fail closed).
   */
  remoteVerified: boolean;
  /** Tip of `refs/heads/main` on the authoritative remote, if verified. */
  remoteMainTip?: string | undefined;
  /** Tip of the release branch on the authoritative remote, if verified. */
  remoteReleaseTip?: string | undefined;
  /** Expected SHA is an ancestor of (or equal to) `remoteMainTip`, computed against that fresh tip. */
  onMain: boolean;
}

const SHA = /^[0-9a-f]{40}$/;

export function checkReleaseSource(i: SourceInput): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, ok: boolean, detail: string) => out.push({ id, ok, detail });
  // Operator input is never echoed: only an allowlisted name appears in findings.
  const branchLabel = isReleaseBranch(i.releaseBranch) ? i.releaseBranch : "<unallowlisted>";
  add(
    "src.release-branch-allowlisted",
    isReleaseBranch(i.releaseBranch),
    `The release branch must be exactly one of the two reviewed branches: ${RELEASE_BRANCHES.join(", ")} (never a tip alias, arbitrary name or empty value)`,
  );
  add(
    "src.expected-is-full-sha",
    SHA.test(i.expectedSha),
    "The approved release SHA must be a full 40-character lowercase hex SHA",
  );
  add(
    "src.head-equals-expected",
    SHA.test(i.headSha) && i.headSha === i.expectedSha,
    "The checked-out HEAD must equal the approved SHA (never a branch tip or arbitrary HEAD)",
  );
  add(
    "src.worktree-clean",
    i.porcelain.trim() === "",
    "No uncommitted or untracked files may exist in the release checkout",
  );
  add(
    "src.lockfile-clean",
    i.lockfileClean,
    "The repository-root pnpm-lock.yaml must be unchanged from the approved commit",
  );
  add(
    "src.remote-verified",
    i.remoteVerified && SHA.test(i.remoteMainTip ?? "") && SHA.test(i.remoteReleaseTip ?? ""),
    `The authoritative remote (git ls-remote, not local tracking refs) must list refs/heads/main and refs/heads/${branchLabel}; an unreachable, unauthenticated or incomplete answer fails closed`,
  );
  add(
    "src.on-main",
    i.remoteVerified && i.onMain,
    "The approved SHA must be an ancestor of (or equal to) the CURRENT remote main tip, i.e. audited and owner-merged",
  );
  add(
    "src.release-branch-tip-equals-expected",
    i.remoteVerified && SHA.test(i.expectedSha) && i.remoteReleaseTip === i.expectedSha,
    `The CURRENT remote ${branchLabel} tip must equal the approved SHA (a missing branch or a later push must not pass)`,
  );
  return out;
}

export const allOk = (f: readonly Finding[]) => f.length > 0 && f.every((x) => x.ok);
