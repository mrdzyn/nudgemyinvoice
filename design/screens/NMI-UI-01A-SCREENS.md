# NMI-UI-01A: Invoice Interface Design Specification

Status: **remediated for independent re-audit** (owner visual approval still pending). Design-only: no production React, API, schema, dependency or provider change.

Companion artifacts: `design/preview/index.html` (interactive, fixture-only), `design/fixtures/invoice-fixtures.json`, `design/tokens/design-tokens.json`, evidence in `design/evidence/NMI-UI-01A/`.

## 1. Design pillars

1. **Unmistakable PayPal Sandbox identity.** Every screen shows a persistent banner and a "PayPal Sandbox" pill. Nothing here moves real money.
2. **Local vs remote separation.** Saving a local draft (`POST /api/invoice-drafts`) and creating a PayPal Sandbox draft (`POST /api/invoice-drafts/:id/paypal-draft`) are separate, deliberate actions on separate screens.
3. **No phantom delivery.** A PayPal Sandbox draft is never emailed. The app cannot send, remind or collect payment; no control suggests otherwise.
4. **Architectural truthfulness.** The UI exposes only what the implemented API accepts and returns (section 8). Anything else is listed as deferred, never drawn as working.
5. **Estimates are not verified totals.** Browser calculations are labelled "Estimated". Only a server-computed total (the saved record) is labelled "Server-computed".

## 2. Design system

Semantic tokens live in `design/tokens/design-tokens.json` (v1.1.0) and are mirrored as CSS custom properties in the preview.

- **Action colour.** Primary buttons use `#2563EB` with white text in both themes (5.2:1). The earlier dark value `#3B82F6` gave about 3.7:1 and was replaced.
- **Muted text.** `#55657A` (light) and `#A3B2C6` (dark) pass 4.5:1 on card and sunken surfaces.
- **Form-control borders.** `border.input` (`#64748B` light, `#8798AD` dark) meets 3:1 against its surface (WCAG 1.4.11).
- **Focus ring.** 2px solid, 2px offset; `#1D4ED8` light, `#93C5FD` dark.
- **Typography.** Inter with system fallbacks; tabular monospace numerals for every amount.
- **Status never relies on colour alone.** Badges carry a glyph (check, circle, question mark, cross) and text.

### Breakpoints (implemented with real media queries, not a simulated frame)

| Range | Behaviour |
| --- | --- |
| `>= 1024px` | Top navigation, two-column review (form + sticky totals), full tables. |
| `768-1023px` | Single-column review, totals below line items, full tables. |
| `< 768px` | Bottom navigation (Drafts, New invoice, Sign out), tables become stacked cards, 44px minimum targets, stacked action buttons. |

## 3. Accessibility contract (WCAG 2.2 AA)

Verified by `design/evidence/NMI-UI-01A/run-browser-qa.mjs` (see `QA-RESULTS.md`); screen-reader testing is **not** covered and stays manual.

1. **Contrast.** All visible text >= 4.5:1 (3:1 large text) in both themes across five screens and 23 states.
2. **Keyboard.** The whole flow (login, dashboard, composer, review, save, PayPal confirmation) is completable with Tab, Shift+Tab, Enter, Space, Escape and arrow keys. A skip link is the first Tab stop. Focus moves to the screen heading after navigation.
3. **Focus visibility.** Every sampled Tab stop shows a 2px outline in both themes (including the native date field).
4. **Dialogs.** Native `<dialog>` opened modally: initial focus on Cancel, focus wrapped inside, Escape closes, focus returns to the opener.
5. **Forms.** Every input has a programmatic label. Errors use `aria-invalid` and `aria-describedby`, appear in an error summary with links to the fields, and focus moves to the summary on a failed save.
6. **Live regions.** Status messages (parsing, saving, PayPal creation, filter result counts) use a polite live region; blocking errors use `role="alert"`.
7. **Tabs.** Composer mode switch is a real tablist with roving tabindex and arrow/Home/End keys.
8. **Reflow and targets.** No horizontal page scroll at 320px or 390px. Targets are >= 44px on mobile and >= 24px on desktop.
9. **Reduced motion.** Skeleton shimmer, pulse and spinner animations are removed under `prefers-reduced-motion`.

## 4. Screen map

```
Login --> Dashboard --> Composer (AI | Manual) --> Review --> Detail (local draft + PayPal Sandbox panel)
              ^                                                 |
              +-------------------------------------------------+
```

The Settings area from the first draft is removed: it has no backing capability and was shown only as "Future".

## 5. Screen specifications

### Screen 1: Operator login

Endpoint: `POST /api/auth/login` with a strict body of `username` (1-64 characters) and `password` (1-256 characters).

