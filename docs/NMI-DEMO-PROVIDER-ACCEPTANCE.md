# NudgeMyInvoice — Real-provider acceptance procedure (PREPARED, NOT EXECUTED)

> **Nothing in this document has been run.** No OpenAI request, no PayPal request, no budget reset and no PayPal drafting has happened in R0, R1 or any documentation task. This is an **execution-ready procedure for the owner** with three independent gates (A OpenAI, B PayPal Sandbox, C combined browser). Each gate needs its **own written owner authorization** (`docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`). Approval of one gate is not approval of another. A documentation merge, a README line, "next", this file, or a previous approval is **never** an authorization. Evidence templates: `docs/NMI-DEMO-EVIDENCE-TEMPLATES.md`.

## 1. What is and is not verified today

| Claim | Status | Basis |
| --- | --- | --- |
| Real PayPal Sandbox OAuth, **one** create, one read-only show (USD 5.00, DRAFT), backend only, 2026-10-26 | **REAL PASS (historical)** | Owner-local sanitized evidence (`NMI-P2-I2-SANDBOX-SMOKE-01`). Its one-create budget is **1/1, exhausted**; nothing here resets it. |
| Real OpenAI Responses parsing | **PENDING** (never executed) | Gate A |
| New PayPal Sandbox DRAFT (USD 540.00) through the browser path | **PENDING** | Gate B |
| Complete real-provider browser walkthrough | **PENDING** | Gate C |
| PayPal search / reconciliation / timeout / error paths against the real Sandbox | **NOT TESTED** | Fake transports + PostgreSQL tests only |
| All UI/browser journeys to date (C1–C5, R0, NMI-AG1) | **SIMULATED** | Deterministic fakes; never provider acceptance |

## 2. Evidence rules (REAL vs SIMULATED)

1. Every result carries exactly one label: **PENDING** (not run), **REAL PASS**, **REAL FAIL**, **SIMULATED** (fake provider, fake transport, interception, fixture). No other wording.
2. A result is REAL only if it came from the real provider in a run covered by a written authorization, the operator recorded the run ID, and the redacted evidence template is filled from observed output. If any part is unobserved, write **PENDING** for that field; never infer, estimate silently or paste an expected value as an observed one.
3. Fake-provider output, the simulated launcher (`NMI_SIMULATED_EVAL=1`), Chrome request interception and earlier journeys are **SIMULATED** forever, even if they look identical.
4. A REAL FAIL is reported as-is. No second attempt, other model or workaround is allowed without a new authorization.
5. Public claims (Devpost, video, README) may use only labels from the filled templates. Until a gate shows REAL PASS, the claim stays "not verified live".
6. **Never** record or commit: API keys, client id/secret, bearer tokens, request headers, session cookies, account e-mails, PayPal merchant/payer ids, full PayPal invoice ids, OpenAI organisation/project ids, billing details, raw prompts beyond the synthetic strings below, terminal transcripts that echo secrets, or screenshots showing any of them.
7. Evidence files are committed only after the owner has read them. The coding agent never holds provider credentials and never runs a gate.

## 3. Common operator hygiene (every gate)

- Run ID format `R1-<A|B|C>-YYYYMMDD-NN`. One run ID per authorization; a rerun needs a new authorization.
- Use a **fresh disposable PostgreSQL database** per gate (runbook sections 3–5) so counts start at zero and evidence cannot be confused with older data. Provision a new operator with a random password (runbook section 5).
- Enter secrets only at silent prompts or from your secret store (runbook Mode B pattern: `read -rs`). Never put a secret in a command line, `.env` committed to git, screenshot, chat or ticket. Use a **dedicated** key / REST app credential for the run and revoke or rotate it afterwards.
- Start the **production** server (`pnpm --filter @nmi/api start`), **not** the simulated launcher. Confirm the console shows no "SIMULATED EVALUATION MODE" banner.
- Close other tabs and screen-sharing; check the terminal scrollback does not contain a secret before capturing anything.
- Time-box: if a step takes unexpectedly long, **stop** (see the STOP lists); do not repeat a provider-facing action to "see if it works now".
- After every gate: stop the API (Ctrl-C), `unset` the provider variables in that shell, confirm `PAYPAL_DRAFTS_ENABLED` is `false` (or unset) for any later start, and record the teardown in the template.

## 4. Gate A — OpenAI Responses (real parsing), up to 3 calls

### 4.1 Proposed model and verified facts (sources checked 2026-10-29; recheck on the run day)

