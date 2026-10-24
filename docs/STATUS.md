# Project Status

> Operational state only. Historical merge details and rationale remain in reviewed PRs and handoffs.

## Project

- **Name:** AI-Native Project Template
- **Current phase:** P8.0 M3 — generated/brownfield CI integration
- **Status:** Review — M3 implementation complete; ready for independent exact-head audit
- **Primary branch:** `main`
- **Main SHA at task start:** `2d167b52bff2cce9506315b8615e53e84c62c642`
- **Working branch:** `phase/p8-m3-generated-brownfield-ci`
- **PR:** #24 — Draft until hosted CI is confirmed; then ready for independent review
- **Active task:** `tasks/P8.0-m3-generated-brownfield-integration.md`
- **Active handoff:** P8.0-C17

## Completed

- Phases 0–7, P8.0 M1/M2, and E1/E2a/E2b have merged.
- E2b PR #23 was independently re-audited PASS and owner-approved for squash merge; `main` contains merge commit `2d167b52bff2cce9506315b8615e53e84c62c642`.
- Live master `Protect Main` ruleset `23809419` requires **only** `Project baseline / Common validation`; `Template Integrity` is manual-only.
- Owner chose Option B: Claude independent exact-head review and explicit human merge approval are process-only, not enforced by required GitHub approving reviews.
- M3 documentation fixes in current branch: retain paired CI caller/reusable workflow and project validator in generated children; remove the three master-only files; reconcile stronger brownfield CI and post-merge release consumers; align old two-workflow descriptions.

## Current objective / in-progress work

- Implemented in `f91bf763151b6b3c0022098ff797ff9cf82ef505`: `validate_ci_caller_wiring()` in `scripts/validate_project_profile.py` — if `.github/workflows/ci.yml` has a job-level `jobs.<job_id>.uses: ./.github/workflows/common-validation.yml`, that workflow must exist; otherwise fail closed. No ci.yml, or a ci.yml that does not call the template, is unaffected (brownfield).
- Extended the existing `scripts/test_validate_project_profile.py` (no new runner): unit cases plus a physically pruned child fixture built from the repo's real caller/callee/validator, asserting guarded master-only steps, child CLI success, missing-callee failure, brownfield (custom CI / no ci.yml) success, and leftover master workflow still rejected.
- Codex P2 remediation (handoff P8.0-C17): caller detection replaced the line regex with stdlib `calls_common_validation()`, which ignores comments, block scalars (`run: |`) and step-level `uses:`; regression tests added; task file marks implemented work completed.
- Local evidence: the three minimum scripts pass; a mutation (wiring check disabled) makes the self-test fail.
- Independent exact-head audit and separate owner merge approval are pending.

## Next actions

1. Confirm the single hosted Project Baseline CI run passes at the final PR head (master inventory and self-test steps included).
2. Genuinely independent exact-head audit using `P8.0-C17`; then fresh owner merge approval. Do not merge or deploy automatically.
3. M4 final integration/least-privilege audit; optional manual Template Integrity dispatch only if separately owner-approved.

## Known limitations

- Master child-fixture unit tests cannot prove a real child repository's GitHub Actions workflow syntax; real child PR verification is still required for end-to-end proof.
- P5.1 testing-budget observability is optional/deferred. No new release/provider automation is planned.
