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
  - *Root cause:* When PayPal search reported `total_pages > 1` but page 1 contained no item matching `invoice_number`, `matchingIds` was empty and `findInvoiceIdsByNumber` returned `["ambiguous_more_remote_pages"]`. The service treated this single element as a real invoice ID, attempted `getInvoice`, failed with `invalid_id`, and persisted `"ambiguous_more_remote_pages"` into `paypal_operations.paypal_invoice_id`, poisoning subsequent reconciliation and requiring manual DB intervention.
  - *Remediation implemented:* Removed all pseudo-identifiers from `findInvoiceIdsByNumber`. Incomplete or multi-page searches (`total_pages > 1` or `total_items > items.length`) throw a typed `PayPalOutcomeUnknownError("search_incomplete")`. In `searchResponse`, inconsistent counts (`total_pages === 0` with items or `total_items === 0` with pages > 0) fail parsing as `response_unparseable`. Remote IDs in search items are strictly validated against `REMOTE_ID` regex. The service records `unknown` with code `"search_incomplete"` and NO remote ID, leaving `paypal_invoice_id = null` and preserving recoverable state.
  - *Regression tests:* Added unit tests in `packages/paypal/src/client.test.ts` for incomplete search with no matching item on page 1, multi-page with matching item, `total_pages > 1` without `total_items`, inconsistent counts, and malformed item IDs. Added end-to-end fake HTTP / DB integration regression in `apps/api/src/invoice-drafts.pg.test.ts` proving no synthetic remote ID is saved in PostgreSQL, no second create occurs, and recovery succeeds cleanly once search completes.
- **MEDIUM-2 (blocking) — Due-date validation prevents reconciliation of an already-created remote draft:**
  - *Root cause:* `assertExactMapping(saved.draft, today)` was evaluated unconditionally at the beginning of `createPayPalDraft`. If an invoice due date passed midnight while an ambiguous create attempt was in-flight or unknown, every subsequent retry was rejected as `mapping_refused: due_date_past` before reading the existing operation or checking PayPal, making a valid remote sandbox draft permanently unreconcilable precisely when its due date arrived.
  - *Remediation implemented:* Split mapping validation: `assertExactMapping(saved.draft, today)` applies strictly to new create attempts only (`!existingOp || (existingOp.state !== "unknown" && existingOp.state !== "creating" && existingOp.createAttemptedAt === null)`). Existing in-flight/unknown operations validate against their persisted original intent date (`originalInvoiceDate = existingOp.createdAt`). A double-guard before the external `createDraftInvoice` call ensures that even if an existing operation were claimed, a new create request with a past due date is never sent. Exact-money verification, payload digest binding (`existing.payloadDigest === requestDigest(body)`), and `remote.dueDate === expected.dueDate` checks remain fully enforced.
  - *Regression test:* Added deterministic PostgreSQL regression in `apps/api/src/invoice-drafts.pg.test.ts` where a draft created at T0 times out, the clock advances past midnight to T1 (`today > dueDate`), asserts that a new draft with past due date is refused (422 `due_date_past`), asserts that retrying the existing draft before visibility returns 409 `reconciliation_pending` without a second create (`pp.log.create.length === 1`), and asserts that once visibility catches up the remote invoice is verified and locally linked with 201 `created` without a second create.
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
  - *Root cause:* The initial create request sampled `deps.clock()` and built the request body with `invoice_date` before calling `ops.reserve`. The database row generated `created_at` independently via PostgreSQL `now()`. If a request arrived near UTC midnight, `created_at` could be stamped on D+1 while the outbound request was sent on day D. On subsequent retry/reconciliation, `existingOp.createdAt` yielded D+1, causing `assertExactMapping` to reject the draft as `due_date_past` before search/reconciliation, and mutating the rebuilt request body/digest.
  - *Remediation implemented:*
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
  - *Root cause:* Two concurrent requests racing on a fresh draft across midnight both sampled `ops.get = null` and pre-built their request bodies with their local sampled dates before `ops.reserve`. When request A won the atomic `reserve`, request B's `reserve` call returned request A's row on conflict. However, request B retained its pre-built body. If request B then won the fenced lease claim, `requestDigest(body)` (which excludes `invoice_date` for replay stability) matched `existing.payloadDigest`, so request B sent its pre-built body (dated D+1) to PayPal while the database row asserted date D.
  - *Remediation implemented:*
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

Update acceptance §5.0–5.4, unanswered Request B, evidence Template B, checklist, task, STATUS, handoff and PR body as the real evidence becomes *prepared* (not real-PASS). Do not touch Gate A/C approval answers or execute Gate B. Run applicable doc checks and mandatory hosted CI. Report final HEAD, checks and limitations and request exact-head GPT-6 audit. Do not merge.

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
- **Read-only Render observations:** confirmed Mrdzyn workspace ID `tea-dbgnjq1srm7s73ebcq2g`, no PostgreSQL instances returned; service inventory returned `null`, not evidence of zero. Render tools cannot read private billing. Owner screenshots confirm Hobby included usage and $50 credit; projected overages, taxes and account-specific charge eligibility still unverified. Public list prices are not a spending authorization.
- **Owner-selected judges staging (2026-10-29):** Mrdzyn **Hobby Free web + Free PostgreSQL 16** (1 GB) in Singapore, $0 published compute baseline, one instance/database, manual pinned audited `main@652cf702`, Auto-Deploy OFF, provider-disabled and single-operator synthetic data. Free web sleeps after 15 minutes; Free PG expires after 30 days with no managed backups. Original P1 Render platform HTTP-request-log requirement remains NOT VERIFIED on Hobby; a separately reviewed alternate evidence plan and owner risk acceptance are required **before judge release**. Judges' evaluation window/teardown date must be verified before creation. No Blueprint, secrets in GitHub, or URL share.
- **Billing evidence:** Owner supplied Render Billing screenshots: **$50 Hackathon Participant promotional credit expiring 2027-10-01**, no pending invoices/charges shown, Hobby included 750 Free instance-hours, 5 GB outbound bandwidth and 500 pipeline minutes (0 used). $0 baseline does not eliminate possible usage overages; credit eligibility for charges unknown. No Pro upgrade selected.
- **Blocking approvals:** owner explicitly selected **Free+Free for judges**, but also explicitly retained **no provisioning before approving actual charges**. Resource creation (even free), initial deploy, any overage exposure, native HTTP-log security substitution and external judge access are separate explicit human approval gates. No merge or cloud creation authorized.
- **Gates:** A/OpenAI, B/PayPal, C/combined NOT AUTHORIZED; no cloud resource, billing or deploy approval, no judge access.

<!-- HANDOFF_ENTRIES_END -->
