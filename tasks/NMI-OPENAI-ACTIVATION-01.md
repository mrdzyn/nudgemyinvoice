# NMI-OPENAI-ACTIVATION-01 — Final activation-packet reconciliation

**State:** DRAFT; governance-only. No merge, deploy, env change, credential access, provider call, branch move, or URL share.
**Repository base:** `main@82996c4a3c582ef14c7a54051eb3fbdbf107c79d` (PR #59 squash-merged).
**Tracker:** issue #58. **Branch:** `feat/nmi-openai-activation-01`.

## Granted owner approvals (recorded, not requested again)

- OpenAI-enabled Render deployment, subject to remaining technical and security gates.
- Protected release candidate `82996c4a3c582ef14c7a54051eb3fbdbf107c79d` on `release/nmi-openai-judges-2026`.
- Independently audited one-time manual release-CI substitution, including the macOS/Ubuntu gap.
- No additional cumulative OpenAI API-call cap.
- Retaining the enforced $5 monthly OpenAI project spending limit (`gpt-6-luna` allowlisted, screenshot-evidenced).

## Bounded change contract

**Permitted:** this task file; `docs/NMI-OPENAI-JUDGE-ACTIVATION-PACKET.md` (reconciliation only); `tasks/NMI-OPENAI-RENDER-RC-01.md` §2 (specific-commit deploy note) and §3 (call-cap consistency with the revised packet); `docs/STATUS.md` current-state lines; append-only `docs/HANDOFFS.md`.

**Forbidden:** app code, schema/journal/migrations, `pnpm-lock.yaml`, workflows, testing scripts, security mechanisms, branch force-push/deletion, creating/moving/protecting any `release/*` branch, Render create/deploy/billing, env changes, secret collection or storage in Git, public URL, PayPal/OpenAI calls, provider enabling, license publication, Devpost publication, claiming hosted CI ran, merging, or closing any gate by declaration.

**UI design gate:** Not applicable — governance documentation only. **Test objective:** prove the reconciled documents name the same granted approvals, require the alert/monitoring/kill-switch/sunset commitments, keep every remaining gate explicit, and cannot be misread as deployment or provider-call authorization.

## Changes

1. Activation packet: cumulative call-cap mandate removed (owner decision recorded); per-operator rate limits, concurrency 1, SDK retries 0, auth, synthetic-only inputs and PayPal-disabled state preserved as operative bounds; $5 enforced monthly limit + `gpt-6-luna` allowlisting recorded as owner-evidenced; advance sub-$5 alert, usage monitoring, kill switch, and provider-use sunset end of Dec 15, 2026 (unless extended) required.
2. Task §2: Render **"Deploy a specific commit"** deploys the approved exact SHA from the linked repository without changing its connected branch; Auto-Deploy stays OFF.
3. STATUS/handoff reconciled with the protected candidate, accepted substitution, and Live rollback deployment.

## Execution order

1. Docs edits → doc checks → commit → push → open Draft PR.
2. Full exact-HEAD manual CI (Node 22, disposable PG16) → post evidence.
3. Independent exact-HEAD audit → deploy action / live QA / URL decisions (each separate owner action).
