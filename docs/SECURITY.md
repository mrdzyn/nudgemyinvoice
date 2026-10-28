# Security and Privacy Baseline

## Purpose

This document defines the minimum security and privacy expectations for projects created from this template. Replace and extend it based on the product's threat model and data classification.

## Core rules

- Never commit secrets, credentials, tokens, private keys, production datasets, or sensitive local configuration.
- Use least privilege for users, services, agents, CI jobs, and deployment credentials.
- Treat all external input as untrusted.
- Preserve authorization checks at every trust boundary.
- Prefer secure defaults and explicit failure over silent fallback that weakens protection.
- Log security-relevant events without leaking secrets or unnecessary personal data.
- Do not disable security controls merely to unblock development.

## Data classification

Document the categories the product handles:

| Data type | Collected? | Sensitivity | Storage | Retention |
|---|---:|---|---|---|
| Anonymous telemetry | TBD | Low/Medium | TBD | TBD |
| Account identifiers | TBD | Medium | TBD | TBD |
| Personal data | TBD | High | TBD | TBD |
| Payment data | TBD | High | TBD | TBD |
| Secrets/credentials | TBD | Critical | Never in source | Minimal |

## Secrets management

- Local secrets belong in ignored environment/config files.
- CI/CD secrets belong in approved secret stores.
- Production secrets must not be copied into documentation, tickets, prompts, or logs.
- Provide sanitized `.env.example` or equivalent when configuration guidance is needed.
- Rotate exposed credentials immediately and treat repository history as compromised if a secret was committed.
- Android release/upload keystores, private keys, and signing passwords are critical secrets. Follow `release/android-signing.md`.
- Base64-encoded keystore content is still secret key material; encoding does not make it safe to commit or log.
- Do not reuse one Android release/upload private key or one password set across unrelated apps by default; standardize secret names, not secret values.
- Never configure a production Android release to fall back to debug signing when release secrets are absent.

## Authentication and authorization

Document:
- identity provider or authentication mechanism;
- session/token model;
- authorization roles/permissions;
- tenant isolation rules;
- privileged/admin operations;
- recovery flows.

Security-sensitive authorization must be enforced server-side or at the authoritative trust boundary, not only in the UI.

## Dependency and supply-chain security

- Pin/lock dependencies using the stack's normal mechanism.
- Review new dependencies for necessity and maintenance risk.
- Run dependency/security scanning appropriate to the stack.
- Do not accept generated packages, binaries, or build artifacts from unknown sources without verification.

## AI-agent boundaries

AI agents may:
- edit code and docs inside assigned scope;
- run approved tests and analysis;
- prepare pull requests.

### Absolute prohibitions

AI agents must never:
- reveal, print, exfiltrate, or intentionally expose secrets or credentials;
- falsify validation results or claim an unrun check passed;
- bypass, disable, or conceal a required review/security/quality gate;
- silently weaken authentication, authorization, tenant isolation, encryption, or other security boundaries.

### Privileged actions requiring explicit human authorization

AI agents may perform the following only when the current task includes explicit human authorization and an approved mechanism:
- rotate or change production credentials without exposing their values;
- alter production data;
- execute a production deployment or release;
- merge a reviewed change after the human approval gate has been satisfied.

Authorization for a privileged action does not authorize bypassing required validation, review, auditability, or security controls.

## Logging and observability

Logs should:
- support debugging and security investigation;
- avoid secrets;
- minimize personal/sensitive content;
- include correlation or request identifiers where useful;
- have documented retention for production systems.

## Vulnerability handling

For a suspected vulnerability:
1. avoid public disclosure until impact is understood;
2. preserve evidence and relevant logs;
3. identify affected versions/environments;
4. contain exposure;
5. fix through reviewed changes;
6. rotate compromised credentials where applicable;
7. document durable lessons in project memory when useful.

## Release security gate

Before production release, confirm:
- required security tests/checks passed;
- no unresolved critical/high-severity issue blocks the release;
- configuration and secrets are supplied through approved mechanisms;
- migration and rollback implications are understood;
- security/privacy-impacting changes received human review.

