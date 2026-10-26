# NMI-UI-01A browser QA results

- **Preview:** `design/preview/index.html` loaded from `file://` (no server, CSP `default-src 'none'`).
- **Browser:** Chrome/156.0.8078.48 (headless), driven over the DevTools Protocol by `run-browser-qa.mjs` using real keyboard events.
- **Result:** 93 of 93 checks passed.
- **Screenshots:** 59 JPEG files (7525 KB) under `design/evidence/NMI-UI-01A/screenshots/`.
- **Not covered:** a screen-reader pass (VoiceOver/NVDA), real touch hardware, Safari/Firefox, and 400% browser zoom (320px reflow is checked instead). These remain manual QA for the owner.

## Evidence

| Result | Check | Detail |
| --- | --- | --- |
| PASS | captured 59 screenshots | see screenshots/ |

## Contrast

| Result | Check | Detail |
| --- | --- | --- |
| PASS | light theme: text contrast across 5 screens and 23 states | no text below WCAG AA (4.5:1, or 3:1 for large text) |
| PASS | dark theme: text contrast across 5 screens and 23 states | no text below WCAG AA (4.5:1, or 3:1 for large text) |

## Handlers

| Result | Check | Detail |
| --- | --- | --- |
| PASS | light theme: every rendered data-action has a handler | none missing |
| PASS | dark theme: every rendered data-action has a handler | none missing |

## Responsive

| Result | Check | Detail |
| --- | --- | --- |
| PASS | no horizontal page scroll at 390px | all screens and sampled states fit |
| PASS | no horizontal page scroll at 320px (WCAG 1.4.10 reflow) | all screens and sampled states fit |
| PASS | mobile (390px) interactive targets are at least 44×44 CSS px | all targets ≥ 44px |
| PASS | desktop targets meet WCAG 2.2 AA 2.5.8 minimum (24×24 CSS px) | all targets ≥ 24px |
| PASS | desktop shows top navigation and hides the mobile bottom bar |  |
| PASS | mobile hides top navigation, shows bottom bar and stacks table rows as cards | {"nav":"none","mob":"flex","tableHead":"absolute"} |

## Keyboard flow

| Result | Check | Detail |
| --- | --- | --- |
| PASS | first Tab stop is the 'Skip to main content' link | {"tag":"a","id":"","name":"Skip to main content"} |
| PASS | activating skip link moves focus to <main> |  |
| PASS | Tab reaches Username field |  |
| PASS | Username is followed by Password (empty, no 'remember me' control) |  |
| PASS | submitting an empty form shows labelled errors and focuses the first invalid field |  |
| PASS | valid username + password continue to the dashboard |  |
| PASS | focus lands on the dashboard heading after navigation |  |
| PASS | Tab reaches 'New invoice' button in page header |  |
| PASS | Enter opens the composer |  |
| PASS | ArrowRight on tablist switches to the Manual tab and shows its panel |  |
| PASS | Home on tablist returns to the AI tab |  |
| PASS | Tab reaches the first synthetic example prompt |  |
| PASS | Space activates the example prompt and fills the textarea |  |
| PASS | character counter reflects the text (n / 2,000) | 153 / 2,000 |
| PASS | Tab reaches 'Parse with AI' |  |
| PASS | parsing shows a loading state (textarea aria-busy, button announces progress) |  |
| PASS | parse result opens the review screen with focus on its heading |  |
| PASS | review form is filled from the fixture proposal |  |
| PASS | estimated total shown and labelled as an estimate (not 'verified') |  |
| PASS | Tab reaches first line's unit price |  |
| PASS | editing unit price recalculates the estimate live ($810.00) | Subtotal$750.00Tax (8%)+$60.00Estimated total (USD)$810.00 |
| PASS | Tab reaches 'Save local draft' |  |
| PASS | save shows a busy state, disables inputs and announces progress |  |
| PASS | after save the detail screen opens with focus on the customer heading |  |
| PASS | detail shows 'Local draft saved … Nothing has been sent to PayPal' and PayPal 'Not created' |  |
| PASS | detail totals are labelled server-computed and recomputed ($810.00) |  |
| PASS | Tab reaches 'Create PayPal Sandbox draft…' |  |
| PASS | confirmation dialog opens modally with initial focus on Cancel |  |
| PASS | focus is trapped inside the dialog over 4 Tab presses |  |
| PASS | Escape closes the dialog and returns focus to the opener |  |
| PASS | Tab moves from Cancel to the confirm button |  |
| PASS | confirming shows an in-progress state |  |
| PASS | PayPal draft created with a clearly fabricated id and a 'customer not emailed' notice |  |
| PASS | flow ended with no page-level keyboard trap (Shift+Tab moves backwards) |  |

