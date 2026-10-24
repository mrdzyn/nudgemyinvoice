# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal sandbox hackathon MVP
- **Current phase:** NMI-P2-I1 — authenticated operator and PostgreSQL atomic approval foundation
- **Status:** AUTHORIZED / TASK BOOTSTRAPPED — code implementation not yet started; Draft PR for Claude implementation and independent Codex audit
- **Primary branch:** `main` (`56ca7392c6b7f9f63d0f8fe484bb84835378dc26`)
- **Working branch:** `phase-2/nmi-auth-atomic-approval-i1` (base `main`)
- **Active task:** `tasks/NMI-P2-I1-auth-atomic-approvals.md`
- **Active handoff:** NMI-P2-I1-C1

## Completed
- NMI-P0 PR #1: independently audited PASS; squash merged as `13ad78a`.
- NMI-P1 PR #2: manually validated (91 unit tests, 22 real PostgreSQL tests), independently audited C3 PASS at `60d8dc9`; owner-approved PR-specific CI exception; squash merged as `56ca7392c6b7f9f63d0f8fe484bb84835378dc26`. The PR #2 exception **does not authorize** future PRs.
- Phase 1 foundation is available: Fastify health-only API, React/Vite placeholder, exact-money contracts, OpenAI draft parser behind fake-client tests, fail-closed tool allowlist, PayPal sandbox-only interfaces, approval domain contract, PostgreSQL migrations 0000/0001.
- Owner directed start of Phase 2. Increment 1 is backend-only, so no material UI shell or design-gate bypass is involved.

## Current work
- NMI-P2-I1 task/branch/Draft PR preparation is docs-only. **No authentication, database approval adapter, or audit instrumentation is implemented yet.**
- Build authenticated operator session boundary, PostgreSQL `ApprovalStore.consumeIfMatches` with real concurrency tests, and minimal audit trail. Keep PayPal writes disabled.
- Read only the active task and relevant source/tests. Follow `AGENTS.md` and `docs/TESTING.md`.

## CI and review
- Owner reports GitHub-hosted Actions unavailable until November 2026. Do not claim hosted CI PASS for unrun checks.
- Manual CI for each new implementation HEAD: pinned pnpm 10.28.0 frozen install; project-profile validation; lint, format, typecheck, tests; disposable PostgreSQL 16 `nmi_test*` integration/concurrency tests; build; bundle scan; production dependency audit; migration sync; whitespace checks. Record counts and exact SHA.
- Independent Codex exact-head security/concurrency audit required. Do not merge or deploy without separate owner approval.

## Pending decisions and exclusions
- PostgreSQL adapter is required for P2-I1; the broader **Postgres-only versus SQLite dual-dialect** development policy still awaits an owner decision. Do not silently promise SQLite parity.
- Material screen direction `design/nmi-p1/SCREENS.md` and AG Studio licence/judging-period access remain pending. **No UI shell yet.**
- Real OpenAI smoke tests and PayPal sandbox draft/send, signature-verified webhooks and deployment belong to separate gated increments; none authorized by P2-I1.
- Approval contract alone does not make financial execution safe. No live PayPal, refunds, production funds or autonomous sending.
