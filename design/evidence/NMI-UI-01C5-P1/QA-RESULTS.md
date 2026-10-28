# NMI-UI-01C5-P1 browser PayPal-draft journey

Chrome: Chrome/156.0.8078.74 (headless). PostgreSQL: postgres (PostgreSQL) 16.15 (Homebrew) (disposable cluster, destroyed after the run).
Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.
Privacy scope of the checks below: they prove the browser NAVIGATION URL and browser storage hold no customer data and that the Fastify request log has query strings stripped. They do NOT claim the HTTP GET request URL is free of customer data (the search term travels in `q`), and no reverse proxy, ingress, CDN or access log was exercised (untested). Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; PayPal is a DETERMINISTIC FAKE injected behind the real routes and draft state machine (`test-api-server.ts`); these results prove the UI, transport and local state machine, NOT real PayPal behaviour. No OpenAI client exists. Invoices are created through the real save route.

**89/89 checks passed.**

| Result | Group | Check | Detail |
| --- | --- | --- | --- |
| PASS | setup | disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy |  |
| PASS | setup | database is a throw-away nmi_test* cluster in a temp directory |  |
| PASS | setup | PayPal drafting ENABLED on the API but backed ONLY by the deterministic fake client; no OpenAI key/model; the real PayPal client is never constructed |  |
| PASS | setup | 14 saved invoices exist in PostgreSQL and none has a PayPal operation or provider id |  |
| PASS | REAL logged-out protection | the real server refuses an unauthenticated PayPal-draft POST (401) and calls nothing |  |
| PASS | REAL logged-out protection | a session without the CSRF token is refused (403) and nothing is created |  |
| PASS | REAL main journey (fake provider) | after a reload the app makes NO PayPal-draft request on its own |  |
| PASS | REAL main journey (fake provider) | the real saved invoice shows 'Not created in PayPal Sandbox' with an explicit create action |  |
| PASS | REAL main journey (fake provider) | customer, currency, server total and due date are shown, plus the PayPal Sandbox identity |  |
| PASS | REAL main journey (fake provider) | opening the saved invoice read it with GET and made no PayPal-draft POST |  |
| PASS | REAL main journey (fake provider) | the confirmation dialog opens, with initial focus on Cancel |  |
| PASS | REAL main journey (fake provider) | the dialog names the exact saved invoice, customer, currency, server total and due date |  |
| PASS | REAL main journey (fake provider) | the dialog says a Sandbox DRAFT is prepared, the customer is NOT emailed, no payment is collected, nothing is sent |  |
| PASS | REAL main journey (fake provider) | Escape closes the dialog, returns focus to the Create button and sends NOTHING |  |
| PASS | REAL main journey (fake provider) | Cancel closes the dialog and issues ZERO POST requests (no operation, no provider call) |  |
| PASS | REAL main journey (fake provider) | exactly one PayPal-draft POST for that confirmation -> 201 with CSRF, no request body |  |
| PASS | REAL main journey (fake provider) | the panel shows the server-validated PayPal id, DRAFT, and says the customer was NOT emailed |  |
| PASS | REAL main journey (fake provider) | the durable record agrees: operation row 'created', one attempt, id linked on the invoice, ONE fake provider create |  |
| PASS | REAL main journey (fake provider) | after the POST the page re-read the durable state with GET /api/invoice-drafts/:id (read-only) and shows it |  |
| PASS | REAL main journey (fake provider) | the create button is gone and the page text never claims the invoice was sent, paid or collected |  |
| PASS | REAL main journey (fake provider) | the saved-page notice no longer says 'nothing was sent to PayPal' or 'not created in PayPal' |  |
| PASS | REAL main journey (fake provider) | no 'Check status' is offered once created (nothing left to resolve) |  |
| PASS | REAL main journey (fake provider) | back on the REAL dashboard the invoice's PayPal status is read from the server: 'PayPal draft created' |  |
| PASS | REAL main journey (fake provider) | the server-side 'PayPal draft created' filter lists exactly that invoice |  |
| PASS | REAL main journey (fake provider) | no PayPal-draft POST happened on the dashboard |  |
| PASS | REAL main journey (fake provider) | reloading does not restore a PayPal action and issues no PayPal-draft POST |  |
| PASS | REAL double confirm and in-flight state (fake provider takes 4 s) | while creating: an accessible progress status is shown and the create control is gone |  |
| PASS | REAL double confirm and in-flight state (fake provider takes 4 s) | three rapid confirm clicks produced exactly ONE POST and one provider create |  |
| PASS | REAL double confirm and in-flight state (fake provider takes 4 s) | the single request completes as created, with one operation attempt |  |
| PASS | REAL outcome unknown -> reconciliation (fake provider) | 502 paypal_outcome_unknown: 'A PayPal draft may or may not exist', neither failure nor success |  |
| PASS | REAL outcome unknown -> reconciliation (fake provider) | the page re-read the durable state (GET) and shows 'unknown' with the saved code |  |
| PASS | REAL outcome unknown -> reconciliation (fake provider) | no automatic create: exactly one POST and one provider create so far |  |
| PASS | REAL outcome unknown -> reconciliation (fake provider) | both Check status and an explicit 'Retry (checks PayPal first)' are offered |  |
| PASS | REAL outcome unknown -> reconciliation (fake provider) | Check status is READ-ONLY: it re-reads GET detail and issues no POST and no provider call |  |
| PASS | REAL outcome unknown -> reconciliation (fake provider) | a retry needs a FRESH confirmation dialog |  |
| PASS | REAL outcome unknown -> reconciliation (fake provider) | the retry is answered 409 reconciliation_pending and says the server avoids a duplicate, with no new create |  |
| PASS | REAL outcome unknown -> reconciliation (fake provider) | the durable state is still 'unknown' and the provider was only asked to look (find), never to create again |  |
| PASS | REAL rejected -> explicit retry (fake provider) | 502 paypal_rejected is shown as a rejection (no draft), with the sanitized code |  |
| PASS | REAL rejected -> explicit retry (fake provider) | the local invoice is unchanged and an explicit 'Try again' is offered |  |
| PASS | REAL rejected -> explicit retry (fake provider) | no request is made until the retry is confirmed |  |
| PASS | REAL rejected -> explicit retry (fake provider) | the explicit retry (fresh attempt) then creates the draft |  |
| PASS | REAL mismatch (fake provider returns a different total) | 502 paypal_mismatch: an alert requiring manual investigation |  |
| PASS | REAL mismatch (fake provider returns a different total) | NO retry control is offered and the durable state is 'mismatch' |  |
| PASS | REAL mapping refused (rounding) | 422 mapping_refused shows the safe reason and says nothing is rounded silently |  |
| PASS | REAL mapping refused (rounding) | no operation was created, the provider was never called and the local invoice is unchanged |  |
| PASS | REAL EUR and JPY totals in the confirmation | EUR: the dialog shows €300.00 EUR (server-computed) for that exact invoice |  |
| PASS | REAL EUR and JPY totals in the confirmation | JPY: the dialog shows ¥5,000 JPY (no decimals) |  |
| PASS | REAL lost response (server creates the draft, the browser loses the answer) | the UI says 'a PayPal draft may or may not exist' (not failure, not success) |  |
| PASS | REAL lost response (server creates the draft, the browser loses the answer) | the automatic READ-ONLY re-read then shows the durable truth: the draft was created |  |
| PASS | REAL lost response (server creates the draft, the browser loses the answer) | exactly one POST was sent, no automatic retry, and no create button is offered |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | 403: fails closed (did not accept this request…), never a created draft, no LEAK |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | 404: fails closed (could not be found…), never a created draft, no LEAK |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | 400: fails closed (refused the request…), never a created draft, no LEAK |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | 200 with an arbitrary body: fails closed (may or may not exist…), never a created draft, no LEAK |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | 201 with status SENT: fails closed (may or may not exist…), never a created draft, no LEAK |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | 500: fails closed (may or may not exist…), never a created draft, no LEAK |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | 503 unavailable: fails closed (not known whether a draft wa…), never a created draft, no LEAK |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | network failure: fails closed (may or may not exist…), never a created draft, no LEAK |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | 409 in_progress: says another attempt is in flight and will not repeat; create stays hidden until the state is read |  |
| PASS | SIMULATED PayPal-draft answers (interception; the server is not reached) | (no PayPal-draft request was made by merely opening these invoices) |  |
| PASS | REAL keyboard operation | Enter on 'Create PayPal Sandbox draft…' opens the dialog and focus lands on Cancel |  |
| PASS | REAL keyboard operation | Tab moves to the confirm button inside the dialog |  |
| PASS | REAL keyboard operation | Tab wraps back to Cancel (focus is trapped in the dialog) |  |
| PASS | REAL keyboard operation | Shift+Tab wraps to the confirm button |  |
| PASS | REAL keyboard operation | Escape closes the dialog, restores focus to the Create button, sends nothing |  |
| PASS | REAL keyboard operation | keyboard confirm creates the draft with a single POST |  |
| PASS | REAL 390px mobile and dark theme | no horizontal overflow at 390px (saved invoice with the PayPal panel) |  |
| PASS | REAL 390px mobile and dark theme | the confirmation dialog fits the 390px viewport and the page does not overflow |  |
| PASS | REAL 390px mobile and dark theme | dialog text contrast >= WCAG AA (dark, 390px) |  |
| PASS | REAL 390px mobile and dark theme | created panel: no overflow and AA contrast (dark, 390px) |  |
| PASS | REAL 390px mobile and dark theme | unknown-state panel (warning/alert styling): no overflow and AA contrast (dark, 390px) |  |
| PASS | REAL 390px mobile and dark theme | light desktop: the unknown-state panel meets AA contrast |  |
| PASS | REAL session expiry during a create | a real 401 ends the session at once: sign-in shows, no dialog, no protected UI |  |
| PASS | REAL session expiry during a create | the POST returned 401, the provider was never called and no operation exists |  |
| PASS | REAL session expiry during a create | no customer data remains in the page |  |
| PASS | REAL provider disabled on the server (PAYPAL_DRAFTS_ENABLED=false) | 503 paypal_disabled is explained and says nothing was sent anywhere |  |
| PASS | REAL provider disabled on the server (PAYPAL_DRAFTS_ENABLED=false) | the create control is disabled so the disabled server is not probed again |  |
| PASS | REAL provider disabled on the server (PAYPAL_DRAFTS_ENABLED=false) | exactly one POST was sent, a further click sends nothing, and the provider was never called |  |
| PASS | REAL provider disabled on the server (PAYPAL_DRAFTS_ENABLED=false) | local invoice data stays usable (customer and totals still shown) |  |
| PASS | Global invariants | no localStorage/sessionStorage/IndexedDB/Cache entries |  |
| PASS | Global invariants | no script-readable cookie; the browser navigation URL carries no customer data, ids or PayPal ids |  |
| PASS | Global invariants | no request left the app origin (no PayPal, OpenAI or other host) |  |
| PASS | Global invariants | the browser used only the auth, save/list/detail and PayPal-draft routes |  |
| PASS | Global invariants | no send, remind, cancel, refund, payment or webhook route was ever requested |  |
| PASS | Global invariants | the browser never called PayPal-draft with GET and never sent a body or any customer data in it |  |
| PASS | Global invariants | the fake provider saw only create/get/find (the only operations the app can express); real PayPal was never constructed |  |
| PASS | Global invariants | no OpenAI/model call was made (no model client configured) |  |
| PASS | Global invariants | the API log holds no customer name, e-mail, CSRF token or cookie value |  |
| PASS | Global invariants | no console errors or uncaught exceptions in the browser |  |

Screenshots (synthetic data only, no credentials): 01-saved-not-created.jpg, 02-confirm-dialog.jpg, 03-created.jpg, 04-creating.jpg, 05-unknown.jpg, 06-rejected.jpg, 07-mismatch.jpg, 08-refused.jpg, 09-lost-response.jpg, 10-mobile-dark-dialog.jpg, 11-mobile-dark-created.jpg, 12-mobile-dark-unknown.jpg, 13-disabled.jpg

Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, 400% zoom, a hosted/TLS (`__Host-` cookie) deployment.
