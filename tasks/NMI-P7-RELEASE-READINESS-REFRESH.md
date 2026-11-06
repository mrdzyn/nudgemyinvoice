# NMI-P7 — Integrated release-readiness refresh (no deployment)

**Status:** STARTED; P7-A and P7-B independently audited PASS; P7-C independently accepted (recovery evidence 116/116; P7-C-AUD-01 closed); **P7-D implemented (integrated verification, gate ledger, handoff `NMI-P7-D-01`), awaiting independent review**. Implementation authorized for safe local and repository-only work. Draft PR on `phase-7/nmi-release-readiness`, based on verified `main@7c56b078eb997744fd1d9bdb7668114f490171c7` (PR #44 merged). **No release SHA chosen; no hosting or live provider authorization.**
**Owner direction:** "start p7" (2026-11-06). This authorizes implementation, disposable/offline testing, documentation, a Draft PR, and independent review for the bounded items below. It does **not** authorize merge, release, hosting spend, resources, provider calls, public judge access, or publication.
**UI design gate:** low-risk corrections within the already-approved P6 D1–D7 review/confirmation screens; no new UI layout or product behavior. Preserve screen-reader semantics, 390 px behavior and ≥44 px touch targets.

## Objective

Reach an auditable *release-readiness candidate*, not a deployed release. Close the two post-merge P6 Codex P2 UX findings, explicitly enforce the default-off drafting flag in the P4 provider-disabled preflight, and prove PostgreSQL 16 backup/restore for all nine migrations including P6 `0008` and its operator-scoped nudges. Reconcile evidence/docs and list **all remaining owner-only gates** truthfully.

## P7-A — Nudge queue / Nudgey UX defects

**Sources:** [Codex queue-focus P2](https://github.com/mrdzyn/nudgemyinvoice/pull/43#discussion_r4482058721) and [Codex stale-pending P2](https://github.com/mrdzyn/nudgemyinvoice/pull/43#discussion_r4482058734). These are *reported findings*, not pre-fix verified test results.

1. `apps/web/src/nudges/NudgeQueueScreen.tsx`: a fresh `open-nudges` navigation request must switch an **already-mounted** queue to its requested tab and nudge ID, not just initialize state on first mount. `apps/web/src/demo/appState.ts` already increments `seedKey`; synchronize correctly with a new focus request or use a targeted remount preserving accessibility and cleanup. Do not wipe a user's ordinary manual queue selection without a new navigation request.
2. `apps/web/src/nudgey/NudgeDraftFlow.tsx`: `pending-exists` and the replacement reference must belong to the *same invoice* that produced them. After invoice A's pending warning, choosing B must clear or invalidate A's pending reference and reenter the normal explicit-confirm state. `Replace` and `Open existing` must never use A's pending ID for B, even with rapid clicks/async completions. No model call without explicit confirmation; preserve received-401 session expiration and abort/disposal rules.
3. Deterministic React tests for repeated already-mounted navigation, Pending/Approved/History, switching A→B→A with pending warning, stale response/abort, and no unnecessary nudge generations or wrong-invoice operations. Extend synthetic browser QA only where needed; label results accurately.
**In-scope files:** relevant queue/Nudgey React screens, navigation glue if required, targeted tests and P6 QA harness/evidence. No new UI patterns or dependencies.

## P7-B — Provider-disabled preflight fail-closed flag

**Sources:** `apps/api/src/release-preflight.ts`, `apps/api/src/release-preflight.test.ts`, `apps/api/src/config.ts`.

1. Enforce `NUDGE_AI_DRAFTING_ENABLED` by **name**: absent or literal `false` is acceptable, literal `true` or any other value fails closed, with a stable descriptive rule ID. This is in addition to, never instead of, forbidding all OpenAI keys/models. Continue enforcing `PAYPAL_DRAFTS_ENABLED=false`, `PAYPAL_ENV=sandbox`, and the existing P5 licensed Studio environment rules.
2. Add positive/negative tests for missing, false, true, malformed or whitespace values and for parser credentials independently; never print any secret or environment value in a finding, log, exception or artifact. Assert `loadConfig` and preflight agree for the accepted provider-disabled env.
3. Keep server runtime configuration defaults off; **do not enable live model inference** or weaken pre-existing forbidden-variable rules.
**In-scope files:** preflight implementation/tests and the appropriate environment-matrix documentation; no provider client changes.

## P7-C — Migration 0008 disaster-recovery proof

**Sources:** historical `design/evidence/NMI-RENDER-P4/run-backup-restore-drill.mjs`, actual `packages/db/migrations/0008_mushy_zarek.sql`, `packages/db/ops/runtime-role.sql`.

1. Create a **new versioned P7 runner and evidence**; keep P4's 26/26 result and historical harness unmodified. Use a private, disposable PostgreSQL **16** cluster and an owner role that is **not** a superuser. Apply migrations `0000`–`0008` and runtime grants. The runner must fail closed when a migration, grant, seed or backup/restore step fails.
2. Seed synthetic operators, invoices and at least representative `invoice_nudges` rows with valid facts/status/version/ownership and realistic review-state variations; no real names, credentials, customer records, or external requests. Assert one-pending-per-invoice constraints and scoped ownership.
3. Take a private `pg_dump -Fc` and restore into a fresh database as the non-superuser owner. Verify table and nudge **row/content** fingerprints and schema/constraints/index/trigger fingerprints are identical; relevant runtime-role grants persist. Check allowed nudge reads/inserts/approved-column updates and denial of nudge DELETE, owner/AI-original/facts mutation, schema creation, and existing audit/credential prohibitions. Include a corrupted/truncated-dump negative control. Confirm PostgreSQL shutdown **before** cleaning its data directory; never touch an existing local/user database.
4. Record executable environment, exact source SHA, command, results/counts, and limitations. Prove only *local PG16 recovery*, not Render-managed recovery. No additional migrations or schema changes unless a genuine defect is independently escalated.
**In-scope files:** new P7 recovery runner and evidence, related test-only fixture scripts, narrowly necessary documentation.

## P7-D — Release-candidate verification and documentation

1. On the integrated P7 HEAD, run minimal targeted UI/preflight tests, local disposable PG16 recovery drill, required `pnpm validate`/`pnpm test:db` where mandated, and **both hosted PR workflows at exact final HEAD**. Build and scan Community and licensed web variants without a real licence value; no credential-bearing artifacts. Record actual browser/keyboard/390px/light-dark/manual QA separately; do not imply Safari, Firefox, device, screen-reader, 400% zoom or real reverse-proxy proof unless actually performed.
2. Update `docs/NMI-RENDER-P4-RELEASE-READINESS.md`, `docs/NMI-P5-LICENSED-STUDIO-RELEASE.md`, `docs/STATUS.md`, and a compact unique `docs/HANDOFFS.md` entry. Keep original P4 evidence historical and identify the fresh P7 restore evidence. Record Codex P2 disposition only after matching tests; never imply a real-provider run. No fabricated "production ready" or "hosted PASS" label.
3. Reconcile the current gate ledger: P4 **G2/G3 closed**, while **G1** live Billing/credit/≤$25 and teardown/retention, **G4** owner-selected full 40-char release SHA and controlled release branch, **G5** Hobby request-log residual-risk acceptance, **G6** separate resource/first-deploy/judge access approval, **G7** vendor AG Studio download/use rights, and **G8** provider-disabled configuration remain applicable. Provider **Gates A/B/C NOT AUTHORIZED**. Preserve live cookie/proxy, browsers, screen-reader, zoom, charge and Devpost/video checks as unperformed until proven. Do not select a release SHA.
4. Submit the finished changes in **this same Draft PR**, with independent exact-HEAD code/security/evidence audit; only the owner may approve squash merge. Do not merge this P7 PR or perform a release.

## Out of scope / strict stops

- Render API, paid resources, billing/checkout, release branch creation, deployment, production DB, real judge URL or sharing, Devpost/video publication.
- Live PayPal Sandbox operations, OpenAI inference, outbound messages/emails/SMS, scheduler/webhook or payment dispatch; leave `NUDGE_AI_DRAFTING_ENABLED=false` and `PAYPAL_DRAFTS_ENABLED=false` for a hosted demo.
- Secrets, production customer data, real licence values in code/tests/logs/artifacts; vendor licensing legal conclusions.
- Changes to P5 visual architecture/CSP, authorization model, DB schema, migration `0008` or provider clients without independent escalation.
- Unrelated project cleanup, package updates, refactors, policy/CI weakening, merge or release.

## Verification and handoff

Follow `AGENTS.md`, `docs/TESTING.md` and `docs/SECURITY.md`. Commit in small bounded slices (P7-A/B/C/D) on the **same** Draft branch, preserving each slice's test objective. Each successful implementation handoff reports exact HEAD, files changed, test evidence (local vs hosted), source/audit links, known limitations and next slice. Required hosted CI is checked after the last code/evidence SHA. If a blocking safety or requirements conflict arises, stop and document it; never fake a PASS. Any production action requires a new, narrowly scoped owner authorization.
