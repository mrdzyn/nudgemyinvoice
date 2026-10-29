# NudgeMyInvoice — Devpost submission draft (NOT SUBMITTED)

> Draft text for the owner to review. Nothing here has been submitted or published. Statements marked **[verified]**, **[simulated]**, **[not verified]** or **[owner to confirm]** must stay accurate: do not remove the markers by promoting a claim. Do not add metrics, sponsorship, awards or capabilities that the repository does not demonstrate.

## Project name
NudgeMyInvoice

## Tagline
An AI invoice assistant for freelancers: describe it, review it, save it, and create a PayPal Sandbox draft — with a human in control.

## Problem and target users
Freelancers and tiny studios who invoice in several currencies lose time re-typing client requests into invoices, and small arithmetic or currency mistakes are costly. They want speed without handing money decisions to an AI.

## What was built
A working web application (React + Fastify + PostgreSQL) in which a single authenticated operator can:
1. describe an invoice in natural language and receive a **structured proposal** (OpenAI Responses API integration with strict schema validation; manual entry always available);
2. **review and edit** every field (the model never calculates money; totals are computed by the server in integer minor units);
3. **save** the invoice to PostgreSQL (idempotent, audited) and see it on a real **dashboard** with filters, search and per-currency summaries (never mixed across currencies);
4. open a saved invoice and, after an **explicit confirmation**, create a **PayPal Sandbox DRAFT** invoice; see its validated state and re-read the durable server state.

It does **not** send invoices, collect payments, send reminders or process webhooks.

## How it works
Browser (React) → same-origin `/api` → Fastify → PostgreSQL. The AI output is untrusted: schema-checked, re-validated against the strict domain schema, totals recomputed. PayPal draft creation goes through a durable, fenced operation state machine (`pending → creating → created | rejected | unknown | mismatch`) that reserves one operation per invoice before any external call, never re-creates blindly after an uncertain outcome, reconciles by a deterministic invoice number, and verifies the remote DRAFT (currency, total, due date, number, reference) before claiming success.

## PayPal APIs used
PayPal **Invoicing v2** (Sandbox only): OAuth token, create DRAFT invoice, show invoice, and search by invoice number for reconciliation. The adapter exposes no send, remind, cancel, refund, capture or payment operation, and refuses any non-Sandbox host.
- **[verified, historical]** one real Sandbox create + read-only show on 2026-10-26 (backend only, fictitious USD 5.00, DRAFT status).
- **[not verified]** search/reconciliation/timeout/error behaviour against the real Sandbox, and a complete real-provider browser journey. These paths are covered by deterministic fake-transport and PostgreSQL tests.

## AI provider / model used
OpenAI **Responses API** via the official `openai` SDK, structured output validated with Zod. **[not verified]** against the real provider: no live OpenAI request has been run; the parser is tested with deterministic fake models. Model: **[owner to confirm]** — the repository has no default (`OPENAI_MODEL`); the proposed acceptance model is `gpt-6-luna`, but **do not name it as used or verified** unless `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` Gate A is REAL PASS (then say exactly: "real parsing verified once on two synthetic inputs on <date>"). Wording matrix: acceptance doc section 7.

## Architecture
`apps/web` (React/Vite/TypeScript), `apps/api` (Fastify, strict Zod boundaries), `packages/db` (Drizzle + PostgreSQL), `packages/shared` (exact money, schemas), `packages/ai` (parser), `packages/paypal` (allow-listed Sandbox adapter), `packages/domain` (approval gate). Monetary values are decimal strings / integer minor units; no floating-point money.

## Security and privacy
Single operator, server-side sessions (HttpOnly cookie), Origin + CSRF checks on every mutation, login throttling, owner-scoped reads and writes, strict CSP (`connect-src 'self'`), redacted structured logs, credentials only server-side. Money-moving actions are **never** triggered by AI or background jobs; a draft is created only after an explicit human confirmation. Known limits: sessions throttling is in-memory; an HTTPS deployment (`__Host-` cookie, proxy log redaction of the search query) has **not** been tested.

**Where customer data can and cannot appear (precise):**
- **Browser navigation URL and history:** no customer data.
- **Persistent browser storage** (localStorage, sessionStorage, IndexedDB, cache): no customer data.
- **HTTP request URL of the dashboard search:** the search text **is** sent to the server in the `q` query parameter of `GET /api/invoice-drafts?...` (it may be a customer name, e-mail address or invoice-id prefix).
- **Fastify (API) logs:** query strings are stripped; only URL paths are logged.
- **Reverse-proxy, ingress, CDN/WAF and platform access logs:** **unverified** (no hosted deployment was tested). Redacting or omitting the query string of `/api/invoice-drafts` there is a **deployment prerequisite** before any hosted use.

