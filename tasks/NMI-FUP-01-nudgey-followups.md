# NMI-FUP-01 — Nudgey real follow-up scheduling

**Branch / PR:** `feat/nmi-ux02-nudgey`, existing Draft PR #26 (no new branch or PR). Builds on NMI-UX-02 (Nudgey quick actions, hosted CI green at `b5e122f`).
**UI design gate:** extends the owner-approved Nudgey concept with a scheduler inside the same panel and one read-only card on the saved-invoice page; existing tokens and patterns only, no new route or page.

## Implemented (local scheduling) vs deferred (customer notifications)

| Implemented in this task | Deferred, NOT implemented and NOT authorized |
| --- | --- |
| A persisted, operator-owned **local reminder** about one saved invoice: date, time, optional note and an editable message draft | Emailing or messaging the customer, from any channel |
| Due / Upcoming states and counts computed by the **server** from stored UTC instants at read time | A background scheduler, cron or worker; any outbound notification at the due time |
| Complete, reschedule, cancel; one active follow-up per invoice; history on the invoice page | PayPal reminders (`sendReminder`), invoice send, payment or refund operations |
| A local template message (no AI call) the operator can edit and copy | AI-written follow-ups, new OpenAI calls, deciding that an invoice is unpaid or overdue |

A scheduled follow-up is never presented as a message already sent. The API returns `sentToCustomer: false` on every record, the UI states "Nothing is sent to the customer", and `PayPal` is not contacted by any follow-up code path (a boundaries test pins the only routes the browser may call).

## Behaviour
- **Schedule a follow-up** (Nudgey): pick a saved invoice, date, time, optional note; the message is generated locally from the invoice (customer, amount, due date) and stays editable ("Use suggested message", "Copy message").
- **Time zone:** the time is chosen in the operator's browser zone, converted to a real UTC instant (`dueAt`, `Z` only), saved with the IANA zone, and shown back with the zone name (e.g. `Nov 2, 2026, 9:30 AM GMT+8 · Asia/Manila (GMT+8)`). A wall time skipped by a daylight-saving jump is refused.
- **Due vs Upcoming:** `state = due` when `due_at <= server now`. A follow-up may be created up to 5 minutes in the past (an "as of now" pick, immediately due) and at most 2 years ahead. Counts on the launcher badge (due only), the panel summary and the list come from the same `GET /api/follow-ups` read; nothing is guessed locally. The panel re-reads when opened and every 60 s while the workspace is open (read-only requests to the application's own API).
- **Persistence:** table `invoice_follow_ups` (migration `0007`). Rows survive restarts; there is no scheduler to restart.
- **Invoice page:** a "Follow-up reminder" card shows the active follow-up (time with zone, note, message, Due/Upcoming) and the last few completed/canceled ones; it re-reads after any change in Nudgey.

## API (all authenticated; every mutation also needs the CSRF token and the exact Origin)
`GET /api/follow-ups` · `GET /api/invoice-drafts/:id/follow-ups` · `POST /api/follow-ups` · `POST /api/follow-ups/:id/{reschedule,complete,cancel}`.
Strict zod bodies (unknown keys refused, UTC `Z` instants only, validated IANA zone, trimmed text, no control characters, note ≤ 500, message ≤ 2000). An invoice or follow-up owned by another operator, or an unknown id, is one identical `404`; a duplicate active schedule is `409 duplicate_active`; changing a closed one is `409 not_active`. Audit events `followup.schedule|reschedule|complete|cancel` carry ids and closed reason tokens only, never customer text.

## Database and security
- `invoice_follow_ups`: FKs to `invoices` and `operators`; CHECKs on status, closed-at consistency, zone format and text lengths; a **partial unique index** (`invoice_id` where `status = 'active'`) makes duplicate active schedules impossible even under concurrent requests.
- Runtime role grants (`packages/db/ops/runtime-role.sql`): `SELECT, INSERT` plus `UPDATE` on the status/time/text columns only. No `DELETE`, no change of invoice or operator ownership.
- Migration count is now **eight** (`0000`–`0007`); README, judge runbook, Render runbook and the hosted-staging test were updated accordingly. Schema change: additive table only.

## Validation (targeted; no Gate A/B, OAuth or real PayPal/OpenAI test was repeated)
- `apps/api/src/follow-ups.pg.test.ts` (real PostgreSQL): 401 on every route, CSRF/Origin on every mutation, exact contract, UTC storage, strict validation (17 bad inputs), duplicates incl. a 5-way concurrent burst and the DB index, operator isolation, due/upcoming from a moving clock, restart persistence (new app instance), complete/reschedule/cancel rules, DB constraint rejections, audit vocabulary without customer text, zero `fetch` calls.
- `apps/api/src/hosted-staging.pg.test.ts`: the whole flow works as the **least-privilege runtime role** behind the simulated TLS proxy; deletes and ownership changes are denied (`42501`).
- `apps/web/src/followups/*.test.*` + `boundaries.test.ts`: time conversion (incl. DST gap), template wording (no "unpaid/overdue/sent"), transport and strict response validation, controller (server counts, 401, stale view, CSRF), SSR rendering and escaping, and the exact route allow-list.
- Real-browser journey `design/evidence/NMI-FUP-01/run-followup-journey.mjs` (headless Chrome, time zone emulated as Asia/Manila, production build with strict CSP, disposable PostgreSQL 16, **no provider configured**): see `qa-results.json` (23 checks).
- Required repository CI (Project Baseline + Stack) on the exact head.

## Manual demonstration walkthrough (about 2 minutes)
1. Sign in; make sure at least one invoice is saved (New invoice → Enter manually → Save draft).
2. Click **Nudgey** (bottom right) → **Schedule a follow-up**. Choose the invoice; note the generated message and your time zone line. Pick **tomorrow, 09:30**, add a note, edit a sentence, **Save follow-up**.
3. Nudgey now shows **0 Due · 1 Upcoming** with the time and zone. Click **Open invoice**: the saved-invoice page shows the *Follow-up reminder* card ("Nothing is sent to the customer").
4. Nudgey → **Reschedule** → set today's date and the current time → **Save new time**. The server now reports it **Due**: the summary reads **1 Due** and the Nudgey button shows a badge.
5. **Mark complete** (or **Cancel**). Counts return to 0; the invoice card keeps it under earlier follow-ups.
6. Try scheduling the same invoice twice: the second attempt is refused ("already has an active follow-up").
7. Restart the API and reload: scheduled follow-ups are still there.

## Boundaries kept
No change to the PayPal or OpenAI clients, approvals, authentication, sessions, billing or deployment; no new dependency; the unsaved-invoice navigation guard still wraps "Open invoice"; the panel closes on navigation. Draft PR only: no merge, no deployment.
