# Repository Handoffs

## Purpose

`docs/HANDOFFS.md` is the canonical repository-backed handoff log for work that must continue across AI agents, tools, conversations, or human/agent boundaries.

A handoff records the **minimum operational state needed to continue correctly**. It prevents chat history, copied transcripts, or agent memory from becoming the only continuation mechanism.

This file is **not** part of routine full-file startup context. `docs/STATUS.md` identifies the active handoff ID; the next agent reads only that matching section.

## Relationship to other repository context

Each artifact has one job:

- `docs/STATUS.md` — what is true now; stores only the current **Active handoff** ID plus current phase/status.
- active task/phase specification — objective, scope, acceptance criteria, validation, and stop conditions.
- `docs/HANDOFFS.md` — concise continuation state passed between agents/conversations.
- `docs/PROJECT-MEMORY.md` — durable decisions and rationale; not routine startup context.
- code/tests/PR — authoritative implementation evidence.

Do not duplicate the task contract, STATUS, architecture, or durable decisions inside a handoff. Link to those sources and capture only what the next agent needs to resume.

## When a handoff is required

Create a handoff when responsibility for meaningful work passes to another agent, tool, conversation, or reviewer and continuation state would otherwise have to be reconstructed.

Typical cases:
- implementation is complete and an independent reviewer takes over;
- an agent reaches a bounded checkpoint and another agent continues implementation;
- work moves to a new conversation because context is getting large;
- a review/fix cycle changes the exact branch/head state that the next agent must use;
- work is blocked and another agent/person must resume from a known state.

Do **not** create a handoff after every trivial response or mechanical action. Prefer one handoff per meaningful transfer of responsibility.

## Startup rule

After reading `AGENTS.md`, `docs/STATUS.md`, `config/project-profile.json`, and the active task/phase specification:

1. Read the `Active handoff` value from `docs/STATUS.md`.
2. If it is `None`, continue without loading handoff history.
3. If it contains an ID, locate that exact `## Handoff: <ID>` section in this file.
4. Read only that section unless an older handoff is specifically required to resolve an ambiguity.
5. Verify its branch/PR/SHA against the repository before changing code. Repository state remains authoritative if the handoff is stale.

Never load the full handoff history merely because this file exists.

## Handoff IDs

IDs must be unique within the repository and stable after publication.

Recommended convention:

```text
<TASK-OR-PHASE-ID>-C<n>
```

Examples:
- `P7.0-C1`
- `MKT-MCP2-C1`
- `SEC-005-C2`

For specification-stage handoffs that are intentionally distinct from later implementation handoffs, the master template may use:

```text
<TASK-OR-PHASE-ID>-SPEC<n>
```

Example: `P8.0-SPEC1`.

Projects may use another concise convention when it is already established. Never reuse an ID for a different repository state.

## Required handoff content

Keep each handoff compact. Include only:

- **Task / phase** — active repository-backed specification.
- **From** — agent/role that produced the handoff.
- **To** — expected next role when known, otherwise `next agent`.
- **Branch** — branch the next agent should inspect.
- **Implementation head** — exact code/docs SHA the handoff describes.
- **PR** — PR number/link when one exists.
- **State** — ready for review / ready to continue / blocked / fixes required / other concise state.
- **Completed** — short summary of what changed.
- **Validation** — checks actually run and result; summarize rather than paste logs.
- **Continuation notes** — only constraints, findings, or decisions needed for the next step.
- **Next action** — one exact recommended action.

If a field is not applicable, write `N/A` rather than inventing content.

## Entry template

```markdown
## Handoff: [UNIQUE-ID]

- **Task / phase:** [PATH OR ID]
- **From:** [AGENT / ROLE]
- **To:** [NEXT AGENT / ROLE]
- **Branch:** `[BRANCH]`
- **Implementation head:** `[SHA]`
- **PR:** [# / LINK / N/A]
- **State:** [READY FOR REVIEW / READY TO CONTINUE / BLOCKED / FIXES REQUIRED]

### Completed
- [CONCISE OUTCOME]
- [CONCISE OUTCOME]

### Validation
- `[COMMAND OR CHECK]` — [PASS / FAIL / NOT RUN]
- Required CI: [STATE]

### Continuation notes
- [ONLY WHAT THE NEXT AGENT NEEDS]
- [RISK / FINDING / CONSTRAINT OR "None"]

### Next action
[ONE EXACT NEXT ACTION]
```

## Append and update rules

- Append a new handoff; do not rewrite an older handoff to represent a new repository state.
- Before appending, refresh the branch/PR and confirm the handoff is based on the current intended head.
- If another agent has already appended a newer handoff, reconcile before writing; never overwrite or silently supersede concurrent work.
- If an old handoff contains a factual error, append a correction in a new handoff or clearly mark the correction without changing the historical repository state it described.
- After appending a handoff, update `docs/STATUS.md` so `Active handoff` contains that ID.
- When no continuation handoff is active, set `Active handoff: None`.
- The handoff should reference the final implementation SHA **before the handoff-only documentation commit** when a separate handoff commit is used. The current branch head remains authoritative for subsequent work.

