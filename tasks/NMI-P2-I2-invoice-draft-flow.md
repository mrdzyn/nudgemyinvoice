# NMI-P2-I2 — Authenticated AI Invoice Drafts and PayPal Sandbox Draft Creation

- **State:** **ACCEPTED AND SQUASH-MERGED** on 2026-10-26. Independent GPT-6 C6 exact-head review **PASS (scoped)** at `4982201918d0030234fdbabbc297375c02c01e5d`; PR #4 merged as `07409bf32068362b9f5b711b64ef0399d588169e`. Genuine PayPal Sandbox create/read-only verification **PASS** per AG evidence `NMI-P2-I2-SANDBOX-SMOKE-01`; genuine OpenAI provider parsing **NOT TESTED**.
- **Owner/orchestrator:** project owner / ChatGPT
- **Implementation agent:** Antigravity (replacing Claude Code)
- **Independent auditor:** ChatGPT GPT-6 (replacing Codex)
- **Baseline:** `main` at `9ebc1912e96b158b906b849cf1dc2b48cbf3c875` (PR #3 NMI-P2-I1 squash merged after independent C3 PASS).
- **Historical implementation branch:** `phase-2/nmi-invoice-drafts-i2` (PR #4 merged following separate owner authorization). Documentation synchronization continues in Draft PR #5; no further merge or deployment authorized.
- **Type / design gate:** Backend/API + PostgreSQL + sandbox adapter + tests only. **UI design gate: Not applicable to this increment.** `design/nmi-p1/SCREENS.md` is still DRAFT and not approved. No business UI or AG Studio dependency may be implemented under this task.

## Goal and user journey

Deliver the first genuine, demo-ready **backend** journey:
1. Authenticated operator submits a 0–2,000-character invoice request.
2. Existing `@nmi/ai` OpenAI Responses parser produces a **proposal** (draft, clarification, invalid, or unavailable/manual fallback), validated by `@nmi/shared` money and invoice schemas. No model-controlled execution.
3. Operator explicitly reviews/submits a corrected structured draft (manual entry also works without an OpenAI key). Save it atomically with its line items and exact-money amounts in PostgreSQL.
4. Operator explicitly requests creation of a matching **PayPal sandbox draft**, with a durable retry/idempotency state, and receives a sandbox draft ID. **Never send or notify the recipient**.

A PayPal sandbox create-draft operation is an external write, but does not send an invoice. It is permitted only as a separately requested, authenticated, server-authorized draft action; never triggered automatically by AI parsing or draft save. This task grants **no** privileged send/cancel/remind/refund/capture/mark-paid execution or approval-issuer route.

## Existing contracts / implementation strategy

- Reuse `packages/ai/src/client.ts` (`createOpenAIInvoiceClient`, `store:false`) and `parser.ts`; do not add a second AI provider or let OpenAI produce totals or tool commands.
- Reuse `packages/shared/src/invoice.ts` for strict Zod validation, decimal-string / integer-minor-unit totals and per-invoice supported ISO currency.
- Reuse `packages/db/src/schema.ts` invoices/invoice_items; add only the minimal forward migration(s) for durable draft state, PayPal-create idempotency/reservation and persistence needs. Preserve migrations `0000`–`0004` byte-for-byte.
- Reuse Phase 2 I1 session auth, CSRF + Origin enforcement, `TrustedActor` boundary, audit sink, PayPal sandbox config guard and existing `PayPalInvoicingReadDraft` abstraction. Keep `PayPalInvoicingPrivileged` unimplemented/unwired.
- Use PostgreSQL (only supported runtime currently); the separate owner decision on adding SQLite is not approved. Do not build a second schema or infer owner acceptance of a permanent dual-dialect policy.
- Use an explicit feature/config switch for **real** PayPal sandbox calls and fail closed if credentials are absent; never fake success, never fall back to live PayPal. Dry-run and fake-client tests must be clearly distinguished from genuine sandbox evidence.

## API contract (names may be minimally adapted to existing conventions; document exact final names)

- `POST /api/invoice-drafts/parse`: authenticated + CSRF/Origin protected; strict text-length body validation; returns the existing discriminated `ParseOutcome`; derives reference date at the server and documents timezone; rate/cost bound; honors no-OpenAI-key manual fallback, bounded provider timeout, no raw provider errors or request text in logs.
- `POST /api/invoice-drafts`: authenticated + CSRF/Origin protected; only a strict, validated `InvoiceDraft` is accepted; server recomputes totals, converts minor-unit money exactly, persists invoice and its items **in a single transaction**, emits sanitized audit event. Never trusts client/model totals or status.
- `GET /api/invoice-drafts/:id`: authenticated; returns local draft detail and safe state; no raw token, SDK payload or provider secret. Optional bounded list endpoint only if needed for demo integration.
- `POST /api/invoice-drafts/:id/paypal-draft`: authenticated + CSRF/Origin protected; requires explicit operator action; validates local draft unchanged and not already linked, records a **durable** idempotency key/intent and operation state before contacting PayPal; uses sandbox-only REST OAuth and `POST /v2/invoicing/invoices`. Map amount/quantity/tax/discount/due date correctly or refuse a mapping that cannot preserve exact totals, never silently modify payable amount. Persist returned PayPal ID uniquely. Unclear remote outcomes must be reconciled before retrying; no blind duplicate creation. Query `GET /v2/invoicing/invoices/{id}` where appropriate to verify the created draft's currency/total/status before claiming success.

All routes require a verified server-side session. The existing global Origin and session middleware apply. Any new feature flag must default disabled on missing configuration. No routes that execute a send or a customer notification.

## PayPal sandbox adapter and external boundary

- Implement a production-shaped `PayPalInvoicingReadDraft` client in `@nmi/paypal` with injectable HTTP transport for deterministic tests.
- Credentials are server-only `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, minted into sandbox OAuth access tokens with expiry-aware reuse. Never expose keys/tokens, use TLS to exact `api-m.sandbox.paypal.com`, reject host override/redirect off allowed origin, bound request size/timeouts. No OAuth success assumed in CI.
- Official reference: https://developer.paypal.com/api/invoicing/v2/ ; sandbox draft `POST /v2/invoicing/invoices` is separate from `POST /v2/invoicing/invoices/{id}/send`. Use a persisted stable `PayPal-Request-Id` for retries (https://developer.paypal.com/api/make-api-requests). No send endpoint available in this adapter.
- Match the invoice one-currency model; validate returned `DRAFT`, invoice ID and expected currency/total with explicit error states. Ensure duplicate POSTs and concurrent requests cannot create duplicate drafts or double-link IDs. In ambiguous timeout/5xx cases keep a recoverable pending state rather than inventing success.

## AI/data/privacy boundaries

- Provider output remains **untrusted** and undergoes model-schema + domain-schema validation. AI proposals cannot update persisted invoice/payment states or call PayPal.
- Do not send credentials, session cookies, PayPal IDs, real customer data or production records to the LLM. Use synthetic test/demo data; document that text entered for parsing is sent to OpenAI and use `store:false`.
- Return clarification requests for missing/ambiguous currency, line items, customer and due date. Do not guess currency for a bare `$`, invent a due date or FX conversion, or mix currencies.
- Server owns invoice IDs, exact totals, audit actor identity and creation state. No raw prompt, customer email or tokens in audit/logs.

## Test objective / acceptance

**Primary objective:** prove that a validated proposal can be saved exactly as a local draft, and an explicit authenticated action can create **at most one matching PayPal sandbox draft**, without any notification or privileged PayPal action.

- [x] Parse route: 401 without session, 403 for CSRF/Origin bypass, 400 for malformed/overlong input, correct `needs_clarification`, `invalid`, `draft`, provider unavailable/manual fallback. Mocked-model path deterministic.
- [x] Local save: strict schema, same money/currency/tax/discount numbers before and after a real PostgreSQL round trip; line items and invoice inserted transactionally, rollback on failure; duplicate/idempotent client request behavior defined.
- [x] 2+ currencies (e.g., USD/EUR) retained independently; supported fractional quantities and money scaling, rounding, tax and discount consistency; no summed cross-currency total.
- [x] Sandbox client: fake-HTTP OAuth and create-draft responses; exact endpoint/host, request headers and body, parsed remote ID/status, controlled timeouts/retries and secret redaction.
- [x] Durable create intent: two concurrent requests / double-click / replay produce at most one external create; after timeout, uncertain state is detectable and retry/reconciliation is safe. Stable `PayPal-Request-Id` preserved. Never claim a draft exists without a verified remote reference.
- [x] Network fakes prove no calls to `/send`, `/remind`, `/cancel`, `/payments`, `/refunds` or production host. Reject any attempt to use model/tool text to trigger an external call.
- [x] Existing auth, credential-rotation races, rate-limiter, approval concurrency and audit integrity tests stay green; migration rollback/upgrade safety and previously committed migrations preserved.
- [x] Pure unit/integration CI without real secrets or network passes (235 unit + 187 real PostgreSQL integration tests, 422 total per AG; two hosted CI workflows independently confirmed at audited HEAD).
- [x] Optional owner-authorized genuine PayPal Sandbox DRAFT smoke **PASS** on 2026-10-26: OAuth 200, one create 201, show 200; DRAFT USD 5.00, date/number/reference matched; no sending/payment; feature flag disabled afterward. Evidence: `NMI-P2-I2-SANDBOX-SMOKE-01` (AG provider execution; not an independent provider-account query).
- [ ] Genuine OpenAI Responses provider parsing smoke **NOT TESTED**; deterministic fake-model parser tests PASS. This is an explicitly deferred gate, not a claim of full provider completion.
- [x] No UI, PayPal send, live transaction, webhook, deployment or release performed.

## Delivery / reviews

Read the canonical repo startup files, task and active handoff, and only relevant source/tests. Implement directly on the existing Draft branch, not a new PR. Use the pinned pnpm + frozen lockfile and disposable PostgreSQL 16; targeted tests plus required manual set (project profile, lint, format, typecheck, unit, real DB tests, build, secret scan, dependency audit, migration synchronization, diff checks). Record exact head, counts, missing runs and CI status accurately. Running hosted PR checks is allowed, but does not authorize merge.

Implementation was independently audited at the **exact** final PR #4 SHA by GPT-6; the owner subsequently accepted and separately authorized the squash merge. Follow-up documentation resides in Draft PR #5, independently reviewed before any further merge. No deployment/release.

## Explicitly deferred

Human grant **issuance and actual PayPal send**, verified webhook receipt/reconciliation, browser application shell (awaits design approval), AG Studio licence, scheduling and overdue reminders, production PayPal, credentials in repository, and deployment. These may be separately planned after I2 independently passes.

## Implementation record (Claude, NMI-P2-I2)
- **Final endpoint names:** `POST /api/invoice-drafts/parse`, `POST /api/invoice-drafts` (optional `Idempotency-Key`), `GET /api/invoice-drafts/:id`, `POST /api/invoice-drafts/:id/paypal-draft`.
- **Key design finding:** PayPal documents `PayPal-Request-Id` for some Invoicing endpoints but not for create-invoice (published OpenAPI schema), so it is sent but not relied on; exactly-once creation rests on a durable fenced operation row, a deterministic `invoice_number`/`reference`, reconcile-before-retry, a cool-off, and verification of the remote draft.
- **Deviation / decision for the owner:** drafts whose totals depend on rounding (some tax/discount combinations, sub-cent line products) are *refused* instead of mapped, because PayPal's rounding is unverified. Relax only after a live sandbox smoke proves PayPal's rounding.
- **Provider evidence boundary:** simple USD 5.00 draft creation and GET verification were genuinely exercised in Sandbox; rounding-dependent discount/tax mappings, search/reconciliation, duplicate-number behavior, delayed indexing and error paths were not verified against PayPal's live Sandbox API. See `docs/SECURITY.md`.
- Migration `0005` is forward-only; `0000`-`0004` byte-identical. No UI, send, webhook, deployment or release.

## Closure record (2026-10-26)
- **Owner accepted:** NMI-P2-I2 backend-only increment; [acceptance comment](https://github.com/mrdzyn/nudgemyinvoice/pull/4#issuecomment-6416498360).
- **Audited implementation:** `4982201918d0030234fdbabbc297375c02c01e5d`; [PR #4](https://github.com/mrdzyn/nudgemyinvoice/pull/4) squash-merged as `07409bf32068362b9f5b711b64ef0399d588169e`.
- **Evidence:** exact-head CI and C6 audit PASS; AG reports 422 passing automated tests and real Sandbox draft smoke `NMI-P2-I2-SANDBOX-SMOKE-01` PASS.
- **Not accepted:** real OpenAI provider test, material UI, privileged PayPal sending/payment actions, webhooks, deployment or production release. Further external draft creation requires new authorization.
