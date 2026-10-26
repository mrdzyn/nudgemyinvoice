# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-CORS-01 — **ACTIVE BOUNDED REMEDIATION**.
- **Status:** NMI-P2-I2 completed and squash-merged (PR #4 at `07409bf32068362b9f5b711b64ef0399d588169e`, PR #5 documentation reconciliation squash-merged at `397c5d0376ef37cfd7f7debb93ac3f8387be5fea`). Active bounded remediation NMI-CORS-01 resolves the known `Idempotency-Key` CORS preflight defect before browser invoice-save integration; audited by GPT-6 on Draft PR #6 (`eb2b8e3103d04cd7eddbbbdf24d3651f8a7e8a8c`) with verdict PASS WITH MINOR FINDINGS; documentation updated for audit closure.
- **Primary branch:** `main` (merge commit `397c5d0376ef37cfd7f7debb93ac3f8387be5fea`).
- **Working branch:** `fix/nmi-cors-idempotency-header` (Draft PR #6).
- **Active task:** `tasks/NMI-CORS-01-idempotency-header.md`.
- **Active handoff:** NMI-CORS-01-REMEDIATION

## Accepted evidence
- **Audit and CI:** C6 exact-head independent source/security audit PASS; Project Baseline CI and Stack CI SUCCESS on PR #4 at `4982201918d0030234fdbabbc297375c02c01e5d`. PR #5 documentation reconciliation CI passed and was squash-merged into main at `397c5d0376ef37cfd7f7debb93ac3f8387be5fea`.
- **AG automated validation:** 235/235 unit and 187/187 PostgreSQL 16 integration tests passed (422 total); lint, formatting, typecheck, build, bundle scan and migrations verified in the accepted phase.
- **Real PayPal Sandbox (AG local provider evidence):** `NMI-P2-I2-SANDBOX-SMOKE-01` on 2026-10-26: real OAuth `200`, exactly one invoice-create `201`, and read-only show `200` (exercised with one fictitious USD 5.00 line item, no tax, no discount); invoice `INV2-U92W-76NX-3P2E-AGUZ` status `DRAFT`, USD 5.00, due 2026-11-30, exact invoice-number/reference and durable PostgreSQL link. No send/reminder/cancel/refund/payment operations. Local default restored: `PAYPAL_DRAFTS_ENABLED=false`. Persistent one-create test guard budget `1/1` exhausted (private local evidence).
- **Provider search, reconciliation and error paths:** **NOT TESTED** against live PayPal Sandbox; search, delayed indexing, timeout, duplicate-number, and fail-closed reconciliation behavior are mock-tested only via deterministic fake transports and PostgreSQL tests.
- **Evidence attribution:** GPT-6 independently reviewed the GitHub source and hosted CI; the real provider and local database responses are from AG's sanitized local execution evidence, not an independent PayPal-account query.
- **Real OpenAI Responses API parsing:** **NOT TESTED** against provider; parser behavior exercised via deterministic fake-model tests.

## Delivered on main
- Single-operator authenticated sessions, rotation protection, rate limits and Origin/CSRF controls.
- Strict invoice parsing/proposal validation with manual-entry fallback; integer-minor-unit totals and per-invoice currency boundaries.
- PostgreSQL transactions, audited invoice draft persistence, seven committed migrations (`0000`–`0006`).
- PayPal Sandbox-only draft-create adapter, explicit authenticated trigger, durable operation fencing, exact remote verification, and fail-closed reconciliation without blind recreates (note: search, reconciliation, timeout and error-path behavior are mock-tested and PostgreSQL-verified only, not verified against genuine PayPal Sandbox responses).
- No business-ready invoice UI; frontend remains a placeholder.

## Deferred / open gates
- Human-approved UI design, browser shell/dashboard, AG Studio licensing and design integration.
- Real OpenAI smoke; PayPal sending/grant issuance, reminder automation, webhook receipt/payment reconciliation, deployment, and production PayPal use.
- Architecture decisions: PostgreSQL-only versus SQLite support, hosting strategy, demo availability through judging.
- Do **not** reuse the completed one-create Sandbox authorization or reset its exhausted budget. New external writes require new owner approval.
- **Operational limitations:** In-memory auth throttling is single-process; approval consumption and audit logging are separate statements; database least-privilege role configuration is a deployment concern. See [security boundaries](SECURITY.md).
- **Active code remediation (NMI-CORS-01):** Resolves the known Codex review finding where CORS `allowedHeaders` in `apps/api/src/app.ts:61–65` omitted `Idempotency-Key`. Implemented on branch `fix/nmi-cors-idempotency-header` and audited by GPT-6 on Draft PR #6 (PASS WITH MINOR FINDINGS at `eb2b8e3103d04cd7eddbbbdf24d3651f8a7e8a8c`):
  1. Added `idempotency-key` to CORS `allowedHeaders` in `apps/api/src/app.ts`.
  2. Added browser-style `OPTIONS` preflight regression tests in `apps/api/src/app.test.ts`.
  3. Verified unapproved origins remain blocked and unlisted headers are not authorized.
  4. Verified session authentication, Origin checks, and CSRF enforcement remain unchanged.
  5. Test counts verified: 236 unit + 187 PostgreSQL = 423 passing tests (historical P2-I2 count of 235 unit / 422 total preserved above).
  6. Test-stability observation: Stack CI attempt 1 had an intermittent 20-second timeout on `apps/api/src/invoice-drafts.pg.test.ts` concurrency test (186/187 database tests passed); attempt 2 passed completely (187/187) on the exact same commit without code changes. Tracked as a test-stability observation; not caused by CORS changes; concurrency assertions preserved.
  7. Draft PR #6 documentation updated to resolve MINOR-1, awaiting final independent verification before owner merge authorization.
- **PR #5:** Squash-merged into main at `397c5d0376ef37cfd7f7debb93ac3f8387be5fea`.
- No deployment, production release or privileged PayPal financial operation authorized.

## Next action
Final independent verification of Draft PR #6 documentation updates for NMI-CORS-01 (`fix/nmi-cors-idempotency-header`). Keep unmerged until owner approval.
