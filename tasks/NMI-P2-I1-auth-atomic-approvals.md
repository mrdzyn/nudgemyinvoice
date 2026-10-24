# NMI-P2-I1 — Authenticated Operator + PostgreSQL Atomic Approval Foundation

- **Status:** Implemented on this branch; pending independent Codex exact-head audit (not self-certified). Draft PR.
- **Owner/orchestrator:** project owner / ChatGPT
- **Implementation agent:** Claude Code
- **Independent reviewer:** Codex (cannot self-certify)
- **Base:** `main` at `56ca7392c6b7f9f63d0f8fe484bb84835378dc26` (PR #1 and PR #2 squash merged)
- **Working branch:** `phase-2/nmi-auth-atomic-approval-i1`
- **Delivery type:** Backend/API, data-security and migration increment only.
- **UI design gate:** Not applicable. Do not implement invoice/dashboard UI or bypass the separate unapproved `design/nmi-p1/SCREENS.md` gate.

## Objective

Close the two explicitly deferred Phase 1 security gaps before any PayPal financial or notification action is wired:
1. Server-verified, single-operator demo authentication/session lifecycle producing a trusted human principal.
2. A real PostgreSQL `ApprovalStore` implementing the existing `@nmi/domain` `consumeIfMatches` contract as **one atomic conditional UPDATE**, tested against concurrent database connections.
3. Minimal append-only audit event recording for authentication and approval decisions, without leaking sensitive payloads.

This increment enables **no PayPal sends, refunds, cancellations, captures, manual marks-paid, reminders or webhook-driven privileged writes**. A successful approval test is not permission to call PayPal.

## MVP auth decision (bounded, reviewable)

Use one explicitly provisioned operator/demo account; **no public self-registration, password reset email, social login, multi-tenant roles or implicit test-admin fallback**. Prefer platform-supported Node `scrypt` with independent random salts and safe parameters, or a vetted Argon2id library if justified; never store plaintext passwords, reversible encrypted passwords or a committed sample password. Account initialization must be an idempotent, explicit CLI operation taking a secret from environment/interactive input without printing it. No default user is provisioned by running migrations.

Use server-created, cryptographically random opaque session tokens; persist only a hash of each token in PostgreSQL. Set cookie `HttpOnly`, `Secure` on HTTPS/production, `SameSite=Lax` unless a documented and reviewed cross-site design requires stricter protection, scoped path and finite expiry. Session issuance, validation, logout/revocation and expiry are all server-side. Allow only the configured `WEB_ORIGIN` with credentialed CORS where required, reject unauthorized origins on state-changing requests, and use a synchronizer CSRF token (or rigorously equivalent tested defense). Rate-limit login and use generic failure messages. Never log credentials, session cookies, CSRF tokens or password hashes.

Auth middleware must construct `TrustedActor` only from a validated active session mapped to the operator record. No request body/header, model output, tool arguments, cron or webhook can claim an actor. Remember `asTrustedActor` is a TypeScript brand helper, not a runtime authentication guarantee.

## Persistence / approval invariants

Add a migration for account/session support without dropping or resetting existing invoice/approval/migration history. Keep Drizzle schema and committed SQL journal in sync. Use the existing PostgreSQL schema; this increment **does not resolve the separate pending owner decision on a dual SQLite dialect**.

Implement the real `@nmi/db` adapter to satisfy existing `ApprovalStore`. `consumeIfMatches` MUST issue a **single** conditional PostgreSQL `UPDATE ... WHERE id, action, resource_id, payload_digest, approver_id, consumed_at IS NULL, expires_at > current trusted time ... RETURNING id`; exactly one updated row means success. No read-then-write acceptance. Bind SQL parameters; maintain the exact action/resource/payload digest/approver/expiry boundaries. If DB is unavailable, fail closed. Database time versus injected test clock must be documented and tested; never let a caller control expiry enforcement.

Write narrowly scoped audit entries on successful/failed authentication and approval decisions with request/correlation ID, trusted actor ID where known, action, resource and outcome; exclude full invoice bodies, credentials, customer emails, cookies, CSRF tokens and OpenAI prompts. Document that audit logs are append-only by application policy; if claiming DB-enforced immutability, demonstrate DB grants/controls, not merely code convention. Do not expose audit information anonymously.

## API boundary

Retain public `GET /health`. Introduce only the minimum operator login, session-inspection, logout routes and verified session middleware; choose typed request/dependency injection and strict Zod input validation. No generic approval-execution HTTP route or PayPal execution adapter in this increment. Any future approval/grant issuer must remain disabled until owner-reviewed UI/business flow and authorization tests exist.

Require the necessary DB and authentication config when protected capability is enabled; do not silently start in an insecure authenticated-demo mode. Preserve PayPal sandbox-only startup guard and server-side OpenAI configuration. Never expose secrets in browser bundles.

## Required tests / acceptance

- [x] From anonymous requests, protected routes fail with 401; `/health` remains available.
- [x] Valid operator login creates a non-guessable session and safe cookie; invalid login has generic failure and is throttled.
- [x] Expired, revoked, malformed and forged sessions fail; logout invalidates server-side session immediately.
- [x] Wrong or absent Origin/CSRF on mutating routes fails; correctly authenticated request succeeds.
- [x] Spoofed actor identifiers in body/headers/model/tool cannot produce `TrustedActor`.
- [x] PostgreSQL adapter implements `ApprovalStore` exactly; mismatch in actor, action, resource, digest, expiry or consumed status cannot pass.
- [x] **Two simultaneous clients** racing to consume the same grant yield exactly one success; a failed/rolled-back consumption cannot count as authorized.
- [x] Migration applies to disposable PostgreSQL 16 and existing 0000/0001 migrations stay unchanged.
- [x] Audit records are scoped/sanitized and omit secrets/PII; no anonymous audit data access.
- [x] No privileged PayPal action is implemented or callable; existing tool allowlist remains fail-closed.
- [x] No passwords/tokens in source, logs, environment examples, test snapshots or client bundle.
- [x] Existing 91 deterministic unit tests / 22 PG tests remain valid (update counts truthfully after implementation).

## Allowed scope

`apps/api/`, `packages/db/`, `packages/domain/` only where needed for actor and approval contracts, `packages/shared/` for API contracts, `packages/test-fixtures/`, root lockfile/config needed for reviewed dependencies, targeted tests and migrations, `.env.example` (names/placeholders only, avoid silently changing database dialect policy), and task/STATUS/SECURITY/TESTING/ARCHITECTURE/HANDOFFS docs.

**Forbidden:** public registration; full invoice UI; AG Studio integration; OpenAI or PayPal paid API calls; live PayPal; webhook processing; invoice send/remind/cancel/refund/capture/mark-paid; deployment; secrets; branch protection or CI rule changes; merging; altering existing payment semantics.

## Validation and manual CI (Actions unavailable)

Define targeted auth/session and PostgreSQL atomicity test objectives first. Run the smallest objective-based suite, then required security-relevant regression. Before independent audit, run pinned `pnpm@10.28.0`, frozen install, profile validator, lint, format check, typecheck, unit tests, `pnpm test:db` using disposable `nmi_test*` PostgreSQL 16 with at least two real connections, build, bundle scan, `pnpm audit --prod --audit-level high`, migration generation/in-sync check, `git diff --check`. Record actual commands, exit statuses, counts, PostgreSQL version and exact implementation HEAD. Hosted CI is **NOT PASS** if no executable checks ran; a one-time exception previously approved for PR #2 does **not** carry over to this PR.

## Delivery and gate

Implement on this branch, use focused commits and keep the PR Draft. Reconcile `docs/STATUS.md` + the active handoff after implementation, then ask Codex for an independent exact-head security and concurrency audit (PASS / PARTIAL / FIX REQUIRED). No merge without new owner approval. No deploy/release. On completion, hand off to NMI-P2-I2 for owner-approved AI smoke and sandbox PayPal integration; do not start those capabilities implicitly.

## Implementation record (Claude, NMI-P2-I1)
Evidence for each checked criterion is in `tests` named in `docs/TESTING.md` and in handoff `NMI-P2-I1-C2`. Notes and deviations for the auditor:
- Migrations `0000`/`0001` are unchanged. `0002` adds `operators`, `sessions` and `audit_log.request_id`/`outcome`; `0003` (custom SQL) adds the audit immutability triggers. A single-row unique index enforces the one-operator rule.
- Expiry for sessions and approvals uses the database clock; the caller-supplied `now` in `ConsumeExpectation` is ignored by the PostgreSQL adapter.
- The API now requires `DATABASE_URL` (PostgreSQL) and `SESSION_SECRET`; `.env.example` no longer defaults to SQLite. This does **not** decide the SQLite question.
- Not done, by design: grant issuance, any approval HTTP route, PayPal writes, UI.
