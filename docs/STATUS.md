# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal sandbox hackathon MVP
- **Current phase:** NMI-P2-I2 — authenticated AI drafts, PostgreSQL persistence and sandbox PayPal draft creation
- **Status:** C5 REMEDIATION IMPLEMENTED — independent audit of `7f871c5` (C4) was FIX REQUIRED on residual midnight-boundary invoice_date reconstruction (MEDIUM). Remediated by persisting exact initial request `invoice_date` in `paypal_draft_operations` (forward migration `0006`), reusing canonical `invoice_date` during reconciliation, single clock sampling per request, updating `docs/SECURITY.md` to reflect fail-closed reconciliation, and adding deterministic regressions for `created_at` divergence and clock sampling drift; Draft PR #4 awaits independent ChatGPT GPT-6 audit (not self-certified); owner merge approval pending. Real OpenAI and PayPal sandbox smokes: **NOT TESTED**.
- **Primary branch:** `main` (`9ebc1912e96b158b906b849cf1dc2b48cbf3c875`, PR #3 squash merge)
- **Working branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR, base `main`)
- **Active task:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **Active handoff:** NMI-P2-I2-C5

## Completed
- Phase 0 PR #1 squash merged at `13ad78a`, Phase 1 PR #2 at `56ca739`.
- NMI-P2-I1 PR #3: independent exact-head Codex C3 **PASS** at `923bb906d0a2ec1ee56cf013eacae622199b89ae`; both hosted checks PASS on that HEAD, manual suite 248 PASS including 108 PostgreSQL tests. Owner-approved squash merged into `main` as `9ebc1912e96b158b906b849cf1dc2b48cbf3c875`.
- Existing foundation: authenticated single-operator sessions, CSRF/Origin checks, concurrent-login throttle and password-rotation protection, PostgreSQL atomic `ApprovalStore`, audit triggers, OpenAI parser + fake-model tests, sandbox-only PayPal interfaces, exact money and migrations `0000` through `0004`.

## Current work
- **Audit history (PR #4):**
  - C2 audit of `42c0f4f` = **FIX REQUIRED** (ChatGPT): ambiguous PayPal draft creation outcome risked a duplicate remote create when search returned empty after 300s cool-off (empty search does not prove remote absence due to delayed search indexing); malformed `{}` search response was indistinguishable from empty search; unbound idempotency retention.
  - C3 audit of `355bf6a` = **FIX REQUIRED** (ChatGPT, [issue comment 6394882096](https://github.com/mrdzyn/nudgemyinvoice/pull/4#issuecomment-6394882096)): C2 blocker confirmed resolved; two blocking MEDIUM findings: (1) pagination sentinel became a fake invoice ID when page 1 had no matching item, poisoning recovery; (2) due-date validation against `today` rejected subsequent reconciliation of drafts whose due date passed during ambiguous create.
  - C4 audit of `7f871c5` = **FIX REQUIRED** (ChatGPT, [issue comment 6399106857](https://github.com/mrdzyn/nudgemyinvoice/pull/4#issuecomment-6399106857)): C3 MEDIUM-1 (pagination) confirmed resolved; C3 MEDIUM-2 main path resolved, but residual MEDIUM on midnight race: initial request body `invoice_date` sampled `deps.clock()` before row reservation, while PostgreSQL independently generated `created_at`; a midnight boundary straddle could stamp `created_at` on D+1, causing retry on D+1 to fail `assertExactMapping` before reconciliation. Outdated duplicate-create description in `docs/SECURITY.md`.
- **C5 remediation:**
  1. **Persist exact canonical `invoice_date`:** Added `invoice_date` column and format check constraint to `paypal_draft_operations` via forward migration `0006_known_colleen_wing.sql` (migrations `0000`-`0005` kept byte-identical). Initial request stores exact outbound `invoice_date`.
  2. **Reconstruct from persisted operation:** Subsequent reconciliation requests reuse `existingOp.invoiceDate` as the single canonical source of truth, completely eliminating reliance on database `created_at` timestamps or subsequent `deps.clock()` sampling.
  3. **Single clock capture per request:** Captured `deps.clock()` once per request at start, avoiding clock sampling drift across UTC midnight during request processing.
  4. **Security documentation corrected:** Updated `docs/SECURITY.md` to remove outdated cool-off re-create text, accurately documenting at-most-one draft creation, scoped local fencing, and fail-closed reconciliation.
- **Evidence (manual CI, PostgreSQL 16.15, pnpm 10.28.0, clean frozen install):** 235 tests without a database + 182 against real PostgreSQL (37 constraints, 19 approval store, 25 auth, 16 auth-store races, 17 login races, 11 draft store, 9 operation store, 48 draft/PayPal routes; `packages/paypal` 86 tests) = 417 passing; `pnpm test:db` 182/182 over eight PG suites; lint, format:check, typecheck, build, bundle scan, `python3 scripts/validate_project_profile.py` (24 files), `pnpm audit --prod --audit-level high`, migration sync all pass. Deterministic regressions added for DB `created_at` drift across midnight (asserts no pre-reconciliation refusal, exact canonical date preserved, 1 create call, successful link) and fresh create clock sampling drift.
- **Still not built:** PayPal send/reminder/cancel/refund/capture, webhooks, grant issuer/approval route, invoice UI, AG Studio, deployment.

## Gates / limitations
- CI status applies only to the SHA that executed the check. No prior owner CI exception carries forward. Run targeted security/payment tests, real PostgreSQL 16 integration, standard CI/manual validations and independent Codex exact-head audit.
- In-memory auth throttling remains single-process; approval consumption and audit are separate statements; DB app-role grant enforcement is for deployment. Do not claim production readiness.
- **UI design gate remains unapproved:** `design/nmi-p1/SCREENS.md` draft only. No full UI or AG Studio dependency in P2-I2.
- PayPal sandbox credentials and OpenAI key are not committed. Genuine provider smoke tests are **NOT TESTED** unless owner supplies env secrets locally and authorizes them.
- Open architecture/product decisions: PostgreSQL-only vs adding SQLite support; AG Studio trial/licensing through judging; future hosting/Render availability. The task uses the existing PostgreSQL runtime without resolving those independent product choices.
- No merge, deployment, release, webhook processing, sending, reminders, refund, cancellation, capture or live payment authorized.
