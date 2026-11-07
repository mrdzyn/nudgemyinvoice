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

## Handoff: NMI-PROTOTYPE-10D-ARCH-REMED-01

- **Task / phase:** `tasks/NMI-PROTOTYPE-10D.md`
- **From:** architecture remediation
- **To:** independent architecture reviewer
- **Branch:** `docs/nmi-prototype-10d`
- **Implementation head:** verify current PR head from GitHub before audit; this handoff is included in that exact head.
- **PR:** [Draft #31](https://github.com/mrdzyn/nudgemyinvoice/pull/31)
- **Review addressed:** `5731373684`, originally against `308e24aeb87e2875169aecb42a1dbf2d59f18244`
- **State:** Five architecture/documentation findings addressed in the plan and task; awaiting final validation, CI, and exact-head re-audit.

### Review scope addressed

- Added Nov 7 stop/go and conditional owner-authorized Nov 8 resource/first-deploy and Nov 9 migration, HTTPS, backup-restore, rollback, and judge-access acceptance gates. No action is authorized by this plan.
- Defined one isolated synthetic environment with one full-privilege operator and sequential owner-guided judge sessions, rotation/reset between sessions, or local fallback.
- Required a distinct server-side full-population analytics aggregate, exact per-currency minor units/exponents, UTC half-open range and IANA local-bucket semantics, with multi-page and DST/exponent tests.
- Corrected AG Studio facts: owner reports an obtained 45-day trial; start/expiry, entitlement, and hosted judge rights are unverified.
- Bounded Workflow retries to zero, task timeout to 60 seconds, provider timeout to 30 seconds, global concurrency to one, daily/lifetime runs, token/output sizes, and proposed AI/Render cost ceilings. These are not provider or spend authorization.

### Continuation notes

- Keep the PR documentation-only and Draft. Preserve Nov 11 freeze, separate owner approvals, exhausted PayPal one-create budget, consumed OpenAI Gate A, sandbox-only payment boundary, and local-only follow-up notifications.
- Verify the final pushed SHA and both required hosted workflows against that SHA before issuing a verdict. Do not provision Render, run migrations, call providers, merge, or deploy.

## Handoff: NMI-PROTOTYPE-10D-DOCS-01

- **Task / phase:** `tasks/NMI-PROTOTYPE-10D.md`
- **From:** implementation / architecture planning
- **To:** independent architecture reviewer
- **Branch:** `docs/nmi-prototype-10d`
- **Implementation head:** `bd975de962e01bfc7d5dbf39cce47d646d304530` (plan/task/status; handoff-only docs commit follows)
- **PR:** [Draft #31](https://github.com/mrdzyn/nudgemyinvoice/pull/31)
- **State:** Docs-only architecture plan ready for independent review; keep Draft.

### Completed

- Defined AG Studio, PayPal defect investigation, Render Workflow/Blueprint, 10-day workplan, acceptance gates and cut-line fallback in `docs/NMI-PROTOTYPE-10D-PLAN.md`.
- Reconciled current STATUS against GitHub; PR #30 merged at current main SHA. No runtime changes or provider/resource operations.

### Validation

- Official AG Studio, PayPal Toolkit and Render docs checked 2026-11-02 — PASS; account license/pricing checks remain unverified.
- Markdown format and `git diff --check` — PASS. Project Baseline and Stack CI passed at prior PR head `9450c8e69ca901b61aa8009a352673892196242a`; recheck required on the final pushed handoff head before audit.

### Continuation notes

- Existing Render Free plan selection expires before Dec 15; proposed paid PostgreSQL/Blueprint direction needs independent review and explicit owner approval. No charges or resources authorized.
- AG Studio commercial trial/license is not activated. PayPal real one-create budget remains exhausted. No providers or MCP were called.

### Next action

Independently review the exact live PR head, then wait for explicit owner approval before implementation.

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

## Handoff: NMI-P2-I2-C1

- **Task / phase:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **From:** ChatGPT (Phase 2 Increment 2 kickoff)
- **To:** Claude Code (implementation)
- **Branch:** `phase-2/nmi-invoice-drafts-i2`
- **Implementation head:** N/A — task kickoff only; baseline `main` `9ebc1912e96b158b906b849cf1dc2b48cbf3c875`. Verify Draft PR exact head first.
- **PR:** Phase 2 Increment 2 Draft PR (create/open against `main`)
- **State:** READY FOR IMPLEMENTATION; no app code has been changed.

### Completed

- Verified PR #3 merged into `main` as `9ebc1912e96b158b906b849cf1dc2b48cbf3c875`; previous security and race fixes preserved.
- Scoped backend-only flow: authenticated `@nmi/ai` parse → strict schema validation → PostgreSQL local save → **explicit** PayPal sandbox draft create with stable idempotency and verified remote response.
- Distinct send / customer-notification endpoints and all other privileged PayPal writes remain FORBIDDEN; no invoice UI before owner screen approval.

### Validation

- Task bootstrap only; Phase 2 I2 code tests and provider smoke **NOT RUN**.
- Historical PR #3 exact-head hosted and manual CI passed; they do not cover new code.

### Continuation notes

- Read `AGENTS.md`, `docs/STATUS.md`, profile, active task, this handoff, relevant code/tests. Do not load handoff history.
- Existing Postgres `invoices`, `invoice_items`, `PayPalInvoicingReadDraft`, OpenAI parser and Fastify session middleware are authoritative starting points.
- Durable PayPal draft operation state, 1:1 remote ID mapping, exact-money parity, auth/CSRF checks, and network-side no-send proof are critical audit topics.
- Genuine OpenAI and PayPal sandbox smoke tests require separately configured owner credentials and must be labeled NOT TESTED otherwise. No implied approval for deployment or real customer notifications.

### Next action

- Claude implements the accepted backend task on this Draft PR, completes targeted + required validation and pushes a C2 exact-head independent Codex audit handoff; Codex audits before any owner merge decision.

## Handoff: NMI-P2-I2-C2

- **Task / phase:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **From:** Claude Code (implementation)
- **To:** Codex (independent exact-head security, payment and idempotency audit)
- **Branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR #4, base `main` `9ebc191`)
- **Implementation head:** `33d917bac9b2082ea66d3179e44debd143dcbdc5` (docs-only handoff commit follows; the PR head is authoritative)
- **PR:** #4 (Draft)
- **State:** READY FOR AUDIT (not self-certified; no merge authorized)

### Completed

- Parse, strict exact save, read, explicit PayPal sandbox draft; durable fenced operation store; allowlisted PayPal sandbox client; migration `0005`; tests; docs. No send/remind/cancel/refund/capture/payment, webhook, UI, deployment.

### Validation

Manual CI at `33d917bac9b2082ea66d3179e44debd143dcbdc5` (hosted result: see PR checks for the head). pnpm 10.28.0, frozen install from clean `node_modules`, PostgreSQL 16.15 disposable `nmi_test`:

- profile validator PASS (24 files); lint, format:check, typecheck, build PASS; bundle scan clean; `pnpm audit --prod --audit-level high` clean; `pnpm db:generate` no changes; migrations dir clean; `git diff --check` clean; migrations `0000`-`0004` byte-identical to `main`.
- `pnpm test` without DB URL: 14 files run, 235 passed + 176 skipped; with DB URL: 22 files, 411 passed. `pnpm test:db`: 8 files, 176 passed (37 constraints, 19 approval store, 25 auth, 16 auth-store, 17 login races, 11 draft store, 9 operation store, 42 invoice-draft/PayPal routes).
- Determinism: barriers are promises/observed lock waits, not sleeps (e.g. double click: 11 rivals refused while the winner is parked inside the external call). Route suite repeated 5x, full suite 3x, no failures.
- Mutation controls (each broke tests): no claim barrier; remote verification ignored; no reconcile before re-create; cool-off ignored; exact-mapping guard removed; intent audit not enforced; feature flag ignored; parse budget removed; parse in-flight cap removed; allowlist admitting `/send`; `markCreated` not fenced.
- Upgrade check: `0005` applied on a database with an existing legacy invoice and item (kept; item position backfilled 0).
- **NOT TESTED:** real OpenAI parse; real PayPal sandbox OAuth/create/show/search. All PayPal behavior here is from fake clients or a fake HTTP transport and is labeled so.

### Continuation notes (please verify)

- Exactly-once rests on the operation row + fenced claim + durable `create_attempted_at` before the call + reconcile-before-retry (search by deterministic `invoice_number`, show by stored id) + cool-off + verified total; `PayPal-Request-Id` is sent but NOT relied on (not documented for create-invoice).
- Fail-closed points: flag default off and creds mandatory when on; the intent is audited before the external write; a client absent => 503; any unclear outcome is `unknown`, never success; `mismatch` is terminal and unlinked.
- Money: server recomputes totals; strict body (no client totals/status); mappings needing rounding are refused (`422 mapping_refused`); remote total compared exactly after creation.
- Forbidden operations: transport allowlist (4 method+path patterns, sandbox host only, no redirects) plus no send/remind/cancel/refund routes (404 tested). `PayPalInvoicingPrivileged` is still an interface only.
- Known limits: unverified PayPal shapes (recipient `name.full_name`, `amount.breakdown.discount.invoice_discount`, omitted `invoicer`, `search-invoices` body, duplicate `invoice_number` behavior, search lag); drafts are immutable; `mismatch`/`unknown` need operator action outside this increment; in-memory per-process parse budget; customer email goes to PayPal sandbox and parse text to OpenAI (`store:false`); a hand-inserted legacy row with tax/discount but no rate would block migration `0005` (no code path ever wrote invoices before this increment).
- Owner decisions still pending: design approval, Postgres-only vs SQLite, AG Studio licence, relaxing the rounding refusal after a live smoke.

### Next action

Independently audit the exact PR #4 head (PASS / PARTIAL / FIX REQUIRED), re-run the manual set including `pnpm test:db` on a disposable PostgreSQL 16, and repeat the route and operation suites. Do not merge. After a PASS and owner approval, plan the owner-triggered live sandbox smoke (NMI-P2-I3) before any send capability.

## Handoff: NMI-P2-I2-C3

- **Task / phase:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **From:** Antigravity (implementation agent, replacing Claude Code)
- **To:** ChatGPT GPT-6 (independent exact-head security, payment and idempotency audit)
- **Branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR #4, base `main` `9ebc191`)
- **PR:** #4 (Draft)
- **State:** READY FOR RE-AUDIT (not self-certified; no merge authorized)

### Remediated finding (ChatGPT audit of `42c0f4f` — FIX REQUIRED)

- **Issue:** Ambiguous PayPal draft creation outcome risked a duplicate remote create when search returned empty after 300s cool-off (empty search does not prove remote absence due to delayed search indexing); malformed `{}` search response was indistinguishable from empty search; unbound idempotency retention.
- **Remediation implemented:**
  1. **Fail-closed reconciliation:** In `claim.mode === "reconcile"`, an empty search result NEVER falls through to `createDraftInvoice`. Instead, it records `reconciliation_pending` with exponential/cool-off retry backoff; an empty search response is never treated as proof of absence, protecting against delayed search visibility.
  2. **Idempotency retention boundary:** Enforces maximum idempotency retention window (`maxIdempotencyAgeSeconds`, default 45 days per PayPal documentation). If an ambiguous attempt is older than retention, retries fail closed as `idempotency_expired`, requiring operator review rather than blind replay.
  3. **Hardened search parsing:** `searchResponse` schema in `@nmi/paypal` strictly requires an explicit `items` array or `total_items = 0`. Malformed `{}` or inconsistent shapes (`total_items > 0` with missing items array) fail validation and throw `PayPalOutcomeUnknownError("response_unparseable")`. Multi-page pagination (`total_pages > 1` or `total_items > items.length`) returns multiple IDs triggering `ambiguous_remote`.
  4. **Stable invoice date & payload digest:** Request body `invoice_date` is stabilized across replays using `saved.createdAt` / `existingOp.createdAt`. Payload digest is verified against reserved operation row; any body mismatch is rejected as `payload_digest_mismatch`.
  5. **Deterministic regression tests:** Replaced the unsafe 2nd-create test with a test asserting that a timed-out first create followed by empty search beyond 300s cool-off fails closed with `reconciliation_pending` and NEVER creates a second remote draft (`pp.log.create.length === 1`), then successfully reconciles once visibility catches up. Added tests for idempotency retention expiry, payload digest mismatch, and malformed/paginated search responses.

### Validation

Manual CI (pnpm 10.28.0, clean frozen install, PostgreSQL 16.15 disposable `nmi_test`):

- `pnpm validate`: lint, format:check, typecheck, unit tests (235 passed), build, bundle secret scan clean.
- `python3 scripts/validate_project_profile.py`: 24 core/selected capability files verified PASS.
- `pnpm audit --prod --audit-level high`: 0 vulnerabilities.
- `pnpm db:generate`: no schema changes, migrations in sync.
- `pnpm test:db`: 8 files, 178 tests passed against real PostgreSQL 16 (37 constraints, 19 approval store, 25 auth, 16 auth-store, 17 login races, 11 draft store, 9 operation store, 44 invoice-draft/PayPal routes). Total repository test count: 413 tests passing.
- `git diff --check`: clean, no whitespace errors.
- **NOT TESTED:** Real OpenAI parse; real PayPal sandbox OAuth/create/show/search (requires owner credentials in local `.env`, separately authorized).

### Next action

Independently audit the exact PR #4 head (PASS / PARTIAL / FIX REQUIRED). Do not merge, deploy, release, or execute PayPal sending/payment operations.

## Handoff: NMI-P2-I2-C4

- **Task / phase:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **From:** Antigravity (implementation agent, replacing Claude Code)
- **To:** ChatGPT GPT-6 (independent exact-head security, payment and idempotency audit)
- **Branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR #4, base `main` `9ebc191`)
- **PR:** #4 (Draft)
- **State:** READY FOR RE-AUDIT (not self-certified; no merge authorized)

### Remediated findings (ChatGPT audit of `355bf6a` — FIX REQUIRED)

- **C2 blocker confirmed resolved:** Empty search never falls through to create, returning `reconciliation_pending` without duplicate remote creates.
- **MEDIUM-1 (blocking) — Pagination sentinel becomes a fake invoice ID and poisons recovery:**
  - _Root cause:_ When PayPal search reported `total_pages > 1` but page 1 contained no item matching `invoice_number`, `matchingIds` was empty and `findInvoiceIdsByNumber` returned `["ambiguous_more_remote_pages"]`. The service treated this single element as a real invoice ID, attempted `getInvoice`, failed with `invalid_id`, and persisted `"ambiguous_more_remote_pages"` into `paypal_operations.paypal_invoice_id`, poisoning subsequent reconciliation and requiring manual DB intervention.
  - _Remediation implemented:_ Removed all pseudo-identifiers from `findInvoiceIdsByNumber`. Incomplete or multi-page searches (`total_pages > 1` or `total_items > items.length`) throw a typed `PayPalOutcomeUnknownError("search_incomplete")`. In `searchResponse`, inconsistent counts (`total_pages === 0` with items or `total_items === 0` with pages > 0) fail parsing as `response_unparseable`. Remote IDs in search items are strictly validated against `REMOTE_ID` regex. The service records `unknown` with code `"search_incomplete"` and NO remote ID, leaving `paypal_invoice_id = null` and preserving recoverable state.
  - _Regression tests:_ Added unit tests in `packages/paypal/src/client.test.ts` for incomplete search with no matching item on page 1, multi-page with matching item, `total_pages > 1` without `total_items`, inconsistent counts, and malformed item IDs. Added end-to-end fake HTTP / DB integration regression in `apps/api/src/invoice-drafts.pg.test.ts` proving no synthetic remote ID is saved in PostgreSQL, no second create occurs, and recovery succeeds cleanly once search completes.
- **MEDIUM-2 (blocking) — Due-date validation prevents reconciliation of an already-created remote draft:**
  - _Root cause:_ `assertExactMapping(saved.draft, today)` was evaluated unconditionally at the beginning of `createPayPalDraft`. If an invoice due date passed midnight while an ambiguous create attempt was in-flight or unknown, every subsequent retry was rejected as `mapping_refused: due_date_past` before reading the existing operation or checking PayPal, making a valid remote sandbox draft permanently unreconcilable precisely when its due date arrived.
  - _Remediation implemented:_ Split mapping validation: `assertExactMapping(saved.draft, today)` applies strictly to new create attempts only (`!existingOp || (existingOp.state !== "unknown" && existingOp.state !== "creating" && existingOp.createAttemptedAt === null)`). Existing in-flight/unknown operations validate against their persisted original intent date (`originalInvoiceDate = existingOp.createdAt`). A double-guard before the external `createDraftInvoice` call ensures that even if an existing operation were claimed, a new create request with a past due date is never sent. Exact-money verification, payload digest binding (`existing.payloadDigest === requestDigest(body)`), and `remote.dueDate === expected.dueDate` checks remain fully enforced.
  - _Regression test:_ Added deterministic PostgreSQL regression in `apps/api/src/invoice-drafts.pg.test.ts` where a draft created at T0 times out, the clock advances past midnight to T1 (`today > dueDate`), asserts that a new draft with past due date is refused (422 `due_date_past`), asserts that retrying the existing draft before visibility returns 409 `reconciliation_pending` without a second create (`pp.log.create.length === 1`), and asserts that once visibility catches up the remote invoice is verified and locally linked with 201 `created` without a second create.
- **MINOR — Documentation consistency:**
  - Updated `tasks/NMI-P2-I2-invoice-draft-flow.md` metadata to specify Antigravity and ChatGPT GPT-6 while preserving historical implementation notes.
  - Updated `apps/api/src/services/paypal-draft-service.ts` comments (lines 57-60) to accurately describe fail-closed reconciliation without automatic re-create and removed unproven claims of unconditional provider guarantees.

### Validation

Manual CI (pnpm 10.28.0, clean frozen install, PostgreSQL 16.15 disposable `nmi_test`):

- `pnpm validate`: lint, format:check, typecheck, unit tests (235 passed), build, bundle secret scan clean.
- `python3 scripts/validate_project_profile.py`: 24 core/selected capability files verified PASS.
- `pnpm audit --prod --audit-level high`: 0 vulnerabilities.
- `pnpm db:generate`: no schema changes, migrations in sync.
- `pnpm test:db`: 8 files, 180 tests passed against real PostgreSQL 16 (37 constraints, 19 approval store, 25 auth, 16 auth-store, 17 login races, 11 draft store, 9 operation store, 46 invoice-draft/PayPal routes). Total repository test count: 415 tests passing.
- `git diff --check`: clean, no whitespace errors.
- **NOT TESTED:** Real OpenAI parse; real PayPal sandbox OAuth/create/show/search (requires owner credentials in local `.env`, separately authorized).

### Next action

Independently audit the exact PR #4 head (PASS / PARTIAL / FIX REQUIRED). Do not merge, deploy, release, or execute PayPal sending/payment operations.

## Handoff: NMI-P2-I2-C5

- **Task / phase:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **From:** Antigravity (implementation agent)
- **To:** ChatGPT GPT-6 (independent exact-head security, payment and idempotency audit)
- **Branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR #4, base `main` `9ebc191`)
- **PR:** #4 (Draft)
- **State:** READY FOR RE-AUDIT (not self-certified; no merge authorized)

### Remediated findings (ChatGPT audit of `7f871c5` — FIX REQUIRED)

- **C3 findings confirmed resolved:** Search pagination pseudo-identifiers closed; main path of due date recovery resolved.
- **Residual MEDIUM (blocking) — Midnight race corrupts reconstruction of initial invoice date:**
  - _Root cause:_ The initial create request sampled `deps.clock()` and built the request body with `invoice_date` before calling `ops.reserve`. The database row generated `created_at` independently via PostgreSQL `now()`. If a request arrived near UTC midnight, `created_at` could be stamped on D+1 while the outbound request was sent on day D. On subsequent retry/reconciliation, `existingOp.createdAt` yielded D+1, causing `assertExactMapping` to reject the draft as `due_date_past` before search/reconciliation, and mutating the rebuilt request body/digest.
  - _Remediation implemented:_
    1. **Persist canonical `invoice_date` in database:** Added column `invoice_date` and format check constraint (`invoice_date is null or invoice_date ~ '^\d{4}-\d{2}-\d{2}$'`) to `paypal_draft_operations` via forward migration `0006_known_colleen_wing.sql` (migrations `0000`-`0005` preserved byte-identical).
    2. **Store on reservation:** `ops.reserve` accepts and persists the exact `invoiceDate` used for the initial request.
    3. **Reconstruct from persisted operation:** On retry/reconciliation, `existingOp.invoiceDate` is used directly as the single immutable source of truth, completely decoupled from database `created_at` or future clock sampling.
    4. **Single clock capture:** `deps.clock()` is sampled once per request at entry (`clockNow = deps.clock()`), preventing sampling drift across midnight during request handling.
    5. **Security documentation corrected:** Updated `docs/SECURITY.md` (section "At-most-one sandbox draft creation") to remove outdated cool-off re-create wording and accurately document local fencing and fail-closed reconciliation.
- **Deterministic regressions:**
  - `apps/api/src/invoice-drafts.pg.test.ts`:
    - Added test forcing a deliberate divergence where initial request body `invoice_date = 2026-10-25`, the DB row `created_at` is updated to `2026-10-26T00:00:01.000Z`, and retry occurs on day `2026-10-26` with `dueDate = 2026-10-25`. Asserts no pre-reconciliation refusal, stable payload digest identity, exactly one remote create call (`pp.log.create.length === 1`), and verified local link.
    - Added test for clock sampling drift across midnight boundary on fresh create, proving consistent single-date usage.
  - `packages/db/src/constraints.pg.test.ts`: Added assertion verifying `paypal_draft_operations_invoice_date_format` check constraint rejects invalid date strings.
  - `packages/db/src/paypal-operation-store.pg.test.ts`: Added test asserting `ops.reserve` stores and returns `invoiceDate`.

### Validation

Manual CI (pnpm 10.28.0, clean frozen install, PostgreSQL 16.15 disposable `nmi_test`):

- `pnpm validate`: lint, format:check, typecheck, unit tests (235 passed), build, bundle secret scan clean.
- `python3 scripts/validate_project_profile.py`: 24 core/selected capability files verified PASS.
- `pnpm audit --prod --audit-level high`: 0 vulnerabilities.
- `pnpm db:generate`: no uncommitted schema drift, migration `0006` in sync, `0000`-`0005` byte-identical.
- `pnpm test:db`: 8 files, 182 tests passed against real PostgreSQL 16 (37 constraints, 19 approval store, 25 auth, 16 auth-store, 17 login races, 11 draft store, 9 operation store, 48 invoice-draft/PayPal routes). Total repository test count: 417 tests passing.
- `git diff --check`: clean, no whitespace errors.
- **NOT TESTED:** Real OpenAI parse; real PayPal sandbox OAuth/create/show/search (requires owner credentials in local `.env`, separately authorized).

### Next action

Independently audit the exact PR #4 head (PASS / PARTIAL / FIX REQUIRED). Do not merge, deploy, release, or execute PayPal sending/payment operations.

## Handoff: NMI-P2-I2-C6

- **Task / phase:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **From:** Antigravity (implementation agent)
- **To:** ChatGPT GPT-6 (independent exact-head security, payment and idempotency audit)
- **Branch:** `phase-2/nmi-invoice-drafts-i2` (Draft PR #4, base `main` `9ebc191`)
- **PR:** #4 (Draft)
- **State:** READY FOR RE-AUDIT (not self-certified; no merge authorized)

### Remediated findings (ChatGPT audit of `3e28c0c` — FIX REQUIRED)

- **C4 finding confirmed resolved:** Persistence of exact `invoice_date` via migration `0006`, single clock sampling per request, and `docs/SECURITY.md` fail-closed reconciliation confirmed fixed.
- **C5 MEDIUM (blocking) — Concurrent first-time reservation across UTC midnight sends mismatched `invoice_date`:**
  - _Root cause:_ Two concurrent requests racing on a fresh draft across midnight both sampled `ops.get = null` and pre-built their request bodies with their local sampled dates before `ops.reserve`. When request A won the atomic `reserve`, request B's `reserve` call returned request A's row on conflict. However, request B retained its pre-built body. If request B then won the fenced lease claim, `requestDigest(body)` (which excludes `invoice_date` for replay stability) matched `existing.payloadDigest`, so request B sent its pre-built body (dated D+1) to PayPal while the database row asserted date D.
  - _Remediation implemented:_
    1. **Rebuild canonical request body from atomic reservation row:** In `apps/api/src/services/paypal-draft-service.ts`, after `existing = await ops.reserve(...)`, canonical `canonicalInvoiceDate` is derived strictly from `existing.invoiceDate` returned by PostgreSQL. The request body (`body`) and verification expectation (`expected`) are rebuilt from `canonicalInvoiceDate` before lease claiming or dispatching.
    2. **Enforce date identity independently of payload digest:** In addition to `existing.payloadDigest === requestDigest(body)`, explicitly enforce `claim.op.invoiceDate === null || claim.op.invoiceDate === body.detail.invoice_date`, guaranteeing date identity even with a date-excluding digest.
    3. **Preserve fresh create vs reconciliation due date guards:** Fresh create attempts require `dueDate >= today` (even if adopting an earlier pending reservation date); reconciliation of already-attempted drafts validates against `canonicalInvoiceDate` without blocking on expired due dates.
    4. **Safe legacy fallback:** Documented and verified safe fallback for legacy rows where `invoice_date IS NULL` (migration 0005) to `created_at`.
    5. **Documentation updated:** Updated `docs/SECURITY.md` section on at-most-one draft creation to document canonical request body reconstruction from the atomic reservation row.
- **Deterministic regressions:**
  - `apps/api/src/invoice-drafts.pg.test.ts`:
    - Added deterministic two-request test straddling UTC midnight where Request A reserves first (day D) and Request B claims first: asserts Request B rebuilds canonical body, outbound create has `detail.invoice_date = dateD`, DB row has `invoice_date = dateD`, exactly 1 create call, Request A gets 409 `in_progress`, and replay succeeds.
    - Added deterministic test where Request A reserves first and claims first: asserts outbound `invoice_date = dateD`, exactly 1 create call, Request B gets 409.
    - Added deterministic test where Request B reserves first (day D+1) and Request A claims first: asserts Request A adopts Request B's winning reservation date, outbound `invoice_date = dateD+1`, DB row has `dateD+1`, exactly 1 create call.
    - Added deterministic test for earlier pending reservation whose due date has passed: asserts fresh create on D+1 is refused with 422 `due_date_past` without calling PayPal.
    - Added deterministic test for legacy row with `invoice_date IS NULL`: asserts safe fallback to `created_at` and successful reconciliation without date mismatch.

### Validation

Manual CI (pnpm 10.28.0, clean frozen install, PostgreSQL 16.15 disposable `nmi_test`):

- `python3 scripts/validate_project_profile.py`: 24 core/selected capability files verified PASS.
- `pnpm lint`: clean, no linter errors.
- `pnpm format:check`: clean, all files formatted.
- `pnpm typecheck`: clean, 8 workspace packages checked.
- `pnpm test`: 235 passed unit tests.
- `pnpm test:db`: 8 files, 187 tests passed against real PostgreSQL 16 (37 constraints, 19 approval store, 25 auth, 16 auth-store, 17 login races, 11 draft store, 9 operation store, 53 invoice-draft/PayPal routes). Total repository test count: 422 tests passing.
- `pnpm build && pnpm check:bundle`: build clean, bundle secret scan clean (2 files).
- `pnpm audit --prod --audit-level high`: 0 vulnerabilities.
- `pnpm db:generate`: no schema drift, migrations `0000`-`0006` verified.
- `git diff --check`: clean, no whitespace errors.
- **NOT TESTED:** Real OpenAI parse; real PayPal sandbox OAuth/create/show/search (requires owner credentials in local `.env`, separately authorized).

### Next action

Independently audit the exact PR #4 head (PASS / PARTIAL / FIX REQUIRED). Do not merge, deploy, release, or execute PayPal sending/payment operations.

## Handoff: NMI-P2-I2-ACCEPTANCE

- **Task / phase:** `tasks/NMI-P2-I2-invoice-draft-flow.md`
- **From:** Product owner / GPT-6 (accepted implementation and independent source/CI review)
- **To:** Independent reviewer of Draft PR #5 documentation
- **Branch:** `docs/paypal-sandbox-app-name`
- **Implementation head:** `07409bf32068362b9f5b711b64ef0399d588169e` on `main` (squash of audited `4982201918d0030234fdbabbc297375c02c01e5d`)
- **PR:** [#4](https://github.com/mrdzyn/nudgemyinvoice/pull/4) **MERGED**; [#5](https://github.com/mrdzyn/nudgemyinvoice/pull/5) Draft **DOCS ONLY**
- **State:** NMI-P2-I2 **OWNER ACCEPTED** on 2026-10-26; docs sync awaiting independent audit

### Completed

- Scoped C6 independent audit and hosted CI PASS at exact implementation HEAD; owner accepted and separately approved native GitHub squash merge.
- Real single-create PayPal Sandbox smoke (AG provider evidence): OAuth `200`, create `201`, read-only GET `200` (executed with one fictitious USD 5.00 line item, zero tax, zero discount); `INV2-U92W-76NX-3P2E-AGUZ`, `DRAFT` USD 5.00; local operation `created`, attempt `1`, reference/date/number match.
- No send, reminder, refund, cancellation, payment, deployment or production operation; Sandbox create feature flag restored to `false`; private exhausted test budget preserved.

### Validation

- AG reports `pnpm validate` PASS (235 unit), `TEST_DATABASE_URL=... pnpm test:db` PASS (187 PostgreSQL); GitHub Project Baseline and Stack CI independently confirmed SUCCESS on PR #4 at `4982201918d0030234fdbabbc297375c02c01e5d`.
- Genuine OpenAI Responses provider smoke: **NOT TESTED**. Real PayPal remote search/reconciliation/timeout/error-path behavior, alternative recipient/invoicer shapes, and tax/discount mappings are **NOT TESTED** against live PayPal Sandbox (verified with deterministic mock transports and PostgreSQL tests only).
- PR #5 docs-only changes need their own exact-head checks and independent review; the prior code PR CI does not apply to its new SHA.

### Continuation notes

- Update canonical docs truthfully; maintain historical C6 handoff unchanged and keep buyer/merchant contact information, secrets and tokens outside GitHub.
- Operational limitations: in-memory auth throttling is single-process; approval consumption and audit logging are separate statements; database least-privilege role configuration is a deployment concern. See [security boundaries](SECURITY.md).
- **Open code remediation (known review finding):** Codex review on PR #4 identified that CORS `allowedHeaders` in `apps/api/src/app.ts:61–65` omits `Idempotency-Key` (though invoice save supports that header). It has no effect today because the web app is a placeholder and Vite proxies only `/health`, but it will block cross-origin browser callers sending an idempotency key. This code remediation is deferred from this docs-only PR to a proposed bounded follow-up task before cross-origin browser invoice-save integration:
  1. Add `Idempotency-Key` to CORS `allowedHeaders` in `apps/api/src/app.ts`.
  2. Add browser-style `OPTIONS` preflight regression test in `apps/api/src/app.test.ts`.
  3. Verify unapproved origins remain blocked.
  4. Verify session, Origin, and CSRF checks remain unchanged.
  5. Independent review before merge.
- No new PayPal create is authorized; do not reset local one-create guard or enable sending/webhooks.
- No approved UI design or next implementation phase. This is a docs reconciliation handoff, not release clearance.

### Next action

Independently audit Draft PR #5's exact HEAD, documentation diff and applicable CI; request separate owner approval before merging PR #5.

## Handoff: NMI-CORS-01-REMEDIATION

- **Task / phase:** `tasks/NMI-CORS-01-idempotency-header.md`
- **From:** Implementation agent (Antigravity)
- **To:** Independent auditor (Codex) / Product owner
- **Branch:** `fix/nmi-cors-idempotency-header`
- **Base commit:** `397c5d0376ef37cfd7f7debb93ac3f8387be5fea` (`main`)
- **PR:** Draft PR (NMI-CORS-01)
- **State:** Implementation and regression tests complete; awaiting independent audit

### Completed

- In `apps/api/src/app.ts`, updated `@fastify/cors` registration: added `"idempotency-key"` to `allowedHeaders: ["content-type", "x-csrf-token", "idempotency-key"]`.
- In `apps/api/src/app.test.ts`, added browser-style preflight test suite verifying:
  - `OPTIONS /api/invoice-drafts` requesting `POST` with `content-type`, `x-csrf-token`, and `idempotency-key` returns 204 with all three headers in `access-control-allow-headers`.
  - Permitted preflight includes `access-control-allow-origin: <WEB_ORIGIN>` and `access-control-allow-credentials: true`.
  - Case-insensitive browser header casing (e.g. `Idempotency-Key`) is matched and accepted.
  - Foreign origin (e.g. `https://evil.example`) receives no CORS allow headers.
  - Unlisted custom request headers (e.g. `x-unlisted-custom-header`) are not added to `access-control-allow-headers`.
- Preserved all security invariants: exact `WEB_ORIGIN` equality check, allowed HTTP methods (`GET`, `POST`, `OPTIONS`), mutating request fail-closed Origin validation, session cookie authentication, and CSRF token verification.
- Documented bounded task in `tasks/NMI-CORS-01-idempotency-header.md`.
- Updated `docs/STATUS.md` confirming PR #5 squash merge (`397c5d0376ef37cfd7f7debb93ac3f8387be5fea`), recording NMI-P2-I2 as complete, and activating NMI-CORS-01.

### Validation

- `apps/api/src/app.test.ts`: 13/13 tests pass (including new CORS preflight cases).
- `pnpm validate`: PASS (lint, format:check, typecheck, 236 unit tests, build, bundle-size scan).
- `TEST_DATABASE_URL=... pnpm test:db`: PASS (187 PostgreSQL integration tests, including invoice draft idempotency tests).
- `python3 scripts/validate_project_profile.py`: PASS.
- Real PayPal Sandbox and OpenAI providers: zero external requests dispatched; 1/1 Sandbox budget guard remains intact and exhausted.

### Continuation notes

- UI design gate remains Not applicable for this backend/security fix.
- No schema, database, migration, or dependency changes.
- Once independently audited and approved, Draft PR can be marked ready for owner review and squash merge into main.

### Next action

Independently audit Draft PR for NMI-CORS-01 (`fix/nmi-cors-idempotency-header`) against task contract, security boundaries, and hosted CI.

## Handoff: NMI-CORS-01-C2

- **Task / phase:** `tasks/NMI-CORS-01-idempotency-header.md`
- **From:** Implementation agent (Antigravity)
- **To:** Independent auditor (Codex) / Product owner
- **Branch:** `fix/nmi-cors-idempotency-header`
- **Base commit:** `397c5d0376ef37cfd7f7debb93ac3f8387be5fea` (`main`)
- **PR:** [#6](https://github.com/mrdzyn/nudgemyinvoice/pull/6) (Draft, NMI-CORS-01)
- **Code implementation HEAD:** `eb2b8e3103d04cd7eddbbbdf24d3651f8a7e8a8c`
- **Audit reference:** [PR #6 comment 6419991326](https://github.com/mrdzyn/nudgemyinvoice/pull/6#issuecomment-6419991326) (PASS WITH MINOR FINDINGS) and [PR #6 comment 6420379629](https://github.com/mrdzyn/nudgemyinvoice/pull/6#issuecomment-6420379629) (FIX REQUIRED for GOV-1)
- **State:** Implementation complete; documentation governance GOV-1 resolved; awaiting final independent audit verification

### Completed

- Restored original `NMI-CORS-01-REMEDIATION` handoff section exactly as published at `eb2b8e3103d04cd7eddbbbdf24d3651f8a7e8a8c` to maintain historical integrity.
- Appended this new unique handoff `NMI-CORS-01-C2` documenting audit findings, documentation closure, test reconciliation, and stability tracking.
- Code implementation and tests remain byte-identical to audited `eb2b8e3103d04cd7eddbbbdf24d3651f8a7e8a8c`:
  - `apps/api/src/app.ts`: CORS `allowedHeaders` explicitly includes `"idempotency-key"`.
  - `apps/api/src/app.test.ts`: browser-style preflight regression tests verifying 204 response, credentials, case-insensitivity, and rejection of foreign origins / unlisted headers.
- Reconciled task test counts in `tasks/NMI-CORS-01-idempotency-header.md` to 236 unit + 187 PostgreSQL = 423 total passing tests and ticked verified acceptance checkboxes.
- Updated `docs/STATUS.md` pointing `Active handoff` to `NMI-CORS-01-C2` while preserving historical P2-I2 test counts (235/422).

### Validation

- `apps/api/src/app.test.ts`: 13/13 unit tests pass.
- `pnpm validate`: PASS (lint, format:check, typecheck, 236 unit tests, build, bundle-size scan).
- `TEST_DATABASE_URL=... pnpm test:db`: PASS (187 PostgreSQL integration tests, including draft idempotency tests).
- Total automated tests: 236 unit + 187 PostgreSQL = 423 passing tests (historical P2-I2 count was 235 unit / 422 total).
- `python3 scripts/validate_project_profile.py`: PASS.
- Zero calls made to external PayPal or OpenAI providers; 1/1 Sandbox budget guard remains intact and exhausted.

### Test-stability observation

- Hosted Stack CI attempt 1 at code HEAD `eb2b8e3` had an intermittent 20-second timeout on `apps/api/src/invoice-drafts.pg.test.ts` concurrency test (`"12 simultaneous requests (double click)..."`, 186/187 database tests passed).
- Attempt 2 passed completely (187/187 database tests) on the exact same commit without code changes.
- Tracked for separate test-stability investigation; no causal link to this CORS change was established. Concurrency assertions are preserved without weakening.

### Continuation notes

- UI design gate remains Not applicable for this backend/security fix.
- No schema, database, migration, or dependency changes.
- The task does not claim a final independent PASS; awaiting final independent verification.

### Next action

Final independent audit verification of Draft PR #6 (`fix/nmi-cors-idempotency-header`). Await separate product owner merge authorization.

## Handoff: NMI-UI-01A-DESIGN

- **Task / phase:** `tasks/NMI-UI-01A-invoice-interface-design.md`
- **From:** Implementation agent (Antigravity)
- **To:** Product owner / Design reviewer
- **Branch:** `design/nmi-ui-01a-invoice-interface`
- **Base commit:** `2864761ca902ffd6ed6628c183298bcc6e5c59c1` (`main`)
- **State:** Interface design complete; awaiting owner visual approval (design-only increment; no production frontend shell or backend logic changes).

### Completed

- **Design Specifications (`design/screens/NMI-UI-01A-SCREENS.md`):**
  - Comprehensive screen map, navigation architecture (Desktop top header & sub-nav / Mobile bottom tabs), and user flows.
  - Detailed layout wireframes, component contracts, and responsive behavior for all 5 screens:
    1. Operator Login & Authenticated Shell (persistent PayPal Sandbox badge and warning banner).
    2. Multi-Currency Invoice Dashboard (currency summary cards for USD, EUR, and JPY; local drafts table; AG Studio boundary).
    3. Natural-Language Invoice Composer (AI textarea, prompt chips, mode switcher to manual entry, clarification panel).
    4. Structured Review & Edit (recipient, invoice metadata, line items grid, discount, tax, integer minor-unit totals calculation).
    5. Local Invoice Detail & PayPal Sandbox Draft Status (local draft timeline, isolated PayPal Sandbox staging action with guardrails).
  - Complete interaction state matrix: Auth (authenticated, unauthenticated, expired), Data (loading, empty, success, error, offline), AI (in-flight, clarification, invalid proposal, unavailable fallback), Form validation & rounding guards, and PayPal Sandbox provider states (503 disabled, 409 lease/reconciling, 502 rejected, 502 unknown, 200/201 created).
  - Accessibility contract targeting WCAG 2.2 AA (>= 4.5:1 contrast, visible 2px focus indicators, ARIA live regions, keyboard navigation, reduced motion).
- **Design Tokens (`design/tokens/design-tokens.json`):**
  - Updated with NudgeMyInvoice semantic palette, including Light and Dark mode tokens, PayPal Sandbox identity tokens, currency tokens, typography, spacing, radii, shadows, and breakpoints.
- **Synthetic Fixtures (`design/fixtures/invoice-fixtures.json`):**
  - Realistic multi-currency fixtures for USD ($633.26), EUR (€1,517.25), and JPY (¥143,000, 0 exponent).
  - Synthetic sample prompts for AI parsing validation.
  - Strictly synthetic data; zero real customer credentials or PII.
- **Interactive Browser Mockup (`design/preview/index.html`):**
  - Standalone, zero-dependency HTML/CSS/JS preview allowing interactive review of all 5 screens.
  - Reviewer toolbar with screen switcher (1-5), responsive viewport presets (Desktop 1280px, Tablet 768px, Mobile 375px), theme toggle (Light/Dark), and state switcher (Default, Empty, Loading, Clarification, AI Unavailable, Validation Errors, Offline, PayPal Disabled, Session Expired).
  - Form calculation logic demonstrating minor-unit math and dynamic currency formatting.
- **Architectural Truthfulness & API Seams:**
  - Clearly documented that backend provides `GET /api/invoice-drafts/:id` but lacks `GET /api/invoice-drafts` collection listing. Dashboard is explicitly labeled as using synthetic fixtures until collection endpoint is implemented.
  - Clarified that creating a PayPal Sandbox draft generates a remote invoice in `DRAFT` status and does **NOT** email the recipient or request payment.
  - Documented accessible native HTML5 table fallback for the dashboard grid, establishing the plug-in seam for `ag-studio-react` upon licensing and trial authorization (active through Dec 15).

### Validation

- `python3 scripts/validate_project_profile.py`: PASS.
- `pnpm validate`: PASS (lint, format:check, typecheck, 236 unit tests, build, bundle-size scan).
- `TEST_DATABASE_URL=... pnpm test:db`: PASS (187 PostgreSQL integration tests).
- Total automated tests: 236 unit + 187 PostgreSQL = 423 passing tests.
- Zero external provider calls to PayPal Sandbox or OpenAI; single-create test guard budget remains exhausted (1/1).

### Continuation notes

- **UI Design Gate:** Explicit owner visual approval is required before building the production UI shell or wiring backend endpoints.
- No modifications made to `apps/web/src` or `apps/api/src`.
- No new runtime dependencies or package installations.

### Next action

Open Draft PR and request owner visual approval on `design/preview/index.html` and `design/screens/NMI-UI-01A-SCREENS.md`.

## Handoff: NMI-UI-01A-REMEDIATION-1

- **Task / phase:** `tasks/NMI-UI-01A-invoice-interface-design.md`
- **From:** Implementation agent (design remediation)
- **To:** Independent reviewer of Draft PR #7, then product owner
- **Branch:** `design/nmi-ui-01a-invoice-interface`
- **Audited head being remediated:** `ad69ad8d33f15500eed269bb556f9f60eb76e5f5` ([FIX REQUIRED](https://github.com/mrdzyn/nudgemyinvoice/pull/7#issuecomment-6422310129))
- **State:** READY FOR INDEPENDENT RE-AUDIT. Design-only; owner visual approval not given or predeclared. The earlier `NMI-UI-01A-DESIGN` entry above is preserved unchanged as history; where it conflicts with this entry (for example the AG Studio trial wording and the unsupported fields), this entry and the current task/spec govern.

### Completed

- **MAJOR-1:** preview rewritten with no inline handlers; every state (loading, validation errors, manual entry, clarification, currency change, line add/remove, PayPal disabled and the other PayPal outcomes, confirmation dialog) is reachable and fixture-only.
- **MAJOR-2:** login now requires username and password (empty password, no remember-me); AI input limit is 2,000 with counter and error state; review form matches the strict schema (required customer email; invoice number, issue date, PO/reference and fixed tax removed and listed as deferred); no Delete, Updated-at, dispatch time or audit timeline; rounding described honestly with a PayPal refusal preview instead of silent correction; only server-computed totals are labelled as such.
- **MAJOR-3:** fixtures no longer contain the genuine Sandbox smoke invoice id (fabricated `INV2-DEMO-FAKE-...` ids). Fixtures were also corrected so a "PayPal created" invoice is one the real mapping rules would accept; a fourth GBP fixture demonstrates a refused draft. All fixtures are checked against the real `calculateTotals` and `assertExactMapping`.
- **MINOR-4:** AG Studio described as unverified and not enabled; OpenAI disclosure says text may be sent when configured and real parsing is NOT TESTED.
- Tokens v1.1.0: dark primary action colour fixed for contrast, muted text and input borders adjusted.
- Evidence: `design/evidence/NMI-UI-01A/` (QA-RESULTS.md, 59 screenshots, reproducible `run-browser-qa.mjs`) and `design/fixtures/verify-fixtures.mjs`.

### Validation

- Real headless Chrome run, 93 of 93 automated checks passed: keyboard-only end-to-end flow with real key events, dialog focus trap and restore, contrast across 5 screens and 23 states in both themes, no horizontal scroll at 390px and 320px, mobile 44px and desktop 24px targets, focus outlines, reduced motion, zero http(s) requests and zero console errors.
- `verify-fixtures.mjs`: all checks passed. `python3 scripts/validate_project_profile.py` and `pnpm validate` passed locally. Hosted CI at the exact new head is recorded on the PR.
- **NOT covered:** screen reader testing, real touch devices, Safari/Firefox, 400% zoom (320px reflow checked instead).
- No PayPal or OpenAI call; the preview runs under a CSP that forbids network access. Real OpenAI parsing and PayPal search/reconciliation error paths remain NOT TESTED against the live providers.

### Continuation notes

- Open owner decisions are listed in section 8 of `design/screens/NMI-UI-01A-SCREENS.md` (AG Studio license, session-expiry draft retention, list endpoint, draft editing).
- Do not modify `apps/web` or `apps/api`, start NMI-UI-01B, merge or deploy without separate owner direction.

### Next action

Independently re-audit Draft PR #7 at its exact HEAD; the owner then decides on visual approval.

## Handoff: NMI-UI-01B-C1

- **Task / phase:** `tasks/NMI-UI-01B-react-shell.md`
- **From:** Implementation agent (Claude)
- **To:** Independent reviewer (GPT-6), then product owner
- **Branch:** `feat/nmi-ui-01b-react-shell`
- **Implementation head:** the PR head is authoritative (a docs commit cannot name its own SHA); the exact SHA is recorded in the PR description and its audit-request comment
- **PR:** new Draft PR against `main` (base `b9962a2614af0e69fb565cbe4a0e7d6a64506b4d`)
- **State:** READY FOR INDEPENDENT AUDIT. Not merged; owner approval for merge not given.

### Completed

- Owner approval of NMI-UI-01A (design HEAD `76549b3`, merged as `b9962a2`) and decisions D1-D4 recorded in the task and STATUS.
- Implemented the five approved screens in `apps/web` (React 19, TypeScript, existing Vite): `domain/` (pure money and form logic), `demo/` (fixtures, scenarios, in-memory reducer), `components/`, `features/{login,dashboard,composer,review,detail}`, tokens as CSS variables. No new runtime dependency; AG Studio, router, state manager, icon/font/CDN packages not used.
- Fixture-only: every result is simulated and labelled; fabricated PayPal ids only; no storage, cookies, IndexedDB, query-string data, analytics or logging; production CSP with `connect-src 'none'`.
- Added `vitest` include for `apps/web` (config only) and 71 web tests, plus a real-Chrome QA harness and evidence under `design/evidence/NMI-UI-01B/`.

### Validation

- Local: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (307 passed, 187 PostgreSQL tests skipped locally because no disposable database was provisioned; hosted Stack CI runs them), `pnpm build`, `pnpm check:bundle`, `scripts/validate_project_profile.py`.
- Real headless Chrome QA: all checks pass (see `design/evidence/NMI-UI-01B/QA-RESULTS.md`): keyboard journeys, dialog focus, contrast in both themes, no overflow at 320/390/768/1280, targets, focus outlines, reduced motion, zero foreign requests, empty storage, URL free of invoice content.
- Screenshots compared to the approved PR #7 evidence; one deliberate deviation: the approved mobile detail captures overflowed (436px in a 390px viewport) and the React shell fixes that.
- **NOT covered:** screen readers, real touch devices, Safari/Firefox, 400% zoom; full WCAG 2.2 AA not claimed. Real OpenAI and PayPal provider behaviour not exercised (and not callable from this shell).

### Continuation notes

- Do not wire any real API, change server configuration, enable `PAYPAL_DRAFTS_ENABLED`, merge, deploy or start NMI-UI-01C without separate owner authorization.
- The design-review control bar is kept from the approved preview and labelled "not part of the product UI"; remove or gate it when real APIs are wired.
- Prior handoffs are preserved unchanged.

### Next action

Independently audit the Draft PR at its exact head; the owner then decides on merge.

## Handoff: NMI-UI-01B-R1

- **Task / phase:** `tasks/NMI-UI-01B-react-shell.md`
- **From:** Implementation agent (Claude)
- **To:** Independent reviewer (GPT-6), then product owner
- **Branch:** `feat/nmi-ui-01b-react-shell`
- **Audited head being remediated:** `7677569f35ba789a2d9d49214295a82a5cec1874` ([FIX REQUIRED](https://github.com/mrdzyn/nudgemyinvoice/pull/8#issuecomment-6432385788)); the new exact head is the PR head and is recorded in the PR comment
- **PR:** #8 (Draft)
- **State:** READY FOR INDEPENDENT RE-AUDIT. Not merged; no merge authorization.

### Completed

- **MAJOR-1:** simulated idempotency replay now returns the existing draft (same id and record) with no insert and no saved-count change; new keys still create normally; rapid double-submit protection and the simulated 409 conflict path unchanged. Reducer holds a simulated key table; keys are deterministic per form.
- Minor: line-description `maxLength` aligned to the backend's 200.
- Tests: 4 new reducer regression tests (75 web tests; 311 repo tests pass, 187 PostgreSQL tests skipped locally and run in hosted Stack CI); mutation check proves they fail if replay is disabled. Chrome QA extended to prove replay (existing id/record, unchanged dashboard rows and currency cards, later new save gets the first fresh id): 112 of 112 checks pass.
- Task and STATUS updated. Earlier handoffs untouched. The PR description records the earlier exact-head CI (Project Baseline 40439032672 PASS, Stack 40439032658 PASS at `7677569`).

### Validation

Local `pnpm validate` and the profile validator pass; hosted CI at the new exact head is recorded on the PR. Not covered: screen readers, real touch, Safari/Firefox, 400% zoom (no full WCAG 2.2 AA claim).

### Continuation notes

Visuals, D1-D4, fixture-only data, strict CSP and no browser storage are unchanged. No real API wiring, new dependency, provider call, merge, deployment or NMI-UI-01C.

### Next action

Independently re-audit PR #8 at its exact head.

## Handoff: NMI-UI-01C1-START

- **Task / phase:** `tasks/NMI-UI-01C1-auth-session.md` (phase plan: `tasks/NMI-UI-01C-integration-plan.md`)
- **From:** GPT-6 orchestration / owner authorization to start NMI-UI-01C
- **To:** Claude implementation agent, then GPT-6 independent exact-HEAD audit
- **Starting main:** `a4520440c748ff8712a10e9f65b389e8cde5db9c` (owner squash-merged PR #8)
- **Branch:** `feat/nmi-ui-01c1-auth-session`
- **State:** Task contract and branch prepared. **No application code changed yet**; C1 real auth integration is NOT IMPLEMENTED. Stop at Draft PR independent audit; separate owner merge approval required.

### Work boundary and decisions

- Real browser operator login, GET session restore, protected navigation, POST logout, local same-origin `/api` transport, strict CSP and safe memory cleanup only. All invoice features remain synthetic/fixture-only for this slice and visibly labelled.
- Preserve owner D1–D4, use no real customer data and do not store credentials/CSRF/unsaved invoices in browser storage or URLs. Hard deny unauthenticated navigation/hash/demo-state bypass in real mode.
- Backend cookie/Origin/CSRF, auditing, rate limits and PostgreSQL auth remain authoritative. No API auth-policy weakening or schema change.
- Previously authorized PayPal Sandbox one-create budget is exhausted. No PayPal writes, OpenAI inference, deployments, merges, reminders or NMI-UI-01C2 in this slice.

### Evidence required

- Targeted auth/browser navigation and security regression tests, at least one authenticated local browser → API → disposable PostgreSQL run, CSP/no-storage checks, required hosted CI at exact implementation HEAD, browser screenshots and handoff.
- Previous task status on `main` was stale after PR #8 squash merge; this branch's STATUS reconciles it.

### Next action

Claude implements the active contract on this same branch and Draft PR, posts exact SHA and evidence for GPT-6 independent audit. No auto-merge, no deployment.

## Handoff: NMI-UI-01C1-IMPL

- **Task / phase:** `tasks/NMI-UI-01C1-auth-session.md` (plan: `tasks/NMI-UI-01C-integration-plan.md`)
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit; then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c1-auth-session`, Draft PR #9. **Implementation SHA:** `e7ee3e33aefc17f68d76d1fdc458e5ab22d66f17` (a later docs-only commit records this handoff; audit the code at the implementation SHA and confirm the later commits touch only docs).
- **State:** READY FOR INDEPENDENT AUDIT. Real browser login, session restore, protected navigation and honest logout are implemented; invoice features are still synthetic fixtures. Not self-certified, not merged, not deployed.

### What changed

- New `apps/web/src/auth/*`, `RealApp.tsx`, `features/login/RealLoginScreen.tsx`, `screens.tsx`; `main.tsx` mounts the real app; the synthetic preview is dev-only behind `VITE_NMI_SYNTHETIC_PREVIEW=1` and absent from production bundles; production CSP `connect-src 'self'`; `/api` proxy for dev and preview; docs in `docs/ARCHITECTURE.md` and `docs/SECURITY.md`.
- Unchanged: `apps/api`, `packages/*`, migrations, auth policy, Origin/CSRF/cookie rules. No OpenAI or PayPal configuration or call exists in any run.

### Evidence

- Local at `e7ee3e3`: lint, format, typecheck, build, bundle scan, profile validation pass; 364 tests pass, 187 PostgreSQL-only tests skipped locally (unchanged code; run in hosted Stack CI).
- Real browser -> Vite preview (strict CSP) -> Fastify -> disposable PostgreSQL 16.15: 105/105 checks (`design/evidence/NMI-UI-01C1/QA-RESULTS.md`, re-run with `pnpm --filter @nmi/web build && node design/evidence/NMI-UI-01C1/run-auth-journey.mjs`; needs Chrome and Homebrew PostgreSQL 16; API on port 3101 by default).
- Hosted CI at `e7ee3e3`: Project baseline / Common validation PASS (run 40458040856); Stack validation PASS (run 40458040859).

### Audit focus and known limits

- Review the four deliberate behaviours listed in the task's implementation record (generic 403 on login; transient errors on periodic re-check keep the workspace; unconfirmed logout wording; Retry-After shown but button not disabled).
- Not verified: `__Host-` Secure cookie in a browser (HTTPS), screen readers, real touch, Safari/Firefox, 400% zoom, hosted reverse-proxy deployment. Throttling remains in-memory per process.
- The 01B browser QA harness is superseded for the production page (it assumed the synthetic shell as the default page).

### Next action

Audit exact head, then owner decides on merge. C2 needs separate authorization.

## Handoff: NMI-UI-01C1-R1

- **Task / phase:** `tasks/NMI-UI-01C1-auth-session.md` (section "Audit remediation: MEDIUM-1")
- **From:** Claude implementation agent (remediation of the GPT-6 audit of `ad756b0`: FIX REQUIRED, one MEDIUM)
- **To:** GPT-6 independent exact-head re-audit; then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c1-auth-session`, Draft PR #9. **Remediation code SHA:** `f2f7fd8f8e9b02890cb04d0220b8e2c5c89326df`; the PR head is a later docs-only commit (task, STATUS, this handoff). Confirm the commits after the code SHA touch only docs.
- **State:** READY FOR INDEPENDENT RE-AUDIT. Not self-certified, merged or deployed. Scope was only the pending-logout exposure.

### What changed

- Sign-out enters a `signing-out` auth state synchronously, so `RealView` unmounts the workspace and all in-memory drafts at the click; a polite "Signing out…" status shows. Revocation continues via the existing CSRF-protected `POST /api/auth/logout`, bounded to 10 s; confirmed only on 204; 401 -> session ended; 403/503/offline/timeout -> "unconfirmed"; duplicate clicks and stale results ignored; the old workspace never returns; re-authentication gets a fresh epoch. Files: `auth/logout.ts` (new), `auth/authState.ts`, `auth/useAuthController.ts`, `RealApp.tsx`, small `AppShell`/`AppContext` cleanup, tests, browser journey.
- Unchanged: `apps/api`, `packages/*`, migrations, cookie/CSRF/Origin, CSP, fixture-only boundary.

### Evidence

- Local at `f2f7fd8`: lint, format, typecheck, build, bundle scan, profile validator pass; 390 tests pass (187 PostgreSQL-only skipped locally, unchanged code, run in Stack CI); mutation controls fail the new tests as described in the task.
- Real browser journey 116/116 (`design/evidence/NMI-UI-01C1/QA-RESULTS.md`; rerun: `pnpm --filter @nmi/web build && node design/evidence/NMI-UI-01C1/run-auth-journey.mjs`, needs Chrome and Homebrew PostgreSQL 16). The pending/failed/timed-out logout cases are SIMULATED by request interception and labelled so; the real 204 logout case is unchanged.
- Hosted CI at `f2f7fd8`: Project baseline / Common validation PASS (run 40464075823); Stack validation PASS (run 40464075624).

### Audit focus and limits

- Check that nothing protected renders in `signing-out`, that duplicate/stale/timeout paths cannot re-enter `authenticated`, and that "signed-out" is only ever produced by a 204.
- Deliberate: the sign-in form is not offered while revocation is pending (at most 10 s). After a timeout the request may still have reached the server; the notice says the server session may remain valid.
- Not verified: `__Host-` cookie over HTTPS, screen readers, real touch, Safari/Firefox, 400% zoom, hosted proxy. Throttling stays in-memory per process.

### Next action

Re-audit exact head; owner decides on merge. C2 needs separate authorization.

## Handoff: NMI-UI-01C2-START

- **Task / phase:** `tasks/NMI-UI-01C2-parse-wiring.md` (plan: `tasks/NMI-UI-01C-integration-plan.md`)
- **From:** GPT-6 / owner continuation after PR #9 squash merge
- **To:** Claude implementation agent; then independent GPT-6 exact-head audit
- **Branch / PR:** `feat/nmi-ui-01c2-parse-wiring`, [Draft PR #11](https://github.com/mrdzyn/nudgemyinvoice/pull/11)
- **Starting main:** `32d9132be419b48a64455fa79c0fca58f9159b89` (PR #9 independently audited PASS, owner squash merged)
- **State:** TASK CONTRACT ONLY; implementation NOT STARTED. Current branch changes only task/STATUS/handoff. No provider call, merge or deployment.

### Continuation notes

- Use already-implemented `POST /api/invoice-drafts/parse`, backed by Fastify/PostgreSQL operator auth and server-side optional model adapter. Real provider-unconfigured response is `unavailable`; test-only model fakes are simulations, never genuine OpenAI acceptance.
- Wire only React parse + clarification/manual fallback, typed validated response, in-memory CSRF, cancellation and definitive 401 logout/clear. Keep all other invoice operations synthetic and labelled; preserve C1 immediate sign-out lock and hash/preview isolation.
- Owner decisions D1–D4 unchanged. PayPal draft smoke authorization exhausted, no new OpenAI/PayPal call authorized; no C3 save/detail wiring.
- Initial repository handoff is **docs-only**. No validation or CI at the implementation SHA exists yet; Claude must report actual checks once code is added.

### Next action

Claude implements the active C2 contract on this existing Draft PR #11, validates targeted boundaries and a local real browser/auth/parse path with disposable PostgreSQL and no external provider calls, appends `NMI-UI-01C2-IMPL`, updates STATUS/task/PR and stops for independent exact-head GPT-6 audit.

## Handoff: NMI-UI-01C2-IMPL

- **Task / phase:** `tasks/NMI-UI-01C2-parse-wiring.md`
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c2-parse-wiring`, [Draft PR #11](https://github.com/mrdzyn/nudgemyinvoice/pull/11)
- **Implementation SHA:** `894758e48bca92c2afcd2dbf0609977f00fa4663` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT AUDIT. No merge, deploy, provider call or C3 work.

### What changed

Real authenticated composer -> `POST /api/invoice-drafts/parse` with strict response validation, a single-flight cancellable runner, clarification re-parse, failure/manual-fallback notices and 401 session invalidation. Web only; backend, packages and migrations unchanged.

### Audit focus

1. `parse/api.ts` validation is at least as strict as `invoiceDraftSchema`/`calculateTotals` shapes and fails closed.
2. No path from a hash, scenario or reducer action reaches a real parse success; the preview never gets `parse`.
3. Abort, stale and duplicate handling in `parse/runner.ts`; 401 -> `expire(epoch)`; sign-out lock still immediate.
4. The fake model exists only in `design/evidence/NMI-UI-01C2/fake-model-server.ts` (never imported by production).
5. Saving, list and PayPal remain visibly synthetic.

### Not verified

Live OpenAI, PayPal, HTTPS `__Host-` cookie, screen readers, touch, Safari/Firefox, 400% zoom, hosted proxy.

## Handoff: NMI-UI-01C2-R1

- **Task / phase:** `tasks/NMI-UI-01C2-parse-wiring.md` (section "Audit remediation: MEDIUM-1 and MINOR-2")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c2-parse-wiring`, [Draft PR #11](https://github.com/mrdzyn/nudgemyinvoice/pull/11)
- **Fix SHA:** `8d50b1d0dbe3c301ccd3e0712fea45ff25112c1c` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT RE-AUDIT. No merge, deploy, provider call or C3 work.

### What changed

Parse-response validation now enforces the money domain with the existing BigInt utilities and requires exact canonical totals; the harness health assertion is real. Web validator, tests, evidence harness and docs only.

### Re-audit focus

1. `parseTotals` rejects every case in the audit (zero quantity, USD three decimals, tax over 100%, inconsistent totals, fractional JPY) and accepts legitimate half-up rounding.
2. No floating point; the gate does not make browser estimates authoritative.
3. All four outcomes, 401 expiry, manual fallback and cancellation unchanged.

## Handoff: NMI-UI-01C2-R2

- **Task / phase:** `tasks/NMI-UI-01C2-parse-wiring.md` (section "Audit remediation: MINOR-3")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c2-parse-wiring`, [Draft PR #11](https://github.com/mrdzyn/nudgemyinvoice/pull/11)
- **Fix SHA:** `c37320c845efe68afeaa4e64d3ea761e05eaea9f` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT RE-AUDIT. No merge, deploy, provider call or C3 work.

### What changed

Test-only fake model and browser journey: the clarification answer must produce a draft with the exact answered due date, and the check is strict. No product code changed.

### Re-audit focus

1. The fake honours the stated date; the journey asserts `2030-02-01` and still asserts the request body carried the answer.
2. Negative control observed (87/88 when the fake ignores the answer).

## Handoff: NMI-UI-01C3-IMPL

- **Task / phase:** `tasks/NMI-UI-01C3-save-detail.md` (plan: `tasks/NMI-UI-01C-integration-plan.md`)
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c3-save-detail`, Draft PR against `main` (starting main `ddffc11471306e3b2c4cd7ea4a6a80303593e674`)
- **Implementation SHA:** `1530c63003947e26ba2ffb9a11fe36c1601f57cd` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT AUDIT. No merge, deploy, provider call, C4 or C5 work.

### What changed

Real Review -> `POST /api/invoice-drafts` (CSPRNG key bound to the exact body, single flight, timeout = uncertain, same-key retry, explicit new key on 409, 401 expiry) and a real saved-invoice page via `GET /api/invoice-drafts/:id` with strict validation and no fixture fallback. Web only; backend, packages and migrations unchanged.

### Audit focus

1. Key lifecycle: a changed body never inherits a key; an uncertain attempt is only retried with the identical body or abandoned explicitly; 409 needs an explicit new key.
2. `domain/serverInvoice.ts` + `invoices/api.ts` fail closed (201/200/replayed consistency, exact PayPal object, requested-id match, BigInt totals).
3. Real mode cannot reach fixtures, simulated saves or simulated PayPal; preview untouched; dashboard samples labelled and unopenable.
4. The browser journey found and fixed a real defect (retry buttons inside a disabled fieldset); confirm the notices now sit outside it.
5. No customer data in URL/storage/logs; a page reload loses the in-memory record id by design.

### Not verified

Live OpenAI and PayPal, HTTPS `__Host-` cookie, screen readers, real touch, Safari/Firefox, 400% zoom, hosted proxy. The C2 journey was not rerun against this build (its simulated-save wording is superseded).

## Handoff: NMI-UI-01C3-R1

- **Task / phase:** `tasks/NMI-UI-01C3-save-detail.md` (section "Audit remediation: MEDIUM-1, MINOR-2, MINOR-3")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c3-save-detail`, [Draft PR #12](https://github.com/mrdzyn/nudgemyinvoice/pull/12)
- **Fix SHA:** `70a63de4d62cecf345ea92daa0a0c709dc9fa24f` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT RE-AUDIT. No merge, deploy, provider call, C4 or C5 work.

### What changed

Leaving a pending or uncertain real save now needs an explicit, duplicate-aware decision; real AI Review copy and tab titles no longer claim fixture/simulated behavior; `createdAt` must be a real UTC instant. Web, tests and evidence only.

### Re-audit focus

1. `RealApp.tsx` Workspace gate + `invoices/leaveGuard.ts`: every leaving path asks; `open-saved` and sign-out are not blocked; dialog wording differs for pending/uncertain.
2. The key/body are never silently discarded; the same-key retry still replays after dismissed leave attempts.
3. `isValidInstant` rejects impossible dates and 24:00 for both 201 and GET.
4. Real AI Review has no "simulated" wording; preview copy unchanged.

## Handoff: NMI-UI-01C3-R2

- **Task / phase:** `tasks/NMI-UI-01C3-save-detail.md` (section "Audit remediation: MINOR-4")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c3-save-detail`, [Draft PR #12](https://github.com/mrdzyn/nudgemyinvoice/pull/12)
- **Fix SHA:** `604b744f3db992febd2bc31998b8769724b62130` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT RE-AUDIT. Evidence-only change; no production code, merge, deploy, provider call, C4 or C5 work.

### What changed

One browser-journey assertion made exact (`invCount() === b3`) with a demonstrated negative control; evidence regenerated (116/116).

### Re-audit focus

1. The assertion cannot pass when an extra invoice row exists (negative control recorded in the task).
2. `git diff` of the fix touches only `design/evidence/NMI-UI-01C3/`.

## Handoff: NMI-UI-01C4-IMPL

- **Task / phase:** `tasks/NMI-UI-01C4-real-dashboard.md` (plan: `tasks/NMI-UI-01C-integration-plan.md`)
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c4-real-dashboard`, Draft PR against `main` (starting main `988a8f9f22876f8f19d7424a31ff6b1f62ebf8c9`)
- **Implementation SHA:** `4309c7f63ee0dc1dc60cad8a079c277aa5a1d399` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT AUDIT. No merge, deploy, provider call or C5 work.

### What changed

New read-only `GET /api/invoice-drafts` (owner-scoped keyset list with filters/search), operator-scoped `GET /api/invoice-drafts/:id`, path-only request logging, a real React dashboard (server-side filters, load-more, page-labelled per-currency cards, honest states, stale protection) and a neutral `opened` saved-invoice state. No migration; payment path untouched; preview unchanged.

### Audit focus

1. `packages/db/src/invoice-list-store.ts`: owner filter on every query, cursor strictness, keyset predicate, escaping, no N+1; `getOwned` and the route.
2. `apps/web/src/domain/serverList.ts` and `features/dashboard/*`: fail-closed validation, generation-tagged stale protection, no fixture fallback, per-currency exact sums labelled as page summaries.
3. Real-mode isolation from the preview; `opened` never claims a save or a replay.
4. The documented open finding: `createPayPalDraft` still uses unscoped `drafts.get` (not changed on purpose; must be fixed before C5 or a second operator).
5. Two-operator evidence uses a test-only index drop in disposable databases; the committed schema still allows exactly one operator.

### Not verified

Live OpenAI/PayPal, HTTPS `__Host-` cookie, screen readers, real touch, Safari/Firefox, 400% zoom, hosted proxy. The C2/C3 journeys were not rerun (earlier wording).

## Handoff: NMI-UI-01C4-R1

- **Task / phase:** `tasks/NMI-UI-01C4-real-dashboard.md` (sections "Privacy boundaries for search text" and "Audit remediation: MINOR-1")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c4-real-dashboard`, [Draft PR #13](https://github.com/mrdzyn/nudgemyinvoice/pull/13)
- **State:** READY FOR INDEPENDENT RE-AUDIT. Documentation and evidence wording only; no production code, merge, deploy, provider call or C5 work.

### What changed

Privacy wording corrected: the browser navigation URL and browser storage hold no customer data and Fastify logs strip query strings, but the HTTP GET request URL carries the search term in `q`. Deployment prerequisite recorded (proxy/ingress/CDN/access logs must redact the query; untested). The journey's assertion descriptions and the boundary-test title were corrected, one explicit check recording `q` in the request URL was added, and the evidence was regenerated.

### Owner decision available

Absolute "no customer PII in HTTP request URLs" conflicts with the approved GET contract; a POST-based search would change the API contract and was NOT implemented.

### Re-audit focus

1. No statement left claims search text is absent from every URL.
2. The four surfaces are distinguished consistently across task, STATUS, SECURITY.md, ARCHITECTURE.md, PR body and QA.
3. Existing meaningful checks are unweakened; `git diff` against the audited head shows no change under `apps/*/src` other than a test title.
4. The open finding stands: `createPayPalDraft` still needs operator scope before C5 or a second operator.

## Handoff: NMI-UI-01C5-P0-IMPL

- **Task / phase:** `tasks/NMI-UI-01C5-P0-paypal-ownership.md` (plan: `tasks/NMI-UI-01C-integration-plan.md`)
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit, then owner merge decision
- **Branch / PR:** `fix/nmi-c5-p0-paypal-ownership`, Draft PR against `main` (starting main `568faa0a475af34372520bea5d19e63a4829cb19`)
- **Implementation SHA:** `2f208c057ee046dd8037c19f409d7051fe5aa9c1` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT AUDIT. Security-only; no merge, deploy, provider call or C5-P1 work.

### What changed

One line of behaviour: `createPayPalDraft` loads the invoice via `drafts.getOwned(invoiceId, operatorId)` before anything else. Plus `apps/api/src/paypal-ownership.pg.test.ts` (13 real-PostgreSQL tests, two test-only operators, fake PayPal) and docs. Provider adapter, mapping, fencing, state machine, reconciliation, idempotency, schema and configuration are untouched.

### Audit focus

1. The ownership gate is the first data access in `createPayPalDraft`; nothing (operation read, stored PayPal id, reserve/claim, audit, provider) can run for a non-owned invoice.
2. Route behaviour: identical `404 not_found` for foreign/ownerless/unknown/malformed; `503 paypal_disabled` still precedes everything.
3. The tests assert unchanged operation rows and counts, zero provider calls, and owner behaviour (replay, reconciliation, 12-way fencing). Negative control: reverting to `drafts.get` fails 7 tests.
4. `git diff main..HEAD -- apps/api/src/services` is a single-statement change plus a comment.

### Not verified

Real PayPal Sandbox and OpenAI (never called), HTTPS `__Host-` cookie, screen readers, real touch, Safari/Firefox, 400% zoom, hosted proxy. Production allows exactly one operator, so the gate is defense in depth today.

## Handoff: NMI-UI-01C5-P1-IMPL

- **Task / phase:** `tasks/NMI-UI-01C5-P1-paypal-draft-ui.md` (plan: `tasks/NMI-UI-01C-integration-plan.md`)
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c5-p1-paypal-draft-ui`, Draft PR against `main` (starting main `7e9c1c9b48ed03e3d85d4ad9d401f6803bed0a4c`)
- **Implementation SHA:** `17c13e0e75de07bda310bbd9745b27a97b6bf7bd` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT AUDIT. No merge, deploy, real provider call or NMI-DEMO work.

### What changed

`apps/web` only: typed `createPayPalDraft` transport with strict validation, single-flight runner (timeout = uncertain), a pure panel state machine, `PayPalDraftPanel` on the real saved invoice with an explicit confirmation dialog, durable GET read-back and a read-only Check status, plus copy corrections. A detail-validator bug (error codes containing `:`) found by the journey is fixed. Backend, provider adapter, schema, state machine and configuration are untouched.

### Audit focus

1. A POST is reachable only from the open dialog's confirm; cancel/Escape/mount/reload/navigation never POST; double confirm = one request.
2. The success validator (exact shape, `201<->replayed:false`, `200<->replayed:true`, `status:"DRAFT"`) and fail-closed handling of unexpected status/body combinations.
3. Uncertain outcomes: never failure/success, `unverified` blocks create until a read-only re-read, no blind retry for `mismatch`, no re-probing after `paypal_disabled`.
4. GET detail is the authority; stale responses, 401, unmount and sign-out cannot update another invoice or session.
5. Copy: no claim of "sent/paid/emailed", and no leftover "nothing was sent to PayPal" after a draft can exist; preview still simulated.
6. The journey's PayPal is a test-only fake (`design/evidence/NMI-UI-01C5-P1/test-api-server.ts`), never imported by production.

### Not verified

Real PayPal Sandbox and OpenAI (never called; a real call needs separate owner authorization and a strict call budget), HTTPS `__Host-` cookie, screen readers, real touch, Safari/Firefox, 400% zoom, hosted proxy/log redaction. No deployment or public demo exists.

## Handoff: NMI-UI-01C5-P1-R1

- **Task / phase:** `tasks/NMI-UI-01C5-P1-paypal-draft-ui.md` (section "Audit remediation: MAJOR-1")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ui-01c5-p1-paypal-draft-ui`, [Draft PR #15](https://github.com/mrdzyn/nudgemyinvoice/pull/15)
- **Fix SHA:** `9b367fb73ea420a179ae853bea9c430405d205fe` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT RE-AUDIT. Frontend, tests and evidence only; no merge, deploy, real provider call, budget reset or demo phase.

### What changed

Every PayPal draft POST answer now fails closed until a read-back bound to that confirmation (`seq`) has produced the invoice object being shown; failed, malformed, stale or contradicting reads never unlock creation; `mapping-refused`/`disabled`/`not-found`/`forbidden`/`bad-request` lock creating for the view; eligibility is evaluated against the shown invoice in both the button and the reducer; the post-POST read is always a fresh GET.

### Re-audit focus

1. `paypalPanel.ts`: `result` always sets `unverified`; `canOfferCreate(invoice, ui)`/`awaitingReadback`; `readback` seq binding and the `created` id cross-check; `open-confirm` re-check.
2. `PayPalDraftPanel.tsx`/`SavedDetailScreen.tsx`: the read-back captures `seq` at answer time, uses `refresh({fresh:true})`, and returns the exact invoice object.
3. Tests: one pre-existing reducer test asserted the defect and was replaced by its opposite; everything else was kept or tightened (554 web tests; 22 new regression tests; 4 unit mutation controls and 1 browser-level control killed).
4. Journey 102/102 including delayed/failed/malformed GET after a valid POST (GET manipulation is simulated; the POSTs are real against the fake provider).

### Not verified

Real PayPal Sandbox and OpenAI (never called), HTTPS `__Host-` cookie, screen readers, real touch, Safari/Firefox, 400% zoom, hosted proxy/log redaction.

## Handoff: NMI-DEMO-R0-IMPL

- **Task / phase:** `tasks/NMI-DEMO-R0-readiness.md`
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit, then owner decisions for R1
- **Branch / PR:** `docs/nmi-demo-r0-submission-readiness`, [Draft PR #16](https://github.com/mrdzyn/nudgemyinvoice/pull/16) against `main` (starting main `146252f7a2157966af403e4df59aa8fa83753054`)
- **Implementation SHA:** `92da0ddb293edce68c6081317dc3f4629cc8c357` (hosted CI recorded in the PR body)
- **State:** READY FOR INDEPENDENT AUDIT. Documentation, evidence and test-only tooling; NO product change, merge, deployment, publication, Devpost submission or real provider call.

### What changed

README reconciled with the implemented product; judge runbook (clean-clone tested) with SIMULATED and own-credentials modes; deployment decision (recommends local setup); real-provider acceptance plan (NOT executed); video script, Devpost draft, submission checklist and release-blocker register; test-only SIMULATED evaluation launcher and a final end-to-end journey (32/32); a guard test that the fakes cannot reach production; stale-copy assertions in the C2/C3/C4 journeys updated to the approved current behaviour and rerun (88/88, 116/116, 79/79).

### Audit focus

1. README/STATUS/Devpost wording: implemented vs real-provider-verified vs not implemented; no mock evidence presented as real; no invented metrics, sponsorship or verification.
2. Runbook commands match the repository (migration loop, provisioning, start commands, origins) and the claim that they were run from a clean clone.
3. The SIMULATED launcher cannot be reached from production (`no-fake-provider-switch.test.ts`; `server.ts` unchanged) and refuses without opt-in, in production and for non-Sandbox hosts.
4. Historical journey edits changed only assertions made stale by approved later copy/functionality; behavioural checks unchanged.
5. The Devpost rules page could not be fetched (HTTP 403); requirements come from the owner's brief and must be verified by the owner.

### Not verified

Real OpenAI and PayPal (never called in R0), Docker path of the runbook, HTTPS `__Host-` cookie, hosted proxy/log redaction, screen readers, real touch, Safari/Firefox, 400% zoom. No hosted deployment exists.

## Handoff: NMI-DEMO-R0-R1

- **Task / phase:** `tasks/NMI-DEMO-R0-readiness.md` (section "Audit remediation: two MINOR documentation findings")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner decisions for R1
- **Branch / PR:** `docs/nmi-demo-r0-submission-readiness`, [Draft PR #16](https://github.com/mrdzyn/nudgemyinvoice/pull/16)
- **State:** READY FOR INDEPENDENT RE-AUDIT. Documentation only; no application, database, provider, security, test-harness or QA-evidence change; no merge, deployment, publication, Devpost submission, provider call or budget reset.

### What changed

Privacy wording made precise (navigation URL/history and persistent storage: no customer data; search text in the HTTP GET `q` parameter; Fastify strips query strings; proxy/ingress/CDN redaction unverified and a prerequisite) in the Devpost draft, README and checklist; judge runbook scoped honestly (Mode A + local PostgreSQL tested; Mode B and Docker untested), invalid shell placeholders replaced with valid secure instructions, and a fail-fast migration loop that was tested in bash and zsh (a first `set -e` version was found not to stop and was replaced); checklist counts corrected (C2=3, C3=5, C4=2); Devpost rules status updated to the independently verified items only.

### Re-audit focus

1. No remaining public statement implies no customer data in any URL; the `q` caveat and the proxy-log prerequisite are visible in the Devpost draft, README, checklist and deployment decision.
2. Runbook code blocks contain no unquoted angle-bracket placeholders or sample secrets; the migration block stops at the first failure, keeps journal order and checks the count of seven.
3. Rules claims are limited to what was independently verified; nothing else is overstated.
4. `git diff` against the audited head touches only documentation files.

### Not verified

Real OpenAI and PayPal (never called), Docker path and Mode B of the runbook, HTTPS `__Host-` cookie, hosted proxy/log redaction, screen readers, real touch, Safari/Firefox, 400% zoom. No hosted deployment exists.

## Handoff: NMI-DEMO-R0-R2

- **Task / phase:** `tasks/NMI-DEMO-R0-readiness.md` (section "Audit remediation: residual MINOR")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner decisions for R1
- **Branch / PR:** `docs/nmi-demo-r0-submission-readiness`, [Draft PR #16](https://github.com/mrdzyn/nudgemyinvoice/pull/16)
- **State:** READY FOR INDEPENDENT RE-AUDIT. Documentation only; no executable code, SQL migration, provider, test harness or historical QA-evidence change; no merge, deployment, publication, Devpost submission, provider call or budget reset.

### What changed

The runbook's migration snippet now exits with the migration result (final `(exit "$rc")`), keeping the journal-order loop and the seven-entry count check; the README quick start chains migrations and operator provisioning with `&&` (a failed migration never reaches provisioning), adds the count check, and replaces the literal operator-password placeholder with a generated credential; a trailing `#` comment that broke interactive zsh was removed.

### Re-audit focus

1. The final statement of the runbook block preserves a nonzero status and does not close an interactive shell; success still exits 0 with the success message only on success.
2. README: no pasteable placeholder password; provisioning only after all seven migrations; the start commands are a separate block gated by prose.
3. Verification claims match what was run: blocks extracted from the documents and executed in bash and zsh, script and interactive, for success, unreachable database and conflicting schema; later migrations never ran after a failure.
4. `git diff` against the audited head touches only documentation files.

### Not verified

Real OpenAI and PayPal (never called), the Mode B and Docker parts of the runbook, other operating systems/shells, HTTPS `__Host-` cookie, hosted proxy/log redaction, screen readers, real touch, Safari/Firefox, 400% zoom. No hosted deployment exists.

## Handoff: NMI-AG1-START

- **Task / phase:** `tasks/NMI-AG1-ag-grid-dashboard.md`
- **From:** GPT-6 orchestrator / product owner authorization to start the bounded Community grid enhancement
- **To:** Claude/Codex implementation agent; then GPT-6 independent exact-head audit
- **Branch:** `feat/nmi-ag1-ag-grid-dashboard`
- **Base:** `main` at `f61b653c8131da7446f57ab38db7c118801b8fcd` (NMI-DEMO-R0 PR #16 owner squash-merge)
- **State:** READY FOR IMPLEMENTATION. Contract and STATUS reconciliation only; no AG Grid code, tests, real-provider requests, deployment, merge, Devpost submission or provider budget reset.

### Immediate task

Implement the **genuine AG Grid Community** read-only invoice grid in the already approved real dashboard screen. Read `AGENTS.md`, current `docs/STATUS.md`, `config/project-profile.json`, active task, this handoff and relevant UI/design/accessibility/testing/code/test files only. The existing `RealDashboard` is PostgreSQL-backed and uses a native HTML table; retain the cards, filters, pagination, error and empty states, keyboard View action, responsive behavior, and fake-provider/production isolation.

### Non-negotiable boundaries and proof

- Use only current compatible `ag-grid-community` + `ag-grid-react`; **no AG Studio/Enterprise, no license/trial keys**. Current AG Grid React docs demonstrate Community module registration and supported theming; verify exact installed version APIs.
- Server search/status/currency filters operate over the owner's account; AG Grid local sorting operates **only over rows already loaded**. Keep loaded-rows-only currency cards and exact BigInt money; no FX/mixed-currency totals and no new API calls triggered by sorting.
- Update UI tests/browser journeys to target real grid semantics instead of native `tbody tr`; preserve behavioral assertions, rerun and attribute new evidence to NMI-AG1. Capture sanitized desktop/mobile/dark/keyboard and strict-CSP browser QA.
- No app API, payment, provider or database changes, and no real OpenAI/PayPal calls. PayPal one-create smoke budget exhausted; default `PAYPAL_DRAFTS_ENABLED=false`.
- After implementation, update task/STATUS/docs, record exact HEAD, test/CI results and remaining accessibility limitations, keep the PR **Draft**, request independent GPT-6 exact-head audit. Do not merge/deploy/publish/submit.

### Sponsor positioning

Official Devpost rules allow AG Grid sponsor-prize consideration for use of **any AG Grid tools**, while the sponsor page values polish, custom widgets/theming/layout and richer use. A functioning Community grid is eligible for consideration **not a guarantee of an award**; only claim AG Grid actually used after the implementation passes. AG Studio is still deferred.

## Handoff: NMI-AG1-IMPL

- **Task / phase:** `tasks/NMI-AG1-ag-grid-dashboard.md` (section "Implementation record (NMI-AG1-IMPL)")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ag1-ag-grid-dashboard`, [Draft PR #17](https://github.com/mrdzyn/nudgemyinvoice/pull/17)
- **Implementation commit:** `3242c93029da3e6e7caff4066d39f39810aa956b` (Project Baseline `40660106222` and Stack CI `40660106171` success). The documentation commit that follows touches only documentation.
- **State:** READY FOR INDEPENDENT AUDIT. No merge, deployment, publication, Devpost submission, real OpenAI/PayPal call or provider-budget reset; no change to `apps/api`, `packages/db`, migrations, PayPal/OpenAI code, session/CSRF rules or the draft API contract.

### What changed

Genuine AG Grid Community 36.2.0 renders the real dashboard's invoice list (new `InvoiceGrid.tsx`, `invoiceGridSort.ts`, `app.css` theme mapping), UUID row ids, exact BigInt currency-first sort, resizable columns, native View buttons, narrow-screen column order and explicit keyboard handling; the strict CSP is unchanged (legacy CSS theme, text-glyph icons). Journeys C4, C5-P1 and R0 were adapted to AG Grid selectors without weakening assertions and a new NMI-AG1 journey was added.

### Audit focus

1. The diff touches only `apps/web`, `pnpm-lock.yaml`, `design/evidence/` and documentation; the dependency pair is the only runtime addition and is pinned exactly; no Enterprise/Studio/license-key code (see the boundary test).
2. The CSP in `apps/web/vite.config.ts`/`index.html` is unchanged and the production CSS contains no data-URI font; the journey asserts no CSP violation and no injected `<style>`.
3. Money: `compareTotal` is BigInt and currency-first; the cards still use `summarize` over loaded rows only; no mixed-currency sum exists.
4. Behaviour preserved: filters/search/Load more/failure states/View navigation/session lock/preview isolation (C4, C5-P1, R0 assertions are unchanged apart from selectors).
5. Journey claims match the stored evidence under `design/evidence/NMI-AG1/` (`qa-results.json`, `run.log`, `rerun-*`, `negative-control/`); the old evidence folders are untouched.
6. Keyboard design (header walk, one tab stop per View button, capture-phase Tab handler) and its stated limitations.

### Not verified

Real OpenAI and PayPal (never called), screen readers (VoiceOver/NVDA/JAWS), real touch devices, Safari/Firefox, a real browser zoom at 400%, HTTPS `__Host-` cookie, hosted proxy/log redaction, production deployment; bundle size grew (JS +709 kB, +203 kB gzip; CSS +279 kB) and is not mitigated.

## Handoff: NMI-AG1-R1

- **Task / phase:** `tasks/NMI-AG1-ag-grid-dashboard.md` (section "Audit remediation NMI-AG1-R1")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head re-audit, then owner merge decision
- **Branch / PR:** `feat/nmi-ag1-ag-grid-dashboard`, [Draft PR #17](https://github.com/mrdzyn/nudgemyinvoice/pull/17)
- **Remediation commit:** `f58c4fc27521b25f396ea8a99ac66948a66a5198` (Project Baseline `40670277117`, Stack CI `40670276998` success); a documentation-only commit follows.
- **State:** READY FOR INDEPENDENT RE-AUDIT. No merge, deployment, publication, Devpost submission, real OpenAI/PayPal call or budget reset; no server, API-contract, migration, payment or security change.

### Re-audit focus

1. MAJOR-1: `InvoiceGrid.tsx` has no `suppressCellFocus`, timer or manual focus code; Tab/Shift+Tab leave the grid via `tabToNextHeader`/`tabToNextCell`; arrow navigation, Enter-sort, and Enter/Space on the Actions cell via `onCellKeyDown`; the journey's arrow-key checks and the negative control (14 failures with `suppressCellFocus`).
2. MINOR-1: `#dash-sort-note` copy and `aria-describedby`.
3. MINOR-2: `MAX_LOADED_ROWS = 200`, reducer refusal, `#dash-limit` footer, search reaching older invoices, the 600-invoice evidence; confirm the owner accepts the 200-row UX limit and the reasoning for keeping rows un-virtualised.
4. Diff touches only `apps/web`, `design/evidence/NMI-AG1` and documentation; C4/C5-P1/R0 assertions unchanged.

### Not verified

Screen readers, real touch, Safari/Firefox, real 400% zoom, keyboard column resizing, hosted HTTPS/proxy, any real provider; bundle size unmitigated.

## Handoff: NMI-DEMO-R1-START

- **Task:** `tasks/NMI-DEMO-R1-provider-acceptance.md`
- **From:** GPT-6 orchestration following owner squash merge of AG Grid Community PR #17
- **To:** Claude coding agent for docs-only acceptance readiness, then GPT-6 exact-head audit and owner merge decision
- **Base main:** `2d5a7034fe7b78d927d19d534bf9958d91b3b7fd`
- **Branch / PR:** `docs/nmi-demo-r1-provider-acceptance` / same Draft PR
- **State:** READY FOR DOCS-ONLY IMPLEMENTATION. Absolutely **NO real OpenAI/PayPal provider calls**, no Sandbox create, no budget reset, no production/runtime code change, no deployment/Devpost/video publication.

### Goal and boundaries

Read `AGENTS.md`, `docs/STATUS.md`, `config/project-profile.json`, `tasks/NMI-DEMO-R1-provider-acceptance.md` and relevant R0 operator runbook/provider acceptance/checklist/Devpost docs. **Do not load full handoff history**. Reconcile AG Grid PR #17 as passed/merged. Prepare operator-ready, secret-safe checklists for **Gate A** (OpenAI; propose `gpt-6-luna`, but owner confirms model, entitlement and cost) and **Gate B** (exactly one new PayPal Sandbox USD 540.00 DRAFT, newly approved separately), plus two distinct approval-request texts, stop conditions, sanitized evidence fields and a limited offline preflight/CI plan.

Leave `PAYPAL_DRAFTS_ENABLED=false` and existing one-create budget 1/1 exhausted. Every real-provider test is **PENDING** and needs explicit future owner approval after this preparation is independently audited and merged. Gate C combined browser test requires its own authorization. All provider credentials are private; never print or commit them. Never present fake/test-only evidence as real-provider acceptance.

Keep the readiness PR **Draft**, run applicable local doc checks and mandatory hosted CI, report exact HEAD and checks for independent GPT-6 audit. Never merge/deploy/publish/submit or contact providers.

### Sources

Official hackathon rules: https://paypalaihackathon.devpost.com/rules (deadline 2026-11-12 12:00 PST, 2026-11-13 04:00 PHT). Official currently documented OpenAI small-model candidate: https://developers.openai.com/api/docs/models/gpt-6-luna and pricing https://developers.openai.com/api/docs/pricing. Recheck model/account availability before any separately approved paid call.

## Handoff: NMI-DEMO-R1-PREP

- **Task / phase:** `tasks/NMI-DEMO-R1-provider-acceptance.md` (section "Preparation record")
- **From:** Claude implementation agent (documentation only)
- **To:** GPT-6 independent exact-head audit, then owner merge decision, then owner decisions on Requests A/B/C
- **Branch / PR:** `docs/nmi-demo-r1-provider-acceptance`, [Draft PR #18](https://github.com/mrdzyn/nudgemyinvoice/pull/18)
- **State:** READY FOR INDEPENDENT AUDIT. No product/provider code, lockfile, migration, CI or evidence change; no OpenAI/PayPal request; no credential handled; no budget reset; PayPal drafting stays disabled; nothing merged, deployed, uploaded or submitted.

### Audit focus

1. Diff is documentation only (`docs/`, `tasks/`).
2. Nothing implies authorization: all three requests read NOT AUTHORIZED; the PayPal 1/1 budget is stated exhausted and not reset; Request B is a separate one-create permit with no retry; Gate C does not create another draft.
3. Facts: model page and pricing (`gpt-6-luna`, Responses, Structured Outputs, USD 0.10/0.50, medium default reasoning) and the two static findings (`maxRetries: 1`, output cap vs reasoning) match `packages/ai/src/client.ts` and `apps/api/src/config.ts`; PayPal SQL column names match migration 0005/0000; no in-repo create counter is stated honestly.
4. REAL / PENDING / SIMULATED rules and redaction rules are complete; templates carry no pre-filled results; Devpost/video/checklist wording cannot overstate.
5. Operator commands use silent prompts, keep OpenAI unset for B and PayPal unset for A, and tear down.

### Not verified

Everything provider-side: model entitlement/pricing on the owner's account, any real response, token usage, PayPal behaviour for the new invoice; commands were reviewed statically (the OpenAI and PayPal steps cannot be dry-run without credentials).

## Handoff: NMI-DEMO-R1-R1

- **Task / phase:** `tasks/NMI-DEMO-R1-provider-acceptance.md` (section "Audit remediation NMI-DEMO-R1-R1")
- **From:** Claude implementation agent (documentation only)
- **To:** GPT-6 independent exact-head re-audit, then owner decisions
- **Branch / PR:** `docs/nmi-demo-r1-provider-acceptance`, [Draft PR #18](https://github.com/mrdzyn/nudgemyinvoice/pull/18)
- **State:** READY FOR INDEPENDENT RE-AUDIT. Documentation only; no executable code, test, lockfile, migration, CI or evidence change; no OpenAI/PayPal request; no credential; no budget reset; Render not provisioned; nothing merged, deployed, uploaded or submitted. Gates A, B and C remain NOT AUTHORIZED; **Gate B is BLOCKED**.

### Re-audit focus

1. MAJOR-1: acceptance doc 5.0 and Request B state the confirmed defect (`call()` resends after 401; `createDraftInvoice` does not opt out; `client.test.ts` expects two POSTs), mark Gate B BLOCKED, specify the separate fix (no create resend after 401; read-only refresh kept; fail closed, no recreate; one 401 = one create POST) and the unblock conditions; the fix is **not** implemented here; the earlier "no automatic re-create" statement is corrected.
2. MINOR-1: three attempts vs up to six wire requests; A-strict needs a separate audited `maxRetries: 0` fix, otherwise explicit up-to-six authorization with spend limit and provider-reported count.
3. MINOR-2: Gate C sequence no longer reopens the dropped Gate B invoice; default read-only PayPal dashboard view labelled RECORDED EARLIER; preservation plan only as an owner option; no implicit invoice creation.
4. MINOR-3: snippets have no inline comments, silent client id and secret entry, `SETUP OK` check blocks, separate start and teardown blocks; executed from the document in bash and zsh, script and interactive (stub `pnpm`, dummy values), plus negative checks that wrongly set credentials print `SETUP WRONG - STOP`.
5. Wording cannot be read as an authorization; evidence templates carry no pre-filled results.

### Not verified

Any provider-side behaviour; the PayPal fix itself (not written); the preservation plan (never executed); real-shell behaviour beyond the stubbed bash/zsh runs on macOS.

## Handoff: NMI-DEMO-R1-FIX-B1-START

- **Task / phase:** `tasks/NMI-DEMO-R1-FIX-B1-paypal-401-no-resend.md`
- **From:** GPT-6 orchestrator, following owner's authorization to start the next bounded task
- **To:** coding agent (Claude/Codex), then independent GPT-6 exact-head audit
- **Base main:** `85470d9a5fef15b260f9e1c52673a7e2c7d03824` (owner squash-merged NMI-DEMO-R1 PR #18)
- **Branch / PR:** `fix/nmi-demo-r1-fix-b1-paypal-create-retry` / existing Draft PR
- **State:** READY FOR IMPLEMENTATION. Setup is task/STATUS/handoff only; no code/test changes yet, no live provider calls, no Sandbox-budget reset, no merge, no Render provisioning, deployment, video upload or Devpost submission. Gate B remains **BLOCKED**.

### Immediate objective

In `packages/paypal/src/client.ts` the helper retries any 401, including mutating `POST /v2/invoicing/invoices`. The existing `client.test.ts` expects two create POSTs. **Correct this** so one create invocation emits at most one create POST. Preserve single refresh-and-resend for safe read-only show and search. Preflight OAuth must succeed before create. Counter + negative-control tests must assert actual fake transport egress, not merely browser POST count or a durable claim counter.

### Additional fail-closed service boundary

In `apps/api/src/services/paypal-draft-service.ts`, `PayPalRejectedError` is stored as `rejected`; `packages/db/src/paypal-operation-store.ts` currently permits `rejected` to be claimed later in create mode. After a **create POST has actually been attempted and received 401**, blindly marking it retryable is inconsistent with one-provider-request-per-operation. Prefer a conservative `PayPalOutcomeUnknownError("http_401")` from the adapter, so the service persists `unknown` and later requests **reconcile read-only** (no additional create) without changing the DB schema. A pre-create OAuth rejection remains safely retryable and counts **zero** create POSTs. Preserve prior definite status handling unless the task requires escalation.

### Evidence

- Targeted `packages/paypal` tests: first create 401 = **one** wire POST, no create resend; GET show and logical read-only search keep safe token refresh; timeout, 5xx, invalid response and OAuth failure fail closed, all with counts.
- Focused service / PG test: one HTTP 401 after sent create leaves attempts=1 with no `created` state, and a later authenticated app POST causes read-only reconciliation only, not another provider create. Preserve owner isolation; use disposable local PG plus deterministic fake transports. Negative control fails if resend is reintroduced.
- Follow repo testing policy `docs/TESTING.md`, relevant `docs/SECURITY.md` and mandatory GitHub CI; record exact HEAD and CI run IDs. Revise §5.0 of provider acceptance docs to **implemented on Draft PR, still BLOCKED pending audit/merge/new owner permit**, never mark Gate B as passed. Keep Gate A/C untouched.

### Prohibitions

No schema/DB store changes, app user interface or API/auth contract, OpenAI retry change, extra dependencies, secret exposure, real PayPal/OpenAI requests or new provider sandbox create, Render deployment, video upload, Devpost submission, merge. Escalate genuine blockers rather than broadening scope.

## Handoff: NMI-DEMO-R1-FIX-B1-IMPL

- **Task / phase:** `tasks/NMI-DEMO-R1-FIX-B1-paypal-401-no-resend.md` (section "Implementation record")
- **From:** Claude implementation agent
- **To:** GPT-6 independent exact-head audit, then owner merge decision
- **Branch / PR:** `fix/nmi-demo-r1-fix-b1-paypal-create-retry`, [Draft PR #19](https://github.com/mrdzyn/nudgemyinvoice/pull/19)
- **Implementation commit:** `90aba259ef0f6643f428d3bd9b7bb2e1d16cd230` (Project Baseline `40813564538`, Stack CI `40813564390` success); a docs-only commit follows.
- **State:** READY FOR INDEPENDENT AUDIT. No provider call, credential, budget reset, merge, deployment, Render provisioning, upload or Devpost submission. Gate B **BLOCKED** until audit PASS, owner-authorized squash merge, a documentation step citing the merged commit, and a NEW Request B. Authorization answers unchanged (all NOT AUTHORIZED).

### Audit focus

1. `packages/paypal/src/client.ts`: required `effect` parameter, resend only for `"read"`, create 401 -> unknown, other classifications unchanged, OAuth preflight unchanged, allow-list untouched.
2. Service/store untouched; the 401 -> unknown path reaches `markUnknown` and later read-only reconciliation (see the PostgreSQL test), and `rejected` re-claim semantics are unchanged for other statuses.
3. Tests count wire-level create POSTs through a deterministic fake transport; the negative controls (`negative-control.md`) genuinely fail; foreign-operator isolation incl. zero token requests.
4. Docs do not change any authorization answer, mark Gate B passed or imply provider evidence.

### Not verified

Real PayPal behaviour (never called); a genuine PayPal 401 on create; the live wire-count evidence for Gate B (to be defined after merge).

## Handoff: NMI-DEMO-R1-FIX-B1-R1

- **Task / phase:** `tasks/NMI-DEMO-R1-FIX-B1-paypal-401-no-resend.md` (documentation remediation of review 5692710098, one MINOR)
- **From:** Claude implementation agent (documentation only)
- **To:** GPT-6 independent exact-head re-audit of Draft PR #19, then the owner's merge decision
- **Branch / PR:** `fix/nmi-demo-r1-fix-b1-paypal-create-retry`, [Draft PR #19](https://github.com/mrdzyn/nudgemyinvoice/pull/19)
- **State:** READY FOR RE-AUDIT. Docs only: no executable code, test, schema or authorization-answer change; no provider call; no merge, deployment, budget reset or Devpost submission. Gate B BLOCKED.

### What was corrected

Stale current-tense statements ("the client can resend", "code not yet started", "implements the bounded FIX-B1" as the next action) in STATUS, acceptance doc 5.0, the owner-authorization form and checklist blocker 18 now separate (1) the **historical** resend defect on `main` before PR #19, (2) the **corrected implementation on Draft PR #19** (`90aba259ef0f6643f428d3bd9b7bb2e1d16cd230`, not audited, not merged) and (3) the Gate B unblock conditions: audit PASS, owner-authorized merge, a documentation step defining the live wire-count procedure, and a fresh written Request B. STATUS "Next action" now starts with the re-audit.

### Re-audit focus

No remaining statement presents the defect as the current state of the branch or the fix as unwritten/merged/audited; no authorization answer changed; the diff since `ad6de6c` is documentation only.

## Handoff: NMI-DEMO-R1-B-WIRE-START

- **Task:** `tasks/NMI-DEMO-R1-B-WIRE-evidence-readiness.md`; **procedure draft:** `docs/NMI-DEMO-R1-B-WIRE-COUNT.md`.
- **From:** GPT-6 orchestrator after owner squash merge of independently audited FIX-B1 PR #19
- **To:** Claude coding agent for **documentation-only completion and offline validation**, then independent GPT-6 exact-head audit
- **Base main:** `09bbe90a977516c27bc0715141e74e090b41fba5`; **branch/PR:** `docs/nmi-demo-r1-b-wire-evidence` / existing Draft PR
- **State:** PREPARATION ONLY; no provider calls, observer execution with real credentials, PayPal Sandbox draft, budget reset, deployment, merge, Render provisioning, video upload or Devpost submission. Gates A and C NOT AUTHORIZED; Gate B BLOCKED / NOT AUTHORIZED.

### Goal

Reconcile all outdated references to PR #19 being unmerged. Specify and offline validate a **secret-safe server-to-PayPal create egress counter**, not a browser-to-Fastify counter or PostgreSQL `attempts=1`. Recommended Node Undici `undici:client:sendHeaders` diagnostic event, exact Sandbox method/path allow-list, aggregate-only output, no logging headers or bodies, no proxy/MITM, outside-repo temporary owner-only preload. **The event occurs before socket write; it proves a local send attempt, NOT confirmed PayPal receipt.** Corroborate with the N→N+1 Sandbox DRAFT result and durable state. Provide offline loopback positive and double-send negative controls without a real PayPal request, and prove observer reaches the actual Fastify process started by pnpm/tsx; otherwise mark as still BLOCKED and propose separate approved implementation. Preserve `PAYPAL_DRAFTS_ENABLED=false` and the historical exhausted 1/1 create budget.

Update acceptance §5.0–5.4, unanswered Request B, evidence Template B, checklist, task, STATUS, handoff and PR body as the real evidence becomes _prepared_ (not real-PASS). Do not touch Gate A/C approval answers or execute Gate B. Run applicable doc checks and mandatory hosted CI. Report final HEAD, checks and limitations and request exact-head GPT-6 audit. Do not merge.

### Security and scope

No code, scripts, tests, dependencies, CI, schema, database, credentials, production runtime changes, API calls, deployment or billing work in this docs-only PR. If a trustworthy actual-process send count cannot be demonstrated without executable repo changes, stop and document that additional prerequisite rather than claiming readiness.

## Handoff: NMI-DEMO-R1-B-WIRE-IMPL

- **Task / phase:** `tasks/NMI-DEMO-R1-B-WIRE-evidence-readiness.md` (section "Completion record")
- **From:** Claude implementation agent (documentation only)
- **To:** GPT-6 independent exact-head audit, then the owner's merge decision
- **Branch / PR:** `docs/nmi-demo-r1-b-wire-evidence`, [Draft PR #20](https://github.com/mrdzyn/nudgemyinvoice/pull/20)
- **State:** READY FOR INDEPENDENT AUDIT. Markdown only; no repository code, script, test, dependency, CI or schema change; no PayPal/OpenAI request; no credential; no budget reset; no merge, deployment, Render, upload or Devpost action. Gate B BLOCKED/NOT AUTHORIZED; Gates A/C NOT AUTHORIZED.

### Audit focus

1. The observer source in `docs/NMI-DEMO-R1-B-WIRE-COUNT.md` section 3: reads only `request.origin/method/path`; classification exactness; one origin literal; no env override; summary fields; signal handling; hash `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e` (the code fence hashes to it; Prettier is bypassed for the fences).
2. Reproduce `docs/NMI-DEMO-R1-B-WIRE-OFFLINE-TESTS.md` (`run-all.sh`) on the auditor's machine, especially T3/T4 (unmodified observer + production client at the wire), T5 negative control and T6 (actual pnpm/tsx server, three shutdown shapes).
3. Operator blocks are shell-safe (no inline comments; bash/zsh script and interactive were executed from the document) and require: hash check, proxy check, listening-PID match, zero-count snapshot before the single click, Ctrl-C shutdown, per-PID summary reading.
4. Honest limits: no real PayPal send witnessed; detection not prevention; experimental channel; macOS only; agent-run.
5. No authorization answer changed; Gate B still blocked; browser/DB/dashboard counts not substituted.

### Not verified

Anything against the real PayPal Sandbox; Linux/Windows; other Node majors; independent reproduction.

## Handoff: NMI-DEMO-R1-B-WIRE-R1

- **Task / phase:** `tasks/NMI-DEMO-R1-B-WIRE-evidence-readiness.md` (section "Audit remediation NMI-DEMO-R1-B-WIRE-R1")
- **From:** Claude implementation agent (documentation only)
- **To:** GPT-6 independent exact-head re-audit of Draft PR #20
- **State:** READY FOR RE-AUDIT. Only the Markdown-embedded offline runner/tests and records changed; observer source and SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e` unchanged; no repository code, script, test or authorization-answer change; no provider call; Gate B BLOCKED/NOT AUTHORIZED.

### Re-audit focus

1. Extract the files from `docs/NMI-DEMO-R1-B-WIRE-OFFLINE-TESTS.md` and the preload from the WIRE-COUNT document; confirm the hash; run `./run-all.sh` and `./runner-selftest.sh` (expected `ALL DONE (8 ...)` and `11/11`).
2. Confirm every critical check is a hard failure: T0 hash and fixture, T1 `20/20`, T2 `EPERM`, T3/T3b/T4/T5 JSON assertions with the independent server witness and client outcome, T6 `N/N` and no `FAIL`, assertion-count guard, `set -euo pipefail`, no `${VAR:?}`.
3. Review the 11 injections for realism (each changes the file it claims to) and try your own.

### Not verified

Real PayPal behaviour, other platforms, independent reproduction.

## Handoff: NMI-DEMO-R1-B-WIRE-R2

- **Task / phase:** `tasks/NMI-DEMO-R1-B-WIRE-evidence-readiness.md` (section "Audit remediation NMI-DEMO-R1-B-WIRE-R2")
- **From:** Claude implementation agent (documentation only)
- **To:** GPT-6 independent exact-head re-audit of Draft PR #20
- **State:** READY FOR RE-AUDIT. Observer source and SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e` unchanged; only the Markdown-embedded runner/self-test files (T2) and status wording changed; no repository code, script, test, dependency or authorization-answer change; Gate B BLOCKED / NOT AUTHORIZED.

### Re-audit focus

Runner T2 makes no probe outside the sandbox; S5 is the only unsandboxed run (one connect to non-routable `192.0.2.1`); Request B / acceptance banner no longer say "NOT OFFLINE VALIDATED / DRAFT" and state the true status; re-run `./run-all.sh` (8 assertions) and `./runner-selftest.sh` (11/11) from the extracted files.

## Handoff: NMI-RENDER-P1-START

- **From:** GPT-6 orchestrator after owner squash merge of PR #20
- **To:** Coding agent for bounded implementation of `tasks/NMI-RENDER-P1-secure-staging.md`, then independent GPT-6 exact-head audit
- **Branch:** `feat/nmi-render-p1-secure-staging`; continue on **existing Draft PR**, no second branch/PR
- **Base main:** `451abc292737775f0c58458520b8f5bf004cd474` (PR #20 merge)
- **Phase:** NMI-RENDER-P1 — OFFLINE-ONLY HOSTING READINESS, not Render deployment
- **UI design gate:** Not applicable; no material visual/UI behavior changes are authorized

### Immediate implementation

Read AGENTS.md, STATUS, project profile, the P1 task, and only relevant source/tests. Implement a single-origin Fastify+React production build, explicit production Render host/PORT binding while retaining local-loopback default, production HTTPS session/origin/CSRF/proxy checks, and a provider-disabled staging configuration with exact docs and targeted tests. **Privacy is release-critical:** the existing GET invoice search with customer text in `q` risks host access-log disclosure; prove a safe transport or leave deployment BLOCKED and escalate. Do not silently disable search, expose real customer data or weaken logging. Prepare a least-privilege PostgreSQL migration plan and non-provisioning Render operator runbook. No automatically enabled Blueprint previews or push-to-deploy.

### Verification and prohibitions

Targeted local-only tests, CI and documented negative controls; keep final status honest about any untested proxy, PostgreSQL, browser or platform behavior. Do not connect/provision Render, create billable databases, deploy, edit/pay provider credentials, authorize PayPal Gate B, merge, upload a video or submit to Devpost. All gates A/B/C remain NOT AUTHORIZED. On completion append `NMI-RENDER-P1-IMPL` handoff and request independent exact-head re-audit.

## Handoff: NMI-RENDER-P1-IMPL

- **From:** Implementation agent (Claude)
- **To:** Independent GPT-6 exact-head security/functional audit, then owner
- **Branch / PR:** `feat/nmi-render-p1-secure-staging`, Draft PR #21 (no second branch/PR). Start HEAD `7b1a33e`.
- **Scope:** `tasks/NMI-RENDER-P1-secure-staging.md` (implementation record at its end). UI design gate: Not applicable; approved UI unchanged.
- **Changed:** `apps/api` (`config.ts` HOST/TRUST_PROXY/WEB_DIST_DIR + production guards; `app.ts` header policy, hop-count trust, static registration; `plugins/web-static.ts`; `routes/invoice-drafts.ts` POST search + GET `q` refusal; `server.ts` host); `apps/web` (`invoices/api.ts` list = CSRF POST, `RealApp.tsx`, tests); `packages/db/ops/runtime-role.sql`; `docs/NMI-RENDER-P1-RUNBOOK.md`; SECURITY/ARCHITECTURE/DEPLOYMENT-DECISION/Devpost/checklist wording; `.env.example`; `design/evidence/NMI-RENDER-P1/`.
- **Not changed:** provider clients, OAuth/payment scope, PayPal enablement, schema/migrations, UI, authorization answers, merged PR #19/#20 content.
- **Review focus:** (1) `web-static.ts` cannot serve outside `dist` or shadow `/api`/`/health`; (2) POST search keeps exactly the GET list's owner scoping/order and is CSRF/Origin protected; no path leaves `q` in a URL; (3) `TRUST_PROXY` hop semantics (`(addr, hop) => hop < n`); (4) `runtime-role.sql` completeness (the app works as that role; the `operators.created_at` UPDATE grant is only for `FOR UPDATE`); (5) the runbook's unverified Render assumptions.
- **Evidence (agent-reported, local):** `pnpm validate` PASS; `pnpm test:db` PASS against disposable PostgreSQL; hosted browser QA 26/26 (headless Chrome, TLS proxy simulation, real production entry as the runtime role); implementation head `118e6e384d22dda0bf08b633e74c572346b93198`: Project Baseline CI run 40840429802 and Stack CI run 40840429753 both success (an earlier head `bfb4945` Stack CI run 40839185404 FAILED because one test assumed a locally built `apps/web/dist`; fixed in `118e6e3`). Any later head is docs-only; its CI run IDs are in the PR body.
- **NOT TESTED / residual:** real Render (TLS, `X-Forwarded-For` shape, request-log content for POST, Postgres roles/TLS/lifespan/cost); other browsers, assistive tech, touch; multi-instance behavior (unsupported); the historical NMI-AG1/C4 journeys that assert GET `q` were not re-run and are superseded for search.
- **Gates:** merge, Render provisioning, secrets, URL sharing and judge access each need separate owner approval. Gates A/B/C NOT AUTHORIZED.

## Handoff: NMI-RENDER-P1-FIX1

- **From:** Implementation agent (Claude)
- **To:** Independent GPT-6 exact-head re-audit of the remediation, then owner
- **Branch / PR:** `feat/nmi-render-p1-secure-staging`, Draft PR #21 (no new branch/PR). Audited start HEAD `8d2629d5dd16571d1af8d58f7ad40c0285f226aa`; independent review `5695189217`.
- **Scope:** MAJOR-1 least-privilege database proof; MAJOR-2 password-safe runbook. Production behavior, UI, search contract, PayPal/OpenAI, schema and migrations unchanged.
- **Changed:** `apps/api/src/hosted-staging.pg.test.ts` (the application pool now authenticates as a disposable LOGIN role with an ephemeral in-memory password instead of the owner connection with `-c role=`; asserts `session_user = current_user = runtime role`, `SET ROLE NONE` leaves it the runtime role, `SET ROLE`/`SET SESSION AUTHORIZATION` to the owner are refused, DDL/DELETE/sensitive UPDATE/audit SELECT refused with `42501`, audit INSERT works, login/save/search/logout run through that pool; role and credential dropped in `afterAll`); `docs/NMI-RENDER-P1-RUNBOOK.md` §5 step 3 and incident note, `packages/db/ops/runtime-role.sql` header (role created without any password, then interactive `\password`; no password in any `-c`/file/argument).
- **Evidence (agent-reported, local):** hosted-staging suite 13/13; `pnpm validate` PASS; `pnpm test:db` 312/312 PASS; hosted browser QA 26/26 (that harness already connected as a real LOGIN role). Hosted CI run IDs are in the PR body.
- **NOT TESTED / residual:** the local PostgreSQL uses trust authentication, so locally the role password is not checked at connect time; the test proves the role identity (`session_user`) and privileges, and hosted CI's password-authenticated service container is the evidence for password login. Real Render behavior remains untested as before.
- **Gates:** merge, Render provisioning, secrets and sharing each need separate owner approval. Gates A/B/C NOT AUTHORIZED.

## Handoff: NMI-RENDER-P1-FIX2

- **From:** Implementation agent (Claude)
- **To:** Independent GPT-6 exact-head re-audit, then owner
- **Branch / PR:** `feat/nmi-render-p1-secure-staging`, Draft PR #21 (no new branch/PR). Audited start HEAD `06bcde291024a0cc57d5225eeacfc4d9e0371c59`; independent review `5697068323`.
- **Scope:** documentation only. MAJOR-3: `docs/NMI-RENDER-P1-RUNBOOK.md` §5 no longer uses a password-bearing `OWNER_DATABASE_URL`; owner access uses non-secret `PG*` parameters and a temporary 0600 `PGPASSFILE` filled from a hidden `read -s` prompt via shell builtins, with trap cleanup; operator provisioning uses a passwordless `DATABASE_URL` plus that file and a hidden-prompt operator password in a subshell. MINOR-1: `docs/STATUS.md` kickoff-only wording replaced (implementation complete, awaiting audit and owner merge, no Render resource). `runtime-role.sql` comment only.
- **Not changed:** production code, tests, schema, role grants, UI, providers.
- **Evidence:** snippet escape/permission check run locally (mode 600, `:`/`\` escaped); `pnpm validate` and hosted CI run IDs in the PR body.
- **NOT TESTED:** the full `provision-operator` CLI run via `PGPASSFILE` (only the driver path was exercised); pgpass support in `pg` is deprecated upstream (a DeprecationWarning is printed; runbook says to stop, not fall back to a URL password, if it fails); real Render behavior and external TLS.
- **Gates:** merge, Render provisioning, secrets, sharing need separate owner approval. Gates A/B/C NOT AUTHORIZED.

## Handoff: NMI-RENDER-P1-PREFLIGHT-START

- **From:** GPT-6 orchestration after owner squash merge of PR #21
- **To:** Coding/test agent implementing and recording offline operator-CLI verification; then independent GPT-6 exact-head audit
- **Base main:** `d13c0a6e28443642ce611ce459122b682c1de92f`
- **Branch:** `docs/nmi-render-p1-operator-provision-preflight`; continue existing Draft PR; no new branch or PR
- **Task:** `tasks/NMI-RENDER-P1-PREFLIGHT.md`
- **State:** TASK STARTED; the full `provision-operator` CLI over temporary `PGPASSFILE` has NOT YET been tested in this phase; no Render resource is authorized.

### Immediate instructions

Read task, AGENTS, STATUS, project profile and only the relevant runbook/CLI/DB testing code. Use a disposable **SCRAM-enforcing** PostgreSQL 16 local fixture, never Render or real databases. Run the actual provisioning CLI with a 0600 password file, passwordless `DATABASE_URL`, and synthetic passwords (including `:` and `\\`); prove create and rotation, negative control with no password source, audit/hashed-password evidence and complete teardown. Preserve the genuine-login least-privilege work from PR #21. Record sanitized commands, environment, warnings, results and limitations in a new preflight evidence document. If the driver requires unsafe secrets handling, STOP and report rather than weakening the boundary. Limit code additions to test-only helpers where warranted, run required CI, append `NMI-RENDER-P1-PREFLIGHT-IMPL` when complete and ask for independent audit.

### Boundaries

No production code, database schema/grant, provider, UI or CI-policy changes without scope escalation. No merge, Render provisioning, billing, deployment, provider call, live judge login or publication. Gates A/B/C are NOT AUTHORIZED.

## Handoff: NMI-RENDER-P1-PREFLIGHT-IMPL

- **From:** Implementation agent (Claude)
- **To:** Independent GPT-6 exact-head evidence audit, then owner
- **Branch / PR:** `docs/nmi-render-p1-operator-provision-preflight`, Draft PR #22 (no new branch/PR). Start HEAD `c9a9f99c6792b8970a264999448b284f7d1d3eba`.
- **Scope:** offline verification only. Added `scripts/preflight-provision-operator.mjs` (test-only verifier) + `preflight:provision` script, `docs/NMI-RENDER-P1-PREFLIGHT-EVIDENCE.md`, task/STATUS/handoff updates. **No production code, schema, grants, UI or provider change**; the CLI ran unmodified.
- **Result (agent-reported, local):** 36/36 checks against an isolated SCRAM-enforcing PostgreSQL 16.15: real CLI create and rotate over a 0600 `PGPASSFILE` + passwordless URL (password with `:` and `\`), hashed password, audit rows, session revocation, credential_version 1→2, three negative controls (missing, wrong, 0644 file) fail closed with no mutation, no secret in args/output/repo, full cleanup. `pg@8.23.1` deprecation warning observed and left visible.
- **Review focus:** the verifier really enforces SCRAM (assertions on `pg_hba_file_rules`, stored verifier, no-password refusal); the CLI is invoked as a child process, not mocked; leak checks; honest limitations (sampled process table, no TLS, macOS only, no Render).
- **NOT TESTED:** Render PostgreSQL/TLS (`sslmode=require`), Linux, `pg@9` behavior (would fail closed), hosted CI does not run the verifier.
- **Gates:** merge, Render provisioning and sharing need separate owner approval. Gates A/B/C NOT AUTHORIZED.

## Handoff: NMI-RENDER-P1-PREFLIGHT-FIX1

- **From:** Implementation agent (Claude)
- **To:** Independent GPT-6 exact-head re-audit, then owner
- **Branch / PR:** `docs/nmi-render-p1-operator-provision-preflight`, Draft PR #22. Audited start HEAD `e4fda9bfb9c0387bb73c56017dab095d5deb4253`; independent review `5698125509`.
- **Changed (verifier and docs only):** `scripts/preflight-provision-operator.mjs` (strict negative-control verdict; fail-closed `teardown`; 18 fault-injection self-tests; version-banner crash fix), `docs/NMI-RENDER-P1-PREFLIGHT-EVIDENCE.md`, task, STATUS. No production code, schema, grants, UI or provider change.
- **Result (agent-reported, local):** full disposable SCRAM PostgreSQL 16.15 run 54/54 (cleanup: stop exit 0, status = not running, pid gone, port refused, files absent); `PG_BIN=/nonexistent` injection exits 1 with `pg.init`/`pg.start` failing. Hosted CI run IDs are in the PR body.
- **NOT TESTED:** unchanged (Render PostgreSQL/TLS, Linux, `pg@9`); teardown fault injection uses fake dependencies except the `PG_BIN` case.
- **Gates:** Gates A/B/C NOT AUTHORIZED; no merge/provision/deploy.

## Handoff: NMI-RENDER-P2-APPROVAL-PREP

- **From:** GPT-6 planning after user selected Mrdzyn Render workspace for staging preparation but withheld permission to provision until **actual charges** are reviewed.
- **To:** Independent P2 documentation review, owner cost inspection, then separately authorized provisioning workflow
- **Branch:** `docs/nmi-render-p2-staging-approval` (Draft PR, no production or cloud changes)
- **Base/main:** `652cf702fd93b05a9b9d64ee9b4c2151c30833b2`; PR #22 preflight audit PASS `5698358485` and squash merge confirmed.
- **Task:** `tasks/NMI-RENDER-P2-APPROVAL-PACKET.md`
- **Artifact:** `docs/NMI-RENDER-P2-STAGING-APPROVAL-PACKET.md`
- **Read-only Render observations:** confirmed the Mrdzyn workspace (ID omitted from the public repository), no PostgreSQL instances returned; service inventory returned `null`, not evidence of zero. Render tools cannot read private billing. Owner screenshots confirm Hobby included usage and $50 credit; projected overages, taxes and account-specific charge eligibility still unverified. Public list prices are not a spending authorization.
- **Owner-selected judges staging (2026-10-29):** Mrdzyn **Hobby Free web + Free PostgreSQL 16** (1 GB) in Singapore, $0 published compute baseline, one instance/database, manual pinned audited `main@652cf702`, Auto-Deploy OFF, provider-disabled and single-operator synthetic data. Free web sleeps after 15 minutes; Free PG expires after 30 days with no managed backups. Original P1 Render platform HTTP-request-log requirement remains NOT VERIFIED on Hobby; a separately reviewed alternate evidence plan and owner risk acceptance are required **before judge release**. Judges' evaluation window/teardown date must be verified before creation. No Blueprint, secrets in GitHub, or URL share.
- **Billing evidence:** Owner supplied Render Billing screenshots: **$50 Hackathon Participant promotional credit expiring 2027-10-01**, no pending invoices/charges shown, Hobby included 750 Free instance-hours, 5 GB outbound bandwidth and 500 pipeline minutes (0 used). $0 baseline does not eliminate possible usage overages; credit eligibility for charges unknown. No Pro upgrade selected.
- **Blocking approvals:** owner explicitly selected **Free+Free for judges**, but also explicitly retained **no provisioning before approving actual charges**. Resource creation (even free), initial deploy, any overage exposure, native HTTP-log security substitution and external judge access are separate explicit human approval gates. No merge or cloud creation authorized.
- **Gates:** A/OpenAI, B/PayPal, C/combined NOT AUTHORIZED; no cloud resource, billing or deploy approval, no judge access.

## Handoff: NMI-RENDER-P2-APPROVAL-FIX1

- **From:** Implementation agent (Claude) — docs-only remediation of independent audit PR #23 comment 6500483434 (FIX REQUIRED: 2 MAJOR, 4 MINOR, 3 INFORMATIONAL).
- **To:** Independent GPT-6 exact-head re-audit, then owner. **Branch/PR:** `docs/nmi-render-p2-staging-approval`, Draft PR #23. Starting HEAD `3d2c7e861232cbb1531705fd20abc15f9623b598`.
- **Changed (docs only):** packet §1A deployment source mechanism (future owner-created branch `release/nmi-render-judges-2026` from exactly `652cf702…`; Render tracks it, never `main`; HEAD verified before provisioning; deployed SHA verified after first deploy; STOP on mismatch; creation may start the first build; `WEB_ORIGIN` fails closed until the verified HTTPS origin is set), §1B P1/P2 precedence, header clarification, stale Dec-15/$85 wording, payment-method row, full teardown checklist, mandatory judge-reset-or-supervised-access PASS criterion, in-memory throttling and credential rules, workspace ID removed; P1 runbook precedence banner; STATUS and task.
- **Not done (by design):** the release branch was NOT created; no Render resource; no billing/plan change; no deploy, merge, publication, URL/credential sharing; no OpenAI/PayPal call.
- **Open:** payment-method status is unrecorded; alternate request-log evidence contract and owner risk acceptance still required; Render behavior untested. Gates A/B/C NOT AUTHORIZED.

## Handoff: NMI-GATE-A-CLOSE

- **From:** Implementation agent (Claude)
- **To:** Independent docs review, then owner. **Branch:** `docs/nmi-gate-b-observer-reconcile` (Draft PR, docs only).
- **Content:** (1) Gate B documents reconciled to the independently source-audited (review `5693627000`) and owner-merged (PR #20, `451abc2`) observer; (2) sanitized Gate A record for run `R1-A-20261030-01` (provisional REAL PASS; 2 provider requests, 668 input tokens, USD 540.00 / EUR 599.97 verified in the disposable database, 0 PayPal operations; output tokens, HTTP status/latency, model-on-usage-page PENDING; org $0.01 not attributed); (3) unsigned Request B form with the merged observer commit and hash filled in.
- **Open:** Gate A API stop is now VERIFIED (port 3001 closed, no server process); `OPENAI_*` unset and key revocation remain owner-reported; the disposable database `nmi_gate_a_20261030` (not dropped; owner approval). Gate A authorization is consumed. Gate B and Gate C remain NOT AUTHORIZED; no provider call, budget reset, merge or deploy occurred.

## Handoff: NMI-GATE-A-CLOSE-FIX1

- **From:** Implementation agent (Claude) — docs-only repair of review comment 6517996813 on Draft PR #25 (four stale-state findings).
- **Changed:** `NMI-DEMO-OWNER-AUTHORIZATIONS` (R1-A executed/closed/consumed; B unsigned; C not authorized; ledger rows), `NMI-DEMO-PROVIDER-ACCEPTANCE` (title and execution-state paragraph), `STATUS` (phase, working branch, active task, truthful `main` head, Render P2 shown as parked, R1 status, next actions), `NMI-DEMO-SUBMISSION-CHECKLIST` (A provisional REAL PASS, PayPal 1/1 exhausted, observer audited+merged, B/C not authorized).
- **Preserved:** Gate A sanitized evidence and PENDING fields, consumed Gate A authorization, unsigned Gate B, exhausted historical PayPal budget, Render and deployment boundaries, HPE-EDGE separation. No code, provider call, database deletion, merge or deployment.

## Handoff: NMI-FUP-01

- **From:** Implementation agent (Claude). **To:** Independent review, then owner. **Branch/PR:** `feat/nmi-ux02-nudgey`, Draft PR #26 (no new branch or PR); started from head `b5e122f` (NMI-UX-02, CI green).
- **Scope:** `tasks/NMI-FUP-01-nudgey-followups.md`. Local follow-up scheduling only; customer notifications are deferred and unauthorized.
- **Changed:** `packages/db` (schema + migration `0007` + `PostgresFollowUpStore`, audit actions, runtime-role grants), `apps/api` (`routes/follow-ups.ts`, wiring), `apps/web` (`followups/*`, Nudgey, saved-invoice card, session wiring, CSS), tests (api pg, runtime-role, db constraints, web unit/SSR/boundaries), `design/evidence/NMI-FUP-01/`, docs that counted seven migrations.
- **Review focus:** ownership and CSRF/Origin on every route; the partial unique index and `409` handling; UTC-only instants and zone display; that no code path contacts a customer, PayPal or OpenAI; runtime-role grants (no DELETE); the new browser route allow-list in `boundaries.test.ts`; migration count updates.
- **Found by the browser journey (fixed):** multi-line messages were rejected by the shared single-line text validator, and `Intl` refused `timeZoneName` combined with `dateStyle`/`timeStyle` (silently showing UTC).
- **Not done:** no deployment, merge, provider call or Gate action. A hosted database must run migration `0007` and the new grants first.

## Handoff: NMI-FUP-01-FIX1

- **From:** GPT-6 (GitHub connector backport). **To:** independent exact-HEAD re-audit, then owner. **Branch/PR:** `feat/nmi-ux02-nudgey`, Draft PR #26; base reviewed head `d6e9d7c5f17a230cf0f3b45ea5a9fca63e02ac4e`.
- **Action:** backported the already source-audited shared follow-up read-generation guard plus focused tests from Draft PR #27 `ed2274c7c71b62f5f38d6aca41f0d23a4326fa06` into #26. This includes the read-only `readFresh(signal)` method as a dependency for downstream C1; no conversational interface or other features transferred.
- **Verification to complete:** hosted Project Baseline and Stack CI on new exact head; independent short re-audit of controller and test changes. No prior audit or CI of #26's old SHA substitutes for this gate.
- **Boundaries:** both PRs remain Draft, no merge, provider call, deployment, migration, credential or external send. After owner authorization to merge #26, reconcile PR #27's stacked history/diff, rerun required checks and seek separate approval.

## Handoff: NMI-FUP-01-FIX2

- **From:** GPT-6, source remediation. **To:** Codex independent exact-HEAD re-audit; owner decision after a PASS. **PR:** #26, branch `feat/nmi-ux02-nudgey`; FIX1 audited SHA `1a8cfadd2e1ef2761f7cd25ce62d9c305da3f964` was FIX REQUIRED due to aborted refresh 401 suppression.
- **Changes:** `apps/web/src/followups/controller.ts` now handles the returned 401 before ignoring an internally aborted ordinary result, without weakening the stopped-controller or read-generation boundaries; `controller.test.ts` adds a deterministic two-refresh abort-then-401 test. Task, STATUS and handoff updated; no new provider, API, schema or UI changes.
- **Gates:** new exact-HEAD CI and independent re-audit required; no merge/deploy/provider calls. PR #27 remains Draft, stacked on #26; downstream reconciliation and separate owner merge approval remain mandatory.

## Handoff: NMI-NDG-03

- **From:** Implementation agent (Claude). **To:** Independent review and owner visual approval. **Branch/PR:** `fix/nmi-nudgey-status-selector`, new Draft PR against `main` (PR #26 is merged; Draft PR #27 untouched).
- **Scope:** `tasks/NMI-NDG-03-invoice-status-selector.md`. Fixes the duplicate "Check invoice status" action with a read-only selector inside Nudgey; closes a latent guard gap (`open-saved` "opened" now counts as leaving an unresolved save).
- **Changed:** `components/Nudgey.tsx`, `nudgey/{statusLookup,useStatusLookup}.ts`, `nudgey/StatusPicker.tsx`, `invoices/leaveGuard.ts`, CSS, tests, `design/evidence/NMI-NDG-03/`, judge-runbook troubleshooting, STATUS/task.
- **Review focus:** that "status" has no navigation action while "browse" is unchanged; request shape and abort handling; draft-state wording (never payment state); the guard change and its effect on follow-up and dashboard opens; overlap with PR #27 in `Nudgey.tsx`.
- **Diagnosis recorded, not acted on:** the follow-ups load failure on the owner's local database is a missing migration `0007`, not SMTP; the migration was not run by the agent.
- **Not done:** no merge, deployment, provider call, migration, or change to PR #27.

## Handoff: NMI-NDG-03-P2-REVIEW-1

- **From:** Implementation agent. **To:** Independent exact-HEAD re-audit, then owner. **Branch/PR:** `fix/nmi-nudgey-status-selector`, existing Draft PR #28 against `main`.
- **Start / implementation:** exact starting head `53b154a31567c1185ce30391bdf5df1d9775a6d5`; implementation commit `03a34d7ccde8a08788c17c82e3271cd7fe429a3f` (this handoff record is the following documentation commit; audit the resulting branch tip).
- **Scope:** remediate both P2 findings in review `5721936401` only.
- **Changed:** status lookup lifecycle for internally aborted 401 handling while preserving reset/disposal and stale-result cancellation; immediate invalidation of old rows and selected invoice on term input before the existing debounce; deterministic status lookup and input-wiring regression tests; task/status/judge-runbook migration note.
- **Validation:** focused Vitest 42/42, `@nmi/web` typecheck, changed-file Prettier check and `git diff --check` passed. Hosted CI is required on the resulting exact PR head.
- **Database/provider boundary:** owner reports migration `0007` was applied successfully to the local database after a verified backup; this agent did not run or rerun it. No PayPal, OpenAI or SMTP calls; PR #27 was not changed.
- **Review focus:** old active search returns 401 after a newer search starts; old non-401 remains ignored; reset/dispose suppress late results; new term clears selectable results before 250 ms; exact starting-head preservation; no layout/design changes.
- **Not done:** no merge, deployment or provider tests. PR #28 remains Draft pending independent re-audit and owner approval.

## Handoff: NMI-NDG-02-C1-RECON-1

- **From:** GPT-6, branch-only reconciliation. **To:** Independent exact-HEAD audit; owner decision. **Source PR #27:** `ed2274c7c71b62f5f38d6aca41f0d23a4326fa06`; **new main base:** `567e1d92fc689a2eb38b0a9e989326ddeb72459b` after PR #28.
- **Integration:** Add previously audited read-only Ask Nudgey C1 alongside PR #28's status selector, preserve original #26 follow-up FIX2, original status-search protections, and unresolved-save leave guard. Source chat features and tests are retained; CSS chat styles appended. Includes small cross-feature regression test.
- **Gates pending:** both hosted CI checks at reconciled HEAD; exact-HEAD combined behavior and security audit; targeted combined no-provider browser QA before owner merge approval. Original C1 and selector browser evidence runs were on separate builds.
- **No merge/deployment/provider action authorized.** Local migration 0007 has already been applied by owner after a verified backup and must not be rerun on that local database.

## Handoff: NMI-NDG-02-C1-COMBINED-QA-1

- **From:** GPT-6, exact-head browser QA. **To:** Independent combined-code re-audit; owner merge decision after that review. **PR #27 target:** `4a974943cdd81ef5a2fc757a36a2ccaf8a2f6005`.
- **Evidence:** `design/evidence/NMI-NDG-02/combined/README.md` and reports: Ask Nudgey 29/29, status selector 26/26 (including synthetic browser HTTP 401 session expiry), follow-up scheduler 23/23, unresolved-save browser guards 117/117 (including status-selector “Open invoice details”). Chrome production-preview journeys used synthetic records and disposable PostgreSQL only; no external provider traffic. No product defect found.
- **Change scope:** deterministic browser harness/evidence and task/status/handoff notes only. At the audited head, required hosted CI was green; this evidence update requires CI on the resulting PR head. No migration was rerun; owner's local `0007` remains applied after a verified backup.
- **Not done:** no provider tests, merge, deployment, or outbound notification authorization.

## Handoff: NMI-NDG-02-C2-DESIGN-01

- **From:** GPT-6, design-first C2 kickoff. **To:** Product owner for flow/visual approval; then implementation agent. **Base:** `main` `9f23ef40dd8a7b8b99303cdd4ee3659500d86a35`, after C1 PR #27 squash-merge.
- **Scope:** Task `tasks/NMI-NDG-02-C2-natural-language-followup.md` and static preview `design/mockups/NMI-NDG-02-C2-scheduling.html`. Parse candidate customer/clock/zone, disambiguate exact existing operator-owned invoice, then prefill existing ScheduleForm; only manual Save may create a local follow-up. No C3 SMTP or provider tests.
- **State:** Docs-only Draft PR; design approval and then controlled implementation remain pending. No production code change, UI shell wiring, deployment, migration, real provider calls or merge.
- **Next action:** Owner reviews/approves (or revises) the candidate, multi-match and prefilled-scheduler static screens; implementation agent then works on the same bounded scope with focused tests, hosted CI, browser QA and independent exact-HEAD audit.

## Handoff: NMI-NDG-02-C2-IMPL-01

- **From:** GPT-6, owner-approved design kickoff. **To:** C2 implementation agent and independent reviewer. **Draft PR:** #29; current source HEAD `4158bad54c3e435f9768ef267124c13584a8e330` before approval-status docs update; base main `9f23ef40dd8a7b8b99303cdd4ee3659500d86a35`.
- **Owner approval:** C2 visual/flow approved 2026-10-31; deterministic command → verified invoice and date/time → explicit candidate selection → prefilled _editable_ existing scheduler → manual Save only. No automatic writes, payment/send operations, cloud provider calls or deployment.
- **Implementation next:** Follow `tasks/NMI-NDG-02-C2-natural-language-followup.md`, preserve C1 and PR #26/#28 protections, use existing server-scoped invoice search and manual scheduler; fail closed on ambiguity, unsupported date/time/zone and browser lifecycle changes. Focused tests → no-provider disposable DB browser QA → required hosted CI → independent exact-head audit → owner merge decision.
- **Separate V1 decision:** Owner also approved _on-device-only_ optional voice input, but it is a separate bounded follow-on **after** C2 functional acceptance. Never implement unverified/default browser cloud recognition, OpenAI STT, auto-submission or audio egress.

## Handoff: NMI-NDG-02-C2-REVIEW-01

- **From:** Codex, C2 implementation. **To:** independent exact-head reviewer. **Draft PR:** #29, `feat/nmi-ndg02-c2-scheduling`. **Code implementation head:** `b590e16bd26ebcf172feb3f2c0fc8987a9a53b92`; the evidence/handoff documentation commit follows it, so review the live PR head and its current checks.
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT; keep PR #29 Draft. The owner-approved C2 design is implemented.

### Delivered

- Narrow deterministic schedule-command parsing with injected clock, IANA-zone wall-time resolution, and fail-closed handling for ambiguous times, DST gaps/overlaps, invalid zones, past dates and unsupported commands.
- Bounded authenticated invoice search through the existing session reader; candidates remain ephemeral, stale candidates disappear when a different prompt is typed, one/many matches require explicit accessible radio selection, and no-match/truncated/error states offer a manual route.
- The chosen invoice and local date/time prefill the existing editable create-mode ScheduleForm. Only the existing operator Save sends the local follow-up POST. The verified invoice is included without a second/general first-50 read.
- Preserved C1 Ask Nudgey, status selection, auth/session expiry, cancellation and late-401 behavior, Back/Close/sign-out clearing, unsaved-review navigation guards and local-only notification boundaries.
- Prepared the separate, unimplemented V1 follow-on contract at `tasks/NMI-NDG-02-V1-on-device-voice.md`. C2 contains no microphone, speech-recognition or cloud-STT path.

### Validation evidence

- 44/44 focused tests; web typecheck/build; changed-file ESLint; Prettier check; `git diff --check` — PASS.
- Disposable PostgreSQL 16 and synthetic-data no-provider browser QA at code commit `b590e16bd26ebcf172feb3f2c0fc8987a9a53b92`: 46/46 checks on Chrome 156.0.8078.80, desktop 1100×900 and mobile 390×844, with `Asia/Manila` emulation. Evidence: `design/evidence/NMI-NDG-02-C2/QA-RESULTS.md`, `qa-results.json`, and its screenshots.
- Hosted Project Baseline CI passed at code commit `b590e16bd26ebcf172feb3f2c0fc8987a9a53b92`: [run 41192885259](https://github.com/mrdzyn/nudgemyinvoice/actions/runs/41192885259).
- Hosted Stack CI (including unit tests, disposable PostgreSQL tests, build, bundle check, migration sync and production dependency audit) passed at the same code commit: [run 41192885066](https://github.com/mrdzyn/nudgemyinvoice/actions/runs/41192885066). The reviewer must verify both required checks at the live PR head after this documentation/evidence handoff commit.
- No owner database operation, migration rerun, provider test, OpenAI, PayPal, SMTP, production data, merge or deployment. Disposable database migrations were applied only to the newly created browser-test database.

### Next action

Independently audit the **current exact PR #29 head**, verify both required hosted CI checks are green at that head, and report PASS / PARTIAL / FIX REQUIRED. Do not merge or deploy.

## Handoff: NMI-NDG-02-C2-P2-REVIEW-02

- **Task:** remediate the two P2 findings from the independent review on existing Draft PR #29. **Branch:** `feat/nmi-ndg02-c2-scheduling`. **Code commit:** `848382cb7a346ab0b3f621123cba40b96868bf90`.
- **State:** implementation and targeted no-provider browser evidence complete; final evidence/docs commit and required hosted CI are the remaining gates before the next independent exact-HEAD audit. Keep PR #29 Draft.
- **P2-1:** schedule-prefill loading retains the server-verified candidate, reads up to 50 authenticated owner-scoped invoices, merges/deduplicates the list and leaves the candidate selected; alternatives can be chosen before Save. The prefill remains available if the list read fails. Effect cleanup suppresses stale completions and aborts the read; active 401 still expires the session.
- **P2-2:** the C2-prefilled Save path resolves the operator's current edited date/time through the strict IANA wall-time resolver. DST gaps/overlaps and any mismatch with the existing host-zone UTC conversion fail closed. Existing explicit zone-change confirmation remains required; ordinary manual scheduler validation is unchanged.
- **Evidence:** 28/28 targeted unit/component tests; disposable PostgreSQL 16 + synthetic-data Chrome run 50/50 at code commit above. Regression coverage includes candidate plus alternative selection, no Save before explicit operator action, New York overlap rejection, changed-zone confirmation and unique-time exact UTC save. See `design/evidence/NMI-NDG-02-C2/QA-RESULTS.md` and `qa-results.json`.
- **Boundaries:** no provider tests/requests, no owner database access or migration rerun, no outbound notifications, voice implementation, merge or deployment. Preserve the local-only notification boundary and C1 protections.

### Next action

Complete the evidence/docs commit on PR #29, verify both required hosted CI workflows pass on its exact resulting SHA, then independently re-audit that live exact head. Do not merge or deploy.

## Handoff: NMI-NDG-02-V1-IMPLEMENT-01

- **From:** GPT-6 V1 implementation. **To:** independent exact-head audit and owner Chrome QA. **Base:** `main` `139cdea0b14524ac3997c54f7cb4d9a6d9fe11e0` after owner-approved C2 merge. **Working branch:** `feat/nmi-ndg02-v1-local-speech`.
- **Owner authority:** Start V1, strict on-device-only English speech; owner explicitly installed `en-US` pack and saw Chrome local capability `available`. Native microphone accuracy and privacy behavior are NOT yet physical-device verified.
- **Implementation:** fail-closed unprefixed browser `SpeechRecognition` check + local language pack, explicit install by user gesture, on-device-only mic start, final text into existing editable Ask, no auto submit or Save, proper request/lifecycle abort. Existing C1/C2, status picker and manual follow-up remain unchanged.
- **Testing objective:** fake recognizer assertions that `processLocally=true` is checked before `start()`, no cloud fallback or auto Ask, no late callback after Stop/Close/signout. Required hosted CI and owner real Chrome mic QA remain separate gates.
- **Boundaries:** Draft PR only; no merge/deploy, audio upload, telemetry, OpenAI STT, PayPal or SMTP calls, production databases or migrations.

## Handoff: NMI-NDG-02-V1-REMEDIATION-REVIEW-01

- **From:** Codex implementation remediation. **To:** independent exact-head reviewer and owner physical Chrome QA. **Draft PR:** #30, branch `feat/nmi-ndg02-v1-local-speech`. **Starting HEAD:** `5f7385670fd66ac8cee00e29ca95aab1269bbf7c`. **Implementation commit:** `71a3f0e99c5afbb071718edae5527bddc2a7b1e2`; final PR head also contains this handoff/evidence documentation.
- **State:** source remediation and local validation complete. Both required hosted workflows passed at `d350d3741a08c885293888905e2f9bf4116cfce6`; a documentation follow-up commit records the evidence, so verify both checks again at that resulting PR HEAD before stopping for independent exact-head re-audit. Keep Draft PR #30 Draft.
- **Corrections:** Prettier applied to all four flagged speech files. Example-question Ask now stops the local recognizer before invoking Ask; controller generation checks reject queued late results from changing the new draft. Added React DOM interaction tests using a fake recognizer and `fetch` spy for editable final transcript, explicit Ask/no auto-schedule, no recognition-originated fetch, example Ask cancellation, explicit Stop, and Back/Close/sign-out/401 unmount cleanup.
- **Local validation at implementation commit:** 24/24 focused speech/Nudgey tests; `pnpm --filter @nmi/web typecheck`; `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `pnpm check:bundle`; `git diff --check` — PASS. The production bundle emitted the large-chunk advisory; build succeeded. Hosted Project Baseline passed (run [41210442032](https://github.com/mrdzyn/nudgemyinvoice/actions/runs/41210442032)) and Stack validation passed (run [41210442014](https://github.com/mrdzyn/nudgemyinvoice/actions/runs/41210442014)) on exact SHA `d350d3741a08c885293888905e2f9bf4116cfce6`. Focused evidence and the physical-QA checklist are in `design/evidence/NMI-NDG-02-V1/QA-RESULTS.md`.
- **Physical QA:** NOT RUN. The checklist documents the supported Chrome/macOS local `en-US` availability, permission, actual synthetic transcription, cancellation, auth/navigation cleanup and network observation required from the owner. Prior reported pack availability is not a physical microphone PASS.
- **Boundaries:** no provider invocation, audio upload, owner database access, merge or deployment. Preserve `processLocally=true`, no cloud fallback and explicit operator Ask/Save.

### Next action

Verify both required hosted workflows on the documentation follow-up's live PR #30 HEAD, then report that exact SHA and stop for independent re-audit. Owner Chrome mic execution remains a separate manual gate; do not claim it passed.

## Handoff: NMI-NDG-02-V1-QA-CLOSE-01

- **Task / phase:** `tasks/NMI-NDG-02-V1-on-device-voice.md`; physical QA closeout.
- **From:** implementation/QA agent. **To:** independent exact-HEAD acceptance auditor.
- **Branch:** `feat/nmi-ndg02-v1-local-speech`; **implementation head:** `a90a19b2ba912f4a0a85ef8ddbf389570090b992`.
- **PR:** [Draft #30](https://github.com/mrdzyn/nudgemyinvoice/pull/30).
- **State:** scoped physical Chrome QA PASS; documentation evidence is prepared for commit/push; required CI must pass at the resulting live PR head before audit. Keep Draft.

### Completed

- Recorded exact Chrome/macOS versions, direct local `en-US` availability and policy check, permission prompt/denial, Stop/Back/Close/Escape/navigation/sign-out/401 cleanup, and redacted Network observation in `design/evidence/NMI-NDG-02-V1/QA-RESULTS.md`.
- Preserved the owner's synthetic transcription/editability/no-app-egress report and clearly separated it from independent observations. No speech, transcript, screenshot, credential, or HAR was retained. No providers were called.

### Validation

- Physical scoped QA — PASS; local-model install and blocked-policy simulation — NOT RUN.
- Application code unchanged; `git diff --check` — PASS.
- Required hosted Project Baseline and Stack workflows — run on the pushed evidence/docs SHA before independent acceptance audit.

### Continuation notes

- Exact app SHA tested: `a90a19b2ba912f4a0a85ef8ddbf389570090b992`. Evidence contains owner-reported and independently observed results with explicit attribution.
- Restore/reset localhost mic permission to Ask(default) after each check; it was restored. Disposable DB/API/Vite stack and synthetic credentials are shut down/removed before handoff.
- No merge, deployment, provider call, customer data, or application-code change.

### Next action

Commit and push the QA evidence/docs to existing Draft PR #30, verify both required hosted checks at the new exact HEAD, then stop for independent acceptance re-audit.

## Handoff: NMI-PROTOTYPE-10D-A1-IMPLEMENT-01

- **Phase:** `tasks/NMI-PROTOTYPE-10D-A1-analytics-contract.md`; parent architecture PR #31 accepted and owner merged at `main@9cf6f4ebf169e8a0c18cef106a741c2c9320df0f`.
- **From:** GPT-6 implementation. **To:** CI and independent exact-HEAD implementation reviewer.
- **Branch:** `feat/nmi-proto-analytics-01` (new Draft PR pending creation at handoff authoring).
- **Scope:** source + integration tests for strict `POST /api/analytics/summary`; parameterized all-owned-row aggregates in PostgreSQL, currency-safe integer totals, per-day IANA buckets, CSRF/Origin/401 and owner-only read boundary. Reuses existing status/currency enums, no migrations or provider calls.
- **Implementation decision:** both UTC date bounds and IANA timezone required for A1; malformed/partial/oversized ranges fail closed. Existing currencies have 0/2 minor digits; three-decimal currency (KWD) not yet supported and excluded, not silently introduced.
- **Validation objective:** hosted Project Baseline and Stack checks, especially focused real PostgreSQL integration tests. Any failures require correction on same branch and new exact-HEAD check before re-audit.
- **Out of scope:** AG Studio shell/UI, report persistence, Render resources/workflows, trial key, PayPal Toolkit MCP, OpenAI/PayPal requests, judge access, main merge and deployment. Payment test budget remains exhausted.
- **Next:** open Draft PR, verify required CI and independently review exact source/tests; separate owner approval before merge. UI design and AG Studio license gate remain ahead.

## Handoff: NMI-PROTOTYPE-10D-A2-IMPL-01

- **Task / phase:** `tasks/NMI-PROTOTYPE-10D-A2-dashboard-integration.md`
- **From:** implementation agent. **To:** independent exact-head correctness/security reviewer.
- **Branch:** `feat/nmi-proto-analytics-02`; **implementation commit:** `64bba258a47517c0184395034172fbcb637d2b34` (from exact `main@7f87ca80e61b3c418c9b596b39cbb6b4bebb99bc`).
- **PR:** Draft [#33](https://github.com/mrdzyn/nudgemyinvoice/pull/33).
- **State:** implementation, focused local validation and synthetic local browser QA complete. A follow-up documentation commit points STATUS to this handoff; verify hosted checks against the current live PR head, not only the implementation commit. Keep Draft.
- **Completed:** authenticated full-population summary integration; exact currency totals; synchronized server filters and local-date half-open bounds; strict DTO parsing, epoch/cancellation/401 handling, owner scoping and fail-closed fixture isolation. No schema/migration change. Evidence: `design/evidence/NMI-PROTOTYPE-10D-A2/QA-RESULTS.md`.
- **Validation:** 207 focused web/Nudgey tests passed; 96 disposable PostgreSQL list/store/analytics tests passed; 12/12 local Chrome checks passed; lint, format, typecheck, build, bundle secret scan and diff check passed. Vite reported a non-failing large-chunk advisory. Both newly created `nmi_test_a2_*` databases were dropped; the owner's databases were not accessed. Required Project Baseline and Stack CI are pending on the final PR head.
- **Continuation notes:** no provider calls; PayPal draft creation disabled during browser QA, OpenAI unconfigured and SMTP absent. No Render/AG Studio work, migration, merge or deployment. PayPal one-create authorization remains exhausted; OpenAI Gate A remains consumed.
- **Next action:** verify Project Baseline and Stack CI pass on the current PR #33 head, then stop for independent exact-head audit.

## Handoff: NMI-PROTOTYPE-10D-A2-CI-RECHECK-01

- **Task / phase:** `tasks/NMI-PROTOTYPE-10D-A2-dashboard-integration.md`
- **From:** implementation agent. **To:** independent exact-head correctness/security reviewer.
- **Branch / PR:** `feat/nmi-proto-analytics-02`; Draft [#33](https://github.com/mrdzyn/nudgemyinvoice/pull/33).
- **Correction:** Stack CI failed at `650e8b9d6bea89762fbe5a8eeb2eaa7299866b05` because old boundary tests rejected the new same-origin analytics route and first-party analytics code. The boundary test now allows `/api/analytics/summary` and specifically checks for third-party analytics SDKs. No production behavior changed.
- **Local validation:** boundary suite 28/28; combined focused web/Nudgey suite 235/235; lint, format, typecheck and `git diff --check` passed after correction. Prior disposable PostgreSQL integration 96/96 and local synthetic Chrome QA 12/12 remain valid; browser/application code did not change in this correction.
- **Safety:** no provider calls, migration, owner database operation, Render/AG Studio work, merge or deployment. Existing PayPal/OpenAI boundaries remain as documented.
- **Pre-documentation correction SHA / hosted CI:** `3669a3063f5b8f77f3f896c4613338f456541f18`; Project Baseline passed. Stack CI first timed out in an existing fake-adapter concurrent PayPal-draft PostgreSQL test, then the failed job rerun passed all steps including PostgreSQL tests. The documentation update in this handoff changes the PR head, so both workflows must be checked once more at the live exact head.
- **Next action:** confirm the live PR head and both required hosted checks pass at that exact SHA; then stop for independent exact-head audit.

## Handoff: NMI-PROTOTYPE-10D-A2-MINOR-1-REMEDIATION-01

- **Task / phase:** `tasks/NMI-PROTOTYPE-10D-A2-dashboard-integration.md`, independent audit MINOR-1.
- **From:** remediation implementation. **To:** independent exact-head re-auditor.
- **Branch / PR:** `feat/nmi-proto-analytics-02`; existing Draft [#33](https://github.com/mrdzyn/nudgemyinvoice/pull/33), starting/audited head `e29596618304017587548bb06fc92b1409df4616`.
- **Change:** the shared list/analytics request budget now covers HTTP headers and complete success JSON body consumption. Timeout and parent abort race body consumption; 401 remains authoritative when returned after internal timeout/cancellation. Existing stale-response generation protections are unchanged.
- **Validation:** `apps/web/src/invoices/api.test.ts` 142/142; web typecheck; changed-file ESLint and Prettier; `git diff --check`. Tests cover stalled body timeout for both endpoints, parent abort during body consumption, late 401 after timeout, and successful 200 body parsing. Read-only candidate review reported no concrete surviving bypass or behavior regression.
- **Safety:** no provider calls, database operations, migration, merge, deployment, or scope expansion.
- **Next action:** confirm both Project Baseline CI and Stack CI pass on the final live PR head, then stop for independent exact-head audit.

## Handoff: NMI-PROTOTYPE-10D-A3-OFFLINE-INVESTIGATION-01

- **Task:** `tasks/NMI-PROTOTYPE-10D-A3-paypal-offline-investigation.md`; report: `docs/NMI-PROTOTYPE-10D-A3-PAYPAL-OFFLINE-REPORT.md`.
- **From / to:** offline investigator → independent exact-HEAD reviewer.
- **Base / branch:** `main@dd6d5723eadba5c55afe9d0a6912f1510b2bb9de`; `docs/nmi-prototype-10d-a3-paypal-offline`.
- **Draft PR:** #34. Verify the live PR HEAD and both required hosted checks before review.
- **State:** docs-only investigation complete. Verdict **DEFECT REPRODUCED** for the offline-confirmed search pagination request-location mismatch against PayPal Invoicing v2 OpenAPI 2.6. No application/payment code changed.
- **Evidence:** 106/106 deterministic PayPal package tests; 9/9 create-401 PostgreSQL tests and 53/53 invoice-drafts PostgreSQL tests on a fresh disposable PostgreSQL 16 cluster; PayPal package typecheck passed. Full evidence and dated source refs are in the task/report.
- **Boundaries:** no provider, OpenAI, SMTP, MCP, owner DB, migration, or Render activity. `PAYPAL_DRAFTS_ENABLED=false`; historical one-create budget remains exhausted.
- **Next:** confirm final exact SHA and green Project Baseline + Stack checks, then stop for independent review. Remediation needs its own task; no PayPal provider probe without new explicit owner authorization.

## Handoff: NMI-PROTOTYPE-10D-A3-FIX1-IMPLEMENT-01

- **Task:** `tasks/NMI-PROTOTYPE-10D-A3-FIX1-paypal-search-contract.md`.
- **From / to:** implementation → independent exact-HEAD security reviewer.
- **Base / branch:** `main@816efcd9449b2fcfc00628123ded99cc4c62526a`; `fix/nmi-proto-a3-paypal-search-contract`.
- **PR:** existing Draft [#35](https://github.com/mrdzyn/nudgemyinvoice/pull/35); implementation commit `ecee331`.
- **Scope:** PayPal Invoicing v2 search fixed query serialization, exact URL allowlist exception, complete-response proof and related deterministic regression tests. No invoice-date work, migration or payment/create implementation change.
- **Validation already run:** focused PayPal client/HTTP/mapping/index tests **132/132 passed**; workspace `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` passed; create-401 and invoice-drafts PostgreSQL suites **62/62 passed** on fresh disposable PostgreSQL 16 (`nmi_test_a3fix1`) which was stopped and removed. No provider call or owner DB operation.
- **Safety:** create is still fenced and never automatically resent; search is read-only; query allowlist only permits fixed pagination values on the existing Sandbox search route. `PAYPAL_DRAFTS_ENABLED=false`; historical one-create authorization remains exhausted.
- **Next:** this PR-number documentation follow-up advances the head beyond implementation commit `ecee331`; run required hosted Project Baseline and Stack workflows on the final PR SHA, confirm it remains Draft, then stop for independent review. No merge/deploy/provider activity.

## Handoff: NMI-PROTOTYPE-10D-A3-FIX1-MINOR1-REMEDIATION-01

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A3-FIX1-paypal-search-contract.md`; existing Draft [#35](https://github.com/mrdzyn/nudgemyinvoice/pull/35).
- **From / to:** MINOR-1 remediation → independent exact-HEAD re-auditor.
- **Audited starting SHA:** `b2e84c1503a0bd1cc3fb60eb8632ccfe2ab17553`; branch `fix/nmi-proto-a3-paypal-search-contract`.
- **Correction:** complete search results now fail closed when HATEOAS links claim `next` or `prev` despite the fixed page-1 single-page result; standard `self` link remains accepted. Restored malformed remote-ID regression.
- **Validation:** focused PayPal tests **136/136** across 4 files; `pnpm --filter @nmi/paypal typecheck`; Prettier and `git diff --check` passed. All tests use deterministic fakes; no provider or database calls.
- **Safety:** exact Sandbox allowlist unchanged; reconciliation remains read-only; create remains fenced and at most once. `PAYPAL_DRAFTS_ENABLED=false`; one-create authorization exhausted.
- **Next:** run both required hosted workflows on the final PR SHA, confirm PR #35 remains Draft, and stop for independent exact-HEAD re-audit. No provider, migration, deployment, or merge.

## Handoff: NMI-PROTOTYPE-10D-A4-START

- **Task:** `tasks/NMI-PROTOTYPE-10D-A4-prototype-readiness.md`; evidence: `design/evidence/NMI-PROTOTYPE-10D-A4/QA-RESULTS.md`.
- **From / to:** orchestrator kickoff → A4 QA/implementation agent.
- **Base / branch:** `main@588717a7b04cae185da2ad12995346943fe27d02`; `docs/nmi-prototype-10d-a4-readiness` (one Draft PR).
- **Objective:** verify the current A2+A3-FIX1 integrated **SIMULATED** judge experience from a clean clone, isolated disposable PostgreSQL and zero-provider fake launcher; refresh accurate demo runbook/submission blockers and Nov 7 hosting decision matrix.
- **Current state:** task/evidence template prepared, **NO A4 tests executed or PASS evidence claimed**. Previous R0/A2 tests are historical evidence only.
- **Security:** production `PAYPAL_DRAFTS_ENABLED=false` remains; fake evaluation may enable the feature only with fake adapters in the separate local test launcher. No real PayPal/OpenAI, MCP, owner DB, migrations on existing data, Render, deployment, merge, bills or judge URL sharing.
- **Next:** run objective-based local synthetic rehearsal, capture exact-SHA evidence and cleanup, update runbook/checklist, run required CI on final Draft PR HEAD and stop for independent audit.

## Handoff: NMI-PROTOTYPE-10D-A4-REHEARSAL-01

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A4-prototype-readiness.md`; Draft [#36](https://github.com/mrdzyn/nudgemyinvoice/pull/36); evidence `design/evidence/NMI-PROTOTYPE-10D-A4/QA-RESULTS.md`.
- **From / to:** A4 implementation/QA → independent exact-HEAD auditor.
- **Tested commit:** `8c084d7` (clean clone, new disposable PostgreSQL 16, no egress). Later commits change docs/evidence only.
- **Observed:** `pnpm validate` pass; `pnpm test:db` 340/340; A4 harness 112/112; judge-runbook Mode A commands re-run verbatim and torn down; old R0 script 29/32 (three stale pre-A2 assertions, not fixed, out of scope). A3-FIX1 covered offline only; live PayPal search NOT TESTED.
- **Verdicts:** LOCAL READY (headless/emulated only); HOSTED NOT AUTHORIZED.
- **Not run:** physical device, Safari, Firefox, VoiceOver/NVDA, Mode B, Docker, Render, AG Studio licensing, backup restore, Devpost/video.
- **Safety:** no provider call, owner DB, migration on existing data, Render, deploy or merge. Gates A/B/C stay NOT AUTHORIZED; one-create budget exhausted.
- **Next:** run both hosted workflows on the final PR HEAD (run IDs on the PR), keep Draft, independent audit, then owner merge decision.

## Handoff: NMI-PROTOTYPE-10D-A4-MINOR1-REMEDIATION-01

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A4-prototype-readiness.md`; existing Draft [#36](https://github.com/mrdzyn/nudgemyinvoice/pull/36).
- **From / to:** MINOR-1 remediation → independent exact-HEAD re-auditor.
- **Audited starting SHA:** `1550894105ea6967af1d4ded194b1d77ad902ad2`.
- **Change:** test-only harness cleanup is single-flight on exception, rejection, SIGINT and SIGTERM (children, then PostgreSQL, then data deletion; nonzero exit). New `test-cleanup-injection.mjs` 29/29; unmodified rehearsal re-run 112/112. Task status updated to the observed 112/112 and 340/340 results.
- **Safety:** no application, schema, dependency, provider, owner-DB, Render, deploy or merge change.
- **Next:** both hosted workflows on the final PR HEAD, keep Draft, independent re-audit.

## Handoff: NMI-PROTOTYPE-10D-A4-MINOR1-REMEDIATION-02

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A4-prototype-readiness.md`; existing Draft [#36](https://github.com/mrdzyn/nudgemyinvoice/pull/36).
- **From / to:** residual-MINOR remediation → independent exact-HEAD re-auditor.
- **Audited starting SHA:** `d6d0e83c3512dc24b216db18ef28f7e17b5854ac`.
- **Change:** test-only harness deletes its private PostgreSQL data directory only after shutdown is confirmed (pid no longer alive), in both the async cleanup and the `exit` fallback; otherwise it warns, preserves the directory and exits nonzero. New deterministic PG-shutdown-failure negative test; injection suite 37/37 (prior 29 unchanged); unmodified rehearsal 112/112.
- **Safety:** A4 harness, test and docs only; no application, schema, dependency, provider, owner-DB, Render, deploy or merge change.
- **Next:** both hosted workflows on the final PR HEAD, keep Draft, independent re-audit.

## Handoff: NMI-PROTOTYPE-10D-A5-D-START

- **Task:** `tasks/NMI-PROTOTYPE-10D-A5-ag-studio-integration.md`; contract `docs/NMI-PROTOTYPE-10D-A5-AG-STUDIO-PLAN.md`.
- **From / to:** A5 product/architecture kickoff → independent design/licence review and bounded A5-I1 implementation planning.
- **Base / branch:** `main@653c44451efc1c59b8a805382dc5b44d57fc7790`; `docs/nmi-prototype-10d-a5-studio-contract`.
- **State:** documentation only, not an AG Studio installed/integrated claim; owner-provided trial expiry **2026-12-16**, license string not copied or committed. Studio published EULA trial-use wording requires vendor written confirmation before external judges/public access despite marketing's production-evaluation statement.
- **Design:** retain current AG Grid Community 36.2 dashboard as default; optional view-only Studio aggregate chart area is proposed only, subject to owner visual approval. No new standalone paid Enterprise widgets or AG Studio AI.
- **Safety:** no package, dependency, app code, browser licence, PayPal/OpenAI, owner DB, provider usage, Render resource/deployment, merge or judge URL. A4 local-only simulated READY and hosted NOT AUTHORIZED remain.
- **Next:** independent scope/licence review; owner approves Studio screen/layout, then separately bounded A5-I1 local-only implementation Draft PR; test before claim of Studio integration.

## Handoff: NMI-PROTOTYPE-10D-A5-D-DESIGN-01

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A5-ag-studio-integration.md`; existing Draft [#37](https://github.com/mrdzyn/nudgemyinvoice/pull/37).
- **From / to:** Design/UX agent → project owner (visual approval), then independent design/licence review.
- **Delivered (design only):** screen spec `design/screens/NMI-PROTOTYPE-10D-A5D-STUDIO-ANALYTICS.md`; static mockup `design/mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html` (real tokens/app CSS inlined); 19 PNG previews and generator scripts in `design/evidence/NMI-PROTOTYPE-10D-A5D/`. Desktop 1280, tablet 820, mobile 390; light/dark; loading, empty, error, Studio-unavailable and session-expired states; currency-separated cards, daily value chart, draft-status breakdown, shared filters, unchanged AG Grid Community table.
- **Proposal:** one optional view-only Studio panel between the currency cards and the table, fed by the existing `POST /api/analytics/summary`; no Studio filters, KPI tiles, table, export, edit or AI. Community dashboard remains the default and fallback.
- **Not verified:** AG Studio rendering/theming/accessibility/watermark/licence behavior (previews are not Studio renders); physical device, Safari/Firefox, assistive technology.
- **Safety:** no package, dependency, application, schema, licence-key, provider, owner-DB, Render, deploy or merge change. Synthetic data only.
- **Next:** owner decides Q1-Q6 in the spec and approves or requests changes. Only after approval, a separately scoped A5-I1 local implementation Draft PR. Both hosted workflows on the final head of this PR.

## Handoff: NMI-PROTOTYPE-10D-A5-D-OWNER-APPROVAL-01

- **Task/PR:** `tasks/NMI-PROTOTYPE-10D-A5-ag-studio-integration.md`; existing Draft [#37](https://github.com/mrdzyn/nudgemyinvoice/pull/37).
- **From / to:** owner-approved A5-D visual direction (2026-11-04, Asia/Manila) → Design/UX agent to align generated mockup/previews, independent exact-HEAD review, then separately authorized A5-I1 local-only implementation.
- **Owner-approved decisions:** Activity analytics between KPI cards and Community table; single-currency chart selector that does not change filters; view-only; daily <=90 local calendar days / weekly plotted buckets >90 days with exact per-currency minor units and complete daily table; **mobile <=767px collapsed by default**, desktop/tablet expanded; Studio badge only when truly active and vendor attribution never hidden. Idle tooltip should not appear until hover/focus/tap.
- **Preview debt:** all 19 initial PNG previews and source mockup are from pre-approval proposal (mobile initially expanded, daily-only, idle tooltip); **not final** until regenerated/reviewed. Keep examples synthetic and licensed AG Studio uninstalled in this design PR.
- **Separate existing-dashboard QA:** 390px Nudgey overlay partly obscures Load more; dark-mode date input calendar icon contrast must be measured. Do not silently modify application scope here.
- **Boundaries:** no key handling/installation/AG Studio code, dependency, provider calls, owner database, Render, public judge access, deployment or merge approval. Trial expiry 2026-12-16; external judge licensing rights remain UNVERIFIED.
- **Next:** update HTML generator, mockup, 390px previews and captions, run local design validation and both hosted CI, request independent exact-HEAD design audit, then obtain separate owner squash-merge decision for PR #37.

## Handoff: NMI-PROTOTYPE-10D-A5-D-PREVIEWS-REV2-01

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A5-ag-studio-integration.md`; existing Draft [#37](https://github.com/mrdzyn/nudgemyinvoice/pull/37).
- **From / to:** Design/UX agent → independent exact-HEAD design auditor, then owner squash-merge decision.
- **Starting SHA:** `ef4381763389955d697a504585644d85e31192fa` (owner-approved decisions recorded).
- **Delivered (design only):** generator, mockup and 34 PNG previews regenerated for the approved refinements: mobile (<=767px) panel collapsed by default with accessible Show/Hide charts; daily bars up to 90 days, weekly (Monday start, exact BigInt sums) beyond, daily table preserved; tooltips only on hover, keyboard focus or tap; Studio badge only in the Studio-active variant, vendor-attribution area never hidden while widgets show, truthful "Charts unavailable" fallback; Studio-off preview equals today's dashboard. Light/dark, desktop 1280, tablet 820, mobile 390, loading/empty/error/fallback/session-expired.
- **Validation:** capture script `design-checks.json` 177/177 PASS (headless Chrome, emulated); `pnpm validate` and both hosted workflows (see PR for run IDs). Existing filters, KPI cards and Community grid markup unchanged.
- **Not verified:** AG Studio rendering/theming/accessibility/watermark/licence behavior (previews are not Studio renders); physical device, Safari/Firefox, assistive technology. Existing-dashboard 390 px Nudgey/Load more overlap and dark date-icon contrast remain separate QA items.
- **Safety:** no AG Studio package, licence key, dependency, application, schema, provider, owner-DB, Render, deploy or merge change.
- **Next:** independent audit, owner merge decision for PR #37, then a separately scoped A5-I1 local implementation task.

## Handoff: NMI-PROTOTYPE-10D-A5-D-MINOR1-REMEDIATION-01

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A5-ag-studio-integration.md`; existing Draft [#37](https://github.com/mrdzyn/nudgemyinvoice/pull/37).
- **From / to:** MINOR-1 remediation → independent exact-HEAD re-auditor.
- **Audited starting SHA:** `7905cdddf4a7f0ed4496ded6c642d68ee437a23a`.
- **Change (design generator/evidence only):** the accessible daily table keeps every calendar day, including zero-invoice days with the exact zero ($0.00, €0.00, ¥0), in daily and weekly modes. New capture checks assert exactly 30/90/120 consecutive daily rows for all nine currency x range combinations, exact zero values, zero rows = zero-height bars, and table = bars = card in minor units. 227/227 PASS; a negative control with the old filter fails 15. Mockup, previews, design-checks.json and docs regenerated.
- **Safety:** no production code, AG Studio package, licence key, provider, owner-DB, Render, deploy or merge change.
- **Next:** both hosted workflows on the final head, independent re-audit, owner squash-merge decision, then separately scoped A5-I1.

## Handoff: NMI-PROTOTYPE-10D-A5-I1-START

- **From / to:** owner approved A5-D + audit PASS and squash merge → A5-I1 implementation agent (real AG Studio runtime).
- **Base / branch:** `main@a231cd91534cceb0dc3946a0a34a8427192d204b`; `feat/nmi-a5i1-ag-studio-local` in new Draft PR.
- **Task:** `tasks/NMI-PROTOTYPE-10D-A5-I1-ag-studio-local-integration.md`; canonical owner-approved A5-D screen spec and 34 design previews. **Kickoff only**, no package integration yet.
- **Owner local license:** key present in an untracked `.env.local` as **`AG_STUDIO_LICENSE_KEY`**, expiry 2026-12-16. Do NOT copy/view/report its value in GitHub, chat, logs or CI. Determine root vs `apps/web` location privately. Vite does not automatically expose unprefixed keys; use a strict **dev-server-only** bridge while keeping all production builds key-free. A client-running Studio license is necessarily visible to the local browser.
- **Implementation:** real AG Studio 3.0 view-mode chart(s) from existing authenticated sanitized aggregate only, default-off lazy local feature, mobile default collapsed, weekly after 90 days, exact daily table; never substitute design mockup as real integration.
- **Safety:** Keep Community dashboard working; no AG Studio AI, provider/MCP calls, owner DB, new API/schema, public deployment, licensed demo recording, license commit, merge or billing. Hosted judge AG Studio rights remain unverified.
- **Next:** coding agent implements on branch, performs actual local Studio browser QA with synthetic data, documents evidence, runs both exact-HEAD CI, stops for independent audit.

## Handoff: NMI-PROTOTYPE-10D-A5-I1-IMPL-01

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A5-I1-ag-studio-local-integration.md`; existing Draft [#38](https://github.com/mrdzyn/nudgemyinvoice/pull/38).
- **From / to:** A5-I1 implementation → independent exact-HEAD security/licence/UX auditor.
- **Starting SHA:** `4bf3f69cbc54c950204258ea38d1f9074ea51043`.
- **Delivered:** `ag-studio@3.0.0` + `ag-studio-react@3.0.0` (exact pins; Grid 36.2.0 / Charts 14.2.0 aligned). View-only Activity analytics panel (`apps/web/src/features/studio/`) fed only by the existing `POST /api/analytics/summary`: daily chart <=90 days, Monday-start weekly beyond, all calendar days incl. zero in the exact table, per-currency BigInt-exact model that fails closed, status chart, mobile collapsed default, fallback "Charts unavailable". Slot dev-gated by `import.meta.env.DEV` + `VITE_NMI_STUDIO_LOCAL=1` (default OFF), lazy; `studioBuildGuard` fails any build that resolves/bundles a licensed package.
- **Licence key:** found in repo-root `.env.local` (privately). A dev-server-only Vite plugin (`apps/web/vite.studio-dev.ts`) reads ONLY the `AG_STUDIO_LICENSE_KEY` line and serves it at runtime on a loopback/same-origin/flagged GET; never `define`d, never in a build. Value never printed or committed; scans (working tree, API/Vite logs, DOM, console, storage, dist) say absent.
- **Validation:** QA harness 96/96 (real Studio vs independent SQL, failure states, 401, stale answers, mobile, flag-off); `pnpm validate` passed (1097 tests, 41 new; boundary tests updated deliberately); production bundles clean (3 files); both hosted workflows: see PR for run IDs. DB tests not run (no DB change).
- **Observed limits:** no watermark appears in view mode with or without the key, so entitlement is not observable; screenshots are key-withheld renders only (no licensed render committed); physical device/Safari/Firefox/AT NOT RUN; hosted/public/judge Studio NOT AUTHORIZED (written AG Grid confirmation required; trial ends 2026-12-16).
- **Safety:** no provider call, owner DB, Render, deployment, merge, production API/schema change.
- **Next:** audit; owner merge decision. Hosted Studio only after written licence rights and a separate release gate.

## Handoff: NMI-PROTOTYPE-10D-A5-I1-FIX1-01

- **Task / PR:** `tasks/NMI-PROTOTYPE-10D-A5-I1-ag-studio-local-integration.md`; Draft [#38](https://github.com/mrdzyn/nudgemyinvoice/pull/38). **From / to:** implementation → independent focused re-audit. **Starting SHA:** `a1829462ae50b7a27c0cd1c9aae8a046e07d5060`.
- **MINOR-1 fixed:** `StudioSlot.tsx` boundary now renders a dependency-free "Activity analytics → Charts unavailable" `role=status` notice (no badge, `data-studio="fallback"`) when the OUTER `StudioPanel` chunk fails. No Retry button (a cached rejected `React.lazy` cannot truthfully retry); the notice says to reload. The exact data stays in the authoritative cards and Community grid; the daily table needs the panel module and is not duplicated in this fallback.
- **MINOR-2 fixed:** `StudioPanel.tsx` badge and `data-studio="active"` now derive from actual rendered Studio widgets (ready, module present, chart-safe currency). Over-limit shows the exact daily table and "Chart not drawn" with `data-studio="fallback"` and no badge; switching to a safe currency restores badge and charts.
- **Tests:** new `StudioFallback.test.tsx` (4, happy-dom, licensed loader and licence fetch stubbed): outer-chunk rejection, healthy control, huge fixture with tab switching, single-currency all-huge. Control: the 4 fail on the pre-fix code (the file also needs the new `StudioSlotWith` export, so MINOR-2 failure there is partly structural). `pnpm validate` passed (1101 tests). The 96-check browser matrix was NOT rerun (changes do not touch its proven behaviours); no browser run of the outer-chunk failure was added.
- **Unchanged:** design, analytics API, licence bridge, build guard. No provider call, owner DB, Render, deploy or merge.

## Handoff: NMI-RENDER-P3-25-BUDGET-APPROVAL-PREP

- **From / to:** owner $25 credit approval → Render P3 documentation/pricing/security preflight (separate from A5-I1 implementation).
- **Base / branch:** `main@a231cd91534cceb0dc3946a0a34a8427192d204b`; `docs/nmi-render-p3-budget-25`. Draft docs-only PR; **NOT the active implementation handoff** (A5-I1 remains active).
- **Budget:** up to **USD $25 total NMI hosting** through 2026-12-15 from available Render credit, user approval 2026-11-04. Actual live credit balance and eligibility unknown. Public list rates Hobby + Starter $7/month + Basic PG $6/month, 1 GB included; no hard billing cap for total usage.
- **Read-only Render evidence:** Mrdzyn workspace found; no PostgreSQL instances; service inventory null. No resource provisioning, production code, release branch, initial deployment, paid charge, or deletion performed.
- **Safety:** new P3 paid-resource proposal updates Free-tier selection **only if owner merges it**; all P1/P2 privacy, proxy, auth, DB roles, first-deploy and judge-sharing gates remain. Studio hosted licensing and client-visible key remain unapproved.
- **Next:** independent docs exact-HEAD audit, owner squash merge decision; then later real checkout/credit verification and separate first-deploy authorization only after release gates.

## Handoff: NMI-RENDER-P3-FIX1-01

- **Task / PR:** `tasks/NMI-RENDER-P3-25-BUDGET-GATE.md`; existing Draft [#39](https://github.com/mrdzyn/nudgemyinvoice/pull/39). **From / to:** P3 remediation → independent exact-HEAD docs re-audit. Start `898dd8b467c361f0d8817b81a02e86eb16936613`; final head is reported in the PR comment.
- **MAJOR-1:** merged `origin/main@e314bef` into the branch (normal merge, no force-push). STATUS/HANDOFFS conflicts resolved keeping all main entries and the earlier P3 entry.
- **MINOR-1:** STATUS/P3 task now say A5-I1 PR #38 is merged and P4 PR #40 is audited but unmerged; P2 preface de-duplicated and framed as a superseded pricing preference (history kept, P1/P2 security untouched).
- **MINOR-2:** P3 packet carries G1–G8, G5 and G7 as unresolved, states the $25 cap is manual, that stopping the web service may not stop PostgreSQL billing, requires an owner-approved teardown/retention plan before provisioning, and storage autoscaling OFF at 1 GB.
- **Not changed:** the $25-through-2026-12-15 approval (a ceiling only), all code, dependencies and infrastructure. Docs-only diff. No Render action, release branch, deploy, provider call, merge or secret access.
- **Pointer caveat:** STATUS Active task/handoff point to this P3 work while #39 is open; when PR #40 merges, restore its `NMI-RENDER-P4-FIX1-01` pointers.
- **Next:** hosted CI at the final head, independent re-audit, owner merge decision.

## Handoff: NMI-RENDER-P4-START-01

- **From / to:** independent A5-I1 PASS + owner squash merge of PR #38 → Render release-readiness implementation agent.
- **Base:** `main@e314bef381c66b4233576683c7f53dd248f58a86`; branch `feat/nmi-render-p4-release-readiness`; task `tasks/NMI-RENDER-P4-RELEASE-READINESS.md`.
- **What is authorized:** READ, design/run local offline preflight evidence, bounded hosting-related repairs with tests, documentation. **NOT authorized:** Render resource creation, first deploy, release branch creation, spend/overage acceptance, judge sharing, key distribution, providers or PR merge.
- **Cost:** owner approved **$25 max of Render credit budget** through 2026-12-15; P3 budget Draft PR #39 remains open, not audited/merged. Do not treat published $7 web + $6 DB as a confirmed account quote; no automatic hard cap.
- **Hosting route:** existing Fastify same-origin static/API, secure cookie, exact-origin CSRF, single operator, manual PG16 migration/operator role. Assess the unresolved Hobby native HTTP request-log evidence gap; prepare explicit alternative risk proposal instead of silently waiving.
- **Studio:** AG Studio 3.0.0 now merged in **dev-only/off-by-default** mode. Production build must contain **no AG Studio code/key**, Render remains Community-only until separate written provider external-use approval.
- **Next:** implement and validate release-readiness evidence on this Draft PR, both hosted CI checks, stop for independent exact-HEAD hosting/security audit and subsequent owner decisions.

## Handoff: NMI-RENDER-P4-IMPL-01

- **Task / PR:** `tasks/NMI-RENDER-P4-RELEASE-READINESS.md`; Draft [#40](https://github.com/mrdzyn/nudgemyinvoice/pull/40). **From / to:** implementation → independent exact-HEAD hosting/security auditor. **Starting SHA:** `e7b50f418817e84a8522618f3fbbb9a0758d3a5b`.
- **Verdict:** READY FOR OWNER HOSTING APPROVAL, conditional on owner gates G1–G8 (`docs/NMI-RENDER-P4-RELEASE-READINESS.md` §10). Nothing created or deployed.
- **Evidence:** Community-only build verified plus negative control (flag + fake key → byte-identical bundle); `pnpm test:db` on PG16.15: 340 passed; P1 hosted real-Chrome harness re-run as adapted copy 26/26; backup/restore drill 26/26 (non-superuser owner, restore, least-privilege and audit immutability preserved, corrupted-dump control, confirmed-shutdown cleanup).
- **Code change (only):** `release-preflight` CLI (`apps/api/src/release-preflight.ts`, `cli/release-preflight.ts`, package script) with 42 tests: env matrix (provider-disabled, never prints values) and exact-SHA source controls. No app behaviour changed.
- **For the auditor to judge:** Hobby request-log alternative contract and residual risk (§6, gate G5); Studio packages being downloaded by Render's build (§3, G7); `loadConfig` does not itself reject provider keys in production (preflight is the control).
- **Not done:** Render API/UI, release branch, merge of #39/#40, provider calls, Safari/Firefox/device/AT QA, restore on Render's managed service.

## Handoff: NMI-RENDER-P4-FIX1-01

- **Task / PR:** `tasks/NMI-RENDER-P4-RELEASE-READINESS.md`; Draft [#40](https://github.com/mrdzyn/nudgemyinvoice/pull/40). **From / to:** implementation → independent focused re-audit. **Starting SHA:** `ddac9155d0210bd93f7cb503b6734e5838f18a5e`.
- **MAJOR-1 fixed:** `release-preflight source` now reads the CURRENT `main` and `release/nmi-render-judges-2026` tips with `git ls-remote --exit-code` (never local tracking refs); the release branch is mandatory (no `--release-ref`); remote failure/incomplete answer fails closed; ancestry is judged against the fresh main tip (missing object ⇒ fail).
- **MINOR-1 fixed:** every git call is anchored to `git rev-parse --show-toplevel`, so the lockfile check targets the root `pnpm-lock.yaml` from `apps/api`; a failed `git status` no longer looks clean. P4 browser JSON `generatedBy` corrected.
- **Tests:** 53 in `release-preflight.test.ts` (11 new CLI/remote cases) against a disposable bare remote: pinned pass (root and apps/api cwd), stale tracking ref fails after the remote moves, stale main ancestry fails until fetched, absent/unknown branch and unreachable remote fail, HEAD mismatch / dirty / off-main each fail, tampered root lockfile fails from apps/api. Full browser/DB drills not rerun (unchanged code paths).
- **Scope held:** no Render, release branch, deploy, provider call, key handling, budget change or merge during the original P4-FIX1 implementation.
- **P3-to-P4 reconciliation (2026-11-04):** P3 PR #39 was independently audited and owner squash-merged to `main@5160dff9b0072913d3f12e20e81ac8d86d081cb7`. A non-force two-parent merge on this existing Draft P4 branch brings the **complete P3 budget docs, P2 historical preface, and both P3 handoffs** forward while preserving all P4 code/tests/evidence and the P4 active task/`NMI-RENDER-P4-FIX1-01` pointer. All G1–G8 persist; G3 (P3 audit/merge) is complete, but G1/G4/G5/G6/G7 and G2's P4 merge remain open. No release branch, Render action or first deployment; re-run exact-head hosted checks and request independent merge-specific audit.

## Handoff: NMI-UI-ANALYTICS-FIRST-01-IMPL

- **From / to:** owner screenshot direction → targeted authenticated UI implementation → independent exact-HEAD review and owner visual QA.
- **Base / branch:** `main@8cc2f4db945af5449d99c01236baca9a21396a50`, `feat/nmi-ui-analytics-first-01`; task `tasks/NMI-UI-ANALYTICS-FIRST-01.md`.
- **Changes:** Move the existing dev-only StudioSlot before currency KPI cards, directly after the shared filters/coverage; adapt explanatory/fallback copy to reflect new order. Preserve established top-level currency pill filtering and A5 chart tabs only for All currencies.
- **Evidence:** targeted SSR order and currency-selection tests committed; hosted CI result must be verified on final HEAD. No local full browser / PG test performed in this connector-only environment. Do not claim visual QA until owner verifies `VITE_NMI_STUDIO_LOCAL=1` on desktop/mobile.
- **Boundaries:** No AI/PayPal or Render calls, license-key access, DB/schema modification, public Studio enablement, merge, deployment or billing change.
- **Next:** await mandatory CI, request independent code-focused audit, then owner authenticated screenshot QA before any squash merge.

## Handoff: NMI-UI-ANALYTICS-FIRST-01-REV1

- **From / to:** review-and-improve of Draft PR #41 at `be9bf347` → independent exact-HEAD review and owner visual QA.
- **Changes:** panel/card spacing defect fixed (`.studio-slot`), reload placeholder prevents layout jump, duplicated copy fixed, visible chart-tabs note added, tests strengthened. Details are in the task's REV1 section.
- **Evidence:** targeted web tests passed; local A5-I1 harness ran 95/96, with the one expected FAIL being the superseded old-order assertion; desktop and 390px screenshots reviewed (not committed).
- **Boundaries:** dev-only Studio and production Community-only unchanged; no API/DB/dependency/provider/Render/merge change. G7 stays unresolved.
- **Next:** hosted CI at the final head, independent review, owner signed-in visual QA.

## Handoff: NMI-P5-IMPL-01

- **Task / branch:** `tasks/NMI-P5-LICENSED-STUDIO-PRODUCTION.md`; `feat/nmi-p5-licensed-studio`, Draft PR stacked on #41 (`f524836`). **From / to:** P5 implementation → owner visual acceptance + independent security/licence audit.
- **Delivered:**
  - strict licensed web variant with variant-aware build guard and bundle scans (both variants in `validate` and Stack CI);
  - authenticated `no-store` licence route and server-only config;
  - production fail-closed fallback, with the dev bridge unchanged;
  - per-response CSP style nonce, plus the documented AG Studio 3.0.0 `styleNonce` workaround;
  - release preflight requiring `NMI_WEB_STUDIO=licensed` and `AG_STUDIO_LICENSE_KEY`;
  - dashboard visual refinements.
- **Evidence:** licensed production QA 37/37; A5-I1 dev QA 96/96 (order assertion corrected); screenshots in `design/evidence/NMI-P5/`; see the release doc §6 for tests.
- **For the auditor:**
  - the `createElement` style-nonce shim in `StudioCharts.tsx` (rationale in release doc §4);
  - the licence's inherent browser visibility to the signed-in operator (§2);
  - the shell is now `no-store`;
  - G7 is owner-attested only;
  - the licensed entry chunk is 173 kB larger.
- **Not done:** hosting, real devices, Safari/Firefox, screen readers, independent review of the licence terms. No provider call, Render action, release branch, deploy, merge or licence disclosure.
- **Next:** owner visual acceptance of screenshots `01`–`08`; independent exact-HEAD review; then the separate merge decisions (#41 first, or P5 superseding it).

## Handoff: NMI-P5-FIX1-01

- **Task / PR:** `tasks/NMI-P5-LICENSED-STUDIO-PRODUCTION.md` (section P5-FIX1); Draft [#42](https://github.com/mrdzyn/nudgemyinvoice/pull/42). Start `2bbc5a8431e9979a886b2f13bc7f5d1d9a29514b`; final head is in the PR comment. **From / to:** remediation of audit 5771745273 → independent re-audit.
- **SEC-N1:** the global `createElement` shim is removed. Four static vendor stylesheets are allowed by exact SHA-256 (`studio-style-hashes.ts`), with provenance, a lockfile pin and a boundary test against DOM-prototype patches. The browser negative-CSP checks pass for both policies, with a positive control.
- **SEC-N2:** revocation wording corrected in release doc §2 and §7.
- **Evidence:** licensed production QA 43/43; new vendor style-hash tests (4); updated hosting tests; `pnpm validate` and `pnpm test:db`; hosted CI at the final head.
- **Residual:** licence extractable by the signed-in operator and not recallable; hash upkeep on vendor upgrade; no automated expiry enforcement; G7 owner-attested only; Safari/Firefox/devices/AT not tested; owner visual acceptance pending.
- **Unchanged / not done:** licensed variant, visuals, authentication, PR #41 layout. No merge, deploy, Render action or provider call.

## Handoff: NMI-P6-DESIGN-01

- **Task / branch:** `tasks/NMI-P6-AI-NUDGE-INTELLIGENCE.md`; `feat/nmi-p6-ai-nudges`, Draft PR stacked on P5 #42 (`7ab0dcd`). **From / to:** P6 backend + design proposal → **owner visual approval** (D1–D7 in `design/screens/NMI-P6-AI-NUDGE-QUEUE.md`), then the UI shell.
- **Delivered:**
  - migration `0008` `invoice_nudges` with constraints and least-privilege grants;
  - `PostgresNudgeStore` (operator-scoped, one pending per invoice, version-bound transitions);
  - `packages/ai/src/nudge.ts` (the model sees tone/currency/due-status only; output validated against digits, links, symbols, unbacked claims and placeholders; verified values substituted);
  - nudge routes with budget, concurrency cap and content-free audit;
  - a static design preview (7 frames × desktop/mobile, 24/24 design checks).
- **Evidence:** AI package tests, store 7, API 12, runtime-role denials, migration/constraint guards updated; `pnpm validate` and `pnpm test:db`; hosted CI at the final head (in the PR).
- **Not started:** queue UI, dashboard card, saved-invoice card, Nudgey intent, browser QA (all gated on approval). No live provider, sending, Render, deploy or merge.
- **Next:** owner approves or amends D1–D7 → UI shell against the approved previews → wiring → browser QA → CI → independent review.

## Handoff: NMI-P6-IMPL-01

- **Task / branch:** `tasks/NMI-P6-AI-NUDGE-INTELLIGENCE.md`; `feat/nmi-p6-ai-nudges`, Draft PR #43 stacked on P5 #42. **From / to:** implementation agent → **independent exact-HEAD audit** (then owner merge sequencing). Design gate CLOSED (owner approval, PR #43 comment 6652365002).
- **Delivered since `NMI-P6-DESIGN-01`:** owner refinements 1–3; `maxRetries: 0` with a one-request proof; the approved UI (`apps/web/src/nudges/`, `nudgey/nudgeIntent.ts`, `nudgey/NudgeDraftFlow.tsx`, nav, dashboard slot, saved-invoice card); test-only launcher + browser journey under `design/evidence/NMI-P6/`.
- **Audit focus:** `packages/ai/src/nudge.ts` (`PAYMENT_STATUS` guard, `DUE_TEXT`, retries); `apps/web/src/nudges/api.ts` strict parsing (`sentToCustomer === false`); version binding in `PendingReviewPanel` (approve disabled while dirty); every costed call behind an explicit click (+ confirm dialog for Regenerate, confirm step in chat); boundary-test updates (`boundaries.test.ts`, `StatusPicker.test.tsx` fetch allowlist) are deliberate; P5 dashboard change is only the `nudgeCard` slot.
- **Evidence:** validate 1341, test:db 366, journey 150/150 (`design/evidence/NMI-P6/qa-results.json`), preview 25/25; hosted CI at the final head (in the PR).
- **Not done / not authorized:** live OpenAI (Gate A), PayPal, sending/scheduling of any kind, Render, deploy, merge.

## Handoff: NMI-P6-FIX1-01

- **Task / branch:** `tasks/NMI-P6-AI-NUDGE-INTELLIGENCE.md`; `feat/nmi-p6-ai-nudges` (Draft PR #43, base unchanged). **From / to:** implementation agent → **independent exact-HEAD re-audit** of the P6-AUD-01/02/03 remediation (audit comment 6658712501 at `d6f3d68`).
- **Changed:**
  - `packages/ai/src/nudge.ts`: `PAYMENT_STATE_WORDS` / `PAYMENT_STATUS` and the prompt vocabulary;
  - `apps/api/src/config.ts` + `server.ts`: `NUDGE_AI_DRAFTING_ENABLED` → `config.nudgeDrafting`;
  - `.env.example`;
  - `apps/web/src/nudges/api.ts` and `controller.ts`, and `nudgey/NudgeDraftFlow.tsx`: 401 takes precedence over abort;
  - the fake model and mockup wording, reworded to the neutral vocabulary.
- **Tests added:**
  - P6-AUD-01: AI cases;
  - P6-AUD-02: `nudge-drafting-config.test.ts` and one PostgreSQL API test;
  - P6-AUD-03: `nudges/controller.test.ts` and a chat-flow test.
  - Negative controls against the audited code: 20 AI cases and 3 late-401 cases fail there.
- **Evidence:** validate 1383, test:db 367, journey 150/150, preview 25/25; hosted CI at the final head (in the PR).
- **Not done / not authorized:** live OpenAI (Gate A; the new flag stays `false`), PayPal, sending, Render, deploy, merge or rebase.

## Handoff: NMI-POSTMERGE-41-43-01

- **Task / branch:** NMI-POSTMERGE-41-43-01 (post-merge documentation reconciliation); `docs/nmi-postmerge-41-43` from `main@fbd2d8ef41e7ab08a7dbd2793468d5d9033d1d38`; Draft PR to `main` (link in the PR). **From / to:** implementation agent → **independent focused documentation audit**, then the owner's merge decision.
- **Verified before editing:** `origin/main` = `fbd2d8e`. The #41/#42/#43 squash trees equal their audited heads `f524836`/`7ab0dcd`/`a68f77b`. All three PRs are MERGED. The #41 SHA given in the task brief was malformed; the actual SHA is `08bd5ad63f26e95414c864d14bc14f4c84cef65d`.
- **Changed (docs only):**
  - `docs/STATUS.md`: merged table with evidence attribution, open Codex P2 findings, next action and release gates.
  - Status lines in the three task files.
  - Stale state lines in `docs/NMI-P5-LICENSED-STUDIO-RELEASE.md` and `docs/NMI-RENDER-P4-RELEASE-READINESS.md`.
  - No source, migration, lockfile, workflow, dependency or secret changes.
- **Release separation confirmed:** P4 remains "ready for owner hosting approval, conditional on G1–G8". The P5 doc states that release is not authorized. G5/G7 are open, the licence is owner-attested, `NUDGE_AI_DRAFTING_ENABLED` and `PAYPAL_DRAFTS_ENABLED` are `false`, and Gates A/B/C are NOT AUTHORIZED.
- **Open:**
  - Two automated Codex P2 UX findings on #43 (review 5787025325), unverified.
  - The P4 restore drill predates migration `0008`.
  - The preflight does not name `NUDGE_AI_DRAFTING_ENABLED`.
- **Next:** focused doc audit → owner merge → owner-approved P7 release-readiness refresh task. No deploy, Render action or provider call.

## Handoff: NMI-POSTMERGE-41-43-02

- **Task / branch:** NMI-POSTMERGE-41-43-01 audit fixes; same branch `docs/nmi-postmerge-41-43`, same Draft PR #44. **From / to:** implementation agent → **focused re-audit** of audit comment 6662478420 (PARTIAL at `d41af19`).
- **DOC-01:** `docs/NMI-RENDER-P4-RELEASE-READINESS.md`. Old procedural text at §header, §2.1 and §13 is labelled _historical_. G2 is marked CLOSED (#40 merged `8cc2f4d`), noting that the P4 evidence does not cover `0008`. P5 supersession now records #42 merged. G1 and G4–G8 stay open, and no release SHA is selected.
- **DOC-02:** the P5 release doc §5 records owner acceptance via the #42 merge, and keeps Safari/Firefox/device/screen-reader/zoom QA as not performed. The STATUS NMI-FUP-01 line now gives eight migrations at the time and nine now.
- **Unchanged:** Markdown only, with no other content changed. No merge, deploy or provider action.

## Handoff: NMI-P7-START-01

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md`; `phase-7/nmi-release-readiness`, created from owner-merged `main@7c56b078eb997744fd1d9bdb7668114f490171c7`. **From / to:** owner/orchestrator kickoff → bounded P7 implementation agent, then independent exact-HEAD review.
- **Authorization:** owner asked to _start P7_; safe repository changes and local/synthetic/disposable validation only. No deploy, billing, infrastructure, live OpenAI/PayPal, sending, release SHA, merge or publication.
- **Four implementation slices:** P7-A close both Codex P2 Nudgey/queue UI findings with regression coverage; P7-B add explicit default-off `NUDGE_AI_DRAFTING_ENABLED` release-preflight guard; P7-C new PG16 recovery proof through migration `0008` and `invoice_nudges` runtime grants (old P4 26/26 remains historical); P7-D evidence, current docs, both exact-HEAD CI workflows and independent audit.
- **State:** contract and STATUS updated, **no P7 application implementation or recovery drill has yet been run**. Existing P4 G1 and G4–G8 release gates and provider Gates A/B/C remain unapproved.
- **Next:** implement the four slices on this **same Draft PR** without duplicating branches, then hand off the exact SHA and actual test results. Only owner approval permits eventual squash merge; no deployment is implied.

## Handoff: NMI-P7-A-01

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md` slice **P7-A**; `phase-7/nmi-release-readiness`, Draft PR #45. **From / to:** implementation agent → **independent exact-HEAD review of P7-A** (P7-B/C/D not started).
- **Implementation SHA:** `2b2c722fc2f164b6c56dd6349641b3dd1c9f8f74` (code and tests; this handoff commit follows it).
- **Changed:** `apps/web/src/nudges/NudgeQueueScreen.tsx` (a NEW `nudgeFocus` request re-targets a mounted queue: tab, selection and one refresh; manual choices are untouched otherwise); `apps/web/src/nudgey/NudgeDraftFlow.tsx` (pending-exists carries its `invoiceId`; choosing another invoice clears it and any stale failure; a replacement reference is refused unless it belongs to the chosen invoice; in-flight guard). Tests: `NudgeQueue.test.tsx` (+3) and `NudgeDraftFlow.test.tsx` (+5).
- **Evidence (implementation-agent, local):**
  - `pnpm validate` passed (1391 tests, +8).
  - Targeted `src/nudges` and `src/nudgey`: 203 passed.
  - **Negative control:** 5 of the 8 new tests fail against the unfixed sources.
  - The existing P6 synthetic browser journey re-ran 150/150 (fake model, disposable PostgreSQL); its committed evidence files were left unchanged.
  - `pnpm test:db` was not run: no server, schema or migration code changed.
- **Preserved:** received-401 expiry, explicit confirmation before every costed call, version binding, no-send boundaries.
- **Limits:** the already-mounted and A→B→A cases are covered by DOM tests, not by new browser QA. The two Codex findings remain reported, not independently verified.
- **Next:** independent review of P7-A, then P7-B (preflight flag). No merge, deploy or provider action.

## Handoff: NMI-P7-A-02

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md` slice P7-A; `phase-7/nmi-release-readiness`, Draft PR #45. **From / to:** implementation agent → **focused re-audit of P7-A-E1** (audit comment 6663676758). Corrects `NMI-P7-A-01`; that entry is not rewritten.
- **Correction:** `NMI-P7-A-01` and the PR #45 report said the committed P6 evidence files were left unchanged. That was **wrong for `caa7765`**. Re-running the P6 browser journey rewrites its tracked screenshots, and my handoff commit (`git add -A`) included 32 of the 35 PNGs. I had restored only `qa-results.json`.
- **Fix:** a normal follow-up commit restores `design/evidence/NMI-P6/` byte-for-byte from implementation commit `2b2c722f` (the same blobs as kickoff `6d9c25a`). All 35 screenshot blobs were verified identical to both. The PNGs captured by the re-run were not adopted, and no visual-equivalence claim is made.
- **Unchanged:** the P7-A source fixes and tests (`2b2c722`) are untouched.
- **Evidence:** the earlier local results stand as implementation-agent reports (`pnpm validate` 1391, targeted 203, negative control 5 of 8 new tests, P6 journey 150/150). The 150/150 run was a regression run only, and the new already-mounted and A→B→A flows have DOM evidence, not browser evidence.
- **Next:** re-audit E1, then P7-B only after that. When the journey is re-run, restore or exclude `design/evidence/NMI-P6/` before committing. No merge, deploy or provider action.

## Handoff: NMI-P7-B-01

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md` slice **P7-B**; `phase-7/nmi-release-readiness`, Draft PR #45, started from `4e08fcc` (P7-A accepted; its implementation is untouched). **Implementation SHA:** `325a188736c0feaecbdc7821df905e3031ed5f93`. **From / to:** implementation agent → **independent exact-HEAD review of P7-B** (P7-C/D not started).
- **Changed:** `apps/api/src/release-preflight.ts` adds rule `env.NUDGE_AI_DRAFTING_ENABLED`. The variable passes only when absent or exactly `"false"`; `"true"`, empty, `FALSE`/`False`/`TRUE`, padded (leading/trailing space or newline), numeric and malformed values fail. The finding names the variable only and never prints a value. Tests are in `release-preflight.test.ts`; the matrix row is added in `docs/NMI-RENDER-P4-RELEASE-READINESS.md` §4.
- **Preserved:** the OpenAI/PayPal/test name prohibitions, `PAYPAL_ENV=sandbox`, `PAYPAL_DRAFTS_ENABLED=false`, the sandbox base URL and the licensed AG Studio rules. `config.ts` and the provider clients are unchanged.
- **Tests (implementation-agent, local):**
  - Targeted `release-preflight.test.ts`: 79 passed.
  - **Negative control:** 12 of the new tests fail against the unchanged preflight.
  - Accepted environments are also accepted by the real `loadConfig`, with `nudgeDrafting` and `openai` both null.
  - Rejected non-`true` values are also refused by `loadConfig`.
  - `true` is rejected by name, with and without parser credentials.
- **Limits:** a pure offline check of names and verdicts. It does not inspect Render's real environment and proves nothing about the hosted service. `true` with the OpenAI names is reported by two rules by design.
- **Next:** independent P7-B review, then P7-C (migration `0008` recovery proof) on the same PR. No merge, deploy, provider action or release SHA.

## Handoff: NMI-P7-C-01

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md` slice **P7-C**; `phase-7/nmi-release-readiness`, Draft PR #45, started from `d2b8903` (P7-A and P7-B accepted and untouched). **From / to:** implementation agent → **independent exact-HEAD review of P7-C** (P7-D not started).
- **Implementation SHA:** runner `eca6b6b28eca90541448d4eb3b79d03a252ec58f`; the evidence run was made from that clean tree, so `recovery-results.json` records it as `sourceSha`.
- **Added (new files only; the P4 runner and its 26/26 result are untouched):** `design/evidence/NMI-P7/run-nudge-recovery-drill.mjs`, `recovery-results.json`, `RECOVERY-RESULTS.md`. Docs updated: the P7 task status line and a P7-C note under row 3 of the P4 release doc §1.
- **Result (implementation-agent, local):** 99/99 on a private PostgreSQL 16.15 with a non-superuser owner.
  - Migrations `0000`–`0008` and `runtime-role.sql` apply. Synthetic nudges cover pending, approved, rejected and superseded.
  - `pg_dump -Fc`, simulated loss and restore as the owner give matching content, schema and runtime-grant fingerprints.
  - A 31-check denial and constraint battery passes on the source and again on the restored database.
  - The one-pending index, the sensitivity control, and the truncated and wrong-header archive controls pass.
  - PostgreSQL shutdown was confirmed before the temp directories were deleted.
- **Negative control:** a one-off run, not committed, with `DELETE` and `UPDATE(ai_message, facts)` granted to the runtime role failed 14 checks (85/99).
- **Limits:** local PG16 only, not Render-managed recovery. About 100 rows. The schema allows one operator, so cross-operator isolation is covered by the API tests, not by this drill. `pnpm test:db` was not run, because no schema, migration or app code changed.
- **Next:** independent P7-C review, then P7-D (integrated verification and docs) only on owner direction. No merge, deploy, Render action, provider call or release SHA. P6 screenshot evidence is untouched.

## Handoff: NMI-P7-C-02

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md` slice P7-C; `phase-7/nmi-release-readiness`, Draft PR #45, started from `297e431`. **From / to:** implementation agent → **focused re-audit of P7-C-AUD-01** (audit comment 6675224703). Corrects `NMI-P7-C-01`, which is not rewritten.
- **Finding:** the fingerprint sensitivity control did not assert that the probe database, `pg_restore` or the update succeeded, so a failed probe could have produced an `ERR` fingerprint that merely differed from the source and falsely passed.
- **Fix (runner only):** the control now requires, in order, database created, `pg_restore --exit-on-error` exit 0, a valid pre-mutation fingerprint equal to the 12-row source, an update that changes exactly one row, and a valid, error-free, different post-mutation fingerprint. Negative controls: a real failed probe restore, a real zero-row update, and a 10-case verdict table.
- **Evidence (implementation-agent, local, regenerated):** runner commit `39e6603470022152021827acf5fef0ee4724112e`; the run was made from that clean tree, so `recovery-results.json` records it as `sourceSha`. Result **116/116**, up from 99, with 17 new checks (4 probe-step checks, 2 real and 11 table-based negative controls, and the existing control re-asserted with its reason). PostgreSQL 16.15. PostgreSQL shutdown was confirmed before cleanup, and no temp directory was left. `RECOVERY-RESULTS.md` and the P4 doc note now state 116/116 and the superseded 99/99 run.
- **Unchanged:** P4 evidence, P6 screenshots, P7-A and P7-B, migrations, `runtime-role.sql` and the application code.
- **Limits:** the same as `NMI-P7-C-01` (local PostgreSQL 16 only, about 100 rows, single-operator schema, no `pnpm test:db`).
- **Next:** re-audit P7-C-AUD-01. P7-D only on owner direction. No merge, deploy, Render action, provider call or release SHA.

## Handoff: NMI-P7-D-01

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md` slice **P7-D**; `phase-7/nmi-release-readiness`, Draft PR #45, started from `6220411` (P7-A, P7-B and P7-C independently accepted; P7-C-AUD-01 closed). **From / to:** implementation agent → **independent exact-HEAD review of P7-D and of the integrated P7 PR**, then the owner's merge decision.
- **Implementation SHAs:** journey runner `4c81a43ba46ed73db2b42adf3abdf4e2ab0d3e8f`; bundle-inspection runner `c4dd0df5dbfce1cbc3806504c44a61dd49fe03ac`; evidence and documents `15a3ec137c4f641fe2c1c0f234171b90c17d0791`. The final PR head (this handoff commit) is in the PR comment.
- **Added (no application, migration or grant change; P4 and P6 evidence untouched):** `design/evidence/NMI-P7/run-p7a-journey.mjs`, `qa-results-p7a.json`, `screenshots-p7a/`, `run-bundle-inspection.mjs`, `bundle-inspection.json`, `P7-D-VERIFICATION.md`. Documents reconciled: P4 release doc (new §14 gate ledger), P5 release doc (§8), the P7 task status line, STATUS.
- **Results (implementation-agent, local):**
  - `pnpm validate` exit 0, 1408 tests passed.
  - `pnpm test:db` 367 passed on a disposable PostgreSQL 16.15, shutdown confirmed.
  - P7-A browser journey **46/46** (fake model, disposable PG16, headless Chrome at 1280 and 390 px). It covers re-targeting of an already-mounted queue, no overwrite of manual tabs, A→B→A after a pending warning, replace only for A, 44px targets, contrast and names, and the no-send boundaries. Negative controls against the pre-P7-A web sources fail.
  - Bundle inspection **30/30** with a synthetic licence canary only: no licence name, secret marker or canary in either variant, Studio only in lazy chunks, scanner negative control.
  - P7-C 116/116 is independently accepted and was not rerun.
- **Gate ledger (P4 doc §14):**
  - G2 and G3 CLOSED.
  - G1, G4, G5, G6 and G7 OPEN, and G8 continues. No release SHA is selected.
  - The AG Studio licence is owner-attested only.
  - Gates A, B and C are NOT AUTHORIZED.
- **Not performed:**
  - Safari, Firefox, real devices and touch, screen readers, 400% zoom.
  - The real `__Host-` cookie behind a Render proxy and Render request-log evidence.
  - Render-managed backup and restore, live billing, and any live-provider run.
  - The P6 journey was not rerun, so its recorded 150/150 stands.
- **Recommended owner decisions:** see P4 doc §14, in order: the PR #45 merge decision after review, then G1, G5, G7, then choose the release SHA and branch (G4), then the manual QA plan. Keep Gate A off.
- **Next:** independent review of PR #45 at its final head. No merge, deploy, Render action, payment, provider call, release SHA, judge URL or Devpost publication.

## Handoff: NMI-P7-D-02

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md` slice P7-D; `phase-7/nmi-release-readiness`, Draft PR #45, started from `7309fbf`. **From / to:** implementation agent → **focused re-audit of P7-D-AUD-01 and P7-D-DOC-01** (audit comment 6675943978). Corrects `NMI-P7-D-01`, which is not rewritten.
- **P7-D-AUD-01:** the P7-A journey runner cleaned up its disposable PostgreSQL without confirming shutdown. New `design/evidence/NMI-P7/pg-cleanup.mjs` stops the cluster and deletes the directory only after an authoritative `pg_ctl status` shows it is down. Otherwise it preserves the directory, reports it and exits non-zero. Partial startup and never-initialised clusters are handled. The cleanup is now a recorded check. Failure control `test-pg-cleanup-failclosed.mjs` is **11/11** on a real disposable cluster: a failing stop and a falsely successful stop both preserve the directory.
- **P7-D-DOC-01:** the `docs/STATUS.md` primary `main` is now `7c56b078eb997744fd1d9bdb7668114f490171c7` (documentation PR #44). `fbd2d8e` is kept as the historical post-P6 SHA. No release SHA is selected.
- **Evidence (implementation-agent, local), regenerated from a clean committed tree at `84349e730e6ea50d68fbad4f129768c9f1cc9cd6`:** browser journey **47/47** (up from 46; the added check is the cleanup confirmation; 7 screenshots re-captured under `design/evidence/NMI-P7/screenshots-p7a/`) and the cleanup control **11/11**. Each JSON records that `sourceSha` and a clean tracked-code tree. The superseded 46/46 run (source `4c81a43`) is stated as superseded in `P7-D-VERIFICATION.md`. The P4 doc §14 now reads 47/47.
- **Unchanged:** the application code, migrations, runtime grants, P4 and P6 evidence, the P7-C 116/116 evidence and its runner, and the bundle inspection. `pnpm validate` and `pnpm test:db` were not rerun, because no application or test code changed since they passed at `7309fbf` (1408 and 367).
- **Limits:** unchanged from `NMI-P7-D-01` (headless Chrome emulation only; no Safari, Firefox, real device, screen reader, 400% zoom, real proxy or Render evidence; no live provider).
- **Next:** focused re-audit. No merge, deploy, Render action, provider call or release SHA.

## Handoff: NMI-P7-D-03

- **Task / branch:** `tasks/NMI-P7-RELEASE-READINESS-REFRESH.md` slice P7-D; `phase-7/nmi-release-readiness`, Draft PR #45, started from `97af03e`. **From / to:** implementation agent → **focused re-audit of the remaining P7-D-AUD-01 gap** (audit comment 6678621155; P7-D-DOC-01 stays closed). Corrects `NMI-P7-D-02`, which is not rewritten.
- **Gap:** `pg-cleanup.mjs` treated every nonzero `pg_ctl status` (including 4, null and launch errors) as confirmed shutdown.
- **Fix (test helper only):** for an existing data directory, deletion is allowed only when `pg_ctl status` ran without a launch error or signal and exited exactly 3. Exit 0, 4, null, a signal and any other code preserve the directory and fail the run. The nonexistent-directory case and a readable-but-uninitialised directory (no `PG_VERSION` or `postmaster.pid`) stay explicit and are labelled "not pg_ctl verified". An unreadable directory is preserved.
- **Evidence (implementation-agent, local), regenerated from a clean committed tree at `e5721fa7842996b680f5a49ddf6d173e0955e971`:**
  - Cleanup failure control **30/30**, up from 11.
  - Browser journey **47/47**, with a real `pg_ctl status` exit 3 in its cleanup trail and 7 screenshots re-captured under `design/evidence/NMI-P7/screenshots-p7a/`.
  - Both JSON files record that `sourceSha` and an empty tracked-code dirty list.
  - Negative control (not committed): against the previous helper, 13 status-error controls fail.
  - `P7-D-VERIFICATION.md` now states 30/30 and lists the earlier runs as superseded.
- **Unchanged:** application code, migrations, runtime grants, P4 and P6 evidence, P7-C 116/116 evidence and its runner, the bundle inspection. `pnpm validate` and `pnpm test:db` were not rerun, because no application or test code changed since they passed at `7309fbf` (1408 and 367).
- **Limits:** unchanged from `NMI-P7-D-01`.
- **Next:** focused re-audit. No merge, deploy, Render action, provider call or release SHA.

## Handoff: NMI-G1-PACKET-01

- **Task / branch:** `tasks/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md`; `docs/nmi-g1-render-cost-teardown`, documentation-only Draft PR to `main` (link in the PR), based on `main@0e10e8d1f6d521bba9b0c503f4ce0fdf188ded19` (P7 PR #45 merged; tree identical to accepted head `3b5278c`). **From / to:** implementation agent → **independent documentation review**, then the owner's merge decision and the approvals in the packet.
- **Delivered (docs only):** `docs/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md` and its task file; STATUS reconciled post-P7 (primary `main`, P7 complete, active task and handoff, next action); a status line in the P7 task; an update note in the P4 release doc. Earlier handoffs and audit evidence are untouched.
- **Packet content:**
  - Verified versus unverified facts.
  - The proposed Hobby, Starter, PostgreSQL 16 Basic 256 MB, 1 GB, autoscaling-OFF configuration.
  - A forecast with fixed charges, run-on, tax and unknowns kept separate: planned **$16.26**, 5-day slip **$18.35**, and about **$20.00** with an illustrative 9% tax before bandwidth and build overages.
  - Zero-overage, zero-tax breakeven against the $25 ceiling: about 5 Jan 2027, and about 24 Dec for the $20 warning.
  - Credit assumptions; evidence E1 to E7 and decisions D1 to D5.
  - Backup export, private retention, restore verification and teardown procedures.
  - The exact G5 options and G7 questions; the G4, G6 and G8 requirements; and the approvals in order.
- **Not verified:** Render's current list prices (the pricing page returned no figures; P3's 2026-11-04 figures are carried and labelled), bandwidth and build-minute allowances, credit applicability and balance, tax treatment, billing after suspension, and backup handling after deletion. These are labelled, not invented.
- **Gates:** G1, G4, G5, G6 and G7 OPEN; G8 continuing; Gates A, B and C NOT AUTHORIZED. No release branch or SHA, no Render connector or API call, no resource, no charge, no deletion and no provider enabled.
- **Open item (recorded, not fixed here):** the Codex review of PR #45 reports that the P7-C recovery runner's cleanup treats any nonzero `pg_ctl status` as confirmed shutdown. The pattern is present in the code, and a small follow-up should reuse `shutdownAndRemove`.
- **Next:** independent documentation review; then the owner decides on the PR and works through packet §11.

## Handoff: NMI-G1-PACKET-02

- **Task / branch:** `tasks/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md`; `docs/nmi-g1-render-cost-teardown`, Draft PR #46, started from `f8822fe`. **From / to:** implementation agent → **focused re-audit of DOC-01 and DOC-02** (review comment 6679083297). Corrects `NMI-G1-PACKET-01`, which is not rewritten.
- **DOC-01 (billing evidence):** the packet now records the owner-supplied 2026-11-06 Billing screenshots, described only and not committed: Hobby plan; $50.00 credit expiring 2027-10-01; October 2026 invoice Paid at $0.00; included usage 0 MB of 5 GB bandwidth and 0 of 500 pipeline minutes; no services or custom domains shown. They are labelled owner-supplied, not independently checked. **Credit applicability, November unbilled charges, checkout prices, tax and overage rates stay UNVERIFIED.** The E1 to E7 matrix has states: E1 evidenced; E2 and E5 partial; E3, E4, E6 and E7 not yet evidenced or pending. G1 stays OPEN.
- **DOC-02 (backup and teardown safety):**
  - §7a is now a source-specific procedure for a real Render `.dir.tar.gz` export: checksum, integrity and path-safety checks, safe extraction, `pg_restore --format=directory --list`, and an isolated disposable PostgreSQL 16 restore into an empty database.
  - It documents roles and grants (create `nmi_runtime` first, or re-apply `runtime-role.sql` explicitly after `--no-privileges`), and verification of data, constraints, `invoice_nudges` (migration `0008`), and authorized and denied operations. `42501` is kept separate from `23505`, `23514`, `23503` and the trigger error.
  - It states that the P7-C runner is synthetic and custom-format and is not a real-export verifier.
  - It records, from Render's tutorial (fetched 2026-11-06), that deleting a database deletes its backups and snapshots and its point-in-time recovery, and treats export files as gone too. A verified, off-Render private export is mandatory before deletion, which still needs separate explicit owner approval.
- **D4 and D5:** D4 now requires a genuine fallback (named delegate with written scoped authority, or a no-delegate contingency with suspension and a latest-by deletion date, or G1 cannot close). A reminder alone is not a fallback. D5 (private encrypted destination, retention deadline, destruction) stays **pending owner confirmation**. No owner decision was recorded as answered.
- **Unchanged:** the forecast figures and every release restriction (G1, G4, G5, G6, G7 OPEN; G8 continuing; Gates A, B and C NOT AUTHORIZED). No application code was touched, and the separate P7-C runner cleanup finding was not addressed here.
- **Next:** focused re-audit. No merge, Render provisioning, spend, deployment, release SHA or provider activation.

## Handoff: NMI-G1-PACKET-03

- **Task / branch:** `tasks/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md`; `docs/nmi-g1-render-cost-teardown`, Draft PR #46, started from `a9b77fa`. **From / to:** implementation agent → **focused re-audit of G1-DOC-03** (audit comment 6679478408; DOC-01 and DOC-02 were closed by that audit). Corrects `NMI-G1-PACKET-02`, which is not rewritten.
- **D4-B:** it was labelled a fallback, but a future commitment, reminder or latest-by date by the owner is not executable while the owner is unavailable. It is now **not eligible**, and D4 has an explicit eligibility rule: someone other than the owner, with authority and real access, can do the non-destructive steps without the owner. **Without an eligible fallback, G1 cannot close and nothing may be provisioned.** The old "D4-C: no fallback" merged into D4-B. A new D4-C is "any other mechanism", eligible only if independently actionable and verified; none is proposed or verified. Suspending the web service is not presented as a database cost cap.
- **D4-A:** a named delegate may take and verify the export, revoke sessions and suspend the web service, within written limits, with access the owner confirms feasible. **Deletion is not delegated.** It needs the owner's **separate explicit approval at teardown time**; general advance approval or granted access never substitutes. If approval cannot be obtained, nothing is deleted, and the continuing cost is **outside the $25 ceiling** until the owner approves deletion or renews the limit. Whether the delegate holds the database owner credential is the owner's decision.
- **§7c:** step 3 is now non-destructive containment. Step 4 requires the owner's separate explicit approval for deletion, given at teardown after the verified export. The earlier allowance for a pre-recorded delegate approval is removed.
- **E4 sequencing:** E3 and E4 are **pre-creation** G1 items. The owner records the intended configuration, and reads prices and settings only if Render shows them before the final confirm. The packet does not assume a preview exists. New **E4b** is **post-creation** verification of the actual storage, autoscaling and add-ons plus the actual charge, checked at C1 under G6 and not applicable until a separately authorized creation. G1, G6 and approvals rows are aligned.
- **Preserved:** the accepted billing evidence, the restore guidance, the forecast figures and every release restriction (G1, G4, G5, G6, G7 OPEN; G8 continuing; Gates A, B and C NOT AUTHORIZED). **No owner decision is recorded as made.** No application code was touched, and the separate P7-C runner cleanup finding was not addressed here.
- **Next:** focused re-audit. No merge, Render provisioning, spend, release SHA, deployment, provider activation or deletion authorization.

## Handoff: NMI-RENDER-MIG-0008-C1

- **Task / phase:** `tasks/NMI-RENDER-MIG-0008-RUNBOOK.md`.
- **From:** implementation / release-preparation assistant.
- **To:** independent documentation reviewer.
- **Branch:** `docs/nmi-render-migration-0008` (base `main@e3b68e83dec899b7aa56afa9be3e8fbf5fd07d62`).
- **Implementation head:** `e9cfba9657e0992416384ad7ac5c7488cc865176` (runbook fix before operational docs; verify latest PR head and hosted CI on GitHub).
- **PR:** #47, Draft — https://github.com/mrdzyn/nudgemyinvoice/pull/47.
- **State:** documentation correction submitted for independent review; no release authorization.

### Completed

- Corrected P1 manual Render PostgreSQL journal/migration range to `0000`–`0008`, including `0008_mushy_zarek` (`invoice_nudges`) before runtime role grants.
- Made the documented migration loop stop on failure instead of using `|| break`, and required an `invoice_nudges` existence check prior to runtime grants. No database command was executed.
- Recorded that owner selected Hobby and retained the $25 eligible-credit ceiling, **not** an executable independent teardown fallback or an authorization to waive G1.

### Validation

- Verified the exact migration tag against `packages/db/migrations/meta/_journal.json` and its tracked SQL file (read-only): PASS.
- Documentation file updates and Draft PR created; local full test suite NOT RUN.
- Required hosted CI: PENDING at handoff creation; verify exact final PR head before audit.

### Continuation notes

- G1/G4/G5/G6/G7 remain OPEN; G8 continues, live provider Gates A/B/C NOT AUTHORIZED.
- Render Hobby prohibits team members (Render docs). G1's executable non-owner fallback is not met; a future owner-approved and independently audited exception or feasible alternative is required before G1 closure.
- G5 Hobby platform request-log residual-risk acceptance and G7 AG Studio external package/hosted-use rights are still owner-controlled; no choice was inferred.
- No provisioning, billable resources, migrations, release SHA/branch, deployment, secrets, judge URL, or deletion.

### Next action

Independently audit PR #47's docs-only migration correction and exact-head hosted CI; return findings for the owner's explicit merge decision. Do not treat this PR as G1 closure or deployment authority.

## Handoff: NMI-G1-HOBBY-EXC-01

- **Task / phase:** `tasks/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md`.
- **From:** release-preparation assistant (proposal author; not independent reviewer).
- **To:** independent governance / documentation reviewer, then owner for an explicit adoption and merge decision.
- **Branch:** `docs/nmi-g1-hobby-owner-only-exception` (base `main@e3b68e83dec899b7aa56afa9be3e8fbf5fd07d62`).
- **Implementation head:** `a84da7a105f0e85e03c312ea1c89d40c5728d3e0` before this handoff commit; verify the PR's final exact HEAD.
- **PR:** Draft #48 — https://github.com/mrdzyn/nudgemyinvoice/pull/48.
- **State:** **PROPOSED, NOT ADOPTED.** Existing G1 D4 independently executable fallback rule still governs; no Render resource may be provisioned by this task.

### Completed

- Recorded the owner's 2026-11-06 permission to **prepare** a limited owner-only Hobby D4 exception; did not infer final exception ratification, G5/G7 decision, budget increase or deployment authority.
- Drafted `docs/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md` defining the Hobby one-member limitation, possible involuntary charges past the $25 approved ceiling if the owner is unavailable, non-executable reminders, controls/checkpoints and separate fresh deletion authorization.
- Added a status-only cross-reference to the accepted G1 packet §13, added the bounded task and reconciled STATUS after owner-squash-merged PR #46. Separate migration-0008 Draft PR #47 remains untouched.

### Validation

- Read-only GitHub verification of merged `main@e3b68e8`, merged G1 packet, Render Hobby limitation from official public docs, and Draft PR #47 separation: PASS.
- Required exact-head hosted CI: **PENDING / must check** after this handoff commit.
- No local code/runtime/DB tests executed; all changes are documentation-only.

### Continuation notes

- Owner has not chosen D5 private export destination or retention/destruction dates or signed the final D4 exception. E2/E3/E4/E5/E6/E7 remain incomplete. G1/G4/G5/G6/G7 OPEN; G8 continuing; provider Gates A/B/C NOT AUTHORIZED.
- Proposed **$25 eligible-credit spending ceiling stays unchanged**. A potential involuntary overrun if owner is unavailable is a _risk disclosure, not preapproval for excess charges_; no platform hard cap is claimed.
- No cloud/Render provisioning, payment, release SHA/branch, migration, first build, judge URL, secret, provider call or deletion is authorized by this proposal.

### Next action

Independent exact-HEAD review of Draft PR #48 and required CI, then an explicit owner decision on whether to **adopt** the exception. Keep G1 OPEN and do not create any Render resource until the separate gates are satisfied.

## Handoff: NMI-G1-HOBBY-EXC-02

- **Task / phase:** `tasks/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md`.
- **From:** implementing/orchestrating assistant (not the independent auditor).
- **To:** independent focused documentation/policy reviewer, then project owner.
- **Branch:** `docs/nmi-g1-hobby-owner-only-exception`, Draft PR #48, based on `main@e3b68e83dec899b7aa56afa9be3e8fbf5fd07d62`.
- **Implementation head:** `680abb771d9d9019312f53343e4be193ae03a0f4` (before this handoff; verify exact PR head and CI).
- **PR:** https://github.com/mrdzyn/nudgemyinvoice/pull/48.
- **State:** independent report PARTIAL on `6c892689b236c47decc3a8da863119df1db3804e`; three documentation issues addressed, awaiting focused re-audit. `NMI-G1-HOBBY-EXC-01` retained unchanged.

### Completed

- **EXC-01:** Added G1-consistent dated cost/overrun examples (~$0.42/day, $20 warning Dec 24, pre-tax $25 crossing Jan 5, illustrative 9% tax $25 by Dec 31) and explained the Render workspace/payment-method exposure for noncreditable charges. No hard ceiling or reimbursement claimed; $25 remains authorized maximum.
- **EXC-02:** Added an _informational, non-operative_ appendix to `docs/NMI-RENDER-P3-25-BUDGET-GATE.md` recording the proposed narrowly scoped D4 owner-only exception to P3's existing feasible fallback condition. P3's original historic approval/controls remain intact and enforceable until separate adoption.
- **EXC-03:** Defined exact post-review owner ratification and a separate audited/owner-merged **adoption record** explicitly reconciling P3 fallback, G1 packet §6 D4 / §5 E7 / §11 and STATUS. Merely merging proposal is NOT adoption and does NOT close G1; D5 and all remaining gates still require evidence.
- Expanded bounded task to permit a P3 informational cross-reference, revised proposal and packet §13, updated STATUS. No application, DB, test or deployment change.

### Validation

- Read-only exact-head GitHub evidence for PR #47 PASS and #48 prior PARTIAL: confirmed; current new-head hosted CI **PENDING**, must be checked independently.
- Local format/profile and full tests: **NOT RUN** by this tool-based docs update.
- No Render service/database is created, no first build, provider call, secret, release SHA/branch, merge, URL share or deletion authorized.

### Continuation notes

- **G1/G4/G5/G6/G7 remain OPEN; G8 continues; provider Gates A/B/C remain NOT AUTHORIZED.** Owner only approved _preparing_ the exception, not ratifying it. $25 authorized credit cap intact and no authorized over-budget charge.
- PR #47 independently reported PASS at `586f7a76cdd62fff00ae50bc820561e59aee155d`, Stack CI attempt 1 timeout and attempt 2 PASS. Its **owner merge approval is missing**; PR #47 and #48 have overlapping STATUS and HANDOFFS, confirmed conflicts if both merged. **Do not merge out of order or drop prior handoffs.** If #47 merges first, reconcile this PR onto updated main without force-push and rerun exact-head mandatory CI.
- Unfixed separate release blocker: `docs/NMI-DEMO-JUDGE-RUNBOOK.md` checks eight migrations and will abort against journal now containing nine; `scripts/preflight-provision-operator.mjs` similarly assumes eight. Scope separate task before any release or local judge demo.

### Next action

Focused **independent** exact-HEAD policy/documentation re-audit of revised PR #48 including the new P3 note and updated task. No merge, G1 closure or Render provisioning. Seek explicit owner decisions after independent acceptance.

## Handoff: NMI-G1-HOBBY-EXC-03

- **Task / phase:** `tasks/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md`.
- **From:** implementing assistant (not the independent auditor).
- **To:** independent focused documentation and policy reviewer, then the project owner.
- **Branch:** `docs/nmi-g1-hobby-owner-only-exception`, Draft PR #48.
- **Original PR HEAD:** `684d32ed31cf6a05dba86015ac1dab2946fb9720`, unchanged when this work started. New base `main@2c9e7f07eae0d56fe90e3d9574358db57e022f12` (PR #47 owner-approved, squash-merged and closed). **Merge reconciliation commit:** `067821764d1e363595d6e13ae27a2d2821a6af6c`, a normal two-parent merge (parents `684d32e` and `2c9e7f0`); no rebase and no force-push. The final PR HEAD (this handoff commit) is stated in the PR comment.
- **State:** proposal only, NOT ADOPTED. Reconciled with `main`; awaiting independent exact-HEAD re-audit. `NMI-G1-HOBBY-EXC-01` and `NMI-G1-HOBBY-EXC-02` are retained unchanged.

### Completed

- **Conflicts resolved:** only `docs/STATUS.md` (three regions) and `docs/HANDOFFS.md` (one region).
  - STATUS: records the new `main` SHA; PR #47 as owner-approved, squash-merged and closed, with the migration `0008` runbook work complete; PR #48 as the active Draft review; the working branch and active task. The earlier `main` SHAs stay as historical entries.
  - HANDOFFS: every entry from both histories is kept, with one end marker. Chronological order: `NMI-RENDER-MIG-0008-C1`, `NMI-G1-HOBBY-EXC-01`, `NMI-G1-HOBBY-EXC-02`, then this entry. Each ID occurs exactly once.
- **Scope against the new `main`:** exactly six files differ: this exception document, the G1 packet (status-only §13), the P3 budget gate (an additive informational addendum with no deleted lines), STATUS, HANDOFFS and this task. No source, migration, grant, dependency, lockfile, security-control or workflow file changed. The merged PR #47 runbook (`docs/NMI-RENDER-P1-RUNBOOK.md`, `tasks/NMI-RENDER-MIG-0008-RUNBOOK.md`) is byte-identical to `main`, and the migration loop still includes `0008_mushy_zarek`.

### Verification of the earlier corrections (read from the final text, not new content)

- **EXC-01 (quantified exposure):** the exception document keeps about **$0.42/day**; **$16.26** through 15 Dec, **$18.35** through 20 Dec and **$22.97** through 31 Dec; the illustrative **9% tax** rows ($17.72, $20.00, $25.04); the $20 warning around 24 Dec, the pre-tax $25 crossing around 5 Jan 2027 and about 31 Dec with the illustrative tax; accrual that is **not bounded** if the owner is unavailable; and exposure of the Render workspace payment method to charges the credits do not cover. The $25 stays the maximum authorized eligible-credit spend, not a hard Render cap.
- **EXC-02 (P3 reconciliation):** the P3 addendum is informational and non-operative. The original pre-provisioning fallback condition "remains unmet and binding" until a separately reviewed, owner-approved adoption record changes it. The 2026-11-04 P3 approval text is not rewritten.
- **EXC-03 (formal adoption):** four steps are required: independent review of the final wording; a new, explicit owner ratification; a separate adoption-record PR updating the P3 fallback applicability, the G1 packet §6 D4, §5 E7 and §11, STATUS and a new handoff; and independent audit, both CI checks and explicit owner merge approval for that record. Merging PR #48 alone does not make the exception operative or close G1.

### Validation (implementation-agent, local, documentation only)

- Prettier on `docs` and `tasks`: pass. Project-profile validator: pass (24 files). 127 handoff IDs, no duplicates, one end marker. Path and link references: pass.
- `git diff --check`: it flags **3 trailing-space lines (markdown hard line breaks) in this PR's own task file**. They were already present at `684d32e` and were not introduced by the merge, and I left them unchanged. With trailing-space checking off, the check is clean against the new `main`.
- No full test suite was run, because nothing but Markdown changed.

### Continuation notes

- **G1, G4, G5, G6 and G7 stay OPEN; G8 continues; Gates A, B and C stay NOT AUTHORIZED.** No exception adoption, budget increase, resource creation, release branch or SHA, deployment, provider enablement, public URL or deletion.
- Issue #49 (the local judge runbook and operator preflight still assume eight migrations) is a separate release blocker and is **not** fixed here.

### Next action

Independent exact-HEAD re-audit of PR #48. The owner's separate decisions on ratification and merge follow only after that review.

## Handoff: NMI-G1-HOBBY-EXC-04

- **Task / phase:** `tasks/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md`.
- **From:** implementing assistant (not the independent auditor).
- **To:** independent focused documentation and policy reviewer, then the project owner.
- **Branch:** `docs/nmi-g1-hobby-owner-only-exception`, Draft PR #48, started from `b023e5ccfd5f865aab585e098f1197822a8fb15b` (the reconciled head that passed CI at `NMI-G1-HOBBY-EXC-03`). `main` is unchanged at `2c9e7f07eae0d56fe90e3d9574358db57e022f12`. The final PR HEAD is stated in the PR comment.
- **State:** proposal only, NOT ADOPTED. Corrects one statement in `NMI-G1-HOBBY-EXC-03`, which is not rewritten.

### Completed

- **Correction:** `NMI-G1-HOBBY-EXC-03` recorded that `git diff --check` flagged three trailing-space lines in this PR's task file and that they were left unchanged. They are now removed. The three lines are 3, 4 and 5 of `tasks/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md` (the State, Base and Owner direction labels), and `git diff --check` is clean against `main`.
- **Rendering kept:** the two trailing spaces were markdown hard line breaks, so a blank line now separates those header lines to keep them on separate lines. The task text is **identical after whitespace is normalized**, and the exception wording is unchanged.
- Only `tasks/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md`, `docs/HANDOFFS.md` and `docs/STATUS.md` changed. Nothing in the exception document, the G1 packet, the P3 gate or the merged PR #47 runbook changed.

### Validation (implementation-agent, local, documentation only)

- `git diff --check` against `origin/main`: clean. Prettier on `docs` and `tasks`: pass. The scope against `main` is still the same six files.
- Required hosted CI at the final head is recorded in the PR comment.

### Continuation notes

- **G1, G4, G5, G6 and G7 stay OPEN; G8 continues; Gates A, B and C stay NOT AUTHORIZED.** No exception adoption, budget increase, resource creation, release branch or SHA, deployment, provider enablement, public URL or deletion. Issue #49 stays a separate release blocker and is not fixed here.

### Next action

Final focused independent re-audit of PR #48. The owner's separate decisions on ratification and merge follow only after that review.

## Handoff: NMI-G1-HOBBY-ADOPT-01

- **Task / phase:** `tasks/NMI-G1-HOBBY-EXCEPTION-ADOPTION.md`.
- **From:** implementing assistant (not the independent reviewer).
- **To:** independent exact-HEAD documentation and policy reviewer, then the project owner for the merge decision.
- **Branch:** `docs/nmi-g1-hobby-exception-adoption`, Draft PR (link in the PR), based on `main@6d16f45a95d1cafecb3aca2ac047ce7daab912ee` (PR #48, the proposal, independently audited PASS and squash-merged). The final PR HEAD is stated in the PR comment.
- **State:** adoption record prepared. **Not effective until an independent PASS and the owner's explicit merge approval.** G1 stays OPEN.

### Completed

- **Attribution recorded accurately:** the owner reports ratifying the exception on 2026-11-06 in conversation (ChatGPT) after reviewing the complete risk-acceptance statement, and authorized this PR. The record calls it an **owner-reported decision**, quotes no ratifying words, and does **not** present it as an owner-authored GitHub comment. A signed or owner-authored GitHub acknowledgment, if required, is requested separately and was not invented.
- **New:** `docs/NMI-G1-HOBBY-EXCEPTION-ADOPTION-RECORD.md` (the owner's accepted exposure; what is and is not satisfied; mandatory conditions; effectiveness checklist) and the task file.
- **P3:** an additive section reconciles only the "fallback if the owner is unavailable" prerequisite, for this one deployment. The 2026-11-04 approval text and the earlier non-operative addendum are not edited.
- **G1 packet:** §6 D4 gains row D4-X (the adopted exception; D4-B kept as written); §5 E7's fallback part is satisfied on merge, and E7 stays PENDING for D5 and the rest of §7; §11 is updated; §13 is relabelled as proposal history, with a new §13a.
- **Exception document:** status references only. The proposal text is unchanged.
- **STATUS:** updated, active handoff `NMI-G1-HOBBY-ADOPT-01`.

### Validation (implementation-agent, local, documentation only)

- Documentation checks are recorded in the PR comment with the final exact-HEAD hosted CI results. Nothing but Markdown changed.

### Continuation notes

- **G1, G4, G5, G6 and G7 stay OPEN; G8 continues; Gates A, B and C stay NOT AUTHORIZED.** D4 is satisfied by exception **only after merge**. E7 needs D5 (encrypted destination, retention deadline, destruction method and date). E2 to E6 and D1 to D3 are unchanged.
- The **$25 ceiling is unchanged** and is not a Render-enforced cap. Charges beyond $25 are possible with no guaranteed maximum if the owner is unavailable, and uncovered charges fall on the workspace payment method.
- **No delegated or automated deletion.** Deletion needs a fresh, explicit owner approval at teardown time.
- No release branch or SHA, no Render resource, first build or deployment, no provider enabled, no public URL, no spend beyond $25. Issue #49 is a separate release blocker and is not fixed here.
- **The task text I received ended mid-sentence** ("...only after this adoption-record PR completes independent review and"). I read the missing end as "the owner's explicit merge approval", which matches the proposal's adoption sequence §4 step 4. The owner should confirm that reading.

### Next action

Independent exact-HEAD review of this PR, then the owner's explicit merge decision. Do not treat the Draft PR as an adoption.

## Handoff: NMI-G1-HOBBY-ADOPT-02

- **Task / phase:** `tasks/NMI-G1-HOBBY-EXCEPTION-ADOPTION.md`.
- **From:** implementing assistant (not the independent reviewer).
- **To:** independent focused documentation and policy reviewer, then the project owner for the merge decision.
- **Branch:** `docs/nmi-g1-hobby-exception-adoption`, Draft PR #50, started from the audited head `8c099154eeebc3b5c01f83910f69c410a2304a98`. `main` is unchanged at `6d16f45a95d1cafecb3aca2ac047ce7daab912ee`. The final PR HEAD is stated in the PR comment.
- **State:** remediation of the two findings in audit comment 6686811489 (PARTIAL). **Not effective.** Corrects statements in `NMI-G1-HOBBY-ADOPT-01`, which is not rewritten.

### Completed

- **ADOPT-01 (completed merge):** `NMI-G1-HOBBY-ADOPT-01` and the documents said the exception takes effect when the PR passes review and the owner approves the merge, which left a gap: an approved PR that is still open or Draft. The effectiveness rule is now **four conditions**: (1) an independent exact-HEAD review PASS; (2) both required hosted CI workflows PASS at the final head; (3) the owner's new explicit merge approval; and (4) **a verified completed GitHub merge** (the PR is MERGED and its merge commit is on `main`). The record header and §7 (with an explicit list of what does **not** make it effective), the P3 section, the G1 packet (§6 D4 status, D4-X, §11, §13a), the exception document's adoption note, the task and STATUS all say the same.
- **ADOPT-02 (scope of D4-X):** the packet's E7 line and the D4 eligibility paragraph stated the executable-fallback requirement absolutely. They now say that **D4-X substitutes for it only for the one approved Hobby deployment and timebox** (the Mrdzyn Hobby workspace; one Starter web service and one PostgreSQL 16 Basic 256 MB; synthetic-only and provider-disabled; target teardown by 15 December 2026 23:59 Asia/Manila, subject to the official judge-access end), and only once effective. For **every other case** (another workspace, plan or resource shape, a later date, or a stopped assumption) the ordinary requirement and D4-B stay fully binding. The P3 reconciliation and the record §3 say the same. The §6 heading is updated.
- **Historical text preserved:** the 2026-11-04 P3 approval and the earlier P3 addendum are not edited (the P3 change is additive), the proposal text in the exception document is unchanged, and `NMI-G1-HOBBY-ADOPT-01` and every earlier handoff are kept.
- The audit comment gives the intended ending of the truncated task sentence as "and receives the owner's explicit merge approval", which matches the reading recorded in `NMI-G1-HOBBY-ADOPT-01`. It also confirms that the owner's ratification was reported in conversation and is correctly recorded as owner-reported.

### Validation (implementation-agent, local, documentation only)

- `git diff --check` (unqualified), Prettier on `docs` and `tasks`, the project-profile validator, handoff uniqueness (one end marker) and path and link references: results are in the PR comment with the exact-head hosted CI links.

### Continuation notes

- **The exception is NOT effective and G1 stays OPEN.** E7 and D5 are pending; E2 to E6 and D1 to D3 are unchanged. **G4, G5, G6 and G7 stay OPEN, G8 continues, and Gates A, B and C stay NOT AUTHORIZED.**
- The **$25 ceiling is unchanged** and is not a Render-enforced cap. Charges beyond it are possible with no guaranteed maximum if the owner is unavailable. There is no delegated or automated deletion, and teardown needs a fresh, explicit owner approval.
- No release SHA or branch, Render resource, first build, deployment, provider enablement, public URL or spend beyond $25. Issue #49 is a separate release blocker and is not fixed here.

### Next action

Focused independent re-audit of ADOPT-01 and ADOPT-02 at the exact final head, then the owner's merge decision. After a merge, verify on GitHub that the PR is MERGED and its commit is on `main` before relying on the exception.

## Handoff: NMI-P6-FIX2-01

- **Task / phase:** `tasks/NMI-P6-FIX2-queue-open-popover-focus.md` (bounded post-merge P6/P7-A UX remediation & P6 status reconciliation).
- **From:** Antigravity implementation agent (not the independent reviewer).
- **To:** independent exact-HEAD code/UX/documentation reviewer, then project owner for explicit merge approval.
- **Branch:** `fix/nmi-p6-postmerge-ux`, based on `main@0b652348dfc546b4e9bc5bbf2e5a21fef142c124` (PR #50 squash-merged).
- **Implementation head:** `03f743a569e2e220cbd26f18750b86a2cb0f9d7a` (before this evidence/docs/handoff commit; verify exact final PR HEAD and hosted CI).
- **State:** Draft PR ready for independent exact-HEAD review. No merge, deployment, Render provisioning or live provider call is authorized.

### Completed

- **Popover close on same-screen `open-nudges` (`apps/web/src/components/Nudgey.tsx`):** `onOpenQueue` now calls `openQueue` (`setOpen(false)` before `dispatch({ type: "open-nudges", view: "pending", id })`, matching `openInvoiceById` and `openDashboard`), and `Nudgey`'s close effect watches `[state.screen, state.seedKey]` so any same-screen re-target closes `.nudgey-panel`, clears transient chat messages, and aborts active on-device speech recognition.
- **Heading focus & `null` reset on already-mounted queue (`apps/web/src/nudges/NudgeQueueScreen.tsx`):** when a new `nudgeFocus` object re-targets an already-mounted queue, `headingRef.current?.focus()` moves keyboard/assistive focus to `<h1 id="nq-title">`; when `focus` becomes `null` (ordinary `navigate`), `seeded.current` resets to `null` without overwriting manual tab/selection choices.
- **Regressions & browser QA:** added deterministic Vitest DOM tests in `apps/web/src/nudges/NudgeQueue.test.tsx` (verified via negative control to fail 3/3 against `main@0b65234` and pass 28/28 with the fix) plus `open-nudges` leave-guard coverage in `apps/web/src/invoices/leaveGuard.test.ts`; captured 41/41 headless Chrome QA (`design/evidence/NMI-P6-FIX2/QA-RESULTS.md`, 5 screenshots across 1280x900 and 390x844 in light + dark, deterministic fake model, synthetic data, disposable PostgreSQL 16 confirmed `pg_ctl status` exit `3`).
- **Status reconciliation:** updated `docs/STATUS.md` and `tasks/NMI-P6-AI-NUDGE-INTELLIGENCE.md` to record P7-A's merged closure (`0e10e8d`, PR #45) of the two PR #43 Codex review 5787025325 findings, this `NMI-P6-FIX2` residual popover/focus fix, and merged `main@0b65234` (PR #50). Historical `design/evidence/NMI-P6/` and `design/evidence/NMI-P7/` files and Issue #49 files were not touched.

### Validation (implementation-agent, local)

- `pnpm validate`: PASS (`eslint`, `prettier --check`, 8-package `typecheck`, `vitest run` 72 files / 1411 passed, licensed + community web builds and bundle secret scans clean).
- `pnpm test:db` (disposable PostgreSQL 16, `pg_ctl status` exit `3` verified before temp dir removal): PASS (19 files / 367 passed).
- `node design/evidence/NMI-P6-FIX2/run-p6-fix2-journey.mjs` at `03f743a569e2e220cbd26f18750b86a2cb0f9d7a`: PASS (41/41, 5 screenshots).
- `pnpm audit --prod --audit-level high`: PASS (0 vulnerabilities).
- `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice`: PASS (24 files verified).
- `git diff --check`: clean. Required hosted CI workflows (`Project Baseline CI`, `Stack CI`) must pass on the final PR HEAD.

### Continuation notes

- **All release and provider gates stay unchanged:** G1, G4, G5, G6 and G7 remain OPEN (PR #50 satisfies D4-X only for the single approved Hobby deployment/timebox); G8 continues; provider Gates A (`NUDGE_AI_DRAFTING_ENABLED=false`), B (`PAYPAL_DRAFTS_ENABLED=false`) and C remain NOT AUTHORIZED.
- Separate open items unchanged: Issue #49 (local judge runbook / operator preflight eight-migration check, tracked separately) and PR #45 Codex review 5796632507 (`design/evidence/NMI-P7/run-nudge-recovery-drill.mjs` exit-code check).
- Manual Safari/Firefox, real touch devices, VoiceOver/NVDA, 400% zoom, and real HTTPS `__Host-` proxy QA remain pending.

### Next action

Independent exact-HEAD review of this Draft PR and verification of both required hosted CI workflows at the final PR HEAD, followed by the owner's explicit merge decision.

## Handoff: NMI-CI-COST-01

- **Task / phase:** `tasks/NMI-CI-COST-CONSERVATION.md` (owner-approved CI cost-conservation policy).
- **From:** Antigravity implementation agent (not the independent reviewer).
- **To:** independent exact-HEAD CI/policy/documentation reviewer, then project owner for explicit merge approval.
- **Branch:** `chore/nmi-ci-cost-conservation`, based on `main@e795fbc8514d29555ff365f219033206ecc851d4` (PR #52 squash-merged; following PR #50 `0b652348dfc546b4e9bc5bbf2e5a21fef142c124`).
- **Final PR HEAD:** recorded in the Draft PR description and verified post-commit with a clean working tree (`git status --porcelain` empty).
- **State:** Draft PR ready for independent exact-HEAD review. Hosted GitHub Actions are **NOT RUN** on this development PR (`workflow_dispatch` only); zero hosted minutes consumed. No merge, deployment, Render provisioning or live provider call is authorized.

### Completed
- **Workflow triggers switched to `workflow_dispatch` only (`.github/workflows/ci.yml`, `.github/workflows/stack.yml`):** removed `pull_request:` while preserving every job, permission (`contents: read`), concurrency group, PostgreSQL 16 service container (`postgres:16`, `nmi_test`, healthcheck), build/test/bundle/migration/audit step, and keeping `.github/workflows/common-validation.yml` untouched (`workflow_call`) and callable via `jobs.project-baseline.uses`.
- **Canonical three-stage testing & manual CI evidence policy (`docs/TESTING.md`, `.github/pull_request_template.md`, `AGENTS.md`):** distinguished (1) targeted local checks during implementation, (2) full exact-HEAD manual CI before independent audit/merge with six mandatory evidence items (commit SHA, commands, test/build results, environment, security checks, outstanding QA), and (3) mandatory GitHub-hosted `workflow_dispatch` execution (`Project Baseline CI` + `Stack CI` both `SUCCESS` on the exact 40-char release SHA) on the final release candidate, blocking release if unrun, unavailable, or failing. Filled NudgeMyInvoice test-layer command placeholders in `docs/TESTING.md`.
- **Release, enforcement, memory & status alignment (`docs/RELEASE.md`, `docs/REPOSITORY-SETUP.md`, `docs/NMI-RENDER-P4-RELEASE-READINESS.md`, `docs/PROJECT-MEMORY.md`, `docs/STATUS.md`):** updated release gates so no CI-unavailability waiver applies to release; documented read-only verification of live ruleset `25812697` (`Protect Main`: PR-only, thread resolution, no deletion/force-push, zero required status-check contexts) and GitHub `refs/pull/<N>/merge` automatic-run mechanics; added durable entry `NMI-M004`.

### Validation (implementation-agent, exact-HEAD manual CI)
- **Commit SHA:** exact final PR HEAD recorded in the Draft PR body (re-verified post-commit on a clean working tree).
- **Commands:** Ruby `Psych` YAML + `origin/main` structural parity check across `.github/workflows/{ci,stack,common-validation}.yml`; `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice`; tracked `.env*` secret-file check; `pnpm install --frozen-lockfile`; `pnpm validate` (`eslint`, `prettier --check`, `typecheck`, `vitest run`, `build:web:licensed`, `check:bundle:licensed`, `build`, `check:bundle`); disposable PostgreSQL 16 `TEST_DATABASE_URL=... pnpm test:db`; `pnpm db:generate && test -z "$(git status --porcelain packages/db/migrations)"`; `pnpm audit --prod --audit-level high`; `git diff --check origin/main..HEAD`.
- **Test & build results:** workflow structural parity PASS (`ci.yml` and `stack.yml` changed `on` to `workflow_dispatch` only; `common-validation.yml` byte-identical); `pnpm test` **72 files passed | 18 skipped (90), 1408 tests passed | 350 skipped (1758)**; `pnpm test:db` **19 files passed (19), 367 tests passed (367)**; licensed web build (6 files) and community web build (3 files) PASS; `pnpm db:generate` PASS (`No schema changes, nothing to migrate`).
- **Environment:** macOS 27.2 (`arm64`), Node.js `v26.7.0`, `pnpm` `10.28.0`, Homebrew PostgreSQL `16.15` (disposable isolated cluster on `127.0.0.1`, confirmed `pg_ctl status` exit `3` before directory removal), Ruby `Psych` `5.3.1`; deterministic fakes only (zero OpenAI/PayPal/SMTP calls).
- **Security & hygiene checks:** `pnpm check:bundle:licensed` PASS (clean, licence absent); `pnpm check:bundle` PASS (clean, no Studio code); `pnpm audit --prod --audit-level high` PASS (`No known vulnerabilities found`); tracked `.env*` secret guard PASS; `validate_project_profile.py` PASS (24 files verified); handoff ID uniqueness & single end marker PASS; `git diff --check` clean.
- **Outstanding QA & hosted CI:** GitHub-hosted `Project Baseline CI` and `Stack CI` are **NOT RUN** (deferred to the final release candidate per this `workflow_dispatch`-only policy; never recorded as `PASS`). Manual Safari/Firefox, real touch device, VoiceOver/NVDA, 400% zoom, and live Render HTTPS `__Host-` proxy QA remain open at project level (`docs/STATUS.md`).

### Continuation notes
- **Transition note for other open PRs:** opening or updating this PR triggers zero hosted runs because `refs/pull/<N>/merge` evaluates the updated `workflow_dispatch`-only workflows. However, pre-existing open PR branches created before this PR merges to `main` (e.g., Draft PRs #51 and #52) still carry `on: pull_request:` until `main` merges this PR (or those branches update from `main`), so pushing new commits to those branches before merge would consume hosted minutes.
- **All release and provider gates stay unchanged:** G1, G4, G5, G6 and G7 remain OPEN; G8 continues; provider Gates A (`NUDGE_AI_DRAFTING_ENABLED=false`), B (`PAYPAL_DRAFTS_ENABLED=false`) and C remain NOT AUTHORIZED. Release remains **BLOCKED** until mandatory hosted `workflow_dispatch` runs succeed on the final release candidate and all owner gates close.

### Next action
Independent exact-HEAD review of `.github/workflows/ci.yml`, `.github/workflows/stack.yml` and the updated documentation against the exact-HEAD manual CI evidence, followed by the owner's explicit merge decision. Do not dispatch hosted CI during routine review unless explicitly requested by the owner.

## Handoff: NMI-MIG-0008-ISSUE49-C1

- **Task / phase:** `tasks/NMI-MIG-0008-ISSUE49.md`, GitHub Issue #49.
- **From:** implementing assistant (not independent reviewer).
- **To:** independent focused migration/setup reviewer, then owner for merge decision.
- **Branch:** `fix/nmi-issue49-journal-preflight` from `main@0b652348dfc546b4e9bc5bbf2e5a21fef142c124` (PR #50 owner squash-merged; D4-X effective only for approved Hobby scope).
- **State:** Bounded local-only runbook/preflight repair. **Not merged and not release authorization.** Final head and hosted CI will be in the Draft PR.

### Completed

- Created shared read-only `scripts/migration-plan.mjs` that validates the PostgreSQL journal, contiguous indexes, safe names, required `0008_mushy_zarek`, and nonempty SQL files, while accepting future properly ordered entries.
- Judge runbook refuses missing `DATABASE_URL`, unexpected database name, and nonempty user-schema relations. It runs each validated SQL migration transactionally in a subshell, stops at the first failure, and checks `public.invoice_nudges` before operator provisioning. Interactive bash/zsh is not closed on failures.
- Operator preflight now uses the validated same journal, stops after the first failed SQL file, and refuses to call the operator provisioning CLI unless `invoice_nudges` exists and no operator has been created.
- Added isolated CLI unit negative controls for missing `0008`, malformed/out-of-order/unsafe journal entries, missing or empty SQL files, and a future valid migration.
- Removed duplicated stale eight-migration setup commands from the README, referring operators to the single judge runbook. Published SQL, migrations, journal, privileges and application logic remain unmodified.
- STATUS records owner-merged PR #50 correctly, with G1 and all remaining release gates still open.

### Validation and limitations

- Automated unit/format/profile validation and both mandatory hosted CI checks are **PENDING** on the final PR head; report actual results, not estimates.
- A real disposable PostgreSQL 16 execution of the amended local preflight / runbook, with a deliberate injected migration failure and confirmed no operator creation, is **NOT RUN** via this GitHub-only editing environment. It remains an explicit independent/owner-controlled test before declaring local judge-preflight readiness.
- No credentials, user data, hosted SQL, existing local database mutation, paid Render action or provider calls were executed. No migration was applied in this implementation task.

### Next action

Verify the final seven/eight-path diff and targeted tests, obtain both exact-HEAD mandatory CI results, execute or document the missing **disposable PostgreSQL 16 physical preflight and failure injection**, then request independent exact-HEAD review. Keep Issue #49 OPEN until a reviewed owner-approved merge and verified regression evidence; do not create a release SHA/branch or Render resources.

## Handoff: NMI-MIG-0008-ISSUE49-C2

- **Task / phase:** `tasks/NMI-MIG-0008-ISSUE49.md`, GitHub Issue #49 (PR #51 remediation, main reconciliation, physical disposable PG16 acceptance, and exact-HEAD manual CI).
- **From:** Antigravity implementation agent (not the independent reviewer).
- **To:** independent exact-HEAD migration/setup/security reviewer, then project owner for explicit merge decision.
- **Branch:** `fix/nmi-issue49-journal-preflight` (reconciled via regular non-history-rewriting merge with `origin/main@e795fbc8514d29555ff365f219033206ecc851d4`, preserving squash-merged PR #52 `NMI-P6-FIX2` and PR #50 D4-X adoption).
- **Implementation head:** `6889cf5fe7aefdaf703e88fbcc9103cb7623d5d6` (before this documentation/handoff commit; exact final commit SHA and full exact-HEAD manual CI evidence are reported in the completion packet).
- **State:** Draft PR #51 stays Draft and Issue #49 stays OPEN. If automatic `pull_request` hosted triggers are still active on `origin/main` (separate CI cost-conservation Draft PR #53 not yet merged), work is retained locally on `fix/nmi-issue49-journal-preflight` without pushing so zero hosted Actions minutes are consumed.

### Completed

- **Prettier & TypeScript strictness fix (`apps/api/src/migration-plan.test.ts`):** fixed the genuine Prettier failure that broke prior Stack CI runs `42243575145` and `42244301787` on `5eadf056c97ef2de5d350e048c9c817f6bd01bb0`, resolved latent `noUncheckedIndexedAccess` (`TS2532`) errors via `entryAt()`, and expanded deterministic unit negative controls to 13 tests (including symlinked SQL/journal/directory, unjournaled `.sql` / dangling symlink in `packages/db/migrations`, whitespace-only/NUL SQL, wrong index-8 tag/dialect, `null` JSON, and extra CLI args).
- **Symlink & unexpected-file fail-closed hardening (`scripts/migration-plan.mjs`):** replaced `statSync` with `lstatSync` across `packages`, `packages/db`, `packages/db/migrations`, `meta`, `meta/_journal.json`, and every `${tag}.sql` file; rejected whitespace-only or NUL-byte SQL text; scanned `readdirSync(directory)` to fail closed on any unjournaled SQL file, symlink, or unexpected entry.
- **Operator preflight failure-injection & macOS locale safety (`scripts/preflight-provision-operator.mjs`):** added strict CLI argument parsing (`--report`, `--migrations-root` with `customMigrationsRoot: true` marker in reports for non-repo fixture runs), recorded explicit `migrate.no_provision` (`operators=0` and zero CLI calls) on incomplete migration or missing `invoice_nudges`, and defaulted `LC_ALL=C` when unset to prevent macOS `postmaster became multithreaded during startup` failures (also documented in `docs/NMI-DEMO-JUDGE-RUNBOOK.md` §3 and §12).
- **Non-history-rewriting conflict reconciliation:** merged `origin/main@e795fbc8514d29555ff365f219033206ecc851d4` (`git merge --no-ff`), preserving all PR #52 code/tests/evidence and reconciling `docs/STATUS.md` and `docs/HANDOFFS.md` append-only (`NMI-P6-FIX2-01` and `NMI-MIG-0008-ISSUE49-C1` both retained intact; branch diff vs `origin/main` stays strictly within the 8 allowed task files).
- **Physical disposable PostgreSQL 16.15 acceptance (implementation-agent local evidence):**
  - Judge runbook §3–§5 & §11 on newly created loopback `/tmp/nmi-pg` (`127.0.0.1:54370/nmi_judge`): verified missing/non-loopback/wrong-port/wrong-DB `DATABASE_URL` refusals (shell survives), `zsh` and `bash` happy paths applying `0000`–`0008_mushy_zarek` (`public.invoice_nudges` verified), nonempty-DB refusals (both post-migration and single sentinel table with `public.invoices` remaining absent), `0005` division-by-zero failure injection rolling back `0005` and skipping `0006`–`0008` with `operators=0`, `provision-operator` creating `judge` after clean §4, and `pg_ctl status` exit `3` + TCP `ECONNREFUSED` + `ENOENT` removal.
  - SCRAM-SHA-256 `pnpm preflight:provision`: **56/56 passed** (`migrate.plan` `count=9`, `migrate` `count=9`, `migrate.0008` `ok=true`, create/rotate/negative controls, secret-leak scans, full teardown), plus 3 `--migrations-root` failure injections (`0005` SQL error, `0008` missing `invoice_nudges`, truncated journal before `pg.start`) each exiting `1` with zero operator provisioning and `cleanup.ok=true`.

### Validation and limitations

- Full exact-HEAD manual CI equivalent (Project Baseline + Stack CI + disposable PostgreSQL 16.15 `pnpm test:db`, licensed/community builds & bundle scans, `pnpm db:generate` drift check, `pnpm audit --prod --audit-level high`) is executed on the final exact commit SHA after this handoff commit and reported in the completion packet.
- Historical hosted Stack CI runs `42243575145` and `42244301787` at `5eadf056c97ef2de5d350e048c9c817f6bd01bb0` remain **FAILURE** (Prettier); hosted Actions on the new exact HEAD are **NOT RUN** under the owner's development manual-CI policy (mandatory hosted `workflow_dispatch` reserved for final release candidate).
- Out-of-scope historical references left untouched per the 8-file boundary: `docs/NMI-DEMO-DEPLOYMENT-DECISION.md` (historical deployment memo mentioning eight migrations), `docs/NMI-RENDER-P1-RUNBOOK.md` (summary table line mentioning `0000`–`0007`; executable commands already updated to `0000`–`0008` in PR #47), and P7-C `design/evidence/NMI-P7/run-nudge-recovery-drill.mjs` exit-code follow-up. No browser rehearsal (§9), Docker option, Mode B live providers, Render resource, or existing database was touched.
- **All release and provider gates stay unchanged:** D4-X effective only for its approved Hobby scope; G1/G4/G5/G6/G7 OPEN; G8 continuing; provider Gates A/B/C NOT AUTHORIZED; $25 credit ceiling unchanged.

### Next action

Merge or apply the owner-approved CI `workflow_dispatch`-only trigger change (Draft PR #53) on `main` (and merge `main` into `fix/nmi-issue49-journal-preflight` if needed so pushing does not trigger automatic `pull_request` hosted runs), push the reconciled branch to Draft PR #51, obtain independent exact-HEAD review, and await explicit owner merge approval before closing Issue #49.

## Handoff: NMI-MIG-0008-ISSUE49-C3

- **Task / phase:** `tasks/NMI-MIG-0008-ISSUE49.md`, GitHub Issue #49 (PR #51 reconciliation with `main@5e110efb5bbdd6fe92639beca0e7dc5a19626230`, workflow trigger verification, physical PG16 acceptance, and exact-HEAD manual CI).
- **From:** Antigravity implementation agent (not the independent reviewer).
- **To:** independent exact-HEAD migration/setup/security reviewer, then project owner for explicit merge decision.
- **Branch:** `fix/nmi-issue49-journal-preflight` (reconciled via regular non-history-rewriting merge with `origin/main@5e110efb5bbdd6fe92639beca0e7dc5a19626230`, incorporating owner-merged PR #53 CI cost-conservation policy, PR #52 `NMI-P6-FIX2`, and PR #50 D4-X adoption).
- **Final PR HEAD:** recorded in Draft PR #51 and verified post-commit on a clean working tree.
- **State:** Draft PR #51 ready for independent exact-HEAD review. Issue #49 stays OPEN. Hosted GitHub Actions are **NOT RUN** on this development PR (`workflow_dispatch` only under the merged PR #53 policy; zero hosted minutes consumed). No merge, deployment, Render provisioning, or live provider call is authorized.

### Completed

- **Reconciled with `origin/main@5e110efb5bbdd6fe92639beca0e7dc5a19626230` without rebase or force push:** cleanly merged the approved PR #53 CI cost-conservation policy; verified both `.github/workflows/ci.yml` and `.github/workflows/stack.yml` are `workflow_dispatch` only with `contents: read`, concurrency, and `postgres:16` service intact, and `.github/workflows/common-validation.yml` remains byte-identical to `origin/main`.
- **Preserved all prior Issue #49 / PR #51 implementations:** shared read-only `scripts/migration-plan.mjs` (fail-closed on non-regular/symlink files, whitespace/empty SQL, unjournaled `.sql` files, out-of-order `idx`, and missing `0008_mushy_zarek`), hardened judge runbook `docs/NMI-DEMO-JUDGE-RUNBOOK.md` §3–§5/§11 (subshell isolation, empty-DB check, `to_regclass` verification of `public.invoice_nudges`, `export LC_ALL="${LC_ALL:-C}"`), SCRAM operator preflight `scripts/preflight-provision-operator.mjs` (56/56 checks, `--report`, `--migrations-root`, `migrate.no_provision` gate), and 13/13 deterministic unit negative controls in `apps/api/src/migration-plan.test.ts`.
- **Documentation & status reconciliation:** `docs/STATUS.md` and `docs/HANDOFFS.md` reconciled additively, preserving accepted PR #52 and PR #53 records, handoff history, and active handoff `NMI-MIG-0008-ISSUE49-C3`.

### Validation (implementation-agent, exact-HEAD manual CI)

- **Commit SHA:** exact final PR HEAD recorded in the Draft PR description and comment.
- **Baseline & hygiene checks:** `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice` PASS (24 files); tracked `.env*` secret-file guard PASS (0 tracked env files); handoff uniqueness & single end marker PASS (134 unique IDs); `git diff --check origin/main..HEAD` clean.
- **Code validation:** `pnpm install --frozen-lockfile` PASS; `pnpm validate` PASS (`eslint`, `prettier --check`, 8-package `typecheck`, `vitest run` 73 runnable files / 1,424 tests passed incl. 13/13 `migration-plan.test.ts`, licensed web build & bundle secret scan, community web build & bundle scan).
- **Physical disposable PostgreSQL 16.15 integration & acceptance:**
  - `TEST_DATABASE_URL=... pnpm test:db` PASS (19 files / 367 tests passed; cluster stopped exit `3`, temp dir deleted).
  - Judge runbook §3–§5 & §11 manual walkthrough in disposable `nmi_judge` (empty DB, all 9 migrations applied, `invoice_nudges` verified, operator provisioned, clean stop).
  - Preflight & negative controls: `unset LC_ALL && pnpm preflight:provision` PASS (56/56); failure injection via `--migrations-root` (syntax error, missing `invoice_nudges`, truncated journal) each cleanly halted and refused operator creation (`migrate.no_provision: true`, `operators=0`).
- **Security & dependency audit:** `pnpm audit --prod --audit-level high` PASS (0 vulnerabilities); `pnpm db:generate` PASS (10 tables, no drift).
- **Hosted Actions verification:** 0 hosted runs triggered (`workflow_dispatch` only).

### Continuation notes

- **All release and provider gates stay unchanged:** G1, G4, G5, G6, and G7 remain OPEN; G8 continues; provider Gates A (`NUDGE_AI_DRAFTING_ENABLED=false`), B (`PAYPAL_DRAFTS_ENABLED=false`), and C remain NOT AUTHORIZED. Release remains **BLOCKED** until mandatory hosted `workflow_dispatch` runs succeed on the final release candidate and all owner gates close.
- Issue #49 stays OPEN until PR #51 is independently reviewed and owner-merged.

### Next action

Independent exact-HEAD review of PR #51 at the final commit SHA against this manual CI and disposable PG16 acceptance evidence, followed by the owner merge decision.

## Handoff: NMI-MIG-0008-ISSUE49-C4

- **Task / phase:** `tasks/NMI-MIG-0008-ISSUE49.md`, GitHub Issue #49, audit comment `6703063839` SEC-N1 only.
- **From:** implementation agent (not the independent reviewer).
- **To:** independent exact-HEAD reviewer, then the project owner for an explicit merge decision.
- **Branch:** `fix/nmi-issue49-journal-preflight`.
- **Base:** `main@5e110efb5bbdd6fe92639beca0e7dc5a19626230`.
- **Prior audited HEAD:** `e3c6eb541c73223bfada8fb246177cd8164ac34e` (PARTIAL; SEC-N1 open).
- **State:** Draft PR #51 remains open. Issue #49 stays OPEN. No merge, close, deploy, hosted `workflow_dispatch`, or live provider call.

### Completed

- Replaced the judge runbook's URL-component check, which accepted libpq query overrides such as `?hostaddr=`, with `scripts/migration-plan.mjs --assert-judge-target`.
- The guard rejects every query parameter and fragment, including percent-encoded `host`, `hostaddr`, and `port`, and refuses non-empty `PGHOSTADDR`, `PGSERVICE`, and `PGSERVICEFILE` plus a non-matching `PGHOST`, `PGPORT`, or `PGDATABASE`. It does not connect.
- §4 migration SQL and the empty-database checks run only through `--psql`, which repeats the guard and invokes `psql` with pinned `host=127.0.0.1 hostaddr=127.0.0.1 port=54370 dbname=nmi_judge` instead of the original `DATABASE_URL`. §5 calls the same guard before `provision-operator` and does not close an interactive shell.
- Trust and Docker/SCRAM userinfo forms remain valid. Journal validation, the 56-check operator preflight, cleanup, `workflow_dispatch`-only CI, and historical handoffs are unchanged.

### Validation

- Deterministic no-connection tests are in `apps/api/src/migration-plan.test.ts`. Exact-HEAD manual CI, disposable PostgreSQL 16 acceptance, and failure-injection results are recorded on Draft PR #51 for the commit that contains this handoff. Hosted GitHub Actions remain `NOT RUN`.

### Next action

Independent re-audit of SEC-N1 at the new exact HEAD, then the owner merge decision. Do not close Issue #49 before that.

## Handoff: NMI-MIG-0008-ISSUE49-C5

- **Task:** post-merge docs-only closeout for Issue #49; this handoff is current, not a rewrite of historical C1–C4.
- **From:** issue closure and reconciliation.
- **To:** independent reviewer of docs-only closeout; then judge-submission owner.
- **Base:** `main@cd4dd1e3f4589205dc832c28bfe75593681ea44d`; closeout branch `docs/nmi-issue49-closeout`.
- **State:** Issue #49 closed `completed`; PR #51 owner squash-merged and independently audited PASS (comment 6703477602). This documentation PR remains Draft and is not independently accepted or merged.

### Verified completion

- Audited PR HEAD `dd171aab8bdc56b2ccd0f511bd678ffa353489f4` and squash merge `cd4dd1e3f4589205dc832c28bfe75593681ea44d` have identical Git trees. Issue #49 is closed after the owner-authorized merge.
- Migration 0008 journal and SEC-N1 fail-closed local judge target guard are merged; prior C1–C4 implementation and audit history is preserved verbatim.
- Full exact-HEAD manual CI and disposable PG16 acceptance are implementation-agent-reported; hosted CI is NOT RUN on the development SHA.
- No Render provisioning, GitHub-hosted release dispatch, live-provider use or deployment occurred during issue closure.
- Prior owner Hobby/$25/D4-X decisions are recognized; separate objective Render G1–G7 evidence and mandatory release validations remain to be reconciled without soliciting repeat approvals.

### Next action

Review docs-only status changes and independently verify no release/policy gates were silently closed. Continue final clean-clone judge rehearsal, demo-video and Devpost readiness. Do not merge this Draft PR without the owner's separate approval.

## Handoff: NMI-RENDER-RC-MANUAL-01

- **Task:** `tasks/NMI-RENDER-RC-MANUAL-CI-EXCEPTION.md` — one-time release validation policy proposal for the fixed NudgeMyInvoice Render judge candidate.
- **Owner direction:** 2026-11-07: "switch it" from GitHub-hosted Actions to a reviewed manual release route; not a deployment or policy-PR merge authorization.
- **Source/base:** `main@abfbbfc3153cb3b4238ebf201daca830fed2e8f9`; release branch `release/nmi-render-judges-2026` at the same SHA, with active deletion/non-fast-forward restrictions.
- **Policy branch:** `docs/nmi-rc-manual-release-exception`, documentation only; request independent exact-HEAD audit and separate owner merge decision.
- **State:** PROPOSED / NOT OPERATIVE. GitHub-hosted CI NOT RUN, complete exact-candidate manual release suite NOT RUN, Render resources NOT CREATED, URL NOT SHARED, paid actions NONE.

### Delivered in policy proposal

- A bounded one-time release exception task and manual equivalence checklist covering the existing `Project Baseline CI` and `Stack CI` commands on the exact pinned SHA, plus isolated PostgreSQL 16, nine migrations, least-privilege and recovery, security and bundle checks, source/env preflights, platform-difference disclosure, independently audited evidence and distinct owner go/no-go.
- `docs/TESTING.md` and `docs/RELEASE.md`: default hosted release requirement retained for all other cases; the one-time manual route is conditional on policy PR independent PASS, verified merge, full equivalent manual suite, independent release audit, and separate owner acceptance of the missing Ubuntu hosted evidence.
- P4 and G1 packet contain current-state pointers while preserving the historical hosted rules and D4-X scope, $25 spending ceiling, G1/G5/G6/G7/G8 requirements and no-provider posture.
- Source preflight 7/7 PASS reported by the owner, not independently executed here. GitHub ref and branch ruleset independently verified in the preceding release preparation.

### Required evidence and stops

- Validate only authorized docs changed, source policy consistency, project-profile validator and diff hygiene; do not misattribute locally unrun checks. Independent reviewer cannot be the implementer.
- Any real required check failure, changed candidate/release branch, missing PG16 safety, unreviewed backup runner cleanup, absent owner acceptance or missing G1/G5/G6/G7/G8 checks blocks resource creation/deploy.
- The policy PR merge itself never creates resources, calls providers, bypasses other gates, or shares a judge URL. Actual Render create/build/deploy requires separate explicit owner authorization after the evidence.

### Next action

Independent exact-HEAD audit of this docs-only policy PR. Then obtain owner's separate squash-merge decision. If merged, run complete exact-SHA manual release validation and independent review before a separate risk-acceptance/deploy decision.
## Handoff: NMI-JUDGE-LIVE-OPENAI-01

- **Task:** `tasks/NMI-JUDGE-LIVE-OPENAI-01.md`; issue #56; feature branch `feat/nmi-judge-live-openai` based on `main@04240209add5bcdae67f4b925e9f194abaad8b66`.
- **Owner direction:** 2026-11-07: explicitly implement OpenAI functionality into a new feature branch urgently because judges need to see AI. This authorizes feature development, **not** additional billable provider calls or live deployment.
- **Known history:** PR #25 Gate A provisional real-provider PASS on 2 synthetic parses (2026-10-30), authorization consumed. PR #43 implements P6 AI Nudges with fake-model browser evidence. PR #55 owner-accepted one-time manual CI substitution applies **only** to the historical pinned SHA.
- **Work:** conditional limited judge AI mode, server-side parser/nudge model configuration, no SDK parser retries in limited mode, endpoint budgets, pure release env guards/tests, proposed G8 addendum. PayPal remains sandbox-and-disabled. No credentials committed.
- **Live infrastructure:** deployed Render service `srv-dbng0oc9v7es73cm6m2g`, PostgreSQL `dpg-dbnetgk9v7es73cjd6g0-a`, protected release candidate `abfbbfc3153cb3b4238ebf201daca830fed2e8f9` left unchanged. No URL sharing authorization.
- **Verification:** source transformation sanity checks only unless test evidence appears separately on exact PR HEAD. Hosted CI blocked until December. Do NOT classify CI or live API calls as PASS when not run.
- **Gates:** independent code/security/policy audit, full Mac manual CI on this new HEAD, explicit model/key/call/spend authorization, new pinned release candidate and separate owner merge/deploy/URL approvals are required. The historical Gate A cap may not be reused.
- **Next action:** exact-HEAD local manual validation, focused review (especially guard/test matrix and rate-limit reset), independent audit, then owner merge decision.

## Handoff: NMI-JUDGE-LIVE-OPENAI-02

- **Task:** `tasks/NMI-JUDGE-LIVE-OPENAI-01.md`; issue #56; Draft PR #57. No merge, deploy, provider call, PayPal call, or URL share.
- **Decisions:** limited mode fails closed in every environment; absent mode remains the default and does not enable either AI feature. Parser SDK retries are 0 only in limited mode. Nudge SDK retries stay 0. Both endpoints use 3 requests per 10 minutes and concurrency 1 in limited mode. Those budgets reset on restart and are not a spend cap. Nudge prompts still send tone and enumerated facts only.
- **Preserved:** Gate A `R1-A-20261030-01` consumed provisional PASS; P6 fake-model evidence; provider-disabled deployment of `abfbbfc3153cb3b4238ebf201daca830fed2e8f9`. This branch is not that deployment.
- **Verification:** focused mocked tests passed before this handoff. Exact-HEAD manual CI counts are posted on Draft PR #57 for the commit that contains this handoff. Hosted GitHub Actions remain NOT RUN.
- **Next action:** independent exact-HEAD security/code audit, then a separate owner decision on merge. A live OpenAI call still needs its own model, cap, budget, expiry, and synthetic-input authorization.

## Handoff: NMI-JUDGE-LIVE-OPENAI-03

- **Task:** `tasks/NMI-JUDGE-LIVE-OPENAI-01.md`; issue #56; Draft PR #57 at `8f30024a0a0d148f6476256a43133c170d8c16ce` (`305e875` feature + Prettier-only remediation + this handoff record; pushed normally, no force push). No merge, deploy, provider call, PayPal call, or URL share.
- **Decisions:** unchanged from -02: limited mode fails closed in every environment; absent mode stays provider-disabled by default. Parser SDK retries are 0 in limited mode; nudge retries stay 0. Both endpoints use 3 requests per 10 minutes and concurrency 1 in limited mode — in-memory budgets that reset on restart, not a hard spend cap. Nudge prompts still send tone and enumerated facts only.
- **Preserved:** Gate A `R1-A-20261030-01` consumed provisional PASS; P6 fake-model evidence; provider-disabled deployment of `abfbbfc3153cb3b4238ebf201daca830fed2e8f9`. This branch is not that deployment.
- **Verification:** full exact-HEAD manual CI PASS at `8f30024` (profile, secret guard, frozen install, lint 0 errors/1 pre-existing warning, format, typecheck, `pnpm test` 1449 passed / 75 files, licensed + community builds, both bundle scans clean, `pnpm test:db` 367/367 on a disposable PG16 cluster since dropped, migration sync clean, `pnpm audit` clean, `git diff --check` clean; hosted CI NOT RUN). Zero provider env vars set; no OpenAI/PayPal network calls. Full evidence posted on Draft PR #57; earlier `512e937` evidence in PR comment 6706524047.
- **Next action:** independent exact-HEAD security/code audit of `512e937` (fail-closed config, retry controls, budget enforcement, test evidence, G8 proposal), then a separate owner merge decision. A live OpenAI call still needs its own model, cap, budget, expiry, and synthetic-input authorization.

## Handoff: NMI-JUDGE-LIVE-OPENAI-04

- **Task:** `tasks/NMI-JUDGE-LIVE-OPENAI-01.md`; issue #56; Draft PR #57 on `feat/nmi-judge-live-openai`. Remediates independent audit `6706638116` (FAIL) at `aad7a80`. No merge, deploy, provider call, PayPal call, or URL share.
- **SEC-01 (blocking, fixed):** production default-off bypass closed in `apps/api/src/config.ts` — the guard now uses the parsed mode (`e.NMI_JUDGE_AI_MODE === "off"`, which covers explicit `off` and absent/defaulted), so production + OpenAI credentials/drafting with the mode absent throws fail-closed instead of building clients. Non-production harnesses that omit the mode keep existing behavior. Negative tests added in `apps/api/src/judge-ai-mode.test.ts` (absent-mode key/model/drafting refusal, malformed mode, dev preservation); the absent-mode case failed before the fix and passes after. One existing `apps/api/src/app.test.ts` cookie test that relied on the bypass now drops provider credentials from its production probes.
- **DOC-01 (reconciled):** `docs/STATUS.md` current-phase paragraph now scopes the historical "no resources" sentence and states the current provider-disabled deployment of `abfbbfc...` exists unchanged; active handoff → `-04`. Devpost AI-provider section now records Gate A provisional REAL PASS scope with PENDING fields instead of the blanket "no live request" claim; demo-access line no longer claims no hosted deployment. Video script records the P6-nudge demo gap as OPEN. PR description updated to current HEAD.
- **RELEASE-01:** Node 22 compatibility proof recorded separately from full manual CI (see PR evidence comment); previous full-CI runs were agent-reported on Node 24 only.
- **Preserved:** Gate A `R1-A-20261030-01` consumed provisional PASS; P6 fake-model evidence; provider-disabled deployment of `abfbbfc3153cb3b4238ebf201daca830fed2e8f9`. This branch is not that deployment. Historical handoffs untouched.
- **Verification:** focused SEC-01 suites green; full exact-HEAD manual CI (profile, secret guard, frozen install, `pnpm validate`, disposable PG16 `pnpm test:db`, migration sync, prod audit, `git diff --check`) run on the commit containing this handoff; hosted CI NOT RUN. Zero provider env vars; no OpenAI/PayPal network calls. Full evidence posted on Draft PR #57.
- **Next action:** independent exact-HEAD security/code re-audit, then a separate owner merge decision. A live OpenAI call still needs its own model, cap, budget, expiry, and synthetic-input authorization.

## Handoff: NMI-OPENAI-RENDER-RC-01

- **Task:** `tasks/NMI-OPENAI-RENDER-RC-01.md`; issue #58; branch `feat/nmi-openai-render-rc-01` from merged `main@b4515f1...` (PR #57 squash; tree identical to audited `78d9a23...`). No merge, deploy, env change, provider call, PayPal call, branch creation, or URL share.
- **Decisions:** second immutable candidate branch proposed as `release/nmi-openai-judges-2026` (strict two-entry preflight allowlist; both paths independently verifiable; arbitrary names fail closed without echo). Original `release/nmi-render-judges-2026@abfbbfc...` stays pinned as rollback; PR #55's exception never transfers. New manual-CI exception drafted separately (`tasks/NMI-OPENAI-RC-01-MANUAL-CI-EXCEPTION.md`, NOT OPERATIVE). Activation packet drafted separately (`docs/NMI-OPENAI-JUDGE-ACTIVATION-PACKET.md`, NOT AUTHORIZED). Verified no migration delta `abfbbfc...b4515f1`, so the candidate is DB-schema-compatible.
- **Preserved:** PR #57 merge record/audit, Gate A consumed PASS, P6 fake-model evidence, live provider-disabled deployment `abfbbfc...`. Historical handoffs untouched.
- **Verification:** targeted preflight tests green (100 tests incl. new allowlist + CLI cases); full exact-HEAD manual CI (Node 22, disposable PG16) run on the commit containing this handoff; hosted CI NOT RUN; macOS↔Ubuntu gap recorded in the exception doc. Zero provider env vars; no OpenAI/PayPal network calls. Evidence posted on the new Draft PR.
- **Next action:** independent code/security/policy review of the exact HEAD, then separate owner decisions (candidate SHA, branch creation, manual-CI acceptance, activation, deploy, URL).

## Handoff: NMI-OPENAI-RENDER-RC-02

- **Task:** `tasks/NMI-OPENAI-RENDER-RC-01.md`; issue #58; Draft PR #59 on `feat/nmi-openai-render-rc-01`. Narrow remediation of audit `6707139153` (PARTIAL at `7d42f15`): POLICY-01, DOC-02, DOC-03 only. No app changes, no new infrastructure, no merge/deploy/env/provider/branch/URL action. Historical handoffs untouched.
- **POLICY-01 (fixed):** activation packet §2 item 2 now requires the provider-side **"Enforce a hard limit"** toggle ON (a limit alone only monitors), with dated evidence of the toggle, alert thresholds below the cap, owner shutdown threshold, and an explicit no-perfect-guarantee note for enforcement delay. No limit verified or approved.
- **DOC-02 (fixed):** exception statuses line now reads NO NEW resources by this task with the existing Live provider-disabled deployment unchanged; STATUS hosting bullet now states the Live deployment as current and marks new provision/deploy as not authorized by this task.
- **DOC-03 (fixed):** exception condition 2 now requires two separate clean detached checkouts/worktrees (one per exact SHA) and records which preflight executable runs in each.
- **Preserved:** preflight allowlist + tests, release boundaries, PR #57 merge record, Gate A evidence, live Render state, PR #55 non-inheritance.
- **Verification:** doc-checks + full exact-HEAD manual CI (Node 22, disposable PG16) run on the commit containing this handoff; hosted CI NOT RUN. Zero provider env vars; no OpenAI/PayPal network calls. Evidence posted on Draft PR #59.
- **Next action:** focused independent re-audit of the three remediated items, then separate owner decisions.

<!-- HANDOFF_ENTRIES_END -->
