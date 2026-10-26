# NMI-UI-01A: Invoice Interface Design Specification

## 1. Executive Summary & Design Rationale

This document defines the production-oriented user interface design, screen architecture, interaction states, and accessibility contracts for **NudgeMyInvoice**. 

NudgeMyInvoice is an automated, AI-assisted invoice management application tailored for freelancers, contractors, and boutique agencies. It simplifies the transition from informal natural-language work logs (e.g., "Billed Acme Corp 30 hrs design at $150/hr") into rigorously validated, multi-currency invoice drafts.

### Primary Design Pillars
1. **Unmistakable PayPal SANDBOX Identity**: The application operates in PayPal Sandbox mode. Every screen and external interaction persistently and visibly communicates that invoices are strictly in sandbox mode and will **never** charge real credit cards or dispatch automated customer notifications.
2. **Clear Local vs. Remote Separation**: Local draft storage (`/api/invoice-drafts`) is strictly separated from external provider dispatch (`/api/invoice-drafts/:id/paypal-draft`). Creating a PayPal draft is an explicit, deliberate operator action.
3. **No Phantom Delivery**: The UI makes it unambiguously clear that a PayPal Sandbox draft remains an unsent draft in PayPal's sandbox dashboard. No email or payment request is sent to the customer upon draft creation.
4. **Professional SaaS Elegance**: Built with clean typography (Inter / Roboto Mono), high-contrast accessible palettes, refined elevation tokens, responsive layouts (Mobile, Tablet, Desktop), and comprehensive dark/light theme support.
5. **Architectural Truthfulness**: Clear labeling distinguishes currently supported backend capabilities from synthetic dashboard fixtures pending future collection endpoints.

---

## 2. Design System & Semantic Token Reference

The interface builds directly upon `design/tokens/design-tokens.json` and `docs/DESIGN-SYSTEM.md`.

### 2.1 Color Tokens
- **Brand Primary**: Deep Indigo (`#2563EB` light / `#3B82F6` dark), communicating reliability and financial precision.
- **Surface & Backgrounds**:
  - *Light Mode*: Pure white (`#FFFFFF`) surfaces, cool gray canvas (`#F8FAFC`), subtle slate borders (`#E2E8F0`).
  - *Dark Mode*: Slate dark canvas (`#0B0F19`), elevated card surfaces (`#1E293B`), refined borders (`#334155`).
- **PayPal Sandbox Semantic Identity**:
  - *Sandbox Badge / Pill*: Warm Amber/Warning fill (`#FEF3C7` / `#78350F` light; `#451A03` / `#FCD34D` dark) with a high-contrast amber border (`#F59E0B`).
  - *Sandbox Banner*: Visible full-width banner at the top of the authenticated shell with an active testing flask icon.
- **Status & Intent Colors**:
  - *Draft / Neutral*: Slate gray (`#64748B`).
  - *Pending / In-Progress*: Amber / Warning (`#F59E0B`).
  - *Success / Created*: Emerald green (`#10B981`).
  - *Error / Danger*: Crimson red (`#EF4444`).
  - *AI Assistant*: Violet accent (`#8B5CF6`).

### 2.2 Typography
- **Primary Interface Font**: `Inter`, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif.
- **Monospace & Numerical Data**: `Roboto Mono`, "JetBrains Mono", Menlo, Consolas, monospace.
- **Numerical Alignment**: Numeric amounts and currency figures enforce `font-variant-numeric: tabular-nums` for strict tabular scanability.

### 2.3 Layout Breakpoints
- **Mobile (`< 768px`)**: Single column, fluid padding (16px), bottom-anchored sticky tab navigation, full-width touch targets (min 44x44px).
- **Tablet (`768px - 1024px`)**: Adaptive 2-column grids, collapsible secondary panels, top-bar navigation with mobile-style compact drawer.
- **Desktop (`>= 1024px`, optimal `1280px - 1440px`)**: Centered max-width application container (`1280px`), top navigation bar with quick status indicators, multi-column summary cards, and split-pane or full-width data tables.

---

## 3. Accessibility Contract (WCAG 2.2 AA)

In compliance with `docs/ACCESSIBILITY.md`:

1. **Color Contrast**:
   - All standard text achieves >= 4.5:1 contrast against its background.
   - Large text (>= 18pt or >= 14pt bold) and active UI components/borders achieve >= 3:1 contrast.
   - Text over semantic badge backgrounds (such as the Amber Sandbox badge) strictly adheres to >= 4.5:1 (e.g. Amber-900 `#78350F` over Amber-100 `#FEF3C7` = 7.2:1 contrast ratio).
2. **Keyboard Operability & Visible Focus**:
   - Every interactive control (buttons, links, inputs, tabs) is fully focusable via standard `Tab` key navigation.
   - Focus indicators use an unmistakable 2px solid primary outline with a 2px offset (`outline: 2px solid var(--color-brand-primary); outline-offset: 2px`).
   - Modal dialogs trap focus and release focus cleanly on close/escape.
   - A hidden "Skip to main content" link appears as the very first focusable element.
3. **Screen Reader Semantics & ARIA**:
   - Semantic HTML landmarks: `<header role="banner">`, `<nav aria-label="...">`, `<main id="main-content">`, `<section aria-labelledby="...">`, and `<footer>`.
   - Dynamic asynchronous updates (AI parsing, save in progress, PayPal draft dispatch) utilize `aria-live="polite"` with `role="status"`.
   - Error messages are linked to their respective form inputs using `aria-describedby="field-error-id"`, with inputs marked `aria-invalid="true"`.
4. **Reduced Motion**:
   - All CSS animations and state transitions respect `@media (prefers-reduced-motion: reduce)` by falling back to instantaneous state switches.

---

## 4. Screen Architecture & Screen Map

```
+-----------------------------------------------------------------------------------+
|                              Global Application Shell                             |
|  [Logo: NudgeMyInvoice]    [SANDBOX MODE Pill]      [Theme Toggle]  [Operator: Sign Out]  |
|  [Persistent Banner: ⚠️ PayPal Sandbox Mode Active - No real money or emails sent]  |
+-----------------------------------------------------------------------------------+
                                          |
          +-------------------------------+-------------------------------+
          |                               |                               |
          v                               v                               v
+-------------------+           +-------------------+           +-------------------+
| 1. Operator Login |           |   2. Dashboard    |           |    Settings /     |
| (Unauthenticated) |           |  (Multi-Currency) |           |     Account       |
+-------------------+           +-------------------+           | (Future Scope)    |
                                          |                     +-------------------+
                                          v
                                +-------------------+
                                | 3. Invoice        |
                                |    Composer       |
                                | (AI / Manual)     |
                                +-------------------+
                                          |
                                          v
                                +-------------------+
                                | 4. Structured     |
                                |    Review & Edit  |
                                | (Totals & Save)   |
                                +-------------------+
                                          |
                                          v
                                +-------------------+
                                | 5. Invoice Detail |
                                |    & PayPal Draft |
                                | (Sandbox Status)  |
                                +-------------------+
```

---

## 5. Screen Specifications

### Screen 1: Operator Login & Authenticated Application Shell

#### Purpose & Context
Provides secure entry for the system operator via `POST /api/auth/login`. When unauthenticated, only the login form is accessible. When authenticated, the operator enters the persistent application shell.

#### Key Shell Elements
- **Global Header**:
  - Brand identity: "NudgeMyInvoice" with invoice monogram.
  - Environment Badge: High-visibility badge reading `PAYPAL SANDBOX`. Clicking opens a popover detailing: "Connected to sandbox.paypal.com. Client ID: verified. Production payments disabled."
  - Dark / Light Theme Toggle (`aria-label="Toggle theme"`).
  - Operator Session Menu: Displays active session status and a "Sign Out" button (`POST /api/auth/logout`).
- **Persistent Sandbox Notification Banner**:
  - Full-width warning strip beneath the header: `🧪 PayPal Sandbox Active: Invoices created in this environment are for testing only. They will NOT charge real funds or email recipients.`
- **Navigation (Desktop vs. Mobile)**:
  - *Desktop*: Top navigation tabs: `Dashboard` (active), `+ New Invoice`, `Settings` (disabled badge: `Future`).
  - *Mobile*: Fixed bottom bar with 3 tabs: `Dashboard`, `+ New`, `Settings`.

#### Login Form Layout
- Centered card container (max-width `400px`).
- Input field: `Operator Password` (`type="password"`, `autocomplete="current-password"`, `required`).
- "Sign In" button with loading spinner on submission.
- Error banner: Displays inline authentication error if invalid (HTTP 401).
- Session Expired Notice: When redirected from an expired session, displays: `Your operator session has expired. Please sign in again.`