## NudgeMyInvoice sandbox payment / AI threat model

### Data
Synthetic payer contacts, invoice line items, amounts, due dates and PayPal sandbox IDs may be stored for demo use. Never accept or store card numbers, real customer financial records, live account credentials, or production PayPal transactions. Minimize user input sent to OpenAI; redact emails/PII when possible, document remaining processing and retention, and include a demo-data reset procedure before judging.

### Environment separation
`PAYPAL_ENV=sandbox` and `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com` are hard requirements. Validate at application startup and for every PayPal client; reject live hosts or missing explicit sandbox configuration. Keep all credentials server-side in ignored `.env` / Render environment variables. Public GitHub repository means every committed value is public.

### Authorization and approvals
Backend enforces human approval for outbound notification or financial state changes, including sending invoice/reminder, cancellation, refund, PayPal's manual record-payment/mark-paid API, and order capture. Receiving a PayPal-verified paid-status event is permitted automatic reconciliation, not a privileged PayPal write. Approval is resource/action/payload-specific, human-authenticated, expires, and is consumed once atomically; log timestamp, approver, object ID, consent summary, request ID and result. UI control is necessary but NOT sufficient. No model/tool/cron/webhook bypass. Authentication is required for all personal/business invoice data in hosted demo; use a strictly scoped demo account, safe session cookies and CSRF protection.

#### Approval contract (implemented in `@nmi/domain`, NMI-P1-C2)
A privileged request carries a `TrustedActor` taken from the backend security context (never model output, tool arguments or a client field). The gate fails closed unless the actor is a human whose id equals the grant's `approverId`, and the grant matches the exact action, resource, payload digest, expiry and unconsumed state. Consumption goes through `ApprovalStore.consumeIfMatches`, which must be ONE conditional atomic operation binding all of those expected values (derived from the request, not from the earlier inspected copy) and consuming exactly one row.

#### Operator authentication and sessions (NMI-P2-I1)
- **Single provisioned operator.** No registration, reset email or social login. The operator exists only after the explicit CLI `pnpm --filter @nmi/api provision-operator` (credentials via environment, never printed; idempotent; re-running with the same username rotates the password and revokes its sessions; a second operator is refused in code and by a database unique index). Migrations create no user. Passwords are stored only as salted scrypt (N=2^17, r=8, p=1, per-hash random salt, constant-time compare); unknown usernames still spend one verification.
- **Credential versioning (C3).** `operators.credential_version` increases on every rotation. Login reads the operator (and its version) first, verifies the password WITHOUT holding any database lock, and then issues the session with one statement, `INSERT ... SELECT ... WHERE credential_version = <verified version> AND not disabled ... FOR UPDATE`, which takes the operator row lock only for that statement. If a rotation committed in between, the version no longer matches, no session is created and the login fails closed (`401`, audit reason `credential_changed`). Rotation itself is one transaction that locks the operator row, swaps the hash, bumps the version and revokes all live sessions, all or nothing. Result: either the login's session is committed first and the rotation revokes it, or the rotation wins and the login is refused. (The rotation's explicit `SELECT ... FOR UPDATE` is belt-and-braces: its `UPDATE operators` takes the same row lock, so removing the SELECT does not change the race outcome; it is kept for explicit lock ordering and concurrent provisioning.)
- **Sessions.** 256-bit random opaque token; only its SHA-256 is stored. Absolute (default 8 h) and idle (default 60 min) expiry plus revocation are decided by the database clock in a single `UPDATE ... RETURNING`; logout revokes server-side immediately. Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, finite `Max-Age`, `Secure` and `__Host-` prefixed in production or for https origins.
- **CSRF / origin.** Every POST/PUT/PATCH/DELETE must carry `Origin` exactly equal to `WEB_ORIGIN` (missing is rejected). Authenticated mutations additionally need `X-CSRF-Token` = HMAC(`SESSION_SECRET`, session-token hash), bound to that session, compared in constant time. CORS is credentialed for the configured origin only.
- **Login admission control (C3).** Admission is reserved SYNCHRONOUSLY, before the handler's first `await`, against two budgets at once: 5 attempts / 15 min per (address, normalized username) and 20 / 15 min per address (`AttemptLimiter.tryAdmit` checks both and reserves in both, atomically). Concurrent guesses therefore cannot over-admit. Accounting: a correct password refunds its address slot and clears that account's history; a wrong password keeps its slot until the window passes; an error after hashing began keeps it; an error before hashing (e.g. database lookup) or a refusal for capacity refunds it; a client that disconnects mid-attempt is settled by its outcome like any other. Excess requests receive `429` with `Retry-After` (seconds until both budgets have room) before any database lookup or password hashing. Concurrent scrypt work is bounded (default 4 running, 16 queued; further requests get `429`, `Retry-After: 1`). Username case/whitespace variants share one budget; `X-Forwarded-For` is ignored unless `TRUST_PROXY=true`. **Limit (unchanged):** in-memory and per process, so it resets on restart and is not shared across instances; a distributed attacker using many addresses is out of scope here.
- **Browser client (NMI-UI-01C1).** The web app holds the CSRF token, operator id/username and expiry in volatile React memory only; it never reads the cookie, never writes any browser storage, URL or console, clears the password field after every attempt, aborts in-flight requests on unmount and ignores stale responses. Nothing protected is rendered until the server confirms the session; the URL hash and demo reducer actions cannot authenticate. Error copy is generic (a 401 and a 403 both read "username or password is incorrect"), and a failed or unconfirmed logout is disclosed honestly. Production `connect-src` is `'self'` only.
- **Trusted actor.** `TrustedActor` is constructed only in `apps/api/src/auth/trusted-actor.ts` from a database-validated session (ESLint forbids importing `asTrustedActor` elsewhere outside tests). Body, query, headers, model output and tool arguments cannot supply it.
- **Fail closed.** A database error during session validation returns 503; configuration without PostgreSQL or a >=32-character `SESSION_SECRET` refuses to start.