## Interactions

| Result | Check | Detail |
| --- | --- | --- |
| PASS | over-limit text: counter shows 2,100 / 2,000 and the overage | 2,100 / 2,000 · 100 over the limit |
| PASS | over-limit text: textarea is aria-invalid with a visible alert message |  |
| PASS | over-limit text: Parse is aria-disabled |  |
| PASS | over-limit text: activating Parse does not start parsing |  |
| PASS | exactly 2,000 characters is accepted (no error, Parse enabled) |  |
| PASS | empty text: Parse shows a required-field message and focuses the textarea |  |
| PASS | unrecognised text returns the 'could not read' outcome with manual-entry escape |  |
| PASS | ambiguous request shows clarification questions |  |
| PASS | submitting blank clarification answers shows an alert and flags the field |  |
| PASS | answered clarification re-parses into a review with the rounding notice | Subtotal€1,517.25Tax (19%)+€288.28Estimated total (EUR)€1,805.53Rounding applied. A figure was rounded half up to the smallest currency unit. The server compute |
| PASS | manual entry opens a blank review form (customer email field present and required) |  |
| PASS | form exposes only schema-backed fields (no invoice number, issue date or PO reference) |  |
| PASS | saving a blank form lists errors, focuses the summary and marks fields invalid | 5 errors |
| PASS | error text is programmatically associated (aria-describedby → visible message) |  |
| PASS | fixing a field clears its error live |  |
| PASS | JPY currency: unit price placeholder has no decimals |  |
| PASS | JPY amount with decimals is rejected with an explanatory message |  |
| PASS | Add line item adds a row and moves focus to its description |  |
| PASS | Remove line deletes the row; the last row cannot be removed |  |
| PASS | percent discount above 100 is rejected |  |
| PASS | Discard asks for confirmation in a modal dialog |  |
| PASS | cancelling Discard keeps the form |  |
| PASS | duplicate save (replayed) shows the existing draft with an explanatory notice |  |
| PASS | idempotency conflict (409) shows an alert and an option to use a new key |  |
| PASS | dashboard shows one total per currency and never a mixed total |  |
| PASS | dashboard names the missing list endpoint and labels rows as synthetic fixtures |  |
| PASS | dashboard has no Delete or Updated-at columns and no invoice-number column |  |
| PASS | AG Studio is described as not enabled / unverified, not as an active trial |  |
| PASS | currency filter narrows the table to JPY |  |
| PASS | no-match search shows a recoverable empty message |  |
| PASS | Clear filters restores all drafts |  |
| PASS | PayPal disabled (503): create button is disabled and described by the explanation |  |
| PASS | mapping refusal (422) explains the rule and offers a way forward, with no PayPal call implied |  |
| PASS | unknown outcome (502) says retry reconciles first and never claims a draft exists |  |
| PASS | remote mismatch offers no retry control |  |
| PASS | offline state shows an alert banner and disables creating actions |  |
| PASS | privacy note says text may be sent to OpenAI, results need review, real provider parsing NOT TESTED |  |
| PASS | persistent PayPal Sandbox banner present on all 5 screens |  |
| PASS | login: username + password both required, password empty, autocomplete tokens correct, no 'remember me' |  |
| PASS | login failure (401) shows a generic alert message |  |
| PASS | prefers-reduced-motion removes the skeleton animation |  |
| PASS | theme toggle switches to dark and updates aria-pressed |  |

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
| PASS | no http(s) request was made during the entire run (CSP + local file only) | 0 requests |
| PASS | no JavaScript exceptions or console errors during the run | 0 errors |

## Screenshot index

**desktop/light**: [1-login](screenshots/desktop/light/1-login.jpg) · [2-dashboard](screenshots/desktop/light/2-dashboard.jpg) · [3-composer](screenshots/desktop/light/3-composer.jpg) · [4-review](screenshots/desktop/light/4-review.jpg) · [5-detail](screenshots/desktop/light/5-detail.jpg)