---

### Screen 2: Multi-Currency Invoice Dashboard

#### Purpose & Context
Offers an executive overview of invoice drafting activity, organized by currency (USD, EUR, JPY), and displays the roster of local invoice drafts.

#### Critical Architecture Truth
> [!IMPORTANT]
> The current backend provides `GET /api/invoice-drafts/:id`, but does NOT currently expose a general list endpoint (`GET /api/invoice-drafts`).
> In this design increment, the dashboard displays clearly marked **synthetic fixtures** (USD, EUR, JPY) to validate UX, responsive layout, and multi-currency formatting. A persistent callout badge informs the operator:
> `ℹ️ Demo Data Active: Backend draft listing endpoint (GET /api/invoice-drafts) is pending implementation. Displaying synthetic fixtures.`

#### Key Components
1. **Header Action Bar**:
   - Page Title: "Invoice Drafts".
   - Subtitle: "Local drafts and PayPal Sandbox staging".
   - Primary Action Button: `+ Create Invoice` (leads to Screen 3).
2. **Multi-Currency Summary Cards (3 Columns Desktop / Stacked Mobile)**:
   - **USD Summary**:
     - Symbol / Label: `USD ($)`
     - Drafts Count: `1 Draft`
     - Total Volume: `$633.26`
     - Sandbox Staged: `$633.26 (1 remote draft)`
   - **EUR Summary**:
     - Symbol / Label: `EUR (€)`
     - Drafts Count: `1 Draft`
     - Total Volume: `€1,517.25`
     - Sandbox Staged: `€0.00 (0 remote drafts)`
   - **JPY Summary (0 Exponent)**:
     - Symbol / Label: `JPY (¥)`
     - Drafts Count: `1 Draft`
     - Total Volume: `¥143,000`
     - Sandbox Staged: `¥0 (0 remote drafts)`
3. **Filter & Search Controls**:
   - Search input: "Search by recipient, invoice #, or PO reference..."
   - Currency filter tabs: `All Currencies`, `USD`, `EUR`, `JPY`.
   - Sandbox status filter: `All Statuses`, `Local Only`, `PayPal Draft Created`.
4. **Local Drafts Data Table (Desktop) / Card List (Mobile)**:
   - *Columns*:
     - **Invoice #**: e.g., `INV-2026-001` (links to Screen 5: Detail).
     - **Recipient**: Name & synthetic email (e.g., `Acme Creative Labs`).
     - **Date / Due**: Issue date & due date with overdue indicator if applicable.
     - **Total Amount**: Formatted currency with minor-unit precision (`$633.26`, `€1,517.25`, `¥143,000`).
     - **Local Status**: Pill badge `Local Draft` (Neutral slate).
     - **PayPal Sandbox Status**: Pill badge `PayPal Draft: INV2-TEST-01` (Success emerald) or `Not Staged` (Muted gray).
     - **Actions**: "View Details", "Delete".
5. **AG Studio Grid Integration Boundary**:
   - The table is encapsulated within a structured container configured with semantic classes (`nmi-grid-container`).
   - An accessible HTML5 `<table>` serves as the rock-solid native fallback.
   - Once AG Studio licensing, trial coverage (active through Dec 15), and sponsor keys are authorized, the container can seamlessly hydrate `ag-studio-react` for client-side sorting, column reordering, and grouping without altering surrounding layouts.

---

### Screen 3: Natural-Language Invoice Composer

#### Purpose & Context
Allows the operator to type or paste freeform invoice notes and parse them into structured invoice data using the backend's AI parsing endpoint (`POST /api/invoice-drafts/parse`).

#### Key Components
1. **Mode Switcher (Tabs)**:
   - `Natural Language (AI)` (Default).
   - `Manual Entry` (Directly opens Screen 4 with empty structured fields).
