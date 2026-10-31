# Combined no-provider browser QA — PR #27

- **Audited head:** `4a974943cdd81ef5a2fc757a36a2ccaf8a2f6005`
- **Run date:** 2026-10-31
- **Browser:** headless Google Chrome 156; production Vite build with strict CSP
- **Data:** synthetic invoices and follow-ups in disposable PostgreSQL 16 clusters created in temporary directories; each journey provisioned its own throw-away operator. The owner's local database was not used or modified.
- **Providers:** PayPal drafts disabled and no PayPal credentials. No OpenAI, PayPal, or SMTP network requests. The save-guard suite uses its documented deterministic in-process fake model for one separate parser regression; it does not call OpenAI.
- **Result:** no product defect found; all targeted browser checks passed.

## Coverage and reports

| Journey | Evidence | Result |
|---|---|---:|
| Ask Nudgey, invoice/customer/currency search, PayPal Sandbox draft-state labels, due/upcoming lookups, stale request cancellation, close/sign-out cleanup, 390px panel | `../qa-results.json` and `../screenshots/` | 29/29 |
| Check invoice status: initial/search/no-match/offline/retry, simulated draft labels, browser HTTP 401 session expiry, Back/Close/sign-out, Escape/focus return, 390px geometry | `status-qa-results.json` | 26/26 |
| Schedule follow-up: synthetic save/edit, due/upcoming status, reschedule, complete/cancel, API restart persistence, local-only boundary | `followup-qa-results.json` | 23/23 |
| Pending/uncertain save navigation guards, status-picker open, stay/retry, explicit leave/cancel, mobile navigation, sign-out cleanup | `unresolved-save-qa-results.json` | 117/117 |

The 401 browser check intercepted the existing status search and returned a synthetic HTTP 401. The app removed the selector and invoice results, returned to sign-in, and allowed a fresh login. The stale chat check held the first request at the browser boundary, submitted a replacement, and confirmed that the old request was canceled and did not render.

The unresolved-save report now has **117** passing checks (the table's last row is 117/117): it explicitly opens a saved invoice through the status selector while a committed-but-unconfirmed save is active and confirms the guard appears and keeps the operator on Review. The fixture model used by that broad save journey is deterministic and in-process; it is not an OpenAI client.

`statusLookup.test.ts` also covers the existing status-search cancellation/401 lifecycle and `leaveGuard.test.ts` covers the pending/uncertain action matrix. The browser navigation-guard suite additionally exercised the real pending and uncertain states against the disposable database.

## Screenshot index

- `01-status-selector.jpg`, `02-status-selected.jpg`: simulated PayPal Sandbox draft state and selected invoice.
- `03-followup-schedule.jpg`, `04-followups-due-upcoming.jpg`: local schedule form and Nudgey follow-up list.
- `05-unresolved-save-uncertain.jpg`, `07-unresolved-save-pending.jpg`: desktop guard dialogs.
- `06-unresolved-save-mobile.jpg`: 390px mobile guard.
- `08-status-390px.jpg`: status picker geometry at 390px.
