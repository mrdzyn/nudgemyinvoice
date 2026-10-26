# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-UI-01A — **DESIGN INCREMENT (remediated; ready for independent re-audit; owner visual approval pending)**.
- **Status:** NMI-CORS-01 squash-merged into main (PR #6 at `2864761ca902ffd6ed6628c183298bcc6e5c59c1`). Draft PR #7 (design only) received an independent audit of `ad69ad8` = **FIX REQUIRED** ([comment](https://github.com/mrdzyn/nudgemyinvoice/pull/7#issuecomment-6422310129)). The remediation rebuilt the interactive preview (every state and handler working with synthetic fixtures), aligned the design to the strict `invoiceDraftSchema` and login contract, enforced the 2,000-character AI limit, replaced the genuine Sandbox invoice id in fixtures, corrected AG Studio and OpenAI privacy statements, and added real-browser evidence. It awaits independent re-audit; the owner design gate is **not** approved. No production code, schema, dependency or provider call changed.
- **Primary branch:** `main` (merge commit `2864761ca902ffd6ed6628c183298bcc6e5c59c1`).
- **Working branch:** `design/nmi-ui-01a-invoice-interface`.
- **Active task:** `tasks/NMI-UI-01A-invoice-interface-design.md`.
- **Active handoff:** NMI-UI-01A-REMEDIATION-1

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
- **Manual QA still pending (not covered by automation):** screen reader (VoiceOver/NVDA), real touch devices, Safari and Firefox, 400% browser zoom.
- **Human Design Approval Gate:** Visual review and explicit approval of `design/screens/NMI-UI-01A-SCREENS.md` and `design/preview/index.html` required prior to UI shell implementation.
- **AG Studio Integration:** license terms, trial period and keys are **unverified** and need owner confirmation. The dashboard is designed as an accessible native table; AG Studio is not enabled.
- **Backend API Seam:** Backend supports `GET /api/invoice-drafts/:id` but lacks a general list endpoint (`GET /api/invoice-drafts`); dashboard currently uses clearly marked synthetic fixtures (`design/fixtures/invoice-fixtures.json`).
- Real OpenAI smoke; PayPal sending/grant issuance, reminder automation, webhook receipt/payment reconciliation, deployment, and production PayPal use.
- Architecture decisions: PostgreSQL-only versus SQLite support, hosting strategy, demo availability through judging.
- Do **not** reuse the completed one-create Sandbox authorization or reset its exhausted budget. New external writes require new owner approval.
- **Operational limitations:** In-memory auth throttling is single-process; approval consumption and audit logging are separate statements; database least-privilege role configuration is a deployment concern. See [security boundaries](SECURITY.md).
- No deployment, production release or privileged PayPal financial operation authorized.

## Next action
Independently re-audit Draft PR #7 at its exact new HEAD (read `design/evidence/NMI-UI-01A/QA-RESULTS.md`, re-run `design/fixtures/verify-fixtures.mjs` and the browser QA if desired). Only after a PASS may the owner decide on visual approval. Do not start NMI-UI-01B, merge or deploy without owner direction.