## Content boundaries

Do not put the following in handoffs:
- secrets, tokens, private keys, credentials, or signing material;
- sensitive production/customer data;
- large build/test logs;
- full diffs or copied source files;
- long chat transcripts;
- complete task specifications already stored elsewhere;
- durable architecture/product/security decisions that belong in their canonical docs or `docs/PROJECT-MEMORY.md`;
- speculative future backlog unrelated to the immediate continuation.

Link to the authoritative repository artifact instead.

## Greenfield initialization

Repositories created from the master template keep this policy and entry template but must remove the inherited master-template handoff block during bootstrap.

Remove the block delimited by `MASTER_TEMPLATE_HANDOFFS_START` / `MASTER_TEMPLATE_HANDOFFS_END`, keep the generic `HANDOFF_ENTRIES_START` / `HANDOFF_ENTRIES_END` markers, set `docs/STATUS.md` to `Active handoff: None`, then start the new project's handoff history only when its first meaningful transfer occurs. Until that bootstrap cleanup is complete, a generated child still in `repositoryMode: "template"` must ignore any inherited master active-handoff ID.

## Brownfield adoption

If an existing repository already has a handoff/continuation mechanism:
- reconcile it using the KEEP / MERGE / ADD / RETIRE process in `docs/REPOSITORY-SETUP.md`;
- choose one canonical mechanism;
- do not maintain two competing active handoff logs;
- if an approved equivalent path remains canonical, adapt Project Baseline deliberately rather than duplicating the same handoff state here solely to satisfy CI.

## Handoff entries

<!-- HANDOFF_ENTRIES_START -->
<!-- Append project handoff sections before HANDOFF_ENTRIES_END. -->

## Handoff: NMI-P0-C1

- **Task / phase:** `tasks/NMI-P0-bootstrap.md`
- **From:** Claude Code (implementation)
- **To:** independent exact-head auditor
- **Branch:** `phase-0/nmi-bootstrap-pruning`
- **Implementation head:** `c7519ce7a200404d038754a97b23f3f0bacea94a`
- **PR:** #1 (Draft)
- **State:** READY FOR REVIEW

### Completed
- AI provider plan migrated from Anthropic to OpenAI (Responses API, `OPENAI_API_KEY`/`OPENAI_MODEL`); no Anthropic references remain except the one memory-rationale mention.

### Validation
- `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice` — PASS (24 files)
- `git diff --check` — PASS
- Hosted `Project baseline / Common validation` — success on `658b948` (prior head); must be re-confirmed on the final head. `gh pr checks` is unusable in this environment (GraphQL blocked); REST/MCP check-runs were used instead.

### Continuation notes
- Handoff-only commit follows the implementation head above.
- PR #1 stays Draft; do not merge. Phase 1 is stacked on this branch (`phase-1/nmi-app-foundation`).

### Next action
Audit the exact PR #1 head against `tasks/NMI-P0-bootstrap.md` and `docs/REPOSITORY-SETUP.md`.

## Handoff: NMI-P1-C1

- **Task / phase:** `tasks/NMI-P1-foundation.md`
- **From:** Claude Code (implementation)
- **To:** independent exact-head auditor; project owner (design approval)
- **Branch:** `phase-1/nmi-app-foundation` (stacked on `phase-0/nmi-bootstrap-pruning`)
- **Implementation head:** see PR head; handoff-only commit follows the implementation commit `97a4ab5`
- **PR:** stacked Draft against PR #1's branch
- **State:** READY FOR REVIEW

### Completed
- Workspace, health API, placeholder web, exact-money contracts, OpenAI parser, approval gate, tool allowlist, PayPal interfaces, Postgres schema + migration, stack CI, draft screen designs.

### Validation
- `pnpm lint`, `format:check`, `typecheck`, `test` (52 pass), `build`, `check:bundle`, `pnpm audit --prod` — PASS locally.
- Hosted Stack CI / Project baseline on final head — see PR; not claimed here.
- Real OpenAI and PayPal sandbox calls — NOT RUN (no keys).

### Continuation notes
- Owner decisions pending: design approval (`design/nmi-p1/SCREENS.md`), local Postgres vs SQLite (`docs/ARCHITECTURE.md`), AG Studio licence/trial terms.
- `createOpenAIInvoiceClient` is typechecked but unexercised against the live API; first real smoke test should confirm `responses.parse` + `zodTextFormat` behavior and a supported `OPENAI_MODEL`.

### Next action
Audit the exact head; then obtain owner design approval before any UI shell work.

<!-- HANDOFF_ENTRIES_END -->
