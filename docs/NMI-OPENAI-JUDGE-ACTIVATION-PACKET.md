# NMI OpenAI Judge Activation Packet (DRAFT — NOT AUTHORIZED)

**State:** PROPOSAL ONLY. No live OpenAI request, credential, environment change, deploy, or URL share is authorized by this document. Each numbered approval below is a separate explicit owner decision. Gate A run `R1-A-20261030-01` permission is consumed and does not transfer.

## 1. Exact environment matrix (limited judge mode)

Set only in the Render secret store / dashboard by the owner (never in Git, issues, logs, or screenshots). Verify with `release-preflight env` against the actual service configuration before any public sharing.

| Variable | Required value | Notes |
|---|---|---|
| `NMI_JUDGE_AI_MODE` | `limited` | Explicit opt-in; absent/off keeps providers disabled (SEC-01 fail-closed, audited) |
| `OPENAI_API_KEY` | server-side key, `sk-…`, ≥20 chars, no whitespace | Dedicated judge project key; never a browser/`VITE_` variable |
| `OPENAI_MODEL` | `gpt-6-luna` | Exact match enforced by config + preflight |
| `OPENAI_MAX_OUTPUT_TOKENS` | `4096` | Exact match enforced (parser cap; nudge path capped at 600 server-side) |
| `NUDGE_AI_DRAFTING_ENABLED` | `true` | Explicit opt-in; drafting endpoint 503s without it |
| `PAYPAL_DRAFTS_ENABLED` | `false` | Unchanged; limited mode **forbids** `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` |
| `NODE_ENV` / `HOST` / `TRUST_PROXY` | `production` / `0.0.0.0` / `1` | Unchanged hosted shape |
| `NMI_WEB_STUDIO` / `AG_STUDIO_LICENSE_KEY` | `licensed` / owner licence | Unchanged licensed release |

`PAYPAL_ENV=sandbox` and `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com` stay unchanged.

## 2. Required verifications (all before any live call)

1. **Model entitlement:** owner confirms the dedicated project can access `gpt-6-luna` (dashboard or one off-band check); record date. Do not probe from the app.
2. **Spending limits:** owner sets a project-level USD hard cap and confirms the ceiling, billing alerts, and who can raise it. Record the cap amount and the kill-switch holder.
3. **Total wire-call cap + expiry:** owner states the maximum total OpenAI requests for judging (e.g. N parse + M nudge drafts) and an expiry timestamp; record both. Server-side in-memory budgets (3 requests/10 min/endpoint, concurrency 1, reset on restart) are **not** a financial cap and must never be cited as one.
4. **Synthetic inputs only:** every live input is pre-approved synthetic text from `docs/NMI-DEMO-EVIDENCE-TEMPLATES.md`; no real customer data, no new inputs without a new approval.
5. **Usage monitoring:** owner watches provider usage (requests, input/output tokens, spend) during the judging window; define the check cadence and the abort threshold.
6. **Emergency disablement (rehearsed order):** (a) remove `NMI_JUDGE_AI_MODE`/`OPENAI_API_KEY`/`NUDGE_AI_DRAFTING_ENABLED=true` from the service env; (b) manual redeploy of the pinned SHA; (c) verify `/health` reports provider-disabled and `release-preflight env` passes the provider-disabled matrix; (d) confirm no new provider usage after the timestamp.
7. **Credential revocation/rotation:** owner holds rotation steps (revoke key at provider → replace in secret store → redeploy → verify); leaked-key response is revoke-first, investigate-second.
8. **Output/token accounting:** record per-run wire attempts, input/output tokens, HTTP status/latency, and spend; PENDING fields from Gate A (output tokens, status/latency, model-on-usage-page, limit amount) must be filled this time, not assumed.

## 3. What activation does NOT change

- No send/reminder/refund/cancel/`markPaid`/capture path is enabled; AI proposes and drafts for human approval only (payment approval boundary, `packages/domain`).
- PayPal stays Sandbox draft-only and disabled unless its own separate Gate B approval exists.
- No second Render service, no paid resource, no public URL without the separate G6/URL approvals.

## 4. Approvals checklist (each separate, all required)

- [ ] Candidate SHA + protected branch creation approved
- [ ] Manual-CI exception (exact SHA) independently audited and owner-accepted
- [ ] This activation packet approved with concrete cap/expiry/inputs recorded
- [ ] Model entitlement + project USD cap verified and recorded
- [ ] Deploy action approved → post-deploy verification passed
- [ ] Judge URL sharing approved (after live QA)