## Challenges and lessons
- Making "unknown" a first-class outcome: an aborted request or timeout does not prove the server stopped, so the UI never retries blindly and re-reads durable state.
- Multi-currency without FX: one currency per invoice, per-currency summaries only, exact decimal arithmetic.
- Several issues were found only by driving the real browser against a real server (for example validator mismatches with stored error codes), which is why the project keeps a real-browser journey for each integration.

## Accomplishments
- A complete, reviewed flow from natural-language proposal to a verified PayPal Sandbox DRAFT, with every step covered by tests (hundreds of unit and PostgreSQL tests plus real-browser journeys with deterministic provider fakes).
- Safety properties proven by negative controls (ownership isolation, fenced single creation, fail-closed read-back).
*(Do not add numbers beyond what `docs/STATUS.md` reports at submission time.)*

## What's next
Human-approved invoice sending, signature-verified payment webhooks and reconciliation, overdue detection with AI-drafted (never auto-sent) reminders, multi-user accounts, hosted deployment, real-provider acceptance runs.

## Built with
React, Vite, TypeScript, Fastify, Drizzle ORM, PostgreSQL, Zod, Vitest, OpenAI Responses API **[integration implemented; not verified live]**, PayPal Invoicing v2 (Sandbox), **AG Grid Community** (MIT) for the saved-invoice grid (sortable and resizable columns, custom cells and a status renderer, themed to light and dark under a strict Content-Security-Policy). *Sponsor tools:* the README lists an APIMatic Context Plugin for PayPal as a coding-time aid **[owner to confirm it was actually used before listing it]**; AG Grid Community **is used** in the app (independently audited and merged in PR #17 on `main` at `2d5a7034`; no Enterprise/Studio); AG Studio and AG Grid Enterprise were **not** used; using AG Grid makes the entry eligible for sponsor consideration under the rules, which is not a claim of selection or a prize; Render was **not** used (no deployment). Do not list a tool the project did not use.

## Links
- GitHub: https://github.com/mrdzyn/nudgemyinvoice (public, MIT license visible in the repository)
- Demo video (YouTube, public, < 3:00): **[placeholder — not recorded or uploaded]**
- Try it: see "Demo access instructions".

## Demo access instructions (for the Devpost testing-instructions field)
No hosted deployment. Follow `docs/NMI-DEMO-JUDGE-RUNBOOK.md` (clean-clone tested): install Node ≥ 22, pnpm 10 and PostgreSQL 16, then either run the **SIMULATED evaluation mode** (no credentials; OpenAI and PayPal are stand-ins and no provider request is made) or configure **your own** OpenAI key and PayPal **Sandbox** app. The owner's credentials are never shared. A one-command automated check reproduces the full workflow: `node design/evidence/NMI-DEMO-R0/run-e2e-journey.mjs`.

## Eligibility and compliance (owner to confirm)
Original work; open-source MIT license; Sandbox only; no real customer data; no unlicensed assets. The official rules (https://paypalaihackathon.devpost.com/rules) were independently retrieved and verified by the independent reviewer: repository setup/run instructions **or** a hosted demo satisfy the functional-access requirement, and a public open-source repository/license and a public YouTube video under 3 minutes are required. Eligibility, team/account and sponsor-tool questions, and every other criterion, remain the owner's to confirm; this draft makes no claim about them.

## Provider evidence status for the submission text (R1)

| Item | Today | After a gate (only if REAL PASS, quote run ID/date) |
| --- | --- | --- |
| Real OpenAI parsing | **[not verified]** — Gate A PENDING | "verified once, two synthetic inputs" |
| New PayPal Sandbox DRAFT via browser | **[not verified]** — Gate B PENDING and **BLOCKED** pending a PayPal client fix (historical backend USD 5.00 draft **[verified, historical]**) | "one Sandbox DRAFT created and verified through the browser path" |
| Real-provider end-to-end walkthrough | **[not verified]** — Gate C PENDING | label each video segment LIVE or SIMULATED |
Do not describe simulated runs, fake providers or fixtures as live. Do not publish a result that is not in a filled, owner-reviewed template.