#### PostgreSQL approval store (NMI-P2-I1)
`PostgresApprovalStore.consumeIfMatches` is one conditional `UPDATE ... WHERE id, action, resource_id, payload_digest, approver_id, consumed_at IS NULL, expires_at > clock_timestamp() RETURNING id`; success means exactly one row. Expiry uses the **database** clock; the caller's `now` is ignored by design. A rival consumer blocks on the row lock and re-evaluates against the committed row; a rolled-back consumption leaves the grant usable. Proven against real PostgreSQL 16 with multiple connections (see `docs/TESTING.md`). Database errors propagate (fail closed).

**Remaining limits (explicit):**
- **No grant issuer exists.** No route or code creates approval grants, and no route consumes them. Approvals can only be inserted by tests. A future issuer must be owner-reviewed (UI, business flow, authorization tests) before any privileged PayPal call is wired.
- Consumption and its audit row are two statements, not one transaction: if the audit write fails after a successful consume, the error propagates, the privileged action does not run and the grant is spent (fail closed, may need re-issuing).
- Single-process throttling; no password reset; no MFA; single operator only.
- `SESSION_SECRET` rotation invalidates outstanding CSRF tokens (sessions themselves remain valid; clients re-fetch via `GET /api/auth/session`).

#### Audit trail (NMI-P2-I1)
Rows (`audit_log`) record request id, actor (operator UUID, `anonymous` or `system`), action, resource, outcome and an allow-listed detail object (`reason`, `approvalId`, `sessionId`, `usernameKnown`, `privilegedAction`). Credentials, tokens, cookies, CSRF values, usernames, customer emails, invoice bodies and prompts are never stored; unknown or unsafe values are dropped. **Immutability is database-enforced** against ordinary UPDATE, DELETE and TRUNCATE by triggers (migration `0003`, tested). It is *not* enforced against the table owner or a superuser, who can drop triggers: run the application with a role granted only INSERT and SELECT on `audit_log` (a deployment task, not configured here). No endpoint exposes audit data, anonymously or otherwise.

