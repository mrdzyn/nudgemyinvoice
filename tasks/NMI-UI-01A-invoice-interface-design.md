# NMI-UI-01A — Invoice Interface Design (Design-Only Increment)

- **Status:** Remediation of independent audit [FIX REQUIRED](https://github.com/mrdzyn/nudgemyinvoice/pull/7#issuecomment-6422310129) complete; READY FOR INDEPENDENT RE-AUDIT. Owner visual approval is still pending and is not predeclared.
- **Owner/orchestrator:** Product Owner / Antigravity
- **Implementation agent:** Antigravity (Design / UX Agent)
- **Target branch:** `main`
- **Working branch:** `design/nmi-ui-01a-invoice-interface`
- **Starting main SHA:** `2864761ca902ffd6ed6628c183298bcc6e5c59c1`

## Objective

Produce a polished, responsive, and accessible design for NudgeMyInvoice's authenticated invoice workflow, ready for owner visual approval. Establish the visual identity, screen map, component specifications, synthetic fixtures (USD, EUR, JPY), interaction states, and an interactive browser preview without prematurely implementing UI shell production code or inventing unapproved backend capabilities.

## Context

Following the completion and merge of backend invoice draft persistence, PayPal Sandbox draft creation, and CORS preflight remediation (`2864761`), the product is ready for its user interface design phase. Per `AGENTS.md` and `docs/DESIGN-SYSTEM.md`, material UI increments must follow a design-first delivery sequence:
`Requirements -> Screen map + user flows -> Screen designs + required states -> Human design approval -> UI shell implementation`.

This is a **design-only increment**. No production code in `apps/web` or `apps/api` is modified until the owner formally approves the visual and interaction direction.

## Delivery mode / UI design gate

- **Material user-facing UI:** Yes
- **UI design gate:** Required. Screen map, specifications, and interactive browser preview are prepared for human design approval.
- **Requirements/product contract:** `docs/PRODUCT.md`, `design/nmi-p1/SCREENS.md`, `tasks/NMI-UI-01A-invoice-interface-design.md`
- **Screen map / user flows:** `design/screens/NMI-UI-01A-SCREENS.md`
- **Screen designs / mockups:** `design/preview/index.html` (interactive browser preview), `design/tokens/design-tokens.json`, `design/fixtures/invoice-fixtures.json`
- **Human design approval:** Pending owner review of PR
- **UI shell scope:** Deferred to follow-up task `NMI-UI-01B` after approval
- **Wiring scope:** Not applicable in this design increment
- **Test scope:** Documentation validation, design profile validation, and formatting checks

## Screen scope

1. **Operator Login & Application Shell:**
   - Single-operator credentials form (required username and password; no remember-me control), generic 401, throttled 429 and session-expired states.
   - Global application shell with persistent, high-visibility **PayPal SANDBOX** banner and badge.
   - Primary navigation: Dashboard, New Invoice, Settings, Session Logout.
2. **Invoice Dashboard:**
   - Multi-currency summary cards grouped strictly **by currency** (USD, EUR, JPY) — zero mixed-currency totals and no currency conversion.
   - Local drafts table / card list showing synthetic fixtures, status badges, and action triggers.
   - Explicit documentation of missing backend list endpoint (`GET /api/invoice-drafts`).
3. **Natural-Language Invoice Composer:**
   - Natural language input area (max 2,000 characters) with guided prompt examples.
   - Primary action: "Parse with AI"; secondary alternative: "Enter Manually".
   - States: Idle, parsing progress, clarification required (inline questions), parsing errors, and model unavailable fallback.
4. **Structured Invoice Review & Edit:**
   - Customer details (name and required email), currency selector (USD, EUR, GBP, CAD, AUD, JPY), due date picker.
   - Dynamic line items (description, quantity, unit price, line total).
   - Optional tax percentage and discount (percent or fixed amount).
   - Read-only calculated totals (subtotal, discount, tax, total) computed in integer minor units.
   - Actions: "Save Local Draft" (with `Idempotency-Key` duplicate prevention).
5. **Local Invoice Detail & PayPal Sandbox Status:**
   - Invoice view limited to what `GET /api/invoice-drafts/:id` returns (id, draft, server totals, created date, PayPal state); no audit timeline or updated-at.
   - Clear visual fencing between **Local Draft** (persisted in PostgreSQL) and **PayPal Sandbox Draft** (remote external draft).
   - Prominent notice: "Creating a PayPal Sandbox draft does NOT send or email the customer."
   - Action: "Create PayPal Sandbox Draft" with state badges (`none`, `creating`, `created`, `reconciliation_pending`, `paypal_outcome_unknown`, `paypal_disabled`).

## Critical implementation truth & backend constraints

- **Supported API Endpoints:**
  - `POST /api/auth/login`
  - `GET /api/auth/session`
  - `POST /api/auth/logout`
  - `POST /api/invoice-drafts/parse`
  - `POST /api/invoice-drafts`
  - `GET /api/invoice-drafts/:id`
  - `POST /api/invoice-drafts/:id/paypal-draft`
- **Missing Endpoints Documented:**
  - No general invoice list endpoint exists (`GET /api/invoice-drafts` is not implemented). The dashboard uses clearly labeled synthetic fixtures.
  - No PayPal sending, customer email notification, payment webhooks, or reminder dispatch endpoints exist.
  - Future capabilities are not represented as implemented.

## Required interaction states

- **Authentication:** Unauthenticated, Authenticated, Session Expired (graceful re-auth modal/prompt).
- **Page States:** Initial/Default, Loading (skeletons), Empty ("No invoices yet"), Success, Error, and Offline banner.
- **AI States:** Available, Parsing in progress, Clarification Required (interactive questions), Invalid Proposal, AI Unavailable (fallback to manual entry automatically).
- **Form States:** Field validation errors, invalid dates, rounding-sensitive integer minor unit totals, subtotal exceeds discount errors.
- **Save States:** Idle, Save in progress (button spinner, inputs disabled), Duplicate save prevented (`Idempotency-Key` replay).
- **PayPal Sandbox States:** Disabled/Config missing (HTTP 503), In-progress lease (HTTP 409), Reconciling (HTTP 409), Remote rejected (HTTP 502), Outcome unknown (HTTP 502), Created (HTTP 201/200).
- **Accessibility & Responsive:** Desktop (1280px+), Tablet (768px-1024px), Mobile (<768px), keyboard navigation, focus indicators, WCAG 2.2 AA contrast, reduced-motion compliance, Light and Dark themes.

## AG Studio boundary

- The dashboard is designed as an accessible native table. AG Studio is **not** enabled and its license terms, trial period and keys are **unverified**; they require owner confirmation and approval before any use. The native table remains the fallback.

## Acceptance criteria

- [x] Design specification written under `design/screens/NMI-UI-01A-SCREENS.md`.
- [x] Semantic design tokens updated in `design/tokens/design-tokens.json` supporting light and dark themes and PayPal Sandbox identity.
- [x] Synthetic fixtures for USD, EUR, GBP and JPY in `design/fixtures/invoice-fixtures.json`, checked against the real `calculateTotals` and PayPal mapping rules by `design/fixtures/verify-fixtures.mjs`; the genuine Sandbox smoke invoice id is not used.
- [x] Interactive browser preview rewritten at `design/preview/index.html`: no inline handlers, fixture-only, every state reachable. Evidence: `design/evidence/NMI-UI-01A/QA-RESULTS.md` (all handlers resolved; keyboard-only end-to-end flow executed in Chrome).
- [x] Missing backend API capabilities (`GET /api/invoice-drafts`) and unbuilt features (sending, webhooks, reminders) explicitly documented.
- [x] Local draft save visually separated from external PayPal draft creation with clear non-notification disclosures.
- [x] All interaction states, responsive layouts and WCAG 2.2 AA requirements specified and exercised in a real browser (contrast, reflow at 390px and 320px, target sizes, focus visibility, reduced motion; 93 checks, see QA-RESULTS.md).
- [x] Screenshots captured from the actual preview: desktop and mobile in light and dark for all 5 screens, tablet light, and every state (`design/evidence/NMI-UI-01A/screenshots/`).
- [x] UI matches the strict `invoiceDraftSchema`: required customer email; no invoice number, issue date or PO field; percent tax only; 2,000-character AI input limit enforced with counter and error state.
- [x] AI privacy disclosure says text may be sent to OpenAI when configured; real provider parsing stated as NOT TESTED.
- [ ] **Owner visual approval of the design: pending** (not predeclared; independent re-audit comes first).
- [ ] **Manual QA not covered by automation:** screen reader (VoiceOver/NVDA), real touch devices, Safari and Firefox, 400% browser zoom. Pending.
- [x] Repository checks (`pnpm validate`, `scripts/validate_project_profile.py`, `pnpm format:check`) pass cleanly.
