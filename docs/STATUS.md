# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-UI-01C3 — real draft save and read-only saved-invoice detail. **Implemented on Draft PR; awaiting independent GPT-6 exact-head audit.**
- **Status:** NMI-UI-01C1 (real browser auth) and NMI-UI-01C2 (authenticated parse wiring) are independently audited and merged: C1 as `32d9132be419b48a64455fa79c0fca58f9159b89`, C2 squash-merged as `ddffc11471306e3b2c4cd7ea4a6a80303593e674` (PR #11). C3 wires the existing `POST /api/invoice-drafts` and `GET /api/invoice-drafts/:id` into the real React Review and a new read-only saved-invoice page; no backend, migration or provider change.
- **Primary branch:** `main` (C2 squash merge `ddffc11471306e3b2c4cd7ea4a6a80303593e674`).
- **Working branch:** `feat/nmi-ui-01c3-save-detail` (Draft PR; implementation SHA `1530c63003947e26ba2ffb9a11fe36c1601f57cd`).
- **Active task:** `tasks/NMI-UI-01C3-save-detail.md` (phase plan: `tasks/NMI-UI-01C-integration-plan.md`).
- **Active handoff:** NMI-UI-01C3-IMPL
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
- Frontend `apps/web`: owner-approved NMI-UI-01B fixture-backed screens and **NMI-UI-01C1 real browser operator authentication** and **NMI-UI-01C2 authenticated parsing** are merged; the invoice list and PayPal UI remain synthetic fixtures pending C4/C5, and C3 (save/detail) is on its Draft PR.

## Deferred / open gates
- **NMI-UI-01C3:** implemented on Draft PR (`1530c63003947e26ba2ffb9a11fe36c1601f57cd`); local validation and 88/88 real-browser checks are recorded in the task. **Independent audit and owner merge approval NOT YET DONE.** Real draft save/detail is not on `main`.
- **Manual QA still pending:** VoiceOver/NVDA, real touch, Safari/Firefox, 400% browser zoom, HTTPS `__Host-` cookie and hosted reverse proxy; no full WCAG 2.2 AA or deployment claim.
- **AG Studio (D1):** license/trial/keys unverified; deferred. Native table remains.
- **Provider boundary:** real OpenAI Responses inference **NOT TESTED**, and no new provider call authorized; prior PayPal draft-only Sandbox one-create smoke budget is exhausted. No new PayPal write authorized, and `PAYPAL_DRAFTS_ENABLED=false` remains default.
- **Later integration:** C4 read-only draft list (`GET /api/invoice-drafts` does not exist yet); C5 controlled Sandbox draft UI; NMI-DEMO. No current provider-enabled demo or hosted release.
- **Other deferred:** PayPal send/grant issuance/reminder automation/webhooks/payment reconciliation; SQLite-versus-Postgres decision, hosting strategy and judge access; editing existing saved drafts.
- **Operational limitations:** in-memory per-process auth throttling; approval consumption and audit logging separate statements; DB least-privilege grants a deployment prerequisite.
- **Do not** merge, deploy, call PayPal/OpenAI, reset the completed Sandbox test budget, or start C4/C5 without separate approval.

## Next action
GPT-6 independent exact-head audit of the C3 Draft PR, then the owner's merge decision. No live OpenAI/PayPal calls, deployment, merge, C4 or C5 without separate authorization.
