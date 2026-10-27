# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-UI-01C2 — authenticated React invoice parsing / manual fallback. **Implemented; audit MEDIUM-1/MINOR-2 remediated; awaiting independent GPT-6 re-audit.**
- **Status:** NMI-UI-01C1 real browser auth/session/logout passed independent GPT-6 audit at exact PR #9 HEAD `d1a525058e84b041b0799f77b1c0ab4411dfa9fb` and both hosted checks PASS. Owner authorized squash merge, completed 2026-10-27 as `32d9132be419b48a64455fa79c0fca58f9159b89`. Real browser authentication is on `main`. C2 is scoped to client-side wiring of existing authenticated `POST /api/invoice-drafts/parse` and manual fallback; no provider call or invoice persistence is authorized.
- **Primary branch:** `main` (PR #9 squash merge `32d9132be419b48a64455fa79c0fca58f9159b89`).
- **Working branch:** `feat/nmi-ui-01c2-parse-wiring` ([Draft PR #11](https://github.com/mrdzyn/nudgemyinvoice/pull/11), implementation SHA `894758e48bca92c2afcd2dbf0609977f00fa4663`, remediation SHA `8d50b1d0dbe3c301ccd3e0712fea45ff25112c1c`).
- **Active task:** `tasks/NMI-UI-01C2-parse-wiring.md` (phase plan: `tasks/NMI-UI-01C-integration-plan.md`).
- **Active handoff:** NMI-UI-01C2-R1
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
- Frontend `apps/web`: owner-approved NMI-UI-01B fixture-backed screens and **NMI-UI-01C1 real browser operator authentication** are merged; invoice parsing, saving, list, detail and PayPal UI remain synthetic fixtures pending their bounded integration slices.

## Deferred / open gates
- **NMI-UI-01C2:** implemented on Draft PR #11 (`894758e48bca92c2afcd2dbf0609977f00fa4663`); local validation and 88/88 real-browser checks are recorded in the task. **Audit of `8df462b` returned FIX REQUIRED (MEDIUM-1 totals validation, MINOR-2 harness); both remediated at the SHA above. Independent re-audit and owner merge approval NOT YET DONE**; parse wiring is not on `main`.
- **Manual QA still pending:** VoiceOver/NVDA, real touch, Safari/Firefox, 400% browser zoom, HTTPS `__Host-` cookie and hosted reverse proxy; no full WCAG 2.2 AA or deployment claim.
- **AG Studio (D1):** license/trial/keys unverified; deferred. Native table remains.
- **Provider boundary:** real OpenAI Responses inference **NOT TESTED**, and no new provider call authorized; prior PayPal draft-only Sandbox one-create smoke budget is exhausted. No new PayPal write authorized, and `PAYPAL_DRAFTS_ENABLED=false` remains default.
- **Later integration:** C3 persisted draft save/detail; C4 read-only draft list; C5 controlled Sandbox draft UI; NMI-DEMO. No current provider-enabled demo or hosted release.
- **Other deferred:** PayPal send/grant issuance/reminder automation/webhooks/payment reconciliation; SQLite-versus-Postgres decision, hosting strategy and judge access; editing existing saved drafts.
- **Operational limitations:** in-memory per-process auth throttling; approval consumption and audit logging separate statements; DB least-privilege grants a deployment prerequisite.
- **Do not** merge, deploy, call PayPal/OpenAI, reset the completed Sandbox test budget, or start C3 without separate approval.

## Next action
GPT-6 independent exact-head re-audit of Draft PR #11, then the owner's merge decision. No live OpenAI/PayPal calls, deployment, merge or C3 (saved draft wiring) without separate authorization.
