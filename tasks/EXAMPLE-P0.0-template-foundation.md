# P0.0 — Establish Master Template Foundation

> **Worked template-maintenance example.** This task records the work used to establish the master template itself. Repositories created from this template should not treat it as an active project task and may delete it after initialization.

- **Status:** Review
- **Owner/orchestrator:** Project owner + ChatGPT
- **Implementation agent:** ChatGPT
- **Target branch:** `main`
- **Working branch:** `phase-0/template-foundation`

## Objective

Establish a technology-agnostic repository foundation for human-gated, AI-native software delivery that can be reused across future software projects.

## Context

The project owner is standardizing a delivery model that uses repository-backed context, bounded AI-agent tasks, automated validation, independent review, and explicit human approval before merge and production release.

## Allowed scope

- root repository guidance;
- `AGENTS.md`;
- `docs/`;
- `.agent/`;
- `tasks/`;
- `scripts/`;
- `.github/`;
- generic repository configuration.

## Forbidden scope

Do not:
- select a mandatory programming language, framework, cloud, package manager, or deployment target;
- add application/product feature code;
- add project-specific credentials or infrastructure;
- remove the human merge/release approval gate;
- make `docs/PROJECT-MEMORY.md` default coding-agent startup context.

## Acceptance criteria

- [x] Agent roles, scope boundaries, stop conditions, validation, and human approval rules are documented.
- [x] STATUS and PROJECT-MEMORY have distinct purposes and startup-context rules.
- [x] Product, architecture, security, testing, and release templates exist.
- [x] A reusable bounded task-contract format exists.
- [x] Pull request and issue templates exist.
- [x] Baseline CI verifies the repository foundation and runs on all pull requests.
- [x] GitHub Actions used by the baseline are pinned immutably where practical.
- [x] Security rules distinguish absolute prohibitions from privileged human-authorized operations.
- [x] New-project initialization instructions exist.
- [x] Brownfield adoption instructions preserve authoritative existing project context and require gap/conflict analysis before edits.
- [ ] Independent re-audit completes with no blocking findings.
- [ ] Human owner approves merge.

## Required validation

- baseline GitHub Actions workflow passes at the final PR head SHA;
- all required engineering files exist;
- baseline CI runs for stacked and main-targeted pull requests;
- no stack-specific runtime dependency is required;
- no secrets or production data are committed;
- PR is independently re-audited after corrections.

## Security / privacy considerations

The template establishes security/privacy process rather than handling application data. Security boundaries must remain conservative and human-gated.

## Data / migration considerations

None.

## Documentation updates

- [x] `README.md`
- [x] `AGENTS.md`
- [x] `docs/STATUS.md`
- [x] `docs/PROJECT-MEMORY.md`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/SECURITY.md`
- [x] `docs/TESTING.md`
- [x] `docs/RELEASE.md`
- [x] PR/issue/task guidance

## Deliverable

PR #1 against `main`.

Do not merge until independent audit findings are corrected, CI passes at the corrected head SHA, and the project owner explicitly approves merge.

## Stop / escalation conditions

Stop if:
- the foundation would require stack-specific product dependencies;
- a proposed change weakens the human approval gate;
- security or validation controls would need to be bypassed;
- repository state conflicts with the defined operating model.

## Completion handoff

Provide:
- final PR head SHA;
- CI result;
- audit/re-audit result;
- remaining limitations;
- exact owner action required before merge.
