# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed hackathon sandbox MVP
- **Current phase:** NMI-P1 — application foundation (reconciled onto `main`)
- **Status:** Review — Draft PR #2 reconciled onto post-squash `main`; independent re-verification of the new head pending
- **Primary branch:** `main` (`13ad78a463dbe72663d4ed78fd52502ae8bb216f`, NMI-P0 squash merge of PR #1)
- **Working branch:** `phase-1/nmi-app-foundation` → PR #2 (Draft, base `main`)
- **Active task:** `tasks/NMI-P1-foundation.md`
- **Active handoff:** NMI-P1-C3

## Completed
- **NMI-P0 complete:** PR #1 squash-merged into `main` as `13ad78a`; the squashed tree equals the original Phase 0 head `a711673` (tree `a93a422`). OpenAI (official `openai` SDK, Responses API, `OPENAI_MODEL`/`OPENAI_API_KEY`) is the only AI provider.
- **NMI-P1 foundation implemented** (workspace, `GET /health`, exact-money Zod contracts, OpenAI parser with fake-client tests, approval gate and tool allowlist, PayPal sandbox interfaces, Postgres schema and migrations `0000`/`0001`, stack CI, draft screen designs).
- **Independent audit history (original evidence, preserved):** `393052a` = PARTIAL (4 findings) → remediated in C2 → independent exact-head audit of **`d48144931e91f5ff486abe2f441a845e658fda51` = PASS**. That PASS applies to `d481449` only. Recovery references: branch `backup/phase-1-d481449` and tag `recovery/nmi-p1-d481449`.
- **C3 reconciliation:** because PR #1 was squash-merged, the Phase 1 branch was rebuilt on `main` by cherry-picking the four non-merge Phase 1 commits (the historical merge of Phase 0 was not replayed). The resulting tree is byte-identical to the audited `d481449` tree (`6f58e00…`), and the diff against `main` equals the original Phase 1 delta `a711673..d481449` (72 files). The new commit SHAs are NOT covered by the earlier PASS; a fresh independent verification is required.

## Hosted CI availability and manual validation
- Owner-reported limitation: GitHub-hosted Actions may be unavailable until November 2026. Under `docs/REPOSITORY-SETUP.md` (CI availability exception) and `docs/TESTING.md`, a check that did not execute is **NOT PASS**.
- For every new commit, hosted `Project baseline / Common validation` and `Stack validation` are recorded only if they actually ran. Otherwise the equivalent local validation below is recorded, and merge needs an explicit owner decision to use the exception.
- Required manual set (pinned `pnpm@10.28.0`, `pnpm install --frozen-lockfile`): profile validator; `pnpm lint`; `pnpm format:check`; `pnpm typecheck`; `pnpm test`; `pnpm test:db` against a disposable `nmi_test` PostgreSQL 16 database; `pnpm build`; `pnpm check:bundle`; `pnpm audit --prod --audit-level high`; `pnpm db:generate` followed by a clean `git status --porcelain packages/db/migrations`; `git diff --check`.
- Results for `65699fc` are in handoff `NMI-P1-C3`.

## Next actions
1. Independent exact-head verification of the reconciled PR #2 head (see `NMI-P1-C3`). Owner decides on the CI-unavailable exception if hosted CI cannot run.
2. Owner: approve `design/nmi-p1/SCREENS.md`, decide Postgres-only vs SQLite, confirm AG Studio licence/trial coverage through Dec 15. No UI shell before design approval.
3. **Phase 2 (pending, not started):** authentication/sessions producing `TrustedActor`; PostgreSQL-backed `ApprovalStore` passing the store contract tests against a real database; audit log; then PayPal sandbox draft/send behind the approval gate.
4. Obtain PayPal sandbox and OpenAI keys locally or in secret storage (never in the repository); run separate owner-triggered smoke tests.

## Known limitations
- Approval consume-once atomicity under real concurrency is NOT proven; only the in-memory reference store is tested. Needs the PostgreSQL adapter plus contract tests. No authentication exists, so `TrustedActor` is test-constructed only.
- No invoice UI, live demo, real OpenAI call or verified PayPal sandbox event yet; no auth/session, so no parse endpoint is exposed.
- Render deployment, webhook processing and real integration smoke tests remain future tasks.
- This work neither authorizes production deployment nor any PayPal live transaction.
- **Judging-period blocker to resolve:** AG Studio 45-day trial duration and Render Free Postgres 30-day expiry may end before Dec 15; plan sustainable demo access or tested local setup.
