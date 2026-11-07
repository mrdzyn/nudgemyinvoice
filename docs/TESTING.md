# Testing and Quality Gates

## Purpose

Define how changes are proven safe enough to merge and release. Generated projects should replace the placeholders with stack-specific commands.

## Testing principles

- Test behavior, not only implementation details.
- Add regression coverage for fixed defects when practical.
- Keep tests deterministic and repeatable.
- Do not delete or weaken valid tests merely to make a change pass.
- Match validation depth to risk.
- For user-facing work, derive the test plan from the written requirements and approved screen/flow contract before production wiring begins.
- Add executable tests alongside business/data/API/integration wiring rather than deferring them until after the UI appears complete.
- Record checks actually run; never claim unexecuted validation.
- Prefer the smallest set of checks that can prove the task's stated objective.
- Do not spend agent time or context proving unrelated behavior merely because more tests exist.
- Required CI and release gates remain mandatory even when the agent's own local/interactive test scope is intentionally narrow.

## Test objective and stop rule

Every non-trivial task should define a **test objective** before execution.

A good test objective answers:

> What specific behavior or risk must be proven before this task can move to manual QA?

Examples:
- "Prove that this component renders the new empty-state copy and preserves the existing action."
- "Prove that this parser rejects malformed input without changing valid-input behavior."
- "Prove that tenant B's record can never be returned through tenant A's repository path."
- "Prove that the release artifact is signed by the expected Android upload certificate."

The agent should then choose the **smallest automated evidence** that can prove that objective.

Default sequence:

```text
acceptance criteria
    ↓
define test objective
    ↓
targeted automated check(s)
    ↓
objective met?
  ├─ no → fix / targeted retest
  └─ yes → STOP expanding automated tests
             ↓
          manual QA
             ↓
       PR / required CI
```

Once the objective is met, do not broaden the agent-run test loop unless at least one of these applies:
- the change has a broad/shared blast radius;
- a failure suggests adjacent behavior may be affected;
- the task touches a high-risk boundary;
- a repository-required CI/release gate requires broader coverage;
- the owner/orchestrator explicitly requests broader regression.

If a passing test suite has not changed and subsequent edits cannot affect it, do not rerun it reflexively.

## Agent testing vs required CI

These are separate layers:

- **Agent/local validation:** objective-based, targeted, and risk-proportionate. Optimize for the evidence needed to prove the task.
- **Required CI:** repository policy. Every protected/required status check still runs on the PR when configured, regardless of how narrow the agent's local test scope was.
- **Release validation:** may be broader than both local testing and ordinary PR checks because it proves a release candidate, not just a code change.
- **Manual QA:** follows successful targeted automated validation when human/device/browser/platform inspection adds confidence.

Never weaken, disable, or skip required CI merely to reduce AI token use.

## CI gate classes

Every project should classify CI/release evidence into exactly the gate type it actually represents. A job being automated does **not** automatically make it a required PR gate.

| Gate class | Purpose | Typical examples | Merge/release behavior |
|---|---|---|---|
| **Required PR gate** | Prove the proposed change is safe enough to merge | common baseline, stable lint/static analysis, typecheck/compile, risk-required tests, build/package, applicable security checks | Must satisfy repository merge policy; use only stable, deterministic check names/behavior |
| **Optional informational** | Add useful but non-blocking signal | extended compatibility matrices, expensive advisory analysis, experimental toolchains | May fail without blocking merge unless explicitly promoted to required policy; results must never masquerade as evidence that required validation passed |
| **Release-only** | Prove an exact release candidate and privileged release conditions | signing, provenance/checksum, exact artifact verification, store/package validation, migration/recovery readiness | Runs in a release trust zone; not a substitute for PR validation and should not expose release credentials to ordinary PRs |
| **Manual / human gate** | Capture judgment or environment/device/store approval that automation cannot truthfully represent | device/browser QA, accessibility inspection, store review, production approval | Recorded as human/process evidence; do not manufacture a fake passing CI check merely for dashboard completeness |

### Choosing required PR gates

Make a check required only when all of the following are true:

- it protects merge safety for this repository rather than merely providing extra signal;
- its check name and behavior are stable enough for ruleset enforcement;
- it is deterministic enough that routine merge flow will not be dominated by avoidable flakes;
- it can run safely in the PR trust context without production/release credentials;
- the repository has a clear owner for failures and for coordinated required-check renames.

