# Project Status

> Current operational state only. Durable decisions belong in docs/PROJECT-MEMORY.md.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed hackathon sandbox MVP
- **Current phase:** NMI-P0 — greenfield foundation and pruning
- **Status:** Review — Draft PR #1 ready for independent exact-head audit (AI provider migrated to OpenAI); owner merge approval pending
- **Primary branch:** `main`
- **Working branch:** `phase-0/nmi-bootstrap-pruning`
- **Active task:** `tasks/NMI-P0-bootstrap.md`
- **Active handoff:** NMI-P0-C1

## Completed
- Owner decision: OpenAI (official `openai` SDK, Responses API, `OPENAI_MODEL`/`OPENAI_API_KEY`) replaces the Anthropic plan; no second provider in the MVP.
- Validation at `658b948`: `validate_project_profile.py` PASS (24 files); `git diff --check` clean; hosted `Project baseline / Common validation` success (read via REST; `gh pr checks` is unavailable here because it needs GraphQL). Re-verify at the final head.
- Created public project repository from `mrdzyn/ai-native-project-template`.
- Prepared project-specific product, architecture, security, release, tests, AGENTS, README, license, environment example, and ~55-hour plan.
- Selected only web design capability; pruned master-only and unused optional packs on this branch.

## Next actions
1. Verify exact branch tree against canonical `docs/REPOSITORY-SETUP.md` greenfield checklist and run `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice`.
2. Verify real child PR emits `Project baseline / Common validation`; investigate hosted CI availability separately and never mark blocked CI as PASS.
3. Obtain independent exact-head audit and owner approval before merge.
4. Approve screen map/mockup for NMI-P1, then scaffold React/Fastify/DB on new bounded branch.
5. Obtain PayPal sandbox and OpenAI keys locally or in secret storage before integration (never in the repository).

## Known limitations
- No runnable MVP, live demo or verified PayPal sandbox event yet.
- TypeScript stack CI jobs, real integration smoke tests, multi-dialect migrations, and Render deployment remain future tasks.
- This documentation bootstrap neither authorizes production deployment nor any PayPal live transaction.
- **Judging-period blocker to resolve:** AG Studio 45-day trial duration and Render Free Postgres 30-day expiry may end before Dec 15; plan sustainable demo access or tested local setup.