- Required, labelled **Username** (`autocomplete="username"`) and **Password** (`autocomplete="current-password"`). The password field is always empty.
- **No "remember me" or "maintain session" control.** Session lifetime is server-defined and not user-selectable.
- Client validation: an empty field shows an inline message, marks the field invalid and focuses the first one.
- Server failures (shown with the HTTP status in the preview only):
  - `401 invalid_credentials`: one generic message regardless of which value was wrong.
  - `429 too_many_attempts`: asks the operator to wait; the real response carries `Retry-After`.
  - Expired session: "Your session has expired. Sign in again." Unsaved edits are **not** kept by the server (see open decision D2).
- The preview accepts any non-empty pair and sends nothing anywhere.

### Screen 2: Invoice dashboard (future list view)

> The backend implements `GET /api/invoice-drafts/:id` but **not** a list endpoint (`GET /api/invoice-drafts` is not implemented). This screen is a design for that future capability and renders fabricated fixtures, labelled as such in a persistent notice.

- **Currency cards:** one per currency present (USD, EUR, GBP, JPY in the fixtures). Each shows the draft count, the sum of local draft totals in that currency and how many PayPal Sandbox drafts were created. A line states that currencies are never added together or converted. There is no grand total.
- **Table columns:** Draft (short id and created date), Customer (name and email), Due, Total (with currency code), PayPal Sandbox status, View. There is no invoice-number column, no Delete action and no "Updated at" because none of these exist in the API.
- **PayPal Sandbox status badges** map to `GET /api/invoice-drafts/:id` `paypal.state`: `none`, `pending`/`creating`, `created`, `unknown`, `rejected`, `mismatch`.
- **Filters** (fixture-only, client side): currency pills, free-text search over name, email and id, PayPal status.
- **AG Studio boundary:** a native, accessible HTML table is the design. AG Studio is **not** enabled. Its license terms, trial period and keys are unconfirmed and need owner confirmation before any use; the container leaves a seam for it.
- **States:** loading skeleton, empty ("No invoice drafts yet" with a call to action), list-request failure (alert and Retry), no filter match (Clear filters), offline banner.

### Screen 3: Composer

Endpoint: `POST /api/invoice-drafts/parse`, body `{ text }`, trimmed length 1-2,000.

- **Limit: 2,000 characters** (`MAX_PARSE_CHARS`). A live counter shows `n / 2,000`. Over the limit the counter turns red and shows the overage, the textarea is marked invalid with an alert message, and Parse is disabled (`aria-disabled`). Exactly 2,000 is accepted. Empty text shows a required message on Parse.
- **Mode tabs:** "Describe it (AI)" and "Enter manually". Manual entry opens a blank review form; nothing is sent to an AI service.
- **Privacy disclosure (exact intent):** when AI parsing is configured on the server, the entered text, including customer names and email addresses, may be sent to OpenAI. Do not paste card numbers or secrets. The result is a proposal that must be reviewed. A design note states that real provider parsing is **NOT TESTED**. The earlier "securely parsed, no customer details are sent" wording is removed.
- **Parse outcomes** (`ParseOutcome`):
  - `draft`: opens Review with an "AI proposal, check every field" notice.
  - `needs_clarification`: shows the server's questions. The operator answers each; answers are appended to the text and the same endpoint is called again. There is no separate clarification endpoint.
  - `invalid`: lists the validation messages with a manual-entry escape.
  - `unavailable` (`fallback: manual_entry`, for example `ai_not_configured`): warns that nothing was sent and offers manual entry.
- **Loading:** textarea `aria-busy`, button shows a spinner and "Analyzing invoice text…".
- **Preview scope:** only the four synthetic example prompts are recognised; any other text returns the `invalid` outcome so that state is reviewable.

### Screen 4: Review and edit (local draft)

Endpoint: `POST /api/invoice-drafts` with an `Idempotency-Key` (`^[A-Za-z0-9_-]{8,128}$`). The body is the **strict** `invoiceDraftSchema`; unknown keys are rejected.

Fields (and only these):

| Field | Rule |
| --- | --- |
| Customer name | required, up to 200 characters |
| Customer email | **required**, valid, up to 254 characters |
| Currency | USD, EUR, GBP, CAD, AUD or JPY; one per invoice; changing it never converts amounts |
| Due date | required valid `YYYY-MM-DD` date |
| Line items | 1 to 50; description (required, up to 200), quantity (> 0, up to 2 decimals), unit price (currency scale; JPY has none) |
| Tax | optional **percent** (0-100, up to 2 decimals); a fixed tax amount is not supported |
| Discount | optional, percent or fixed amount; must not exceed the subtotal |

**Not in the save contract, therefore not in the design:** invoice number, issue date, PO or reference, fixed tax amount. They are listed under deferred items below.

- **Totals panel** is titled "Estimated totals" and explains that the server recomputes. It never says "verified". Rounding (half up) is shown plainly with a notice when it applies.
- **PayPal eligibility hint:** the server refuses PayPal drafts whose totals depend on rounding, or that combine tax and a discount across more than one line, or whose due date has passed (`mapping_refused`, `due_date_past`). The review screen previews this so the outcome is not a surprise; it states that the server decides. Local saving is still allowed. The design does **not** promise silent rounding correction.
- **Validation:** failed save shows an error summary (focused), per-field messages and `aria-invalid`; errors clear live as fields are fixed.
- **Save states:** idle; saving (button spinner, all inputs disabled, double submit ignored); duplicate save replay (`200`, `replayed: true`, the existing draft is shown with an explanation); idempotency conflict (`409 idempotency_conflict`, alert with "use a new key and keep my edits"); offline (banner, save unavailable).
- **Actions:** Save local draft, Back to composer (keeps the text), Discard (confirmation dialog).

