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

### Webhook trust
Use raw unmodified body; verify PayPal headers, registered WEBHOOK ID and signature (or PayPal verification API for real sandbox events) **before** DB mutation; validate timestamp/IDs, durable unique event key, and handle duplicates/out-of-order events. Simulated webhook events require a separate explicit test harness and must not mark real invoices paid. Never skip verification to make the demo pass.

### Financial invariants
One currency per invoice; explicit supported ISO code and scale; amounts handled using decimal strings or integer minor units, never IEEE floating point; payables and totals displayed per currency. Reject unknown currencies and prohibited negative/invalid invoice amounts. No FX rates without an authoritative quote and explicit human consent; no invented exchange values.

### Agent/tool permissions
Read-only tools and draft creation are allowlisted. Every privileged PayPal call must cross the same backend approval service independent of whether it originates from UI, OpenAI tool/function calls, PayPal Agent Toolkit or an MCP server. Treat model output and external tool descriptions as untrusted. No secret exposure in tool returns.

### Tests / non-goals
Require negative tests for forged signature, replay, duplicate delivery, privilege bypass, changed approved payload, stale approval, double click, wrong target invoice, live-host configuration, multiple currencies incorrectly summed, and refunds never enabled in MVP.
