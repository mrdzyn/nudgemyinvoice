# NMI-P6 AI Nudge Queue — browser QA results

**Result:** 150/150 checks passed (`qa-results.json`), with 35 screenshots in `screenshots/`. All data is synthetic, using `example.test` customers.
**Model:** a deterministic **fake** (`test-api-server.ts`, opt-in `NMI_P6_SIMULATED=1`, refuses production). It is not OpenAI, and live OpenAI remains Gate A, NOT AUTHORIZED.

**Run it:**

```bash
pnpm build && node design/evidence/NMI-P6/run-nudge-journey.mjs
```

**Shape:** headless Chrome talks to the real Fastify app (real auth, CSRF/Origin, rate limit, nudge routes, output guard and audit), which serves `apps/web/dist` from one origin. The app connects to a disposable PostgreSQL 16 as the least-privilege `nmi_runtime` role.

| Group | Checks | What it proves |
|---|---|---|
| launcher | 1 | The test-only launcher refuses to run without opt-in, and refuses to run in production. |
| dashboard | 3 | The card sits directly under the heading and above the unchanged P5 filters (D1). It shows real zero counts and the empty hint, and the nav has a "Nudge queue" tab. |
| draft-card | 5 | One click makes exactly one POST and one model call. The stored message carries the verified amount, date and customer. The model input is only tone, currency, a date-only status and the repeat flag. Open in queue works. |
| nudgey | 4 | "send it" is refused. A draft request finds the matching invoice and asks for confirmation; nothing is drafted until the click, then exactly one draft is made. |
| review | 9 | Counts and the nav badge match the server. Pending drafts have no Copy and there is no Send button. Wording is date-only. Edits must be saved before approval, and approval applies to the saved version (v2 → v3). The AI original is unchanged. Approved text is locked, and Copy puts exactly the approved text on the clipboard. |
| history | 5 | Reject and Regenerate each ask for confirmation first. The rejected draft and the superseded one appear in History, with "nothing was sent". |
| a11y | 1 | Keyboard: in the ARIA tablist, the arrow keys move between tabs and select them. |
| conflict | 3 | An edit from another session makes approving the stale version fail with a clear message. Reload shows the latest text. |
| refusal | 2 | A model draft containing "still unpaid" gets a 422 and nothing is stored. The audit reason is `payment_status_claim`, with no content. |
| pending-exists | 1 | The saved-invoice card shows an existing pending draft up front, with Replace and Review existing. |
| states | 3 | Loading skeleton, then a read error with Retry, then recovery. |
| rate-limit | 1 | A real 429 (the budget seam set to 1) shows the wait time. No model call is made and nothing is stored. |
| ai-off | 3 | With no model configured, the card and the queue explain it and Regenerate is disabled; approval still works. |
| mobile-light, mobile-dark, desktop-light, desktop-dark | 102 | On every P6 surface: no horizontal overflow. On mobile, every target is at least 44px (refinement 3). The tone select shows "Professional" in full (refinement 2). Computed contrast meets WCAG AA. Every control has an accessible name. |
| boundaries | 6 | No request to any foreign host. Only the P6 queue routes are used. The audit log carries no message text or names. All 8 model inputs are free of customer data. The schema has no sent, dispatch or schedule column. There were no console errors. |

**Not covered:** live OpenAI output quality, which needs Gate A. There is no axe-core in the repository, so contrast is computed in the page, alongside structural ARIA checks. Screen-reader output was not recorded.
