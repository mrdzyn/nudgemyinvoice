# NMI-DEMO-R0 final end-to-end journey (SIMULATED providers)

Chrome: Chrome/156.0.8078.74 (headless). PostgreSQL: postgres (PostgreSQL) 16.15 (Homebrew) (disposable cluster, destroyed after the run).
Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.
Privacy scope of the checks below: they prove the browser NAVIGATION URL and browser storage hold no customer data and that the Fastify request log has query strings stripped. They do NOT claim the HTTP GET request URL is free of customer data (the search term travels in `q`), and no reverse proxy, ingress, CDN or access log was exercised (untested). Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; Both providers are DETERMINISTIC FAKES injected behind the real routes and services (`simulated-eval-server.ts`): a regex stand-in for OpenAI and an in-memory PayPal fake. These results prove the UI, transport, validation pipeline and local state machine, NOT real OpenAI or PayPal behaviour.

**32/32 checks passed.**

| Result | Group | Check | Detail |
| --- | --- | --- | --- |
| PASS | setup | disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy |  |
| PASS | setup | database is a throw-away nmi_test* cluster in a temp directory |  |
| PASS | setup | PayPal drafting ENABLED on the API but backed ONLY by the deterministic fake client; no OpenAI key/model; the real PayPal client is never constructed |  |
| PASS | REAL login (disposable operator, random password) | a protected deep link shows only the sign-in screen and no invoice route is requested |  |
| PASS | REAL login (disposable operator, random password) | the real server signs the operator in and the real dashboard loads (empty account, no fixtures) |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | the composer sends the text to the REAL parse route and the SIMULATED parser's proposal opens the editable Review |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | Review is filled from the validated server proposal (customer, e-mail, USD, due date, 8% tax, 2 x 250) |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | Review tells the operator it is a proposal to verify, not saved yet, and that saving writes to PostgreSQL (no PayPal) |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | human review: nothing is saved until the operator saves (zero invoices so far) |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | the operator edits one field during review (due date) and saves |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | exactly one real POST /api/invoice-drafts -> 201; one durable row in PostgreSQL with the OPERATOR'S edit (2030-02-01) |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | the saved page shows the real id and the server-computed total $540.00 (2 x 250.00 + 8% tax), saved in PostgreSQL only |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | the real dashboard lists the saved invoice from PostgreSQL with 'No PayPal draft' and a USD card |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | the confirmation dialog names the invoice, customer, $540.00 USD and says no email, no payment, nothing sent |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | the SIMULATED provider's DRAFT is verified by the real service and the page shows its id, DRAFT and 'not emailed' |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | durable truth agrees: one POST (201), operation 'created', one attempt, id linked on the invoice, ONE fake provider create |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | the page re-read the durable state with GET after the POST and shows the same id |  |
| PASS | REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh | back on the dashboard the same invoice now reads 'PayPal draft created' (state from the server) |  |
| PASS | REAL second currency (EUR) through the clarification loop | a request with no due date makes the REAL pipeline ask a clarification question (no guess) |  |
| PASS | REAL second currency (EUR) through the clarification loop | the answer is appended, the same endpoint is called again and Review opens with EUR |  |
| PASS | REAL second currency (EUR) through the clarification loop | saving stores a EUR invoice with the exact server total 599.97 (3 x 199.99) |  |
| PASS | REAL second currency (EUR) through the clarification loop | the dashboard keeps USD and EUR in separate cards with no combined total |  |
| PASS | Boundaries | only the explicit confirmation created a draft: exactly one fake provider create for two saved invoices |  |
| PASS | Boundaries | the SIMULATED parser handled exactly the 3 parse requests (no real OpenAI client exists in this run) |  |
| PASS | Boundaries | no browser request left the app origin (no OpenAI, PayPal or other host) |  |
| PASS | Boundaries | no send, remind, cancel, refund, payment or webhook route was requested |  |
| PASS | Boundaries | the browser used only the auth, parse, save/list/detail and PayPal-draft routes |  |
| PASS | Boundaries | no customer data in localStorage/sessionStorage/IndexedDB/Cache and none in the navigation URL |  |
| PASS | Boundaries | the API log holds no customer name/e-mail, CSRF token or cookie value |  |
| PASS | Boundaries | no console errors or uncaught exceptions in the browser |  |
| PASS | REAL logout | Sign out locks the workspace at once and the server session is revoked |  |
| PASS | REAL logout | no customer data remains in the page after sign-out |  |

Screenshots (synthetic data only, no credentials): 01-dashboard-empty.jpg, 02-review.jpg, 03-dashboard.jpg, 04-confirm-dialog.jpg, 05-created.jpg, 06-clarification.jpg, 07-two-currencies.jpg

Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, 400% zoom, a hosted/TLS (`__Host-` cookie) deployment.
