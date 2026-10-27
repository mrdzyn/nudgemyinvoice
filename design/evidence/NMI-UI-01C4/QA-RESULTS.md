# NMI-UI-01C4 browser dashboard journey

Chrome: Chrome/156.0.8078.48 (headless). PostgreSQL: postgres (PostgreSQL) 16.15 (Homebrew) (disposable cluster, destroyed after the run).
Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.
Privacy scope of the checks below: they prove the browser NAVIGATION URL and browser storage hold no customer data and that the Fastify request log has query strings stripped. They do NOT claim the HTTP GET request URL is free of customer data (the search term travels in `q`), and no reverse proxy, ingress, CDN or access log was exercised (untested). Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; no model client exists in this journey. Two operator accounts exist ONLY in this disposable database (production allows exactly one; `add-second-operator.ts` drops that index in the throw-away database to exercise owner isolation). Invoices are created through the real save route.

**79/79 checks passed.**

| Result | Group | Check | Detail |
| --- | --- | --- | --- |
| PASS | setup | disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy |  |
| PASS | setup | database is a throw-away nmi_test* cluster in a temp directory |  |
| PASS | setup | PayPal drafts disabled; OPENAI_API_KEY/OPENAI_MODEL empty (no provider can be reached) |  |
| PASS | REAL logged-out protection | a dashboard deep link shows only sign-in |  |
| PASS | REAL logged-out protection | no list request is made while logged out |  |
| PASS | REAL logged-out protection | the real server answers an unauthenticated list with 401 and no data |  |
| PASS | REAL operator A: empty account | GET /api/invoice-drafts -> 200 and the empty state is shown |  |
| PASS | REAL operator A: empty account | no fixture rows, 'DEMO / SYNTHETIC' banner or sample label appears |  |
| PASS | REAL operator A: empty account | the list request is a GET with limit=20 and no cursor/filters |  |
| PASS | REAL operator A: empty account | the shell says the list is server-backed and PayPal is not connected |  |
| PASS | REAL data creation (multiple currencies) | operator A owns 26 invoices across USD, EUR, JPY and GBP created through the real save route |  |
| PASS | REAL operator B private data | operator B owns exactly its 3 invoices |  |
| PASS | REAL operator B private data | B's dashboard (real browser) lists only B's invoices |  |
| PASS | REAL operator B private data | none of A's customers appear in B's page |  |
| PASS | REAL operator B private data | after sign-out none of B's data remains in the page |  |
| PASS | REAL operator A: list, currency cards and paging | first page: 20 rows, exactly A's newest 20 in the database order |  |
| PASS | REAL operator A: list, currency cards and paging | none of operator B's customers is visible to A |  |
| PASS | REAL operator A: list, currency cards and paging | one card per currency present on the page, never combined |  |
| PASS | REAL operator A: list, currency cards and paging | every card shows exactly the loaded sum recomputed from PostgreSQL minor units |  |
| PASS | REAL operator A: list, currency cards and paging | the summary is labelled as covering loaded invoices only, not all invoices |  |
| PASS | REAL operator A: list, currency cards and paging | no grand total across currencies exists |  |
| PASS | REAL operator A: list, currency cards and paging | Load more sends the server cursor with the same limit and no filters |  |
| PASS | REAL operator A: list, currency cards and paging | all 26 rows, no duplicates and no skips, in exact database order |  |
| PASS | REAL operator A: list, currency cards and paging | the end of the list is announced and no more button remains |  |
| PASS | REAL operator A: list, currency cards and paging | after the last page the cards equal the whole-account per-currency sums |  |
| PASS | REAL operator A: list, currency cards and paging | the dashboard made only GET requests (no mutation, no PayPal, no provider) |  |
| PASS | REAL filters and search (server-side over the whole account) | the EUR pill asks the SERVER for currency=EUR and shows only the EUR invoice |  |
| PASS | REAL filters and search (server-side over the whole account) | changing a filter after paging drops the old cursor and resets the rows |  |
| PASS | REAL filters and search (server-side over the whole account) | search matches the oldest invoice, which is not on the first page (server-side, not page-local) |  |
| PASS | REAL filters and search (server-side over the whole account) | the search text never appears in the browser NAVIGATION URL (location.href) and is not kept in localStorage (the HTTP GET request URL does carry it in q; see the next check) |  |
| PASS | REAL filters and search (server-side over the whole account) | DOCUMENTED, not hidden: the HTTP GET request URL carries the search term in `q` (customer data); proxy/ingress/CDN access logs must redact it (deployment prerequisite, untested here) |  |
| PASS | REAL filters and search (server-side over the whole account) | an invoice-id prefix finds exactly that invoice |  |
| PASS | REAL filters and search (server-side over the whole account) | another operator's customers cannot be found by search |  |
| PASS | REAL filters and search (server-side over the whole account) | Clear filters restores the full first page |  |
| PASS | REAL filters and search (server-side over the whole account) | the PayPal 'created' filter shows no rows: no PayPal draft exists (state comes from durable data) |  |
| PASS | REAL filters and search (server-side over the whole account) | the 'No PayPal draft' filter lists the invoices (all 26 have no operation row) |  |
| PASS | REAL View opens the server-backed detail (no replay wording) | keyboard Enter on View opens the saved-invoice page |  |
| PASS | REAL View opens the server-backed detail (no replay wording) | the page loaded the record with GET /api/invoice-drafts/:id -> 200 |  |
| PASS | REAL View opens the server-backed detail (no replay wording) | shows the real UUID, customer, EUR currency and the exact server total from PostgreSQL |  |
| PASS | REAL View opens the server-backed detail (no replay wording) | the notice is the neutral 'opened from your list' one, never 'saved just now' or a replay |  |
| PASS | REAL View opens the server-backed detail (no replay wording) | no edit, delete, PayPal-create or send control exists |  |
| PASS | REAL View opens the server-backed detail (no replay wording) | the title is not labelled fixture or sample |  |
| PASS | REAL View opens the server-backed detail (no replay wording) | Back to drafts returns to the REAL dashboard (a new real list request, not the preview) |  |
| PASS | REAL View opens the server-backed detail (no replay wording) | reopening wrote nothing (still exactly 29 invoices, no PayPal operations) |  |
| PASS | REAL cross-operator access (operator A's session against operator B's data) | A reading B's invoice by id gets 404, indistinguishable from an unknown id |  |
| PASS | REAL cross-operator access (operator A's session against operator B's data) | A's list through the real route holds 26 rows and none of B's |  |
| PASS | REAL cross-operator access (operator A's session against operator B's data) | a client-supplied operatorId is refused (400), never honoured |  |
| PASS | REAL cross-operator access (operator A's session against operator B's data) | bad cursor / oversized limit / unknown parameter are refused with 400 |  |
| PASS | SIMULATED list failures (interception; server not reached) | 500: an alert with Retry, no rows, no fixture and no LEAK |  |
| PASS | SIMULATED list failures (interception; server not reached) | 200 with an unknown shape: an alert with Retry, no rows, no fixture and no LEAK |  |
| PASS | SIMULATED list failures (interception; server not reached) | 200 with a cursor after a short page: an alert with Retry, no rows, no fixture and no LEAK |  |
| PASS | SIMULATED list failures (interception; server not reached) | 403: an alert with Retry, no rows, no fixture and no LEAK |  |
| PASS | SIMULATED list failures (interception; server not reached) | 400: an alert with Retry, no rows, no fixture and no LEAK |  |
| PASS | SIMULATED list failures (interception; server not reached) | network failure: an alert with Retry, no rows, no fixture and no LEAK |  |
| PASS | SIMULATED list failures (interception; server not reached) | Retry is genuine: it re-requests the real server and the real list returns |  |
| PASS | SIMULATED list failures (interception; server not reached) | a failed next page keeps the 20 loaded rows and offers 'Try loading more again' |  |
| PASS | SIMULATED list failures (interception; server not reached) | retrying the next page then really loads rows 21-26 without duplicates |  |
| PASS | SIMULATED list failures (interception; server not reached) | a superseded (EUR) response arriving after the JPY filter never appears |  |
| PASS | SIMULATED list failures (interception; server not reached) | a failed detail load after View shows an error: no record, no fixture |  |
| PASS | REAL logout and session expiry clear the dashboard | Sign out locks at once: no customer row remains in the page |  |
| PASS | REAL logout and session expiry clear the dashboard | after sign-out none of A's customers is in the DOM |  |
| PASS | REAL logout and session expiry clear the dashboard | re-authentication shows A's real list again (fresh load) |  |
| PASS | REAL logout and session expiry clear the dashboard | a real 401 on the next page ends the session and shows sign-in |  |
| PASS | REAL logout and session expiry clear the dashboard | the list request really returned 401 and no row remains in the page |  |
| PASS | REAL 390px mobile and dark theme | no horizontal overflow at 390px (loaded list) |  |
| PASS | REAL 390px mobile and dark theme | list text contrast >= WCAG AA (dark, 390px) |  |
| PASS | REAL 390px mobile and dark theme | no overflow and AA contrast on the error state (dark, 390px) |  |
| PASS | REAL 390px mobile and dark theme | the error is an announced alert region with a focusable Retry |  |
| PASS | REAL 390px mobile and dark theme | no overflow and AA contrast on the opened detail (dark, 390px) |  |
| PASS | REAL 390px mobile and dark theme | list text contrast >= WCAG AA (light, desktop) |  |
| PASS | REAL 390px mobile and dark theme | no horizontal overflow on desktop |  |
| PASS | Global invariants | no localStorage/sessionStorage/IndexedDB/Cache entries |  |
| PASS | Global invariants | no script-readable cookie; the browser NAVIGATION URL (location.href) carries no customer data, search text or id |  |
| PASS | Global invariants | no request left the app origin (no PayPal/OpenAI/foreign host) |  |
| PASS | Global invariants | the browser used only auth, POST /api/invoice-drafts, GET /api/invoice-drafts and GET /api/invoice-drafts/:id |  |
| PASS | Global invariants | no PayPal operations, approvals or model calls exist |  |
| PASS | Global invariants | every list request in the journey was a GET (the list never mutates) |  |
| PASS | Global invariants | the Fastify request log (query strings stripped) holds no search text, customer name, CSRF token or cookie value |  |
| PASS | Global invariants | no console errors or uncaught exceptions in the browser |  |

Screenshots (synthetic data only, no credentials): 01-real-empty.jpg, 02-operator-b.jpg, 03-first-page.jpg, 04-all-loaded.jpg, 05-no-match.jpg, 06-opened-detail.jpg, 07-list-error.jpg, 08-mobile-dark-list.jpg, 09-mobile-dark-error.jpg, 10-mobile-dark-opened.jpg

Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, 400% zoom, a hosted/TLS (`__Host-` cookie) deployment.
