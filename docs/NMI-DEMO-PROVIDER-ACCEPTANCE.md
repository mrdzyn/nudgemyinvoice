# NudgeMyInvoice — Real-provider acceptance procedure (Gate A EXECUTED / CLOSED; Gates B and C PREPARED, NOT EXECUTED)

> **Gate B remains BLOCKED / NOT AUTHORIZED.** The historical PayPal create-side HTTP 401 resend defect was corrected, independently audited (review `5692753316`) and owner squash-merged into `main` at `09bbe90a977516c27bc0715141e74e090b41fba5` (PR #19). The server-to-PayPal send-attempt counting procedure (`docs/NMI-DEMO-R1-B-WIRE-COUNT.md`, observer SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`) was offline validated by the implementation agent (loopback and network-sandbox), independently source-audited PASS (review `5693627000`; the auditor did not rerun the suite) and owner-merged in PR #20 (`451abc292737775f0c58458520b8f5bf004cd474`); it has never been run against the real PayPal Sandbox. The only remaining prerequisite is a **new explicit Request B**. Fake transport evidence and browser/DB counts are not live PayPal egress evidence. **Gate A (run `R1-A-20261030-01`) is executed and closed (authorization consumed); Gate C remains NOT AUTHORIZED**.
>
> **Execution state.** **Gate A has been executed once** (run `R1-A-20261030-01`, owner-run 2026-10-30, provisional REAL PASS, record in `docs/NMI-DEMO-R1-A-20261030-01-EVIDENCE.md`); its authorization is **consumed** and no *additional* OpenAI call is authorized. **Gates B and C have not been run:** no PayPal request, no budget reset and no PayPal drafting has happened in R0, R1 or any documentation task. This is an **execution-ready procedure for the owner** with three independent gates (A OpenAI, B PayPal Sandbox, C combined browser). Each gate needs its **own written owner authorization** (`docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`). Approval of one gate is not approval of another. A documentation merge, a README line, "next", this file, or a previous approval is **never** an authorization. Evidence templates: `docs/NMI-DEMO-EVIDENCE-TEMPLATES.md`.

## 1. What is and is not verified today

| Claim | Status | Basis |
| --- | --- | --- |
| Real PayPal Sandbox OAuth, **one** create, one read-only show (USD 5.00, DRAFT), backend only, 2026-10-26 | **REAL PASS (historical)** | Owner-local sanitized evidence (`NMI-P2-I2-SANDBOX-SMOKE-01`). Its one-create budget is **1/1, exhausted**; nothing here resets it. |
| Real OpenAI Responses parsing | **REAL PASS (provisional)**, run `R1-A-20261030-01`: two synthetic parses, 2 provider requests, USD 540.00 / EUR 599.97 saved, 0 PayPal operations | `docs/NMI-DEMO-R1-A-20261030-01-EVIDENCE.md`; PENDING fields remain; authorization consumed |
| New PayPal Sandbox DRAFT (USD 540.00) through the browser path | **PENDING; Gate B BLOCKED** | Section 5.0 |
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

**A-F1: three application attempts are not three provider requests.** The client is built with `maxRetries: 1` (`packages/ai/src/client.ts`). The OpenAI SDK may therefore transparently resend a request once after a connection error, 408, 409, 429 or 5xx. The application issues at most **3 parse attempts**, but the provider can receive **up to 6 actual (wire) requests**, and a resent request can be billed. Request A must choose exactly one path; if neither is chosen the answer is NO:

| Path | What it means | Needed before the run |
| --- | --- | --- |
| **A-strict (3 provider requests at most)** | The only way to guarantee a hard limit of 3 wire requests. | A **separate, owner-approved and independently audited code fix** setting `maxRetries: 0` (with a unit test that one failing request produces exactly one provider request). Not part of R1; Gate A cannot use this path until that fix is merged. |
| **A-six (up to 6 wire requests)** | The cap is 3 parse attempts and the owner explicitly accepts up to **6** actual requests. | The authorization text must say "up to 6 provider (wire) requests" and state the provider-side spend limit; the transparent worst case is in 4.3; the run records the **provider-reported** request count; any count above 6 or any unexplained request is a STOP and REAL FAIL. |

**A-F2: reasoning budget.** `gpt-6-luna` defaults to reasoning effort **medium**; the repo sets no `reasoning` and `OPENAI_MAX_OUTPUT_TOKENS` defaults to 1024 (allowed 64–4096). Reasoning tokens count toward `max_output_tokens`, so a low cap can end `incomplete` with no parsed object: a billed call that fails closed to manual entry and uses one of the three attempts. Configuration-only mitigation **(recommended)**: `OPENAI_MAX_OUTPUT_TOKENS=4096` (ceiling in 4.3). Alternative: a separate audited code task setting a lower reasoning effort. Never lower the cap to 512.

### 4.3 Cost ceiling (arithmetic, not a measurement)

Per call: input ≈ 300–400 tokens (instructions ≈ 250 + synthetic input ≈ 40–60) × USD 0.10/1M ≈ USD 0.00004; output ≤ 4,096 tokens × USD 0.50/1M = USD 0.002048. **Worst case ≈ USD 0.0021 per request: USD 0.0063 for 3 requests (A-strict) and USD 0.0126 for 6 requests (A-six, every attempt resent once)**, excluding any other usage. The owner still sets a provider-side limit (a dedicated project/key with the lowest available budget cap, e.g. USD 1; if the account offers no cap, a dedicated key revoked immediately after the run). Rates may change: recheck the pricing page on the run day; stop if the price differs materially.

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
3. [ ] Open a **new** interactive bash or zsh shell in the repository root. Paste **block 1** (no comments, secrets read silently; each line is a separate command, so a failure is visible and nothing is chained):
   ```bash
   export SESSION_SECRET="$(openssl rand -base64 48)"
   export WEB_ORIGIN=http://localhost:5173
   export PORT=3001
   export PAYPAL_ENV=sandbox
   export PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
   export PAYPAL_DRAFTS_ENABLED=false
   unset PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET
   export OPENAI_MODEL=gpt-6-luna
   export OPENAI_MAX_OUTPUT_TOKENS=4096
   printf 'OpenAI API key (hidden): '
   read -rs OPENAI_API_KEY
   echo
   export OPENAI_API_KEY
   ```
   Use the model and cap written in the authorization if they differ. Then paste **block 2** (it checks the setup and does not print any secret; it prints `SETUP OK` only if every condition holds):
   ```bash
   if [ -n "${OPENAI_API_KEY-}" ] && [ -z "${PAYPAL_CLIENT_ID-}" ] && [ -z "${PAYPAL_CLIENT_SECRET-}" ] && [ "${PAYPAL_DRAFTS_ENABLED-}" = "false" ] && [ "${PAYPAL_ENV-}" = "sandbox" ]; then echo "SETUP OK"; else echo "SETUP WRONG - STOP"; fi
   ```
   Then start the API in the same shell (**block 3**; leave it running):
   ```bash
   pnpm --filter @nmi/api start
   ```
4. [ ] In a second terminal run `curl -s http://127.0.0.1:3001/health`: it shows `"paypalEnvironment":"sandbox"` and `"aiConfigured":true`. The API console shows no SIMULATED banner.
5. [ ] Start the web app (runbook 7), sign in, open DevTools → Network (preserve log) to read the `POST /api/invoice-drafts/parse` status and time. A browser tab with only the app.
6. [ ] Counter before: calls used **0/3**. A1: paste the exact text → *Parse with AI* **once**. Do not click again while it runs. Record HTTP status, response time, and what the Review screen shows (field by field against 4.4). Counter **1/3**.
7. [ ] Save A1 (Review → Save). Confirm the saved page total is **USD 540.00** (server-computed) and the dashboard row exists. (This proves model output was re-validated and money was recomputed by the server.)
8. [ ] A2 exactly as step 6–7 (counter **2/3**), expected **EUR 599.97**; dashboard shows separate USD and EUR cards, never summed.
9. [ ] A3 (optional, counter **3/3**): expect a clarification/manual path and no invented due date. Do not save.
10. [ ] Verify nothing else happened: `psql "$DATABASE_URL" -tAc "select count(*) from paypal_draft_operations"` is **0**; no PayPal control was used.
11. [ ] Usage evidence: from the provider's usage/billing page for that dedicated key/project (may lag) read **request count, input tokens, output tokens, cost** per call or in total. If not yet visible write **PENDING (provider dashboard lag)**; do not estimate. Server and browser do not record tokens.
12. [ ] Teardown: Ctrl-C the API, then in that shell run `unset OPENAI_API_KEY OPENAI_MODEL OPENAI_MAX_OUTPUT_TOKENS`; revoke/rotate the key; drop the disposable database (runbook 11).
13. [ ] Fill the Gate A template, mark each field REAL / PENDING, review it for secrets, hand it to the agent for committing.

### 4.6 STOP conditions (end the run; report; no retry)

- Any OpenAI response other than HTTP 200 on a parse; any `unavailable`/`invalid` outcome on A1 or A2 (that is a **REAL FAIL**, recorded with the fallback observed).
- Any request count above the authorized limit per the provider's own usage (**3** under A-strict, **6** under A-six; a count of 4–6 under A-strict is a REAL FAIL of the limit), any unexpected cost, a different model name in the usage page, or a price different from 4.1.
- Real PII or any non-synthetic text typed or pasted; any secret visible on screen or in the terminal.
- A PayPal credential present, `PAYPAL_DRAFTS_ENABLED` not `false`, any `paypal_draft_operations` row, or a SIMULATED banner.
- A parse that returns totals different from the server's recomputation being shown as authoritative, or a due date invented for A3 (REAL FAIL of the validation contract; stop and report).
- The operator is unsure which step is next: stop.

### 4.7 Acceptance criteria

**REAL PASS (Gate A)** requires: A1 and A2 each HTTP 200 and a validated draft whose fields equal 4.4; server totals USD 540.00 and EUR 599.97; no PayPal operation row; PayPal credentials absent; usage captured or explicitly PENDING; no secret in evidence; run within the call cap. A3, if run, must not invent a due date. Anything else is REAL FAIL or PENDING, labelled exactly. A REAL PASS proves only that this model, schema and these two synthetic inputs worked once; it does not prove accuracy, robustness or cost at scale.

## 5. Gate B — PayPal Sandbox (one new DRAFT), exactly one create — **BLOCKED**

### 5.0 FIX-B1 MERGED: historical resend fixed; live egress-count verification still BLOCKED

**Historical finding (independent review 5692235966; true of `main` at `85470d9` and of every commit before PR #19; kept as the record of why Gate B is blocked).** `packages/paypal/src/client.ts` `call()` defaulted `retryOn401 = true`: on a 401 it clears the token, fetches a new one and **calls itself again with the same method, path and body**. `createDraftInvoice()` went through `call("POST", "/v2/invoicing/invoices", …)` without turning that off, and `client.test.ts` ("a 401 refreshes the token once and resends…") asserted **two** create POSTs (`toHaveLength(2)`). So a single browser click, one operation row and `attempts=1` could still put **two** HTTP create POSTs on the wire. That contradicted the permit "exactly one draft-create request, no retry of any kind" and means the database/browser counts in 5.2 are **not sufficient evidence** of one PayPal request. (The `paypal-request-id` header is sent but the code states it is not relied on.)

**Merged implementation (FIX-B1, PR #19, `main` commit `09bbe90a977516c27bc0715141e74e090b41fba5`, independent audit PASS `5692753316`):** `createDraftInvoice` passes an explicit `create` effect and can no longer be resent after any status; a 401 after the create POST is classified **outcome unknown** (`http_401`), recorded as `unknown`, and later browser requests perform read-only search/show only; read-only show/search keep one refresh-and-resend; OAuth failure before the create sends zero create POSTs and stays a definite rejection. Counting-transport (`packages/paypal/src/client.test.ts`) and disposable-PostgreSQL (`apps/api/src/paypal-create-401.pg.test.ts`) tests prove at most one create POST per invocation for 201, 401, timeout, 5xx and malformed replies, no create after a 401, foreign-operator isolation, and two negative controls fail as expected (`design/evidence/NMI-DEMO-R1-FIX-B1/negative-control.md`). This is a proof against a fake transport; it is not provider evidence. **Gate B stays BLOCKED** until the new live send-attempt observer is offline validated on the real Node/tsx API entry point, independently audited and owner-merged, and a **new** written Request B is approved. No real-provider test occurred in FIX-B1.

**Status:** Gate B is **BLOCKED**. Request B (`docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`) must not be answered YES, and 5.1–5.4 are **reference only, not to be executed**, until the unblock conditions below are met. The PayPal one-create budget stays 1/1 exhausted. The R1 documentation PR (#18) changed no executable code; the FIX-B1 code fix is now merged into `main` via PR #19.

**Historical required-fix specification (SATISFIED IN MERGED FIX-B1):** The original future-tense requirements below document the scope audited before PR #19's owner-approved merge. The current blocker is **egress-observer evidence**, not a missing adapter code fix.
1. A draft-create POST is **never resent** after HTTP 401 (or any other status): `createDraftInvoice` must disable the 401 resend (e.g. `retryOn401 = false` for this call), so one `createDraftInvoice` invocation produces **at most one** `POST /v2/invoicing/invoices`.
2. **Safe OAuth refresh stays for read-only calls:** `GET` show and search keep the single refresh-and-resend on 401 (a second 401 is treated as an unknown read outcome). The access token is validated or refreshed **before** the create is sent (using the existing expiry logic), so an ordinary expired token does not reach the create at all.
3. **Fail closed, never silently recreate:** a 401 on the create is surfaced as a non-retried failure that the service handles through the existing fenced state machine (no second create; no automatic or implicit re-run; the operation is not left in a state that allows a blind re-create). The independently audited fix chooses conservative outcome unknown with read-only reconciliation after create 401; nothing is recreated automatically.
4. **Tests:** (a) one 401 on the create yields **exactly one** create POST and a failure that is not retried (replacing the current `toHaveLength(2)` expectation for the create path); (b) a 401 on a `GET` still refreshes once and resends; (c) a second 401 on a `GET` is treated as outcome unknown; (d) a service-level test that a 401 on create leaves `attempts=1`, no second create, no `created` state without a remote id; (e) a counting transport test proving the number of create requests equals the number of `createDraftInvoice` calls under 401, timeout and `unknown` outcomes.
5. No change to the allow-list (`guardRequest`), the Sandbox host check, the state machine's claim fencing or any other PayPal behaviour.

**Remaining unblock conditions:** (1) the server egress observer in `docs/NMI-DEMO-R1-B-WIRE-COUNT.md` (exact source, SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`) has been **offline validated by the implementation agent** (loopback and network-sandbox only; real Node fetch, the production `PayPalSandboxClient`/transport, a pre-fix negative control showing `create=2` + STOP, and the actual `pnpm`/`tsx` Fastify server process incl. shutdown summaries; record in `docs/NMI-DEMO-R1-B-WIRE-OFFLINE-TESTS.md`) and **independently source-audited PASS** (review `5693627000`, suite not rerun by the auditor), and never run against the real PayPal Sandbox; (2) **done:** independent audit and owner merge (PR #20, `451abc2`); (3) the owner must give a **NEW**, separately bounded written Request B and run ID for **one** outbound Sandbox create attempt. The source-level no-retry code and its merge are already complete; neither a browser POST nor DB `attempts=1` or an N+1 dashboard count substitutes for observing server egress. An Undici `undici:client:sendHeaders` event indicates a socket send attempt but **does not establish PayPal receipt**. Until these conditions and authorization, Gate B is **BLOCKED / PENDING**.

### 5.1 Fixed facts and limits (reference only while BLOCKED)

- App: existing Sandbox REST app **`NudgeMyBillsAI`**, the existing US Sandbox **Business** account, Invoicing v2, `PAYPAL_ENV=sandbox`, `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com` (the server refuses any other host).
- Historical one-create budget **1/1 exhausted**; this gate neither resets nor bypasses it. The permit is **one new** create, valid only for the run ID in the authorization, then it is **0 left**.
- One synthetic invoice, entered **manually** in the UI (Gate B does not use OpenAI and OpenAI credentials stay unset): customer `Northwind Studio`, `ap@northwind.example`, **USD**, one line `Logo concepts` qty `2` × `250.00`, tax `8%`, no discount, due `2030-01-15` → 500.00 + 40.00 = **USD 540.00** exactly.
- Permitted PayPal traffic: OAuth token; exactly **one** create-DRAFT request; read-only `GET` of the created invoice (the service does this to verify); a read-only search by the invoice number **only** if the create outcome is uncertain (the service's own reconciliation). **No** send, remind, record payment, cancel, delete, refund, webhook, Live host, or second create. **No retry of any kind**, automatic or manual, even on timeout or `unknown`.
- Static findings (R1 review of `paypal-draft-service.ts` and the adapter, corrected after review 5692235966): creation is a fenced single claim that increments `attempts` before the request; an uncertain outcome becomes `unknown` and is resolved by read-only reconciliation, not by a blind re-create; the adapter has per-request timeouts. **Historically the client resent the create POST once after a 401 (section 5.0, corrected and merged on `main` via PR #19)**, so `attempts=1` is a per-claim count and was **not** proof of one wire request; the offline-verified send-attempt observation procedure still has to be approved before any live run. The earlier "one-create guard" was a private harness outside this repository; there is no in-repository counter.

### 5.2 Operator checklist (reference only while BLOCKED; owner executes after unblock)

Prerequisite: `docs/NMI-DEMO-R1-B-WIRE-COUNT.md` (observer SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`) has passed **independent source audit** (review `5693627000`) and is **owner-merged** (`451abc2`); a **fresh separately written Gate B authorization** must still name the run ID and the observer hash. Run the observer procedure of that document (its sections 4-5) around steps 3-12 below: observer started with the server, listening-PID check and zero-count snapshot **before** the click, Ctrl-C shutdown, and the final summary read afterwards. **DO NOT execute these blocks without a fresh written Request B permit.**

1. [ ] PayPal Developer dashboard, **Sandbox** mode: app is `NudgeMyBillsAI`, Invoicing enabled, tied to the intended Business account; no Live app/credential is in use. In the Sandbox Business account's invoice list note the **number of existing invoices/drafts** (record the count only): N.
2. [ ] Fresh disposable database migrated and operator provisioned (runbook 3–5); verify `select count(*) from invoices` = 0 and `select count(*) from paypal_draft_operations` = 0.
3. [ ] Open a **new** interactive bash or zsh shell in the repository root. Paste **block 1** (no comments; the client id **and** the secret are read silently; one command per line):
   ```bash
   export SESSION_SECRET="$(openssl rand -base64 48)"
   export WEB_ORIGIN=http://localhost:5173
   export PORT=3001
   export PAYPAL_ENV=sandbox
   export PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
   unset OPENAI_API_KEY OPENAI_MODEL
   printf 'PayPal SANDBOX client id (hidden): '
   read -rs PAYPAL_CLIENT_ID
   echo
   printf 'PayPal SANDBOX secret (hidden): '
   read -rs PAYPAL_CLIENT_SECRET
   echo
   export PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET
   export PAYPAL_DRAFTS_ENABLED=true
   ```
   Then **block 2** (prints `SETUP OK` only if every condition holds; prints no secret):
   ```bash
   if [ -n "${PAYPAL_CLIENT_ID-}" ] && [ -n "${PAYPAL_CLIENT_SECRET-}" ] && [ -z "${OPENAI_API_KEY-}" ] && [ "${PAYPAL_DRAFTS_ENABLED-}" = "true" ] && [ "${PAYPAL_ENV-}" = "sandbox" ] && [ "${PAYPAL_API_BASE_URL-}" = "https://api-m.sandbox.paypal.com" ]; then echo "SETUP OK"; else echo "SETUP WRONG - STOP"; fi
   ```
   Then **block 3** in the same shell (leave it running):
   ```bash
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
12. [ ] **Immediately** after the create outcome is observed and the read-only checks are done: Ctrl-C the API, then in that shell run **block 4** (disables drafting for any later start and removes the credentials from the environment):
   ```bash
   export PAYPAL_DRAFTS_ENABLED=false
   unset PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET
   ```
   Rotate or delete the REST app secret if the owner wishes. Then handle the database as chosen in the authorization: **drop** it (default; runbook 11) or **preserve** it under the retention plan in 6.3. Record the teardown time.
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

**REAL PASS (Gate B)** requires all of: the observer's final summary for the listening `server.ts` PID shows `complete=true`, **`create=1`**, `unexpected=0`, `foreign=0`, `stop=false` (`docs/NMI-DEMO-R1-B-WIRE-COUNT.md` section 4; a send **attempt**, not proof of receipt); one browser create POST; one operation row `created`, `attempts=1`; invoice linked; PayPal dashboard shows exactly one new item, status DRAFT, USD 540.00, due 2030-01-15; drafting disabled again; no send/remind/pay; evidence redacted. It proves one Sandbox DRAFT through the browser path; it does **not** prove search/reconciliation/timeout behaviour.

## 6. Gate C — combined real-provider browser walkthrough (separate approval; NOT AUTHORIZED; depends on Gate B)

### 6.1 Why the earlier sequence was wrong

Gate B drops its disposable database. The Gate B invoice and its operation row therefore **no longer exist in any app database** afterwards, so a later walkthrough **cannot** reopen "the already-created Gate B invoice" in the app. Showing "PayPal draft created" on an app screen for it would need either a second create (not permitted) or a restored copy of the database (6.3). Nothing may be implied, faked or created to bridge that gap.

### 6.2 Default (truthful) demonstration

Preconditions: Gate A and Gate B each REAL PASS and independently reviewed (Gate B cannot pass until 5.0 is resolved). The walkthrough, on a **fresh** disposable database, shows:

1. **LIVE (if authorized): real OpenAI parse** of one synthetic input from section 4.4 inside a **new**, separate Request A-type cap, then review, save, server-computed total and the dashboard. Each in-app invoice record created this way is listed in the Gate C request (name, currency, amount) so that **no invoice is created implicitly**; they are local PostgreSQL records only.
2. **RECORDED EARLIER / read-only: the Gate B DRAFT shown in the PayPal Sandbox dashboard** (read-only, account details masked), labelled "created in run R1-B-…; **not linked to the app records shown in this recording**". The app screens in the recording must **not** claim "PayPal draft created" for the newly parsed invoice, and **no PayPal create or any PayPal request** is made by the recording.
3. Everything not live is labelled SIMULATED or RECORDED EARLIER on screen and in the narration.

### 6.3 Optional: preserve the Gate B database (needs its own owner decision, not requested by default)

If the owner wants the app's own saved page and dashboard to show the real Gate B DRAFT state later, Request B must choose **preserve** instead of drop, with all of: a `pg_dump` of the disposable database taken **after** the read-only checks and before teardown; stored **encrypted, off the repository and off any synced/shared folder**, owner-controlled; the dump excluded from commits, screenshots and evidence; restored only into a **new disposable** database (runbook 3–4), after which the operator is **re-provisioned with a fresh random password** and all rows of `sessions` are deleted; PayPal credentials unset and `PAYPAL_DRAFTS_ENABLED=false` during any restored-database walkthrough, so the detail page re-reads the stored state only; the dump deleted after the recording; and the plan reviewed independently before use (it contains synthetic invoice data, an operator password hash and audit rows). Without this approved plan the default in 6.2 applies.

### 6.4 Not covered

A live **second** PayPal create (for example "so the video shows it"), any invoice created implicitly, upload, publishing and Devpost submission each need their own explicit permission and are **not requested**. Recording rules: `docs/NMI-DEMO-VIDEO-SCRIPT.md`. Until approved and executed: **PENDING**.

## 7. What changes in public wording after each outcome

| Outcome | Allowed wording | Still forbidden |
| --- | --- | --- |
| Nothing run (today) | "OpenAI parsing implemented, not verified live; one historical real Sandbox DRAFT (backend, USD 5.00); everything else simulated." | Any "works with OpenAI/PayPal live" claim |
| Gate A REAL PASS | "Real parsing verified once with `gpt-6-luna` on two synthetic inputs (date)." | Accuracy, cost-at-scale, reliability claims |
| Gate B REAL PASS (only after 5.0 is resolved and a new Request B is answered) | "One Sandbox DRAFT created through the browser path and verified (date)." | Sending, payment, reconciliation claims |
| Gate C REAL PASS | Walkthrough label as recorded, each step LIVE/SIMULATED | "Production ready", hosted, sponsor outcome |
| Any REAL FAIL | State the failure plainly | Hiding or retrying silently |

## 8. Authorization requests

Use `docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`: **Request A**, **Request B** and **Request C** are separate documents to answer separately. Silence, "continue" or approval of a different request is **no**.
