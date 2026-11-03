# NMI-PROTOTYPE-10D-A4 — QA and Release Readiness Evidence

**Verdict — LOCAL: READY (headless/emulated evidence only; see limitations).  HOSTED: NOT AUTHORIZED.**

All results below were observed on 2026-11-03 (Asia/Manila) from a fresh clone of the tested commit. Nothing is carried over from earlier phases. Every check is synthetic: no real provider, no owner database, no Render resource, no deployment.

## Environment and provenance

- Tested commit (clean clone, `pnpm install --frozen-lockfile`): `8c084d72c3c3632a0fc81e5d93ef07e49d5e70f6` (clean working tree). Commits after it on this branch change documentation/evidence only; no application, schema or dependency file differs from it.
- OS / Node / pnpm / PostgreSQL / browser: Darwin 27.2.0 arm64 / v24.21.0 / pnpm 10.28.0 / postgres (PostgreSQL) 16.15 (Homebrew) / Google Chrome 156.0.8078.80 (headless, CDP, `Asia/Manila` time zone emulated, 390px viewport).
- Database: nmi_test_a4_20261103 on 127.0.0.1:54364 (private cluster in a temp directory); 8 journal migrations (0000–0007) applied to a NEW private cluster; the owner database was never touched. Cluster and directory removed afterwards.
- Stack: real Fastify (SIMULATED launcher: fake parser, fake PayPal) in a sandbox-exec no-egress profile + vite preview production build + headless Chrome (CDP, Asia/Manila emulated) + private PostgreSQL 16.
- Harness run window: 2026-11-03T02:13:34.435Z to 2026-11-03T02:14:15.768Z (UTC).
- Network isolation: the API ran under macOS `sandbox-exec` denying all outbound network except localhost; a probe to 192.0.2.1 failed with EPERM before the run (checks 4–5 below). No provider credential was present in the environment.
- Test-only harness: [run-a4-rehearsal.mjs](run-a4-rehearsal.mjs) (self-contained, no application code or dependency change). Raw output: [qa-results.json](qa-results.json); screenshots in [screenshots/](screenshots/) (synthetic data only).

## Matrix (observed)

| # | Item | Result | Observation |
| --- | --- | --- | --- |
| 1 | Clean clone | PASS | Fresh clone, frozen install, `pnpm validate` passed (lint, format, typecheck, 1056 tests passed / 323 skipped without a DB, build, bundle secret scan clean). `pnpm test:db` against a private PG16: 16 files, 340 tests passed. |
| 2 | Simulated mode | PASS | Real Fastify app via the SIMULATED launcher (fake regex parser, in-memory PayPal fake); banner printed; launcher refuses to start without `NMI_SIMULATED_EVAL=1`. No outbound request possible (sandbox profile) and none attempted. |
| 3 | Auth / CSRF / privacy | PASS | 14 API + 8 browser checks: cookie flags, wrong password 401, CSRF/Origin refusals (4 cases), anonymous 401, owner scoping (404 for other/ownerless rows), logout revokes the server session, late 401 locks the workspace, login throttle 429 (in-memory; cleared by API restart, documented), no customer data in storage/URL/API log. |
| 4 | Invoice journey | PASS | Parse → review → save → fake PayPal DRAFT → replay returned 200 with exactly one fake create. 66 invoices seeded through the real POST route (USD 40, EUR 20, JPY 6). |
| 5 | A2 analytics | PASS | 18-query matrix plus a negative control compared with independent SQL (full population, not the grid page): per-currency minor-unit totals, status groups, search, boundary instants (Manila day edges, New York DST fall-back), 7 invalid-body refusals, list/analytics parity, browser KPI cards equal SQL under every filter and after paging, reversed range error, analytics failure + Retry, 15 s timeout message, loading skeleton, stale-answer cancellation. Totals are never summed across currencies. |
| 6 | UI / a11y | PASS (limited) | Desktop and 390px: no horizontal overflow on dashboard, composer and Nudgey; keyboard order and focus rings checked. **NOT RUN:** physical device, Safari, Firefox, VoiceOver, NVDA. Headless/emulated Chrome only. |
| 7 | Build / security | PASS | `pnpm build` and bundle secret scan clean; boundary checks: no send/remind/cancel/refund/payment/webhook route requested; audit log and API log hold no secrets or customer PII. |
| 8 | Judge readiness | PASS (local) | Runbook Mode A commands re-executed verbatim from the clone (database, migrations, operator, launcher, web dev server): API and proxy `/health` ok, operator sign-in 200 and session 200 through the dev origin, 127.0.0.1-origin sign-in refused with 403 as the runbook states, sign-in screen rendered; teardown left no listener and no directory. Matrix in "Owner readiness" below. |