2. **AI Input Area**:
   - Textarea with clear placeholder text:
     *e.g., "Billed Acme Corp for 40 hours web development at $125/hr. Included $500 cloud infrastructure setup. Net 30 payment terms, PO-9921."*
   - Character count indicator (max 4,000 chars).
   - Suggested Prompt Chips: Clickable synthetic prompt snippets allowing instant testing:
     - `Design Work (USD)`: "Acme Design: 24 hrs UI design at $85/hr, $500 brand kit discount. Net 15."
     - `Consulting (EUR)`: "Beispiel GmbH: 12 hrs advisory at €110/hr + €197.25 travel expense. 20% VAT."
     - `Software Dev (JPY)`: "Sakura Creative: 22 hrs mobile engineering at ¥6,500/hr. Tax exempt."
3. **Privacy & Security Notice**:
   - `🔒 Safe Processing: Invoice text is parsed securely via OpenAI. No customer payment details or live credentials are sent.`
4. **Action Buttons**:
   - `Parse Invoice` (Primary with lightning/sparkle icon).
   - `Switch to Manual Entry` (Secondary text button).
5. **AI Interaction States**:
   - *Parsing In-Flight*: Button transitions to loading spinner: "Analyzing invoice details..." with disabled textarea.
   - *Clarification Required*: If the prompt is ambiguous, an interactive clarification panel opens beneath the textarea presenting specific questions from the AI parser (e.g., "Is the travel expense subject to VAT?").
   - *AI Unavailable*: If OpenAI is unreachable or parsing fails, a prominent banner appears:
     `⚠️ AI Parsing Unavailable: Unable to parse invoice text automatically. You can review your text and retry or switch to Manual Entry.` with a direct "Continue with Manual Entry" action.

---

### Screen 4: Structured Invoice Review & Editing

#### Purpose & Context
Allows the operator to inspect, edit, and validate all fields parsed by the AI (or entered manually), computes totals using strict minor-unit integer arithmetic, and saves the draft locally via `POST /api/invoice-drafts`.

#### Form Sections
1. **Invoice Overview**:
   - **Recipient Name**: Required string (e.g., `Acme Creative Labs`).
   - **Recipient Email**: Optional/Required synthetic email format.
   - **Invoice Number**: Text string (e.g., `INV-2026-001`).
   - **Currency**: Dropdown selector: `USD ($)`, `EUR (€)`, `JPY (¥)`. Changing currency dynamically adapts line item decimal inputs (JPY enforces 0 decimals).
   - **Issue Date**: HTML5 Date input (`YYYY-MM-DD`).
   - **Due Date**: HTML5 Date input (`YYYY-MM-DD`).
   - **Reference / PO**: Text input (e.g., `PO-88219`).
2. **Line Items Grid**:
   - Table headers: `Description`, `Quantity`, `Unit Price`, `Total`, `Actions`.
   - Each row provides:
     - Description: Text input.
     - Quantity: Number input (min: 1, step: 1 or decimal).
     - Unit Price: Currency-formatted number input (e.g., `85.00` for USD, `6500` for JPY).
     - Line Total: Readonly computed display (`Quantity * Unit Price`).
     - Remove row button (trash icon).
   - `+ Add Line Item` button at the bottom of the list.
3. **Totals & Math Computation Panel**:
   - Encapsulated summary card aligned to the right:
     - **Subtotal**: Sum of line items.
     - **Discount**: Optional discount input (Amount or %).
     - **Tax / VAT**: Optional tax rate input (e.g., `8.25%` or fixed amount).
     - **Total Due**: Bold prominent display formatted with minor-unit precision.
   - Strict Minor-Unit Verification Notice:
     `Computed Minor Units: 63,326 cents ($633.26) — Verified integer minor-unit math.`
4. **Save & Navigation Actions**:
   - `Save Local Draft` (Primary button).
     - Includes client-side idempotency generation: sends `Idempotency-Key: <uuidv4>` header.
     - Duplicate-save guard: Button is disabled upon click, showing `Saving Draft...`.
   - `Back to Composer` (Secondary button).
   - `Discard` (Destructive text button with confirmation modal).

---

### Screen 5: Local Invoice Detail & PayPal Sandbox Status

#### Purpose & Context
Presents the authoritative record of a saved local invoice draft (`GET /api/invoice-drafts/:id`) and provides the controlled operator action to stage the draft in PayPal Sandbox via `POST /api/invoice-drafts/:id/paypal-draft`.

#### Key Elements
1. **Invoice Header Card**:
   - Invoice Number & Recipient title.
   - Badges: `LOCAL DRAFT` (Slate), `CURRENCY: USD` (Blue).
   - Timestamps: Created At, Updated At.
