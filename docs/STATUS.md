# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-UI-01C5-P1 — real PayPal Sandbox draft UI on the saved invoice (final React-to-API integration). **Implemented; audit MAJOR-1 (create re-offered while the read-back is pending/failed) remediated; awaiting independent GPT-6 re-audit.** NMI-DEMO is not started.
- **Status:** NMI-UI-01C1 through C5-P0 are independently audited and squash-merged: C1 `32d9132`, C2 `ddffc11`, C3 `988a8f9`, C4 `568faa0`, and C5-P0 (PayPal draft operator-ownership gate, PR #14) `7e9c1c9b48ed03e3d85d4ad9d401f6803bed0a4c`. C5-P1 wires the existing `POST /api/invoice-drafts/:id/paypal-draft` into the real saved-invoice page behind an explicit confirmation dialog, with durable read-back, read-only Check status and safe handling of every uncertain outcome. No backend, schema, provider or payment-algorithm change; the journey uses a test-only deterministic fake PayPal.
- **Primary branch:** `main` (C5-P0 squash merge `7e9c1c9b48ed03e3d85d4ad9d401f6803bed0a4c`).
- **Working branch:** `feat/nmi-ui-01c5-p1-paypal-draft-ui` (Draft PR; implementation SHA `17c13e0e75de07bda310bbd9745b27a97b6bf7bd`, remediation SHA `9b367fb73ea420a179ae853bea9c430405d205fe`).
- **Active task:** `tasks/NMI-UI-01C5-P1-paypal-draft-ui.md` (phase plan: `tasks/NMI-UI-01C-integration-plan.md`).
- **Active handoff:** NMI-UI-01C5-P1-R1
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
- **NMI-UI-01C5-P1:** implemented on Draft PR (`17c13e0e75de07bda310bbd9745b27a97b6bf7bd`); 10 new PostgreSQL+Fastify contract tests, web suite 554 after remediation, a real-browser journey against a FAKE PayPal (89/89 originally, 102/102 after the MAJOR-1 remediation) and the unchanged backend. **Independent audit and owner merge approval NOT YET DONE.** Not on `main`. No real PayPal Sandbox or OpenAI call has been made.
- **Manual QA still pending:** VoiceOver/NVDA, real touch, Safari/Firefox, 400% browser zoom, HTTPS `__Host-` cookie and hosted reverse proxy; no full WCAG 2.2 AA or deployment claim.
- **AG Studio (D1):** license/trial/keys unverified; deferred. Native table remains.
- **Provider boundary:** real OpenAI Responses inference **NOT TESTED**, and no new provider call authorized; prior PayPal draft-only Sandbox one-create smoke budget is exhausted. No new PayPal write authorized, and `PAYPAL_DRAFTS_ENABLED=false` remains default.
- **Later integration:** NMI-DEMO (provider-enabled demo, hosting, judge access) and the Devpost submission are not started. Any real PayPal Sandbox call needs separate owner authorization, environment checks and a strict call budget.
- **Other deferred:** PayPal send/grant issuance/reminder automation/webhooks/payment reconciliation; SQLite-versus-Postgres decision, hosting strategy and judge access; editing existing saved drafts.
- **Operational limitations:** in-memory per-process auth throttling; approval consumption and audit logging separate statements; DB least-privilege grants a deployment prerequisite.
- **Do not** merge, deploy, call PayPal/OpenAI, reset the completed Sandbox test budget, enable PayPal drafting by default, or start NMI-DEMO without separate approval.
- **Privacy scope of search text (C4):** the term travels in `q` in the HTTP GET request URL (customer information). It is not in the browser navigation URL, not in browser storage and not in Fastify logs. Reverse-proxy/ingress/CDN/access logs must redact the query string: deployment prerequisite, UNTESTED. An absolute no-PII-in-URL rule would conflict with the approved GET contract and is an owner decision, not taken.
- **Security finding (C4) resolved in C5-P0 and merged:** `createPayPalDraft` is operator-scoped (`getOwned`); a foreign, ownerless or unknown invoice is one identical `404 not_found` with no operation, audit row or provider call. C5-P1 relies on and re-tests this boundary.

## Next action
GPT-6 independent exact-head audit of the C5-P1 Draft PR, then the owner's merge decision. No real PayPal/OpenAI calls, deployment, merge or NMI-DEMO without separate authorization.
