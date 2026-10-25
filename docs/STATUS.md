# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal sandbox hackathon MVP
- **Current phase:** NMI-P2-I2 — authenticated AI drafts, PostgreSQL persistence and sandbox PayPal draft creation
- **Status:** C4 REMEDIATION IMPLEMENTED — independent audit of `355bf6a` (C3) was FIX REQUIRED on pagination pseudo-identifiers poisoning recovery (MEDIUM-1) and due-date validation blocking reconciliation of already-attempted drafts (MEDIUM-2). Remediated with typed fail-closed search outcome (`search_incomplete`) without synthetic IDs, permitting existing unknown/creating drafts to reconcile against persisted original intent after due date (while rejecting expired due dates for new creations), service comment updates, and deterministic regressions; Draft PR #4 awaits independent ChatGPT GPT-6 audit (not self-certified); owner merge approval pending. Real OpenAI and PayPal sandbox smokes: **NOT TESTED**.
- **Primary branch:** `main` (`9ebc1912e96b158b906b849cf1dc2b48cbf3c875`, PR #3 squash merge)
- **Working branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR, base `main`)
- **Active task:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **Active handoff:** NMI-P2-I2-C4

## Completed
- Phase 0 PR #1 squash merged at `13ad78a`, Phase 1 PR #2 at `56ca739`.
- NMI-P2-I1 PR #3: independent exact-head Codex C3 **PASS** at `923bb906d0a2ec1ee56cf013eacae622199b89ae`; both hosted checks PASS on that HEAD, manual suite 248 PASS including 108 PostgreSQL tests. Owner-approved squash merged into `main` as `9ebc1912e96b158b906b849cf1dc2b48cbf3c875`.
- Existing foundation: authenticated single-operator sessions, CSRF/Origin checks, concurrent-login throttle and password-rotation protection, PostgreSQL atomic `ApprovalStore`, audit triggers, OpenAI parser + fake-model tests, sandbox-only PayPal interfaces, exact money and migrations `0000` through `0004`.

## Current work
- **Audit history (PR #4):**
  - C2 audit of `42c0f4f` = **FIX REQUIRED** (ChatGPT): ambiguous PayPal draft creation outcome risked a duplicate remote create when search returned empty after 300s cool-off (empty search does not prove remote absence due to delayed search indexing); malformed `{}` search response was indistinguishable from empty search; unbound idempotency retention.
  - C3 audit of `355bf6a` = **FIX REQUIRED** (ChatGPT, [issue comment 6394882096](https://github.com/mrdzyn/nudgemyinvoice/pull/4#issuecomment-6394882096)): C2 blocker confirmed resolved; two blocking MEDIUM findings: (1) pagination sentinel became a fake invoice ID when page 1 had no matching item, poisoning recovery; (2) due-date validation against `today` rejected subsequent reconciliation of drafts whose due date passed during ambiguous create.
- **C4 remediation:**
  1. **Typed fail-closed search outcome:** Removed all synthetic sentinel strings (`"ambiguous_more_remote_pages"`) from `findInvoiceIdsByNumber`. Incomplete or multi-page search (`total_pages > 1` or `total_items > items.length`) throws typed `PayPalOutcomeUnknownError("search_incomplete")`. No invented ID is ever returned or saved in the database, preserving clean recoverable state without manual DB intervention.
  2. **Permit reconciliation of existing attempts after due date:** Applied `assertExactMapping(saved.draft, today)` to new create attempts only. Existing `unknown`/`creating` operations reconcile against their persisted original intent (`originalInvoiceDate`), permitting delayed verification of remote drafts created before midnight while double-guarding against fresh PayPal creations with past due dates.
  3. **Documentation consistency:** Updated `tasks/NMI-P2-I2-invoice-draft-flow.md` metadata (Antigravity and ChatGPT GPT-6) and corrected `paypal-draft-service.ts` comment to reflect fail-closed reconciliation without automatic re-create.
- **Evidence (manual CI, PostgreSQL 16.15, pnpm 10.28.0, clean frozen install):** 235 tests without a database + 180 against real PostgreSQL (37 constraints, 19 approval store, 25 auth, 16 auth-store races, 17 login races, 11 draft store, 9 operation store, 46 draft/PayPal routes; `packages/paypal` 86 tests) = 415 passing; `pnpm test:db` 180/180 over eight PG suites; lint, format:check, typecheck, build, bundle scan, `python3 scripts/validate_project_profile.py` (24 files), `pnpm audit --prod --audit-level high`, migration sync all pass. Deterministic regressions added for incomplete first-page search (asserts no fake ID saved, no 2nd create, successful recovery) and due date crossing midnight (asserts new create rejected, existing draft verified and locally linked without 2nd create).
- **Still not built:** PayPal send/reminder/cancel/refund/capture, webhooks, grant issuer/approval route, invoice UI, AG Studio, deployment.

## Gates / limitations
- CI status applies only to the SHA that executed the check. No prior owner CI exception carries forward. Run targeted security/payment tests, real PostgreSQL 16 integration, standard CI/manual validations and independent Codex exact-head audit.
- In-memory auth throttling remains single-process; approval consumption and audit are separate statements; DB app-role grant enforcement is for deployment. Do not claim production readiness.
- **UI design gate remains unapproved:** `design/nmi-p1/SCREENS.md` draft only. No full UI or AG Studio dependency in P2-I2.
- PayPal sandbox credentials and OpenAI key are not committed. Genuine provider smoke tests are **NOT TESTED** unless owner supplies env secrets locally and authorizes them.
- Open architecture/product decisions: PostgreSQL-only vs adding SQLite support; AG Studio trial/licensing through judging; future hosting/Render availability. The task uses the existing PostgreSQL runtime without resolving those independent product choices.
- No merge, deployment, release, webhook processing, sending, reminders, refund, cancellation, capture or live payment authorized.