A project may promote an informational check to required when experience shows that its signal is necessary for merge safety. That is a repository-policy change: document it and coordinate the ruleset/status-check configuration.

Demoting or retiring a required check is also a repository-policy change. Document why it no longer protects a meaningful risk, obtain explicit project-owner approval, and coordinate the ruleset/status-check change. Never demote or retire a required check to bypass a genuine failure on the PR under review.

### Relationship to local agent validation

These gate classes do not expand the agent's local test budget. The agent still runs the smallest targeted evidence that proves the task objective. Required PR gates, release-only validation, and human approval remain separate policy layers and run when their stage is reached.

## CI availability exception

Required CI remains the normal merge gate. When GitHub-hosted CI cannot execute for an external quota/service/runner-availability reason, the repository may use the documented CI-unavailable exception; that exception must never be used to excuse a genuine failing test, build, security, signing, migration, or policy check.

`docs/REPOSITORY-SETUP.md` is the canonical source for eligibility, evidence, equivalent validation, independent review, owner/admin approval, PR-only bypass, trigger-economy, and optional self-hosted-runner guidance.

### NudgeMyInvoice CI cost-conservation policy (owner-approved 2026-11-07)

To conserve GitHub-hosted Actions minutes during active development while keeping full release-candidate assurance, `.github/workflows/ci.yml` (`Project Baseline CI`, calling `.github/workflows/common-validation.yml`) and `.github/workflows/stack.yml` (`Stack CI`, including its `postgres:16` service container and all build/security steps) trigger on explicit `workflow_dispatch` only (`pull_request` automatic execution removed).

Validation is strictly separated into **three stages**:

1. **Targeted local checks during implementation:**
   - Run the smallest objective-based local checks (changed-package lint/typecheck plus targeted Vitest unit/DOM/PostgreSQL tests) needed to prove the task's stated test objective, then stop expanding the inner loop unless escalation rules apply.
2. **Full exact-HEAD manual CI before independent audit and merge (routine PR gate):**
   - Before requesting independent exact-HEAD review or owner merge approval, run the complete CI-equivalent suite locally against the **exact committed PR HEAD** (with a clean working tree), covering both `common-validation.yml` and `stack.yml`:
     - `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice`
     - Tracked local-env secret guard: `test -z "$(git ls-files | grep -E '(^|/)(\.env|\.env\.(local|development|staging|production))$' || true)"`
     - Locked dependency state (`pnpm install --frozen-lockfile` or verified clean `pnpm-lock.yaml`)
     - `pnpm validate` (`pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build:web:licensed`, `pnpm check:bundle:licensed`, `pnpm build`, `pnpm check:bundle`)
     - Disposable PostgreSQL 16 integration suite: `TEST_DATABASE_URL=postgres://.../nmi_test pnpm test:db` (`REQUIRE_DB_TESTS=1 vitest run .pg.test.ts`; confirm `pg_ctl status` exit `3` before deleting any temporary cluster directory)
     - Schema-migration sync check: `pnpm db:generate && test -z "$(git status --porcelain packages/db/migrations)"`
     - Production dependency audit: `pnpm audit --prod --audit-level high`
     - Whitespace/conflict hygiene: `git diff --check`
   - If the PR HEAD changes afterward, repeat manual CI on the new exact HEAD before audit or merge. A previous SHA's evidence never carries over to a new commit.
