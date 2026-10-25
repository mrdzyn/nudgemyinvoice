# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal sandbox hackathon MVP
- **Current phase:** NMI-P2-I2 — authenticated AI drafts, PostgreSQL persistence and sandbox PayPal draft creation
- **Status:** OWNER-DIRECTED START; docs-only task bootstrap. Implementation and independent audit **NOT STARTED**.
- **Primary branch:** `main` (`9ebc1912e96b158b906b849cf1dc2b48cbf3c875`, PR #3 squash merge)
- **Working branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR, base `main`)
- **Active task:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **Active handoff:** NMI-P2-I2-C1

## Completed
- Phase 0 PR #1 squash merged at `13ad78a`, Phase 1 PR #2 at `56ca739`.
- NMI-P2-I1 PR #3: independent exact-head Codex C3 **PASS** at `923bb906d0a2ec1ee56cf013eacae622199b89ae`; both hosted checks PASS on that HEAD, manual suite 248 PASS including 108 PostgreSQL tests. Owner-approved squash merged into `main` as `9ebc1912e96b158b906b849cf1dc2b48cbf3c875`.
- Existing foundation: authenticated single-operator sessions, CSRF/Origin checks, concurrent-login throttle and password-rotation protection, PostgreSQL atomic `ApprovalStore`, audit triggers, OpenAI parser + fake-model tests, sandbox-only PayPal interfaces, exact money and migrations `0000` through `0004`.

## Current work
- NMI-P2-I2 kickoff is **documentation only**: define bounded backend authenticated parse → manual review/save → persistent local draft → explicit PayPal sandbox draft flow. No real OpenAI or PayPal calls executed yet.
- Create real API/persistence/sandbox adapter implementation and reproducible tests on this branch; do not activate send, notify or grant execution.
- The PayPal API supports sandbox invoice draft creation separately from sending. Customer notification requires a distinct later send action and is forbidden in this increment.

## Gates / limitations
- CI status applies only to the SHA that executed the check. No prior owner CI exception carries forward. Run targeted security/payment tests, real PostgreSQL 16 integration, standard CI/manual validations and independent Codex exact-head audit.
- In-memory auth throttling remains single-process; approval consumption and audit are separate statements; DB app-role grant enforcement is for deployment. Do not claim production readiness.
- **UI design gate remains unapproved:** `design/nmi-p1/SCREENS.md` draft only. No full UI or AG Studio dependency in P2-I2.
- PayPal sandbox credentials and OpenAI key are not committed. Genuine provider smoke tests are **NOT TESTED** unless owner supplies env secrets locally and authorizes them.
- Open architecture/product decisions: PostgreSQL-only vs adding SQLite support; AG Studio trial/licensing through judging; future hosting/Render availability. The task uses the existing PostgreSQL runtime without resolving those independent product choices.
- No merge, deployment, release, webhook processing, sending, reminders, refund, cancellation, capture or live payment authorized.
