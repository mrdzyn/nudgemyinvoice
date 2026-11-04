/**
 * NMI-RENDER-P4 release preflight (pure, offline). Two independent checks an operator runs BEFORE any Render
 * action; neither calls Render, a provider or the network, and neither ever returns an environment VALUE:
 *  - `checkReleaseEnv`: the provider-disabled, Community-only hosted environment matrix (names + verdicts only).
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

/** Variables that must be ABSENT from the hosted web service (provider-disabled, Community-only build). */
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
/** Prefix families that must be absent: Studio licence/flags, any Vite-exposed variable, simulated switches. */
const FORBIDDEN_PREFIXES = ["AG_STUDIO", "VITE_", "NMI_"] as const;

const isForbidden = (name: string) =>
  FORBIDDEN_NAMES.has(name) || FORBIDDEN_PREFIXES.some((p) => name.startsWith(p));

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

  const present = Object.keys(env)
    .filter((n) => env[n] !== undefined && isForbidden(n))
    .sort();
  add(
    "env.forbidden-absent",
    present.length === 0,
    present.length === 0
      ? "No provider key, Studio licence, Vite-exposed, simulated-evaluation or test variable is set"
      : `Forbidden variable names present (values not shown): ${present.join(", ")}`,
  );
  return out;
}

export interface SourceInput {
  expectedSha: string;
  headSha: string;
  /** `git status --porcelain` output (empty when clean). */
  porcelain: string;
  /** Whether `expectedSha` is reachable from `origin/main` (audited and merged). */
  onMain: boolean;
  /** Tip of the release branch ref when one is supplied (e.g. origin/release/nmi-render-judges-2026). */
  releaseTipSha?: string | undefined;
  /** Which release ref was inspected, for the report. */
  releaseRef?: string | undefined;
  /** SHA of `pnpm-lock.yaml`-tracked state is verified by --frozen-lockfile at build; here: lockfile unchanged vs HEAD. */
  lockfileClean: boolean;
}

const SHA = /^[0-9a-f]{40}$/;

export function checkReleaseSource(i: SourceInput): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, ok: boolean, detail: string) => out.push({ id, ok, detail });
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
    "pnpm-lock.yaml must be unchanged from the approved commit",
  );
  add(
    "src.on-main",
    i.onMain,
    "The approved SHA must be an ancestor of (or equal to) origin/main, i.e. audited and owner-merged",
  );
  if (i.releaseRef !== undefined)
    add(
      "src.release-branch-tip-equals-expected",
      !!i.releaseTipSha && i.releaseTipSha === i.expectedSha,
      `${i.releaseRef} must point exactly at the approved SHA (a later push to it must not be built or deployed)`,
    );
  return out;
}

export const allOk = (f: readonly Finding[]) => f.length > 0 && f.every((x) => x.ok);
