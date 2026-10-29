# NMI-DEMO-R1 — Real-provider acceptance readiness (owner-gated)

- **State:** PREPARATION ONLY. No real-provider call, deployment, Devpost upload or submission authorized.
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
