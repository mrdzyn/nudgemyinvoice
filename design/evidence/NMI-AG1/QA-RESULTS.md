# NMI-AG1 browser AG Grid Community dashboard journey

Chrome: Chrome/156.0.8078.74 (headless). PostgreSQL: postgres (PostgreSQL) 16.15 (Homebrew) (disposable cluster, destroyed after the run).
Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.
Privacy scope of the checks below: they prove the browser NAVIGATION URL and browser storage hold no customer data and that the Fastify request log has query strings stripped. They do NOT claim the HTTP GET request URL is free of customer data (the search term travels in `q`), and no reverse proxy, ingress, CDN or access log was exercised (untested). Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; no model client exists in this journey. Two operator accounts exist ONLY in this disposable database (production allows exactly one; `add-second-operator.ts` drops that index in the throw-away database to exercise owner isolation). Invoices are created through the real save route.

**79/79 checks passed.**

| Result | Group | Check | Detail |
| --- | --- | --- | --- |
| PASS | setup | disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy |  |
| PASS | setup | database is a throw-away nmi_test* cluster in a temp directory |  |
| PASS | setup | PayPal drafts disabled; OPENAI_API_KEY/OPENAI_MODEL empty (no provider can be reached) |  |
| PASS | AG Grid Community: structure and licensing | the invoice list is a real AG Grid (ag-root-wrapper, grid role) and the native <table> is gone |  |
| PASS | AG Grid Community: structure and licensing | the grid lists exactly the 20 newest invoices, identified by their invoice UUID row ids, in server order |  |
| PASS | AG Grid Community: structure and licensing | all 20 loaded rows are present in the DOM (row virtualisation off), each with a labelled View button |  |
| PASS | AG Grid Community: structure and licensing | the six approved columns are present with their headers |  |
| PASS | AG Grid Community: structure and licensing | totals are formatted exactly in the invoice currency and never summed across currencies |  |
| PASS | AG Grid Community: structure and licensing | every row shows the server's PayPal Sandbox status (all 26 have no operation row -> 'No PayPal draft') |  |
| PASS | AG Grid Community: structure and licensing | no AG Grid console warning or error (module/license/theme) |  |
| PASS | AG Grid Community: structure and licensing | no Content-Security-Policy violation under the strict production CSP |  |
| PASS | AG Grid Community: structure and licensing | no injected <style> element and no inline <style> in the page (style-src 'self' stays unweakened) |  |
| PASS | AG Grid Community: structure and licensing | no AG Grid license watermark or Enterprise/Studio text anywhere |  |
| PASS | AG Grid Community: structure and licensing | the grid is wrapped in a named group and the list is announced (result count) |  |
| PASS | AG Grid Community: structure and licensing | loading the page made only GET list requests (no mutation, no foreign host) |  |
| PASS | Sorting: client-side, loaded rows only, exact money | Customer ascending: header exposes aria-sort and the rows are reordered |  |
| PASS | Sorting: client-side, loaded rows only, exact money | Customer descending: exact reverse (stable ties) |  |
| PASS | Sorting: client-side, loaded rows only, exact money | Total ascending: currency code first, then the EXACT minor-unit amount (never a cross-currency magnitude), ties keep server order |  |
| PASS | Sorting: client-side, loaded rows only, exact money | Total descending matches the independent BigInt expectation |  |
| PASS | Sorting: client-side, loaded rows only, exact money | Due ascending (all equal dates -> server order is kept, stable) |  |
| PASS | Sorting: client-side, loaded rows only, exact money | Invoice sorts by the saved instant (oldest first), single-column sort replaces the previous one |  |
| PASS | Sorting: client-side, loaded rows only, exact money | PayPal Sandbox status sorts by its label (all equal -> server order, stable) |  |
| PASS | Sorting: client-side, loaded rows only, exact money | Actions is not sortable |  |
| PASS | Sorting: client-side, loaded rows only, exact money | sorting issued NO request at all (client-side over the loaded rows) |  |
| PASS | Sorting: client-side, loaded rows only, exact money | the currency cards (loaded rows, per currency) are identical before and after sorting |  |
| PASS | Resizable columns and keyboard header | a column header can take keyboard focus |  |
| PASS | Resizable columns and keyboard header | Enter on a focused header sorts that column |  |
| PASS | Resizable columns and keyboard header | dragging the Customer resize handle +60px widens that column |  |
| PASS | Resizable columns and keyboard header | resizing issued NO request and did not change the cards |  |
| PASS | Resizable columns and keyboard header | the Actions column is not resizable |  |
| PASS | View invoice: keyboard and real saved-invoice navigation | the View action is a focusable native button with the invoice/customer accessible name |  |
| PASS | View invoice: keyboard and real saved-invoice navigation | Enter on View opens THAT invoice from the server (GET /api/invoice-drafts/:id for exactly its UUID) |  |
| PASS | View invoice: keyboard and real saved-invoice navigation | opening read nothing but GET requests |  |
| PASS | Keyboard: Tab order and no trap | Tab from the filters enters the grid, reaches a View button, and continues to 'Load more invoices' |  |
| PASS | Keyboard: Tab order and no trap | a View button reached by the keyboard shows a visible focus ring (>= 2px solid, :focus-visible) |  |
| PASS | Keyboard: Tab order and no trap | the focus order is bounded (no trap): Load more is reached within 60 Tab presses |  |
| PASS | Keyboard: Tab order and no trap | Shift+Tab leaves 'Load more' and returns into the grid |  |
| PASS | Keyboard: Tab order and no trap | Shift+Tab walks back out of the grid to the status filter (no backwards trap) |  |
| PASS | Load more with an active sort | Load more asks the server for the next page with the cursor and the same limit; the sort is NOT sent |  |
| PASS | Load more with an active sort | all 26 rows are present with no duplicate UUID |  |
| PASS | Load more with an active sort | the operator's descending Customer sort is kept over the now-26 loaded rows |  |
| PASS | Load more with an active sort | Total ascending over all 26 loaded rows is currency-first then exact amount |  |
| PASS | Load more with an active sort | after the last page the per-currency cards equal the whole-account exact sums (independent of the grid sort), never combined |  |
| PASS | Load more with an active sort | no 'Grand total' across currencies exists |  |
| PASS | Server filters and search still drive the grid | the EUR pill asks the SERVER (currency=EUR) and the grid shows only the EUR invoices |  |
| PASS | Server filters and search still drive the grid | search is server-side: the grid shows exactly the one match and the search box stays mounted |  |
| PASS | Server filters and search still drive the grid | no match: the grid is replaced by the honest 'No invoices match' state with Clear filters |  |
| PASS | Server filters and search still drive the grid | Clear filters restores the grid from the server |  |
| PASS | SIMULATED failures: no grid, no fixture, working Retry | SIMULATED offline list: the alert replaces the grid; no row and no sample data is shown |  |
| PASS | SIMULATED failures: no grid, no fixture, working Retry | Retry reaches the real server again and no match is reported for the unusual search |  |
| PASS | Dark theme and contrast | light desktop: all grid and page text >= WCAG AA |  |
| PASS | Dark theme and contrast | the grid follows the app's dark tokens (rows use the dark surface, not AG Grid's white) |  |
| PASS | Dark theme and contrast | dark desktop: all grid and page text >= WCAG AA |  |
| PASS | Dark theme and contrast | dark: header, row and cell backgrounds are not light (no white flash) |  |
| PASS | 390px mobile | no page-level horizontal overflow at 390px (the grid scrolls inside itself) |  |
| PASS | 390px mobile | all six columns remain in the DOM and the grid body scrolls horizontally when it must |  |
| PASS | 390px mobile | dark 390px: text contrast >= WCAG AA |  |
| PASS | 390px mobile | at 390px (grid not scrolled) the first row shows the customer, the exact total and the View action together, all inside the viewport |  |
| PASS | 390px mobile | the View action target is >= 24 x 24 CSS px (WCAG 2.2 AA target size) |  |
| PASS | 390px mobile | the narrow column order is Customer, Total, Actions, PayPal Sandbox, Invoice, Due (nothing removed) |  |
| PASS | 390px mobile | the remaining columns (PayPal status, invoice, due) are reachable by scrolling the grid sideways |  |
| PASS | 390px mobile | tapping View at 390px opens the saved invoice |  |
| PASS | 390px mobile | light 390px: no page overflow and text contrast >= WCAG AA |  |
| PASS | 400% zoom smoke (320 x 256 CSS px, equivalent to 400% on a 1280 x 1024 window) | no page-level horizontal scroll at 400% equivalent (reflow, WCAG 1.4.10) |  |
| PASS | 400% zoom smoke (320 x 256 CSS px, equivalent to 400% on a 1280 x 1024 window) | the title, filters, grid, View action and Load more all remain present and reachable |  |
| PASS | 400% zoom smoke (320 x 256 CSS px, equivalent to 400% on a 1280 x 1024 window) | Load more is fully visible without horizontal scrolling |  |
| PASS | Session lock | Sign out removes the grid and every customer name from the page at once |  |
| PASS | Build facts | the production bundle imports no Enterprise, Charts or Studio package: the only 'ag-grid-enterprise' text is the core's own 'missing module' error message |  |
| PASS | Build facts | the production CSS contains no data: font (CSP font-src 'self' stays unweakened) |  |
| PASS | Build facts | exactly ag-grid-community and ag-grid-react are the added dependencies, pinned to one exact version |  |
| PASS | Build facts | the production page still carries the strict CSP (no unsafe-inline / unsafe-eval) |  |
| PASS | Global invariants | no localStorage/sessionStorage/IndexedDB/Cache entries |  |
| PASS | Global invariants | no script-readable cookie; the browser NAVIGATION URL carries no customer data or id |  |
| PASS | Global invariants | no request left the app origin (no PayPal/OpenAI/foreign host) |  |
| PASS | Global invariants | the browser used only auth, GET /api/invoice-drafts and GET /api/invoice-drafts/:id (the seed POSTs came from the harness, not the browser) |  |
| PASS | Global invariants | the browser sent no mutation of invoice data |  |
| PASS | Global invariants | no PayPal operations, approvals or model calls exist |  |
| PASS | Global invariants | no AG Grid console message at any point in the journey |  |
| PASS | Global invariants | no console errors or uncaught exceptions in the browser |  |

Screenshots (synthetic data only, no credentials): 01-desktop-light.jpg, 02-sorted.jpg, 03-all-loaded-sorted.jpg, 04-no-match.jpg, 05-error.jpg, 06-desktop-dark.jpg, 07-mobile-dark.jpg, 07b-mobile-dark-first-view.jpg, 08-mobile-dark-scrolled.jpg, 09-mobile-light.jpg, 10-zoom-400.jpg

Build facts: JS index-DQNXEO5u.js 1070599 B (306565 B gzip); CSS index-CGwaokXB.css 296336 B (42164 B gzip).

Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, a real browser zoom control (the 400% check is a 320 x 256 CSS px viewport emulation), a hosted/TLS (`__Host-` cookie) deployment.