2. **Status Summary & External Boundary Box**:
   - Prominent dedicated callout card with distinct styling:
     - **Heading**: `PayPal Sandbox Integration Status`
     - **State 1: Not Staged in PayPal**:
       - Status Indicator: Muted gray circle: `Not Created in PayPal Sandbox`.
       - Explanatory Guidance:
         `Staging this invoice creates a DRAFT in your PayPal Sandbox account. It does NOT notify the customer or request payment.`
       - Operator Action: `Create PayPal Sandbox Draft` (Primary action button).
       - Guardrail Modal: Clicking triggers a confirmation dialog reiterating:
         *"Create draft in PayPal Sandbox? Remote invoice will be created with status DRAFT. No emails will be sent."*
     - **State 2: Staged in PayPal Sandbox (After Creation)**:
       - Status Indicator: Emerald green checkmark: `PayPal Sandbox Draft Created`.
       - Remote Invoice ID: e.g., `INV2-9A4B-C7D8-90EF`.
       - Remote Status: `DRAFT`.
       - Dispatched At: ISO timestamp.
       - Operator Link: `Open in PayPal Sandbox ↗` (links to `https://www.sandbox.paypal.com`).
       - Critical Notice: `Draft created in PayPal. Customer email notification has NOT been sent.`
3. **Line Items & Financial Summary**:
   - Read-only table of line items, unit rates, quantities, and computed totals matching Screen 4.
4. **Provider Operation History / Audit Log**:
   - Chronological event timeline:
     - `10:14:02 AM`: Local draft saved by operator.
     - `10:14:45 AM`: PayPal Sandbox draft creation initiated (Attempt 1).
     - `10:14:47 AM`: PayPal Sandbox draft created successfully (`INV2-9A4B-C7D8-90EF`).

---

## 6. Interaction States & Edge Cases Matrix

| Domain | State | Visual Presentation | User Action & Recovery |
| :--- | :--- | :--- | :--- |
| **Authentication** | Unauthenticated | Clean login modal/card. All background UI hidden. | Enter operator password. |
| **Authentication** | Authenticated | Full application shell visible with persistent Sandbox banner. | Normal operation. |
| **Authentication** | Expired Session | Toast notification + login overlay: "Session expired". Form input state preserved in `sessionStorage`. | Re-authenticate to resume without losing drafted work. |
| **Data Fetching** | Loading | Skeleton shimmer across summary cards and table rows. | Non-interactive until loaded. |
| **Data Fetching** | Empty State | Illustrative graphic + message: "No invoice drafts found. Create your first draft using AI or manual entry." | Large primary CTA: "+ Create First Invoice". |
| **Data Fetching** | System Error | Crimson banner with HTTP error code and retry button. | "Retry Request" button. |
| **Network** | Offline | Amber banner: `📡 Offline: Internet connection lost. Draft changes cannot be saved until connection is restored.` | Auto-retries on `navigator.onLine`. Save button disabled. |
| **AI Parsing** | In-Flight | Pulse animation over textarea, button disabled with spinner: "Analyzing invoice details...". | Operator waits (average 1-3s). |
| **AI Parsing** | Clarification Needed | Violet inline card beneath textarea with numbered clarification prompts from AI. | Operator types answers into clarification inputs or clicks "Skip to Manual". |
| **AI Parsing** | Invalid Proposal | Warning alert: "AI could not identify line items or amounts in this text." | Prompt remains editable with suggestion to use prompt chips or manual entry. |
| **AI Parsing** | Service Unavailable | Alert banner: "OpenAI parsing service unreachable. Please enter invoice details manually." | Primary CTA shifts to "Open Manual Form". |
| **Form Validation** | Missing Fields | Red border on invalid inputs + text: "Recipient name is required". | Focus moves to first invalid input. |
| **Form Validation** | Rounding Warning | Informational pill: "Totals rounded to exact currency minor units (cents / yen)." | Automatic precision adjustment with formula display. |
| **Draft Save** | In-Progress | Save button displays spinner: "Saving Draft...". Inputs locked. | Guard against double-clicks via client state and `Idempotency-Key`. |
| **Draft Save** | Conflict / 409 | Red alert: "Draft was modified elsewhere or idempotency key reused." | Option to reload draft or save as a new revision. |
| **PayPal Sandbox** | Provider Disabled (503) | Amber pill badge: "PayPal Drafting Disabled". Button disabled with tooltip: `PAYPAL_DRAFTS_ENABLED=false`. | Explains provider drafting is paused by server configuration. |
| **PayPal Sandbox** | Lease In Progress (409) | Yellow pill badge: "Operation In Progress". Spinner indicates active lock. | Instructs operator to wait or refresh status. |
| **PayPal Sandbox** | Reconciliation (409) | Yellow badge: "Reconciling Provider State". | System is resolving remote state safely; polling status. |
| **PayPal Sandbox** | Rejected (502) | Red badge: "PayPal Creation Rejected: [Error Details]". | Displays sanitized PayPal error reason; draft remains editable locally. |
| **PayPal Sandbox** | Outcome Unknown (502) | Orange badge: "Network Timeout: PayPal outcome unknown". | "Verify Remote Status" button queries PayPal without duplicating the draft. |

