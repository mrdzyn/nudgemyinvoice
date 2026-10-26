# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-UI-01A — **DESIGN INCREMENT (Awaiting Owner Visual Approval)**.
- **Status:** NMI-CORS-01 squash-merged into main (PR #6 at `2864761ca902ffd6ed6628c183298bcc6e5c59c1`). Current phase NMI-UI-01A establishes the visual design, semantic tokens, synthetic multi-currency fixtures, screen specifications, and interactive browser preview (`design/preview/index.html`) for operator visual review and approval. Design-only increment; zero frontend shell or backend logic changes.
- **Primary branch:** `main` (merge commit `2864761ca902ffd6ed6628c183298bcc6e5c59c1`).
- **Working branch:** `design/nmi-ui-01a-invoice-interface`.
- **Active task:** `tasks/NMI-UI-01A-invoice-interface-design.md`.
- **Active handoff:** NMI-UI-01A-DESIGN

## Accepted evidence
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
- Frontend web application remains a placeholder pending visual design approval (NMI-UI-01A).

## Deferred / open gates
- **Human Design Approval Gate:** Visual review and explicit approval of `design/screens/NMI-UI-01A-SCREENS.md` and `design/preview/index.html` required prior to UI shell implementation.
- **AG Studio Integration:** Dashboard uses accessible HTML5 table fallback; AG Studio integration deferred until licensing, trial coverage (active through Dec 15), and sponsor keys are authorized.
- **Backend API Seam:** Backend supports `GET /api/invoice-drafts/:id` but lacks a general list endpoint (`GET /api/invoice-drafts`); dashboard currently uses clearly marked synthetic fixtures (`design/fixtures/invoice-fixtures.json`).
- Real OpenAI smoke; PayPal sending/grant issuance, reminder automation, webhook receipt/payment reconciliation, deployment, and production PayPal use.
- Architecture decisions: PostgreSQL-only versus SQLite support, hosting strategy, demo availability through judging.
- Do **not** reuse the completed one-create Sandbox authorization or reset its exhausted budget. New external writes require new owner approval.
- **Operational limitations:** In-memory auth throttling is single-process; approval consumption and audit logging are separate statements; database least-privilege role configuration is a deployment concern. See [security boundaries](SECURITY.md).
- No deployment, production release or privileged PayPal financial operation authorized.

## Next action
Submit design specification (`design/screens/NMI-UI-01A-SCREENS.md`), semantic tokens (`design/tokens/design-tokens.json`), synthetic fixtures (`design/fixtures/invoice-fixtures.json`), and interactive preview (`design/preview/index.html`) on Draft PR for owner visual review and approval.