| Fact | Value | Source |
| --- | --- | --- |
| Proposed model id | `gpt-6-luna` (default and only listed snapshot) | https://developers.openai.com/api/docs/models/gpt-6-luna |
| Responses API | Supported (`v1/responses`) | same page |
| Structured Outputs | Listed as supported | same page |
| Standard text price (short context, ≤ 272K input) | **USD 0.10 / 1M input tokens, 0.50 / 1M output tokens** (cached input 0.01) | https://developers.openai.com/api/docs/pricing |
| Context / max output | 1,050,000 / 128,000 tokens; reasoning tokens supported; default reasoning effort **medium** | model page |

Compatibility with this repository (static review, no request made): `packages/ai/src/client.ts` calls `openai.responses.parse({ model, instructions, input, store: false, max_output_tokens, text: { format: zodTextFormat(schema, "invoice_draft") } })`, which is the Responses + Structured Outputs shape the model page lists. `store:false`; the model never computes money (the server recomputes totals in integer minor units); any provider error, null parse or domain-validation failure becomes `unavailable`/`invalid` with the manual-entry fallback and no provider text shown.

**The owner must still confirm privately** that the account/project has access to `gpt-6-luna` and the quoted prices (account dashboard or the models list endpoint **without** creating a response). Entitlement is not proven by the public page.

### 4.2 Two static findings the owner must decide before authorizing (no code change is made in R1)

| # | Finding | Effect | Options (owner decides in the Gate A authorization) |
| --- | --- | --- | --- |
| A-F1 | The OpenAI client is built with `maxRetries: 1` (SDK default behaviour is therefore **one transparent resend** after a connection error, 408, 409, 429 or 5xx). The application counts **parse requests**, not HTTP requests. | "At most 3 calls" can mean up to **3 application parses but up to 6 HTTP requests** if every request is retried once. | **(a, recommended)** Accept it: the cap is 3 parse attempts; the hard bound is the provider-side spend limit and the STOP rule "any non-2xx ends the run"; the operator reports the provider's own request count. **(b)** Require a separate, owner-approved code task that sets `maxRetries: 0` for the acceptance run **before** Gate A is authorized (not part of R1). |
| A-F2 | `gpt-6-luna` defaults to reasoning effort **medium**; the repo does not set `reasoning` and `OPENAI_MAX_OUTPUT_TOKENS` defaults to 1024 (allowed 64–4096). Reasoning tokens count toward `max_output_tokens`. | A 1024 or 512 cap may end `incomplete` with no parsed object: a billed call that fails closed to manual entry and spends one of the three. | **(a, recommended)** Run with `OPENAI_MAX_OUTPUT_TOKENS=4096` (configuration only; ceiling cost below). **(b)** Require a separate code task to set `reasoning: { effort: "low" }`/`"none"`. Do **not** shrink the cap to 512. |

### 4.3 Cost ceiling (arithmetic, not a measurement)

Per call: input ≈ 300–400 tokens (instructions ≈ 250 + synthetic input ≈ 40–60) × USD 0.10/1M ≈ USD 0.00004; output ≤ 4,096 tokens × USD 0.50/1M = USD 0.002048. **Worst case ≈ USD 0.0021 per call, USD 0.0063 for 3 calls, USD 0.0126 if every call were resent once (6 requests)**, excluding any other usage. The owner still sets a provider-side limit (a dedicated project/key with the lowest available budget cap, e.g. USD 1; if the account offers no cap, a dedicated key revoked immediately after the run). Rates may change: recheck the pricing page on the run day; stop if the price differs materially.

### 4.4 Synthetic inputs (fictitious; no PII). Exactly these strings, no others

| Call | Input text | Purpose | Expected outcome (not a result) |
| --- | --- | --- | --- |
| A1 | `Invoice Northwind Studio for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15 to ap@northwind.example` | USD parse, tax, due date | Review shows customer Northwind Studio, `ap@northwind.example`, USD, one line qty 2 × 250.00, tax 8, due 2030-01-15; server total after save **USD 540.00** |
| A2 | `Invoice Vienna Cafe for 3 brand audits at 199.99 EUR each, due 2030-03-01 to cafe@vienna.example` | EUR parse, 2-decimal currency | EUR, qty 3 × 199.99, due 2030-03-01; server total after save **EUR 599.97** |
| A3 (optional) | `Invoice Harbor Print for 4 poster designs at 75 USD each to billing@harbor.example` | Missing due date → the app must ask / not invent one | A clarification question (or manual fallback), **no** invented due date; nothing saved |

