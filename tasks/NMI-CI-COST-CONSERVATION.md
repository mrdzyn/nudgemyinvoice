# NMI-CI-COST-CONSERVATION — CI Cost-Conservation Policy (`workflow_dispatch` Only During Development; Hosted CI Reserved for Final Release Candidate)

- **Status:** Ready for independent exact-HEAD review
- **Owner/orchestrator:** Project owner (`mrdzyn`, approved 2026-11-07)
- **Implementation agent:** Antigravity
- **Target branch:** `main` (`0b652348dfc546b4e9bc5bbf2e5a21fef142c124`)
- **Working branch:** `chore/nmi-ci-cost-conservation`

## Objective

Switch `.github/workflows/ci.yml` (`Project Baseline CI`) and `.github/workflows/stack.yml` (`Stack CI`) from automatic `pull_request` execution to explicit `workflow_dispatch` only, while preserving every validation job, test, security check, permission, and PostgreSQL 16 service setting, and updating NudgeMyInvoice testing/release/operational documentation to enforce:
1. Targeted local checks during implementation;
2. Full exact-HEAD manual CI (with mandatory 6-item evidence) before independent audit and owner merge approval;
3. Mandatory GitHub-hosted `workflow_dispatch` validation (`Project Baseline CI` + `Stack CI` both `SUCCESS`) on the final release candidate, blocking release if hosted validation cannot execute or fails.

## Context

The project owner approved a CI cost-conservation policy for `mrdzyn/nudgemyinvoice`: during development, run validation locally/manually and reserve GitHub-hosted Actions minutes for the final release candidate. This is a workflow-trigger and testing-policy change, **not** an exception for failing checks.

## Delivery mode / UI design gate

- **Material user-facing UI:** No
- **UI design gate:** Not applicable (CI configuration and operational documentation only; zero application/UI changes).

## Test objective / validation budget

- **Test objective:** Prove that:
  1. `.github/workflows/ci.yml` and `.github/workflows/stack.yml` parse cleanly as valid YAML, trigger **only** on `workflow_dispatch`, retain `contents: read` permissions and concurrency settings, keep `.github/workflows/common-validation.yml` callable via `jobs.project-baseline.uses`, and preserve every single `Stack CI` service (`postgres:16`) and step byte-for-byte in structure;
  2. Full exact-HEAD manual CI (`validate_project_profile.py`, tracked `.env*` secret-file check, `pnpm validate`, disposable PostgreSQL 16 `pnpm test:db`, `pnpm db:generate` migration-sync check, `pnpm audit --prod --audit-level high`, `git diff --check`) passes locally on this branch;
  3. Opening the Draft PR triggers **zero** automatic GitHub-hosted Actions runs (`refs/pull/<N>/merge` has `pull_request:` removed).
- **Minimum automated evidence:** Local YAML/workflow structural parity check against `origin/main`, `scripts/validate_project_profile.py`, and full exact-HEAD manual CI (`common-validation.yml` + `stack.yml` parity).
- **Manual QA:** Inspect `gh pr checks` / `gh run list` after opening the Draft PR to confirm zero hosted Actions runs were triggered on `chore/nmi-ci-cost-conservation`.
- **Required CI / release gates:** Full exact-HEAD manual CI recorded in the PR/handoff; hosted `Project Baseline CI` and `Stack CI` remain `NOT RUN` on this development PR (never recorded as `PASS`) and remain mandatory blocking gates on the final release candidate.

## Allowed scope

- `tasks/NMI-CI-COST-CONSERVATION.md`
- `.github/workflows/ci.yml`
- `.github/workflows/stack.yml`
- `.github/pull_request_template.md`
- `AGENTS.md`
- `docs/TESTING.md`
- `docs/RELEASE.md`
- `docs/REPOSITORY-SETUP.md`
- `docs/NMI-RENDER-P4-RELEASE-READINESS.md`
- `docs/PROJECT-MEMORY.md`
- `docs/STATUS.md`
- `docs/HANDOFFS.md`

## Forbidden scope

- `.github/workflows/common-validation.yml` (must remain unchanged and callable)
- Application source code (`apps/*`, `packages/*`, `scripts/*`), tests, migrations, dependencies, or `pnpm-lock.yaml`
- GitHub repository rulesets, branch protection settings, secrets, or Actions permissions
- Render resources, deployment, release branch creation, PR merges, or live OpenAI/PayPal/SMTP calls

## Acceptance criteria

- [x] `.github/workflows/ci.yml` and `.github/workflows/stack.yml` trigger on `workflow_dispatch` only (`pull_request` removed).
- [x] All existing validation jobs, tests, security checks, permissions, concurrency settings, and PostgreSQL 16 service configuration are preserved unchanged.
- [x] `.github/workflows/common-validation.yml` remains untouched and callable by `.github/workflows/ci.yml` (`validate_project_profile.py` passes).
- [x] `docs/TESTING.md` and directly related operational docs distinguish targeted local checks during implementation, full exact-HEAD manual CI before independent audit/merge, and mandatory hosted `workflow_dispatch` validation on the final release candidate.
- [x] Manual CI evidence requirements mandate commit SHA, commands, test results, environment, security checks, and outstanding QA.
- [x] Independent review, human merge approval, security boundaries, and release authorization gates are preserved; unrun hosted checks are never recorded as `PASS`, and release remains blocked if mandatory hosted validation cannot execute or fails.
- [x] Zero hosted GitHub Actions runs are triggered by pushing or opening this Draft PR; transition mechanics for pre-existing open PR branches are documented.

## Stop / escalation conditions

- Stop immediately if any workflow change or PR operation would trigger an unavoidable hosted GitHub Actions run consuming hosted minutes.
- Stop if any check in the full manual CI suite fails.
- Do not merge, deploy, or modify live GitHub ruleset settings.

## Completion handoff

Recorded in `docs/HANDOFFS.md` as `NMI-CI-COST-01` and referenced by `Active handoff` in `docs/STATUS.md`.
