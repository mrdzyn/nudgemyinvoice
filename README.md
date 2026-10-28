# NudgeMyInvoice

**The AI invoice assistant that helps freelancers get paid—across currencies, with humans in control.**

> Hackathon MVP — PayPal **sandbox only**. Not a production payment service; no escrow, automatic refunds, or autonomous sending.

## What is implemented, what is verified, what is not

The status below reflects `main` after NMI-UI-01C5-P1. Evidence is labelled honestly: tests and browser journeys use **deterministic fake providers** and are not real-provider acceptance.

### IMPLEMENTED (working application, `main`)
- **Operator authentication:** single operator, server-side sessions (HttpOnly cookie), Origin + CSRF checks on every mutation, login throttling, immediate lock on sign-out.
- **Real React invoice composer** with natural-language drafting, a clarification loop and an always-available **manual entry fallback**.
- **OpenAI Responses parsing integration** (`POST /api/invoice-drafts/parse`): structured output validated with Zod and re-validated against the strict domain schema; totals computed by the server, never by the model.
- **Human invoice review:** every field editable; nothing is saved until the operator saves.
- **PostgreSQL persistence:** idempotent, audited save (`POST /api/invoice-drafts`) with exact integer minor-unit money.
- **Multi-currency invoices:** one currency per invoice; per-currency summaries; no FX and no mixed-currency total.
- **Real invoice dashboard:** owner-scoped, paginated list with server-side filters and search (`GET /api/invoice-drafts`) and read-only saved-invoice pages.
- **PayPal Sandbox DRAFT UI:** explicit confirmation dialog, single request per confirmation, strict response validation, durable read-back and a read-only *Check status*.
- **Safe operation reconciliation:** a durable fenced state machine (`pending → creating → created | rejected | unknown | mismatch`); an uncertain outcome is never retried blindly.
- **Ownership and CSRF protections:** owner-scoped reads/writes (including PayPal draft creation), strict CSP, no customer data in browser storage.

### VERIFIED AGAINST REAL PROVIDERS
- **Historical backend PayPal Sandbox one-create smoke only** (`NMI-P2-I2-SANDBOX-SMOKE-01`, 2026-10-26): real OAuth 200, one invoice-create 201, one read-only show 200; fictitious USD 5.00; DRAFT; no send/remind/pay. That one-create budget is exhausted.
- **No real OpenAI Responses verification.**
- **No complete real-provider browser journey.**
- PayPal search/reconciliation/timeout/error paths and the whole UI were exercised only with deterministic fakes and disposable PostgreSQL. Do not read those results as real-provider acceptance.

### NOT IMPLEMENTED
- Invoice **sending**; **payment collection**; **automatic customer reminders**; **payment webhooks / payment reconciliation**; **production multi-user support** (the database allows exactly one operator); any **live PayPal** operation (the server refuses non-Sandbox hosts).

**Multi-currency means managing invoices in multiple supported currencies, not foreign-exchange conversion or a mixed-currency grand total.**

## Status and demo

- **Submission readiness (NMI-DEMO-R0):** [judge runbook](docs/NMI-DEMO-JUDGE-RUNBOOK.md) (clean-clone tested, simulated and own-credentials modes), [deployment decision](docs/NMI-DEMO-DEPLOYMENT-DECISION.md), [real-provider acceptance plan](docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md) (not executed), [video script](docs/NMI-DEMO-VIDEO-SCRIPT.md), [Devpost draft](docs/NMI-DEMO-DEVPOST-DRAFT.md) and [checklist / release blockers](docs/NMI-DEMO-SUBMISSION-CHECKLIST.md). Exact current state: [`docs/STATUS.md`](docs/STATUS.md).
- **Hosted demo:** none. Judges evaluate through setup instructions (no private credentials needed).
- **Demo video (under 3 minutes):** _not recorded or uploaded yet._
- **Hackathon deadline:** Nov 12, 2026, 12:00 PM PST (Nov 13, 4:00 AM Asia/Manila). Judging runs to Dec 15, 2026.
- Public repository: https://github.com/mrdzyn/nudgemyinvoice

## Stack

React + Vite + TypeScript (native accessible UI; AG Studio **not** used); Fastify/Node; Drizzle + **PostgreSQL** (the only supported database); OpenAI Node SDK (`openai`) / Responses API with Zod-validated structured output; PayPal Invoicing v2 REST **Sandbox only**; Vitest. Not built: PayPal webhooks, hosting (Render or otherwise), invoice sending. The APIMatic PayPal Context Plugin is a coding-time aid, **not** a substitute for runtime authorization or verification.

## Getting started

Full, tested instructions: **[docs/NMI-DEMO-JUDGE-RUNBOOK.md](docs/NMI-DEMO-JUDGE-RUNBOOK.md)**. Summary:

Prerequisites: Node ≥ 22, pnpm 10, PostgreSQL 16, a random `SESSION_SECRET` (≥ 32 characters) and `DATABASE_URL`. No provider credentials are needed to run or evaluate the app: without them parsing falls back to manual entry, PayPal drafting is off, and a clearly labelled **SIMULATED evaluation mode** (test-only launcher, no provider requests) runs the whole workflow.

