# NMI-UI-01B browser QA results

- **App under test:** the built React shell (`apps/web/dist`) served by `vite preview` at http://127.0.0.1:4173, with its production CSP.
- **Browser:** Chrome/156.0.8078.48 (headless), driven over the DevTools Protocol by `run-browser-qa.mjs` with real keyboard events.
- **Result:** 107 of 107 checks passed.
- **Screenshots:** 59 JPEG files (6515 KB) in `screenshots/`; side-by-side comparisons against the approved PR #7 evidence in `comparison/` (left = approved design preview, right = React shell); metrics in `comparison-metrics.json`.
- **Not covered:** screen-reader testing (VoiceOver/NVDA), real touch hardware, Safari/Firefox, 400% browser zoom (320px reflow is checked instead). Full WCAG 2.2 AA conformance is **not** claimed.

## Evidence

| Result | Check | Detail |
| --- | --- | --- |
| PASS | captured 59 screenshots from the rendered React app | see screenshots/ |

## Design comparison

| Result | Check | Detail |
| --- | --- | --- |
| PASS | 59 rendered screenshots compared against the approved PR #7 evidence | 54 captures have identical widths. DEVIATION (defect fix): 5 approved mobile captures are 436px wide in a 390px viewport, i.e. the approved preview's mobile line-item table overflowed horizontally; the React shell fits (mobile/dark/5-detail.jpg, mobile/light/5-detail.jpg, states/mobile-light/paypal-disabled.jpg, states/mobile-light/paypal-refused.jpg, states/mobile-light/paypal-unknown.jpg) |
| PASS | mean grey-level difference of the top 1,400px stays small | mean abs diff 6.8/255; 93.6% of pixels within 24 grey levels; largest: states/mobile-light/paypal-unknown.jpg (MAD 21.3), states/mobile-light/paypal-disabled.jpg (MAD 20.8), mobile/dark/5-detail.jpg (MAD 20.5), mobile/light/1-login.jpg (MAD 19.2), states/mobile-light/paypal-refused.jpg (MAD 19.1), mobile/light/5-detail.jpg (MAD 18.4) |
| PASS | page heights stay within 0.7×–1.4× of the approved design (layout parity) | 0 of 59 outside; see comparison/ side-by-sides (left approved, right React) |

## Contrast

| Result | Check | Detail |
| --- | --- | --- |
| PASS | light theme: text contrast across 5 screens and 23 states | no text below WCAG AA (4.5:1, or 3:1 for large text) |
| PASS | dark theme: text contrast across 5 screens and 23 states | no text below WCAG AA (4.5:1, or 3:1 for large text) |

## Responsive

| Result | Check | Detail |
| --- | --- | --- |
| PASS | no horizontal page overflow at 390px | all screens and sampled states fit |
| PASS | no horizontal page overflow at 320px (WCAG 1.4.10 reflow) | all screens and sampled states fit |
| PASS | no horizontal page overflow at 768px | all screens and sampled states fit |
| PASS | no horizontal page overflow at 1280px | all screens and sampled states fit |
| PASS | mobile (390px) interactive targets are at least 44×44 CSS px | all targets ≥ 44px |
| PASS | desktop targets meet WCAG 2.2 AA 2.5.8 minimum (24×24 CSS px) | all targets ≥ 24px |
| PASS | desktop shows top navigation; mobile shows bottom bar and stacks table rows as cards | {"d":{"nav":"flex","mob":"none"},"m":{"nav":"none","mob":"flex","head":"absolute"}} |

## Keyboard journey

