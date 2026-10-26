# NMI-CORS-01 — CORS Idempotency-Key Preflight Support

- **Status:** In Progress
- **Owner/orchestrator:** Product Owner / Antigravity
- **Implementation agent:** Antigravity
- **Target branch:** `main`
- **Working branch:** `fix/nmi-cors-idempotency-header`

## Objective

Update the API's CORS configuration to explicitly permit the `Idempotency-Key` request header during browser preflight (`OPTIONS`) requests, enabling future browser clients to send idempotency keys when saving invoice drafts without weakening origin or header restrictions.

## Context

Codex audit finding F5 on PR #4 identified that `apps/api/src/app.ts:61–65` configured `@fastify/cors` with `allowedHeaders: ["content-type", "x-csrf-token"]`. While backend invoice draft persistence supports the `Idempotency-Key` header (`req.headers["idempotency-key"]`), browser clients initiating cross-origin requests with this custom header would fail the CORS preflight check. This was deferred from docs-only PR #5 as an open code remediation.

## Delivery mode / UI design gate

- **Material user-facing UI:** No
- **UI design gate:** Not applicable — API/security compatibility fix only.
- **Allowed files:**
  - `apps/api/src/app.ts`
  - `apps/api/src/app.test.ts`
  - `tasks/NMI-CORS-01-idempotency-header.md`
  - `docs/STATUS.md`
  - `docs/HANDOFFS.md`
- **Forbidden scope:**
  - Modifying business logic, database schemas, or migrations
  - Upgrading dependencies or altering package manifests
  - Weakening CORS origin validation or adopting wildcards (`*`)
  - Reflecting arbitrary client request headers without explicit allowlisting
  - Bypassing session authentication, Origin checks, or CSRF token validation
  - Executing real PayPal or OpenAI API calls

## Implementation plan

1. In `apps/api/src/app.ts`, update `allowedHeaders` in `@fastify/cors` registration:
   ```ts
   allowedHeaders: ["content-type", "x-csrf-token", "idempotency-key"],
   ```
2. In `apps/api/src/app.test.ts`, add browser-style CORS preflight regression tests:
   - `OPTIONS /api/invoice-drafts` from configured `WEB_ORIGIN` requesting `POST` with `content-type`, `x-csrf-token`, and `idempotency-key` returns 204/200 with all three headers permitted.
   - Permitted preflight includes `access-control-allow-credentials: true` and `access-control-allow-origin: <WEB_ORIGIN>`.
   - Disallowed origin receives no `access-control-allow-origin` header.
   - Unknown/unlisted headers are not automatically allowed.
   - Mutating request origin rejection and CSRF/session enforcement remain intact.
3. Validate existing test suites:
   - `pnpm validate` (lint, format:check, typecheck, 235 unit tests, build, bundle scan).
   - `TEST_DATABASE_URL=... pnpm test:db` (187 PostgreSQL tests, including invoice draft idempotency tests).
   - `python3 scripts/validate_project_profile.py`.

## Acceptance criteria

- [ ] Browser-style preflight `OPTIONS` request with `idempotency-key` succeeds for the configured `WEB_ORIGIN`.
- [ ] Response headers confirm `idempotency-key` is included in `access-control-allow-headers`.
- [ ] Credentialed cross-origin responses (`access-control-allow-credentials: true`) are preserved.
- [ ] Foreign or unauthorized origins continue to receive no CORS allow headers and get 403 on mutating calls.
- [ ] Arbitrary or unlisted headers are not authorized.
- [ ] All 422 automated unit and PostgreSQL integration tests pass without regression.
- [ ] Project profile and diff checks pass cleanly.

## Security boundaries

- Preserve exact `WEB_ORIGIN` enforcement: `origin === config.webOrigin`.
- Preserve explicit allowlisting of methods: `["GET", "POST", "OPTIONS"]`.
- Preserve explicit allowlisting of headers: `["content-type", "x-csrf-token", "idempotency-key"]`.
- Preserve fail-closed `onRequest` hook verifying `Origin === config.webOrigin` on mutating methods.
- Preserve session cookie authentication and HMAC-derived CSRF token verification.