3. **Release-candidate validation (default hosted gate; one-time owner-selected manual alternative is separately controlled):**
   - **Default:** before any production/judge deployment or final release sign-off, explicitly dispatch both `Project Baseline CI` (`ci.yml`) and `Stack CI` (`stack.yml`) at the exact candidate ref/SHA, verify matching `headSha` and require both `SUCCESS`. Creating and protecting an inert release branch does not deploy or activate a release.
   - **Only scoped alternative:** for NudgeMyInvoice's single Render Hobby judges candidate `abfbbfc3153cb3b4238ebf201daca830fed2e8f9` on the protected `release/nmi-render-judges-2026`, the owner-directed manual option in `tasks/NMI-RENDER-RC-MANUAL-CI-EXCEPTION.md` may substitute for the two hosted `SUCCESS` results **only after** that policy PR receives an independent exact-HEAD audit, separate owner merge approval and verified merge; every full exact-candidate local equivalent, independent release-evidence audit, recorded macOS-versus-Ubuntu gap acceptance and a separate owner decision approving use of the one-time exception must also be completed. Until ALL conditions hold, release remains **BLOCKED**. Never report hosted CI as `SUCCESS` when `NOT RUN`. If any actual required check fails, fail closed rather than use this exception. All other gates and owner deployment approvals remain binding. Future candidates retain the hosted requirement. A separate exact-candidate manual alternative for the proposed OpenAI judges candidate (`release/nmi-openai-judges-2026`) requires its own independently audited, owner-approved policy with exact-SHA evidence; see `tasks/NMI-OPENAI-RC-01-MANUAL-CI-EXCEPTION.md`. PR #55's one-time exception never transfers.

#### Mandatory manual CI evidence record

Every PR description (and/or active handoff) submitted under manual CI **must** record all six items:

1. **Commit SHA:** exact 40-character `HEAD` SHA validated and clean working-tree confirmation.
2. **Commands:** exact commands executed for baseline, static checks, unit/DOM tests, PostgreSQL 16 integration tests, builds, migration sync, and security checks.
3. **Test & build results:** explicit pass/fail/skip counts (`pnpm test` files/tests, `pnpm test:db` files/tests on PostgreSQL 16, licensed and community web builds, migration-sync status).
4. **Environment:** OS, Node.js version, `pnpm` version, PostgreSQL 16 version and disposable database/cluster isolation, and provider posture (fake/simulated vs authorized live smoke).
5. **Security & hygiene checks:** outcomes of `pnpm check:bundle:licensed`, `pnpm check:bundle`, `pnpm audit --prod --audit-level high`, tracked `.env*` secret-file check, `validate_project_profile.py`, and `git diff --check`.
6. **Outstanding QA & unrun checks:** explicitly mark hosted Actions as `NOT RUN`; hosted validation is mandatory by default on release candidates, except the independently audited, explicitly owner-approved one-time manual substitution for the exact SHA documented in `tasks/NMI-RENDER-RC-MANUAL-CI-EXCEPTION.md` (never an implicit bypass). Record any remaining browser/device/screen-reader/zoom/proxy/provider QA.

#### Non-negotiable policy boundaries

- **Never record an unrun hosted check as `PASS`.** Unexecuted `Project Baseline CI` / `Stack CI` workflows must be reported as `NOT RUN`.
- **Not an exception for failing checks:** any genuine test, lint, format, typecheck, build, bundle-secret, migration, profile, or `pnpm audit` failure blocks independent audit and merge until fixed.
- **Governance preserved:** independent exact-HEAD review, explicit human merge approval, `docs/SECURITY.md` boundaries, and separate owner release/deployment/provider gates remain mandatory.
- **GitHub Actions transition behavior:** GitHub evaluates `on: pull_request` from `refs/pull/<N>/merge`. PRs whose merge commit includes `workflow_dispatch`-only workflows trigger zero automatic hosted runs; pre-existing open PR branches created before this policy merges to `main` still carry `pull_request:` until `main` merges this change (or those branches update from `main`), so pushing to those stale branches before merge would still consume hosted minutes.

## Risk-proportionate testing ladder

Use this as a default, then adapt to the actual project:

| Change type | Default automated evidence | Next gate |
|---|---|---|
| Docs/copy/non-executable metadata | syntax/link/schema check if relevant; otherwise none | human review / manual QA |
| Localized visual/UI change | targeted component/widget/render test if useful | manual visual/device QA |
| Localized business logic | targeted unit/behavior test | manual functional QA where applicable |
| API/integration adapter change | targeted unit + boundary/integration test | manual integration QA |
| Shared/core library or cross-cutting state | targeted tests + affected regression subset | manual QA + required CI |
| Auth/authz, tenant isolation, credentials, cryptography, payments, migrations, security/privacy controls, production infrastructure | targeted security/behavior tests + broader affected regression | manual QA + required CI/security gates |
| Release candidate / store submission | required CI + release regression/artifact validation | release QA / human approval |