### Screen 5: Local draft detail and PayPal Sandbox panel

Reads `GET /api/invoice-drafts/:id`, which returns `id`, `draft`, `totals`, `paypalInvoiceId`, `createdAt` and `paypal { state, paypalInvoiceId, lastErrorCode }`. Only these are displayed. There is no "Updated at", dispatch timestamp or audit timeline because the route supplies none.

- **Totals** are labelled "Server-computed". In the preview a newly saved draft says its server response is simulated.
- **PayPal Sandbox panel** (separate bordered region, always carrying the Sandbox pill):

| Situation | HTTP / state | Presentation |
| --- | --- | --- |
| Not created | `paypal.state = none` | Explains a DRAFT is created, the customer is **not** emailed, no payment requested. Button "Create PayPal Sandbox draft…" opens a confirmation dialog. |
| Drafting off | `503 paypal_disabled` | Button disabled and described by an explanation that server configuration has drafting switched off. Local drafts still work. |
| Refused | `422 mapping_refused` / `due_date_past` | Explains the specific rule, says nothing was sent to PayPal, and that drafts cannot be edited in this version so a new invoice is needed. |
| In progress | `409 in_progress` | "Check status" only; do not create again. |
| Reconciling | `409 reconciliation_pending` | Explains the server checks PayPal first and never blindly recreates. |
| Outcome unknown | `502 paypal_outcome_unknown` | Never claims a draft exists. Retry is safe because the server reconciles first. |
| Rejected | `502 paypal_rejected` | No draft created; "Try again". |
| Mismatch | `502 paypal_mismatch` | No retry; needs manual review in the Sandbox dashboard. |
| Created | `201` or `200` replay | Shows the PayPal invoice id and "DRAFT" at creation, and states the customer has **not** been emailed and this version cannot send, remind or collect payment. |

- There is no "Verify remote status" action and no "Open in PayPal" deep link: neither is supported by the API, and the preview ids are fabricated.

## 6. Interaction state matrix

| Domain | State | Where reviewed |
| --- | --- | --- |
| Auth | login failed (401), throttled (429), session expired | State selector |
| Dashboard | empty, loading, list failure, no filter match, offline | State selector, filters |
| Composer | over limit, empty, needs clarification, could not read, AI unavailable, parsing | State selector, live flow |
| Review | field validation errors, rounding notice, PayPal-refusal preview, saving, duplicate replay, key conflict, offline | State selector, live flow |
| PayPal | disabled, refused, in progress, reconciling, unknown, rejected, mismatch, created | State selector, live flow |

## 7. Backend capability seams

| Capability | Status | Design handling |
| --- | --- | --- |
| `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout` | Implemented | Login and Sign out |
| `POST /api/invoice-drafts/parse` | Implemented | Composer |
| `POST /api/invoice-drafts` (Idempotency-Key) | Implemented | Review save |
| `GET /api/invoice-drafts/:id` | Implemented | Detail |
| `POST /api/invoice-drafts/:id/paypal-draft` | Implemented, off by default | Detail panel |
| `GET /api/invoice-drafts` (list) | **Not implemented** | Dashboard uses labelled fixtures |
| Edit or delete a draft | **Not implemented** | No control drawn |
| Send invoice, reminders, webhooks, payment status | **Not implemented** | Not represented |

### Deferred / future-only items (not in this design)

Invoice number, issue date and PO/reference fields; fixed-amount tax; delete and edit; updated-at and audit timeline; remote status verification and "open in PayPal"; Settings; AG Studio grid.

## 8. Open design decisions for the owner

- **D1. AG Studio:** confirm license terms, trial dates and keys; until then the native table is the design.
- **D2. Session expiry:** the server keeps no unsaved edits. Should the web app keep an unsaved form in `sessionStorage` across re-authentication? This design does not assume it.
- **D3. List endpoint:** the dashboard needs `GET /api/invoice-drafts` (a backend task, not part of this design increment).
- **D4. Editing:** drafts are immutable today. A refused PayPal draft therefore requires creating a new invoice; an edit route would improve this.
- **D5. Real-provider behaviour:** OpenAI parsing and PayPal search/reconciliation error responses are NOT TESTED against the live providers, so those states are designed from the code, not from observed provider output.

## 9. Evidence

`design/evidence/NMI-UI-01A/QA-RESULTS.md` lists every browser check and links the screenshots (desktop, tablet, mobile; light and dark; plus every state). `design/fixtures/verify-fixtures.mjs` verifies the fixtures against the real calculator and PayPal mapping rules.
