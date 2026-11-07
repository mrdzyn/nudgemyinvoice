# NMI-OPENAI-RENDER-RC-01 — OpenAI judge release preparation

**State:** DRAFT PROPOSAL; NOT OPERATIVE. No deployment, env change, provider call, or URL authorization.
**Repository base:** `main@b4515f1f979d5e6acda590c078572450347d249b` (PR #57 squash-merged; squash tree identical to independently audited head `78d9a2308e081b34c3f032cbfb30b8b517326a80`; audit PASS WITH FINDINGS, SEC-01 fixed).
**Tracker:** issue #58. **Deadline:** hackathon 2026-11-12 12:00 PST (2026-11-13 04:00 Manila).
**Branch:** `feat/nmi-openai-render-rc-01` (this task). No protected release branch is created or moved here.

## Objective

Prepare independently reviewable release engineering (policy + scripts + packets) for one new immutable OpenAI judge candidate, without expanding product scope or mutating anything live.

## Bounded change contract

**Permitted:** this task file; `tasks/NMI-OPENAI-RC-01-MANUAL-CI-EXCEPTION.md`; `docs/NMI-OPENAI-JUDGE-ACTIVATION-PACKET.md`; `apps/api/src/release-preflight.ts` + `apps/api/src/cli/release-preflight.ts` + `apps/api/src/release-preflight.test.ts` (allowlist only); `docs/RELEASE.md`, `docs/TESTING.md`, `docs/STATUS.md` release-governance paragraphs; append-only `docs/HANDOFFS.md`.

**Forbidden:** app behavior, schema/journal/migrations, `pnpm-lock.yaml`, workflows, testing scripts beyond the preflight allowlist, security mechanisms, branch force-push/deletion, creating/moving/protecting any `release/*` branch, Render create/deploy/billing, secret collection or storage in Git, live environment changes, public URL, PayPal/OpenAI calls, provider enabling, license publication, Devpost publication, claiming hosted CI ran, merging, or closing G1/G4/G5/G6/G7/G8 by declaration. PR #55's one-time exception is **not inherited** and never transfers to the new candidate.

**UI design gate:** Not applicable — release-governance documentation plus a narrow preflight allowlist. **Test objective:** prove the preflight still verifies the original release path unchanged, verifies the proposed candidate path only when explicitly named and allowlisted, rejects every other branch name, and never echoes operator input.

## 1. New release candidate policy

- Proposed second immutable candidate branch: `release/nmi-openai-judges-2026`. It does **not** exist on the remote and must **not** be created, moved or protected until the owner selects and approves the final candidate SHA (a reviewed commit on `main`).
- `checkReleaseSource` now takes `releaseBranch` and enforces a strict two-entry allowlist (`RELEASE_BRANCHES`); `src.release-branch-allowlisted` is a new blocking finding. CLI: `source --expect <sha> [--remote origin] [--release-branch <name>]`, defaulting to the original branch. Both paths stay independently verifiable; a missing branch, moved tip, non-ancestor SHA, dirty tree or lockfile drift fails closed exactly as before.
- Preserved: original `release/nmi-render-judges-2026@abfbbfc3153cb3b4238ebf201daca830fed2e8f9` remains pinned, protected and independently verifiable as the rollback baseline. Never rebase, move, delete or unprotect it.

## 2. Render deployment compatibility (proposed procedure, owner approval required per step)

Grounded in `docs/NMI-RENDER-P1-RUNBOOK.md` (no Blueprint/`render.yaml`, Auto-Deploy Off, one instance, dashboard "Deploy a specific commit", `/health` probe, forward-only migrations, redeploy-previous-SHA rollback). Verified for this task: `abfbbfc...b4515f1` carries **no migration delta** (`packages/db/migrations` identical), so the candidate is schema-compatible with the live database; no migration may run at boot or during judging.

1. Owner creates `release/nmi-openai-judges-2026` at the approved SHA and protects it (non-fast-forward, no deletion); agent verifies with `release-preflight source --expect <SHA> --release-branch release/nmi-openai-judges-2026` → `RESULT: PASS` on a clean checkout.
2. Deploy path (Render-documented; dashboard feasibility still to be confirmed): Render's vendor docs describe **"Deploy a specific commit"** deploying an exact SHA from the linked repository without changing its connected branch; Auto-Deploy stays OFF throughout. Before submission, confirm in the service dashboard that the pinned candidate SHA is selectable; **fail closed if the dashboard rejects it** — do not assume a generic `trigger_deploy` deploys that SHA, switch the connected branch, or add a second service (any of those needs a separate owner decision). At deploy time, still verify via `release-preflight source --expect <SHA> --release-branch release/nmi-openai-judges-2026` → `RESULT: PASS` immediately before the manual deploy, and run the post-deploy checklist in step 3.
3. If path confirmed: set the limited-mode environment matrix exactly per the activation packet (§3) in the Render secret store (owner only), keep `WEB_ORIGIN` unchanged (same service URL), redeploy the pinned SHA manually, then run the post-deploy checklist: `/health` (`aiConfigured` true only after key present — expected shape documented), login/session/CSRF/proxy-throttling, licensed Studio dashboard, provider-disabled PayPal refusal, log redaction, single-operator access. Any failure: suspend, report, do not share.
4. Rollback (always available): dashboard redeploy of `abfbbfc...`, restore the provider-disabled environment matrix, re-verify `/health` + login. Database needs no rollback (no schema change); data restore follows the P7 drill only if data loss is observed.

## 3. OpenAI activation packet

Exact environment matrix and approval checklist live in `docs/NMI-OPENAI-JUDGE-ACTIVATION-PACKET.md` (owner-approved scope; remaining gates still required). Summary:

- `NMI_JUDGE_AI_MODE=limited`, `OPENAI_MODEL=gpt-6-luna`, `OPENAI_MAX_OUTPUT_TOKENS=4096`, `NUDGE_AI_DRAFTING_ENABLED=true`, server-side `OPENAI_API_KEY` (Render secret store only, never Git), `PAYPAL_DRAFTS_ENABLED=false`, no PayPal credentials.
- Required before any live call: owner-evidenced `gpt-6-luna` entitlement and enforced $5 monthly spend limit (no additional cumulative call cap per owner decision), advance sub-$5 alert, provider-side usage monitoring/kill-switch with provider-use sunset end of Dec 15, 2026, synthetic-only inputs, max-output limits, usage/egress visibility, emergency disablement (remove mode/key → redeploy pinned SHA → verify `aiConfigured:false` + preflight env PASS), and credential rotation/revocation plan. In-memory 3 requests/10 min/concurrency 1 is **not** a financial cap.
- Gate A `R1-A-20261030-01` permission stays consumed; no live call occurs under this task.

## 4. Manual release CI for the new candidate

Hosted GitHub Actions remain unavailable (billing block until December; default gate stays two hosted `workflow_dispatch` SUCCESS runs). The new candidate needs its own separately audited, exact-SHA, owner-approved manual alternative: `tasks/NMI-OPENAI-RC-01-MANUAL-CI-EXCEPTION.md` (DRAFT, NOT OPERATIVE). Full exact-HEAD manual CI for **this** policy branch runs under Node 22 with disposable PostgreSQL 16; macOS↔Ubuntu differences are recorded, never waived.

## 5. Documentation continuity

`docs/STATUS.md` current-status section names this task and branch only (no stale release paragraphs); `docs/HANDOFFS.md` append-only (this task's handoff `NMI-OPENAI-RENDER-RC-01`); PR #57's merge record, exact SHA, audit, Gate A evidence and the live Render state are preserved in place, not rewritten.

## Execution order

1. Targeted preflight tests → implement allowlist (this branch).
2. Docs/packets → commit → push → open Draft PR.
3. Full exact-HEAD manual CI (Node 22, disposable PG16) → post evidence.
4. Independent code/security/policy review → owner decisions (candidate SHA, branch creation, manual-CI acceptance, activation, deploy, URL) each separately.
