# NMI-GATE-01-COMBINED-BRANCH — preflight allowlist for the combined release branch

**State:** DRAFT IMPLEMENTATION; release-engineering only. No merge, deploy, env change, credential, provider call, branch move, or URL share.
**Repository base:** `main@ceaa96795562ebcdca0dec0479168b7530db4259` (PR #61 squash-merged; combined mode merged and audited PASS).
**Tracker:** issue #58 P0 FAST-TRACK (GATE-01).
**Branch:** `feat/nmi-gate01-combined-branch`.

## Objective

Execute GATE-01 in one bounded PR: extend the release source-preflight strict allowlist to support the proposed third immutable branch `release/nmi-combined-judges-2026` while retaining both existing protected branches exactly as they are. Stop at the owner merge gate.

## Bounded change contract

**Permitted:** this task file; `apps/api/src/release-preflight.ts` (allowlist only); `apps/api/src/release-preflight.test.ts` (positive + negative branch tests); `docs/STATUS.md` current-state lines; append-only `docs/HANDOFFS.md`.

**Forbidden:** app code, schema/journal/migrations, `pnpm-lock.yaml`, workflows, other testing scripts, security mechanisms, branch force-push/deletion, creating/moving/protecting any `release/*` branch, Render create/deploy/billing, env changes, secret collection or storage in Git, public URL, PayPal/OpenAI calls, provider enabling, license publication, Devpost publication, claiming hosted CI ran, merging, or closing any gate by declaration.

**UI design gate:** Not applicable — release-engineering only. **Test objective:** prove the preflight accepts the proposed combined branch name only when allowlisted with exact SHA + main ancestry + remote-tip equality, keeps both existing paths independently verifiable, rejects every other name (including typos and ref paths) without echo, and changes no provider behavior.

## Change

- `COMBINED_RELEASE_BRANCH = "release/nmi-combined-judges-2026"` added; `RELEASE_BRANCHES` is now exactly the three reviewed branches; `isReleaseBranch` covers all three; the allowlisted-branch finding names all three. The proposed branch must **not** be created, moved or protected until the owner approves the final candidate SHA.
- Tests: allowlist exact-triple assertion; combined-branch independent verification (pure: exact SHA pass, moved-tip fail); two new negative cases (prefix typo, ref path); CLI test proving missing combined branch fails the tip check (not the allowlist), owner-created branch at the audited SHA passes, and the default path still passes — each path independently verifiable. No provider-behavior change.

## Explicitly not done here (separate owner steps after merge)

Creating/protecting `release/nmi-combined-judges-2026` at the exact new merged `main` SHA; candidate-specific source preflight; release-equivalent manual CI with new exact-SHA owner acceptance (existing OpenAI-only acceptance is nontransferable); independent evidence audit; Render deploy action; live QA; URL sharing. One second Render service is never authorized by this task.

## Execution order

1. Allowlist + tests (this branch) → targeted preflight tests.
2. Docs (task, STATUS, handoff) → commit → push → open one Draft PR.
3. Full exact-HEAD manual CI (Node 22, disposable PG16) → evidence → independent audit → STOP at merge gate.
