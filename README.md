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

- Current `main`: Phase 2 Increment 1 merged (authenticated operator, PostgreSQL sessions and atomic approvals); API/backend foundation is runnable, but **no complete invoice UI or live provider integration is available on `main`**.
- In progress: [Draft PR #4](https://github.com/mrdzyn/nudgemyinvoice/pull/4) — authenticated AI invoice-draft flow and PayPal sandbox draft adapter; **not merged, no real PayPal or OpenAI smoke test confirmed**.
- Hosted demo: _To be added after deployed sandbox MVP is verified. Keep access operational through Dec 15, 2026 judging._
- Demo video (under 3 minutes): _To be added._
- Hackathon deadline: Nov 12, 2026, 12:00 PM PST (Nov 13, 4:00 AM Asia/Manila).
- Public repository: https://github.com/mrdzyn/nudgemyinvoice

## Stack (planned)

React + Vite + TypeScript (web shell pending design approval); Fastify/Node; Drizzle + **PostgreSQL** (current runtime; SQLite support is undecided); OpenAI Node SDK (`openai`) / Responses API with Zod-validated structured output; PayPal Invoicing REST **sandbox only**; Vitest. **Planned, not yet delivered:** PayPal webhooks, AG Studio (subject to license/design approval), Render hosting, and customer-facing UI. APIMatic PayPal Context Plugin is a coding-time aid, **not** a substitute for runtime authorization or verification.

## Getting started

**Current `main` (through NMI-P2-I1):** the workspace runs, but there is no invoice UI yet. Available: `GET /health`, operator login/session/logout (`/api/auth/*`), a placeholder web page, and tested parsing/validation/approval libraries with a PostgreSQL approval store. **PayPal draft creation is proposed in Draft PR #4, not yet merged into `main`**. No PayPal sending is wired.

Prerequisites: Node 22+, pnpm 10 (`corepack enable`), PostgreSQL for the authenticated API. Optional for a **separately approved** later smoke test: a PayPal **sandbox** REST app and OpenAI key/model (`OPENAI_API_KEY`, `OPENAI_MODEL`).

```bash
git clone https://github.com/mrdzyn/nudgemyinvoice.git
cd nudgemyinvoice
pnpm install
cp .env.example .env   # set only SANDBOX values; NEVER commit .env
pnpm test              # deterministic tests; no OpenAI key or network needed
pnpm validate          # lint, format, typecheck, test, build, bundle-secret scan
# API: needs PostgreSQL. Set DATABASE_URL, SESSION_SECRET (>=32 chars), PAYPAL_ENV=sandbox and
# PAYPAL_API_BASE_URL (see .env.example), apply migrations from packages/db/migrations, then provision the
# single operator once (secrets from your shell, never from a file you commit):
NMI_OPERATOR_USERNAME=... NMI_OPERATOR_PASSWORD=... pnpm --filter @nmi/api provision-operator
pnpm --filter @nmi/api dev
# Real-PostgreSQL tests (disposable database named nmi_test*):
TEST_DATABASE_URL=postgres://user@localhost:5432/nmi_test pnpm test:db
pnpm --filter @nmi/web dev   # http://localhost:5173
```

Migrate/seed/webhook commands and judge setup will be added once those features exist. Do not claim judges can run a full demo until verified end to end.

## PayPal Developer sandbox setup — for humans and AI agents

**Observed setup blocker (2026-10-25):** The owner's attempt to create a PayPal Sandbox REST app with the name **`NudgeMyInvoice`** was **rejected because the app name contained “invoice.”** The app **was not created** and **no Client ID or Client Secret was issued by that attempt**. Existing Sandbox **Business (merchant)** and **Personal (buyer)** test accounts were identified, and the dashboard remained in **Sandbox** mode. This records an actual setup result, **not a claim that every PayPal account or API has a universal name-ban rule**.

**Important distinction:** **NudgeMyInvoice remains the public product, GitHub repository and hackathon submission name.** A **PayPal REST app display name can differ from the product name**. If the dashboard rejects the word `invoice`, try an alternative that does not contain it, such as **`NudgeMyPayAgent`** (example only; availability and acceptance are **not yet verified**). Do **not** rename this repository or silently create a Live application as a workaround.

**Sandbox setup checklist:**

1. Open [PayPal Developer → Sandbox Apps & Credentials](https://developer.paypal.com/dashboard/applications/sandbox) and verify that the dashboard says **Sandbox**, not Live.
2. Create the REST app with a name accepted by the current dashboard; record the accepted **non-secret display name** in a setup report. Associate it with the existing sandbox Business merchant account; confirm the Personal buyer account remains available for later payment testing.
3. Keep the generated Sandbox Client ID and Client Secret **only in an ignored local `.env` or approved secret manager**. Never add them to Git, an issue, a PR, a model prompt, the README, test fixtures, screenshots, CI logs or demo footage. Do not copy real account passwords into the repo.
4. Configure the **Sandbox** endpoint locally. The flags `PAYPAL_DRAFTS_ENABLED`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` belong to the **unmerged Draft PR #4**, not the current `main` release:

   ```dotenv
   PAYPAL_ENV=sandbox
   PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
   PAYPAL_DRAFTS_ENABLED=false
   # Set these in your local ignored .env / secret manager only, not in public docs:
   # PAYPAL_CLIENT_ID=<sandbox-client-id>
   # PAYPAL_CLIENT_SECRET=<sandbox-client-secret>
   ```

5. **Do not enable the draft-write flag or run a genuine sandbox API smoke test until the owner explicitly approves it.** A draft must stay in `DRAFT` and must not notify a recipient. PayPal sending, reminders, refunds, captures, production payments, deployment and release require separate reviewed authorization.
6. Report only the outcome (**Sandbox app created or blocked; non-secret display name; test-account roles present; provider smoke NOT TESTED / PASS / FAIL**). Never claim the app or provider integration is working from fake-client tests alone.

**AI agent operating rule:** Read [`AGENTS.md`](AGENTS.md), [`docs/STATUS.md`](docs/STATUS.md), [`config/project-profile.json`](config/project-profile.json), and the active task/handoff before making repository changes. Treat this README as onboarding context, **not permission** to create PayPal apps, expose credentials, enable paid API calls, merge, deploy, or release. If working in a logged-in PayPal browser session, remain in Sandbox and obtain explicit owner consent before creating an external app or making an API write.

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