#### AI drafts and PayPal sandbox drafts (NMI-P2-I2)
**Endpoints** (all require a verified session; every POST also needs same-origin `Origin` and the session CSRF token):
`POST /api/invoice-drafts/parse`, `POST /api/invoice-drafts` (optional `Idempotency-Key`), `GET /api/invoice-drafts/:id`, `POST /api/invoice-drafts/:id/paypal-draft`. There is no send, remind, cancel, refund, capture, payment or webhook route, and the PayPal client and its transport allowlist expose only OAuth token, create DRAFT invoice, show invoice and search-by-number.

- **AI is advisory.** Parse output is untrusted: schema-checked, re-validated against the strict domain schema, totals computed locally. Provider failure, missing key or timeout returns `{status: "unavailable", fallback: "manual_entry"}` with no provider text. Parsing never saves anything and never touches PayPal. The text sent to OpenAI (`store: false`) is the only operator data that leaves; it is not logged or audited. Cost is bounded per operator (default 20 parses / 10 min, max 2 in flight; in memory, per process). The reference date is the server's UTC calendar date (clients near midnight in other zones may see an off-by-one day).
- **Save is strict and exact.** The body must be exactly an `InvoiceDraft` (unknown keys such as `total`, `status`, `id` are rejected). Amounts are recomputed on the server in integer minor units; the invoice and items are written in one transaction together with their audit row (a failed audit rolls everything back). Reads re-verify the stored totals against the items (`DraftIntegrityError` on tampering). `Idempotency-Key` makes retries safe: same key and same draft replays, same key and different draft is `409`; without a key each request is a new draft.
- **At-most-one sandbox draft creation (local fencing and fail-closed reconciliation).** PayPal documents `PayPal-Request-Id` for some Invoicing endpoints but **not for create-invoice** (checked in PayPal's published OpenAPI schema), so it is sent but never relied on as an unconditional idempotency guarantee. Guarantees come from this application: (1) one `paypal_draft_operations` row per invoice (unique), reserved before any external call with the exact canonical `invoice_date`, and the canonical request body is always rebuilt from the atomically reserved operation row before claiming or external dispatch (guaranteeing exact outbound and persisted date identity even across concurrent requests racing across UTC midnight); (2) a single-statement claim with a fencing counter, so concurrent requests get `409 in_progress`; (3) the claim and `create_attempted_at` are durable before the request leaves; (4) the remote `invoice_number` is deterministic (`NMI-` + 20 hex of the local id) and `reference` is the local id, so an unclear outcome (timeout, network, 5xx, unparsable reply, crash) is reconciled by search/show **before** any further action; (5) after an unclear outcome, reconciliation NEVER triggers an automatic second create: if search shows nothing, it fails closed to `409 reconciliation_pending` (relying on operator review or delayed search indexing rather than an unproven provider idempotency guarantee), and retries older than PayPal's 45-day idempotency retention window fail closed as `idempotency_expired`; (6) a stale `creating` lease (120 s) is taken over as a reconcile, never a blind create; (7) a remote id can be linked to only one invoice (unique indexes) and operation + invoice link commit together.
- **Success means verified.** Only a `DRAFT` whose currency, total, due date, invoice number and reference all equal the local values is recorded as `created`; anything else is `mismatch` (kept for traceability, never linked, never retried automatically). An unclear outcome is never reported as success.
- **Exact mapping or refusal.** PayPal's rounding rules for tax and discounts are not verified, so any draft whose total depends on rounding (line `qty x price` with a sub-minor-unit remainder, tax or percent discount that is not an exact number of minor units, tax together with a discount on more than one line) is refused with `422 mapping_refused` before any external call. A past due date is refused too. Accepted drafts have totals that are identical under any rounding mode, and the remote total is compared afterwards regardless.
- **Fail closed.** `PAYPAL_DRAFTS_ENABLED` defaults to `false`; when `true` both credentials are mandatory or the API will not start. Only the sandbox host is reachable (every request is checked against an allowlist of four method+path patterns, no redirects followed, bounded time and size). The intent is audited before the external call: no audit trail, no external write. Credentials, tokens, bodies and customer data never appear in errors, logs or audit rows.

**Real Sandbox evidence, limited to one happy-path create (2026-10-26):** AG's `NMI-P2-I2-SANDBOX-SMOKE-01` reported real OAuth HTTP 200, exactly one draft-create HTTP 201 and one read-only show HTTP 200. The test payload contained **one fictitious USD 5.00 line item, zero tax, and zero discount**. Remote invoice `INV2-U92W-76NX-3P2E-AGUZ` returned `DRAFT`, USD 5.00, matching due date, number and local reference; durable operation `created`, attempts 1. No send, reminder, refund, cancellation or payment requests were made. This is AG operator-run provider evidence, not an independent PayPal-account query. The temporary process-level guarded transport used for the smoke prevented a second create on automatic 401 retry; this **extra local guard is not a general production guarantee**. Its one-create budget is exhausted, and `PAYPAL_DRAFTS_ENABLED=false` has been restored.

**Variations specifically covered by deterministic fake HTTP or PostgreSQL tests:** The following error, concurrency, and mapping paths were verified against local fakes and PostgreSQL integration suites, but were **not** exercised against live PayPal Sandbox:
- **Refusal of rounding-dependent totals:** drafts with fractional minor-unit remainders or multi-line tax/discount combinations that cannot guarantee identical totals under all rounding modes fail closed (`422 mapping_refused`).
- **Line-item tax and discount mappings:** client generation of line-item tax and percent/fixed discount body fields is covered by deterministic unit/mapping tests.
- **Fail-closed reconciliation on ambiguous outcomes:** timeouts, simulated network dropouts, 5xx errors, unparsable payloads, and crash-after-create recovery are verified to transition safely via fake-transport and PostgreSQL tests without duplicate creation.
- **Durable operation fencing and concurrency:** 20 simultaneous claimers, stale-lease takeovers, and midnight-boundary date identity enforcement are verified against real PostgreSQL.
- **Client transport allowlist & token refresh:** 401 OAuth token refresh, 400 bad request rejection, and blocking of off-allowlist hosts/endpoints are verified via mock transport.

**Variations that remain unverified PayPal provider assumptions:** Because live Sandbox validation was restricted to the single USD 5.00 happy-path create, the following provider behaviors remain unverified external assumptions rather than tested behaviors:
- **Invoice-level discount placement:** PayPal's actual handling of discounts placed under `amount.breakdown.discount.invoice_discount`.
- **Live tax/discount calculation:** whether PayPal computes line-item taxes or invoice-level discounts identically to local schema expectations in live transactions.
- **Alternative recipient name formats:** whether PayPal accepts or strictly validates `name.full_name` versus separated given/surname fields across different locales.
- **Alternative invoicer configurations:** whether omitting the `invoicer` object reliably uses account merchant profile defaults across all account configurations.
- **Alternative HTTP 201 response shapes:** whether live PayPal returns a full invoice representation, a link-only body, or respects `Prefer: return=representation`.
- **Live search indexing lag & duplicate rejection:** whether live PayPal's search API exhibits indexing delays that hide newly created drafts, and whether PayPal unconditionally rejects duplicate `invoice_number` submissions.

Real OpenAI Responses parsing also remains **NOT TESTED** against the live provider.

**Other limits:** the draft is immutable in this increment (no edit route); a `mismatch` or `unknown` operation needs operator action outside this increment; in-memory parse budget is per process; the draft's customer email is sent to PayPal (sandbox) when the operator requests the PayPal draft.

### Webhook trust (planned, NOT IMPLEMENTED)
When implemented, use raw unmodified body; verify PayPal headers, registered WEBHOOK ID and signature (or PayPal verification API for real sandbox events) **before** DB mutation; validate timestamp/IDs, durable unique event key, and handle duplicates/out-of-order events. Simulated webhook events require a separate explicit test harness and must not mark real invoices paid. Never skip verification to make the demo pass.

### Financial invariants
One currency per invoice; explicit supported ISO code and scale; amounts handled using decimal strings or integer minor units, never IEEE floating point; payables and totals displayed per currency. Reject unknown currencies and prohibited negative/invalid invoice amounts. No FX rates without an authoritative quote and explicit human consent; no invented exchange values.

### Agent/tool permissions
Read-only tools and draft creation are allowlisted. Every privileged PayPal call must cross the same backend approval service independent of whether it originates from UI, OpenAI tool/function calls, PayPal Agent Toolkit or an MCP server. Treat model output and external tool descriptions as untrusted. No secret exposure in tool returns.

### Tests / non-goals
Require negative tests for forged signature, replay, duplicate delivery, privilege bypass, changed approved payload, stale approval, double click, wrong target invoice, live-host configuration, multiple currencies incorrectly summed, and refunds never enabled in MVP.

#### Invoice list and operator-scoped reads (NMI-UI-01C4)
- `GET /api/invoice-drafts` is authenticated, read-only and owner-scoped in SQL (`created_by = <session operator>`; rows with a NULL owner never match). The operator is never accepted from the client (`operatorId` is a 400). Query parameters and the opaque cursor are strictly validated (page size <= 50, search <= 100 characters, `LIKE` wildcards escaped, everything parameterized); results are `no-store`, bounded, and contain no line items, digests, idempotency keys or audit data.
- `GET /api/invoice-drafts/:id` is operator-scoped: another operator's id, an ownerless id and an unknown id are indistinguishable (`404`), so existence is not disclosed.
- **Where search text can and cannot appear.** The term travels in the `q` query parameter of the HTTP `GET /api/invoice-drafts` request, so the HTTP request URL DOES carry customer information (a name, e-mail address or invoice-id prefix). It is NOT in the browser navigation URL or history, NOT in browser persistent storage (React memory only) and NOT in the Fastify request log (the `req` serializer keeps the path only). List reads write no audit row.
- **Deployment prerequisite (untested):** any reverse proxy, ingress, load balancer, CDN or WAF in front of the API, and the access/audit logs it writes, must omit or redact the query string of `/api/invoice-drafts` (at least `q`). No hosted proxy was exercised, so no proxy-side privacy claim is made. If the owner requires that no customer data ever appears in HTTP request URLs, that conflicts with the approved GET contract and needs an explicit owner decision (for example a POST-based search); it was not changed.
- **Resolved in C5-P0:** `POST /api/invoice-drafts/:id/paypal-draft` (`createPayPalDraft`) formerly loaded the invoice by id without an operator scope (`drafts.get`). It now uses `drafts.getOwned(invoiceId, operatorId)` as its first data access: a foreign, ownerless or unknown invoice yields one identical `404 {"error":"not_found"}` and nothing else runs (no operation read or write, no stored PayPal id returned, no reserve/claim, no audit row, no provider call). Verified against real PostgreSQL with two operators (test-only second operator; production still allows exactly one) and a deliberate negative control. Fencing, state machine, reconciliation, idempotency and the provider adapter are unchanged.
- Tests create a second operator only in disposable databases by dropping `operators_single_row_uq` (test-only DDL); the committed migrations are unchanged.

#### PayPal Sandbox draft UI (NMI-UI-01C5-P1)
- The browser never talks to PayPal and holds no PayPal credentials. It calls only the same-origin `POST /api/invoice-drafts/:id/paypal-draft` (session cookie, CSRF token from memory, no body, `no-store`, `redirect:error`); the server enforces session, CSRF, Origin, operator ownership (C5-P0) and the single-creation fencing.
- A draft is created only after an explicit operator confirmation naming the exact invoice, currency and server-computed total; cancel, Escape, mount, render, reload, navigation and filter changes never POST. A double click is one request. There is no polling and no automatic retry.
- Uncertain outcomes (lost connection, timeout, 5xx, unreadable success, `paypal_outcome_unknown`, `in_progress`, `reconciliation_pending`) are never shown as failure or success: the UI says a draft may or may not exist, re-reads the durable state with a read-only GET and offers a new attempt only from durable `none`, `rejected` or `unknown` after that read. `mismatch` offers no retry. A `paypal_disabled` answer is not probed again.
- The UI never says an invoice was sent or paid and never claims the customer was notified; the dialog and panel state the opposite.
- Error codes shown come only from a bounded safe pattern and are rendered as text. No customer data is stored in the browser.
- Evidence uses a deterministic FAKE PayPal behind the real routes; no real PayPal Sandbox or OpenAI request was made.
