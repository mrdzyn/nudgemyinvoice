# NudgeMyInvoice — Redacted real-provider evidence templates

> Blank forms. **Every field below is PENDING until the owner fills it from observed output.** Do not pre-fill expected values as observed ones. Labels: **PENDING**, **REAL PASS**, **REAL FAIL**, **SIMULATED** (see `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` section 2). Never record: keys, client id/secret, tokens, headers, cookies, account e-mails, PayPal merchant/payer ids, **full** PayPal invoice ids (last 4 characters only), OpenAI organisation/project ids, billing details, terminal output containing secrets. Screenshots must show only the synthetic data, no URL bar with private hosts, no terminal.

Where a provider value cannot be observed (for example token usage not yet shown on the provider dashboard), write `PENDING (reason)`.

## Template A — Gate A (OpenAI), one file per run

```
Run ID: R1-A-________            Authorization quoted (date/time, request id): ______
Executed by: owner               Commit under test (git rev-parse HEAD): ______
Model requested: ______          Model shown by provider usage page: ______  (PENDING if not visible)
OPENAI_MAX_OUTPUT_TOKENS: ______  Request-count path: A-strict (fix commit ____) / A-six   A-F2 choice: 4096-cap / code task   Provider-side limit set: yes/no (amount ____)
Entitlement + price confirmed without a billable request: yes/no     Price seen (in/out per 1M): ____/____
Environment: production server started (no SIMULATED banner): yes/no ; /health aiConfigured=true: yes/no
PayPal credentials unset: yes/no ; PAYPAL_DRAFTS_ENABLED=false: yes/no ; paypal_draft_operations rows: __

Call  Input id  HTTP   Latency (DevTools)  Outcome (validated draft / clarification / unavailable / invalid)  Label
A1    A1        ___    ___ ms              ______                                                               ____
A2    A2        ___    ___ ms              ______                                                               ____
A3    A3/skip   ___    ___ ms              ______                                                               ____
Application parse attempts used: _/3       Provider-reported wire requests: ___ (limit: 3 under A-strict, 6 under A-six; PENDING if not visible)

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
GATE B BLOCKED / NOT AUTHORIZED. FIX-B1 is independently audited and merged into main at 09bbe90a977516c27bc0715141e74e090b41fba5. Do not fill this template until a server-to-PayPal egress-send observer has passed offline verification, independent audit, owner merge, and a NEW written Request B is approved (acceptance doc 5.0; docs/NMI-DEMO-R1-B-WIRE-COUNT.md).
Run ID: R1-B-________            Authorization quoted (date/time, request id): ______   PayPal client FIX-B1 merge: 09bbe90a977516c27bc0715141e74e090b41fba5 (audit 5692753316)
Executed by: owner               Commit under test: ______
Sandbox mode and app NudgeMyBillsAI confirmed in the dashboard: yes/no ; no Live credential in use: yes/no
Sandbox invoice count BEFORE (N): ____
PAYPAL_ENV=sandbox / PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com : yes/no ; /health paypalEnvironment=sandbox: yes/no
OpenAI unset (aiConfigured=false): yes/no ; no SIMULATED banner: yes/no
Pre-create DB: invoices __ (expect 0 before save) ; paypal_draft_operations __ (expect 0)
Saved invoice (DB): currency ___ total_minor ____ due_date ______ (expect USD 54000 2030-01-15) ; saved page total ______
Creates used: _/1 ; browser POST .../paypal-draft count (DevTools): __ (expect 1) ; second create attempted: yes/no
Server-to-PayPal outbound create SEND ATTEMPTS (not guaranteed provider receipt): PENDING until observed; count ____ (expected exactly 1) ; source: exact Node/Undici observer only after verified/audited
Observer procedure commit: PENDING ; audited preload SHA-256 (expected `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`): PENDING ; offline validation (agent) recorded: yes/no ; independently audited/reproduced: PENDING ; `shasum` of the file used equals the audited hash: yes/no ; proxy variables unset: yes/no
Listening PID (lsof): PENDING ; `NMI-WIRE ACTIVE entry=server.ts` PID equal to it: yes/no ; pre-click SIGUSR2 snapshot (complete=false) all counts 0: yes/no ; pre-click create sends: PENDING (expect 0)
Final summary file of the listening PID (complete=true, signal ____): CREATE ____ (expect 1) OAuth ____ SHOW ____ SEARCH ____ UNEXPECTED ____ (expect 0) FOREIGN ____ (expect 0) events ____ ; STOP line printed: yes/no ; other processes' files all events=0: yes/no ; stopped with Ctrl-C: yes/no
Observer summary complete and secrets/headers/body/id absent: yes/no ; observer failure/unknown count STOP: yes/no
Corroboration: browser-to-API create POST count ____ (expect 1), DB attempts ____ (expect 1), Sandbox N->N+1 ____ (separate proof, not wire count)
Operation row: state ______ attempts __ has_remote __ remote_tail ____ ; operation row count __ (expect 1)
Invoice row linked to remote: yes/no
PayPal Sandbox dashboard (read-only): invoice count AFTER (expect N+1) ____ ; status ______ (expect DRAFT) ; currency ___ ; total ______ ; due ______ ; number NMI-+20hex: yes/no
App shows "PayPal draft created" on detail and dashboard: yes/no
Unexpected states (rejected / unknown / mismatch / reconciliation): none / ______   Check status used (read-only): yes/no
STOP condition triggered: none / ______
Teardown (immediately): API stopped __:__ ; PAYPAL_DRAFTS_ENABLED false/unset: yes/no ; PAYPAL_* unset: yes/no ; secret rotated: yes/no/not needed ; database dropped: yes/no OR preserved under the authorized retention plan (6.3): yes/no (encrypted dump location NOT recorded here)
Secrets/ids review before sharing (owner initials): ____
Overall label: REAL PASS / REAL FAIL / PENDING     Notes: ______
```

## Template C — Gate C (combined walkthrough), one file per recording session

```
Run ID: R1-C-________            Authorization quoted: ______    Gate A run: R1-A-____ (label ____)   Gate B run: R1-B-____ (label ____)
Database: fresh disposable / restored preserved Gate B database under the authorized retention plan
New PayPal create or any PayPal request made by the recording: yes/no (must be no)
In-app invoices created (must equal the list in the authorization): ______   Any other invoice created: yes/no (must be no)
Segments (each labelled): real OpenAI parse LIVE/SIMULATED (attempts _/_ , wire requests _/_) ; save + PostgreSQL LIVE ; dashboard LIVE ;
  Gate B DRAFT shown read-only in the PayPal Sandbox dashboard = RECORDED EARLIER (created in R1-B-____, not linked to the app records shown) ; any simulated stand-in: ____
Screen claims "PayPal draft created" for an invoice that has no such state: yes/no (must be no)
On-screen tag present for every non-live segment: yes/no ; narration says "simulated"/"recorded earlier" where applicable: yes/no
Video length (exported file): __:__ (< 3:00) ; secrets/ids/URL bar/terminal/PayPal account details visible: no / ______
Not uploaded, not submitted by this authorization: confirmed
Overall label: REAL PASS (walkthrough as recorded) / PENDING / SIMULATED
```

## Committing evidence

After the owner has reviewed a filled template for secrets, it may be committed as `design/evidence/NMI-DEMO-R1/<run id>.md` in a **separate reviewed change**. Screenshots only if they contain nothing but synthetic data. Documents that cite a result must quote the run ID and label; none may quote an expected value as a result.
