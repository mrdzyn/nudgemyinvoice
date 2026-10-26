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
- Real single-create PayPal Sandbox smoke (AG evidence): OAuth `200`, create `201`, read-only GET `200`; `INV2-U92W-76NX-3P2E-AGUZ`, `DRAFT` USD 5.00; local operation `created`, attempt `1`, reference/date/number match.
- No send, reminder, refund, cancellation, payment, deployment or production operation; Sandbox create feature flag restored to `false`; private exhausted test budget preserved.

### Validation
- AG reports `pnpm validate` PASS (235 unit), `TEST_DATABASE_URL=... pnpm test:db` PASS (187 PostgreSQL); GitHub Project Baseline and Stack CI independently confirmed SUCCESS at `4982201`.
- Genuine OpenAI Responses provider smoke: **NOT TESTED**. Real PayPal remote search/reconciliation/error-path behavior not established by this single happy-path create.
- PR #5 docs-only changes need their own exact-head checks and independent review; the prior code PR CI does not apply to its new SHA.

### Continuation notes
- Update canonical docs truthfully; maintain historical C6 handoff unchanged and keep buyer/merchant contact information, secrets and tokens outside GitHub.
- No new PayPal create is authorized; do not reset local one-create guard or enable sending/webhooks.
- No approved UI design or next implementation phase. This is a docs reconciliation handoff, not release clearance.

### Next action
Independently audit Draft PR #5's exact HEAD, documentation diff and applicable CI; request separate owner approval before merging PR #5.

<!-- HANDOFF_ENTRIES_END -->
