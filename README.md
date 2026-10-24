# NudgeMyInvoice

**The AI invoice assistant that helps freelancers get paid—across currencies, with humans in control.**

> Hackathon MVP — PayPal **sandbox only**. Not a production payment service; no escrow, automatic refunds, or autonomous sending.

## What it will do

1. Parse a plain-language request into a structured invoice draft with clear customer, items, due date, **one currency per invoice**, and calculated totals.
2. Let a human inspect and approve sending an invoice via the **PayPal Invoicing API (sandbox)**.
3. Reconcile invoice payment updates from **signature-verified PayPal invoicing webhooks** with deduplication and authoritative status checks.
4. Flag overdue invoices and draft friendly, context-aware follow-up wording. **Never send reminders without approval.**
5. Show invoices, statuses, amounts and currency-specific totals in an AG Studio dashboard.

**Multi-currency means managing invoices in multiple supported currencies, not foreign-exchange conversion or a mixed-currency grand total.**

## Status and demo

- Phase: `NMI-P0` — greenfield repository foundation (no runnable application yet).
- Hosted demo: _To be added after deployed sandbox MVP is verified. Keep access operational through Dec 15, 2026 judging._
- Demo video (under 3 minutes): _To be added._
- Hackathon deadline: Nov 12, 2026, 12:00 PM PST (Nov 13, 4:00 AM Asia/Manila).
- Public repository: https://github.com/mrdzyn/nudgemyinvoice

## Stack (planned)

React + Vite + TypeScript; AG Studio (trial); Fastify/Node; Drizzle; Postgres on Render and SQLite locally (dialect parity must be verified); OpenAI Node SDK (`openai`) with the Responses API and Zod-validated structured output; PayPal Invoicing REST sandbox and webhooks; Render web service / Postgres / scheduled job; Vitest. APIMatic PayPal Context Plugin is a coding-time aid, **not** a substitute for runtime authorization or verification.

## Getting started

**Phase 0 only:** this repository is currently an operating-model and documentation bootstrap. `pnpm dev` **will not work** until the Phase 1 application scaffold has been implemented and reviewed.

Prerequisites for the planned runnable MVP: Node LTS, pnpm, PayPal Developer sandbox app (client ID/secret and webhook ID), OpenAI API key and model ID (`OPENAI_API_KEY`, `OPENAI_MODEL`), and local SQLite or Postgres.

```bash
git clone https://github.com/mrdzyn/nudgemyinvoice.git
cd nudgemyinvoice
cp .env.example .env
# Set your own SANDBOX keys locally; NEVER commit .env.
# Following commands will become available in Phase 1:
# corepack enable
# pnpm install
# pnpm dev
# pnpm test
```

When the app lands, this section will provide **working** `install / migrate / seed / run / sandbox-webhook` commands, seeded demo users, and setup for judges. Do not claim judges can run a build until verified end to end.

## Safe demo script (planned)

1. Enter: `Invoice Acme Design for 2 logo concepts at 250 USD each, due in 14 days.`
2. Review AI-parsed items and amount; save the PayPal **draft**.
3. Use the human approval screen before **sending** the sandbox invoice.
4. Pay through PayPal's sandbox buyer flow; observe a **verified** webhook and paid status.
5. Show a second invoice in EUR, separate currency summary, and an AI-drafted overdue nudge; never automatically send it.

All company names, invoices, customer details and amounts in the demo are fictitious.

## Docs

- [Product](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md) · [Hackathon plan](docs/HACKATHON-PLAN.md) · [Status](docs/STATUS.md)
- [Agent operating rules](AGENTS.md) · [Initial task contract](tasks/NMI-P0-bootstrap.md)

## PayPal and tools

- PayPal Invoicing REST API: https://developer.paypal.com/docs/invoicing/
- PayPal webhook integration: https://developer.paypal.com/api/rest/webhooks/
- APIMatic Context Plugin for PayPal: https://context.apimatic.io/plugins/paypal/
- Render: https://render.com/
- AG Studio: https://www.ag-grid.com/studio/react/quick-start/

## Security and release scope

Sandbox only. The server validates approval, API permissions, payload digests, and webhook signatures. Model outputs are untrusted. The system does not store payment-card credentials or initiate production payments. See [security boundaries](docs/SECURITY.md).

## License

MIT — see [LICENSE](LICENSE). Third-party dependencies, trademarked services, and external logos retain their own licenses and rights.