A3 is skipped if A1 or A2 failed. A provider *failure* is not provoked deliberately (no invalid-key test: it would be a call and would require handling a wrong secret). Fallback on a real provider failure is therefore **SIMULATED** evidence (existing C2 journeys) unless a genuine failure occurs during the run, in which case it is recorded as REAL FAIL with the fallback observed.

### 4.5 Operator checklist (owner executes; the agent does not)

Prerequisite: written Gate A authorization with model, A-F1/A-F2 choices and call cap.

1. [ ] Run ID chosen; fresh disposable database migrated (7 migrations) and operator provisioned (runbook 3–5).
2. [ ] Provider-side limit set; dedicated key created; model entitlement and price confirmed **without** a billable request. Record only "confirmed / not confirmed".
3. [ ] In a new shell (secrets via silent prompts), set exactly:
   ```bash
   export SESSION_SECRET="$(openssl rand -base64 48)" WEB_ORIGIN=http://localhost:5173 PORT=3001
   export PAYPAL_ENV=sandbox PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
   export PAYPAL_DRAFTS_ENABLED=false
   unset PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET
   export OPENAI_MODEL=gpt-6-luna OPENAI_MAX_OUTPUT_TOKENS=4096   # per the authorization
   printf 'OpenAI API key (hidden): '; read -rs OPENAI_API_KEY; echo; export OPENAI_API_KEY
   pnpm --filter @nmi/api start
   ```
4. [ ] `curl -s http://127.0.0.1:3001/health` shows `"paypalEnvironment":"sandbox"` and `"aiConfigured":true`. No SIMULATED banner. PayPal credentials are unset and drafting is `false` (check with `[ -z "${PAYPAL_CLIENT_ID-}" ] && echo unset`).
5. [ ] Start the web app (runbook 7), sign in, open DevTools → Network (preserve log) to read the `POST /api/invoice-drafts/parse` status and time. A browser tab with only the app.
6. [ ] Counter before: calls used **0/3**. A1: paste the exact text → *Parse with AI* **once**. Do not click again while it runs. Record HTTP status, response time, and what the Review screen shows (field by field against 4.4). Counter **1/3**.
7. [ ] Save A1 (Review → Save). Confirm the saved page total is **USD 540.00** (server-computed) and the dashboard row exists. (This proves model output was re-validated and money was recomputed by the server.)
8. [ ] A2 exactly as step 6–7 (counter **2/3**), expected **EUR 599.97**; dashboard shows separate USD and EUR cards, never summed.
9. [ ] A3 (optional, counter **3/3**): expect a clarification/manual path and no invented due date. Do not save.
10. [ ] Verify nothing else happened: `psql "$DATABASE_URL" -tAc "select count(*) from paypal_draft_operations"` is **0**; no PayPal control was used.
11. [ ] Usage evidence: from the provider's usage/billing page for that dedicated key/project (may lag) read **request count, input tokens, output tokens, cost** per call or in total. If not yet visible write **PENDING (provider dashboard lag)**; do not estimate. Server and browser do not record tokens.
12. [ ] Teardown: Ctrl-C the API; `unset OPENAI_API_KEY OPENAI_MODEL OPENAI_MAX_OUTPUT_TOKENS`; revoke/rotate the key; drop the disposable database (runbook 11).
13. [ ] Fill the Gate A template, mark each field REAL / PENDING, review it for secrets, hand it to the agent for committing.

### 4.6 STOP conditions (end the run; report; no retry)

- Any OpenAI response other than HTTP 200 on a parse; any `unavailable`/`invalid` outcome on A1 or A2 (that is a **REAL FAIL**, recorded with the fallback observed).
- Any request count above the authorized cap per the provider's own usage, any unexpected cost, a different model name in the usage page, or a price different from 4.1.
- Real PII or any non-synthetic text typed or pasted; any secret visible on screen or in the terminal.
- A PayPal credential present, `PAYPAL_DRAFTS_ENABLED` not `false`, any `paypal_draft_operations` row, or a SIMULATED banner.
- A parse that returns totals different from the server's recomputation being shown as authoritative, or a due date invented for A3 (REAL FAIL of the validation contract; stop and report).
- The operator is unsure which step is next: stop.

### 4.7 Acceptance criteria

**REAL PASS (Gate A)** requires: A1 and A2 each HTTP 200 and a validated draft whose fields equal 4.4; server totals USD 540.00 and EUR 599.97; no PayPal operation row; PayPal credentials absent; usage captured or explicitly PENDING; no secret in evidence; run within the call cap. A3, if run, must not invent a due date. Anything else is REAL FAIL or PENDING, labelled exactly. A REAL PASS proves only that this model, schema and these two synthetic inputs worked once; it does not prove accuracy, robustness or cost at scale.