This is not a rigid checklist. The test objective and blast radius determine the actual evidence.

## Test layers

### Static validation
Examples:
- formatting;
- linting;
- type checking;
- compilation/analyze;
- schema validation.

**Project commands:**  
`pnpm lint && pnpm format:check && pnpm typecheck && pnpm db:generate && test -z "$(git status --porcelain packages/db/migrations)" && python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice && git diff --check`

### Unit tests
Validate isolated business logic and edge cases.

**Project commands:**  
`pnpm test` (or targeted `pnpm --filter <pkg> exec vitest run <path>` during implementation)

### Integration tests
Validate boundaries such as database, filesystem, network API, authentication, or platform adapters.

**Project commands:**  
`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:<port>/nmi_test pnpm test:db` (sets `REQUIRE_DB_TESTS=1` against a disposable PostgreSQL 16 database)

### End-to-end / acceptance tests
Validate critical user journeys or release flows.

**Project commands:**  
`pnpm build && node design/evidence/<phase>/<runner>.mjs` (synthetic data + fake providers + disposable PostgreSQL 16; see phase evidence folders)

### Security / dependency checks
Examples:
- dependency audit;
- static security scan;
- secret scan;
- permission tests.

**Project commands:**  
`pnpm build:web:licensed && pnpm check:bundle:licensed && pnpm build && pnpm check:bundle && pnpm audit --prod --audit-level high && test -z "$(git ls-files | grep -E '(^|/)(\.env|\.env\.(local|development|staging|production))$' || true)"`

## Design-first UI validation

For material user-facing UI, validation occurs in layers:

1. **Design validation:** confirm the screen map, user flows, required states, accessibility expectations, and responsive/adaptive behavior are coherent before shell implementation.
2. **Shell validation:** review navigation, layout, reusable components, themes, semantics, and fixture/stub-driven states before production wiring.
3. **Wiring tests:** as business logic, state, persistence, APIs, authentication/authorization, and integrations are connected, add the targeted tests required by the task's test objective.
4. **Objective stop:** once the defined automated evidence proves the acceptance criteria, stop expanding the agent-run suite unless risk/blast radius requires more.
5. **Manual QA:** inspect the real integrated experience on the relevant browser/device/platform path.
6. **Integrated validation:** confirm the finished flow matches both the written product contract and approved screen/design references.

A visually approved shell does not prove runtime correctness. A passing targeted test does not prove the implemented experience matches the approved design. Automated evidence and manual QA validate different parts of the contract.

Use synthetic or sanitized fixtures for screen/shell testing. Do not place real production secrets or sensitive customer data into fixtures, screenshots, golden files, previews, or test recordings.

## Pull-request quality gate

A PR should not be considered ready for human approval until:
- for material UI work, the approved design/shell and integrated implementation are traceable to the same requirements;
- the task's stated test objective is demonstrated;
- applicable manual QA is completed or explicitly marked pending with reason;
- required CI/status checks pass, or—under NudgeMyInvoice's development-time CI cost-conservation policy above—full exact-HEAD manual CI passes with all six required evidence fields recorded (while hosted CI is truthfully recorded as `NOT RUN`, never `PASS`), or the repository's documented CI-unavailable exception is satisfied for checks that genuinely could not execute;
- task acceptance criteria are demonstrated;
- new/changed behavior has appropriate tests;
- known failures are documented and explicitly accepted;
- security/privacy impact is reviewed;
- relevant docs are updated.

## Risk-based escalation

Broaden beyond the smallest targeted test set when changes involve:
- authentication/authorization;
- payments/billing;
- encryption/cryptography;
- migrations or destructive data changes;
- multi-tenant isolation;
- credentials/secrets;
- shared/core libraries with wide call sites;
- public API/contracts consumed by multiple clients;
- offline sync/persistence;
- app-store signing/release;
- production infrastructure;
- security/privacy controls.

Broader coverage should still have a reason. "Run everything" is not a substitute for identifying the risk being tested.

## Manual QA

Manual QA is the normal next gate after the task's automated test objective has been met, when the change has user-visible or environment-dependent behavior.

