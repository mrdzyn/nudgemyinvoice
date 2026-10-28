# Project Status

> Current operational state only. Durable decisions and historical audit details belong in the task and handoff records.

## Project
- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP; not production ready.
- **Current phase:** NMI-AG1 — genuine AG Grid Community integration in the authenticated invoice dashboard. **Task contracted; implementation NOT started.** The approved C1–C5 app and NMI-DEMO-R0 readiness are already squash-merged. No real provider calls, hosting, Devpost submission or production changes authorized.
- **Status:** C1–C5 delivered and independently audited (C5-P1 PR #15 merge `146252f7a2157966af403e4df59aa8fa83753054`). NMI-DEMO-R0 PR #16 passed independent exact-head audit and owner squash-merged at `f61b653c8131da7446f57ab38db7c118801b8fcd`: clean-clone local judge setup, test-only simulated evaluation, truthful submission documents and provider acceptance plan. NMI-AG1 will replace only the real dashboard native table with Community AG Grid while preserving owner-scoped API, strict money and PayPal safety. AG Grid is NOT installed or verified yet.
- **Primary branch:** `main` (NMI-DEMO-R0 squash merge `f61b653c8131da7446f57ab38db7c118801b8fcd`).
- **Working branch:** `feat/nmi-ag1-ag-grid-dashboard` (NMI-AG1 task preparation; implementation pending, Draft PR).
- **Active task:** `tasks/NMI-AG1-ag-grid-dashboard.md`; preserve NMI-DEMO-R0 judge/runbook and the separate R1 provider approval gates.
- **Active handoff:** NMI-AG1-START
- **Owner decisions:** D1a AG Studio/Enterprise remains deferred pending commercial license/trial review; D1b owner approved a bounded AG Grid **Community** replacement of the real dashboard invoice table for the hackathon; D2 no default browser persistence of unsaved customer data; D3 read-only owner-scoped list delivered in C4; D4 editing saved drafts deferred.

## Accepted evidence
- **React UI shell:** owner-approved NMI-UI-01B accepted in PR #8 (`a4520440c748ff8712a10e9f65b389e8cde5db9c`), subsequently fully wired in C1–C5. Approved dashboard design carries forward; only the real table widget is selected for Community AG Grid replacement.
- **Audit and CI:** C6 exact-head independent source/security audit PASS on PR #4 (`4982201918d0030234fdbabbc297375c02c01e5d`). PR #5 documentation reconciliation CI passed and was squash-merged into main at `397c5d0376ef37cfd7f7debb93ac3f8387be5fea`. PR #6 CORS preflight fix (`Idempotency-Key` in `allowedHeaders`) passed Project Baseline CI and Stack CI and was squash-merged into main at `2864761ca902ffd6ed6628c183298bcc6e5c59c1`.
- **Automated validation:** C1–C5 independent CI and automated/browser evidence recorded in their task/evidence files; NMI-DEMO-R0 PR #16 hosted Project Baseline and Stack CI PASS at audited head `fc23aab90e0f2d67906c927a961344dd1a249033`; local simulated R0 journey 32/32 reported by the implementation agent. NMI-AG1 tests/CI are NOT YET RUN.
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
- Frontend `apps/web`: approved NMI-UI-01B design, authenticated C1 browser sessions, C2 parsing, C3 save/detail, C4 owner-scoped dashboard, C5-P0 PayPal ownership gate and C5-P1 explicit PayPal Sandbox DRAFT UI are **merged on main**. The real dashboard currently renders a native accessible HTML table; AG Grid Community work is newly scoped and not yet implemented.

## Deferred / open gates
- **NMI-DEMO-R0:** independently audited and owner squash-merged in PR #16 at `f61b653c8131da7446f57ab38db7c118801b8fcd`; clean-clone runbook and simulated browser evidence available. R1 real-provider gates and submission remain unapproved and unexecuted. See `docs/NMI-DEMO-SUBMISSION-CHECKLIST.md` for open blockers.
- **Manual QA still pending:** VoiceOver/NVDA, real touch, Safari/Firefox, 400% browser zoom, HTTPS `__Host-` cookie and hosted reverse proxy; no full WCAG 2.2 AA or deployment claim.
- **AG Grid/Studio (D1):** AG Studio/Enterprise license remains unverified/deferred; AG Grid Community task NMI-AG1 active, no AG Grid code accepted or installed yet. Actual use must precede any sponsor-tool claim.
- **Provider boundary:** real OpenAI Responses inference **NOT TESTED**, and no new provider call authorized; prior PayPal draft-only Sandbox one-create smoke budget is exhausted. No new PayPal write authorized, and `PAYPAL_DRAFTS_ENABLED=false` remains default.
- **Later integration (R1, needs owner decisions):** record/upload the video; confirm the Devpost criteria not yet independently verified (eligibility, team, sponsor rules, dates; the access, repository/license and video-length rules were independently verified); choose A-only vs A+B hosting; separately authorize real-provider Gates A (OpenAI) and B (one new PayPal Sandbox draft) per `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`; decide on a visible SIMULATED badge. Nothing was submitted.
- **Other deferred:** PayPal send/grant issuance/reminder automation/webhooks/payment reconciliation; SQLite-versus-Postgres decision, hosting strategy and judge access; editing existing saved drafts.
- **Operational limitations:** in-memory per-process auth throttling; approval consumption and audit logging separate statements; DB least-privilege grants a deployment prerequisite.
- **Do not** merge, deploy, publish, submit to Devpost, upload the video, call PayPal/OpenAI, reset the completed Sandbox test budget or enable PayPal drafting by default without separate owner authorization.
- **Privacy scope of search text (C4):** the term travels in `q` in the HTTP GET request URL (customer information). It is not in the browser navigation URL, not in browser storage and not in Fastify logs. Reverse-proxy/ingress/CDN/access logs must redact the query string: deployment prerequisite, UNTESTED. An absolute no-PII-in-URL rule would conflict with the approved GET contract and is an owner decision, not taken.
- **Security finding (C4) resolved in C5-P0 and merged:** `createPayPalDraft` is operator-scoped (`getOwned`); a foreign, ownerless or unknown invoice is one identical `404 not_found` with no operation, audit row or provider call. C5-P1 relies on and re-tests this boundary.

## Next action
Coding agent implements NMI-AG1 on the existing branch/Draft PR, runs targeted and hosted CI plus browser/device QA, then requests independent GPT-6 exact-head audit. No merge, real PayPal/OpenAI calls, provider-budget reset, deployment, publication or Devpost submission without separate owner approval.
