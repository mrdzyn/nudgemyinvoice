# NMI-UI-01B — React UI Shell (Fixture-Only)

- **Status:** Independent audit of `7677569` = FIX REQUIRED ([comment](https://github.com/mrdzyn/nudgemyinvoice/pull/8#issuecomment-6432385788), MAJOR-1). Remediated; READY FOR INDEPENDENT RE-AUDIT (GPT-6). Not merged.
- **Owner/orchestrator:** Product owner
- **Implementation agent:** Claude
- **Review agent:** GPT-6, independently
- **Starting main SHA:** `b9962a2614af0e69fb565cbe4a0e7d6a64506b4d` (PR #7 squash merge)
- **Working branch:** `feat/nmi-ui-01b-react-shell`
- **UI design gate:** Satisfied. The owner approved NMI-UI-01A at exact design HEAD `76549b3f6ffa656943d3650f89cda60f249b0adf`; it was squash-merged as `b9962a2`. Source of truth: `design/screens/NMI-UI-01A-SCREENS.md`, `design/tokens/design-tokens.json`, `design/fixtures/invoice-fixtures.json`, `design/preview/index.html` and the approved evidence in `design/evidence/NMI-UI-01A/`.

## Owner decisions recorded (from the NMI-UI-01A approval)

- **D1:** AG Studio is deferred until licensing is independently confirmed. The dashboard uses a native accessible table.
- **D2:** Unsaved customer data is not persisted in browser storage by default.
- **D3:** A separate bounded, read-only `GET /api/invoice-drafts` will be scheduled during API integration. Until then the dashboard is DEMO / SYNTHETIC.
- **D4:** Editing existing saved drafts is deferred.

## Objective

Build the actual responsive React frontend (`apps/web`) for the five approved screens, faithfully reproducing the approved design and its fixture-driven journey, **without communicating with any backend or provider**.

## Scope

React 19 + TypeScript + the existing Vite setup, no new runtime dependency.

| Screen | Delivered |
| --- | --- |
| A. Operator login | Username and password, generic errors, loading, 429 throttled and session-expired presentations; clearly labelled simulated sign-in |
| B. Dashboard | USD/EUR/GBP/JPY separate currency cards, responsive table/mobile cards, search and currency/status filters, empty/loading/error states, DEMO / SYNTHETIC labelling |
| C. Composer | 2,000-character limit with counter, approved prompt examples, parsing/loading/clarification/invalid/unavailable states, manual-entry fallback, accurate OpenAI privacy notice |
| D. Review | Customer name and required email, currency, due date, dynamic line items, percent tax, percent/amount discount, browser-estimated totals, validation, rounding warning, PayPal eligibility explanation, simulated save / replay / conflict |
| E. Detail | Saved local draft, strict separation from the PayPal Sandbox panel, disabled / creating / created / unknown / reconciling / rejected / mismatch / refused states, accessible confirmation dialog, no send or payment controls |

Structure: `apps/web/src/{domain,demo,components,features,styles}`. `domain/` holds pure money and form logic; `demo/` holds fixtures, scenarios and the in-memory reducer; `features/` holds one folder per screen. Semantic tokens are the approved CSS variables in `styles/tokens.css`.

## Strict phase boundary (UI shell only)

This phase does **not** wire any real API. All results are fixtures plus explicitly simulated, labelled state transitions.

Not implemented (and statically forbidden by `boundaries.test.ts`): real authentication or session calls, OpenAI parsing calls, local database draft writes, PayPal Sandbox draft creation, an invoice-list endpoint, payment/send/reminder actions, server-side edit/delete.

- A fabricated PayPal id (`INV2-DEMO-FAKE-…`) is always labelled a fabricated demo id and never presented as a provider response.
- No unsaved invoice data is kept in `localStorage`, `sessionStorage`, IndexedDB, cookies, URL query parameters or analytics. React in-memory state only. The URL hash carries only the screen, the demo state and the theme.
- Nothing logs invoice contents, passwords or synthetic credentials.
- `PAYPAL_DRAFTS_ENABLED` and all server configuration are untouched.
- The built page carries a CSP: `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; form-action 'none'`. It is applied to the production build only, so dev hot reload is unaffected.

## Test objective and acceptance tests

**Objective:** prove the React shell reproduces the approved design and fixture-driven journey, never talks to a backend or provider, and never persists unsaved data.

Automated, in the repository CI (`pnpm test`, no new dependency):

- [x] `domain/money.test.ts`: the browser estimate equals `calculateTotals` and the PayPal refusal preview equals `assertExactMapping` over 1,500 pseudo-random drafts each (USD, EUR, GBP, CAD, AUD, JPY, rounding cases); exact currency formatting without floating point; JPY zero-decimal behaviour.
- [x] `domain/invoiceForm.test.ts`: the form accepts and rejects the same drafts as the strict `invoiceDraftSchema`; required email, JPY decimals, discount bounds, 50-line limit, 2,000-character limit, submitted keys are schema keys only.
- [x] `demo/fixtures.test.ts`: fixtures pass the strict schema, match server totals and the real mapping rules, use only fabricated PayPal ids (never the genuine Sandbox smoke id) and `.example` emails.
- [x] `demo/appState.test.ts`: every demo state resolves; flow transitions; the hash never contains invoice content; **idempotency replay** (see audit remediation).
- [x] `App.render.test.tsx`: every screen and all 23 demo states render with approved copy, the persistent Sandbox identity, and no send/pay controls.
- [x] `boundaries.test.ts`: source never uses storage, cookies, IndexedDB, `fetch`, XHR, WebSocket, beacons, console, inline styles, raw HTML or external URLs; only `react` and `react-dom` are dependencies; the CSP forbids connections and inline styles.

## Audit remediation (MAJOR-1): idempotency replay

Finding: the simulated replay inserted a second draft and incremented the saved count while claiming the existing draft was returned. Fix: the reducer keeps a simulated Idempotency-Key table (`idempotency`, key to draft id). `save-invoice` now carries `{ key, draft, totals }`: a key that already created a draft **replays** it (same id and stored record, no insert, saved count unchanged, notice "replayed"); only a new key creates a draft (HTTP 201 equivalent). The `save-replay` demo state seeds the USD fixture draft under the form's key. Keys are deterministic per form (`demo-key-NNNNNN`) so the reducer stays pure. Double-submit prevention and the simulated 409 conflict path are unchanged.

- [x] Reducer regression tests (4): replay preserves invoice count, saved count, id and record; a repeated real key replays; a later new key gets the first fresh id; keys are distinct per form. A mutation check (disabling the replay branch) makes 3 of them fail.
- [x] Chrome QA proves the behaviour, not just the notice: existing draft (name, id, $702.00, PayPal id) shown; dashboard row count and every currency card unchanged; a later new save gets `…0001` and adds exactly one row.
- [x] Minor polish: line-description `maxLength` is 200 (backend limit); asserted in render and browser tests.

Real-browser evidence (Chrome over the DevTools Protocol, real key events; `design/evidence/NMI-UI-01B/`):

- [x] Login → Dashboard → Composer → Review → Detail by keyboard only; manual entry; AI clarification; validation; live estimated totals; USD/EUR/GBP/JPY formatting; duplicate-save prevention; PayPal confirmation, disabled, unknown, reconciling, rejected, mismatch and refusal states.
- [x] Dialog focus trap (Tab and Shift+Tab), Escape, focus restoration.
- [x] Contrast across 5 screens and 23 states in light and dark; no overflow at 320, 390, 768 and 1280px; 44px mobile and 24px desktop targets; visible focus; reduced motion.
- [x] Zero requests beyond the app's own origin, zero console/CSP errors, empty storage, cookies, IndexedDB, caches and service workers, URL free of invoice content.
- [x] Rendered screenshots (desktop, tablet, mobile; light and dark; every state) compared to the approved PR #7 evidence, with side-by-sides and metrics.

Repository gates: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle`, `scripts/validate_project_profile.py`, plus hosted Project Baseline CI and Stack CI at the exact PR head.

## Known limitations and open items

- [ ] **Manual QA not covered by automation:** screen readers (VoiceOver/NVDA), real touch devices, Safari and Firefox, 400% zoom. Full WCAG 2.2 AA conformance is **not** claimed.
- [ ] **Independent audit (GPT-6) and owner merge approval:** pending.
- The approved NMI-UI-01A mobile detail screenshots were 436px wide in a 390px viewport (the approved preview's mobile line-item table overflowed). The React shell fixes this; it is the one deliberate deviation from the approved evidence.
- The design-review control bar (screen and state jump, theme toggle) is part of the approved preview and is kept so every state can be reviewed. It is labelled "not part of the product UI" and is expected to be removed or gated when real APIs are wired.
- Real OpenAI parsing and PayPal search/reconciliation error responses remain NOT TESTED against the live providers; those states are designed from the code.

## Deferred API wiring (not authorized in this phase)

Real login/session, parse, save, read, PayPal draft creation, the read-only `GET /api/invoice-drafts` list (D3), and removal of the design-review bar. Each needs separate owner authorization. NMI-UI-01C is not started.