### A3-FIX1 PayPal safeguards

The invoice-search contract enforcement is covered offline by `packages/paypal` tests (client 74, http 42 passing in `pnpm validate`). Live Sandbox search/reconciliation interoperability: **NOT TESTED** (Gate B not authorized). The simulated draft replay in item 4 exercises only the local idempotency fence with the in-memory fake.

### Earlier R0 journey script

`design/evidence/NMI-DEMO-R0/run-e2e-journey.mjs` was re-run against the same stack: **29/32 passed, 3 failed**. The three failures are stale pre-A2 assertions in that old script, not application defects (confirmed from screenshots): two expect the pre-analytics empty-dashboard and single-card wording, and one route allowlist lacks `/api/analytics/summary` and `/api/follow-ups`, which the A2 dashboard now calls. Not fixed in A4 (out of scope); the A4 harness supersedes it.

### Observations (not defects)

- A brand-new account with no invoices shows the generic "No invoices match these filters" message with a "Create an invoice" button.
- The login throttle is per API process; a restart clears it.

## Owner readiness matrix

| Area | State | Basis |
| --- | --- | --- |
| LOCAL DEMO | READY | Items 1–8 above |
| PROVIDERS | NOT AUTHORIZED | Gates A (OpenAI) and B (PayPal) closed; historical one-create budget exhausted, not reset; live search/reconciliation NOT TESTED |
| LICENSE | UNVERIFIED | AG Studio trial/licensing unverified; AG Grid Community 36.2.0 fallback in use; no licensed binaries committed |
| RENDER | NOT AUTHORIZED | Nothing provisioned. Planning only: decision at 2026-11-07 12:00 Asia/Manila; do not claim Free PostgreSQL lasts to Dec 15; Render Workflow and extra OpenAI calls stay off |
| JUDGE ACCESS | NOT DONE | No judge URL exists or has been shared |
| BACKUP/ROLLBACK | NOT RUN | No hosted restore rehearsal; local databases are disposable |
| SECURITY | PASS (local scope) | Item 3 and 7; no hosted/HTTPS/secret-store review |
| RELEASE | NOT DONE | Draft PR; independent audit, owner merge decision and Devpost submission/public video pending |

## MINOR-1 remediation: harness cleanup (observed)

The audit found that an unexpected exception, rejected promise or SIGINT/SIGTERM could leave child processes or PostgreSQL running, or delete the data directory under a live server. `run-a4-rehearsal.mjs` now handles `uncaughtException`, `unhandledRejection`, SIGINT and SIGTERM with one single-flight cleanup: stop every child process group (SIGTERM, then SIGKILL), stop PostgreSQL (`pg_ctl -m immediate -w stop`, SIGKILL fallback), then delete the temp data and Chrome profile; exit codes 1 / 1 / 130 / 143. The normal path is unchanged.

- New [test-cleanup-injection.mjs](test-cleanup-injection.mjs) runs the real harness with a test-only `A4_INJECT_FAILURE` hook (inert unless set) for throw, reject, sigint and sigterm after the full stack is up. Observed **29/29**: expected nonzero exit code and abort message, 50+ checks had passed before injection, no listener on 3164/4164/9364/54364, no orphaned process, no `nmi-a4-*`/`nmi-qa-a4-*` directory, `qa-results.json` untouched.
- The unmodified success path was re-run after the change: **112/112, exit 0**, no leftovers. The committed `qa-results.json` and screenshots above remain the original run at `8c084d7`.
- The injection test needs macOS `sandbox-exec`, PG16 binaries and Chrome, so it is local evidence and is not part of hosted CI.

## Pending gates

- Host CI at final A4 HEAD (Project Baseline and Stack): see PR #36 and the handoff for run IDs.
- Independent exact-HEAD audit: PENDING. Owner merge approval: PENDING.

## All 112 harness checks (112/112 passed)

