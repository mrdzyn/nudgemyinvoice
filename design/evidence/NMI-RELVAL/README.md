# NMI-RELVAL-01 — One-time manual release-CI validation evidence (candidate 846608ab)

**Contract:** `tasks/NMI-JUDGES-RC-MANUAL-CI-EXCEPTION.md` (merged PR #71, policy main `4d98d8d`).
**Candidate:** `846608abf2e63943fb05646e0c58ca3936f27943` (exact 40-hex SHA, ancestor of policy main).
**Checkout:** clean detached worktree at the exact candidate SHA; tree verified clean, no tracked `.env*` (only `.env.example`). Full redacted logs preserved privately off-Git per contract; this file is the reviewer-accessible summary.

## Environment and provenance

- UTC 2026-11-08T06:06:18Z; Darwin arm64 (Apple Silicon); Node v22.23.4; pnpm 10.28.0; Python 3.15.2; PostgreSQL 16.15 (Homebrew, disposable TCP clusters, trust auth, localhost only).
- **Platform gap (disclosed):** macOS/arm64 local execution is NOT GitHub Ubuntu; no Ubuntu/Docker parity run was performed. Native modules, package tooling, PostgreSQL packaging, and PG service-vs-cluster differ. Independent reviewer must judge equivalence; owner must explicitly accept the gap.

## Source-pinned equivalents (all on the exact candidate checkout)

| Check | Result |
|---|---|
| `validate_project_profile.py --repository mrdzyn/nudgemyinvoice` | PASS (24 capability files) |
| Tracked `.env*` guard (`git ls-files`) | PASS (only `.env.example`) |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm lint` | exit 0 (1 pre-existing unrelated warning: unused eslint-disable in `design/evidence/NMI-P7/pg-cleanup.mjs`) |
| `pnpm format:check` | exit 0 (Prettier clean) |
| `pnpm typecheck` | exit 0 |
| `pnpm test` (unit) | exit 0 — **77 files / 1502 passed**, 357 skipped |
| `TEST_DATABASE_URL=<disposable nmi_test> pnpm test:db` (PG 16.15) | exit 0 — **20 files / 374 passed** |
| `pnpm build:web:licensed` | exit 0 (no licence value involved) |
| `pnpm check:bundle:licensed` | exit 0 — clean, Studio in 1 lazy chunk |
| `pnpm build` | exit 0 |
| `pnpm check:bundle` | exit 0 — clean, Community variant, no Studio code |
| `pnpm db:generate` + `git status --porcelain packages/db/migrations` | no changes, migration dir clean |
| `pnpm audit --prod --audit-level high` | exit 0 — no known vulnerabilities |
| `git diff --check` / `git status --porcelain` | clean |
| Hosted Project Baseline CI / Stack CI | **NOT RUN** (external block; this manual suite substitutes only under the exception) |

## Supplemental release-specific safety

- **Migrations:** journal holds 9 entries ending `0008_mushy_zarek`; all nine applied to disposable PG16; 10 public tables; `invoice_nudges` present.
- **Operator preflight:** `provision-operator` on disposable DB → `Operator created.` Least-privilege role checks and constraint suites covered by the 374 passing PG tests.
- **Backup/restore drill:** `pg_dump -F c` → `BACKUP_OK`; restore to fresh DB → `RESTORE_DONE`, 10/10 tables. **Corrupt-backup negative control:** truncated dump → `pg_restore` exit 1 (`could not read from input file: end of file`) — fail-closed PASS. Dump files removed after the drill.
- **Provider-disabled matrix** (`release-preflight env`, synthetic provider-disabled values): PASS on `PAYPAL_ENV=sandbox`, `PAYPAL_DRAFTS_ENABLED=false`, `NUDGE_AI_DRAFTING_ENABLED` absent/false, `PAYPAL_API_BASE_URL` sandbox host, `forbidden-absent` (no provider keys). Overall `RESULT: FAIL (do not deploy)` **by design** — remaining findings require the production Render host (NODE_ENV/HOST/public WEB_ORIGIN/`nmi_runtime` role/host secrets/licensed Studio key), which do not exist locally.
- **HTTPS/CSP/proxy/rate-limit/privacy-marker coverage:** exercised by the passing `hosting.test.ts`/`app.test.ts` suites (77/1502 + 374/374 above). No live-server provider calls made.
- **Browser QA (carried forward, byte-identical product tree):** product tree of `846608ab` is byte-identical to audited RC heads; prior runs on that tree: branding/chat 28/28 PASS and corrected-harness 30/30 PASS (EUR hit-test + trusted tap, zero CSP violations, focus/zoom asserted). See `docs/nmi-69-branding-qa-evidence` and `docs/nmi-70-rc-qa-evidence`.

## Steps blocked until the owner separately authorizes branch creation

`release/nmi-judges-2026` does not exist yet (nothing was created here). Observed fail-closed behavior from the policy tree:

- `release-preflight source --expect 846608ab… --release-branch release/nmi-judges-2026` → `RESULT: FAIL (do not deploy)`: `allowlisted` PASS (policy works), `judges-sha-pinned` PASS, but `remote-verified` / `on-main` / `release-branch-tip-equals-expected` FAIL because `ls-remote` cannot list the absent branch — exactly the designed block. Unblocked only by (a) owner approval + creation/pinning of the branch at `846608ab`, then (b) re-running from a detached `846608ab` checkout (current run was from policy HEAD, so `head-equals-expected` also correctly failed).
- `release-preflight env` production-host findings (above) stay FAIL until run against the actual Render service configuration; `release-preflight env` must PASS there before any public sharing.

## Standing disclosures and limits

- Same-agent implementation + verification lineage; cross-party review still required for the evidence audit.
- No Ubuntu parity run (see platform gap). No secrets, DB URLs, private logs, or licence values in this record. No provider calls, branch changes, deploys, or URL sharing performed.
- Failures/skips observed: the single unrelated lint warning above; 357 unit skips + 19 skipped files (pre-existing suite skips, unchanged by this run); corrupt-restore negative control behaved as designed. No genuine check failed; nothing was reclassified.

## Request

Independent manual evidence audit of this record against the exception contract, then owner decisions in order: exception acceptance → branch-creation approval → deploy authorization → URL-sharing approval.
