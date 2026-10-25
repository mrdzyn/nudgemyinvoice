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

## Handoff: NMI-P1-C2

- **Task / phase:** `tasks/NMI-P1-foundation.md`
- **From:** Claude Code (implementation, audit remediation)
- **To:** independent re-auditor (Codex)
- **Branch:** `phase-1/nmi-app-foundation` (stacked on `phase-0/nmi-bootstrap-pruning`)
- **Implementation head:** `bfadda59eaa5298c0b615c5817e9ccd1619a8d48` (handoff-only commit follows; previous audited head `393052a96dc11dc1e2580bff95ca3a1af79f3d1c`)
- **PR:** #2 (Draft)
- **State:** READY FOR RE-AUDIT (prior verdict PARTIAL; not self-certified)

### Completed
- Finding 1: trusted-actor/approver binding and `consumeIfMatches` contract (`packages/domain`).
- Finding 2: 13 new CHECK constraints, migration `0001`, real-PostgreSQL tests (`packages/db`).
- Finding 3: expanded negative tests (tool dispatch, approval, concurrency, mutation).
- Finding 4: reference-date calendar validation (`packages/ai`, `packages/shared`).

### Validation
- Unit tests (in-memory store): see PR; PostgreSQL 16 local disposable run: constraint suite 22/22 pass; negative controls (weakened store, removed constraint) fail as expected.
- Hosted Stack CI (with `postgres:16` service) and baseline: see PR checks for the exact head.

### Continuation notes
- Approval atomicity on a real database remains UNPROVEN until a PostgreSQL adapter passes the store contract. No auth exists; `TrustedActor` is test-constructed.
- Owner decisions still pending: design approval, Postgres-only, AG Studio licence.

### Next action
Re-audit the exact PR #2 head against the four findings; do not merge.

## Handoff: NMI-P1-C3

