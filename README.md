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

### Confirmed owner-reported Sandbox state (2026-10-25)

| Item | Status |
|---|---|
| Environment | **Sandbox** selected; no Live environment was used |
| Product / repository / hackathon name | **NudgeMyInvoice** — unchanged |
| PayPal REST app display name | **`NudgeMyBillsAI`** — successfully created as a **Merchant** app |
| Merchant association | Existing US **Sandbox Business** test account |
| Buyer testing | Existing US **Sandbox Personal** test account identified |
| Invoicing API | **Enabled and saved**; PayPal displayed “Application was saved successfully” |
| Sandbox credentials | Client ID available, Secret masked in PayPal; **not copied into chat or project files** |
| Provider smoke test | **NOT TESTED** — no OAuth request, invoice creation, send or payment performed |

**Naming note:** PayPal rejected an **earlier attempt** to register the REST app as `NudgeMyInvoice` because the name contained “invoice”; that **first attempt created no app**. The owner then successfully created `NudgeMyBillsAI`. This is an observed dashboard result, not a universal policy claim. **Do not rename the NudgeMyInvoice product or GitHub repository, and do not create another PayPal app for this project unless the owner explicitly directs it.**

For privacy, this public README intentionally **does not publish the Sandbox Business or Personal account email addresses, credentials, tokens, account IDs, or passwords**. The owner has those details privately.

### Local-only configuration and activation

1. Open [PayPal Developer → Sandbox Apps & Credentials](https://developer.paypal.com/dashboard/applications/sandbox). Locate **`NudgeMyBillsAI`** and confirm **Sandbox**, **Merchant**, and **Invoicing API enabled** before trying the integration. Use the existing Sandbox Business and Personal test accounts; do not create new ones unnecessarily.
2. Copy the **Sandbox** Client ID and Secret **directly into your local server-side ignored `.env` file or approved secret manager**. Never commit or paste them into GitHub, chat, coding-agent prompts, browser-side variables, test snapshots, README text, PRs, CI logs or demo recordings. A masked Secret in the dashboard is not evidence the app is configured locally.
3. Use these configuration **names** (no values or sample credentials are committed):

   ```dotenv
   PAYPAL_ENV=sandbox
   PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
   PAYPAL_DRAFTS_ENABLED=false
   # Fill the following two variables privately in a server-only environment:
   PAYPAL_CLIENT_ID=
   PAYPAL_CLIENT_SECRET=
   ```

   **Important:** `PAYPAL_DRAFTS_ENABLED`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET` are supported by **unmerged [Draft PR #4](https://github.com/mrdzyn/nudgemyinvoice/pull/4)**. The current `main` does not implement sandbox draft creation. Configure the variables only in a checkout of the implementation branch once it passes review. Merely saving an `.env` file does not prove the runtime loads it; verify the local server's documented env-loading mechanism without printing the values.
4. Leave `PAYPAL_DRAFTS_ENABLED=false` until **the owner explicitly authorizes the sandbox draft smoke test** and the security/idempotency remediation in PR #4 has passed independent review. A separately approved smoke may obtain a Sandbox OAuth token, create **one** fictitious `DRAFT` invoice, retrieve and verify it, then stop. **Do not use the send endpoint, notify a buyer, execute a payment, enable Live APIs, deploy, or release.**
5. Report non-secret readiness only: app display name, Sandbox/Merchant/Invoicing selection, test-account roles present, local secret configuration **yes/no**, API smoke **NOT TESTED/PASS/FAIL**, and any remaining blockers. Real OpenAI and PayPal provider tests must not be mislabeled PASS based on fake-client or CI tests.

References: [PayPal REST authentication](https://developer.paypal.com/api/rest/authentication), [API base URLs](https://developer.paypal.com/api/make-api-requests), [Invoicing v2](https://developer.paypal.com/api/invoicing/v2/).

**AI agent operating rule:** Before repository changes, read [`AGENTS.md`](AGENTS.md), [`docs/STATUS.md`](docs/STATUS.md), [`config/project-profile.json`](config/project-profile.json), and the active task/handoff. This README is onboarding context, **not authority** to create a duplicate app, inspect or reveal secrets, run live provider operations, enable draft writes, merge, deploy or release. An authenticated PayPal browser session does not imply permission to execute API calls.

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
