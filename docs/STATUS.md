# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-UI-01B — **React UI shell (fixture-only), audit MAJOR-1 remediated; ready for independent GPT-6 re-audit; not merged.**
- **Status:** NMI-UI-01A was owner-approved at exact design HEAD `76549b3f6ffa656943d3650f89cda60f249b0adf` and squash-merged (PR #7) into `main` as `b9962a2614af0e69fb565cbe4a0e7d6a64506b4d`. Owner visual approval is **granted**. NMI-UI-01B implements the five approved screens in `apps/web` with React 19 against synthetic fixtures and simulated, labelled transitions. It makes no backend or provider call and stores nothing in the browser. Real API integrations remain deferred. Independent audit of `7677569` was FIX REQUIRED on the simulated idempotency replay (it inserted a second draft); fixed so a replay returns the existing draft with no insert and no count change.
- **Primary branch:** `main` (merge commit `b9962a2614af0e69fb565cbe4a0e7d6a64506b4d`).
- **Working branch:** `feat/nmi-ui-01b-react-shell` (new Draft PR).
- **Active task:** `tasks/NMI-UI-01B-react-shell.md`.
- **Active handoff:** NMI-UI-01B-R1
- **Owner decisions (from the NMI-UI-01A approval):** **D1** defer AG Studio until licensing is independently confirmed; **D2** do not persist unsaved customer data in browser storage by default; **D3** schedule a separate bounded read-only `GET /api/invoice-drafts` during API integration; **D4** defer editing existing saved drafts.

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
- Frontend `apps/web`: the fixture-only React shell (NMI-UI-01B) is on the Draft PR, not yet on `main`; `main` still has the placeholder UI.

## Deferred / open gates
- **Independent re-audit and owner merge approval for NMI-UI-01B** (Draft PR). Required CI applies to the PR's own exact head.
- **Manual QA still pending (not covered by automation):** screen reader (VoiceOver/NVDA), real touch devices, Safari and Firefox, 400% browser zoom. Full WCAG 2.2 AA conformance is not claimed.
- **AG Studio (D1):** license terms, trial period and keys are **unverified**; deferred. The dashboard is an accessible native table.
- **Real API wiring (not authorized):** login/session, parse, save, read, PayPal draft creation, and the read-only `GET /api/invoice-drafts` list (D3). The dashboard is DEMO / SYNTHETIC until then. Editing saved drafts is deferred (D4).
- Real OpenAI smoke; PayPal sending/grant issuance, reminder automation, webhook receipt/payment reconciliation, deployment, and production PayPal use.
- Architecture decisions: PostgreSQL-only versus SQLite support, hosting strategy, demo availability through judging.
- Do **not** reuse the completed one-create Sandbox authorization or reset its exhausted budget. New external writes require new owner approval.
- **Operational limitations:** In-memory auth throttling is single-process; approval consumption and audit logging are separate statements; database least-privilege role configuration is a deployment concern. See [security boundaries](SECURITY.md).
- No deployment, production release or privileged PayPal financial operation authorized. NMI-UI-01C is not started.

## Next action
Independently re-audit the Draft PR for NMI-UI-01B at its exact new head (read `tasks/NMI-UI-01B-react-shell.md` and `design/evidence/NMI-UI-01B/QA-RESULTS.md`). Do not merge, deploy or start NMI-UI-01C without separate owner direction.