- **Task / phase:** `tasks/NMI-P1-foundation.md`
- **From:** Claude Code (post-squash reconciliation)
- **To:** independent auditor (Codex)
- **Branch:** `phase-1/nmi-app-foundation` (PR #2, Draft, base `main`)
- **Implementation head:** `65699fc32b1a6e45fbc9017f9e8fedaf893d7efa` (docs-only commit follows; the PR head is authoritative)
- **PR:** #2
- **State:** READY FOR RE-VERIFICATION (prior PASS applies only to `d481449`)

### Completed
- `main` = `13ad78a` (PR #1 squash). Squash tree equals original Phase 0 head `a711673` tree.
- Phase 1 rebuilt on `main` by cherry-picking `97a4ab5`, `393052a`, `bfadda5`, `d481449` (merge commit `90091fb` intentionally not replayed); no conflicts. Tree `6f58e0066ba860d090d0e3596b179e577d853db2` is identical to audited `d481449`. Recovery: branch `backup/phase-1-d481449`, tag `recovery/nmi-p1-d481449`.

### Validation
Manual, at `65699fc`, pnpm 10.28.0, `--frozen-lockfile`, PostgreSQL 16.15 disposable `nmi_test`:
- profile validator PASS (24 files); lint PASS; format:check PASS; typecheck PASS
- `pnpm test` 7 files / 113 tests PASS (includes 22 DB tests; 91 pass + 22 skipped without a DB URL)
- `pnpm test:db` 22/22 PASS; build PASS; bundle secret scan clean (2 files)
- `pnpm audit --prod --audit-level high` no known vulnerabilities
- `pnpm db:generate` no changes; migration directory clean; `git diff --check` clean
- Hosted CI for the new SHAs: see PR checks; if not executed it is NOT PASS (owner-reported Actions limitation until Nov 2026).

### Continuation notes
- Verify: audited functionality preserved; no Phase 0 duplication; migrations `0000`/`0001` intact; financial boundaries unchanged (no send/cancel/refund/capture/mark-paid, no auth, no webhook); PR base `main`; diff vs `main` equals `a711673..d481449`.
- Still open: DB atomicity of approval consume unproven (needs PostgreSQL adapter); owner decisions on design, Postgres-only, AG Studio licence; Phase 2 not started.

### Next action
Independently verify the exact PR #2 head against this list; do not merge.

## Handoff: NMI-P2-I1-C1

- **Task / phase:** `tasks/NMI-P2-I1-auth-atomic-approvals.md`
- **From:** ChatGPT (Phase 2 kickoff / task contract)
- **To:** Claude Code (implementation)
- **Branch:** `phase-2/nmi-auth-atomic-approval-i1`
- **Implementation head:** N/A — task bootstrap only; base `main` `56ca7392c6b7f9f63d0f8fe484bb84835378dc26`. Verify current Draft PR HEAD before work.
- **PR:** Phase 2 Increment 1 Draft PR (see branch; no merge authorized)
- **State:** READY FOR IMPLEMENTATION

### Completed
- Phase 0 and Phase 1 squash merges verified on `main`.
- Increment 1 scope defined: authenticated single-operator demo sessions, real PostgreSQL atomic approval consumption, and minimal append-only audit trail. PayPal writes remain disabled.

### Validation
- Documentation task/bootstrap only; app tests and hosted CI **NOT RUN** on this branch.
- Phase 1 manual CI/independent audits are historical evidence, not Phase 2 validation.

### Continuation notes
- Read active task before editing; start from current branch tip and only relevant code.
- Do not silently decide SQLite parity or implement the UI, PayPal sends, webhooks or real OpenAI calls.
- Hosted Actions unavailable per owner until November; record new manual CI for the exact implementation SHA. PR #2's exception does not carry over.

### Next action
- Claude implements bounded P2-I1 on this Draft PR, runs targeted and required manual CI, records a new independent audit handoff; Codex audits exact implementation HEAD before any merge.

## Handoff: NMI-P2-I1-C2

- **Task / phase:** `tasks/NMI-P2-I1-auth-atomic-approvals.md`
- **From:** Claude Code (implementation)
- **To:** Codex (independent exact-head security and concurrency audit)
- **Branch:** `phase-2/nmi-auth-atomic-approval-i1` (Draft PR #3, base `main` `56ca739`)
- **Implementation head:** `112208d93b47d6a0341377778568a6e3110dbd57` (docs-only handoff commit follows; the PR head is authoritative)
- **PR:** #3 (Draft)
- **State:** READY FOR AUDIT (not self-certified; no merge authorized)

### Completed
- Operator auth, PostgreSQL approval store, audit trail, migrations `0002`/`0003`, tests, docs. No PayPal write, UI, grant issuer, approval route, webhook or deployment.

### Validation
Manual CI plus hosted CI. Hosted: `Project baseline / Common validation` and `Stack validation` succeeded on `db6ea1c` (runs 40094020506, 40094020500); later docs-only commits need their own result. Manual: pnpm 10.28.0, `--frozen-lockfile` from a clean `node_modules`, PostgreSQL 16.15 disposable `nmi_test`, at `112208d`:
- profile validator PASS (24 files); lint, format:check, typecheck PASS
- `pnpm test` without DB URL: 10 files run, 125 passed + 74 skipped (3 PG files skipped); with DB URL: 13 files, 199 passed
- `pnpm test:db` (REQUIRE_DB_TESTS=1): 3 files, 74 passed (30 constraints, 19 approval store, 25 auth); build PASS; bundle scan clean; `pnpm audit --prod --audit-level high` clean
- `pnpm db:generate` no changes; migrations dir clean; `git diff --check` clean; migrations `0000`/`0001` byte-identical to `main`
- Mutation controls (run at the preceding commit `3b2b455`; the later `112208d` change only moved a shared test helper; each mutant broke the suite): non-atomic read-then-write consume, removed approver / expiry / consumed predicates, removed CSRF check, removed Origin guard, removed revocation check, bypassed password verification. A lint control confirmed `asTrustedActor` imports outside `auth/trusted-actor.ts` fail.
- End-to-end smoke of the real CLI and server against PostgreSQL (migrations, `provision-operator`, `/health`, login, session, 0 password occurrences in the server log).

### Continuation notes (please verify)
- `consumeIfMatches` is a single conditional UPDATE; expiry uses `clock_timestamp()`; caller `now` is ignored. Concurrency proof: separate connections, row-lock blocking, commit/rollback behavior.
- Known limits: no grant issuer or approval route; consume and audit are two statements (audit failure after consume fails closed and spends the grant); in-memory throttling; audit immutability holds against ordinary statements, not the table owner (INSERT/SELECT-only app role not configured); `SESSION_SECRET` rotation changes CSRF tokens.
- The API now requires `DATABASE_URL` (PostgreSQL) and `SESSION_SECRET`; `.env.example` changed accordingly. The SQLite decision is still the owner's.
- Test credentials are generated per run; no password literal is committed.

### Next action
Independently audit exact PR #3 head (PASS / PARTIAL / FIX REQUIRED) against the task acceptance list, re-running the manual set with `pnpm test:db` on a disposable PostgreSQL 16. Do not merge. After a PASS and owner approval, NMI-P2-I2 (owner-approved AI smoke, sandbox PayPal draft work) may be scoped.

## Handoff: NMI-P2-I1-C3

- **Task / phase:** `tasks/NMI-P2-I1-auth-atomic-approvals.md`
- **From:** Claude Code (remediation of audit findings)
- **To:** Codex (independent exact-head re-audit)
- **Branch:** `phase-2/nmi-auth-atomic-approval-i1` (Draft PR #3, base `main` `56ca739`)
- **Implementation head:** `013945b854ca7f4ac4eea44494710466e5b1d2b4` (docs-only handoff commit follows; the PR head is authoritative). Previously audited head: `7df7b7a51a35900224a759a6f53835ecdee4fdf6` = FIX REQUIRED.
- **PR:** #3 (Draft)
- **State:** READY FOR RE-AUDIT (not self-certified; no merge authorized)

### Completed
- Finding 1 (MEDIUM, rotation vs in-flight login): `credential_version` + `INSERT ... SELECT ... WHERE credential_version = <verified> ... FOR UPDATE` issuance (lock held only for that statement, after scrypt) + one-transaction rotation (lock, new hash, version bump, revoke sessions). Obsolete credential yields no session (`401`, audit reason `credential_changed`).
- Finding 2 (MEDIUM, throttling bypass): synchronous atomic reservation on per-account and per-address budgets before the first `await`; documented outcome accounting; bounded concurrent hashing; `429` before any lookup/hashing; correct `Retry-After`.
- Migration `0004` only; `0000`-`0003` byte-identical to the audited head. No PayPal write, UI, grant issuer, approval route, webhook or deployment.

### Validation
Manual CI at `013945b` (pnpm 10.28.0, frozen install from clean `node_modules`, PostgreSQL 16.15 disposable `nmi_test`): profile validator PASS (24 files); lint, format:check, typecheck, build PASS; bundle scan clean; `pnpm audit --prod --audit-level high` clean; `pnpm db:generate` no changes and migrations dir clean; `git diff --check` clean.
- `pnpm test` without DB URL: 11 files run, 140 passed + 108 skipped; with DB URL: 16 files, 248 passed. `pnpm test:db` (REQUIRE_DB_TESTS=1): 5 files, 108 passed (31 constraints, 19 approval store, 25 auth, 16 auth-store races, 17 login races).
- Determinism: race ordering uses held row locks plus observed `pg_stat_activity` lock waits and promise barriers (no sleeps deciding order). Store race suite 20 consecutive runs and both race suites 10 more runs: 0 failures.
- Mutation controls (each broke the tests): issuance ignoring the credential version; issuance without the row lock; rotation without a version bump; rotation without session revocation; limiter that checks but does not reserve at admission; ignored address budget; unstable account key; gate that never refuses; unbounded gate concurrency; capacity refusals still charged (found as a test gap, strengthened, then killed); post-hash errors refunded; ignoring a null session. One equivalent mutant survived by design: removing rotation's explicit `SELECT ... FOR UPDATE`, because `UPDATE operators` takes the same row lock; kept as explicit lock ordering.
- Upgrade check: `0004` applied on a database that already held an operator and a session; row preserved with version 1; CHECK rejects 0.
- Hosted CI: see PR checks for the exact head. Record only what actually ran.

### Continuation notes (please verify)
- Issuance proof: single statement, row lock only after hashing, fails closed when the version differs or the operator is disabled; rotation is atomic (a forced failure while revoking rolls back both hash and version).
- Admission: `tryAdmit` is synchronous and reserves in both budgets or neither; verify the route reaches no `await` before it, and that rejected requests never call the lookup or `verifyPassword`.
- Seams (`authSeams`: limits, gate sizes, `verifyPassword`, `beforeSessionIssue`) are inert unless supplied; `server.ts` supplies none.
- Known limits, unchanged: throttling in-memory and per process; consume and audit are separate statements; audit immutability does not bind the table owner; no grant issuer or approval route; `SESSION_SECRET` rotation changes CSRF tokens; Postgres-only vs SQLite is still the owner's decision.

### Next action
Independently re-audit the exact PR #3 head (PASS / PARTIAL / FIX REQUIRED) against findings 1 and 2 and the preserved controls; re-run the manual set including `pnpm test:db` on a disposable PostgreSQL 16 and repeat the two race suites several times. Do not merge.

<!-- HANDOFF_ENTRIES_END -->
