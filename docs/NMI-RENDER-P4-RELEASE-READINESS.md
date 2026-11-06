# NMI-RENDER-P4 — Judge-hosted release readiness (evidence and checklist)

**Verdict: READY FOR OWNER HOSTING APPROVAL, conditional on the owner-only gates in §10.** The original P4 implementation made no Render API call, no release branch, no deploy, no provider calls and no AG Studio key transfer; no Render resources or judge URL were created by this phase. **Subsequent documented change (2026-11-04):** P3 budget PR #39 was independently audited and owner squash-merged to `main@5160dff9b0072913d3f12e20e81ac8d86d081cb7`; P4 PR #40 was later owner squash-merged as `main@8cc2f4db945af5449d99c01236baca9a21396a50`. **Post-merge note (2026-11-05):** PRs #41, #42 and #43 are merged on `main@fbd2d8ef41e7ab08a7dbd2793468d5d9033d1d38`. The P4 evidence below predates them; in particular, the backup/restore drill covered migrations `0000`–`0007` only, not P6's `0008`. A P7 release-readiness refresh is required before any release SHA is chosen; see `docs/STATUS.md`. This documentation reconciliation is not an initial deployment or hosting authorization.

Original P4 base: `main@e314bef381c66b4233576683c7f53dd248f58a86` (PR #38 merged). Reconciled P4 branch with `main@5160dff9b0072913d3f12e20e81ac8d86d081cb7` (budget PR #39 merged). Implementation source and final reconciliation HEAD are recorded in PR #40. *Historical (as of P4):* the release SHA was not to be selected until P4's own owner-approved merge.
  - **Current (2026-11-05):** P4 PR #40 is merged (`main@8cc2f4db945af5449d99c01236baca9a21396a50`), and `main` is now `fbd2d8ef41e7ab08a7dbd2793468d5d9033d1d38`.
  - **No release SHA has been selected (G4 open)**, so this document still names none.

## 1. What was verified, and how (all local, disposable, synthetic)

| # | Objective | Evidence | Result |
|---|---|---|---|
| 1 | Production build is Community-only | `pnpm build` + `pnpm check:bundle` (3 files; no `ag-studio`, `AgStudio`, `ag-charts-enterprise`, `__nmi_dev`, `studio-licence`, `AG_STUDIO`, key value). **Negative control:** a production build run with `VITE_NMI_STUDIO_LOCAL=1` and a fake `AG_STUDIO_LICENSE_KEY` produced a byte-identical `index-5T6WW9xw.js` and zero marker hits. The `studioBuildGuard` plugin (fails any build that resolves a Studio package) and `import.meta.env.DEV` dead branch are the two independent mechanisms. | PASS |
| 2 | Same-origin hosting, HTTPS cookie, CSRF, Origin, CSP, proxy trust, log privacy | `hosting.test.ts` + `hosted-staging.pg.test.ts` (inside `pnpm test:db`, **16 files / 340 tests passed on PostgreSQL 16.15**), and the P1 real-Chrome hosted-shape harness **re-run on current code: 26/26** (`design/evidence/NMI-RENDER-P4/hosted-qa-results.json`). | PASS |
| 3 | PG16 migrations, least-privilege role, backup and recovery | `design/evidence/NMI-RENDER-P4/run-backup-restore-drill.mjs`: **26/26** (`backup-restore-results.json`). Non-superuser owner applies `0000`–`0007`; `runtime-role.sql`; 25 synthetic invoices; `pg_dump -Fc`; simulated data loss and dropped database; `pg_restore` as the non-superuser owner; content fingerprint (every table, rows + md5) and schema fingerprint identical; runtime role still denied DELETE/TRUNCATE/CREATE/audit UPDATE/credential UPDATE and still able to append audit rows; append-only trigger rejects even the owner; truncated-dump negative control fails closed; cleanup confirmed PostgreSQL shutdown before deleting the data directory. | PASS |

*P7-C update (2026-11-06):* row 3 above is historical (migrations `0000`–`0007`, 26/26). The fresh **P7 drill covers all nine migrations including `0008` `invoice_nudges`**: 116/116 on local PostgreSQL 16.15, source `39e6603` (corrected from an earlier 99/99 run after audit finding P7-C-AUD-01). See `design/evidence/NMI-P7/RECOVERY-RESULTS.md`. It proves local recovery only, not Render-managed backups.
| 4 | Release-SHA controls, env matrix, build/start | New `pnpm --filter @nmi/api release-preflight env` and `... source --expect <sha>` with 53 deterministic tests (`apps/api/src/release-preflight.test.ts`), including a disposable bare Git remote (pinned release passes; stale tracking ref, absent branch, unreachable remote, HEAD mismatch, dirty tree, missing main ancestry and a tampered root lockfile launched from `apps/api` all fail), and a check that the approved matrix is accepted by the real `loadConfig`. | PASS |
| 5 | Hobby request-log gap | §6. Rechecked Render's logging page today: HTTP request logs exist only for Pro+ workspaces. | **Residual risk — owner decision required** |
| 6 | Cost and teardown | §8. | Plan only |

Honest limits: `pg_restore` was exercised on a local PostgreSQL 16.15, not on Render's managed service; Render's TLS routing, `PORT` injection, health check and the real `X-Forwarded-For` shape are **not proven** until the supervised post-deploy checklist (§9) runs. Real Chrome only; no Safari/Firefox/device/screen-reader work was done here. The 96-check Studio matrix, the A4 rehearsal and provider tests were not rerun (no relevant change).

### Finding fixed in this phase (narrow)
The P1 harness expected the filtered dashboard to emit only `POST /api/invoice-drafts/search` and an old empty-state id; the dashboard now also posts `POST /api/analytics/summary`. The product was correct; the P1 evidence was left untouched and the adapted copy in P4 allows exactly those two fixed lines and still fails on any URL carrying text. No product code was changed other than adding the preflight CLI.

## 2. Exact-SHA release mechanism (design; nothing created)

1. *Historical (as of P4); current state: #40 is merged, so G2 is closed, but no release SHA has been chosen (G4 open). A P7 release-readiness refresh covering migration `0008` comes first; see `docs/STATUS.md`.* Budget PR #39 has been audited and owner-merged. After P4 PR #40 completes its new exact-HEAD validation, independent reconciliation review and a separately authorized owner merge, the owner (not an agent) picks the **full 40-character SHA** on `main` to release and records it privately.
2. Owner creates `release/nmi-render-judges-2026` pointing at exactly that SHA. Branch protection: no force-push, no deletion.
3. On a clean clone, before provisioning and again before every deploy: `pnpm --filter @nmi/api release-preflight source --expect <SHA>` must print `RESULT: PASS`. It asks the authoritative remote (`git ls-remote`, never local tracking refs) for the CURRENT tips of `main` and `release/nmi-render-judges-2026`, and requires: HEAD equals the SHA, clean tree, the repository-root `pnpm-lock.yaml` unchanged (also when launched from `apps/api`), the SHA is an ancestor of the fresh `main` tip (fetch first if its object is missing), and the release-branch tip equals the SHA. The release branch is mandatory (there is no flag to omit it); an unreachable, unauthenticated or incomplete remote answer fails closed. The only network read is GitHub ref listing.
4. Render service: **Auto-Deploy Off**, no Blueprint, no previews, one instance. **First-deploy risk:** creating a service from a branch triggers an initial build of the branch tip even with auto-deploy off, so the tip must equal the approved SHA at creation time (step 3 proves it). Any later change is a manual "Deploy a specific commit".
5. Fail-closed boot: the server refuses to start without an exact https `WEB_ORIGIN`, with `TRUST_PROXY=true`, with a wildcard `HOST` outside production, or when drafts are enabled without credentials (all tested). **Chicken-and-egg:** the exact `onrender.com` origin is only known after the service exists, so `WEB_ORIGIN` is set on creation to the origin Render shows, then the service is redeployed *at the same SHA* and §9 verifies it; until that passes, nobody is given the URL.
6. Rollback: redeploy the previous pinned SHA (stateless app; migrations are forward-only and none run at boot). Data rollback is the database restore in §7. Proven locally: §1 row 3; not proven on Render.

## 3. Build and start (names only)

- Build: `pnpm install --frozen-lockfile --prod=false && pnpm --filter @nmi/web build` (verified with `NODE_ENV=production`: same bundle hash). Start: `pnpm --filter @nmi/api start` (`tsx src/server.ts`; `tsx` is why `--prod=false` is required). Health check `/health`. Node 22 (CI uses 22; set `NODE_VERSION` to a 22.x). pnpm 10.28.0.
- **Licence note for the owner/auditor (new):** `ag-studio` and `ag-studio-react` are regular dependencies of `apps/web`, so the Render build host will *download* them (and `ag-grid-enterprise`/`ag-charts-enterprise`) from public npm during `pnpm install`. They are not bundled or served (§1 row 1) and no key exists on Render, but this is not provably covered by the trial terms ("internal evaluation"). Options if the owner wants zero Studio packages on Render: make the Studio packages `optionalDependencies`/a separate local-only workspace (a small follow-up change with lockfile impact, **not made here**), or accept the download. Decision recorded as gate G7.

## 4. Provider-disabled environment matrix (names only; values only in Render's secret store)

Enforced by `release-preflight env` (prints rule ids and *names*, never values).

*Historical note:* the 53-test count in §1 row 4 was recorded before P5 and P7-B; the P7-B rule adds named-flag tests (see handoff `NMI-P7-B-01`). The P4 evidence otherwise stands unchanged.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `HOST` | `0.0.0.0` | |
| `PORT` | injected by Render | never hard-coded; must be numeric if present |
| `WEB_ORIGIN` | exact public `https://` origin, no path | not localhost/placeholder |
| `TRUST_PROXY` | `1` | only after §9 step 4 confirms one hop; never `true` |
| `DATABASE_URL` | runtime-role URL, user `nmi_runtime`, with password | internal URL; owner credential never on the web service |
| `SESSION_SECRET` | ≥ 32 chars, real entropy | secret |
| `PAYPAL_ENV` / `PAYPAL_API_BASE_URL` / `PAYPAL_DRAFTS_ENABLED` | `sandbox` / `https://api-m.sandbox.paypal.com` / `false` | |
| `NUDGE_AI_DRAFTING_ENABLED` (**P7-B**) | absent or exactly `false` | live AI nudge drafting stays off and unauthorized (Gate A). Rule `env.NUDGE_AI_DRAFTING_ENABLED` rejects `true`, empty, wrong case and padded values; the config loader's own enum agrees. This is in addition to forbidding the OpenAI names below. |
| `NMI_WEB_STUDIO` (**P5**) | `licensed` | selects the licensed AG Studio web build; shared by Render's build and runtime |
| `AG_STUDIO_LICENSE_KEY` (**P5**) | owner's deployment licence, secret store only | released at runtime only to the signed-in operator; never in a build, log or document |
| **Must be absent** | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_OUTPUT_TOKENS`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `WEB_DIST_DIR`, `TEST_DATABASE_URL`, `REQUIRE_DB_TESTS`, `PGPASSFILE`, `PGPASSWORD`, anything else starting `AG_STUDIO`, `VITE_`, `NMI_` (P5: only the two names above are allowed) | other Studio settings, Vite-exposed values, simulated switches |

Gap noted, not changed: `loadConfig` itself does not refuse provider keys in production (the app must stay usable with them for the owner's later gated gates). The preflight is the enforcement point and must be run by the operator against the *service's* environment (dashboard-exported names, or the shell used to dry-run) before go-live.

## 5. Security posture carried forward (unchanged)

`__Host-nmi_session` (Secure, HttpOnly, SameSite=Lax, Path=/, no Domain); exact-Origin and CSRF on every mutation; header CSP with `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy: no-referrer`; `TRUST_PROXY=1` one-hop (negative control with `true` is evaded); in-memory rate limits, so exactly one instance; single operator; manual-entry fallback with providers off; PayPal create returns `503 paypal_disabled`; AI/background code still cannot send, remind, refund, cancel or mark paid.

## 6. Hobby HTTP request-log gap: alternative evidence contract and residual risk

**Facts (Render logging docs, fetched 2026-11-04):** Hobby workspaces get service (application) logs with 7-day retention; **HTTP request logs are shown only for Pro or higher**. So on Hobby the ingress request-line record cannot be inspected by us; whether Render keeps one internally is unknown.

**Cannot be verified without Pro:** what Render's edge records for a request (URL, query, headers), its retention, and who can read it.

**Alternative contract (all must hold; each independently testable):**
- A1 *Privacy by construction:* no customer text ever travels in a URL. Search is `POST` with a JSON body; legacy `GET ...?q=` is refused; every other route has only a static path or a UUID path parameter and no query string. Proven by `hosted-staging.pg.test.ts` and the browser run (every logged line is one of two fixed POST lines; no needle string anywhere).
- A2 *Application logs:* before sharing, search a unique synthetic marker in the UI, then search Render's Logs (service logs are available on Hobby) for the marker and the synthetic e-mail: absent.
- A3 *Synthetic-only data on the hosted instance:* no real customer name/e-mail is ever entered by us or judges' instructions; the judge-facing note says so. This reduces impact; it does **not** replace A1/A2 and does not waive the gap.
- A4 *Headers/cookies:* the session cookie is `__Host-`/HttpOnly; credentials and tokens are never in URLs (login is a POST body).

**Residual risk requiring explicit owner acceptance (gate G5):** an edge-layer record of *request lines* (method, path, UUID, timing, client IP) may exist outside our view; it would hold no search text, name or e-mail by A1, but it would hold judge IP addresses and invoice UUIDs. No Pro upgrade is proposed without separate authority.

## 7. PostgreSQL backup and recovery

- Local proof: §1 row 3 (logical dump → destructive loss → restore to a fresh database; least-privilege and immutability preserved). Restore time for the synthetic dataset was under a second; real timing is unknown.
- Render (docs fetched 2026-11-04): paid plans on a Hobby workspace have point-in-time recovery for 3 days, logical backups kept 7 days and downloadable exports; the Free plan has none (so the Free choice from P2 should not be used for this plan). Restoring a Render backup creates a **new** database instance, so a recovery also means re-pointing `DATABASE_URL` and re-running the §9 role checks; plan for that.
- Before judging: take and keep a private export, verify with `pg_restore --list`. Treat any dump as sensitive (it holds the operator password hash and customer rows; the drill asserts this). Never email or commit it.
- Role verification after every restore: as `nmi_runtime`, `SELECT` works; `DELETE`, `TRUNCATE`, `CREATE TABLE`, `UPDATE audit_log` fail with `42501` (the drill's checks).

## 8. Cost and teardown checkpoints ($25 ceiling, owner-approved through 2026-12-15)

Planning figures only, **not a quote**: Starter web ~$7/month plus PostgreSQL Basic 256 MB ~$6/month = ~$13/month; an 8 Nov – 15 Dec window is ~37 days ≈ $16–17 before bandwidth, extra storage, tax or build minutes. There is **no hard platform cap**; the control is manual.

| Checkpoint | Action |
|---|---|
| C0 before create | Owner reads Workspace Billing: plan is Hobby, credit balance and applicability, forecast ≤ $25. Any doubt: stop. |
| C1 +24 h after create | Compare the charge shown with the ~$13/month rate; confirm one web, one database, no extras. |
| C2 15 Nov, C3 1 Dec, C4 10 Dec | Record spend. If projected total > **$20**: warn the owner; > **$25** or not covered by credits: suspend the web service and stop (no new resources, no upgrade). |
| C5 judging end (15 Dec) | Take a final private export; revoke sessions (`UPDATE sessions SET revoked_at = now()` as owner); suspend the service. |
| C6 teardown | **Deletion of the service and database needs separate explicit owner approval.** Then delete secrets and rotate anything ever loaded into Render. Paid resources must not run past the window. |

## 9. Render checklist (the owner or a separately authorized operator; none of this was run)

Pre-create: gates G1–G8 below closed; preflight `source` PASS; local `release-preflight env` PASS against the intended variable set; C0.
Create (manual, region Singapore if available; Hobby; Starter web; Basic 256 MB PostgreSQL 16; no Blueprint/previews; auto-deploy off): follow `docs/NMI-RENDER-P1-RUNBOOK.md` §5 (migrations as owner, `nmi_runtime`, operator via the CLI, verify denials) and §6 (service). Then verify on the live URL before sharing, in this order: P1 §6 steps 1–3 (health, headers, cookie flags); step 4 (spoofed `X-Forwarded-For` still throttled; otherwise set `TRUST_PROXY` per proof); step 5 *(replace the Pro-only HTTP log search with contract §6 A2)*; steps 6–8. Any failure: suspend, report, do not share.

## 10. Owner-only gates before "go" (all open)

| Gate | Needed |
|---|---|
| G1 | Owner confirms live Billing: Hobby, credit applicability, ≤ $25 forecast (C0). |
| G2 | **CLOSED (recorded 2026-11-05):** P4 PR #40 was independently audited and owner squash-merged as `main@8cc2f4db945af5449d99c01236baca9a21396a50`. This closes only the P4 code/merge gate. The P4 evidence predates #41/#42/#43 and does **not** cover migration `0008`. *Original requirement:* independent exact-head audit of this P4 PR; owner decision to merge it. |
| G3 | **CLOSED:** P3 budget PR #39 independently audited and owner squash-merged to `main@5160dff9b0072913d3f12e20e81ac8d86d081cb7`; budget ceiling only. Live billing G1 is still OPEN. |
| G4 | Owner picks the release SHA and creates `release/nmi-render-judges-2026` (§2). |
| G5 | Owner accepts the Hobby request-log residual risk (§6) in writing. |
| G6 | Separate approval for resource creation and the unavoidable first build; separate approval to share the URL; judge-access method (supervised credentials or video) decided. |
| G7 | Owner decides on Studio packages being downloaded by Render's build (§3). Hosted Studio *use* remains NOT AUTHORIZED. **P5 (2026-11-04): owner attests the AG Studio deployment licence covers the judge-facing production environment through the December judging window; see `docs/NMI-P5-LICENSED-STUDIO-RELEASE.md`. Independent audit and the remaining gates still apply.** |
| G8 | Gates A, B, C stay NOT AUTHORIZED: no OpenAI/PayPal credentials on Render. |

## 11. Commands to reproduce

`pnpm validate`; with a disposable PG16 and `TEST_DATABASE_URL=postgres://…/nmi_test_*`: `pnpm test:db`; `node design/evidence/NMI-RENDER-P4/run-backup-restore-drill.mjs`; `pnpm --filter @nmi/web build && node design/evidence/NMI-RENDER-P4/run-hosted-browser-qa.mjs`.

## 12. Audit remediation (P4-FIX1)
Independent audit of `ddac915…` found MAJOR-1 (release branch tip judged from a stale local `origin/...` ref, and the branch proof was optional) and MINOR-1 (lockfile pathspec resolved against `apps/api` under `pnpm --filter`). Fixed in the source checker only: authoritative `git ls-remote`, mandatory release branch, root-anchored git calls, tests above. The `generatedBy` provenance of the P4 browser JSON now names the P4 harness. Hosting behaviour, other gates (G1–G8) and all scope exclusions are unchanged.

## 13. Post-P3-merge reconciliation (2026-11-04, historical)

*Historical record, as of 2026-11-04.* PR #40 was later owner-merged, so G2 is now closed. G1 and G4–G7 remain **OPEN**, G8 continues, and no release SHA is selected.

- Owner-approved P3 budget PR #39 was independently audited PASS and squash-merged to `main@5160dff9b0072913d3f12e20e81ac8d86d081cb7`. The original P4 source/checker and local QA artifacts were kept unchanged; PR #40 receives a normal **two-parent merge commit** to integrate P3's five documentation files and preserve both P3 and P4 handoff histories. G3 is now closed; **G1/G2 owner P4 merge/G4/G5/G6/G7 remain OPEN** and G8 provider prohibition continues.
- `docs/STATUS.md` now points to the P4 release-readiness task and `NMI-RENDER-P4-FIX1-01`; the P2 Free-tier choice remains historical and cannot be used for the proposed judge release. No current Render cost quote, eligible credit check, Studio vendor consent, host request-log evidence, release branch or production deployment was created by this reconciliation.
- Reconciliation changes documentation only; run both hosted CI workflows on the **new PR #40 exact HEAD**, confirm mergeability and obtain focused independent audit before requesting any owner squash merge. No merge, deploy, billing approval escalation, provider calls or judge URL publication follows automatically.

## 13. P5 supersession (licensed AG Studio production dashboard)

This P4 record describes the Community-only release as it was audited. P5 changes the release target to the **licensed AG Studio dashboard**, on owner attestation of the deployment licence. P5 is PR #42, squash-merged as `c575a0dc9bf158a477d71976a614f8df802d6110` on 2026-11-05 after the independent P5-FIX1 re-audit PASS. Where P5 differs, `docs/NMI-P5-LICENSED-STUDIO-RELEASE.md` governs. Release is still gated by G1 and G4–G8, and by the P7 refresh for migration `0008`:

- **Build:** `pnpm install --frozen-lockfile --prod=false && pnpm build:web:licensed && pnpm check:bundle:licensed`, with `NMI_WEB_STUDIO=licensed` in the service environment. The bundle scan runs in the Render build, where `AG_STUDIO_LICENSE_KEY` is set, so the hosted build itself proves the licence value is absent from every built file.
- **Row 1 of §1** ("Community-only") is superseded for the release: Studio ships in lazy chunks loaded only after sign-in. The Community build remains the default and is still checked in CI.
- **Environment matrix (§4):** `NMI_WEB_STUDIO=licensed` and a well-formed `AG_STUDIO_LICENSE_KEY` are **required**; every other `AG_STUDIO*`, `VITE_*` and `NMI_*` name stays forbidden. `release-preflight env` enforces this.
- **CSP (§5):** unchanged, except the HTML shell's `style-src` now also allows a fresh per-response nonce and the exact SHA-256 hashes of four static vendor stylesheets, for runtime-injected `<style>` elements. Scripts stay `'self'`, there is no `'unsafe-inline'`, and the shell is `no-store`.
- Gates G1–G6 and G8 are unchanged. G7 is recorded above as owner-attested; it is not independently verified.

## 14. P7 release gate ledger (2026-11-06; technical readiness only, no release authorized)

This ledger separates **technical checks that were run** from **owner-controlled gates that remain open**. It does not select a release SHA, and no gate below was closed by P7. Evidence: `design/evidence/NMI-P7/P7-D-VERIFICATION.md`.

### Technical checks completed (code and evidence)

| Check | Result | Attribution |
|---|---|---|
| P7-A: already-mounted queue re-targeting; invoice-bound pending warning (both Codex P2 findings) | DOM tests (+8) and browser journey 47/47; both findings addressed | Independent review PASS (P7-A); journey is implementation-agent local |
| P7-B: `NUDGE_AI_DRAFTING_ENABLED` enforced by name in the provider-disabled preflight (absent or exactly `false`) | 17 new tests; negative control | Independent review PASS (P7-B) |
| P7-C: PostgreSQL 16 backup/restore for migrations `0000`–`0008` incl. `invoice_nudges` and runtime grants | **116/116** local; supersedes the 99/99 run after P7-C-AUD-01 | Independent review PASS; P7-C-AUD-01 closed (PR #45 comment 6675591988) |
| Full validation | `pnpm validate` 1408 passed; `pnpm test:db` 367 passed (disposable PG 16.15) | Implementation-agent local |
| Bundle inspection, synthetic licence only | 30/30; Community has no Studio code; licensed has Studio in lazy chunks only; no licence or secret marker in either | Implementation-agent local |
| Hosted Project Baseline CI and Stack CI | Recorded for the final exact head in PR #45 | Independently verifiable on GitHub |

These are local and offline checks. They prove nothing about Render, a hosted service, a real provider or real-size data.

### Owner-controlled gates

| Gate | State | What is needed |
|---|---|---|
| G1 | **OPEN** | Live Billing check: Hobby, credit applicability, forecast of at most $25 (C0), plus a teardown/export/retention plan. P3 is a budget ceiling only. |
| G2 | **CLOSED** | P4 PR #40 independently audited and owner-merged (`8cc2f4d`). |
| G3 | **CLOSED** | P3 budget PR #39 audited and owner-merged (`5160dff`). A budget ceiling only. |
| G4 | **OPEN** | The owner picks a full 40-character release SHA on `main` after P7 is merged, and creates `release/nmi-render-judges-2026`. **No release SHA is selected.** The source preflight requires that exact branch and SHA. |
| G5 | **OPEN** | Written acceptance of the Render Hobby request-log residual risk (§6), with alternative-evidence checks (§6 A2). |
| G6 | **OPEN** | Separate approval for resource creation and the first build, for sharing a URL, and for the judge-access method. |
| G7 | **OPEN** | Vendor AG Studio package download and use rights. The licence scope is **owner-attested, not independently legally verified**. The exact entitlement end date and document are owner-held, and nothing in the code enforces expiry. |
| G8 | **CONTINUING** | Provider-disabled configuration. The release preflight enforces it: no OpenAI, PayPal-credential, test or simulated variables; `NUDGE_AI_DRAFTING_ENABLED` absent or `false`; `PAYPAL_DRAFTS_ENABLED=false`; `PAYPAL_ENV=sandbox`; licensed Studio variables. It runs against the *service's* environment, which P7 did not do. |
| Gate A | **NOT AUTHORIZED** | Live OpenAI, including live nudge drafting. Run `R1-A-20261030-01` is consumed. |
| Gate B | **NOT AUTHORIZED** | A new PayPal Sandbox create. |
| Gate C | **NOT AUTHORIZED** | Any further live-provider test. |

### Remaining unperformed checks

Safari, Firefox, real devices and touch; screen readers (VoiceOver, NVDA); 400% zoom; HTTPS `__Host-` cookie behind the real Render proxy; Render request-log evidence (G5); Render-managed backup/restore and real-size restore time; live billing and charges; Devpost and video publication. The new journeys use headless Chrome emulation only. P7 does not claim these were run.

### Recommended owner decisions (in order)

1. Review and decide on P7 PR #45 after independent exact-head review. Only the owner may approve a squash merge.
2. G1: check live Billing and credits, and approve a teardown/export/retention plan.
3. G5 and G7: decide, in writing, on the request-log residual risk and on the vendor download and use rights.
4. After P7 is merged: choose the full release SHA and authorize the controlled release branch (G4). Then run `release-preflight source` and `env` against the real inputs.
5. Decide which manual QA gaps matter before any judge sees a URL, and plan that testing.
6. Keep Gate A off. If live nudge drafting is ever wanted, authorize it in a separate bounded request.

**Update 2026-11-06 (post-P7 merge):** P7 is merged as PR #45 (`main@0e10e8d1f6d521bba9b0c503f4ce0fdf188ded19`); the ledger above is unchanged by the merge. The G1 owner decision packet is `docs/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md`. **G1 remains OPEN** until the owner supplies actual Billing evidence; G4, G5, G6 and G7 remain OPEN and G8 continues. No release SHA is selected. An automated post-merge review reports that the P7-C recovery runner's own cleanup has the same status-code gap fixed in the journey helper (see `docs/STATUS.md`); it is recorded as open.