```bash
git clone https://github.com/mrdzyn/nudgemyinvoice.git && cd nudgemyinvoice
pnpm install --frozen-lockfile
# Create a throw-away PostgreSQL database, set DATABASE_URL, then apply the seven migrations in journal order:
for t in $(node -e 'console.log(JSON.parse(require("fs").readFileSync("packages/db/migrations/meta/_journal.json","utf8")).entries.map(e=>e.tag).join(" "))'); do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "packages/db/migrations/$t.sql"; done
# Provision the single operator (password from the environment, never printed or committed):
NMI_OPERATOR_USERNAME=judge NMI_OPERATOR_PASSWORD='<choose one>' pnpm --filter @nmi/api provision-operator
# Start the API (needs SESSION_SECRET, DATABASE_URL, WEB_ORIGIN=http://localhost:5173) and the web app:
pnpm --filter @nmi/api start          # API on :3001
pnpm --filter @nmi/web dev            # open http://localhost:5173
pnpm validate                         # lint, format, typecheck, tests, build, bundle scan
```

`pnpm --filter @nmi/api start` reads the process environment (it does not load `.env` by itself). Real PostgreSQL integration tests need a disposable database whose name starts with `nmi_test`: `TEST_DATABASE_URL=postgres://user@localhost:5432/nmi_test pnpm test:db`. Do not repeat the one-create real Sandbox smoke without a new owner authorization.

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

   **Important:** PayPal Sandbox drafting is implemented on `main` but remains **disabled by default**. Credentials are server-only and never required for deterministic tests. Server processes read their environment; load an ignored `.env` explicitly if you use one (for example `node --env-file=.env`). No Live PayPal endpoint is permitted.
4. Keep `PAYPAL_DRAFTS_ENABLED=false` during ordinary development. The already authorized single-create acceptance ran and its one-request budget is exhausted; **do not repeat it without new owner authorization**. The implemented adapter cannot send invoices, remind buyers, initiate payments, or use Live APIs. Do not deploy or release without separate approval.
5. Report only sanitized acceptance evidence. The real PayPal Sandbox draft acceptance is **PASS based on AG's actual provider execution** (`NMI-P2-I2-SANDBOX-SMOKE-01`: one USD 5.00 line item, no tax, no discount, one create, one show); genuine provider search, reconciliation, timeout, and error paths are mock-tested only, not verified against live PayPal Sandbox responses. Genuine OpenAI parsing remains **NOT TESTED** and mock-provider CI must not be mislabeled as live evidence.

References: [PayPal REST authentication](https://developer.paypal.com/api/rest/authentication), [API base URLs](https://developer.paypal.com/api/make-api-requests), [Invoicing v2](https://developer.paypal.com/api/invoicing/v2/).

**AI agent operating rule:** Before repository changes, read [`AGENTS.md`](AGENTS.md), [`docs/STATUS.md`](docs/STATUS.md), [`config/project-profile.json`](config/project-profile.json), and the active task/handoff. This README is onboarding context, **not authority** to create a duplicate app, inspect or reveal secrets, run live provider operations, enable draft writes, merge, deploy or release. An authenticated PayPal browser session does not imply permission to execute API calls.

## Safe demo script

1. Sign in, then enter: `Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15` (SIMULATED parser in evaluation mode; your own OpenAI key otherwise).
2. Review and edit the proposal; save it (PostgreSQL). Open it from the dashboard.
3. Optionally create a second invoice in EUR; the dashboard keeps USD and EUR separate.
4. Explicitly confirm *Create PayPal Sandbox draft…*; observe the validated DRAFT and the refreshed durable state. The customer is not emailed and nothing is sent or paid.

Sending, paying through a buyer flow, verified webhooks and AI-drafted overdue nudges are **not implemented**. All company names, invoices, customer details and amounts in the demo are fictitious.

## Docs

- [Product](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md) · [Hackathon plan](docs/HACKATHON-PLAN.md) · [Status](docs/STATUS.md)
- [Judge runbook](docs/NMI-DEMO-JUDGE-RUNBOOK.md) · [Submission checklist](docs/NMI-DEMO-SUBMISSION-CHECKLIST.md)
- [Agent operating rules](AGENTS.md) · [Initial task contract](tasks/NMI-P0-bootstrap.md)

## PayPal and tools

- PayPal Invoicing REST API: https://developer.paypal.com/docs/invoicing/
- PayPal webhook integration: https://developer.paypal.com/api/rest/webhooks/
- APIMatic Context Plugin for PayPal: https://context.apimatic.io/plugins/paypal/
- Render: https://render.com/
- AG Studio: https://www.ag-grid.com/studio/react/quick-start/

## Security and release scope

Sandbox only. The server enforces authenticated, owner-scoped access, Origin/CSRF checks, exact monetary validation, durable fenced draft creation and fail-closed reconciliation (reconciliation, search, and error paths are verified with deterministic mock transports and PostgreSQL tests; only single happy-path draft creation and GET verification were exercised against genuine PayPal Sandbox). The approval store exists, but **no production grant-issuer or send flow is wired; webhook signature processing is not implemented**. Model outputs are untrusted. The system does not store payment-card credentials or initiate production payments. See [security boundaries](docs/SECURITY.md).

## License

MIT — see [LICENSE](LICENSE). Third-party dependencies, trademarked services, and external logos retain their own licenses and rights.
