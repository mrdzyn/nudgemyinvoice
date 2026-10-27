# NMI-UI-01C4 — Real authenticated invoice dashboard

- **State:** IMPLEMENTED at `4309c7f63ee0dc1dc60cad8a079c277aa5a1d399`; READY FOR INDEPENDENT GPT-6 AUDIT. Not self-certified, not merged.
- **Base:** `main` at `988a8f9f22876f8f19d7424a31ff6b1f62ebf8c9` (C3 squash merge, PR #12, independently audited).
- **Branch:** `feat/nmi-ui-01c4-real-dashboard`. Draft PR; Claude implements; GPT-6 audits; owner decides merge.
- **Phase plan:** `tasks/NMI-UI-01C-integration-plan.md`; approved design `design/screens/NMI-UI-01A-SCREENS.md`. The approved dashboard layout (currency cards, filters, native accessible table) is reused; no redesign.
- **Owner decisions:** D1 AG Studio deferred (native table kept); D2 no browser persistence of customer data; D3 list is read-only (this task); D4 no editing of saved drafts.
- **Provider gate:** NO PayPal and NO OpenAI request. No invoice mutation of any kind is authorized or added.
- **UI design gate:** approved NMI-UI-01A dashboard reused; the only additions are the real-data states already implied by the design (loading, error, no match, load more, end of list).

## Objective

Replace the synthetic authenticated dashboard with a real, read-only, PostgreSQL-backed invoice list, owner-scoped on the server, and let the operator reopen any saved invoice. The synthetic design preview stays available and isolated.

## Accepted contract — `GET /api/invoice-drafts` (new, read-only)

Auth: existing operator session (`app.requireOperator`). The operator is taken ONLY from the server session; a client-supplied `operatorId` (or any unknown parameter) is a 400. `Cache-Control: no-store`. No CSRF flow (safe method).

Query (strict; unknown or repeated parameters are 400):

| Parameter | Rule |
| --- | --- |
| `limit` | 1..50, default 20 (`^\d{1,2}$`) |
| `cursor` | opaque, `^[A-Za-z0-9_-]{1,120}$`, base64url of `[created_at (UTC, microseconds), id]`; decoded strictly (real calendar instant, lowercase UUID, canonical re-encoding), else 400 `invalid_cursor` |
| `currency` | one of the six supported ISO codes |
| `status` | `none` (no durable operation row), `progress` (pending, creating), `created`, `attention` (unknown, rejected, mismatch) |
| `q` | trimmed, 1..100 chars; case-insensitive substring of customer name or e-mail, or an invoice-id prefix; `\`, `%`, `_` are escaped and parameterized |

Response `200`: `{ "items": [ { "id", "customerName", "customerEmail", "currency", "dueDate", "total", "createdAt", "paypal": { "state" } } ], "nextCursor": string | null }`. `total` is an exact decimal string in the invoice's own currency (JPY has no decimals). `createdAt` is a UTC ISO instant (ms). `paypal.state` is the durable `paypal_draft_operations.state` (`none` when no row exists; `invoices.paypal_invoice_id` is never used to infer a PayPal draft). No line items, digests, idempotency keys, owner ids, audit rows or provider payloads are returned. `nextCursor` is non-null only when more rows exist and always follows a full page. Errors: `400 invalid_query` / `invalid_cursor`, `401`.

Ordering and paging: `created_at DESC, id DESC` with keyset paging on `(created_at, id)`, so rows that share a timestamp, microsecond gaps and inserts between pages cannot cause a skipped or repeated row. One query (`invoices LEFT JOIN paypal_draft_operations` on the unique `invoice_id`): no N+1, no global count, no unbounded scan of the response. Filters and search run over the whole owned collection, never just the page, and the cursor is meaningful only together with the filters it was issued for (the browser drops it on every filter change).

`GET /api/invoice-drafts/:id` is now operator-scoped (`PostgresInvoiceDraftStore.getOwned(id, operatorId)`): another operator's id, an ownerless row, an unknown id and a non-UUID all return the same `404 {"error":"not_found"}`.

Logging: Fastify request logs keep the path only (`serializers.req`), because the query string can carry the operator's search text. This covers the application log only, not any proxy in front of it (see "Privacy boundaries for search text"). No audit row is written for list reads.

## Scope

Allowed: `packages/db` list store and owned read; `apps/api` list route, owned detail read and the log serializer; `apps/web` list transport, strict list validation, real dashboard, saved-page `opened` state; tests; sanitized evidence; docs.
Forbidden and not done: migrations, payment/provider code, the PayPal execution path and state machine, send/remind/refund/cancel, editing or deleting invoices, multi-tenancy or roles, AG Studio, C5.

## Frontend behavior

- Real mode (`session.listInvoices` present) renders `RealDashboard`; only the synthetic preview reaches the fixture dashboard. A failed load shows an error with a genuine Retry and substitutes nothing.
- States: initial loading, loaded, no invoices, filters-with-no-match (Clear filters), offline, server failure, invalid response, 401 (ends the C1 auth epoch), 403, loading next page, end of list; a failed next page keeps the rows already loaded.
- A pure reducer tags every outcome with a generation: stale or out-of-order answers, superseded filters and double "load more" are dropped; a page that repeats a loaded id fails closed; requests abort on filter change, retry, unmount, logout and session expiry. The filter bar stays mounted once a page has loaded (found by the browser run: it used to vanish during reloads and drop typed search).
- Strict response validation (`domain/serverList.ts`): exact keys, UUID, bounded text, supported currency, canonical money per currency exponent, real calendar due date, real UTC `createdAt`, enumerated PayPal state, no duplicate ids, newest-first, page not longer than requested, cursor well-formed, advancing and only after a full page.
- Currency cards sum the LOADED invoices only, per currency, with BigInt minor units, and are labelled "Page summary ... not a total of all your invoices"; PayPal-created counts are likewise scoped to loaded rows. There is no cross-currency total, FX or conversion.
- View opens the existing saved-invoice page through `GET /api/invoice-drafts/:id`. New `opened` notice (neutral, read-only) is separate from C3's `created` and `replayed`; opening an old invoice never says "saved just now" or "HTTP 200 replayed". Back to drafts returns to the real dashboard. No edit, delete, PayPal or send control exists.
- Search text lives only in React state: never in the browser navigation URL or browser storage, and never in the Fastify request log. It IS sent to the API in the `q` query parameter of the GET request (see "Privacy boundaries for search text").

## Privacy boundaries for search text (precise scope)

The approved contract puts the search term in the `q` query parameter of `GET /api/invoice-drafts`. Four different surfaces must not be conflated:

| Surface | Customer data / search text | Status |
| --- | --- | --- |
| Browser **navigation URL** (`location.href`, history) | None. The dashboard never writes search text, ids or customer data to it. | Verified (unit boundary test + real-browser check) |
| Browser **persistent storage** (localStorage, sessionStorage, IndexedDB, Cache, cookies readable by script) | None. Search text lives in React memory only. | Verified (boundary test + real-browser check) |
| **Fastify request logs** | Query strings are stripped (`serializers.req` keeps the path only). | Verified (PostgreSQL API test + real-browser log scan) |
| **HTTP GET request URL** to the API (`/api/invoice-drafts?...&q=<term>`) | **Present.** The term may be a customer name, e-mail address or invoice-id prefix, so it IS customer information in transit and wherever the request line is recorded. | Documented, by design of the approved contract |

**Deployment prerequisite:** any reverse proxy, ingress controller, load balancer, CDN or WAF in front of the API, and any access/audit log it writes, must omit or redact the query string of `/api/invoice-drafts` (at least `q`) before logs are stored or shipped. This is NOT validated: no hosted proxy or ingress was exercised in C4 (hosted reverse proxy remains untested), so no proxy-side privacy claim is made.

**Owner decision available (not taken):** if the owner requires an absolute prohibition on customer data in HTTP request URLs, that conflicts with the approved `GET ... ?q=` list contract. The options (for example a POST-based search endpoint, or limiting `q` to an invoice-id prefix) change the API contract and the CSRF/idempotency posture, so they were NOT implemented without approval. Reported here for the owner's decision.

## Security findings (documented, not changed under C4)

1. **Fixed:** `GET /api/invoice-drafts/:id` previously read by id without an owner (`drafts.get(id)`); it is now owner-scoped as above.
2. **Open, out of scope:** `createPayPalDraft` (`apps/api/src/services/paypal-draft-service.ts`, used by `POST /api/invoice-drafts/:id/paypal-draft`) still loads the invoice with the unscoped `drafts.get(input.invoiceId)` and the operation by invoice id. In today's single-operator deployment this is not exploitable, but with a second operator it would let one operator drive another's invoice into a PayPal Sandbox draft. It must be scoped before C5 or before any second operator exists; changing it touches the payment path, so it was deliberately left alone here.
3. **Fact to carry forward:** production enforces exactly one operator (`operators_single_row_uq`, plus `OperatorConflictError`). Owner isolation is therefore defense in depth today. The PostgreSQL suites and the browser journey create a second operator ONLY in disposable databases by dropping that index (test-only DDL; the committed migrations are untouched).
4. **Performance note:** name/e-mail search is a bounded `ILIKE` scan of the operator's own rows (no trigram index). No migration was added; nothing measured justified one at this scale.

## Test objective and evidence (implementation SHA `4309c7f63ee0dc1dc60cad8a079c277aa5a1d399`)

Objective: the list is authenticated, read-only, owner-scoped, strictly validated, bounded, exact and stable; the UI shows only server data and fails closed; the preview is unchanged.

- **PostgreSQL (real, disposable PostgreSQL 16.15):** `packages/db/src/invoice-list-store.pg.test.ts` and `apps/api/src/invoice-list.pg.test.ts` (66 tests): A sees only A, B only B, ownerless rows nobody; unauthenticated 401; other-operator detail 404 identical to unknown; 22 invalid query/cursor cases and the bounds; page size default/clamp; stable paging across equal timestamps, microsecond gaps and inserts between pages; search over the last page, wildcard literals, SQL-text inputs; currency and PayPal-group filters with paging; durable PayPal state only; exact money in USD/JPY/GBP/EUR; response key set; read-only (no row, audit or approval change); no provider call; path-only logging. `pnpm test:db`: 10 files, 254 tests passed.
- **Frontend (web suite 442 tests):** list transport and validator (request shape, 401/403/400/5xx/offline/abort, 27 malformed variants, cursor loop), reducer (stale/out-of-order, filter reset, single-flight load-more, repeated-row refusal, retry, search merge, filter-bar persistence), real dashboard render states, currency separation with exact sums, the `opened` notice, preview isolation, boundary tests (no write method, no browser persistence).
- **Mutation controls killed (PostgreSQL + API):** owner filter removed (14 failing), id tie-break removed (1), cursor made inclusive (7), unescaped prefix wildcard (1), detail not owner-scoped (2), limit cap raised (1).
- **Real browser journey:** `design/evidence/NMI-UI-01C4/run-dashboard-journey.mjs`, 79/79 in headless Chrome (was 78/78 before the remediation added one explicit `q`-in-request-URL check; the 78 earlier checks are unchanged and still pass): production bundle + strict CSP -> same-origin proxy -> real Fastify -> disposable PostgreSQL 16, no OpenAI/PayPal configuration, synthetic customers only, TWO operator accounts. REAL: empty account; invoices created in USD/EUR/JPY/GBP; B's private data created through B's own session; A's dashboard 20 + load more = 26 rows in exact database order with no duplicate or skip; per-currency cards equal sums recomputed from PostgreSQL minor units (page and whole account); EUR/JPY pills, filter after paging drops the cursor, search finds the oldest row (not on page 1), invoice-id prefix, other operator's customers not findable; View by keyboard opens the detail by `GET /:id` with the neutral notice; A reading B's id gets a 404 identical to an unknown id; forged `operatorId`, bad cursor, limit 0/51, unknown parameter, bad currency/status, oversized search all 400; sign-out and a real 401 wipe the page; 390 px, dark theme, contrast, overflow; storage empty, no customer data in the browser navigation URL, no search text in the Fastify log, zero foreign requests, no mutation or PayPal operation; the harness also records that the HTTP GET request URL does carry `q`. SIMULATED (interception, labelled): 500, malformed 200s, 403, 400, network failure, failed next page, a superseded filter response arriving late, a failed detail load.
- **Browser negative controls:** removing the owner filter failed 8 isolation/paging checks; making the cursor inclusive failed 4 paging checks; the genuine run was regenerated afterwards.
- **Local gates:** lint, format:check, typecheck, build, bundle scan, profile validator clean. `pnpm test` without a database: 695 passed, 237 skipped (PostgreSQL-only suites). Hosted Stack CI runs them against PostgreSQL.

## Known limitations

Live OpenAI and PayPal are not involved. HTTPS `__Host-` cookie, screen readers, real touch, Safari/Firefox, 400% zoom and a hosted reverse proxy are NOT tested. Throttling is in-memory per process. Summary cards cover the loaded invoices only (no whole-account aggregate endpoint). Search is a bounded `ILIKE` over the operator's own rows. The C2/C3 journeys assert earlier wording (sample dashboard rows) and were not rerun; their results are historical. A page reload returns to the dashboard.

## Audit remediation: MINOR-1 (privacy wording; documentation and evidence only)

Independent audit of `1e92511ef4cfa1133f054651ddf7342e73c5b3da` found that the C4 documentation and QA wording overstated privacy ("never in the URL"), although the approved `GET ... ?q=` contract puts the search term in the HTTP request URL. No production code changed. Corrections: the task, STATUS, SECURITY.md, ARCHITECTURE.md, the handoff `NMI-UI-01C4-R1`, the PR description, the boundary-test title and the journey's assertion descriptions now distinguish the browser navigation URL, browser storage, Fastify request logs and the HTTP GET request URL; the proxy/ingress/CDN/access-log redaction prerequisite is documented as untested; the absolute-prohibition question is reported for the owner. The meaningful checks are unchanged (and one explicit check was added that records `q` in the request URL). The explicit security finding is preserved: `createPayPalDraft` / `POST /api/invoice-drafts/:id/paypal-draft` still reads by id without an operator scope and MUST be operator-scoped before C5 or any second operator. The journey was rerun against the unchanged production code: 79/79, all earlier checks still passing. `pnpm test` 695 passed / 237 skipped (PostgreSQL-only), `pnpm test:db` 254 passed on real PostgreSQL 16.15, lint/format/typecheck/build/bundle scan/profile validator clean. The only file under `apps/` or `packages/` that changed is a test title in `apps/web/src/boundaries.test.ts`.