| Result | Check | Detail |
| --- | --- | --- |
| PASS | first Tab stop is the 'Skip to main content' link | {"tag":"a","id":"","name":"Skip to main content"} |
| PASS | activating the skip link moves focus to <main> |  |
| PASS | Tab reaches Username |  |
| PASS | Username is followed by an EMPTY Password; no remember-me control exists |  |
| PASS | login discloses simulated authentication |  |
| PASS | empty submit marks fields invalid, shows messages and focuses the first |  |
| PASS | valid username + password continue to the dashboard (simulated) |  |
| PASS | focus lands on the dashboard heading after navigation |  |
| PASS | password is not kept in the DOM after submit |  |
| PASS | Tab reaches 'New invoice' in the page header |  |
| PASS | Enter opens the composer |  |
| PASS | ArrowRight on the tablist selects Manual and swaps panels |  |
| PASS | Home returns to the AI tab |  |
| PASS | Tab reaches the first synthetic example prompt |  |
| PASS | Space loads the example into the textarea and the counter updates | 153 / 2,000 |
| PASS | Tab reaches 'Parse with AI' |  |
| PASS | parsing shows a loading state (aria-busy textarea, progress label) |  |
| PASS | parse opens review with focus on its heading |  |
| PASS | review is filled from the fixture and labelled an AI proposal |  |
| PASS | totals are labelled 'Estimated' and never 'verified' | Subtotal$650.00Tax (8%)+$52.00Estimated total (USD)$702.00 |
| PASS | Tab reaches the first line's unit price |  |
| PASS | editing a price recalculates the estimate live ($810.00) | Subtotal$750.00Tax (8%)+$60.00Estimated total (USD)$810.00 |
| PASS | Tab reaches 'Save local draft' |  |
| PASS | save shows a busy state and disables the inputs |  |
| PASS | after save the detail screen opens with focus on the customer heading |  |
| PASS | detail says the save was simulated and nothing was sent to PayPal |  |
| PASS | detail totals are labelled server-computed (simulated) and recomputed ($810.00) |  |
| PASS | duplicate-save prevention: two rapid activations created exactly one draft |  |
| PASS | Tab reaches 'Create PayPal Sandbox draft…' |  |
| PASS | confirmation dialog opens modally with initial focus on Cancel |  |
| PASS | focus is trapped inside the dialog over 5 Tab presses |  |
| PASS | Shift+Tab also stays inside the dialog |  |
| PASS | Escape closes the dialog and restores focus to the opener |  |
| PASS | Tab moves from Cancel to the confirm button |  |
| PASS | confirming shows an in-progress state |  |
| PASS | result is labelled simulated, with a fabricated id and a 'customer not emailed' notice |  |
| PASS | no send, pay, remind or refund control exists anywhere on the detail screen |  |
| PASS | focus returns to the screen heading after the simulated create |  |

## Privacy

| Result | Check | Detail |
| --- | --- | --- |
| PASS | after the full journey: localStorage, sessionStorage, cookies, IndexedDB, caches and service workers are all empty | {"ls":0,"ss":0,"cookie":"","idb":0,"caches":0,"sw":0} |
| PASS | URL contains only screen, demo state and theme (no invoice content typed during the journey) | http://127.0.0.1:4173/#screen=detail&theme=light |

## Interactions

