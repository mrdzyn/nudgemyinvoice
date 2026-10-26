# NudgeMyInvoice

**The AI invoice assistant that helps freelancers get paid—across currencies, with humans in control.**

> Hackathon MVP — PayPal **sandbox only**. Not a production payment service; no escrow, automatic refunds, or autonomous sending.

## Product vision and implemented capabilities

The backend currently implements invoice proposal validation, operator-authenticated local draft persistence, and explicitly requested PayPal **Sandbox DRAFT** creation. The items below that involve sending, payment webhooks, reminders, and dashboards are **planned**, not delivered.


1. Parse a plain-language request into a structured invoice draft with clear customer, items, due date, **one currency per invoice**, and calculated totals.
2. Let a human inspect and approve sending an invoice via the **PayPal Invoicing API (sandbox)**.
3. Reconcile invoice payment updates from **signature-verified PayPal invoicing webhooks** with deduplication and authoritative status checks.
4. Flag overdue invoices and draft friendly, context-aware follow-up wording. **Never send reminders without approval.**
5. Show invoices, statuses, amounts and currency-specific totals in an AG Studio dashboard.

**Multi-currency means managing invoices in multiple supported currencies, not foreign-exchange conversion or a mixed-currency grand total.**

## Status and demo

- **Accepted backend increment:** NMI-P2-I2, independently audited at `4982201918d0030234fdbabbc297375c02c01e5d`; [PR #4](https://github.com/mrdzyn/nudgemyinvoice/pull/4) owner-approved and squash-merged into `main` as `07409bf32068362b9f5b711b64ef0399d588169e` on 2026-10-26.
- **Real PayPal Sandbox acceptance:** `NMI-P2-I2-SANDBOX-SMOKE-01` **PASS** (AG's local provider evidence): OAuth HTTP 200; one draft-create HTTP 201; read-only invoice GET HTTP 200; `INV2-U92W-76NX-3P2E-AGUZ`, status `DRAFT`, USD 5.00. No sending, reminders, or payments.
- **Independent CI:** Project Baseline CI and Stack CI passed at audited PR HEAD; AG reports 235 unit + 187 PostgreSQL integration tests passed.
- **Not yet verified:** genuine OpenAI API parsing; end-user invoice UI, sends, verified webhooks, hosted demo, and production readiness.
- Hosted demo: _Pending separate owner-approved deployment and full end-to-end verification._
- Demo video (under 3 minutes): _Pending._
- Hackathon deadline: Nov 12, 2026, 12:00 PM PST (Nov 13, 4:00 AM Asia/Manila).
- Public repository: https://github.com/mrdzyn/nudgemyinvoice

## Stack (implemented and planned)

React + Vite + TypeScript (web shell pending design approval); Fastify/Node; Drizzle + **PostgreSQL** (current runtime; SQLite support is undecided); OpenAI Node SDK (`openai`) / Responses API with Zod-validated structured output; PayPal Invoicing REST **sandbox only**; Vitest. **Planned, not yet delivered:** PayPal webhooks, AG Studio (subject to license/design approval), Render hosting, and customer-facing UI. APIMatic PayPal Context Plugin is a coding-time aid, **not** a substitute for runtime authorization or verification.

## Getting started

**Current backend on `main`:** `GET /health`; authenticated operator login/session/logout (`/api/auth/*`); `POST /api/invoice-drafts/parse`, `POST /api/invoice-drafts`, `GET /api/invoice-drafts/:id`, and opt-in `POST /api/invoice-drafts/:id/paypal-draft`. The web app is a placeholder; there is **no usable invoice dashboard** or sending/payment route.

Prerequisites: Node 22+, pnpm 10, local PostgreSQL, a strong server-side `SESSION_SECRET` (at least 32 characters), and `DATABASE_URL`. For normal local development, leave `PAYPAL_DRAFTS_ENABLED=false`; no PayPal credentials or real OpenAI key are needed for deterministic tests and manual entry.

```bash
git clone https://github.com/mrdzyn/nudgemyinvoice.git
cd nudgemyinvoice
pnpm install --frozen-lockfile
cp .env.example .env
# Configure DATABASE_URL, SESSION_SECRET and sandbox-only values privately in ignored .env.
# Initialize a dedicated local PostgreSQL database and apply the seven checked-in Drizzle
# journal migrations (0000-0006) using a migration-aware process; do not replay SQL blindly.
# Provision the single operator securely (NMI_OPERATOR_USERNAME and NMI_OPERATOR_PASSWORD
# via a private process environment; never put the password in a committed file or logs).
pnpm --filter @nmi/api exec -- node --env-file=../../.env --import tsx src/cli/provision-operator.ts
pnpm --filter @nmi/api exec -- node --env-file=../../.env --import tsx src/server.ts
# In another terminal:
pnpm --filter @nmi/web dev
# Local deterministic checks; real PostgreSQL tests require a disposable nmi_test* database:
pnpm validate
TEST_DATABASE_URL=postgres://user@localhost:5432/nmi_test pnpm test:db
```

The verified API launcher is relative to `apps/api` through `pnpm --filter @nmi/api exec --`; plain `pnpm --filter @nmi/api dev` does **not** automatically load the repository-root `.env`. No automatic production migration/deploy path is established. Do not repeat the one-create real Sandbox smoke without a new owner authorization.

## PayPal Developer sandbox setup — for humans and AI agents

### Owner-reported Sandbox setup and verified smoke (2026-10-25 to 2026-10-26)

| Item | Status |
|---|---|
| Environment | **Sandbox** selected; no Live environment was used |
| Product / repository / hackathon name | **NudgeMyInvoice** — unchanged |
| PayPal REST app display name | **`NudgeMyBillsAI`** — successfully created as a **Merchant** app |
| Merchant association | Existing US **Sandbox Business** test account |
| Buyer testing | Existing US **Sandbox Personal** test account identified |
| Invoicing API | **Enabled and saved**; PayPal displayed “Application was saved successfully” |
| Sandbox credentials | Locally configured server-side for the completed smoke; secret values are not published or committed |
| Provider smoke test | **PASS** on 2026-10-26 for exactly one Sandbox DRAFT create/read-only verify; no send or payment |

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

   **Important:** PayPal Sandbox drafting is implemented on `main` but remains **disabled by default**. Credentials are server-only and never required for deterministic tests. Loading the ignored `.env` is explicit: use the verified launcher in Getting started. No Live PayPal endpoint is permitted.
4. Keep `PAYPAL_DRAFTS_ENABLED=false` during ordinary development. The already authorized single-create acceptance ran and its one-request budget is exhausted; **do not repeat it without new owner authorization**. The implemented adapter cannot send invoices, remind buyers, initiate payments, or use Live APIs. Do not deploy or release without separate approval.
5. Report only sanitized acceptance evidence. The real PayPal Sandbox draft acceptance is **PASS based on AG's actual provider execution**; genuine OpenAI parsing remains **NOT TESTED** and mock-provider CI must not be mislabeled as live evidence.

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

Sandbox only. The server enforces authenticated access, Origin/CSRF checks, exact monetary validation, durable fenced draft creation and fail-closed reconciliation. The approval store exists, but **no production grant-issuer or send flow is wired; webhook signature processing remains planned**, not implemented. Model outputs are untrusted. The system does not store payment-card credentials or initiate production payments. See [security boundaries](docs/SECURITY.md).

## License

MIT — see [LICENSE](LICENSE). Third-party dependencies, trademarked services, and external logos retain their own licenses and rights.
