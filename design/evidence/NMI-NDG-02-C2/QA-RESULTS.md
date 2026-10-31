# NMI-NDG-02 C2 browser QA

- **Code commit tested:** `848382cb7a346ab0b3f621123cba40b96868bf90` (Draft PR #29; subsequent evidence and operational documentation commits preserve this code).
- **Automated focus:** 28/28 tests passed across `schedule.test.ts`, `FollowUpUi.test.tsx`, and `scheduleIntent.test.ts`. Coverage includes edited DST gap/overlap rejection, exact current-zone instant matching, verified-candidate availability during invoice-list loading, and the existing schedule-intent wall resolver. Web typecheck/build, changed-file ESLint, Prettier check and `git diff --check` passed.
- **Browser:** Google Chrome 156.0.8078.80, headless CDP, desktop 1100×900 and mobile 390×844, emulated `Asia/Manila`.
- **Data:** temporary PostgreSQL 16 cluster and isolated operator; four synthetic invoices (two same-name) and two seeded synthetic follow-ups. The chat created no rows. Two additional local follow-ups were persisted only after the existing Save button was explicitly activated. The temporary cluster/profile were removed by the runner.
- **Providers:** OpenAI unconfigured; `PAYPAL_DRAFTS_ENABLED=false`; no PayPal, SMTP, OpenAI, external speech, production-database or migration-against-owner-DB calls. Migration `0007` was applied only to the newly initialized disposable browser-test database as part of the repository journal.
- **Result:** `run-scheduling-journey.mjs` passed 50/50 checks. New cases verify that a reviewed invoice remains selected while authenticated owner-scoped alternatives load and can be selected before Save; an edited New York DST-overlap time is rejected without a write; changing zones requires explicit confirmation; and a unique local time saves its exact UTC instant. The detailed machine result is in [qa-results.json](qa-results.json); the runnable harness is [run-scheduling-journey.mjs](run-scheduling-journey.mjs).

## Coverage

The run exercised preserved C1 invoice and follow-up lookups, PayPal Sandbox draft-state labels, C2 command parsing, bounded owner-authenticated searches, two same-name invoice choices with no automatic candidate selection, owner-scoped invoice alternatives in the reviewed scheduler, local date/time and zone display, immediate removal of stale candidates while typing, accessible keyboard radio selection, an editable create-mode scheduler prefill, no write before Save, Back cancellation, explicit local Saves, ambiguous-time clarification, edited DST-overlap rejection, zone-change confirmation, in-flight request cancellation, HTTP 401 session expiry, empty browser storage, and no external request/PayPal/SMTP operation. C2 candidate and prefilled-scheduler states were checked at 390px; the candidate heading/Close control and first invoice choice remained visible.

Screenshots: `01-pending-invoices.jpg`, `02-conversation.jpg`, `03-narrow.jpg`, `04-candidate-disambiguation.jpg`, `05-editable-prefill.jpg`, `06-candidate-mobile.jpg`, and `07-prefill-mobile.jpg`.

The web build passes with Vite's existing advisory that the main minified bundle exceeds 500 kB; this did not fail the build.
