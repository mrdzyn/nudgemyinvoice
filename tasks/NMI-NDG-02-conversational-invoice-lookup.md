# NMI-NDG-02 — Nudgey conversational invoice lookup (C1)

## Provenance and integration base

- **Owner direction:** approved conversational Nudgey ("What are my pending invoices?"), followed by conversational scheduling and optionally human-approved SMTP customer sending.
- **Base:** Draft PR #26 `feat/nmi-ux02-nudgey` at exact SHA `d6e9d7c5f17a230cf0f3b45ea5a9fca63e02ac4e` (NMI-FUP-01 with follow-up scheduling and migration `0007`).
- **Delivery:** stacked Draft PR targeting `feat/nmi-ux02-nudgey`. Do not merge this PR or its parent, deploy, provision, run providers, or authorize sending.
- **Current iteration:** C1 **read-only conversational lookup**; C2 natural-language scheduling is a separate subsequent bounded task; C3 outbound SMTP is a separate future security/owner approval.
- **UI design gate:** extend the existing owner-approved bottom-right Nudgey assistant without replacing its quick actions. New chat interface: message field and a small set of example question chips; compact results cards with safe links to existing records. No full-screen chat product or redesign.

## Goal

A signed-in operator can type natural-language-like questions into Nudgey and get factual, clearly bounded results from their own existing PostgreSQL-backed invoice and follow-up APIs. The assistant is rule-driven in C1: **NO new LLM, AI tool execution, autonomous action, or provider request**. It must never invent invoice states or totals.

## Supported inputs (initial deterministic intent grammar)

1. **"What are my pending invoices?" / "Which invoices need attention?"**
   - Do **not** map the word "pending" to `unpaid`: payment reconciliation is not implemented.
   - Show real, distinct categories based on the existing backend PayPal *operation* groups: **No PayPal draft**, **PayPal draft in progress**, **PayPal Sandbox draft created**, **Needs PayPal attention**. These are not the same thing as payment state.
   - Use the existing server-provided `paypalState` and the filters `none|progress|created|attention`. Never label a PayPal DRAFT as sent, overdue payment, or unpaid.
   - Bound each query/page and disclose **"Showing up to N matching records"** if `nextCursor` exists; do not claim exact all-account counts or sums from a page.
2. **"Show my invoices" / "Show my USD invoices" / "Show my PayPal drafts"**
   - Use the authenticated `session.listInvoices`, request a bounded page, show customer, original currency, exact total, due date, and real PayPal draft operation state.
   - If more records exist, disclose truncation and give an action to open the full AG Grid dashboard.
3. **"Find invoices for Northwind Studio"** (other customer search terms) — use server-side invoice search with `q` in the existing **POST body only**; no customer name or email in query strings, URL hashes, analytics, logs or localStorage.
4. **"Which follow-ups are due?" / "What follow-ups are upcoming?"** — use `session.followUps` / `GET /api/follow-ups` (and a fresh read where appropriate), respecting its current 100-active-item limit. Show actual server states, local date/time with the IANA zone, and a click to open the invoice. Never infer that a due follow-up means an unpaid invoice.
5. **"Is Northwind Studio paid?" / "Show overdue unpaid invoices"** — refuse unsupported payment assertions: explain that verified paid/unpaid information is **not available** until payment webhooks/reconciliation are implemented; offer current saved/PayPal draft details instead. Do not search/scrape PayPal to answer.
6. Unknown or ambiguous command — explain supported examples and offer action chips. No invented account data or fake conversational certainty.

## Behavior and UI contract

- Keep the existing Nudgey launcher, greeting, manual quick actions, Schedule a follow-up form, follow-up badge, and visible Due/Upcoming list intact.
- Add **Ask Nudgey** entry and a small conversational view in the same authenticated popover. Show a prompt field, submit (Enter), and input-safe example chips; an empty or too-long prompt must not invoke APIs. Use a conservative input cap (e.g. 200 chars).
- Results should be structured messages/cards with safe, non-fabricated values and an **Open invoice** action through the existing real-mode dispatch. Navigation must honor existing leave guards; no direct demo/fixture navigation.
- No writes from C1 chat. "Schedule a follow-up" in C1 may open the **existing** manual scheduler, but date/customer extraction and a scheduled POST must **not** be silently performed from text.
- State should live only in the active authenticated React workspace. Clear on logout/session expiry; no browser persistence, server-stored transcripts, new cookies, analytics, or telemetry of free-text queries.
- Abort stale requests on a new question, close, sign-out or navigation; never render a late response for a prior session or question. 401 must expire the session; 403/offline/malformed/5xx show honest errors. Neither errors nor results should expose credentials.
- Use existing tokens; preserve focus semantics, Esc/close behavior, keyboard/touch, narrow-screen placement above mobile navigation, reduced motion and light/dark modes. Announce responses appropriately to assistive tech without repeating giant lists.
- Avoid hidden API work when the chat is closed. Search and render only after explicit operator input.

## Data API and safety

- Reuse `POST /api/invoice-drafts/search` via `session.listInvoices` for customer names/status filters and real results. That route already binds operator scope, CSRF and exact Origin, and keeps search text out of the URL. Do not create an alternate public query endpoint.
- Reuse authenticated `GET /api/follow-ups` through the existing controller; do not manually invent due/upcoming or query unbounded tables.
- No direct invoice payment-state inference, no cross-currency sum, no new model calls, no SMTP/PayPal sends, no webhooks, no provider secrets, no migrations or new dependencies.
- Distinguish **PayPal draft creation state** from actual invoice sending/payment status on every result.
- Account for invoice API page limit 50 and follow-up limit 100. Never make misleading global counts. If the requirement for exact counts becomes necessary, create a separate narrowly scoped server endpoint only under a separately reviewed task.

