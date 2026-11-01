# NMI-PROTOTYPE-10D — Prototype sprint architecture gate

- **Status:** Draft, architecture review pending
- **Owner/orchestrator:** Project owner
- **Implementation agent:** Unassigned; this PR is docs-only
- **Target branch:** `main`
- **Working branch:** `docs/nmi-prototype-10d`

## Objective

Define an implementable 10-day plan for a functional PayPal AI Hackathon prototype by 2026-11-11, including AG Studio 3.0 React analytics, an offline PayPal Sandbox draft-creation defect investigation, Render Workflows and Blueprint architecture, hosted judges' access through 2026-12-15, acceptance evidence, independent review gates and fallbacks.

The canonical design, task schedule, source checks and constraints are in [NMI-PROTOTYPE-10D-PLAN.md](../docs/NMI-PROTOTYPE-10D-PLAN.md).

## Context and verified baseline

- GitHub `main` at the supplied starting SHA `3d4c6308dd1f7263ebd7bb79920ba4c9b70ab998`; verified 2026-11-02.
- PR #30 merged into `main` at the same SHA. `docs/STATUS.md` was stale and is reconciled in this PR.
- PR #30 V1 physical Chrome QA was scoped PASS with owner-reported and independently observed evidence separated.
- Current live open Draft PRs at startup: #24 and #10. No prototype PR existed.
- The previously selected Render Free PostgreSQL expires after 30 days and cannot satisfy access through Dec 15. This plan describes a paid persistent database option but approves no spend or resource.
- Prior Render runbook prohibited Blueprints. This task proposes a Blueprint direction; independent review and explicit owner approval must supersede that prerequisite before use.

## Delivery mode / UI design gate

- **Material user-facing UI:** No implementation in this task; planning specifies a future analytics UI.
- **UI design gate:** Not applicable to docs-only PR. Future shell work requires human approval; carry forward approved NMI-UI-01B layout.
- **Requirements / screen map / design:** existing `docs/PRODUCT.md`, NMI-UI-01B and linked dashboard design evidence.

## Allowed scope

- `docs/NMI-PROTOTYPE-10D-PLAN.md`
- `tasks/NMI-PROTOTYPE-10D.md`
- `docs/STATUS.md`
- `docs/HANDOFFS.md`

## Forbidden scope

- Application code, tests/fixtures, dependencies, package lock, database schema/migrations/grants, `render.yaml`, deployment/run commands, credentials/secrets, owner database, Render resources, PayPal/OpenAI/MCP calls, payment-budget changes, merge, deployment, publication, and provider feature flags.
- Do not weaken or change the audited backend, explicit one-create authorization, local-only notification boundary, owner scoping, or NMI-P0 payment approval controls.

## Acceptance criteria

- [ ] The architecture defines real authenticated operator-scoped analytics contracts and exact currency-safe KPIs.
- [ ] The dashboard layout/cross-filter behavior/report persistence and AI Agent Framework feasibility are bounded and testable.
- [ ] AG Studio 3.0 version/licensing/trial dates and package compatibility are sourced from official docs; current application license remains unapproved.
- [ ] PayPal investigation uses checked-in evidence and official Toolkit guidance without invoking MCP/provider operations; it preserves one-create fencing and records unresolved assumptions truthfully.
- [ ] Render same-origin Fastify/React + persistent PostgreSQL + Blueprint + one read-only insight Workflow, migration/security/cost/license/Dec 15 access assumptions and separate approval gates are explicit.
- [ ] Ten day-by-day tasks, workstream parallel limits, tests, audit gates, Nov 11 freeze, cut lines and reproducible fallbacks are present.
- [ ] Stale STATUS facts are corrected against GitHub; handoff points to independent architecture review.
- [ ] PR remains Draft, no implementation or resource creation occurs.
- [ ] Format/diff checks and both required hosted CI checks pass at exact PR HEAD.

## Test objective / validation budget

- **Test objective:** document a sourced, security-preserving and feasible prototype plan without changing runtime behavior.
- **Minimum automated evidence:** Markdown formatting on changed files; `git diff --check`; repository Project Baseline and Stack hosted workflows.
- **Manual QA:** verify GitHub `main`, PR states/merge status and official AG Studio, PayPal Toolkit and Render documentation; record source-check date and unresolved account/license assumptions.
- **Escalation:** stop before implementation if owner decisions conflict (AG Studio license, Render plan/Blueprint direction, provider request) or if the existing one-create backend boundary would change.
- **Required gates:** independent architecture review and explicit owner approval before implementation; exact-head code/security audit and separate release approval later.

## Security / privacy

No material runtime change. Future analytics and workflow constraints are in the canonical plan. Do not invoke providers, install/configure PayPal toolkit, expose credentials, change the exhausted PayPal test budget, persist customer data in Render task state, or use production data.

## Data / migration

No schema or data change in this task. Future report persistence requires a reviewed forward migration and disposable-database tests. Never rerun migration 0007 or access/modify the owner's local database.

## Deliverable

Documentation-only Draft PR against `main`; stop for independent architecture review and owner approval before implementation.

## Completion handoff

Append `NMI-PROTOTYPE-10D-DOCS-01` to `docs/HANDOFFS.md` and point `docs/STATUS.md` to it.
