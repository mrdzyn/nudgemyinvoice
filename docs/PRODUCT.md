# Product — NudgeMyInvoice

## Identity
- Product: **NudgeMyInvoice**
- Pitch: AI creates structured invoices from plain language, reconciles sandbox PayPal payments, and drafts friendly overdue reminders. Human approval gates any money-moving or outbound-notification action.
- Primary users: freelancers, contractors, and very small businesses working across currencies.
- Stage: hackathon MVP, sandbox-only; public open-source MIT license.
- Platform: responsive web app; demo on Render or reproducible local setup.
- Business model: open-source hackathon demonstration; commercialization out of scope.

## Problem and value
Freelancers lose time translating unstructured work requests into invoices, checking whether PayPal invoices were paid, and drafting polite follow-ups. NudgeMyInvoice combines structured AI parsing, signed webhook reconciliation, and safe human-approved workflows.

## 55-hour MVP
1. User enters natural language; AI returns a **validated proposal** with customer, line items, currency, due date and explicit questions for missing information.
2. User reviews and creates a draft invoice using the PayPal sandbox Invoicing API. No outbound notification from creating a draft.
3. Human explicitly approves sending a selected invoice. Server validates approval and calls PayPal sandbox.
4. Real verified invoice webhooks update local state; duplicate and out-of-order events are handled safely, with authoritative read fallback.
5. AG Grid dashboard groups amounts and overdue status **by currency**; zero mixed-currency sums.
6. AI drafts a context-appropriate reminder. Draft only unless a separately approved send implementation exists.

## Distinguishing demo
Two or more currencies side by side, invoice totals displayed in native invoice currency, sandbox payment reconciliation, an approval audit trail, and safe agent tool-use decisions.

## Non-goals
- Escrow, international FX quotes or conversion, mixed-currency settlement.
- Real PayPal/live payments or production PayPal API access.
- Fully autonomous external invoice sending, reminders, cancellation, refunds or order capture.
- Automatic receipt email, customer self-service portal, real-time tax/compliance guarantees.
- Full accounting suite, subscriptions, teams, production SaaS tenancy.
- Orders and refund integration beyond read-only exploratory demonstration unless time and separate authorization permit.

## Measures of completion
- One genuine PayPal sandbox invoice created, human-approved, sent, paid by test buyer, reconciled from verified events.
- Accurate, schema-validated AI invoice parsing for at least two supported currencies; no floating-point money issues.
- Duplicate/forged/out-of-order webhooks proven safe with tests; approval bypass negative tests.
- Public MIT repo, reproducible setup, verified hosted demo or local run, video under 3 minutes and submitted Devpost entry.

## Product authority
Major scope, payment, privacy, operational, design, and release changes require explicit owner authorization. See `AGENTS.md` and `docs/SECURITY.md`.