| Result | Check | Detail |
| --- | --- | --- |
| PASS | over-limit: counter shows 2,100 / 2,000 and the overage | 2,100 / 2,000 · 100 over the limit |
| PASS | over-limit: textarea aria-invalid, visible alert, Parse aria-disabled |  |
| PASS | over-limit: activating Parse does not start parsing |  |
| PASS | exactly 2,000 characters is accepted |  |
| PASS | empty text: Parse shows a required message and focuses the textarea |  |
| PASS | unrecognised text returns the 'could not read' outcome with a manual-entry escape |  |
| PASS | ambiguous request shows two clarification questions |  |
| PASS | blank clarification answers show an alert and flag the first field |  |
| PASS | answered clarification re-parses into review with the rounding warning and PayPal refusal preview | Subtotal€1,517.25Tax (19%)+€288.28Estimated total (EUR)€1,805.53Rounding applied. A figure was rounded half up to the smallest currency unit. The server computes the final amounts; PayPal Sandbox drafting refuses totals that depend on rounding. |
| PASS | EUR rounding example totals match the server calculation (€1,805.53) |  |
| PASS | manual entry opens a blank form with only schema-backed fields (required email present) |  |
| PASS | saving a blank form lists errors, focuses the summary and flags fields | 5 errors |
| PASS | error text is associated with its field (aria-describedby → visible message) |  |
| PASS | an error-summary link moves focus to its field |  |
| PASS | fixing a field clears its error live |  |
| PASS | JPY: unit-price placeholder has no decimals |  |
| PASS | JPY amount with decimals is rejected live with an explanation |  |
| PASS | JPY totals format with no decimals and a yen symbol (¥50,000) | Subtotal¥50,000Estimated total (JPY)¥50,000 |
| PASS | GBP uses £ with two decimals (£79.96) | Subtotal£79.96Estimated total (GBP)£79.96 |
| PASS | Add line item adds a row and moves focus to its description |  |
| PASS | Remove line deletes the row; the last remaining row cannot be removed |  |
| PASS | percent discount above 100 is rejected |  |
| PASS | tax with more than 2 decimals is rejected; fixed tax amount is not offered |  |
| PASS | Discard opens a confirmation dialog; Escape keeps the form |  |
| PASS | duplicate save (replayed): the existing draft is shown with a simulated-replay notice |  |
| PASS | idempotency conflict (409): alert with 'use a new key'; retrying then succeeds |  |
| PASS | dashboard: one card per currency, no mixed total, labelled DEMO / SYNTHETIC with the missing list endpoint named |  |
| PASS | dashboard: AG Studio described as unconfirmed / not enabled; no Delete or Updated-at |  |
| PASS | currency filter narrows the table to JPY |  |
| PASS | no-match search shows a recoverable empty message |  |
| PASS | Clear filters restores all four drafts |  |
| PASS | status filter shows only PayPal-created drafts |  |
| PASS | PayPal disabled (503): create button disabled and described by the explanation |  |
| PASS | mapping refusal (422) explains the rule, says PayPal was not contacted, offers a way forward |  |
| PASS | an ineligible draft warns in advance ('Expected to be refused'), and a real attempt then refuses without creating |  |
| PASS | unknown outcome (502): retry reconciles first; never claims a draft exists |  |
| PASS | reconciliation (409) explains no blind recreate |  |
| PASS | in progress (409) offers only 'Check status' |  |
| PASS | rejected (502) offers Try again; mismatch offers no retry |  |
| PASS | offline: alert banner shown and creating actions are unavailable |  |
| PASS | privacy note: text may be sent to OpenAI; review required; real provider parsing NOT TESTED; no 'secure' claim |  |
| PASS | persistent PayPal Sandbox banner present on all 5 screens |  |
| PASS | login failure (401) shows a generic alert; throttle (429) and expiry states present |  |
| PASS | login 401 demo: submit shows the error again and returns focus to the password |  |
| PASS | prefers-reduced-motion removes the skeleton animation |  |
| PASS | theme toggle switches to dark, updates aria-pressed and the URL hash |  |
| PASS | with no explicit theme the system dark preference is honoured |  |

## Focus visibility

| Result | Check | Detail |
| --- | --- | --- |
| PASS | light dashboard: every sampled Tab stop shows a ≥2px focus outline | 39 stops checked |
| PASS | light review: every sampled Tab stop shows a ≥2px focus outline | 39 stops checked |
| PASS | dark dashboard: every sampled Tab stop shows a ≥2px focus outline | 39 stops checked |
| PASS | dark review: every sampled Tab stop shows a ≥2px focus outline | 39 stops checked |

## Safety

| Result | Check | Detail |
| --- | --- | --- |
| PASS | no request left http://127.0.0.1:4173 (only the app's own 633 same-origin asset/page loads occurred) | 0 foreign requests |
| PASS | no JavaScript exceptions, CSP violations or console errors during the run | 0 errors |
| PASS | served page carries a CSP with connect-src 'none' and no inline-style or inline-script allowance | default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none' |

## Screenshot index

**desktop/light**: [1-login](screenshots/desktop/light/1-login.jpg) · [2-dashboard](screenshots/desktop/light/2-dashboard.jpg) · [3-composer](screenshots/desktop/light/3-composer.jpg) · [4-review](screenshots/desktop/light/4-review.jpg) · [5-detail](screenshots/desktop/light/5-detail.jpg)

