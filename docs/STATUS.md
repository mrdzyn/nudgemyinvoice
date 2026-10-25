# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal sandbox hackathon MVP
- **Current phase:** NMI-P2-I2 — authenticated AI drafts, PostgreSQL persistence and sandbox PayPal draft creation
- **Status:** IMPLEMENTED — Draft PR #4 ready for independent Codex exact-head security/payment/idempotency audit (not self-certified); owner merge approval pending. Real OpenAI and PayPal sandbox smokes: **NOT TESTED**.
- **Primary branch:** `main` (`9ebc1912e96b158b906b849cf1dc2b48cbf3c875`, PR #3 squash merge)
- **Working branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR, base `main`)
- **Active task:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **Active handoff:** NMI-P2-I2-C2

## Completed
- Phase 0 PR #1 squash merged at `13ad78a`, Phase 1 PR #2 at `56ca739`.
- NMI-P2-I1 PR #3: independent exact-head Codex C3 **PASS** at `923bb906d0a2ec1ee56cf013eacae622199b89ae`; both hosted checks PASS on that HEAD, manual suite 248 PASS including 108 PostgreSQL tests. Owner-approved squash merged into `main` as `9ebc1912e96b158b906b849cf1dc2b48cbf3c875`.
- Existing foundation: authenticated single-operator sessions, CSRF/Origin checks, concurrent-login throttle and password-rotation protection, PostgreSQL atomic `ApprovalStore`, audit triggers, OpenAI parser + fake-model tests, sandbox-only PayPal interfaces, exact money and migrations `0000` through `0004`.

## Current work
- **Implemented (backend only):** authenticated AI parse (advisory; manual fallback; cost bounded) -> strict exact draft persistence in PostgreSQL (idempotent retries, audit in the same transaction) -> explicit PayPal **sandbox draft** creation with a durable fenced operation state machine, reconcile-before-retry, deterministic remote `invoice_number`/`reference` and verified remote total. Endpoints: `POST /api/invoice-drafts/parse`, `POST /api/invoice-drafts`, `GET /api/invoice-drafts/:id`, `POST /api/invoice-drafts/:id/paypal-draft`. Migration `0005` (forward only; `0000`-`0004` byte-identical to `main`).
- **Evidence (manual CI at implementation SHA `33d917bac9b2082ea66d3179e44debd143dcbdc5`, PostgreSQL 16.15, pnpm 10.28.0, clean frozen install):** 235 tests without a database + 176 against real PostgreSQL = 411 passing (PG suites: 37 constraints, 19 approval store, 25 auth, 16 auth-store races, 17 login races, 11 draft store, 9 operation store, 42 draft/PayPal routes; `packages/paypal` 86 incl. allowlist, OAuth, mapping). Lint, format, typecheck, build, bundle scan, `pnpm audit --prod --audit-level high`, migration sync all pass; the route suite ran repeatedly without failure; 11 deliberate mutations (no claim barrier, ignored remote verification, no reconcile, ignored cool-off, removed mapping guard, unenforced intent audit, ignored feature flag, removed parse budget and in-flight cap, allowlist admitting `/send`, unfenced `markCreated`) each failed tests. Migration `0005` was applied on top of a database holding a legacy invoice.
- **Findings to carry forward:** PayPal documents `PayPal-Request-Id` only for other Invoicing endpoints, not create-invoice, so it is sent but not relied on; mappings whose totals depend on rounding are refused (owner may relax after a live smoke); several PayPal request/response shapes are unverified until a live sandbox smoke (listed in `docs/SECURITY.md`).
- **Still not built:** PayPal send/reminder/cancel/refund/capture, webhooks, grant issuer/approval route, invoice UI, AG Studio, deployment.

## Gates / limitations
- CI status applies only to the SHA that executed the check. No prior owner CI exception carries forward. Run targeted security/payment tests, real PostgreSQL 16 integration, standard CI/manual validations and independent Codex exact-head audit.
- In-memory auth throttling remains single-process; approval consumption and audit are separate statements; DB app-role grant enforcement is for deployment. Do not claim production readiness.
- **UI design gate remains unapproved:** `design/nmi-p1/SCREENS.md` draft only. No full UI or AG Studio dependency in P2-I2.
- PayPal sandbox credentials and OpenAI key are not committed. Genuine provider smoke tests are **NOT TESTED** unless owner supplies env secrets locally and authorizes them.
- Open architecture/product decisions: PostgreSQL-only vs adding SQLite support; AG Studio trial/licensing through judging; future hosting/Render availability. The task uses the existing PostgreSQL runtime without resolving those independent product choices.
- No merge, deployment, release, webhook processing, sending, reminders, refund, cancellation, capture or live payment authorized.
