# NMI-P0 — Greenfield bootstrap and pruning

- **Status:** Review (pending CI, independent audit and explicit owner merge approval)
- **Owner/orchestrator:** project owner
- **Implementation agent:** ChatGPT — repository bootstrap
- **Target branch:** `main`
- **Working branch:** `phase-0/nmi-bootstrap-pruning`

## Objective
Convert the public template-derived GitHub repository to a coherent NudgeMyInvoice foundation: select capability profile, prune unselected template artifacts, establish product/architecture/security/test/release rules, make public README/LICENSE/env example, and schedule bounded 55-hour MVP.

## UI gate
Material user-facing UI: **No**; docs-only foundation, UI design gate not applicable. Future NMI-P1 must complete Markdown requirements -> screen map -> mockups -> human design approval before shell.

## Allowed
`AGENTS.md`, `README.md`, `LICENSE`, `.env.example`, `.gitignore`, `config/project-profile.json`, `docs/` product/status/architecture/security/testing/release/hackathon plan/handoff-memory pruning, `tasks/` prune and P0 task, remove unused `design/platforms/`, `design/integrations/`, `store/`, `integrations/`, `release/`, master-only CI scripts/workflow.

## Amendment (owner decision)
AI provider is OpenAI (official `openai` SDK, Responses API, Zod validation). All Anthropic configuration and proposed dependencies are removed.

## Forbidden
Do not merge, deploy, create live PayPal integration, execute payments, introduce application runtime, weaken or remove baseline paired CI/validator, disable human approval or author real secrets.

## Acceptance
- [ ] Repository remains **public** and includes MIT LICENSE.
- [ ] Project profile = `repositoryMode: project`, `design: true`, `platforms: [web]`, no store/integration selection.
- [ ] Canonical greenfield pruning complete and master handoffs/memory removed.
- [ ] Baseline `ci.yml` + `common-validation.yml` and profile validator preserved.
- [ ] Explicit sandbox, approval, webhook and currency invariant contract.
- [ ] README/env.example contains no secrets and does not pretend app is runnable.
- [ ] Profile validator passes on exact branch, then real child PR baseline emits and passes, or is accurately reported blocked.
- [ ] Independent exact-head audit and owner approval before merge.

## Validation
Objective: repo bootstrap without template leftovers, false capability activation or weakened baseline.
Minimum automation: `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice`; `git diff --check`; inventory checks and secret grep.
Manual QA: inspect current tree/README/LICENSE, real workflow execution, inspect GitHub public visibility.
Escalation: any validator regression, profile mismatch, untrusted secret, or missing baseline workflow blocks merge.

## Completion
Prepare Draft PR against `main`; report SHA and evidence. No automatic merge or deployment.
