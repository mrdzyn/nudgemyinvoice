# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed hackathon sandbox MVP
- **Current phase:** NMI-P1 — application foundation (stacked on NMI-P0)
- **Status:** Review — Draft PR #1 ready for independent exact-head audit (AI provider migrated to OpenAI); owner merge approval pending
- **Primary branch:** `main`
- **Working branch:** `phase-1/nmi-app-foundation` (depends on PR #1 / `phase-0/nmi-bootstrap-pruning`)
- **Active task:** `tasks/NMI-P1-foundation.md`
- **Active handoff:** NMI-P1-C2

## Completed
- Owner decision: OpenAI (official `openai` SDK, Responses API, `OPENAI_MODEL`/`OPENAI_API_KEY`) replaces the Anthropic plan; no second provider in the MVP.
- Validation at `658b948`: `validate_project_profile.py` PASS (24 files); `git diff --check` clean; hosted `Project baseline / Common validation` success (read via REST; `gh pr checks` is unavailable here because it needs GraphQL). Re-verify at the final head.
- Created public project repository from `mrdzyn/ai-native-project-template`.
- Prepared project-specific product, architecture, security, release, tests, AGENTS, README, license, environment example, and ~55-hour plan.
- Selected only web design capability; pruned master-only and unused optional packs on this branch.

- NMI-P1 foundation implemented: workspace, `GET /health`, exact-money Zod contracts, OpenAI parser (fake-client tests only), approval gate + tool allowlist, PayPal sandbox interfaces, Postgres schema/migration, stack CI.

- C2 remediation of independent audit (PARTIAL at `393052a`): approval contract now requires a trusted actor and an atomic `consumeIfMatches`; PostgreSQL CHECK constraints (migration `0001`) verified against a real disposable PostgreSQL 16; negative tests expanded; parser validates the reference date. Independent re-audit pending; not self-certified.

## Next actions
0. Owner: approve `design/nmi-p1/SCREENS.md`, decide Postgres-only vs SQLite, confirm AG Studio licence. No UI shell before design approval.
1. Verify exact branch tree against canonical `docs/REPOSITORY-SETUP.md` greenfield checklist and run `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice`.
2. Verify real child PR emits `Project baseline / Common validation`; investigate hosted CI availability separately and never mark blocked CI as PASS.
3. Obtain independent exact-head audit and owner approval before merge.
4. Approve screen map/mockup for NMI-P1, then scaffold React/Fastify/DB on new bounded branch.
5. Obtain PayPal sandbox and OpenAI keys locally or in secret storage before integration (never in the repository).

## Known limitations
- Approval consume-once atomicity under real concurrency is NOT proven; only the in-memory reference store is tested. Needs the PostgreSQL adapter plus contract tests. No authentication exists, so `TrustedActor` is test-constructed only.
- No invoice UI, live demo, real OpenAI call or verified PayPal sandbox event yet; no auth/session yet, so no parse endpoint is exposed.
- TypeScript stack CI jobs, real integration smoke tests, multi-dialect migrations, and Render deployment remain future tasks.
- This documentation bootstrap neither authorizes production deployment nor any PayPal live transaction.
- **Judging-period blocker to resolve:** AG Studio 45-day trial duration and Render Free Postgres 30-day expiry may end before Dec 15; plan sustainable demo access or tested local setup.
