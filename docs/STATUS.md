# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-DEMO-R0 — hackathon submission readiness and judge runbook (documentation, evidence and test-only tooling; NO product change). **Implemented; audit remediated twice, documentation only (2 MINOR findings: precise privacy wording and executable judge instructions; then 1 residual MINOR: the migration snippet now preserves a nonzero exit status and the README never provisions after a failed migration); awaiting independent GPT-6 re-audit.** Nothing is submitted, published, deployed or provider-tested.
- **Status:** The product integration is complete and merged: C1 `32d9132`, C2 `ddffc11`, C3 `988a8f9`, C4 `568faa0`, C5-P0 `7e9c1c9`, and C5-P1 (real PayPal Sandbox DRAFT UI, PR #15, independently audited, owner-approved squash merge) `146252f7a2157966af403e4df59aa8fa83753054`. R0 reconciles the README (the dashboard is no longer described as a placeholder), adds a clean-clone-tested judge runbook with a clearly labelled SIMULATED evaluation mode, a deployment decision (recommends reproducible local setup), a real-provider acceptance plan (NOT executed), demo materials and a release-blocker register. Real-provider status is unchanged: only the 2026-10-26 backend PayPal one-create smoke was real; OpenAI and any complete real-provider browser journey are NOT verified.
- **Primary branch:** `main` (C5-P1 squash merge `146252f7a2157966af403e4df59aa8fa83753054`).
- **Working branch:** `docs/nmi-demo-r0-submission-readiness` (Draft PR; implementation SHA `92da0ddb293edce68c6081317dc3f4629cc8c357`).
- **Active task:** `tasks/NMI-DEMO-R0-readiness.md` (phase plan: `tasks/NMI-UI-01C-integration-plan.md`).
- **Active handoff:** NMI-DEMO-R0-R2
- **Owner decisions:** D1 AG Studio deferred pending license verification; D2 no default browser persistence of unsaved customer data; D3 separate authenticated read-only invoice-list task later; D4 editing saved drafts deferred.

## Accepted evidence
- **React UI shell:** PR #8 accepted at exact audited HEAD `2c9db4e01dd83511aafc49e817398029f5557d1c`; owner squash-merged at `a4520440c748ff8712a10e9f65b389e8cde5db9c`. Browser fixture shell only; no API/client-provider integration yet.
- **Audit and CI:** C6 exact-head independent source/security audit PASS on PR #4 (`4982201918d0030234fdbabbc297375c02c01e5d`). PR #5 documentation reconciliation CI passed and was squash-merged into main at `397c5d0376ef37cfd7f7debb93ac3f8387be5fea`. PR #6 CORS preflight fix (`Idempotency-Key` in `allowedHeaders`) passed Project Baseline CI and Stack CI and was squash-merged into main at `2864761ca902ffd6ed6628c183298bcc6e5c59c1`.
- **AG automated validation:** 236/236 unit and 187/187 PostgreSQL 16 integration tests passed (423 total); lint, formatting, typecheck, build, bundle scan and migrations verified.
- **Real PayPal Sandbox (AG local provider evidence):** `NMI-P2-I2-SANDBOX-SMOKE-01` on 2026-10-26: real OAuth `200`, exactly one invoice-create `201`, and read-only show `200` (exercised with one fictitious USD 5.00 line item, no tax, no discount); invoice `INV2-U92W-76NX-3P2E-AGUZ` status `DRAFT`, USD 5.00, due 2026-11-30, exact invoice-number/reference and durable PostgreSQL link. No send/reminder/cancel/refund/payment operations. Local default restored: `PAYPAL_DRAFTS_ENABLED=false`. Persistent one-create test guard budget `1/1` exhausted (private local evidence).
- **Provider search, reconciliation and error paths:** **NOT TESTED** against live PayPal Sandbox; search, delayed indexing, timeout, duplicate-number, and fail-closed reconciliation behavior are mock-tested only via deterministic fake transports and PostgreSQL tests.
- **Evidence attribution:** GPT-6 independently reviewed the GitHub source and hosted CI; the real provider and local database responses are from AG's sanitized local execution evidence, not an independent PayPal-account query.
- **Real OpenAI Responses API parsing:** **NOT TESTED** against provider; parser behavior exercised via deterministic fake-model tests.

## Delivered on main
- Single-operator authenticated sessions, rotation protection, rate limits and Origin/CSRF controls.
- Strict invoice parsing/proposal validation with manual-entry fallback; integer-minor-unit totals and per-invoice currency boundaries.
- PostgreSQL transactions, audited invoice draft persistence, seven committed migrations (`0000`–`0006`).
- PayPal Sandbox-only draft-create adapter, explicit authenticated trigger, durable operation fencing, exact remote verification, and fail-closed reconciliation without blind recreates.
- Browser CORS preflight explicitly authorizing `Idempotency-Key` on authenticated invoice draft routes.
- Frontend `apps/web`: owner-approved NMI-UI-01B fixture-backed screens and **NMI-UI-01C1 real browser operator authentication** and **NMI-UI-01C2 authenticated parsing** and **NMI-UI-01C3 save/detail** are merged; the real dashboard list is on its C4 Draft PR and the PayPal UI remains deferred to C5.

## Deferred / open gates
- **NMI-DEMO-R0:** implemented on Draft PR (`92da0ddb293edce68c6081317dc3f4629cc8c357`): runbook proven from a clean clone, R0 end-to-end 32/32 with both providers SIMULATED, historical journeys rerun on `main` (C2 88/88, C3 116/116, C4 79/79 after updating stale-copy assertions; C5-P1 102/102 unchanged). **Independent audit and owner decisions NOT YET DONE.** Open blockers: see `docs/NMI-DEMO-SUBMISSION-CHECKLIST.md` (16 items).
- **Manual QA still pending:** VoiceOver/NVDA, real touch, Safari/Firefox, 400% browser zoom, HTTPS `__Host-` cookie and hosted reverse proxy; no full WCAG 2.2 AA or deployment claim.
- **AG Studio (D1):** license/trial/keys unverified; deferred. Native table remains.
- **Provider boundary:** real OpenAI Responses inference **NOT TESTED**, and no new provider call authorized; prior PayPal draft-only Sandbox one-create smoke budget is exhausted. No new PayPal write authorized, and `PAYPAL_DRAFTS_ENABLED=false` remains default.
- **Later integration (R1, needs owner decisions):** record/upload the video; confirm the Devpost criteria not yet independently verified (eligibility, team, sponsor rules, dates; the access, repository/license and video-length rules were independently verified); choose A-only vs A+B hosting; separately authorize real-provider Gates A (OpenAI) and B (one new PayPal Sandbox draft) per `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`; decide on a visible SIMULATED badge. Nothing was submitted.
- **Other deferred:** PayPal send/grant issuance/reminder automation/webhooks/payment reconciliation; SQLite-versus-Postgres decision, hosting strategy and judge access; editing existing saved drafts.
- **Operational limitations:** in-memory per-process auth throttling; approval consumption and audit logging separate statements; DB least-privilege grants a deployment prerequisite.
- **Do not** merge, deploy, publish, submit to Devpost, upload the video, call PayPal/OpenAI, reset the completed Sandbox test budget or enable PayPal drafting by default without separate owner authorization.
- **Privacy scope of search text (C4):** the term travels in `q` in the HTTP GET request URL (customer information). It is not in the browser navigation URL, not in browser storage and not in Fastify logs. Reverse-proxy/ingress/CDN/access logs must redact the query string: deployment prerequisite, UNTESTED. An absolute no-PII-in-URL rule would conflict with the approved GET contract and is an owner decision, not taken.
- **Security finding (C4) resolved in C5-P0 and merged:** `createPayPalDraft` is operator-scoped (`getOwned`); a foreign, ownerless or unknown invoice is one identical `404 not_found` with no operation, audit row or provider call. C5-P1 relies on and re-tests this boundary.

## Next action
GPT-6 independent exact-head audit of the NMI-DEMO-R0 Draft PR, then owner decisions for R1 (see the checklist). No real PayPal/OpenAI calls, deployment, publication or Devpost submission without separate authorization.
