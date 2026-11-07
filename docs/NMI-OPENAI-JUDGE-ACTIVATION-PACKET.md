# NMI OpenAI Judge Activation Packet (OWNER-APPROVED SCOPE — REMAINING GATES STILL REQUIRED)

**State:** The owner has approved: OpenAI-enabled Render deployment (subject to remaining technical and security gates); protected candidate `82996c4a3c582ef14c7a54051eb3fbdbf107c79d`; the independently audited one-time manual release-CI substitution including the macOS/Ubuntu gap; no additional cumulative API-call cap; retaining the enforced $5 project spending limit. These approvals are recorded here, not requested again. Still required before any live call: deploy action, post-deploy verification, live QA, judge URL sharing, and the monitoring/kill-switch/sunset commitments below. No live OpenAI request, credential, environment change, deploy, or URL share is authorized by this document alone. Gate A run `R1-A-20261030-01` permission is consumed and does not transfer.

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

1. **Model entitlement (owner-evidenced):** `gpt-6-luna` is allowlisted on the dedicated project per owner-supplied evidence. Record date. Do not probe from the app.
2. **Spending limit (owner-evidenced, enforced):** $5 monthly project spending limit with **"Enforce a hard limit" (Limit enforced)** ON, per owner-supplied screenshot evidence (reviewed privately, never committed). A limit without the enforcement toggle only monitors — requests continue — so the toggle is the control. Record: the $5 amount and monthly scope; dated evidence the toggle is ON; an **advance spending alert below $5**; the kill-switch holder plus the spend level that triggers owner shutdown. Enforcement takes effect with delay: usage may slightly exceed $5, and an alert threshold is not protection — so there is **no perfect dollar guarantee**; the alert, the enforced cap, and the shutdown threshold together bound (not eliminate) overshoot.
3. **No cumulative API-call cap (owner decision):** no additional total-request cap is required. The operative bounds are: per-operator server-side rate limits (3 requests/10 min/endpoint, reset on restart), concurrency 1 per endpoint, SDK retries 0 in limited mode, authenticated operator-only access, synthetic-data-only inputs, and PayPal-disabled state. In-memory budgets are **not** a financial cap and must never be cited as one; the $5 enforced project limit (§2) is the financial control.
4. **Synthetic inputs only:** every live input is pre-approved synthetic text from `docs/NMI-DEMO-EVIDENCE-TEMPLATES.md`; no real customer data, no new inputs without a new approval.
5. **Usage monitoring + sunset:** owner watches provider usage (requests, input/output tokens, spend) on a defined cadence with an abort threshold, through **provider-use sunset at the end of December 15, 2026, unless separately extended**. After sunset, the key is revoked or the limit lowered to block further use until an extension is approved.
6. **Emergency disablement (rehearsed order):** (a) remove `NMI_JUDGE_AI_MODE`/`OPENAI_API_KEY`/`NUDGE_AI_DRAFTING_ENABLED=true` from the service env; (b) manual redeploy of the pinned SHA; (c) verify `/health` reports provider-disabled and `release-preflight env` passes the provider-disabled matrix; (d) confirm no new provider usage after the timestamp.
7. **Credential revocation/rotation:** owner holds rotation steps (revoke key at provider → replace in secret store → redeploy → verify); leaked-key response is revoke-first, investigate-second.
8. **Output/token accounting:** record per-run wire attempts, input/output tokens, HTTP status/latency, and spend; PENDING fields from Gate A (output tokens, status/latency, model-on-usage-page, limit amount) must be filled this time, not assumed.

## 3. What activation does NOT change

- No send/reminder/refund/cancel/`markPaid`/capture path is enabled; AI proposes and drafts for human approval only (payment approval boundary, `packages/domain`).
- PayPal stays Sandbox draft-only and disabled unless its own separate Gate B approval exists.
- No second Render service, no paid resource, no public URL without the separate G6/URL approvals.

## 4. Approvals checklist

Already approved by owner (recorded, not requested again):

- [x] Candidate SHA + protected branch creation (`82996c4…` on `release/nmi-openai-judges-2026`)
- [x] Manual-CI exception (exact SHA) independently audited and owner-accepted, macOS/Ubuntu gap included
- [x] No additional cumulative API-call cap
- [x] Enforced $5 monthly project spending limit + `gpt-6-luna` allowlisting (screenshot-evidenced)

Still required (separate owner actions):

- [ ] Advance spending alert, monitoring cadence, kill-switch holder, and Dec-15-2026 sunset commitment recorded
- [ ] Deploy action approved → post-deploy verification passed
- [ ] Judge URL sharing approved (after live QA)
