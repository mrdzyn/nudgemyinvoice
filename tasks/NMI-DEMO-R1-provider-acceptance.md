# NMI-DEMO-R1 — Real-provider acceptance readiness (owner-gated)

- **State:** PREPARATION DOCUMENTS WRITTEN (documentation only), awaiting independent GPT-6 exact-head audit. No real-provider call, deployment, Devpost upload or submission authorized; Gates A, B and C are **PENDING / NOT AUTHORIZED**.
- **Starting `main`:** `2d5a7034fe7b78d927d19d534bf9958d91b3b7fd` (NMI-AG1 Community dashboard, independently audited and owner squash-merged PR #17).
- **Branch:** `docs/nmi-demo-r1-provider-acceptance`; **Draft PR**; keep the audit and merge gates independent of provider-test authorization.
- **Prior artifacts:** `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`, `docs/NMI-DEMO-JUDGE-RUNBOOK.md`, `docs/NMI-DEMO-SUBMISSION-CHECKLIST.md`, `docs/NMI-DEMO-VIDEO-SCRIPT.md`, `docs/NMI-DEMO-DEVPOST-DRAFT.md`.
- **Deadline:** official Devpost submission **November 12, 2026, noon PST** = **November 13, 2026, 4:00 AM PHT**; preserve time for video recording and submission. Source: https://paypalaihackathon.devpost.com/rules.

## Objective and immediate scope

Prepare a strictly bounded, reproducible, secret-safe **REAL** provider acceptance procedure for the owner. The coding agent may improve the documentation, commands and offline validation evidence. **The coding agent must not execute any OpenAI or PayPal request**, start an app configured with their real credentials, reset PayPal test budgets, upload/submit content or deploy. No application, schema, authentication, payment-state-machine, provider-adapter, CI or infrastructure changes in this preparation task.

**Test objective:** verify that the scripts/instructions cannot mistake simulated evidence for live acceptance, accidentally enable a provider, overrun a budget, expose secrets, bypass human payment confirmation, or claim unavailable provider results. This preparation task does not itself prove live provider behavior.

## Gate A — OpenAI Responses, separate future authorization

- Preflight: choose/check one supported model and **verify account availability privately without a billable real request**; proposed candidate **`gpt-6-luna`** (currently documented by OpenAI for Responses + Structured Outputs, cost-sensitive extraction; owner must confirm the final model and the account's entitlement). Official model docs: https://developers.openai.com/api/docs/models/gpt-6-luna ; pricing: https://developers.openai.com/api/docs/pricing . Never invent a successful response.
- Current official standard text price indicated on 2026-10-29: `gpt-6-luna` **USD $0.10 / million input tokens, $0.50 / million output tokens**, excluding any tools/other usage. Recheck at the run time; billing and availability remain owner-dependent. Do not treat these rates as a measured test cost.
- Only with explicit separate future owner approval: **at most 3** real OpenAI Responses calls total (synthetic USD and EUR invoice text, optional one carefully controlled negative test). Keep PayPal drafting **OFF**. Enforce client-side call counts and a real provider-side budget. `OPENAI_MAX_OUTPUT_TOKENS` configurable 64..4096, repo default 1024: do not shrink it to 512 without ensuring the chosen model's reasoning/output budget can complete structured output. `store:false` maintained.
- Validate returned model/schema/domain outcome, totals computed server-side, deliberate clarification/manual fallback behavior; document actual request status/token use, model ID, usage/cost estimate, no secret or real PII. If incompatible/unavailable, stop and report, no automatic fallback to a different paid model or unapproved retry.

## Gate B — PayPal Sandbox, separate future authorization

- PayPal app **`NudgeMyBillsAI`**, existing US **Sandbox Business** account, Invoicing v2 Sandbox. Environment must be exactly `PAYPAL_ENV=sandbox` and `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com`; leave `PAYPAL_DRAFTS_ENABLED=false` before/after any owner-approved run.
- Historical backend-only real smoke on 2026-10-26 created **ONE** synthetic USD 5.00 PayPal DRAFT and read it; its create budget is **exhausted (1/1)**. This new phase **does not reset** that budget. A new create is forbidden unless the owner separately approves exactly **one additional** create for the already specified **USD 540.00** synthetic invoice.
- Only after that future approval: one authenticated browser save → *Create PayPal Sandbox draft* → human confirm; at most **one** PayPal DRAFT-create request and no retry, even on timeout/uncertain response. The permit may include narrowly bounded OAuth/read-only show/search verification. No send/remind/capture/payment/refund/cancel/webhooks/live host.
- Verify local invoice, one durable operation and attempts=1, remote DRAFT state, number, reference, total USD 540.00 and due date. Read-only `Check status` only on uncertainty; **do not** click create a second time. Redact all account IDs, emails, tokens, bearer headers, developer IDs and credentials.

## Gate C — Combined browser acceptance

Not authorized by Gate A or B alone. Requires **separate** owner approval **after both gates pass** to claim complete real-provider journey. Do not silently run combined tests or rerun a PayPal create merely for a video; prefer recording evidence already obtained, explicitly labelling live versus simulated portions.

## Owner update: Render credits now available (not verified)

- The owner reports that Render credits are now available. **Amount, expiration, workspace/billing plan and applicable services remain unverified.**
- Before deciding between Option A (the tested local judge runbook) and A+B (optional Render HTTPS host), review `docs/NMI-DEMO-DEPLOYMENT-DECISION.md` section **Render credits update — 2026-10-29** and official Render hackathon sponsor terms. **Render deployment is not authorized by the credit announcement.**
- The coding agent should include a brief docs-only decision memo: Render web+PostgreSQL architecture, exact planned cost and credit runway **only if actual current balance/pricing is safely available**, otherwise mark unknown; single-origin static/API routing, secure `__Host-` cookie, owner/operator sharing constraints, provider-disabled judge mode, log privacy and backup/cleanup requirements.
- Render's Pro+ request logs may include requested URLs; dashboard search `q` currently carries customer text in the HTTP GET URL. This is an unresolved privacy blocker for public hosting. A sandboxed/synthetic demo does not waive the need to assess request-log retention/redaction.
- Existing test-only simulated launcher **must not** be enabled on a public production service. A hosted full demo requires separate owner-approved secure implementation and independent review, potentially as a new `NMI-HOST-R0` Draft PR after R1.
- PayPal hackathon has Render sponsor prizes for **actual Render tool use**; credits alone are not use. Rules allow at most one sponsor prize per winning entry. Do not claim hosted demo, Render integration or Render prize eligibility based solely on owning credits.
- **Do not** provision Render, create a service or database, apply credits, link GitHub credentials, change account billing, deploy any commit, expose provider credentials or modify application code under this docs-only task.

## R1 preparation deliverables

1. Reconcile stale `docs/STATUS.md` and submission/Devpost drafts with confirmed PR #17 merge `2d5a7034fe7b78d927d19d534bf9958d91b3b7fd`; AG Grid Community 36.2.0 is genuinely on `main` (not Studio, no Enterprise trial).
2. Verify the existing provider runbook/adapter/guards **by static review and local fake-only tests**. Write concise operator checklists with a one-run ID, exact approved calls and budget counters, explicit abort criteria, credential/redaction hygiene, and result labels `PENDING / REAL PASS / REAL FAIL / SIMULATED`. Real provider evidence remains PENDING.
3. Surface exact approval requests for **Gate A** and **Gate B** separately. Do not mistake "next", README instruction, test script, previous exhausted approval or a docs merge for permission.
4. Confirm the official submission deadline and the planned judge access mode; prefer public repo/local simulated runbook unless owner separately elects to build a secure hosted environment. Keep the YouTube video under 3 min, public, unuploaded until approval.
5. Prepare a sanitized evidence template. Avoid committed transcripts of private prompts, authorization tokens, account data or credentials. Avoid unapproved non-read-only environment calls.
6. Update task, `docs/STATUS.md`, append `NMI-DEMO-R1-START` handoff and relevant R1 documentation. Keep product and production code **unchanged**.

## Validation & exit

- Show a documentation-only diff, no `apps/`, `packages/`, `pnpm-lock.yaml`, migration, CI, secrets or browser evidence changes. `pnpm lint`, `pnpm format:check`, profile validator and mandatory hosted CI where available.
- Open one **Draft PR** for R1 preparation; report exact HEAD, checks and any inaccuracies. Request independent GPT-6 exact-head audit. **No merge, deploy, publish, Devpost submission or real provider call.**
- Following successful audit and owner merge, **ask owner for explicit Gate A authorization first** with a concrete model and call cap. Gate B must be separately authorized; the exhausted PayPal one-create budget cannot be silently reopened.

## Acceptance vs implementation

These documents describe a prepared method, **not** successful live OpenAI/PayPal acceptance. Until explicit approved tests have been executed, Devpost claims must state real OpenAI unverified; only historical backend PayPal DRAFT verified; full live browser flow unverified. No AG Studio trial required.

## Preparation record (NMI-DEMO-R1-PREP)

Documentation only: no change under `apps/`, `packages/`, `scripts/`, migrations, CI, `pnpm-lock.yaml` or `design/evidence/`; no OpenAI or PayPal request, no credential, no budget reset, no drafting enabled.

- **Gate A (OpenAI), prepared:** proposed model `gpt-6-luna`; public docs (checked 2026-10-29) list Responses API and Structured Outputs, USD 0.10 / 0.50 per 1M input / output tokens (short context), default reasoning effort medium. Entitlement is **unconfirmed** and the owner must check it without a billable request. Static review of `packages/ai/src/client.ts` found two owner decisions: (A-F1) the SDK client uses `maxRetries: 1`, so 3 application parses can be up to 6 HTTP requests; (A-F2) with default medium reasoning, the 1024 default output cap could end `incomplete`; recommended configuration-only mitigation `OPENAI_MAX_OUTPUT_TOKENS=4096` (arithmetic worst case about USD 0.0021 per call, 0.0063 for 3, 0.0126 if each is resent). Procedure: max 3 calls (USD Northwind, EUR Vienna, optional missing-due-date check), strict schema/domain validation, server totals (expected USD 540.00 / EUR 599.97), PayPal credentials unset and drafting `false`, redacted token/cost/latency evidence from the provider usage page (the app does not record tokens) with `PENDING` allowed for lag, manual fallback on failure, real-failure fallback otherwise SIMULATED. No code change was made for A-F1/A-F2; each would be its own approved task.
- **Gate B (PayPal), prepared:** existing `NudgeMyBillsAI` Sandbox app; one manually entered synthetic USD 540.00 invoice; exactly one new create only under a separate permit, no retry, read-only verification (browser POST count = 1, `attempts=1`, one operation row, PayPal dashboard N+1 and DRAFT/USD/540.00/2030-01-15), drafting disabled immediately after. The 1/1 historical budget stays exhausted. Static finding: the one-create guard was a private harness outside the repository, so the bound is procedural plus database evidence.
- **Gate C, prepared as a request only:** combined walkthrough after A and B each REAL PASS; by default it shows the already-created Gate B DRAFT read-only and does **not** create another PayPal draft; a live third create would be a separate permit that is not requested.
- **Deliverables:** `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` (rewritten), new `docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md` and `docs/NMI-DEMO-EVIDENCE-TEMPLATES.md`; checklist (blockers 4, 17-19), Devpost draft (provider evidence status table, model wording), video script (real-provider recording rules) and the runbook Mode B note updated; STATUS and handoff `NMI-DEMO-R1-PREP`.
- **Preserved:** merged AG Grid dashboard and local judge setup unchanged.
- **Open owner decisions:** A-F1, A-F2, spend limit, model entitlement, whether to answer Requests A/B at all, local-only vs hosted judging, video mode. Real OpenAI, new PayPal create and the combined walkthrough remain **PENDING**.