## Required focused validation / stop rule

1. Deterministic intent parser tests for matching, false positives, currency codes, unknown requests, overly long prompts, unsupported payment claims.
2. Read-only transport/controller tests: correct status-filter and `q` POST bodies, paging/truncation, stale request cancellation, 401 lock, 403/offline/server error, no pay-provider or external request, no transcript persistence.
3. Render tests: mocked server-backed invoices/follow-ups, empty/no-match state, escaping markup, correct semantic status labels, no cross-currency totals, safe action navigation, accessibility.
4. One local no-provider browser walkthrough: ask "What are my pending invoices?", search a seeded customer, ask due follow-ups, then open an invoice; exercise narrow viewport if practical.
5. Run the smallest task tests, typecheck/lint/format and mandatory hosted CI at exact HEAD. **Do not repeat real OpenAI, PayPal OAuth, Sandbox invoice create, or any Gate A/B acceptance tests.** Do not provision accounts, databases outside disposable tests, SMTP or Render.
6. Independent exact-HEAD review of read boundaries, data attribution, auth/session leaks, correct status semantics, UI focus and pagination truthfulness. Stop for owner review; do not merge.

## C2 next (not in C1)

Natural-language scheduling command such as "Remind me to follow up with Northwind tomorrow at 9 AM" should parse a **candidate** invoice/time using the operator's IANA zone, disambiguate multiple invoices, and **pre-fill the existing Nudgey scheduler**. All editing and final POST to `/api/follow-ups` remain under explicit human review/Save. No new notification or backend worker. Implement via separate task/PR after C1 has passed review.

## C3 later (not authorized)

SMTP integration needs a separate decision on whose address is notified (operator vs customer), sender/domain, delivery provider and SMTP auth approach, safe secret storage and restricted egress, one-time resource/action/payload-bound human approval for customer-facing send, deduplication/idempotency, audit, delivery failures, retention and deliverability. No background or autonomous email scheduling in C1/C2.

## C1 implementation record (stacked Draft PR #27)

**State:** implemented and validated; **awaiting independent exact-HEAD review**. Nothing merged, deployed or authorized beyond read-only lookup.

- **Files:** `apps/web/src/nudgey/{intent,lookup,chatSession,useChat}.ts`, `NudgeyChat.tsx` (view + cards), Nudgey wiring (`components/Nudgey.tsx`: new **Ask Nudgey** action and view; scheduler and quick actions unchanged), `FollowUpsController.readFresh(signal)`, CSS using existing tokens. **No** backend, migration, dependency, PayPal, OpenAI, SMTP or network-client change.
- **Intents (deterministic):** pending invoices (four PayPal **draft** groups: No PayPal draft / in progress / draft created / needs attention, one bounded request per group, 5 each), list by currency and/or PayPal draft state (10 per answer), customer search (`q` only in the POST body), follow-ups due / upcoming / all (a fresh `GET /api/follow-ups`), payment questions (refused truthfully, no request), and help for everything else. Any request to change, send, remind, schedule, cancel or mark something is **help**, never an action. Prompts are capped at 200 characters; empty, over-long or control-character prompts make no request.
- **Truthfulness:** every answer says PayPal draft state is not payment status; no result calls an invoice paid, unpaid or overdue; due follow-ups are described as reminders; amounts are shown per invoice in their own currency and never summed; truncation is disclosed ("Showing up to N records; more exist") and offers the full dashboard.
- **Lifecycle:** the conversation exists only in memory in the signed-in workspace; it is cleared when Nudgey closes, on Back, on sign-out/session expiry (the workspace unmounts), and on a 401. A new question aborts the previous lookup; late answers for aborted questions are never rendered. Navigation uses the existing real-mode `open-saved` / dashboard dispatch (leave guards apply). No browser storage, URL, cookie or log carries the text.
- **Accessibility:** labelled input and buttons, example chips as real buttons, transcript `role="log"` with `aria-live="off"` plus a one-sentence polite announcement per answer (never the list), accessible names on every "Open invoice", focus moves to the input on entry, Esc/close unchanged, 44px targets, narrow-screen placement above the mobile nav verified in the browser.

**Validation:** `pnpm validate` PASS; 655 web tests incl. 42 new (intent grammar and false positives, read-only request shapes and filters, truncation, partial failure, 401/403/offline/5xx, stale/abort, no storage, render/escaping/labels, controller `readFresh`); real-browser walkthrough `design/evidence/NMI-NDG-02/run-conversational-journey.mjs` **29/29** (headless Chrome, zone emulated, production build with strict CSP, disposable PostgreSQL 16, no provider configured, narrow 390px viewport); hosted CI on the PR head. Gate A/B, OAuth and real-provider tests were **not** repeated.

**Known limits (by design, for review):** counts come from bounded pages (never claimed as totals); "PayPal drafts" means drafts **created** in Sandbox; free-text questions are matched by rules, so unusual phrasing gets the help message rather than a guess; follow-up answers are limited to the server's 100 active items (disclosed).