## 5. Gate B — PayPal Sandbox (one new DRAFT), exactly one create

### 5.1 Fixed facts and limits

- App: existing Sandbox REST app **`NudgeMyBillsAI`**, the existing US Sandbox **Business** account, Invoicing v2, `PAYPAL_ENV=sandbox`, `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com` (the server refuses any other host).
- Historical one-create budget **1/1 exhausted**; this gate neither resets nor bypasses it. The permit is **one new** create, valid only for the run ID in the authorization, then it is **0 left**.
- One synthetic invoice, entered **manually** in the UI (Gate B does not use OpenAI and OpenAI credentials stay unset): customer `Northwind Studio`, `ap@northwind.example`, **USD**, one line `Logo concepts` qty `2` × `250.00`, tax `8%`, no discount, due `2030-01-15` → 500.00 + 40.00 = **USD 540.00** exactly.
- Permitted PayPal traffic: OAuth token; exactly **one** create-DRAFT request; read-only `GET` of the created invoice (the service does this to verify); a read-only search by the invoice number **only** if the create outcome is uncertain (the service's own reconciliation). **No** send, remind, record payment, cancel, delete, refund, webhook, Live host, or second create. **No retry of any kind**, automatic or manual, even on timeout or `unknown`.
- Static findings (R1 review of `paypal-draft-service.ts`/adapter): creation is a fenced single claim with `attempts` incremented before the request; an uncertain outcome becomes `unknown` and is resolved by read-only reconciliation, never a blind re-create; the adapter has per-request timeouts and no automatic re-create. The earlier "one-create guard" was a private test harness outside this repository; **there is no in-repository counter**, so the bound for this gate is procedural plus the database evidence below. This is why the checklist forbids clicking *Create* twice and why the permit ends at the run.

### 5.2 Operator checklist (owner executes)

Prerequisite: written Gate B authorization naming the run ID.

1. [ ] PayPal Developer dashboard, **Sandbox** mode: app is `NudgeMyBillsAI`, Invoicing enabled, tied to the intended Business account; no Live app/credential is in use. In the Sandbox Business account's invoice list note the **number of existing invoices/drafts** (record the count only): N.
2. [ ] Fresh disposable database migrated and operator provisioned (runbook 3–5); verify `select count(*) from invoices` = 0 and `select count(*) from paypal_draft_operations` = 0.
3. [ ] New shell, secrets via silent prompts; **OpenAI unset**:
   ```bash
   export SESSION_SECRET="$(openssl rand -base64 48)" WEB_ORIGIN=http://localhost:5173 PORT=3001
   export PAYPAL_ENV=sandbox PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
   unset OPENAI_API_KEY OPENAI_MODEL
   printf 'PayPal SANDBOX client id: '; read -r PAYPAL_CLIENT_ID; export PAYPAL_CLIENT_ID
   printf 'PayPal SANDBOX secret (hidden): '; read -rs PAYPAL_CLIENT_SECRET; echo; export PAYPAL_CLIENT_SECRET
   export PAYPAL_DRAFTS_ENABLED=true
   pnpm --filter @nmi/api start
   ```
4. [ ] `/health` shows `"paypalEnvironment":"sandbox"`, `"aiConfigured":false`; no SIMULATED banner. Web app up (runbook 7), signed in, DevTools Network open (preserve log).
5. [ ] New invoice → *Enter manually* → *Open blank invoice form* → enter exactly the 5.1 data → *Save draft*. Saved page shows server total **USD 540.00**. SQL: `select currency,total_minor,due_date from invoices` → `USD | 54000 | 2030-01-15`; operations count still **0**.
6. [ ] Open the saved invoice → *Create PayPal Sandbox draft…*. Read the confirmation: exact invoice, customer, USD, 540.00, "customer not emailed". Counter before: creates used **0/1**.
7. [ ] Click confirm **once**. Do not double-click, reload, go back and re-submit, or open a second tab. Wait for the outcome (up to the UI's own timeout).
8. [ ] Observed outcome → record. If the page shows in-progress, `unknown` or reconciliation pending: **only** wait, then use the read-only *Check status*. **Never** click create again (if a create control is still visible, do not use it).
9. [ ] DevTools: exactly **one** `POST …/paypal-draft` from the browser. SQL (read-only, mask ids):
   ```bash
   psql "$DATABASE_URL" -tAc "select state, attempts, (paypal_invoice_id is not null) as has_remote, right(paypal_invoice_id,4) as remote_tail from paypal_draft_operations"
   psql "$DATABASE_URL" -tAc "select count(*) from paypal_draft_operations"
   psql "$DATABASE_URL" -tAc "select currency, total_minor, due_date, (paypal_invoice_id is not null) from invoices"
   ```
   Expect one row: `created | 1 | t | <last 4>`, count `1`, invoice `USD | 54000 | 2030-01-15 | t`.
10. [ ] PayPal dashboard (Sandbox Business account, read-only): the invoice count is **N+1**; the new item is **DRAFT** (not sent/unpaid/paid), currency USD, total 540.00, due 2030-01-15, number `NMI-` + 20 hex characters. Record these values; mask the PayPal invoice id to its last 4 characters and omit account e-mails/ids.
11. [ ] App check: detail shows `PayPal draft created` and the dashboard row reads "PayPal draft created".
12. [ ] **Immediately** after: Ctrl-C the API (drafting off), `unset PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET PAYPAL_DRAFTS_ENABLED`, rotate or delete the REST app secret if the owner wishes, drop the disposable database, and confirm any later start has `PAYPAL_DRAFTS_ENABLED=false`. Record the teardown time.
13. [ ] Fill the Gate B template (REAL / PENDING per field), review for secrets/ids, hand over. The owner must **not** delete the Sandbox draft (the agent never touches it; deletion is the owner's separate choice and is not part of this procedure).

### 5.3 STOP conditions

- Any non-Sandbox host or Live credential; the server refuses to start, or `/health` says anything other than sandbox.
- OpenAI credentials present (Gate B must not call OpenAI); a SIMULATED banner.
- Operations or invoices not zero before the create; more than one invoice created in the app.
- Any second create request (browser DevTools shows two POSTs, `attempts` ≠ 1, two operation rows) → stop, report, no cleanup action.
- Outcome `rejected`, `unknown` or `mismatch`: stop at the read-only status, record **REAL FAIL** (or PENDING if unresolved), **do not** retry or recreate.
- Remote draft not DRAFT, or currency/total/due date differ from 5.1 → REAL FAIL.
- Any secret, account e-mail or id visible in a screenshot/terminal; real customer data typed.

### 5.4 Acceptance criteria

**REAL PASS (Gate B)** requires all of: one browser create POST; one operation row `created`, `attempts=1`; invoice linked; PayPal dashboard shows exactly one new item, status DRAFT, USD 540.00, due 2030-01-15; drafting disabled again; no send/remind/pay; evidence redacted. It proves one Sandbox DRAFT through the browser path; it does **not** prove search/reconciliation/timeout behaviour.

## 6. Gate C — combined real-provider browser walkthrough (separate approval)

Not run, not authorized. Request form: `docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md` request C. Conditions: Gate A **and** Gate B each **REAL PASS** and independently reviewed; a **new** PayPal one-create permit is **not** implied (Gate B's single create is spent). Therefore Gate C is by default a walkthrough of the **real OpenAI parse + save + dashboard** plus **showing the already-created Gate B DRAFT state read-only**, with the create step labelled as recorded earlier (REAL, from the Gate B run) — it does **not** create another PayPal draft. A live second create would require a **third** explicit permit; the plan does not request one. Recording rules: `docs/NMI-DEMO-VIDEO-SCRIPT.md`. Until approved and executed: **PENDING**.

## 7. What changes in public wording after each outcome

| Outcome | Allowed wording | Still forbidden |
| --- | --- | --- |
| Nothing run (today) | "OpenAI parsing implemented, not verified live; one historical real Sandbox DRAFT (backend, USD 5.00); everything else simulated." | Any "works with OpenAI/PayPal live" claim |
| Gate A REAL PASS | "Real parsing verified once with `gpt-6-luna` on two synthetic inputs (date)." | Accuracy, cost-at-scale, reliability claims |
| Gate B REAL PASS | "One Sandbox DRAFT created through the browser path and verified (date)." | Sending, payment, reconciliation claims |
| Gate C REAL PASS | Walkthrough label as recorded, each step LIVE/SIMULATED | "Production ready", hosted, sponsor outcome |
| Any REAL FAIL | State the failure plainly | Hiding or retrying silently |

## 8. Authorization requests

Use `docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`: **Request A**, **Request B** and **Request C** are separate documents to answer separately. Silence, "continue" or approval of a different request is **no**.
