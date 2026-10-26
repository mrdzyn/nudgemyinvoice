# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-P2-I2 — **OWNER ACCEPTED AND SQUASH-MERGED** on 2026-10-26.
- **Status:** Backend invoice proposal, authenticated PostgreSQL invoice drafts and explicit PayPal Sandbox DRAFT creation accepted within defined scope. Independent exact-HEAD C6 audit **PASS (scoped)** at `4982201918d0030234fdbabbc297375c02c01e5d`; owner acceptance [PR #4 comment](https://github.com/mrdzyn/nudgemyinvoice/pull/4#issuecomment-6416498360); GitHub squash merge `07409bf32068362b9f5b711b64ef0399d588169e`.
- **Primary branch:** `main` (merge commit `07409bf32068362b9f5b711b64ef0399d588169e`).
- **Working branch:** `docs/paypal-sandbox-app-name` (Draft PR #5, documentation reconciliation; **not merged**).
- **Active task:** `tasks/NMI-P2-I2-invoice-draft-flow.md` (completed; next increment not yet owner-activated).
- **Active handoff:** NMI-P2-I2-ACCEPTANCE

## Accepted evidence
- **Audit and CI:** C6 exact-head independent source/security audit PASS; Project Baseline CI and Stack CI SUCCESS on PR #4 at `4982201918d0030234fdbabbc297375c02c01e5d`. PR #5 has its own exact-HEAD CI checks on GitHub.
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
- **Operational limitations:** In-memory auth throttling is single-process; approval consumption and audit logging are separate statements; database least-privilege role configuration is a deployment concern. See [security boundaries](docs/SECURITY.md#runtime-boundaries).
- **Open code remediation (known review finding):** Codex review on PR #4 identified that CORS `allowedHeaders` in `apps/api/src/app.ts:61–65` omits `Idempotency-Key` (though invoice save supports that header). It has no effect today because the web app is a placeholder and Vite proxies only `/health`, but it will block cross-origin browser callers sending an idempotency key. This code remediation is deferred from this docs-only PR to a proposed bounded follow-up task before cross-origin browser invoice-save integration:
  1. Add `Idempotency-Key` to CORS `allowedHeaders` in `apps/api/src/app.ts`.
  2. Add browser-style `OPTIONS` preflight regression test in `apps/api/src/app.test.ts`.
  3. Verify unapproved origins remain blocked.
  4. Verify session, Origin, and CSRF checks remain unchanged.
  5. Independent review before merge.
- **Draft PR #5:** docs-only synchronization now awaiting independent review and later separate merge approval. Required CI applies to PR #5's own HEAD; prior PR #4 PASS is not automatically transferable.
- No deployment, production release or privileged PayPal financial operation authorized.

## Next action
Independently review Draft PR #5 for documentation accuracy, privacy, status consistency, and exact-HEAD CI. Keep it unmerged until separate owner approval. Do not activate a new implementation phase without owner direction.