Manual QA should focus on what automation does not prove efficiently:
- visual correctness and interaction feel;
- browser/device/platform behavior;
- realistic navigation/workflow;
- accessibility behavior that needs human/device confirmation;
- integration behavior in the intended environment;
- regression symptoms around the changed path.

Do not use manual QA as an excuse to omit a cheap, deterministic regression test for logic that can be automated reliably.

If manual QA finds a defect:
1. reproduce it;
2. add the smallest meaningful automated regression test when practical;
3. fix the defect;
4. rerun the targeted automated evidence;
5. repeat the relevant manual QA path.

Document the matrix only when it adds value:

| Area | Required manual QA | Owner/result |
|---|---|---|
| TBD | | |

## Android signing validation

For Android release artifacts, follow `release/android-signing.md`.

At minimum:
- release CI must fail if required signing inputs are missing;
- production release builds must not fall back to debug signing;
- verify AAB signatures with `jarsigner`;
- verify APK signatures with `apksigner`;
- compare the public signing/upload certificate fingerprint with the expected release identity where practical;
- validate the exact release artifact, not only Gradle configuration.

## Release validation

Before release:
- validate the exact candidate artifact when possible;
- record version/build and source commit;
- for NudgeMyInvoice, require both exact-SHA GitHub-hosted `Project Baseline CI` and `Stack CI` runs to conclude `SUCCESS` **by default**, or satisfy and separately approve every condition of the **one-time, one-SHA manual release substitute** in `tasks/NMI-RENDER-RC-MANUAL-CI-EXCEPTION.md` after its independent review and owner-approved policy merge; otherwise release remains **BLOCKED**. Never call an unrun hosted check `PASS`;
- run the required release smoke/regression checks even when the final code delta was small;
- confirm migration/rollback readiness;
- complete platform/store-specific checks;
- complete the applicable release QA/manual validation gate.

## NudgeMyInvoice objective-based validation contract

Phase 0: run `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice`; verify greenfield pruning and paired CI workflow. The actual Github PR `Project baseline / Common validation` status is a separate gate. There is no TypeScript stack to test yet.

After scaffold, add a project-owned CI sibling job covering `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` using a locked dependency install; configure as required when real checks and stable emitted contexts exist. Include dependency and secret checks.

