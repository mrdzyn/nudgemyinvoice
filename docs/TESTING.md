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

### Project note: manual CI while Actions are unavailable
The owner reports hosted GitHub Actions may be unavailable until November 2026. Every new commit then needs the full manual validation set listed in `docs/STATUS.md`, with exact commands, counts and SHA recorded in the PR or handoff. Hosted checks that did not run are NOT PASS, and a previous PASS never carries over to new SHAs. A real failure is never excused by this exception.

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
`[ADD COMMANDS]`

### Unit tests
Validate isolated business logic and edge cases.

**Project commands:**  
`[ADD COMMANDS]`

### Integration tests
Validate boundaries such as database, filesystem, network API, authentication, or platform adapters.

**Project commands:**  
`[ADD COMMANDS]`

### End-to-end / acceptance tests
Validate critical user journeys or release flows.

**Project commands:**  
`[ADD COMMANDS]`

### Security / dependency checks
Examples:
- dependency audit;
- static security scan;
- secret scan;
- permission tests.

**Project commands:**  
`[ADD COMMANDS]`

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
- required CI/status checks pass, or the repository's documented CI-unavailable exception is satisfied for checks that genuinely could not execute;
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
- Tool dispatch: every privileged action name, unknown and prototype-like names are refused and no handler runs.
- PostgreSQL suites (`*.pg.test.ts`: constraints, approval store, authentication): `pnpm test:db` applies the committed migrations into a per-suite scratch schema of a disposable `nmi_test*` database. Constraint tests assert CHECK violations (SQLSTATE 23514); the audit trigger test asserts UPDATE/DELETE/TRUNCATE rejection. Without `TEST_DATABASE_URL` the suite is *skipped*, never reported as passed; hosted Stack CI runs it against a `postgres:16` service container with `REQUIRE_DB_TESTS=1`. Locally: start any disposable Postgres, create a database named `nmi_test`, then `TEST_DATABASE_URL=postgres://user@host:port/nmi_test pnpm test:db`.
- PayPal: real sandbox OAuth/draft/send API smoke and verified invoice payment event; normalize status and handle partial/pending correctly.
- Webhooks: invalid/missing signature, replay window, duplicate event ID, out-of-order events, stored transactional idempotency.
- UI: loading/empty/error/overdue, keyboard/zoom/responsive, human approval details and declined state, AG Grid sort/filter/currency grouping.

Separate model fixtures, fake PayPal events and live sandbox smoke evidence. Mock/simulator events alone do NOT prove payment processing. An unexecuted hosted CI job remains NOT PASS; any documented runner-credit exception must meet `docs/REPOSITORY-SETUP.md` exact-HEAD human procedure and be explicitly scoped to this repo/PR.

Before demo/release: clean clone/run instructions on separate machine, verified sandbox transaction, API secrets not in logs, screen-reader smoke, no disabled review gates, owner-approved Render deploy and <3-minute video.
