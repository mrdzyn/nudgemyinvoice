# NMI-NDG-03 — Nudgey "Check invoice status" selector (defect fix)

**Branch / PR:** `fix/nmi-nudgey-status-selector`, a new bounded Draft PR against `main` (which contains the merged Nudgey widget and follow-ups, PR #26). It does **not** touch Draft PR #27 (conversational lookup); both change `components/Nudgey.tsx`, so whichever merges second needs a small mechanical conflict resolution.

## Defect (confirmed)
`nudgeyAction("status")` returned the same navigation as "View my invoices" (`navigate → dashboard`). On the dashboard it changed nothing visible, and elsewhere it only dropped the operator on the dashboard with an announcement telling them to find an invoice themselves.

## UI design gate
Requirements were given by the owner in the request (searchable, operator-scoped selector; draft state with accurate loading and error states; open the existing detail page; no payment inference). The design reuses the owner-approved Nudgey panel patterns and existing tokens (header, close button, form fields, 44 px targets, list-of-buttons with `aria-pressed`, `role="status"` / `role="alert"` messages); there is no new route, page or navigation structure. A separate mock-up round is therefore not needed, but **the screenshots in `design/evidence/NMI-NDG-03/screenshots/` are submitted for owner visual approval in the Draft PR before any merge.**

## Behaviour
- **Check invoice status** opens a selector inside the Nudgey panel (the panel stays open). It no longer navigates. **View my invoices** is unchanged (dashboard) and **Create an invoice** is unchanged.
- **Search your invoices** (customer name or email): one bounded page (20) through the existing `session.listInvoices` → `POST /api/invoice-drafts/search`. The term travels only in the request body, is trimmed/collapsed, sent after a 250 ms pause, and each new search aborts the previous one. An empty box loads the first page.
- Each invoice shows customer, its own currency and exact total, due date and the server's PayPal Sandbox draft state (`No PayPal draft`, `PayPal draft created`, `Creation in progress`, `Outcome unknown`, `PayPal rejected`, `Needs operator review`). Selecting one shows the same facts and **Open invoice details**, which uses the existing real-mode `open-saved` navigation.
- States: loading, empty account (with *Create an invoice*), no match (names the search), five distinct server failures with *Try again*, unusable term (control characters or over 100 characters: nothing is sent), truncation ("only the first 20; search by customer or open the dashboard").
- **Never** says or implies sent, paid, unpaid, overdue or settled. The panel states: "This is the state of the PayPal Sandbox draft only. It does not show whether an invoice has been sent, paid, unpaid, overdue or settled."

## Security and boundaries
Authenticated session only (the panel is mounted only for a server-confirmed session); read-only; 401 ends the session; the selector's state is in memory, cleared on close, Back and sign-out, and a late answer for an aborted search is never shown. No PayPal, OpenAI or SMTP call, no new endpoint, migration, dependency or storage.

**Unsaved-form guard (a latent gap closed here):** `open-saved` with notice `opened` (choosing another saved invoice from Nudgey, the dashboard or the follow-up list) is now a *leaving* action in `invoices/leaveGuard.ts`, so an unresolved Review save (pending or uncertain) asks before it is abandoned. The save's own outcomes (`created`, `replayed`) stay free.

## Validation
- `apps/web/src/nudgey/statusLookup.test.ts` (request shape: one bounded page, `q` only in the body, empty term, normalisation, loading, each failure, 401, abort/stale/reset/dispose, bad terms never sent, selection rules, retry, guard), `StatusPicker.test.tsx` (every state, labels, escaping, source-level boundary audit: no fetch/storage/URL/provider/mail code and only existing network files), `Nudgey.test.tsx` (status has no navigation action; browse unchanged; home copy), `leaveGuard.test.ts`.
- Real browser `design/evidence/NMI-NDG-03/run-status-journey.mjs` (headless Chrome, production build with strict CSP, disposable PostgreSQL 16, no provider configured; one operation row is a clearly labelled SIMULATED insert so the "PayPal draft created" label can be shown): see `qa-results.json` (24 checks, incl. the original defect on the dashboard, search/select/open, failure and retry, the unchanged dashboard shortcut, 390 px layout, Escape focus, sign-out).
- Required CI on the exact head. Gate A/B, OAuth and real-provider tests were not repeated.

## Separate problem: "Follow-ups could not be loaded" is a database/API diagnosis, not SMTP
That message appears when `GET /api/follow-ups` fails (offline or server error). **No email or SMTP setting is involved, and SMTP is not implemented**; changing mail settings cannot affect it. Diagnose the API and database:
1. Check the API terminal/log for the failing request (`/api/follow-ups`, status 500).
2. Most likely on a database created before NMI-FUP-01: the table `invoice_follow_ups` may not exist because migration `0007` was never applied. Check with `psql "$DATABASE_URL" -Atc "select to_regclass('public.invoice_follow_ups')"` (empty = missing). The owner's local `nudgemyinvoice` database was confirmed missing the table on 2026-10-31 (8 tables, none named `invoice_follow_ups`). The owner subsequently reports that, after a verified backup, migration `0007` was applied successfully to that local database. **Do not rerun it there.**
3. For another intended database, first verify the table and confirm a current backup/recovery path with the owner. Do not blindly replay migration `0007`; coordinate any missing-schema remediation with the owner. If the API connects as the least-privilege role, verify its `SELECT`/`INSERT`/`UPDATE` grants from `packages/db/ops/runtime-role.sql`.
4. If the table exists, check that the API's database role can `SELECT`/`INSERT`/`UPDATE` it (`42501` in the log), then check the usual connection errors.
The agent did **not** run or rerun the migration on any database.

## Independent review remediation — P2-1 / P2-2
- **P2-1:** a status search superseded by a newer search still honors a returned HTTP 401 and expires the active session. `reset()` and `dispose()` invalidate their lifecycle so late canceled responses remain ignored; late non-401 results from aborted/stale searches remain discarded.
- **P2-2:** the search input synchronously clears old rows, truncation state, and selection on every term change, before the existing 250 ms request debounce. The selector keeps its existing DOM structure, visual tokens, desktop/mobile layout, and selected-invoice presentation; a selection must be made again from the results for the current term.
- **Deterministic regression coverage:** an internally aborted search returning 401 after a newer search succeeds; reset/dispose cancellation; non-401 stale response; immediate result/selection clearing before the delayed request; and input-event wiring before the debounce.
- **Focused validation:** `pnpm exec vitest run apps/web/src/nudgey/statusLookup.test.ts apps/web/src/nudgey/StatusPicker.test.tsx apps/web/src/invoices/leaveGuard.test.ts apps/web/src/components/Nudgey.test.tsx` (42 passed), `pnpm --filter @nmi/web typecheck`, and Prettier check for changed source/docs passed. Required hosted CI must pass on the final exact head; no provider tests/integrations were run.
- **Migration note:** owner reports migration `0007` was applied successfully to the local database after a verified backup. The agent did not run or rerun it; follow-up troubleshooting now says not to rerun it on that database.