**desktop/dark**: [1-login](screenshots/desktop/dark/1-login.jpg) · [2-dashboard](screenshots/desktop/dark/2-dashboard.jpg) · [3-composer](screenshots/desktop/dark/3-composer.jpg) · [4-review](screenshots/desktop/dark/4-review.jpg) · [5-detail](screenshots/desktop/dark/5-detail.jpg)

**mobile/light**: [1-login](screenshots/mobile/light/1-login.jpg) · [2-dashboard](screenshots/mobile/light/2-dashboard.jpg) · [3-composer](screenshots/mobile/light/3-composer.jpg) · [4-review](screenshots/mobile/light/4-review.jpg) · [5-detail](screenshots/mobile/light/5-detail.jpg)

**mobile/dark**: [1-login](screenshots/mobile/dark/1-login.jpg) · [2-dashboard](screenshots/mobile/dark/2-dashboard.jpg) · [3-composer](screenshots/mobile/dark/3-composer.jpg) · [4-review](screenshots/mobile/dark/4-review.jpg) · [5-detail](screenshots/mobile/dark/5-detail.jpg)

**tablet/light**: [1-login](screenshots/tablet/light/1-login.jpg) · [2-dashboard](screenshots/tablet/light/2-dashboard.jpg) · [3-composer](screenshots/tablet/light/3-composer.jpg) · [4-review](screenshots/tablet/light/4-review.jpg) · [5-detail](screenshots/tablet/light/5-detail.jpg)

**states/desktop-light**: [login-error](screenshots/states/desktop-light/login-error.jpg) · [login-throttled](screenshots/states/desktop-light/login-throttled.jpg) · [session-expired](screenshots/states/desktop-light/session-expired.jpg) · [empty](screenshots/states/desktop-light/empty.jpg) · [loading](screenshots/states/desktop-light/loading.jpg) · [list-error](screenshots/states/desktop-light/list-error.jpg) · [offline](screenshots/states/desktop-light/offline.jpg) · [over-limit](screenshots/states/desktop-light/over-limit.jpg) · [ai-clarification](screenshots/states/desktop-light/ai-clarification.jpg) · [ai-invalid](screenshots/states/desktop-light/ai-invalid.jpg) · [ai-unavailable](screenshots/states/desktop-light/ai-unavailable.jpg) · [validation-errors](screenshots/states/desktop-light/validation-errors.jpg) · [rounding](screenshots/states/desktop-light/rounding.jpg) · [save-replay](screenshots/states/desktop-light/save-replay.jpg) · [save-conflict](screenshots/states/desktop-light/save-conflict.jpg) · [paypal-disabled](screenshots/states/desktop-light/paypal-disabled.jpg) · [paypal-refused](screenshots/states/desktop-light/paypal-refused.jpg) · [paypal-creating](screenshots/states/desktop-light/paypal-creating.jpg) · [paypal-reconciling](screenshots/states/desktop-light/paypal-reconciling.jpg) · [paypal-unknown](screenshots/states/desktop-light/paypal-unknown.jpg) · [paypal-rejected](screenshots/states/desktop-light/paypal-rejected.jpg) · [paypal-mismatch](screenshots/states/desktop-light/paypal-mismatch.jpg) · [paypal-created](screenshots/states/desktop-light/paypal-created.jpg)

**states/mobile-light**: [over-limit](screenshots/states/mobile-light/over-limit.jpg) · [validation-errors](screenshots/states/mobile-light/validation-errors.jpg) · [paypal-refused](screenshots/states/mobile-light/paypal-refused.jpg) · [paypal-disabled](screenshots/states/mobile-light/paypal-disabled.jpg) · [offline](screenshots/states/mobile-light/offline.jpg) · [ai-clarification](screenshots/states/mobile-light/ai-clarification.jpg) · [paypal-unknown](screenshots/states/mobile-light/paypal-unknown.jpg)

**states/desktop-dark**: [validation-errors](screenshots/states/desktop-dark/validation-errors.jpg) · [paypal-unknown](screenshots/states/desktop-dark/paypal-unknown.jpg) · [ai-clarification](screenshots/states/desktop-dark/ai-clarification.jpg) · [loading](screenshots/states/desktop-dark/loading.jpg)

