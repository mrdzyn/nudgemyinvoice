# NMI-PROTOTYPE-10D-A2 — Real Dashboard Analytics Integration

- **State:** Implementation on new Draft PR; independent exact-head review required.
- **Starting base:** `main@7f87ca80e61b3c418c9b596b39cbb6b4bebb99bc` (PR #32 merged).
- **Branch:** `feat/nmi-proto-analytics-02`
- **Parent:** [NMI-PROTOTYPE-10D](NMI-PROTOTYPE-10D.md), [A1 analytics contract](NMI-PROTOTYPE-10D-A1-analytics-contract.md), and [architecture plan](../docs/NMI-PROTOTYPE-10D-PLAN.md).

## Objective

Wire the authenticated full-population `POST /api/analytics/summary` API into the existing real React dashboard. Keep KPI totals exact and independent of the loaded invoice page, and make aggregate and grid results represent the same operator-owned filter population.

## UI/design disposition

- **UI design gate:** approved NMI-UI-01B dashboard shell is reused. This is business/data wiring with one compact date-range control in the existing filter area, explicit coverage copy, server-authoritative values in existing currency cards, and integrated loading/error states. Do not add a chart, replace AG Grid Community, reorder sections, or redesign the shell.
- **Required states:** initial aggregate/grid loading; loaded; empty operator population; no filter matches; analytics-only error; grid-only error; both errors; retry; offline; verified 401/session expiry; invalid response; date validation/conversion error; range loading; cancellation/stale response; narrow/mobile layout; light and dark themes.
- **Stop condition:** if fitting the control/states into the approved dashboard requires a material structural or visual redesign, stop and request explicit owner design approval before implementation proceeds.
- **Accessibility:** native labelled date inputs, keyboard-operable filters/actions, visible focus, announced loading/errors, and responsive reflow. No claim of full WCAG 2.2 AA; preserve existing known manual QA limitations.

## Allowed scope

- Typed analytics request/strict response validation and same-origin transport.
- Dashboard filter state/controller, analytics presentation and range controls in `apps/web/src/features/dashboard/` and existing invoice API/domain modules.
- Paired optional UTC date bounds in the existing authenticated invoice-list POST contract, validation, owner-scoped SQL predicates before cursor pagination, and focused API/store regressions.
- Focused unit/component tests, disposable PostgreSQL integration tests, synthetic no-provider browser QA evidence, this task, `docs/STATUS.md`, and one A2 handoff section.

## Required behavior and security boundaries

1. Analytics transport is POST-only to `/api/analytics/summary`; uses same-origin credentials, no-store cache, redirect error, and CSRF from volatile authenticated state. Search stays in POST bodies and all invoice/customer/session data stays out of URLs, logs and browser persistence.
2. Strictly validate the complete success DTO: exact keys/version; supported currency and matching exponent; safe nonnegative counts; exact state groups; valid ISO local dates; bounded unique currency/day groups; canonical nonnegative integer minor-unit strings; internally consistent totals/counts. Reject the entire response on any defect. Keep amounts as integer strings/BigInt; no floating-point totals or cross-currency sum.
3. A verified HTTP 401 expires/locks the authenticated workspace even if an internally superseded request was aborted. Ordinary aborted/stale results are ignored. Disposal, logout, 403, cancellation, and generation guards must not let late results restore a signed-out workspace.
4. Extend only the existing authenticated `POST /api/invoice-drafts/search` with optional paired `fromInclusive`/`toExclusive` UTC millisecond instants; both absent remains compatible. Validate strict format, increasing half-open interval, and maximum 366 UTC days. Apply `created_at >= from AND created_at < to` in the owner-scoped SQL query before pagination. Preserve existing filters, cursor behavior, CSRF/Origin, no-store, search-body privacy, and GET behavior. No migration.
5. Keep one canonical validated dashboard filter state for analytics and grid. Default to the latest 30 local calendar dates including today in a validated browser IANA timezone; show inclusive selected dates and timezone. Convert local dates to UTC half-open instants with deterministic DST-aware logic; reject nonexistent/ambiguous local boundaries or unsupported dates with actionable feedback. Range changes and currency/status/search changes invalidate both request families. Load-more and local grid sort/resize never refetch analytics.
6. Existing cards show per-currency exact formatted amount, exponent, matching invoice count, and count of durable PayPal Sandbox drafts created. Label the operator-owned matching population and selected date range. Never label a sandbox draft sent/paid/overdue. Grid remains paginated; sort remains over loaded rows.
7. Preserve authenticated real-mode isolation from synthetic fixture preview, existing navigation and unsaved-edit guard. Read paths perform no writes and cannot trigger provider requests.

## Test objective and acceptance criteria

Prove that authenticated dashboard aggregates and invoice rows stay correct, synchronized, exact, cancellable, and private across supported filters and lifecycle changes.

- More than 200 matching synthetic invoices: aggregates match an independent database result even when the grid reaches its maximum loaded-row cap; pagination does not change cards.
- Owner/ownerless isolation and identical currency/status/search/date semantics across the aggregate and grid.
- Exact USD/EUR/JPY exponents and sums; no cross-currency sum.
- UTC inclusive-start/exclusive-end behavior and `America/New_York` DST behavior, including default 30-local-date range.
- Rapid search/filter changes, retry, abort, out-of-order reads, sign-out and late 401 never show stale KPIs with new rows or restore authenticated data.
- Malformed, duplicate, inconsistent and out-of-range analytics DTOs fail closed.
- Existing page sorting, keyboard View, load-more, search privacy, synthetic preview isolation, no-store and no-write/provider boundaries remain intact.
- Automated unit/component and disposable PostgreSQL suites pass; targeted browser QA uses only synthetic data and fake providers, covering desktop, 390px mobile, light/dark, filters, keyboard, empty/error/retry/date states and responsive overflow.
- Project Baseline CI and Stack CI pass on the exact final PR SHA. Independent correctness/security review precedes any owner merge decision.

## Validation and boundaries

- Run focused web/API typecheck, changed-file formatting/lint, relevant component/unit tests, and real PostgreSQL API/list/analytics integration tests using a newly created disposable `nmi_test*` database. Follow `docs/TESTING.md`; do not use or modify the owner's existing database.
- Run a synthetic no-provider browser journey and preserve evidence, distinguishing automated, simulated-browser and manual checks.
- No PayPal/OpenAI/MCP calls, AG Studio/Enterprise/Agent Framework, Render resources, migrations, production data, payment actions, feature-flag changes, merge, deployment, or judge access.
- Preserve the exhausted PayPal one-create authorization, consumed OpenAI Gate A, sandbox-only payment controls, local-only follow-up notification boundary, and all auth/owner-scoping defenses.

## Implementation and validation record

- Added the typed POST-only analytics transport and strict complete-response validation. A shared filter generation now governs both aggregate and list responses; loading, debounce, invalid-date, cancellation, stale-response, and 401 behavior are explicit. The grid remains paginated and the aggregate stays server-authoritative through the 200-row display cap.
- Added the default 30-local-calendar-date range, IANA/DST-aware UTC half-open conversion, and paired date bounds on authenticated invoice search. SQL applies owner and date predicates before cursor paging; GET compatibility is preserved. No schema or migration changed.
- Kept existing dashboard structure and AG Grid Community. Added only labelled native date controls, summary coverage/error/loading states, and token-based responsive styling. No chart, AG Studio or other shell redesign was added.
- Added a real local-stack Chrome QA runner and artifacts in `design/evidence/NMI-PROTOTYPE-10D-A2/`. Chrome `156.0.8078.80` verified the 257-row exact total (`USD 3,171.38`), pagination to 200, shared date/search/currency filters, clear-filter recovery, keyboard focus, dark system theme, reachable date controls and no page overflow at 390px. All 12 browser checks passed; only same-origin local traffic was observed. Evidence uses a disposable PostgreSQL database and synthetic rows; PayPal creation was disabled, OpenAI unconfigured, SMTP absent. This is automated local browser evidence, not physical-device or hosted-provider evidence.
- Focused web/Nudgey regressions: **235 passed** across nine files after adding the analytics boundary allowance, including transport validation, UTC/DST conversion, stale/out-of-order aggregate and list reads, late aborted 401, debounce state, rendering, existing C1/C2 lookup/scheduling candidates, and first-party analytics route boundary assertions (28/28).
- PostgreSQL 16 integration: **96 passed** across invoice-list store, authenticated list/search routes, and analytics routes, using `nmi_test_a2_20261102`; the 257-row analytics/list parity case passed. The separate browser DB `nmi_test_a2_qa_20261102` was also newly created for QA. Both task-created databases were dropped after validation; the owner's existing `nmi_test` and `nudgemyinvoice` databases were not touched.
- Static/build checks: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm check:bundle`, and `git diff --check` passed. The existing Vite bundle-size advisory (>500 kB JS chunk) remains non-failing; secret scan passed.
- Hosted CI first ran on `650e8b9d6bea89762fbe5a8eeb2eaa7299866b05`: Project Baseline passed; Stack CI failed only because inherited boundary-test assertions still treated first-party `/api/analytics/summary` as forbidden. Updated the boundary tests to allow the first-party analytics route while continuing to reject third-party analytics SDKs. The targeted boundary suite passed 28/28; combined focused suite passed 235/235, and lint, format, typecheck and `git diff --check` passed after the correction. Both required hosted workflows must be verified again at the final pushed SHA.
- No PayPal/OpenAI/SMTP requests, migrations, Render/AG Studio resources, owner-database operations, merge or deployment were performed.

## Completion handoff

Open a new Draft PR against `main` with exact base/final SHAs, API compatibility details, validation and browser evidence, boundaries, limitations, and design-gate disposition. Update `docs/STATUS.md`, append one unique A2 handoff, and stop for independent exact-head audit.
