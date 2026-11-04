# NMI-PROTOTYPE-10D-A5-I1: real AG Studio 3.0 local integration, QA and evidence

**Verdict: LOCAL AG STUDIO INTEGRATED (development-only, opt-in, view-only).** 96/96 browser checks passed against real AG Studio 3.0.0 in the authenticated dashboard. **Hosted / public / judge use of Studio: NOT AUTHORIZED and NOT VERIFIED** (AG Grid's written confirmation is still required; see Limitations).

All observations were made on 2026-11-04 (Asia/Manila). Synthetic data only; SIMULATED providers; no provider call, no owner database, no Render, no deployment.

## Environment and provenance

- Base commit when the QA ran: `4bf3f69cbc54c950204258ea38d1f9074ea51043` plus the uncommitted A5-I1 working tree (committed as the A5-I1 implementation commit on this PR); OS / Node / pnpm / PostgreSQL / browser: Darwin 27.2.0 arm64 / v24.21.0 / pnpm 10.28.0 / postgres (PostgreSQL) 16.15 (Homebrew) / Google Chrome 156.0.8078.80 (headless, CDP, Asia/Manila emulated).
- Packages: `ag-studio@3.0.0`, `ag-studio-react@3.0.0` (exact pins); the lockfile resolves matching `ag-grid-enterprise` 36.2.0 and `ag-charts-enterprise` 14.2.0 beside the existing AG Grid Community 36.2.0.
- Stack: real Fastify (SIMULATED launcher: fake parser, fake PayPal) in a sandbox-exec no-egress profile + the real web app on the Vite DEV server (VITE_NMI_STUDIO_LOCAL=1) + real AG Studio 3.0.0 + headless Chrome (CDP, Asia/Manila emulated) + private PostgreSQL 16.
- Database: nmi_test_a5i1_20261104 on 127.0.0.1:54388 (private cluster in a temp directory); 8 journal migrations; 170 invoices through the real save route, created_at spread over 118 days (zero-invoice days exist), plus an ownerless and another-operator negative row and SIMULATED status rows. Cluster and directory removed after the run.
- Run window (UTC): 2026-11-04T05:07:44.757Z to 2026-11-04T05:09:48.895Z. Harness: [run-studio-qa.mjs](run-studio-qa.mjs); raw: [qa-results.json](qa-results.json).
- The licence key was located privately in the repo-root `.env.local` (not `apps/web`), with the other provider variables in the same file never read by the web tooling. Its value was never printed, logged, copied, or committed.

## What was integrated (all real, none simulated)

- A **real `AgStudio` (view mode)** pair rendered by `ag-studio-react`: a column chart (daily invoice value, one currency at a time) and a 100% stacked bar chart (PayPal Sandbox draft status per currency). Both are fed only the existing authenticated `POST /api/analytics/summary` answer (no second fetch, endpoint, SQL connection or table).
- Placement per the approved A5-D design: between the existing currency cards and the AG Grid Community table; mobile (<=767px) collapsed by default with a native Show/Hide charts button; desktop and tablet expanded; daily bars up to 90 local calendar days and Monday-start weekly bars beyond; exact accessible daily table with every calendar day (zero days included); "Studio · view only" badge only when Studio is actually active.
- Feature gate `VITE_NMI_STUDIO_LOCAL=1`, default OFF, and dev-server only; the entire Studio surface is code-split and removed from production builds.

## Matrix (observed)

| Area | Result | Observation |
| --- | --- | --- |
| Install and compatibility | PASS | Exact 3.0.0 pins; lockfile resolves matching Grid 36.2.0 and Charts 14.2.0; typecheck, lint, format and build pass. |
| Real Studio rendering | PASS | Panel state "active" inside the real dashboard, between the cards and the Community grid, view mode, no toolbar/export/AI/filter-panel chrome. |
| Exactness vs independent SQL | PASS | For USD, EUR and JPY, 30-day, 90-day (daily) and 120-day (weekly) ranges: the table has exactly one row per calendar day (zero days exact), every NON-ZERO bar Studio plots (read through the chart's own keyboard tooltips) equals SQL (PostgreSQL `date_trunc('week')` for weekly), plotted bars add up to the cards, and status counts equal SQL. 88 zero-invoice buckets were observed; Studio draws no tooltip target for a zero-height bar, so those are verified exactly in the table. |
| Filters share one request | PASS | Currency pill, status, search and date range each made exactly one analytics request; the panel adds none. 90 days stays daily, 91 becomes weekly. |
| Failure states | PASS | Analytics failure shows the existing error and no panel; Studio module failure shows "Charts unavailable" with Retry, cards and grid intact, then recovers; blocked licence request still renders; late stale answers never replace the current filter. |
| Session security | PASS | A revoked session removes panel, cards and grid and shows sign-in (late 401). |
| Mobile 390 / keyboard | PASS | Collapsed by default, Studio not loaded while collapsed, Enter expands with focus kept, 44px targets, no horizontal overflow, same exact values. |
| Default OFF / Community | PASS | Without the flag: no panel, no Studio request or module, no licence route key, Community dashboard intact. |
| Privacy / network / leakage | PASS | Browser talked only to its own origin; no AG host contacted; no storage; licence value absent from URL, DOM, storage, console, API log, Vite log and the working tree; no provider call (fake logs empty). |
| Production bundle and key | PASS | `vite build` (default, and `--mode development` with the flag set) emits 3 files with no Studio, Charts-enterprise, bridge or key; `pnpm check:bundle` clean; a negative control (a static Studio import) makes the build fail. |

## Local validation

- `pnpm validate` (lint, format, typecheck, tests, build, bundle scan): passed; **1097 tests passed, 323 skipped** (41 new: model, report, licence bridge, default-off slot; existing boundary tests updated deliberately for the new packages and the dev-only licence fetch).
- Database integration tests were **not run**: no database, API or schema code changed.
- Hosted CI at the final PR head: see the PR and handoff for run IDs.

## Observations worth the auditor's attention

- **Watermark/licence state is not observable.** With the licence request blocked, Studio 3.0 in view mode showed **no** evaluation watermark (observed: "hidden by Studio (ag-hidden)"), and with the key applied it also showed none ("hidden by Studio (ag-hidden)"); no licence warning was logged in the licensed session (0 messages). So this QA proves the key is accepted without error, not what entitlements it grants. The vendor attribution rule is implemented as "never hide or cover": the NMI page adds no CSS that hides Studio chrome, and a check fails if a watermark Studio shows is hidden.
- **Screenshots are from the key-withheld session** (licence request blocked), not from a licensed session, because the A5 task forbids committing licensed renders. Because no watermark appears either way, they look the same; the harness still refuses to screenshot outside that phase.
- Zero-height bars have no Studio tooltip target (above); the exact table is the complete record.
- After a revoked session the existing sign-in screen appeared without the "session has expired" notice (recorded: no notice); that is existing behavior outside this change.
- One earlier full run aborted on a macOS socket error (`setTypeOfService EINVAL`) after 92 passing checks, unrelated to the product; the next full run completed 96/96. Earlier runs also stopped on bugs in this harness itself (selector, zero-value comparison, tooltip-by-position), all fixed before the final run.

## Limitations (NOT verified)

- Hosted, public or judge use of AG Studio; external-judge rights, redistribution and expiry (trial ends 2026-12-16; written AG Grid confirmation still required). Render, public URL, recording of licensed Studio: not authorized.
- Physical device, Safari, Firefox, VoiceOver, NVDA: NOT RUN. Headless Chrome with emulated 390px only.
- Studio's own accessibility is partial: it exposes a focusable chart with keyboard tooltips (used by this QA), but the NMI page also provides the accessible table and text status list as the authoritative equivalents.
- Bundle size of the Studio chunk in dev is large (the packages are ~32 MB unpacked); it never reaches a production build.
- Live PayPal/OpenAI behavior: NOT TESTED (simulated).

## Screenshots (synthetic data, key-withheld session)

01 desktop daily, 02 JPY (zero-decimal), 03 tooltip after keyboard focus, 04 weekly (120 days), 05 weekly dark, 06 mobile 390 collapsed, 07 mobile expanded, 08 mobile dark, 09 "Charts unavailable" fallback, 10 analytics error with no panel, all in [screenshots/](screenshots/).

## All 96 checks

| # | Group | Check | Result |
| --- | --- | --- | --- |
| 1 | environment | AG Studio 3.0.0 packages are installed with exact pins and the lockfile resolves matching AG Grid 36.2.0 and AG Charts 14.2.0 | PASS |
| 2 | environment | the licence variable was found in the untracked .env.local (value never read into any output) | PASS |
| 3 | database | a NEW disposable PostgreSQL 16 database (nmi_test_a5i1_20261104) was created in a private temp cluster and all 8 journal migrations were applied once | PASS |
| 4 | database | one synthetic operator was provisioned with the real CLI (random password, never printed) | PASS |
| 5 | isolation | the network sandbox the API runs in denies non-loopback egress (192.0.2.1 is refused with EPERM) | PASS |
| 6 | simulated mode | the SIMULATED API (fake parser + fake PayPal) is up behind the web dev server; /health says aiConfigured=false; no real provider credential exists in its environment | PASS |
| 7 | licence bridge | the dev bridge answers a same-origin flagged GET with 200, no-store and a key present (value not shown) | PASS |
| 8 | licence bridge | every disallowed request shape (no header, foreign Host, cross-site, POST) is 403 and carries no key | PASS |
| 9 | licence bridge | the untracked .env.local (which also holds provider secrets) is not servable by the dev server | PASS |
| 10 | seed | 170 synthetic invoices (USD/EUR/JPY) were saved through the real POST route; created_at spread over 118 days; ownerless and other-operator rows exist as negative controls; SIMULATED status rows cover every group | PASS |
| 11 | sign-in | the real sign-in reaches the real dashboard on the Vite DEV server with the Studio flag on | PASS |
| 12 | studio render | real AG Studio rendered inside the authenticated dashboard (panel state 'active', Studio badge shown) | PASS |
| 13 | studio render | the panel sits between the authoritative currency cards and the AG Grid Community table, and nothing else moved (filters, cards and grid markup are the existing ones) | PASS |
| 14 | studio render | Studio is in VIEW mode and offers no export/edit chrome: no widget toolbar buttons, no filter panel, no AI panel, no menus | PASS |
| 15 | studio render | the licensed session: any Studio watermark element is either hidden by Studio itself or visible; the NMI page never hides a watermark Studio shows (observed: hidden by Studio (ag-hidden)) | PASS |
| 16 | studio render | the licensed session logged no AG Studio licence warning or error to the browser console (the key is accepted; entitlement itself is not observable by this QA) | PASS |
| 17 | exactness | the existing full-population currency cards equal independent SQL (A2 baseline carried into A5) | PASS |
| 18 | exactness | the chart-currency selector is a view-only roving tablist (busiest currency first, one tab per currency, no filter change) | PASS |
| 19 | exactness | USD (default 30-day range): the accessible table has exactly 30 rows = every calendar day, zero-invoice days included, each equal to independent SQL (count and exact minor units) | PASS |
| 20 | exactness | USD (default 30-day range): zero-invoice days appear as real rows with the exact zero | PASS |
| 21 | exactness | USD (default 30-day range): a 30-day range is plotted DAILY | PASS |
| 22 | exactness | USD (default 30-day range): every NON-ZERO bar PLOTTED BY STUDIO (read through the chart's own keyboard navigation and tooltip) equals independent SQL local-day buckets: label, exact value and invoice count; 15 zero-invoice bucket(s) have no plotted height and never a non-zero value | PASS |
| 23 | exactness | USD (default 30-day range): the plotted bars add up to the card total (USD only, never mixed with another currency) | PASS |
| 24 | exactness | EUR (default 30-day range): the accessible table has exactly 30 rows = every calendar day, zero-invoice days included, each equal to independent SQL (count and exact minor units) | PASS |
| 25 | exactness | EUR (default 30-day range): zero-invoice days appear as real rows with the exact zero | PASS |
| 26 | exactness | EUR (default 30-day range): a 30-day range is plotted DAILY | PASS |
| 27 | exactness | EUR (default 30-day range): every NON-ZERO bar PLOTTED BY STUDIO (read through the chart's own keyboard navigation and tooltip) equals independent SQL local-day buckets: label, exact value and invoice count; 19 zero-invoice bucket(s) have no plotted height and never a non-zero value | PASS |
| 28 | exactness | EUR (default 30-day range): the plotted bars add up to the card total (EUR only, never mixed with another currency) | PASS |
| 29 | exactness | JPY (default 30-day range): the accessible table has exactly 30 rows = every calendar day, zero-invoice days included, each equal to independent SQL (count and exact minor units) | PASS |
| 30 | exactness | JPY (default 30-day range): zero-invoice days appear as real rows with the exact zero | PASS |
| 31 | exactness | JPY (default 30-day range): a 30-day range is plotted DAILY | PASS |
| 32 | exactness | JPY (default 30-day range): every NON-ZERO bar PLOTTED BY STUDIO (read through the chart's own keyboard navigation and tooltip) equals independent SQL local-day buckets: label, exact value and invoice count; 26 zero-invoice bucket(s) have no plotted height and never a non-zero value | PASS |
| 33 | exactness | JPY (default 30-day range): the plotted bars add up to the card total (JPY only, never mixed with another currency) | PASS |
| 34 | keyboard | the currency tablist moves and selects with the arrow keys (roving tabindex) and announces aria-selected | PASS |
| 35 | exactness | the draft-status breakdown counts per currency equal independent SQL for none / in progress / draft created / needs attention, and 'created' is described as a Sandbox DRAFT (not sent, not paid) | PASS |
| 36 | exactness | the Studio status chart is a real stacked chart keyed by currency (its keyboard tooltip names a currency and a SQL-matching count) | PASS |
| 37 | filters | currency pill EUR: exactly ONE analytics request was made (the panel adds no fetch of its own) | PASS |
| 38 | filters | currency pill EUR: the chart-currency selector is not rendered and the panel shows EUR only, equal to SQL | PASS |
| 39 | exactness | EUR pill: the accessible table has exactly 30 rows = every calendar day, zero-invoice days included, each equal to independent SQL (count and exact minor units) | PASS |
| 40 | exactness | EUR pill: zero-invoice days appear as real rows with the exact zero | PASS |
| 41 | exactness | EUR pill: a 30-day range is plotted DAILY | PASS |
| 42 | exactness | EUR pill: every NON-ZERO bar PLOTTED BY STUDIO (read through the chart's own keyboard navigation and tooltip) equals independent SQL local-day buckets: label, exact value and invoice count; 19 zero-invoice bucket(s) have no plotted height and never a non-zero value | PASS |
| 43 | exactness | EUR pill: the plotted bars add up to the card total (EUR only, never mixed with another currency) | PASS |
| 44 | filters | status filter = PayPal draft created: exactly ONE analytics request was made (the panel adds no fetch of its own) | PASS |
| 45 | filters | status filter 'PayPal draft created': cards and panel show only matching invoices (status counts equal SQL, every other group is zero) | PASS |
| 46 | filters | search 'Client 0': exactly ONE analytics request was made (the panel adds no fetch of its own) | PASS |
| 47 | filters | search text: cards and panel equal independent SQL (the search term itself is never sent to Studio) | PASS |
| 48 | privacy | no customer name, e-mail or search term appears in any element of the Studio panel (and the panel is present) | PASS |
| 49 | filters | date range: one analytics request for the 120-day range | PASS |
| 50 | exactness | EUR (120-day range): the accessible table has exactly 120 rows = every calendar day, zero-invoice days included, each equal to independent SQL (count and exact minor units) | PASS |
| 51 | exactness | EUR (120-day range): zero-invoice days appear as real rows with the exact zero | PASS |
| 52 | exactness | EUR (120-day range): a 120-day range is plotted WEEKLY (Monday start) with the Weekly view note | PASS |
| 53 | exactness | EUR (120-day range): every NON-ZERO bar PLOTTED BY STUDIO (read through the chart's own keyboard navigation and tooltip) equals independent SQL date_trunc('week') buckets: label, exact value and invoice count; 1 zero-invoice bucket(s) have no plotted height and never a non-zero value | PASS |
| 54 | exactness | EUR (120-day range): the plotted bars add up to the card total (EUR only, never mixed with another currency) | PASS |
| 55 | exactness | JPY (120-day range): the accessible table has exactly 120 rows = every calendar day, zero-invoice days included, each equal to independent SQL (count and exact minor units) | PASS |
| 56 | exactness | JPY (120-day range): zero-invoice days appear as real rows with the exact zero | PASS |
| 57 | exactness | JPY (120-day range): a 120-day range is plotted WEEKLY (Monday start) with the Weekly view note | PASS |
| 58 | exactness | JPY (120-day range): every NON-ZERO bar PLOTTED BY STUDIO (read through the chart's own keyboard navigation and tooltip) equals independent SQL date_trunc('week') buckets: label, exact value and invoice count; 8 zero-invoice bucket(s) have no plotted height and never a non-zero value | PASS |
| 59 | exactness | JPY (120-day range): the plotted bars add up to the card total (JPY only, never mixed with another currency) | PASS |
| 60 | exactness | USD (120-day range): the accessible table has exactly 120 rows = every calendar day, zero-invoice days included, each equal to independent SQL (count and exact minor units) | PASS |
| 61 | exactness | USD (120-day range): zero-invoice days appear as real rows with the exact zero | PASS |
| 62 | exactness | USD (120-day range): a 120-day range is plotted WEEKLY (Monday start) with the Weekly view note | PASS |
| 63 | exactness | USD (120-day range): every NON-ZERO bar PLOTTED BY STUDIO (read through the chart's own keyboard navigation and tooltip) equals independent SQL date_trunc('week') buckets: label, exact value and invoice count; 0 zero-invoice bucket(s) have no plotted height and never a non-zero value | PASS |
| 64 | exactness | USD (120-day range): the plotted bars add up to the card total (USD only, never mixed with another currency) | PASS |
| 65 | filters | a 90-day range is plotted daily (owner rule: daily up to 90 days, weekly beyond) | PASS |
| 66 | filters | a 91-day range is plotted weekly (owner rule: daily up to 90 days, weekly beyond) | PASS |
| 67 | stale answers | a late answer for a superseded filter (held, then released after the newer filter) never replaces the current panel: it still shows EUR and equals SQL | PASS |
| 68 | failure | analytics failure: the existing error + Retry appears, NO Studio panel is rendered, no loaded-row estimate is substituted | PASS |
| 69 | failure | after Retry the panel returns with the new answer | PASS |
| 70 | failure | Studio module load failure: 'Charts unavailable' fallback with Retry, no Studio badge, and the currency cards and the AG Grid Community table are untouched | PASS |
| 71 | failure | fallback keeps the exact accessible daily table available | PASS |
| 72 | failure | after the module can load again, 'Try loading charts again' recovers real Studio | PASS |
| 73 | failure | licence request blocked (no key): Studio still renders real charts, any Studio watermark is not hidden by the NMI page (observed: hidden by Studio (ag-hidden)), and the dashboard stays correct | PASS |
| 74 | network | the browser talked only to its own origin during the whole Studio session (no third-party, telemetry, CDN or provider request) | PASS |
| 75 | network | no request to any AG Grid / AG Studio host (licence validation is offline in the browser) | PASS |
| 76 | privacy | no browser storage holds anything (the licence key, report state and customer data are never persisted) | PASS |
| 77 | privacy | the licence key value is not in the page URL, DOM, storage or console output | PASS |
| 78 | privacy | the licence key value is not in the API log, the Vite dev-server log or the runner's own output | PASS |
| 79 | privacy | the Studio panel carries no personal data from the invoice list: no customer names/e-mails and no invoice ids in its DOM | PASS |
| 80 | boundaries | the browser never requested a send, remind, cancel, refund, payment or webhook route | PASS |
| 81 | boundaries | no provider call was made: the fake PayPal and fake model logs are empty | PASS |
| 82 | mobile 390 | <=767px: the panel is COLLAPSED by default (Show charts, aria-expanded=false, body hidden) with the heading visible, and Studio is NOT loaded while collapsed | PASS |
| 83 | mobile 390 | collapsed controls are out of the tab order (no focusable element inside the hidden body) | PASS |
| 84 | mobile 390 | no page-level horizontal overflow while collapsed | PASS |
| 85 | mobile 390 | keyboard Enter on Show charts expands the panel, aria-expanded=true, focus stays on the button, Studio loads on demand and shows its badge | PASS |
| 86 | mobile 390 | expanded at 390px: no page-level horizontal overflow, the currency selector targets are >= 44px, and the Studio canvas fits the card | PASS |
| 87 | mobile 390 | on mobile the Studio chart reads the same exact values as SQL (the bars reached through keyboard tooltips are matched by label) | PASS |
| 88 | mobile 390 | Hide charts collapses it again | PASS |
| 89 | evidence | UNLICENSED evidence session (licence request blocked): real Studio renders; this is the only session whose screenshots are saved (watermark observed: hidden by Studio (ag-hidden)) | PASS |
| 90 | evidence | a Studio tooltip appears only after keyboard focus/arrow (hover and tap are the pointer equivalents), never idle | PASS |
| 91 | 401 | a revoked server session (late 401 on the next analytics refresh) removes the workspace at once: the sign-in screen shows (the existing notice wording is recorded, not required), and no Studio panel, chart or customer total remains in the DOM | PASS |
| 92 | default off | without VITE_NMI_STUDIO_LOCAL=1 the dev server has no licence bridge: the route returns no key (the SPA shell, not JSON) | PASS |
| 93 | default off | flag off: the dashboard is the Community dashboard: no Activity analytics panel, cards and the AG Grid Community table present | PASS |
| 94 | default off | flag off: no Studio module, licensed package, chart chunk or licence request was loaded by the browser | PASS |
| 95 | boundaries | no uncaught browser exception during the whole run | PASS |
| 96 | screenshots | screenshots were saved only from the UNLICENSED session (none from the licensed session) | PASS |

## A5-I1-FIX1 addendum (audit MINOR-1 / MINOR-2)

Not a rerun of the 96-check browser matrix. Targeted evidence: `apps/web/src/features/studio/StudioFallback.test.tsx` (4 tests, happy-dom, licensed packages and licence fetch stubbed) and `pnpm validate` (1101 passed). Covers outer `StudioPanel` chunk failure (accessible notice, no badge, no charts, no Retry), healthy control, and the huge-value fixture (no badge/"fallback" while over-limit, badge/"active" back on a safe currency). Browser-level outer-chunk failure injection is NOT RUN.
