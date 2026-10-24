# NMI-P1 — Screen map, flows and wireframes (DRAFT, awaiting owner approval)

> Status: **not approved.** Text wireframes for review only; no UI shell beyond a status placeholder may be built until the owner approves this direction. Sample data is synthetic. Nothing here defines new product behavior beyond `docs/PRODUCT.md`.

## Navigation
Top bar (desktop) / bottom tab bar (mobile): **Dashboard · New invoice · Approvals · Settings**. Invoice detail and reminder drafting are reached from dashboard rows. A persistent badge reads **PayPal SANDBOX**.

```text
Dashboard ──row──▶ Invoice detail ──▶ Reminder draft
    │                    │
    └─▶ New invoice ─▶ Review/edit ─▶ Approval (send) ─▶ Invoice detail
```

## 1. Invoice dashboard (AG Studio)
```text
┌ NudgeMyInvoice  [SANDBOX]   Dashboard  New invoice  Approvals(2)  Settings ┐
│ USD  Outstanding 1,250.00   Overdue 400.00 │ EUR  Outstanding 287.39  Overdue 0.00 │  ← one card per currency, never merged
│ ┌ AG Studio canvas ───────────────────────────────────────────────────────┐ │
│ │ Filter: status ▾  currency ▾  due ▾            [Overdue reminders ▸]     │ │
│ │ Customer      Currency  Total     Due         Status     │ │
│ │ Acme Design   USD       500.00    2026-11-07  Sent       │ │
│ │ Beispiel GmbH EUR       287.39    2026-11-20  Draft      │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```
Mobile: currency cards stack and scroll horizontally; table becomes a list of cards. States: loading skeleton; empty ("No invoices yet — create one"); error with retry; offline banner; AG Studio unavailable → plain accessible table fallback (pending owner decision, see open items).

## 2. Natural-language composer
```text
┌ New invoice ─────────────────────────────────────────────┐
│ Describe the invoice (max 2000 characters)               │
│ [ Invoice Acme Design for 2 logo concepts at 250 USD…  ] │
│ [Parse with AI]            or  [Enter manually]          │
└──────────────────────────────────────────────────────────┘
```
States: idle; parsing (spinner, cancel); needs-clarification (inline questions); validation error; **model unavailable → manual entry offered automatically**; AI not configured.

## 3. Structured review and edit
Editable fields: customer name/email, currency (select), line items (description, qty, unit price), due date, optional tax %/discount. Totals are computed server-side and shown read-only per currency. Inline errors per field; "Save local draft" never contacts PayPal or the customer.

## 4. Human approval screen
```text
┌ Approve: SEND invoice ───────────────────────────────────┐
│ Invoice INV2-… to billing@acme.example                   │
│ Amount 500.00 USD   Due 2026-11-07   Digest a1b2…        │
│ This will email the customer from PayPal SANDBOX.        │
│ Expires in 09:42        [Cancel]  [Approve and send]     │
└──────────────────────────────────────────────────────────┘
```
Button is a request only; the server verifies the one-time, expiring grant bound to action, invoice and payload digest. States: expired, already used, payload changed (must re-review), session expired, double-click guarded. Destructive actions use a distinct, warning-styled variant.

## 5. Invoice detail and payment timeline
Header (customer, currency, total, status), line items, vertical timeline (Draft created → Approved → Sent → Payment observed → Paid) with source labels: *PayPal verified event* vs *local action*. Simulated events are labeled **SIMULATED**.

## 6. Multi-currency summaries
Per-currency cards only, each labeled with its ISO code; no grand total and no FX conversion anywhere.

## 7. Overdue and reminder drafting
List of overdue invoices per currency; "Draft reminder" shows AI-written editable text marked **DRAFT — not sent**. Sending a reminder is a privileged action and is out of MVP unless separately approved.

## Accessibility (from `docs/ACCESSIBILITY.md`)
Keyboard-operable everything with visible focus; semantic landmarks; status changes via `role="status"`; color is never the sole status signal; ≥4.5:1 contrast; 200% text scaling without loss; AG Studio canvas must expose an accessible alternative (table fallback). Light/dark themes via design tokens.

## Open items for owner
1. Approve or amend the screen map and wireframes above.
2. AG Studio: public quick-start documents `ag-studio-react` but states no licence/trial terms; owner must confirm licence, trial coverage through Dec 15 and the sponsor-provided key before any dependency is added.
