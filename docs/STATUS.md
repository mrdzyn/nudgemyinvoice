# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal sandbox hackathon MVP
- **Current phase:** NMI-P2-I2 — authenticated AI drafts, PostgreSQL persistence and sandbox PayPal draft creation
- **Status:** C3 REMEDIATION IMPLEMENTED — independent audit of `42c0f4f` was FIX REQUIRED (duplicate PayPal draft risk on empty search fall-through). Remediated with fail-closed reconciliation, hardened search parsing, stable invoice date, and idempotency retention boundary; Draft PR #4 awaits independent ChatGPT GPT-6 audit (not self-certified); owner merge approval pending. Real OpenAI and PayPal sandbox smokes: **NOT TESTED**.
- **Primary branch:** `main` (`9ebc1912e96b158b906b849cf1dc2b48cbf3c875`, PR #3 squash merge)
- **Working branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR, base `main`)
- **Active task:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **Active handoff:** NMI-P2-I2-C3

## Completed
- Phase 0 PR #1 squash merged at `13ad78a`, Phase 1 PR #2 at `56ca739`.
- NMI-P2-I1 PR #3: independent exact-head Codex C3 **PASS** at `923bb906d0a2ec1ee56cf013eacae622199b89ae`; both hosted checks PASS on that HEAD, manual suite 248 PASS including 108 PostgreSQL tests. Owner-approved squash merged into `main` as `9ebc1912e96b158b906b849cf1dc2b48cbf3c875`.
- Existing foundation: authenticated single-operator sessions, CSRF/Origin checks, concurrent-login throttle and password-rotation protection, PostgreSQL atomic `ApprovalStore`, audit triggers, OpenAI parser + fake-model tests, sandbox-only PayPal interfaces, exact money and migrations `0000` through `0004`.

## Current work
- **Audit history (PR #4):** C2 audit of `42c0f4f` = **FIX REQUIRED** (ChatGPT): ambiguous PayPal draft creation outcome risked a duplicate remote create when search returned empty after 300s cool-off (empty search does not prove remote absence due to delayed search indexing); malformed `{}` search response was indistinguishable from empty search; unbound idempotency retention.
- **C3 remediation:** (1) Fail closed on uncertain outcomes: in `claim.mode === "reconcile"`, an empty search never falls through to create, returning `reconciliation_pending`; (2) Idempotency retention boundary: attempts older than 45 days fail closed as `idempotency_expired`; (3) Hardened search parsing: strict validation requires `items` array or `total_items = 0`; `{}` or inconsistent shapes throw `response_unparseable` (remains `unknown`); pagination (>1 page / `total_items > items.length`) returns multiple IDs (`ambiguous_remote`); (4) Stable `invoiceDate`: uses immutable creation date (`saved.createdAt` / `existingOp.createdAt`) across replays to prevent body drift, and enforces `payloadDigest` match against reserved operations.
- **Evidence (manual CI, PostgreSQL 16.15, pnpm 10.28.0, clean frozen install):** 235 tests without a database + 178 against real PostgreSQL (37 constraints, 19 approval store, 25 auth, 16 auth-store races, 17 login races, 11 draft store, 9 operation store, 44 draft/PayPal routes; `packages/paypal` 86 tests) = 413 passing; `pnpm test:db` 178/178 over eight PG suites; lint, format:check, typecheck, build, bundle scan, `python3 scripts/validate_project_profile.py` (24 files), `pnpm audit --prod --audit-level high`, migration sync all pass. Regression tests added for create timeout with empty search beyond 300s (asserts no second create), delayed visibility resolution, idempotency retention expiry, payload digest mismatch, and malformed/paginated search responses.
- **Still not built:** PayPal send/reminder/cancel/refund/capture, webhooks, grant issuer/approval route, invoice UI, AG Studio, deployment.

## Gates / limitations
- CI status applies only to the SHA that executed the check. No prior owner CI exception carries forward. Run targeted security/payment tests, real PostgreSQL 16 integration, standard CI/manual validations and independent Codex exact-head audit.
- In-memory auth throttling remains single-process; approval consumption and audit are separate statements; DB app-role grant enforcement is for deployment. Do not claim production readiness.
- **UI design gate remains unapproved:** `design/nmi-p1/SCREENS.md` draft only. No full UI or AG Studio dependency in P2-I2.
- PayPal sandbox credentials and OpenAI key are not committed. Genuine provider smoke tests are **NOT TESTED** unless owner supplies env secrets locally and authorizes them.
- Open architecture/product decisions: PostgreSQL-only vs adding SQLite support; AG Studio trial/licensing through judging; future hosting/Render availability. The task uses the existing PostgreSQL runtime without resolving those independent product choices.
- No merge, deployment, release, webhook processing, sending, reminders, refund, cancellation, capture or live payment authorized.