| # | Group | Check | Result |
| --- | --- | --- | --- |
| 1 | clean clone | exact source SHA recorded and the working tree is clean | PASS |
| 2 | database | a NEW disposable PostgreSQL 16 database (nmi_test_a4_20261103) was created in a private temp cluster and all 8 journal migrations were applied once | PASS |
| 3 | database | one synthetic operator was provisioned with the real CLI (random password, never printed) | PASS |
| 4 | isolation | the network sandbox the API runs in denies non-loopback egress (connect to the reserved documentation address 192.0.2.1 is refused with EPERM before any packet exists) | PASS |
| 5 | isolation | loopback still works inside the same sandbox | PASS |
| 6 | simulated mode | the SIMULATED launcher (fake parser + fake PayPal client) is up behind the web proxy; /health says aiConfigured=false; no real OpenAI/PayPal credential exists in its environment | PASS |
| 7 | simulated mode | the production server entry has no simulation switch (unit-tested) and the launcher refuses to run without NMI_SIMULATED_EVAL=1 | PASS |
| 8 | seed | 66 synthetic invoices (USD / EUR / JPY, more than three 20-row pages) were saved through the real POST /api/invoice-drafts route | PASS |
| 9 | seed | SIMULATED operation rows give every status group a population (created x3, progress x2, attention x1, the rest none); ownerless and other-operator rows exist as negative controls | PASS |
| 10 | analytics parity | API equals independent SQL over every matched row: whole window, Asia/Manila | PASS |
| 11 | analytics parity | API equals independent SQL over every matched row: whole window, America/New_York | PASS |
| 12 | analytics parity | API equals independent SQL over every matched row: currency USD | PASS |
| 13 | analytics parity | API equals independent SQL over every matched row: currency EUR | PASS |
| 14 | analytics parity | API equals independent SQL over every matched row: currency JPY (zero-decimal) | PASS |
| 15 | analytics parity | API equals independent SQL over every matched row: status none | PASS |
| 16 | analytics parity | API equals independent SQL over every matched row: status created | PASS |
| 17 | analytics parity | API equals independent SQL over every matched row: status progress | PASS |
| 18 | analytics parity | API equals independent SQL over every matched row: status attention | PASS |
| 19 | analytics parity | API equals independent SQL over every matched row: search Northwind | PASS |
| 20 | analytics parity | API equals independent SQL over every matched row: search 'a4 client 1' (case-insensitive substring) | PASS |
| 21 | analytics parity | API equals independent SQL over every matched row: search by invoice-id prefix | PASS |
| 22 | analytics parity | API equals independent SQL over every matched row: search '%' (literal, not a wildcard) | PASS |
| 23 | analytics parity | API equals independent SQL over every matched row: search '_' (literal, not a wildcard) | PASS |
| 24 | analytics parity | API equals independent SQL over every matched row: no match | PASS |
| 25 | analytics parity | API equals independent SQL over every matched row: currency + status + search | PASS |
| 26 | analytics parity | API equals independent SQL over every matched row: Manila boundary window [B1 inclusive, B4 exclusive) | PASS |
| 27 | analytics parity | API equals independent SQL over every matched row: New York DST fall-back window (Nov 1 00:00 EDT to Nov 3 00:00 EST) | PASS |
| 28 | analytics parity | negative control: comparing the API's EUR totals with the independent SQL for USD is detected as a MISMATCH (the parity check can fail) | PASS |
| 29 | analytics parity | the full population exceeds one page and two units of currency stay separate: USD, EUR and JPY each have their own count and exact minor-unit total, with no combined figure | PASS |
| 30 | analytics parity | JPY is zero-decimal (exponent 0) and USD/EUR are two-decimal (exponent 2) in the response | PASS |
| 31 | analytics parity | the ownerless row and the other operator's row are excluded (the SQL population WITHOUT the owner filter would be larger) | PASS |
| 32 | date bounds | inclusive start / exclusive end: the row AT the start and the row 1 ms before the end are in; the row 1 ms before the start and the row AT the end are out | PASS |
| 33 | date bounds | DST fall-back (America/New_York 2026-11-01): both 01:30 instants (EDT then EST) and 23:59:59.999 EST fall on local day Nov 1; 00:00:00 EST on Nov 2 starts the next local day (independent SQL, per row) | PASS |
| 34 | date bounds | Manila (no DST): the inclusive-start row is local Oct 11, the last-ms row is Oct 12; the row 1 ms before the start is Oct 10 and the row AT the exclusive end is Oct 13 (both outside the window) | PASS |
| 35 | date bounds | the API's New York day buckets for the DST window equal the independent SQL buckets (no duplicated or missing local day across the repeated hour) | PASS |
| 36 | analytics errors | a missing time zone is refused (400, no data) | PASS |
| 37 | analytics errors | an unknown time zone is refused | PASS |
| 38 | analytics errors | a missing end bound is refused | PASS |
| 39 | analytics errors | a reversed range is refused | PASS |
| 40 | analytics errors | a range over 366 days is refused | PASS |
| 41 | analytics errors | an unknown extra key (e.g. a client-chosen operator) is refused | PASS |
| 42 | analytics errors | an offset instead of UTC is refused | PASS |
| 43 | grid parity | paging the grid's list API to the end returns the same rows (count and exact per-currency sum) as the analytics API and the independent SQL | PASS |
| 44 | grid parity | a currency + status filter returns the same population in the grid as in analytics (EUR / no PayPal draft) | PASS |
| 45 | auth | login succeeds; the session cookie is HttpOnly, SameSite=Lax and scoped to / | PASS |
| 46 | auth | a wrong password is refused with 401 and no session cookie | PASS |
| 47 | auth | session refresh (GET /api/auth/session) returns the operator and a fresh CSRF token | PASS |
| 48 | auth | a mutation without the CSRF token is refused (403) | PASS |
| 49 | auth | a mutation with a wrong CSRF token is refused (403) | PASS |
| 50 | auth | a mutation from a foreign Origin is refused (403) | PASS |
| 51 | auth | a mutation with no Origin is refused (403) | PASS |
| 52 | auth | anonymous callers get 401 on analytics and the invoice list, with no data | PASS |
| 53 | auth | owner scoping: another operator's invoice is a plain 404 (and an unknown id is identical) | PASS |
| 54 | auth | owner scoping: searching for the other operator's / ownerless customer names finds nothing | PASS |
| 55 | auth | logout revokes the server session: the SAME cookie is rejected afterwards (401 on analytics and on the session check) | PASS |
| 56 | browser auth | the sign-in screen is shown first, with no invoice or analytics request | PASS |
| 57 | browser auth | a wrong password shows an error, keeps the operator signed out, and does not reveal whether the username exists | PASS |
| 58 | browser auth | the correct synthetic credentials sign in and the real dashboard (with all synthetic invoices) loads | PASS |
| 59 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: default window (last 30 days, Asia/Manila) | PASS |
| 60 | browser analytics parity | the page states the window it covers, inclusive of both dates, with its time zone | PASS |
| 61 | browser currency | the page says every card is one currency and that currencies are never added together or converted; no grand total is shown | PASS |
| 62 | browser currency | USD, EUR and JPY appear as three separate cards (JPY with no decimals) | PASS |
| 63 | browser pagination | the grid loads the window page by page (20 -> 40 -> 60 -> 66 rows) and ends with 'All matching invoices are loaded' equal to the SQL count (66) | PASS |
| 64 | browser pagination | loading more pages did not re-request the full-population analytics | PASS |
| 65 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: after paging to the end (cards unchanged) | PASS |
| 66 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: currency pill EUR | PASS |
| 67 | browser filters | the EUR pill sends currency=EUR in BOTH the list and the analytics request bodies | PASS |
| 68 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: PayPal draft status = created | PASS |
| 69 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: PayPal draft status = none | PASS |
| 70 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: PayPal draft status = needs attention | PASS |
| 71 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: customer search 'Northwind' | PASS |
| 72 | browser filters | the search term travels only in POST bodies (list and analytics) and never in a URL, and the grid shows exactly the SQL-matching rows | PASS |
| 73 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: date range Oct 11 to Oct 12 (Manila local days) | PASS |
| 74 | browser date bounds | the page sends paired UTC instants for the local days: start = Oct 11 00:00 Manila (2026-10-10T16:00:00.000Z) inclusive, end = Oct 13 00:00 Manila (exclusive), with the IANA zone | PASS |
| 75 | browser date bounds | a reversed range shows an inline error and sends no analytics request | PASS |
| 76 | browser error states | when analytics fails the page shows an alert 'Could not load full-population totals', says no loaded-row estimate is substituted, and shows NO KPI cards | PASS |
| 77 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: after 'Retry totals' (currency USD) | PASS |
| 78 | browser loading state | while analytics is in flight the cards area shows a busy skeleton labelled 'Loading full-population totals' (no stale or estimated numbers) | PASS |
| 79 | browser error states | a request that never answers ends with an honest error after the client timeout (15s), not an endless spinner or a guess | PASS |
| 80 | browser cancellation | a superseded analytics request (JPY) is cancelled/ignored: after its late wrong answer is injected the page still shows the LATEST filter's (EUR) totals, never the stale ¥1 | PASS |
| 81 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: latest filter after cancellation (EUR) | PASS |
| 82 | invoice journey | the SIMULATED parser's proposal opens the editable Review; nothing is saved yet | PASS |
| 83 | invoice journey | the human Save writes exactly one verified draft to PostgreSQL (server total $540.00) and opens the saved page | PASS |
| 84 | invoice journey | no PayPal draft exists after parse and save (no create during parse/save/list/refresh) | PASS |
| 85 | invoice journey | the confirmation dialog names the invoice, customer and amount and says nothing is emailed, sent or collected | PASS |
| 86 | invoice journey | the SIMULATED DRAFT is verified by the real service: DRAFT shown, 'customer has not been emailed', one POST, one fake create, operation 'created' with attempts=1 | PASS |
| 87 | invoice journey | A3-FIX1 safeguard: repeating the confirmation is a replay (HTTP 200, same id), NOT a second create: still exactly one fake provider create and one operation row | PASS |
| 88 | invoice journey | the page re-read the durable state (GET) and shows the same PayPal id as PostgreSQL | PASS |
| 89 | browser analytics parity | dashboard KPI cards equal independent SQL for the window/filters the page requested: after the journey (new invoice included) | PASS |
| 90 | invoice journey | only the explicit confirmation made a fake provider call (one create for the whole run); simulated parse calls were counted locally and no browser request left the origin | PASS |
| 91 | browser auth | late 401: after the session is revoked server-side, the next dashboard request returns the page to the sign-in screen | PASS |
| 92 | browser privacy | after the late 401 no customer name, e-mail or total remains on the page | PASS |
| 93 | browser auth | signing in again works | PASS |
| 94 | browser auth | the browser holds the session cookie as HttpOnly (invisible to page scripts) and document.cookie shows nothing | PASS |
| 95 | browser auth | Sign out returns to the sign-in screen and removes every invoice from the page | PASS |
| 96 | browser auth | the cookie the browser used before logout is rejected by the server afterwards (revocation, 401) | PASS |
| 97 | 390px | the dashboard at 390px has no page-level horizontal overflow and keeps the KPI cards and date range reachable | PASS |
| 98 | 390px | the date inputs can be scrolled into view and tapped (hit-tested) | PASS |
| 99 | 390px | the composer at 390px has no page-level horizontal overflow | PASS |
| 100 | 390px | the Nudgey panel at 390px stays inside the viewport and above the mobile navigation | PASS |
| 101 | keyboard | Tab reaches the date range, search and status filters in order and every focused control shows a visible focus indicator | PASS |
| 102 | boundaries | the browser used only auth, invoice save/list/detail/search, PayPal-draft confirm, analytics and follow-up reads | PASS |
| 103 | boundaries | no send, remind, cancel, refund, payment, webhook, SMTP or OpenAI route was requested | PASS |
| 104 | boundaries | no browser request left the local origin | PASS |
| 105 | boundaries | no browser persistent storage (localStorage, sessionStorage, IndexedDB, Cache) and no customer data or query in the page URL | PASS |
| 106 | boundaries | the API log holds no customer name/e-mail, password, session cookie value or CSRF token | PASS |
| 107 | boundaries | zero external provider activity: exactly one fake PayPal create in the whole run, and the sandboxed API process had no way to reach another host | PASS |
| 108 | boundaries | no uncaught exception or unexpected console error in the browser (expected 4xx/blocked-request log lines excluded) | PASS |
| 109 | boundaries | the audit log carries no customer name or e-mail | PASS |
| 110 | auth | repeated wrong passwords are rate limited (HTTP 429 with Retry-After) after 6 attempts | PASS |
| 111 | auth | while limited, even the correct password is refused (429); restarting the API process clears the in-memory throttle (documented operational limit) | PASS |
| 112 | auth | after an API restart the operator can sign in again | PASS |
