# NMI-PROTOTYPE-10D-A4 — Local Prototype Readiness and Judge Rehearsal

- **Status:** REHEARSAL EXECUTED (2026-11-03) — local verdict READY (headless/emulated only), hosted NOT AUTHORIZED. Observed: A4 harness 112/112, `pnpm validate` pass, `pnpm test:db` 340/340, runbook Mode A re-run verbatim. MINOR-1 remediation: harness cleanup hardened (single-flight; PostgreSQL data deleted only after confirmed shutdown, otherwise preserved) and covered by a 37/37 failure-injection test. Awaiting hosted CI and independent exact-HEAD re-audit. Evidence: `design/evidence/NMI-PROTOTYPE-10D-A4/QA-RESULTS.md`.
- **Starting base:** `main@588717a7b04cae185da2ad12995346943fe27d02` (A3-FIX1 PR #35 owner-approved squash merge).
- **Branch / PR:** `docs/nmi-prototype-10d-a4-readiness` / one Draft PR, never self-merge.
- **Mode:** offline, synthetic-only readiness verification and documentation. The **existing approved NMI-UI-01B design**, AG Grid Community 36.2.0 and A2 backend/dashboard are the release baseline; no AG Studio licensing or product design approval is implied.
- **UI design gate:** No new UI or material behavior; QA/documentation only. If a material design defect requires a change, create a separate approved task and design gate.

## Objective

Deliver a reproducible, inspectable readiness decision for a PayPal AI Hackathon **local judge demo** by the Nov 11, 2026 release freeze. Validate the exact integrated `main` (including A2 analytics and A3-FIX1), refresh the judge runbook/submission blocker register, and prepare a **NON-AUTHORIZING** hosted stop/go checklist for Nov 7. Never present historical R0/C4/A2 QA as A4 evidence.

## Allowed scope

- `tasks/NMI-PROTOTYPE-10D-A4-prototype-readiness.md`
- `design/evidence/NMI-PROTOTYPE-10D-A4/QA-RESULTS.md` plus redacted synthetic browser evidence under that directory when genuinely generated
- `docs/NMI-DEMO-JUDGE-RUNBOOK.md` (accurate tested commands and current UI/analytics/fake-provider behavior)
- `docs/NMI-DEMO-SUBMISSION-CHECKLIST.md` (only evidence-backed updates, preserve owner gates)
- `docs/STATUS.md` and one new handoff in `docs/HANDOFFS.md`
- If existing browser harness cannot exercise A4, a *separately justified, test-only* extension under `design/evidence/NMI-PROTOTYPE-10D-A4/`; no dependency or production import.

Forbidden: application and database schema changes, production fake-mode switch, migrations against owner DB, new dependencies, licensed AG Studio binaries, environment/secret commits, external provider/API/MCP requests, Render services/Blueprint sync, spending, release-branch creation, deployment, merge or judge URL sharing. Newly found defects are documented and scoped separately rather than quietly fixed in this PR.

## Rehearsal matrix (every item gets observed PASS / FAIL / BLOCKED / NOT RUN)

1. **Clean clone:** verify exact SHA, `pnpm install --frozen-lockfile`, Node/pnpm/PostgreSQL/Chrome versions, fresh isolated PostgreSQL 16 cluster and **new `nmi_test...` database**; journal migrations executed only once on disposable DB. Do not touch preexisting operator/owner DB or credentials. Record commands, versions, paths sanitized, start/end/cleanup and evidence timestamps.
2. **Simulated mode:** use `docs/NMI-DEMO-JUDGE-RUNBOOK.md` Mode A *test-only launcher*, no real keys, no live adapters, no external requests. The fake launcher may use `PAYPAL_DRAFTS_ENABLED=true` with fake values **only in that isolated local launcher**, while default production stays `false`. Clear `OPENAI_API_KEY` and real PayPal secrets, disable SMTP and outbound network, prove network isolation where available, clearly label all fake evidence `SIMULATED`.
3. **Auth/CSRF/privacy:** login, wrong password/rate limit as appropriate, session refresh, logout revocation/late 401, Origin/CSRF rejection, strict owner-scoped invoice access; no customer content in browser persistent stores, navigation URL or platform logs, no credentials in screenshots.
4. **Invoice journey:** synthetic description → simulated parse/clarification or manual fallback → review/edit → human Save → PostgreSQL verified saved draft → dashboard/list/detail → fake confirmed PayPal **DRAFT only** → re-read/status. Verify no send/remind/cancel/refund/payment and no create during parse/save/list/refresh. Repeated fake confirmation remains one-create safe; PayPal reconciler behavior must not be described as a live Sandbox PASS.
5. **A2 full-population analytics:** exercise more invoices than one page; independent SQL calculation over *all matched operator rows*, compared with analytics API and grid. Verify USD and EUR separated; USD two-decimal and JPY zero-decimal exact minor-unit behavior where supported; no FX conversion or cross-currency summation. Paired date bounds (inclusive start/exclusive end), UTC/IANA timezone semantics/DST boundary, filter synchronization (date, status, search, currency) across KPI cards and paginated grid; blank/error/loading/timeout/late 401/cancellation states.
6. **UI/accessibility:** desktop plus **390px** browser QA; keyboard traversal, visible focus, status/error messaging, no unintended horizontal overflow; distinguish headless/emulated evidence from *physical device*, Safari/Firefox/VoiceOver/NVDA testing (NOT RUN unless actually performed).
7. **Build/security:** targeted changed-objective validations, `pnpm validate`, `pnpm test:db` only with disposable `TEST_DATABASE_URL` and `REQUIRE_DB_TESTS=1`, browser R0 `design/evidence/NMI-DEMO-R0/run-e2e-journey.mjs` and latest A2 `design/evidence/NMI-PROTOTYPE-10D-A2/run-browser-qa.mjs` as applicable (read scripts' prerequisites and *current* assertions first; do not blindly expect historical counts). `pnpm check:bundle`, diff/Prettier, both exact-HEAD hosted PR workflows. Do not claim a suite passed unless executed and evidence captured.
8. **Judge readiness:** update local runbook for current merged A2 analytics and A3-FIX1, reproducibility without project owner's secrets, exact safe teardown and an accurate testing mode banner/disclosure. Confirm Devpost setup-instructions path and mark video/submission owner actions pending. Produce an owner-readable readiness matrix: LOCAL DEMO, PROVIDERS, LICENSE, RENDER, JUDGE ACCESS, BACKUP/ROLLBACK, SECURITY, RELEASE.

## Hosting gate (planning only; NO authority)

Before **Nov 7, 12:00 Asia/Manila**, separately review current Render prices/account plan/credits, choose the exact persistent paid Postgres and web plans, approve total cap through **Dec 15**, source SHA/branch, Blueprint method versus previously approved manual-only Runbook, fresh synthetic DB migration and recovery, owner-only HTTPS QA and supervised sequential judge access. AG Studio trial start/end/rights remain unverified: use merged Community fallback unless proven licensed. Render Workflow and extra real OpenAI calls remain off without separately authorized provider/budget/Workflow specification.

If any owner gate fails, mark hosted mode **BLOCKED / NOT READY**, use the clean-clone local judge path, and publish no URL. Never say Free PostgreSQL survives to Dec 15 (its current 30-day expiry is incompatible). Hosted verification may only occur after a separate written authorization covering exact commit and billable first deploy. No Devpost submission or public video without separate owner approval.

## Evidence and decision

Record in `design/evidence/NMI-PROTOTYPE-10D-A4/QA-RESULTS.md` exactly what was tested and observed. Separate independently verified GitHub source/CI from implementation-agent local and owner manual results. Include test command, counts, versions, disposable DB proof, no-network/provider proof, screenshots only if genuinely generated, any blockers/fixes (in a separate PR if runtime), and final gate verdict: **LOCAL READY / LOCAL NOT READY / INCOMPLETE**, and **HOSTED NOT AUTHORIZED / BLOCKED / separately verified**.

Stop at Draft PR + required CI and independent exact-HEAD audit. Owner separately approves merge, any deployment and any public sharing.