Required objective groups before demo:
- AI parser: fixture-based schema output, ambiguous/missing currency or due date, invalid numeric units, prompt injection rejection, sensible manual fallback.
- AI provider: deterministic tests use an injected fake `InvoiceModelClient`; they never require `OPENAI_API_KEY` or network. Real OpenAI smoke tests are separate, owner-triggered, and reported distinctly from fixture results.
- Currency math: supported fraction digits, exact totals, zero FX assumptions, no aggregation across currencies.
- Human approval: authorization, exact payload digest, expiry, replay/double click, simulated model/tool/cron bypass attempts. Unit level (in-memory store): wrong/missing trusted approver, changed payload, expired, consumed, failed consume, 25 concurrent attempts yield one success, grant mutation between read and consume cannot authorize. **Real PostgreSQL (NMI-P2-I1, `*.pg.test.ts`):** the `PostgresApprovalStore` is exercised over separate connections: 30 rounds of 10 simultaneous consumers each yield exactly one winner; 12 concurrent `requireApproval` calls yield one success; an uncommitted consumption blocks a rival (observed pending on the row lock) and a COMMIT makes the rival lose; a ROLLBACK leaves the grant consumable and the rival then wins; every field mismatch, expiry (database clock, caller `now` ignored), consumed grants and non-UUID ids cannot pass; a closed pool fails closed.
- Authentication (real PostgreSQL): anonymous 401 with `/health` open; login cookie flags; generic failures and throttling; expired, revoked, idle, malformed and forged sessions; logout invalidation; wrong/missing Origin or CSRF; spoofed actor claims; audit and log hygiene (no password, cookie, CSRF, hash, username or secret); provisioning idempotency, rotation and single-operator rule; no default user from migrations.
- Login races (NMI-P2-I1-C3, real PostgreSQL, deterministic): `packages/db/src/auth-store.pg.test.ts` forces orderings by holding the operator row lock on one connection and waiting, via `pg_stat_activity` lock-wait observation (no sleeps), until the competing rotation/issuance statements are blocked: rotation-first refuses the stale-credential session; issuance-first is revoked by the rotation; in-flight rotation commit/rollback; atomic rollback of a failed rotation (hash and version both restored); 40-round concurrent stress; the suite was run 20 times consecutively without failure. `apps/api/src/login-races.pg.test.ts` parks a login after password verification with a promise barrier, commits a rotation, and requires the old-password login to get no session; plus rotation stress, disabled-operator, and new-password success. Throttling: 30 simultaneous invalid logins admit exactly the budget and the rest get `429` with the correct `Retry-After` while the verification stub and database lookup counters prove rejected requests never reached them; window recovery; alternating usernames; distinct usernames; spoofed `X-Forwarded-For`; username normalization; bounded concurrent hashing (peak never above 4); refunds for capacity refusals and pre-hash errors; charges kept for post-hash errors; unit tests for the limiter and gate (`attempt-limiter.test.ts`, `work-gate.test.ts`).
- Invoice drafts and PayPal sandbox drafts (NMI-P2-I2). Real PostgreSQL (`invoice-draft-store.pg.test.ts`, `paypal-operation-store.pg.test.ts`, `invoice-drafts.pg.test.ts`, constraints): exact round trips of tax, percent and fixed discounts, fractional quantities, float-hostile amounts and USD/EUR/JPY kept separate; transactional rollback; strict rejection of client totals/unknown keys/floats; idempotent retries including 12 simultaneous saves; the fenced operation state machine with 20 simultaneous claimers; stale-lease takeover; one remote id per invoice; the route layer with a fake PayPal client whose "remote" total is computed independently (never a real PayPal response): 401/403 matrix, double click (11 rivals refused while the winner is parked inside the external call), unknown outcome then reconcile without a duplicate, cool-off, crash-after-create, definite rejection and retry, five kinds of mismatch, ambiguous remote lookup, intent-audit failure blocks the external call, feature flag off and client absent both fail closed. `packages/paypal` (fake HTTP transport only): the request allowlist (send/remind/cancel/payments/refunds/update/delete, live and look-alike hosts, redirects and traversal are refused before any I/O), OAuth caching/expiry/single flight/401 refresh, request shape and headers, every status class mapped to rejected vs unknown, secrets absent from errors, exact-mapping refusal table and request body mapping. Whole stack through the real adapter over a fake transport shows the only calls are OAuth, create and show.
- **Genuine provider evidence split (2026-10-26):** real PayPal Sandbox DRAFT OAuth/create/show **PASS** in the one-owner-authorized happy-path `NMI-P2-I2-SANDBOX-SMOKE-01` (exercised with one fictitious USD 5.00 line item, zero tax, and zero discount; AG's sanitized execution and local DB evidence; not an independent PayPal account query). Genuine provider search, reconciliation, timeout, and error paths are **NOT TESTED** against live PayPal Sandbox (verified with deterministic mock transports and PostgreSQL tests). No new create is authorized; the smoke guard's one-create budget is exhausted. **Real OpenAI parse remains NOT TESTED**, requiring separate owner authorization and credentials. All deterministic parser fixtures, fake PayPal transports, remote errors and reconciliation tests remain simulation, not provider acceptance.
- Hosted shape (NMI-RENDER-P1, offline). `hosting.test.ts` (config fail-closed, static/SPA fallback, traversal/symlink, headers, real server process host/PORT), `hosted-staging.pg.test.ts` (simulated TLS edge request-line capture with a negative control, `__Host-` cookie, CSRF/Origin, one-hop proxy trust with a negative control, provider-disabled zero fetch, 7 migrations, runtime-role privilege denials), POST search in `invoice-list.pg.test.ts`, and `design/evidence/NMI-RENDER-P1/run-hosted-browser-qa.mjs` (real Chrome, 26 checks). Real Render behavior is NOT TESTED.
- Tool dispatch: every privileged action name, unknown and prototype-like names are refused and no handler runs.
- PostgreSQL suites (`*.pg.test.ts`: constraints, approval store, authentication): `pnpm test:db` applies the committed migrations into a per-suite scratch schema of a disposable `nmi_test*` database. Constraint tests assert CHECK violations (SQLSTATE 23514); the audit trigger test asserts UPDATE/DELETE/TRUNCATE rejection. Without `TEST_DATABASE_URL` the suite is *skipped*, never reported as passed; during development PR manual CI it must be run locally against a disposable PostgreSQL 16 database (`TEST_DATABASE_URL=postgres://user@host:port/nmi_test pnpm test:db`), and on the final release candidate hosted `Stack CI` (`workflow_dispatch`) also runs it against a `postgres:16` service container with `REQUIRE_DB_TESTS=1`.
- PayPal follow-up (NOT TESTED): any future human-approved send flow, verified paid-status/webhook processing, provider-search recovery and partial/pending payment handling require separate implementation and acceptance; the completed draft-only smoke is not evidence for them.
- Webhooks: invalid/missing signature, replay window, duplicate event ID, out-of-order events, stored transactional idempotency.
- UI: loading/empty/error/overdue, keyboard/zoom/responsive, human approval details and declined state, AG Grid sort/filter/currency grouping.

Separate model fixtures, fake PayPal events and live sandbox smoke evidence. Mock/simulator events alone do NOT prove payment processing. An unexecuted hosted CI job remains `NOT RUN` (never `PASS`); development PRs require the full exact-HEAD manual CI record above, and final release candidates require hosted `workflow_dispatch` `SUCCESS` of both `Project Baseline CI` and `Stack CI` (blocking release if unrun or failing).

Before demo/release: clean clone/run instructions on separate machine, verified sandbox transaction, API secrets not in logs, screen-reader smoke, no disabled review gates, owner-approved Render deploy and <3-minute video.

## NMI-P2-I2 accepted real Sandbox smoke: `NMI-P2-I2-SANDBOX-SMOKE-01`

- **Acceptance date:** 2026-10-26; audited implementation `4982201918d0030234fdbabbc297375c02c01e5d`, owner-approved [PR #4](https://github.com/mrdzyn/nudgemyinvoice/pull/4) squash merge `07409bf32068362b9f5b711b64ef0399d588169e`.
- **Scope & payload:** Executed with **one fictitious USD 5.00 line item, zero tax, and zero discount**. Performed exactly one real Sandbox OAuth token request, exactly one draft create request, and one read-only show request.
- **AG provider telemetry:** `POST /v1/oauth2/token` → HTTP `200` (1); `POST /v2/invoicing/invoices` → HTTP `201` (1); `GET /v2/invoicing/invoices/INV2-U92W-76NX-3P2E-AGUZ` → HTTP `200` (1); remote `DRAFT`, USD `5.00`, due `2026-11-30`, deterministic invoice number and local reference matched. Local durable operation `state=created, attempts=1`. Zero send, reminder, cancel, refund or payment calls.
- **Security:** explicit single-create transport guard tested with fake HTTP 401 and restart; its real-smoke budget `1/1` exhausted and preserved locally. `PAYPAL_DRAFTS_ENABLED=false` restored. **Never rerun this completed create under the same authorization.**
- **Unverified provider variations and behaviors (mock-tested only):** Because the smoke payload was strictly minimal (single line, no tax, no discount), the following provider shapes and paths were **not** exercised against genuine PayPal Sandbox and are verified only via deterministic fake HTTP transports and PostgreSQL tests:
  - Invoice-level discount placement (`amount.breakdown.discount.invoice_discount`).
  - Line-item tax and discount mappings (percent and fixed amounts) and rounding sensitivity.
  - Alternative recipient name formats (`name.full_name` vs structured fields).
  - Alternative invoicer configurations (omitting `invoicer` vs explicit profile).
  - Alternative HTTP 201 response formats (`Prefer: return=representation` vs link-only body).
  - Search pagination, indexing lag, and duplicate invoice-number enforcement.
  - Ambiguous-outcome recovery, timeouts, network interruptions, and reconciliation flows.
- **Automated evidence:** AG reported 235 unit + 187 PostgreSQL 16 tests PASS; independent GitHub review verified hosted Baseline/Stack CI SUCCESS at audited head. Genuine OpenAI parser provider call **NOT TESTED**; search/reconciliation and other PayPal edge-case responses tested only via fakes.
- **Privacy:** provider tokens, buyer/merchant emails, credentials and operator passwords are never added to CI, repo, issues or evidence reports. A new real provider write needs new explicit owner consent.
