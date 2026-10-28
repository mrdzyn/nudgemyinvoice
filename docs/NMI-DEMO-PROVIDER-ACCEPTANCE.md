# NudgeMyInvoice — Real-provider acceptance plan (NOT EXECUTED)

> **Nothing in this document has been run.** NMI-DEMO-R0 made no OpenAI or PayPal request, did not reset any budget and did not enable PayPal drafting. This is a plan with **two independent approval gates**. Each real-provider test needs its own explicit owner authorization; approval of one is not approval of the other, and neither is implied by anything in the repository.

## What is and is not verified today

- **Verified against a real provider (historical, backend only):** `NMI-P2-I2-SANDBOX-SMOKE-01` on 2026-10-26: real PayPal Sandbox OAuth 200, **one** invoice-create 201 and a read-only show 200 for a fictitious USD 5.00 invoice; DRAFT status; no send/remind/pay. That budget (one create) is **exhausted** and is not reset by this plan.
- **Not verified:** real OpenAI Responses parsing; any complete real-provider **browser** journey; PayPal search/reconciliation/timeout/error paths against the real Sandbox (mock-tested only).
- Every UI/browser journey to date used deterministic fakes (labelled SIMULATED).

## Gate A — OpenAI Responses (real parsing)

| Item | Proposal |
| --- | --- |
| Purpose | Prove the real `openai` SDK Responses call with `zodTextFormat` structured output works with the project's strict schema and falls back safely on failure. |
| Model | **Owner to choose.** A currently supported low-cost small model from OpenAI's model list (the repo requires `OPENAI_MODEL` and has no default). R0 did not look up live model names or prices; the owner must verify availability and price on the day. |
| Exact input (synthetic, no PII) | `Invoice Northwind Studio for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15 to ap@northwind.example` — all fictitious. Optional second input to exercise currency: `Invoice Vienna Cafe for 3 brand audits at 199.99 EUR each, due 2030-03-01 to cafe@vienna.example`. |
| Token / cost envelope | Instructions (~250 tokens) + input (~40 tokens) in; structured output capped by `OPENAI_MAX_OUTPUT_TOKENS` (default 1024, recommend 512). Roughly **≤ 1,500 tokens per call** including output. At a small-model price this is a fraction of a cent per call; **confirm the price before running** and set a provider-side spend limit. |
| Maximum calls | **3** total (one per input above plus one deliberate failure check below). The server already bounds parse calls (20 / 10 min per operator, 2 concurrent). |
| Expected structured fields | `customerName`, `customerEmail`, `currency` (supported ISO code), `lineItems[{description,quantity,unitPrice}]`, `dueDate` (YYYY-MM-DD), `taxPercent`, `discount` (null). Totals are computed by the server, never by the model. |
| Failure behaviour | Provider/timeout/schema failure -> `{status:"unavailable", fallback:"manual_entry"}` or `{status:"invalid"}`; the UI offers manual entry; no provider text is surfaced. |
| Pre-flight | `OPENAI_API_KEY` supplied only in the owner's shell/secret store; key restricted/limited at the provider; `store:false` is already set in the client; run with PayPal drafting **disabled**. |
| Evidence and redaction | Record: HTTP status, model name, validated field names and values (synthetic), token usage counts, latency, call count. **Never** record the key, request headers, account ids or any real customer data. Screenshots must show only synthetic data. |
| Stop conditions | Any unexpected cost, a non-2xx other than the planned failure check, or any real PII in the input. |

## Gate B — PayPal Sandbox (real DRAFT creation)

| Item | Proposal |
| --- | --- |
| Environment verification (before any call) | `PAYPAL_ENV=sandbox`, `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com`; the server's allow-list already refuses any other host. Owner confirms in the PayPal Developer dashboard that the app is the **Sandbox** REST app `NudgeMyBillsAI` (Merchant, Invoicing enabled) tied to the existing US Sandbox **Business** account. Credentials only in the owner's shell/secret store. |
| Exact merchant account | The existing US Sandbox Business test account associated with `NudgeMyBillsAI` (identified privately by the owner; not published). |
| Exact synthetic invoice | One invoice created in the app: customer `Northwind Studio` (`ap@northwind.example`), **USD**, one line `Logo concepts` quantity `2` × `250.00`, tax `8%`, due `2030-01-15` (maps exactly: 500.00 + 40.00 = **USD 540.00**, no rounding). A second currency test is **not** proposed (budget). |
| Maximum calls | **At most ONE new draft-create call.** Plus read-only verification: OAuth token, `GET` of the created invoice (the service does this to verify), and, only if needed, one search-by-number. **No second create under any circumstance.** |
| Existing budget | The earlier one-create budget (2026-10-26) is exhausted and acknowledged. This plan **requires a new, explicit owner authorization of exactly one new create**; it does not reset or bypass anything. |
| Execution | Through the real UI path only: save -> *Create PayPal Sandbox draft…* -> confirm. Drafting is enabled **only** for the run (`PAYPAL_DRAFTS_ENABLED=true`) and set back to `false` afterwards. |
| Retries | **None, automatic or manual.** If the outcome is uncertain, use *Check status* (read-only) and the server's reconciliation; do not click create again. |
| Success validation | UI shows the validated DRAFT id; PostgreSQL has one `paypal_draft_operations` row `created`, `attempts=1`, id linked on the invoice; the PayPal Sandbox dashboard shows one DRAFT with identical currency, total and due date; GET detail returns `paypal.state="created"`. |
| Forbidden | Send, remind, pay, refund, cancel, mark paid, webhooks, any Live host, a second create. The app has no such routes. |
| Evidence and redaction | Record: HTTP statuses, call counts, DRAFT status, invoice number, state transitions. Redact the client id/secret, tokens, merchant/buyer account emails and any account ids; use the synthetic customer only. |
| Stop conditions | Any non-Sandbox host, any unexpected second request, mismatch/unknown outcome (then stop and report), or any real customer data. |

## Owner authorization requests (to be answered separately)

1. **Authorize Gate A?** *"I authorize up to 3 real OpenAI Responses calls with model `<owner chooses>`, using only the synthetic inputs above, with PayPal drafting disabled, evidence redacted as described."* — yes / no / changes.
2. **Authorize Gate B?** *"I authorize exactly ONE new PayPal Sandbox draft-create call (plus the read-only verification calls listed) for the single synthetic USD 540.00 invoice above, against the verified Sandbox app, with no retry, no send/remind/pay/refund/cancel, and drafting disabled again afterwards."* — yes / no / changes.
3. **Authorize a combined real browser journey?** (Gate A then Gate B in one recording.) Separate approval; only after A and B each passed.

**PayPal drafting is never re-enabled quietly.** Until written authorization exists, `PAYPAL_DRAFTS_ENABLED` stays `false` by default and the demo uses the SIMULATED mode.