**desktop/dark**: [1-login](screenshots/desktop/dark/1-login.jpg) · [2-dashboard](screenshots/desktop/dark/2-dashboard.jpg) · [3-composer](screenshots/desktop/dark/3-composer.jpg) · [4-review](screenshots/desktop/dark/4-review.jpg) · [5-detail](screenshots/desktop/dark/5-detail.jpg)

**mobile/light**: [1-login](screenshots/mobile/light/1-login.jpg) · [2-dashboard](screenshots/mobile/light/2-dashboard.jpg) · [3-composer](screenshots/mobile/light/3-composer.jpg) · [4-review](screenshots/mobile/light/4-review.jpg) · [5-detail](screenshots/mobile/light/5-detail.jpg)

**mobile/dark**: [1-login](screenshots/mobile/dark/1-login.jpg) · [2-dashboard](screenshots/mobile/dark/2-dashboard.jpg) · [3-composer](screenshots/mobile/dark/3-composer.jpg) · [4-review](screenshots/mobile/dark/4-review.jpg) · [5-detail](screenshots/mobile/dark/5-detail.jpg)

**tablet/light**: [1-login](screenshots/tablet/light/1-login.jpg) · [2-dashboard](screenshots/tablet/light/2-dashboard.jpg) · [3-composer](screenshots/tablet/light/3-composer.jpg) · [4-review](screenshots/tablet/light/4-review.jpg) · [5-detail](screenshots/tablet/light/5-detail.jpg)

**states/desktop-light**: [login-error](screenshots/states/desktop-light/login-error.jpg) · [login-throttled](screenshots/states/desktop-light/login-throttled.jpg) · [session-expired](screenshots/states/desktop-light/session-expired.jpg) · [empty](screenshots/states/desktop-light/empty.jpg) · [loading](screenshots/states/desktop-light/loading.jpg) · [list-error](screenshots/states/desktop-light/list-error.jpg) · [offline](screenshots/states/desktop-light/offline.jpg) · [over-limit](screenshots/states/desktop-light/over-limit.jpg) · [ai-clarification](screenshots/states/desktop-light/ai-clarification.jpg) · [ai-invalid](screenshots/states/desktop-light/ai-invalid.jpg) · [ai-unavailable](screenshots/states/desktop-light/ai-unavailable.jpg) · [validation-errors](screenshots/states/desktop-light/validation-errors.jpg) · [rounding](screenshots/states/desktop-light/rounding.jpg) · [save-replay](screenshots/states/desktop-light/save-replay.jpg) · [save-conflict](screenshots/states/desktop-light/save-conflict.jpg) · [paypal-disabled](screenshots/states/desktop-light/paypal-disabled.jpg) · [paypal-refused](screenshots/states/desktop-light/paypal-refused.jpg) · [paypal-creating](screenshots/states/desktop-light/paypal-creating.jpg) · [paypal-reconciling](screenshots/states/desktop-light/paypal-reconciling.jpg) · [paypal-unknown](screenshots/states/desktop-light/paypal-unknown.jpg) · [paypal-rejected](screenshots/states/desktop-light/paypal-rejected.jpg) · [paypal-mismatch](screenshots/states/desktop-light/paypal-mismatch.jpg) · [paypal-created](screenshots/states/desktop-light/paypal-created.jpg)

**states/mobile-light**: [over-limit](screenshots/states/mobile-light/over-limit.jpg) · [validation-errors](screenshots/states/mobile-light/validation-errors.jpg) · [paypal-refused](screenshots/states/mobile-light/paypal-refused.jpg) · [paypal-disabled](screenshots/states/mobile-light/paypal-disabled.jpg) · [offline](screenshots/states/mobile-light/offline.jpg) · [ai-clarification](screenshots/states/mobile-light/ai-clarification.jpg) · [paypal-unknown](screenshots/states/mobile-light/paypal-unknown.jpg)

**states/desktop-dark**: [validation-errors](screenshots/states/desktop-dark/validation-errors.jpg) · [paypal-unknown](screenshots/states/desktop-dark/paypal-unknown.jpg) · [ai-clarification](screenshots/states/desktop-dark/ai-clarification.jpg) · [loading](screenshots/states/desktop-dark/loading.jpg)