---

## 7. Responsive Layout Specifications

### Desktop (>= 1024px)
- Global max-width container: `1280px` with `32px` horizontal padding.
- Top navigation bar with logo on left, Sandbox pill in center, and user controls on right.
- Dashboard: 3-column currency metric cards (`grid-template-columns: repeat(3, 1fr)`). Full table view with all metadata visible.
- Review/Edit: 2-column layout (Left 65% for invoice details and line items; Right 35% for sticky totals and save actions).

### Tablet (768px - 1023px)
- Max-width container: `100%` with `24px` horizontal padding.
- Dashboard: 3-column or 2+1 wrapped currency cards. Table with horizontal scroll or prioritized column visibility (hide PO reference, condense dates).
- Review/Edit: Single stacked column with totals card placed directly below line items.

### Mobile (< 768px)
- Full-width layout with `16px` horizontal padding.
- Bottom navigation bar fixed at viewport bottom with 48px touch targets.
- Persistent Sandbox pill pinned beneath the mobile top app bar.
- Dashboard: Currency cards render as swipeable horizontal carousel or stacked accordion cards. Draft list transforms from tabular layout into individual card items showing recipient, amount, and status pill.
- Line Items: Card-based line item inputs with large remove buttons.
- Sticky Bottom Action Bar for primary actions ("Save Draft" or "Create PayPal Draft") with safe-area inset support (`env(safe-area-inset-bottom)`).

---

## 8. Backend API Seams & Architecture Truth

| Endpoint | Method | Backend Status | UI Design Handling |
| :--- | :---: | :---: | :--- |
| `/api/auth/login` | POST | ✅ Implemented | Screen 1 Operator login form |
| `/api/auth/session` | GET | ✅ Implemented | Authenticated shell session check |
| `/api/auth/logout` | POST | ✅ Implemented | Shell user menu Sign Out action |
| `/api/invoice-drafts/parse` | POST | ✅ Implemented | Screen 3 AI Invoice Composer |
| `/api/invoice-drafts` | POST | ✅ Implemented | Screen 4 Save Local Draft (with `Idempotency-Key`) |
| `/api/invoice-drafts/:id` | GET | ✅ Implemented | Screen 5 Local Invoice Detail view |
| `/api/invoice-drafts/:id/paypal-draft` | POST | ✅ Implemented | Screen 5 Create PayPal Sandbox Draft |
| `/api/invoice-drafts` (List) | GET | ❌ Not Implemented | Screen 2 Dashboard uses clearly labeled **synthetic fixtures** (`design/fixtures/invoice-fixtures.json`). UI includes documented API capability seam. |
| PayPal Customer Sending | POST | ❌ Not Implemented | UI strictly prevents any representation of customer notification or sending. |
| Customer Email Reminders | POST | ❌ Not Implemented | No reminder controls displayed in UI. |
| PayPal Webhooks / Payments | POST | ❌ Not Implemented | No paid-state reconciliation displayed; status strictly stops at PayPal Sandbox DRAFT. |

---

## 9. Conclusion & Visual Approval Artifacts

This specification, along with the semantic tokens in `design/tokens/design-tokens.json`, synthetic fixtures in `design/fixtures/invoice-fixtures.json`, and the interactive browser mockup in `design/preview/index.html`, provides the complete visual and interactive baseline for NudgeMyInvoice.

Upon explicit owner visual approval, the UI shell and frontend implementation can commence against these approved boundaries.
