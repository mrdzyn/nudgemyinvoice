# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-UI-01C1 — real browser operator login/session/logout on Draft PR #9; MEDIUM-1 (pending-logout exposure) remediated; awaiting independent re-audit. No deployment.
- **Status:** NMI-UI-01B owner-approved and squash-merged on PR #8 into `main` at `a4520440c748ff8712a10e9f65b389e8cde5db9c`, after exact-head GPT-6 audit PASS and both required CI workflows PASS. The five-screen React UI shell is complete but still fixture-only; its demo login is NOT real authentication, and no invoice API is connected. Owner has authorized starting NMI-UI-01C. First bounded increment is real browser login/session/logout (C1) without provider calls or invoice writes; subsequent slices are described in `tasks/NMI-UI-01C-integration-plan.md`.
- **Primary branch:** `main` (PR #8 squash commit `a4520440c748ff8712a10e9f65b389e8cde5db9c`).
- **Working branch:** `feat/nmi-ui-01c1-auth-session` (remediation code SHA `f2f7fd8f8e9b02890cb04d0220b8e2c5c89326df`).
- **Active task:** `tasks/NMI-UI-01C1-auth-session.md` (phase plan: `tasks/NMI-UI-01C-integration-plan.md`).
- **Active handoff:** NMI-UI-01C1-R1
- **Owner decisions (from the NMI-UI-01A approval):** **D1** defer AG Studio until licensing is independently confirmed; **D2** do not persist unsaved customer data in browser storage by default; **D3** schedule a separate bounded read-only `GET /api/invoice-drafts` during API integration; **D4** defer editing existing saved drafts.

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
- Frontend `apps/web`: owner-approved NMI-UI-01B five-screen fixture-only React shell is merged; real login and API integration remain pending.

## Deferred / open gates
- **NMI-UI-01C1 independent re-audit and separate owner merge approval.** Audit of `ad756b0` was FIX REQUIRED (MEDIUM-1: workspace stayed usable during a pending logout); remediated at `f2f7fd8f8e9b02890cb04d0220b8e2c5c89326df` (workspace unmounts synchronously, 10 s bound, 204-only confirmation). Local: 390 tests + 116/116 real browser-to-PostgreSQL checks; hosted Baseline run 40464075823 PASS, Stack run 40464075624 PASS. Not merged: `main` still has fixture-only login.
- **Manual QA still pending (not covered by automation):** screen reader (VoiceOver/NVDA), real touch devices, Safari and Firefox, 400% browser zoom. Full WCAG 2.2 AA conformance is not claimed.
- **AG Studio (D1):** license terms, trial period and keys are **unverified**; deferred. The dashboard is an accessible native table.
- **Real API wiring:** C1 login/session/logout **implemented on PR #9, unmerged**. Later parse, save/read, read-only list (D3), and controlled PayPal Sandbox draft UI require separate bounded increments, independent reviews and owner merge approval. Editing saved drafts remains deferred (D4).
- Real OpenAI smoke; PayPal sending/grant issuance, reminder automation, webhook receipt/payment reconciliation, deployment, and production PayPal use.
- Architecture decisions: PostgreSQL-only versus SQLite support, hosting strategy, demo availability through judging.
- Do **not** reuse the completed one-create Sandbox authorization or reset its exhausted budget. New external writes require new owner approval.
- **Operational limitations:** In-memory auth throttling is single-process; approval consumption and audit logging are separate statements; database least-privilege role configuration is a deployment concern. See [security boundaries](SECURITY.md).
- No deployment, production release, new PayPal Sandbox write, or real OpenAI provider inference authorized. NMI-UI-01C1 implementation awaits audit.

## Next action
GPT-6 independently re-audits PR #9 at the exact head named in the `NMI-UI-01C1-R1` handoff. After a PASS and separate owner approval the owner may merge; C2 (invoice parse wiring) is a separate authorization. Do not merge, deploy, call PayPal/OpenAI, or start C2 without it.
