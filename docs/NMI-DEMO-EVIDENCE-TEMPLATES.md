# NudgeMyInvoice — Redacted real-provider evidence templates

> Blank forms. **Every field below is PENDING until the owner fills it from observed output.** Do not pre-fill expected values as observed ones. Labels: **PENDING**, **REAL PASS**, **REAL FAIL**, **SIMULATED** (see `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` section 2). Never record: keys, client id/secret, tokens, headers, cookies, account e-mails, PayPal merchant/payer ids, **full** PayPal invoice ids (last 4 characters only), OpenAI organisation/project ids, billing details, terminal output containing secrets. Screenshots must show only the synthetic data, no URL bar with private hosts, no terminal.

Where a provider value cannot be observed (for example token usage not yet shown on the provider dashboard), write `PENDING (reason)`.

## Template A — Gate A (OpenAI), one file per run

```
Run ID: R1-A-________            Authorization quoted (date/time, request id): ______
Executed by: owner               Commit under test (git rev-parse HEAD): ______
Model requested: ______          Model shown by provider usage page: ______  (PENDING if not visible)
OPENAI_MAX_OUTPUT_TOKENS: ______  A-F1 choice: a/b   A-F2 choice: a/b   Provider-side limit set: yes/no (amount ____)
Entitlement + price confirmed without a billable request: yes/no     Price seen (in/out per 1M): ____/____
Environment: production server started (no SIMULATED banner): yes/no ; /health aiConfigured=true: yes/no
PayPal credentials unset: yes/no ; PAYPAL_DRAFTS_ENABLED=false: yes/no ; paypal_draft_operations rows: __

Call  Input id  HTTP   Latency (DevTools)  Outcome (validated draft / clarification / unavailable / invalid)  Label
A1    A1        ___    ___ ms              ______                                                               ____
A2    A2        ___    ___ ms              ______                                                               ____
A3    A3/skip   ___    ___ ms              ______                                                               ____
Application parse calls used: _/3          Provider-reported requests: ___ (PENDING if not visible)

Field check A1 (observed vs expected): customer __ email __ currency __ qty/price __ tax __ due __
Server total after save: USD ______ (expected 540.00)    Dashboard row seen: yes/no
Field check A2: currency __ qty/price __ due __ ; server total EUR ______ (expected 599.97) ; USD and EUR cards separate: yes/no
A3: clarification asked / manual fallback / invented due date (REAL FAIL)

Usage (provider dashboard): input tokens ____ output tokens ____ cost USD ____  (PENDING (provider lag) is allowed)
Fallback on a real provider failure: REAL (observed) / SIMULATED (existing journeys only) / n/a
STOP condition triggered: none / ______
Teardown: API stopped __:__ ; OPENAI_* unset: yes/no ; key revoked or rotated: yes/no ; database dropped: yes/no
Secrets review before sharing (owner initials): ____
Overall label: REAL PASS / REAL FAIL / PENDING     Notes: ______
```

## Template B — Gate B (PayPal Sandbox), one file per run

```
Run ID: R1-B-________            Authorization quoted (date/time, request id): ______
Executed by: owner               Commit under test: ______
Sandbox mode and app NudgeMyBillsAI confirmed in the dashboard: yes/no ; no Live credential in use: yes/no
Sandbox invoice count BEFORE (N): ____
PAYPAL_ENV=sandbox / PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com : yes/no ; /health paypalEnvironment=sandbox: yes/no
OpenAI unset (aiConfigured=false): yes/no ; no SIMULATED banner: yes/no
Pre-create DB: invoices __ (expect 0 before save) ; paypal_draft_operations __ (expect 0)
Saved invoice (DB): currency ___ total_minor ____ due_date ______ (expect USD 54000 2030-01-15) ; saved page total ______
Creates used: _/1 ; browser POST .../paypal-draft count (DevTools): __ (expect 1) ; second create attempted: yes/no
Operation row: state ______ attempts __ has_remote __ remote_tail ____ ; operation row count __ (expect 1)
Invoice row linked to remote: yes/no
PayPal Sandbox dashboard (read-only): invoice count AFTER (expect N+1) ____ ; status ______ (expect DRAFT) ; currency ___ ; total ______ ; due ______ ; number NMI-+20hex: yes/no
App shows "PayPal draft created" on detail and dashboard: yes/no
Unexpected states (rejected / unknown / mismatch / reconciliation): none / ______   Check status used (read-only): yes/no
STOP condition triggered: none / ______
Teardown (immediately): API stopped __:__ ; PAYPAL_DRAFTS_ENABLED false/unset: yes/no ; PAYPAL_* unset: yes/no ; secret rotated: yes/no/not needed ; database dropped: yes/no
Secrets/ids review before sharing (owner initials): ____
Overall label: REAL PASS / REAL FAIL / PENDING     Notes: ______
```

## Template C — Gate C (combined walkthrough), one file per recording session

```
Run ID: R1-C-________            Authorization quoted: ______    Gate A run: R1-A-____ (label ____)   Gate B run: R1-B-____ (label ____)
New PayPal create performed: yes/no (must be no unless a separate Request C+ was answered YES)
Segments (each labelled): real OpenAI parse LIVE/SIMULATED ; save + PostgreSQL LIVE ; dashboard LIVE ; PayPal DRAFT shown read-only (created in R1-B-____) ; any simulated stand-in: ____
On-screen tag present for every non-live segment: yes/no ; narration says "simulated"/"recorded earlier" where applicable: yes/no
Video length (exported file): __:__ (< 3:00) ; secrets/ids/URL bar/terminal visible: no / ______
Not uploaded, not submitted by this authorization: confirmed
Overall label: REAL PASS (walkthrough as recorded) / PENDING / SIMULATED
```

## Committing evidence

After the owner has reviewed a filled template for secrets, it may be committed as `design/evidence/NMI-DEMO-R1/<run id>.md` in a **separate reviewed change**. Screenshots only if they contain nothing but synthetic data. Documents that cite a result must quote the run ID and label; none may quote an expected value as a result.
