# NMI-UI-01C3 browser save/detail journey

Chrome: Chrome/156.0.8078.48 (headless). PostgreSQL: postgres (PostgreSQL) 16.15 (Homebrew) (disposable cluster, destroyed after the run).
Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.
Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; no model client exists in this journey (parsing is not used); the invoices are created by manual entry.

**88/88 checks passed.**

| Result | Group | Check | Detail |
| --- | --- | --- | --- |
| PASS | setup | disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy |  |
| PASS | setup | database is a throw-away nmi_test* cluster in a temp directory |  |
| PASS | setup | PayPal drafts disabled; OPENAI_API_KEY/OPENAI_MODEL empty (no provider can be reached) |  |
| PASS | REAL logged-out protection | a saved-invoice deep link shows only sign-in |  |
| PASS | REAL logged-out protection | no invoice request is made while logged out |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | real Review shows the real-save wording and no simulated-save claim |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | the shell notice states saving uses the server and the list/PayPal are not connected |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | keyboard Enter on 'Save draft' saves and opens the saved-invoice page |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | exactly one POST /api/invoice-drafts -> 201 with CSRF and an Idempotency-Key |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | body is exactly the strict draft (no totals, id, status, fixture fields) |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | exactly one durable invoice was created |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | the detail page loaded the record with GET /api/invoice-drafts/:id -> 200 |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | shows the real UUID, customer, currency, due date and persisted creation date |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | server-computed total matches the database exactly (271.71) |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | line total, tax and subtotal match the database |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | one consistent currency for the invoice (USD) in the database |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | UI says 'Saved in PostgreSQL' and 'Not created in PayPal Sandbox', customer not notified |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | no PayPal id, fixture name or simulated PayPal control is shown |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | audit row recorded the save without customer data |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | nothing was created in PayPal operations |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | no horizontal overflow on the saved page (desktop) |  |
| PASS | REAL manual invoice -> POST 201 -> GET detail | saved page text contrast >= WCAG AA (light) |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | new key + body -> 201, replayed:false |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | same key + identical body -> 200 replayed:true with the SAME id |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | same key + different body -> 409 |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | exactly one new invoice despite 3 requests (no duplicate) |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | 409 stored nothing under the new body |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | GET returns the same totals the POST returned |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | a total/id/status in the request is rejected by the strict schema (400) |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | no cookie -> 401 |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | missing CSRF -> 403 |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | foreign Origin with a valid token -> 403 |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | malformed Idempotency-Key -> 400 |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | fractional JPY amount refused, nothing stored |  |
| PASS | REAL idempotency through Fastify/PostgreSQL | GET of an unknown id -> 404 |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | UI reports that the outcome could not be confirmed (not a plain failure) |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | wording says it may or may not exist and the retry reuses the same key |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | the server DID commit exactly one invoice before the response was lost |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | the form is locked (edits cannot desynchronise the key from the body) |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | retrying opens the saved page with the replay notice |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | the retry used the SAME Idempotency-Key and the identical body |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | the retry was answered 200 (replay) and NO second invoice exists |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | the shown record is the one committed by the lost attempt |  |
| PASS | REAL uncertain save -> same-key retry (server commits, browser loses the response) | replay copy: 'No second draft was created' |  |
| PASS | REAL abandon an uncertain attempt explicitly | before the choice the form is locked and the notice warns a second draft may be created |  |
| PASS | REAL abandon an uncertain attempt explicitly | the form unlocks only after the explicit choice |  |
| PASS | REAL abandon an uncertain attempt explicitly | the edited save used a NEW key (the old key was never reused with a changed body) |  |
| PASS | SIMULATED save outcomes (interception; server not reached) | 409 -> conflict notice, edits kept |  |
| PASS | SIMULATED save outcomes (interception; server not reached) |    server untouched and typed edits still present (409 -> c) |  |
| PASS | SIMULATED save outcomes (interception; server not reached) | 400 -> bounded server messages, edits kept |  |
| PASS | SIMULATED save outcomes (interception; server not reached) |    server untouched and typed edits still present (400 -> b) |  |
| PASS | SIMULATED save outcomes (interception; server not reached) | 422 invalid_draft -> exact totals unavailable |  |
| PASS | SIMULATED save outcomes (interception; server not reached) |    server untouched and typed edits still present (422 inva) |  |
| PASS | SIMULATED save outcomes (interception; server not reached) | 403 -> generic, no detail leaked |  |
| PASS | SIMULATED save outcomes (interception; server not reached) |    server untouched and typed edits still present (403 -> g) |  |
| PASS | SIMULATED save outcomes (interception; server not reached) | 500 -> uncertain (a 5xx may follow a commit) |  |
| PASS | SIMULATED save outcomes (interception; server not reached) |    server untouched and typed edits still present (500 -> u) |  |
| PASS | SIMULATED save outcomes (interception; server not reached) | 201 with an inconsistent total -> uncertain, never a saved record |  |
| PASS | SIMULATED save outcomes (interception; server not reached) |    server untouched and typed edits still present (201 with) |  |
| PASS | SIMULATED save outcomes (interception; server not reached) | after a 409 a further Save sends nothing until 'Use a new key' is chosen |  |
| PASS | SIMULATED save outcomes (interception; server not reached) | 'Use a new key' keeps the edits and the next save is a real 201 with a different key |  |
| PASS | SIMULATED failed GET after a REAL save | GET 404: error shown, not the record and never a fixture |  |
| PASS | SIMULATED failed GET after a REAL save | GET 500: error shown, not the record and never a fixture |  |
| PASS | SIMULATED failed GET after a REAL save | GET 200 with an unknown shape: error shown, not the record and never a fixture |  |
| PASS | SIMULATED failed GET after a REAL save | GET 200 with inconsistent totals: error shown, not the record and never a fixture |  |
| PASS | SIMULATED failed GET after a REAL save | GET network failure: error shown, not the record and never a fixture |  |
| PASS | SIMULATED failed GET after a REAL save | 'Try loading again' then loads the real record |  |
| PASS | REAL logout and 401 clear sensitive UI | Sign out locks immediately and the typed invoice is gone |  |
| PASS | REAL logout and 401 clear sensitive UI | no invoice text remains in the page |  |
| PASS | REAL logout and 401 clear sensitive UI | after signing in again the form is blank |  |
| PASS | REAL logout and 401 clear sensitive UI | a real 401 on save ends the session and shows sign-in |  |
| PASS | REAL logout and 401 clear sensitive UI | the POST really returned 401 and stored nothing |  |
| PASS | REAL logout and 401 clear sensitive UI | the typed invoice is wiped from the page |  |
| PASS | REAL logout and 401 clear sensitive UI | [SIMULATED] a 401 on the detail GET also ends the session |  |
| PASS | REAL 390px mobile and dark theme | no horizontal overflow at 390px (uncertain state) |  |
| PASS | REAL 390px mobile and dark theme | uncertain-state contrast >= WCAG AA (dark, 390px) |  |
| PASS | REAL 390px mobile and dark theme | the uncertain alert is an announced alert region |  |
| PASS | REAL 390px mobile and dark theme | no horizontal overflow at 390px (saved page) |  |
| PASS | REAL 390px mobile and dark theme | saved-page contrast >= WCAG AA (dark, 390px) |  |
| PASS | Global invariants | no localStorage/sessionStorage/IndexedDB/Cache entries |  |
| PASS | Global invariants | no script-readable cookie and no invoice data or id in the URL |  |
| PASS | Global invariants | no request left the app origin (no PayPal/OpenAI/foreign host) |  |
| PASS | Global invariants | the browser used only auth, POST /api/invoice-drafts and GET /api/invoice-drafts/:id |  |
| PASS | Global invariants | no parse, list or PayPal-draft request was made |  |
| PASS | Global invariants | no PayPal operations, approvals or model calls exist |  |
| PASS | Global invariants | every invoice has exactly one currency and non-negative consistent minor totals |  |
| PASS | Global invariants | API log contains no customer data, CSRF token or cookie value |  |
| PASS | Global invariants | no console errors or uncaught exceptions in the browser |  |

Screenshots (synthetic data only, no credentials): 01-review-real-save.jpg, 02-saved-detail.jpg, 03-uncertain-locked.jpg, 04-conflict-409.jpg, 05-get-failed-then-loaded.jpg, 06-mobile-dark-uncertain.jpg, 07-mobile-dark-saved.jpg

Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, 400% zoom, a hosted/TLS (`__Host-` cookie) deployment.
