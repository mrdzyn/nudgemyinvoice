# NMI-DEMO-R0 — Hackathon submission readiness and judge runbook

- **State:** IMPLEMENTED (documentation, evidence and test-only tooling) at `92da0ddb293edce68c6081317dc3f4629cc8c357`; READY FOR INDEPENDENT GPT-6 AUDIT. Not self-certified, not merged.
- **Base:** `main` at `146252f7a2157966af403e4df59aa8fa83753054` (C5-P1, PR #15, independently audited and squash-merged by the owner).
- **Branch:** `docs/nmi-demo-r0-submission-readiness`. Draft PR.
- **Scope:** NO new product features; NO real provider calls; NO deployment; NO Devpost or YouTube publication or submission; no payment/provider budget reset.
- **UI design gate:** Not applicable (no UI change).

## Objective

Produce an accurate, reproducible, independently reviewable submission candidate: reconciled documentation, a judge runbook proven from a clean clone, a final end-to-end check of merged `main`, a deployment decision, a real-provider acceptance plan (not executed), demo materials and a release-blocker register.

## Deliverables

| Deliverable | File |
| --- | --- |
| README and STATUS reconciliation (stale "placeholder/pending" claims removed; implemented / provider-verified / not-implemented separated) | `README.md`, `docs/STATUS.md` |
| Judge runbook (clean-clone tested; two modes) | `docs/NMI-DEMO-JUDGE-RUNBOOK.md` |
| Deployment decision (local vs hosted; recommends local) | `docs/NMI-DEMO-DEPLOYMENT-DECISION.md` |
| Real-provider acceptance plan with separate owner gates (NOT executed) | `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` |
| Video script (2:40, live vs simulated marked) | `docs/NMI-DEMO-VIDEO-SCRIPT.md` |
| Devpost draft (claims marked verified / simulated / not verified) | `docs/NMI-DEMO-DEVPOST-DRAFT.md` |
| Submission checklist, release-blocker register, security/privacy confirmations | `docs/NMI-DEMO-SUBMISSION-CHECKLIST.md` |
| SIMULATED evaluation launcher (test-only) and final end-to-end journey | `design/evidence/NMI-DEMO-R0/` |
| Guard test that the fakes cannot reach production | `apps/api/src/no-fake-provider-switch.test.ts` |

## Findings and decisions

- **Official rules:** `https://paypalaihackathon.devpost.com/rules` returned HTTP 403 to automated fetch, so the requirements could not be independently verified. They are taken from the owner's brief and `docs/HACKATHON-PLAN.md`; the owner must verify them on the live page. Nothing was submitted.
- **Evaluation mode suitability:** the existing fake-provider harness was assessed as suitable for a clearly labelled, runnable evaluation mode. A new, separate, test-only launcher (`simulated-eval-server.ts`, outside `apps/` and `packages/`) combines a regex stand-in parser and the in-memory PayPal fake behind the REAL routes/services. It requires `NMI_SIMULATED_EVAL=1`, refuses `NODE_ENV=production`, refuses any non-Sandbox PayPal host, never constructs the real OpenAI/PayPal clients, and prints a SIMULATED banner. The production entrypoint (`apps/api/src/server.ts`) has no switch and a unit test asserts no production file references the launcher, the fake PayPal helper or any fake-provider environment variable. **Limitation:** the web UI shows no in-app SIMULATED badge (adding one is a product change, left for owner decision).
- **Recommendation:** Option A (reproducible local setup + simulated mode + real-interface video). No hosting is assumed necessary; Option B prerequisites are listed and nothing was provisioned.
- **Historical journeys:** C2, C3 and C4 each had only stale-copy assertions failing against merged `main` (the approved shell/Review/saved-page wording, the real dashboard title and the read-only list route). Those 3, 5 and 2 assertions were updated to the approved current behaviour; no behavioural assertion was removed or loosened (C2 88/88, C3 116/116, C4 79/79 afterwards; C5-P1 passed unchanged at 102/102). The regenerated evidence files in those directories are R0 reruns on `main`.
- **Real-provider status unchanged:** OpenAI never verified; PayPal verified only by the 2026-10-26 backend one-create smoke; no complete real-provider browser journey.

## Evidence (implementation SHA `92da0ddb293edce68c6081317dc3f4629cc8c357`)

- **Clean-clone runbook proof:** `git clone` of the branch into an empty directory; `pnpm install --frozen-lockfile`; throw-away PostgreSQL 16.15 via `initdb`; the seven migrations applied by the documented loop (8 tables); operator provisioned with a random password; API started (`/health` ok, `aiConfigured:false`); web dev server up; login through the web-origin proxy returned 200 with an HttpOnly cookie; parse with no provider returned `unavailable/manual_entry`; PayPal draft returned `paypal_disabled`; then `pnpm --filter @nmi/web build` and `run-e2e-journey.mjs` from the clean clone: **32/32**; only the processes started for the test were stopped (identified by port and working directory) and the database removed. Mode A launch command also verified (refuses without opt-in and in production; starts with the banner). Docker option NOT exercised (no Docker on the machine).
- **R0 end-to-end (SIMULATED providers), 32/32:** login -> natural-language proposal (real parse route, regex parser) -> human review with an operator edit -> save (one POST 201, row in PostgreSQL with the edited due date) -> dashboard -> saved invoice (server total $540.00) -> confirmation dialog -> Sandbox DRAFT (fake provider, verified by the real service) -> durable GET refresh -> dashboard "PayPal draft created"; plus a EUR invoice through the clarification loop (separate USD/EUR cards, exact 599.97), exactly one fake create, three parse calls, only allowed routes, no foreign host, empty storage, clean API log, sign-out lock.
- **Gates:** lint, format:check, typecheck, build, bundle scan, profile validator clean. `pnpm test` (no DB): 814 passed, 260 skipped (PostgreSQL-only; reported as skipped). `pnpm test:db` (real PostgreSQL 16.15): 12 files, 277 passed. Hosted CI: see the PR.
- **Security/privacy scans:** see `docs/NMI-DEMO-SUBMISSION-CHECKLIST.md` section D.

## Open blockers and owner decisions needed before R1

See the register in `docs/NMI-DEMO-SUBMISSION-CHECKLIST.md` (16 items). Owner decisions: (1) verify the live Devpost rules; (2) A-only vs A+B deployment; (3) authorize or decline real-provider Gates A and B (separately); (4) approve or decline a visible SIMULATED badge; (5) OpenAI model name for the submission text; (6) sponsor-tool claims (APIMatic usage) to list; (7) who records/uploads the video and when.
