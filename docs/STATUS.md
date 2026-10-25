# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal sandbox hackathon MVP
- **Current phase:** NMI-P2-I1 — authenticated operator and PostgreSQL atomic approval foundation
- **Status:** C3 REMEDIATION IMPLEMENTED — independent audit of `7df7b7a` was FIX REQUIRED (two MEDIUM auth races); Draft PR #3 awaits Codex C3 re-audit of the new head (not self-certified); owner merge approval pending
- **Primary branch:** `main` (`56ca7392c6b7f9f63d0f8fe484bb84835378dc26`)
- **Working branch:** `phase-2/nmi-auth-atomic-approval-i1` (base `main`)
- **Active task:** `tasks/NMI-P2-I1-auth-atomic-approvals.md`
- **Active handoff:** NMI-P2-I1-C3

## Completed
- NMI-P0 PR #1: independently audited PASS; squash merged as `13ad78a`.
- NMI-P1 PR #2: manually validated (91 unit tests, 22 real PostgreSQL tests), independently audited C3 PASS at `60d8dc9`; owner-approved PR-specific CI exception; squash merged as `56ca7392c6b7f9f63d0f8fe484bb84835378dc26`. The PR #2 exception **does not authorize** future PRs.
- Phase 1 foundation is available: Fastify health-only API, React/Vite placeholder, exact-money contracts, OpenAI draft parser behind fake-client tests, fail-closed tool allowlist, PayPal sandbox-only interfaces, approval domain contract, PostgreSQL migrations 0000/0001.
- Owner directed start of Phase 2. Increment 1 is backend-only, so no material UI shell or design-gate bypass is involved.

## Current work
- **Audit history (PR #3):** C2 audit of `7df7b7a` = **FIX REQUIRED** (preserved): (1) a login verified under an old password could create a usable session after password rotation; (2) parallel guesses bypassed login throttling.
- **C3 remediation (implementation SHA `013945b854ca7f4ac4eea44494710466e5b1d2b4`):** `operators.credential_version` (forward migration `0004`; `0000`-`0003` unchanged) with version-proved single-statement session issuance and one-transaction rotation; synchronous atomic two-budget admission (`AttemptLimiter`) plus bounded concurrent hashing (`BoundedWorkGate`) with `429` before any lookup/hashing. The earlier C2 implementation (auth, `PostgresApprovalStore`, audit triggers) is otherwise unchanged. The earlier C2 evidence does not transfer to this SHA.
- **Evidence (manual CI at `013945b`, PostgreSQL 16.15, pnpm 10.28.0, clean frozen install):** 140 tests without a database + 108 against real PostgreSQL (31 constraints, 19 approval store, 25 auth, 16 auth-store race, 17 login-race) = 248 passing; `pnpm test:db` 108/108 over five PG suites; lint, format, typecheck, build, bundle scan, `pnpm audit --prod --audit-level high`, migration sync all pass; the store race suite ran 20 consecutive times and the login-race suite with it 10 more times, no failures. Mutation controls: every deliberate re-introduction of a defect failed tests, except one equivalent mutant (see handoff). `0004` was also applied on top of a database holding an existing operator and session (data preserved).
- **Still not true / not built:** no route issues or consumes approvals (no grant issuer); no PayPal write; no UI; throttling is in-memory per process; consume and audit are separate statements; the audit-log role separation (INSERT/SELECT-only app role) is a deployment task; the Postgres-only vs SQLite decision remains with the owner.

## CI and review
- Owner reported GitHub-hosted Actions unavailable until November 2026, but runs executed for this PR's head; record hosted results only for SHAs where they actually ran, and never claim PASS for unrun checks.
- Manual CI for each new implementation HEAD: pinned pnpm 10.28.0 frozen install; project-profile validation; lint, format, typecheck, tests; disposable PostgreSQL 16 `nmi_test*` integration/concurrency tests; build; bundle scan; production dependency audit; migration sync; whitespace checks. Record counts and exact SHA.
- Independent Codex exact-head security/concurrency audit required. Do not merge or deploy without separate owner approval.

## Pending decisions and exclusions
- PostgreSQL adapter is required for P2-I1; the broader **Postgres-only versus SQLite dual-dialect** development policy still awaits an owner decision. Do not silently promise SQLite parity.
- Material screen direction `design/nmi-p1/SCREENS.md` and AG Studio licence/judging-period access remain pending. **No UI shell yet.**
- Real OpenAI smoke tests and PayPal sandbox draft/send, signature-verified webhooks and deployment belong to separate gated increments; none authorized by P2-I1.
- Approval contract alone does not make financial execution safe. No live PayPal, refunds, production funds or autonomous sending.
