# NMI-PROTOTYPE-10D-A3-FIX1 — PayPal Search Contract Remediation

- **Status:** Implementation and focused local validation complete; awaiting new Draft PR CI and independent exact-HEAD review.
- **Base:** `main@816efcd9449b2fcfc00628123ded99cc4c62526a`.
- **Branch:** `fix/nmi-proto-a3-paypal-search-contract`.
- **Source finding:** A3 offline investigation, PR #34; report `docs/NMI-PROTOTYPE-10D-A3-PAYPAL-OFFLINE-REPORT.md`.
- **API contract:** PayPal Invoicing v2 OpenAPI 2.6, pinned at commit `90e8041ffe02d80c452d2b476bedd59a8d219bdc`, `openapi/invoicing_v2.json`; search parameters and completeness controls are documented at [`POST /v2/invoicing/search-invoices`](https://github.com/paypal/paypal-rest-api-specifications/blob/90e8041ffe02d80c452d2b476bedd59a8d219bdc/openapi/invoicing_v2.json).
- **UI design gate:** Not applicable (backend adapter and tests only).
- **Test objective:** prove the Sandbox search request matches the pinned PayPal Invoicing v2 contract, URL validation remains exact allowlist/default-deny, and no response lacking complete internally consistent metadata can select a remote invoice or permit unsafe reconciliation.

## Scope

Allowed: `packages/paypal/src/client.ts`, `packages/paypal/src/http.ts`, related PayPal client/HTTP tests, this task, `docs/STATUS.md`, and one active handoff entry. No migrations, schemas, routes, UI, unrelated provider behavior, or dependency changes.

Required behavior:

1. POST search uses only fixed query `page=1&page_size=20&total_required=true`; `invoice_number` is exclusively in JSON body.
2. The Sandbox search route guard accepts exactly that query once and rejects missing, duplicated, reordered/altered, malformed, additional, or encoded/user-controlled query values. Every other allowed operation remains query-free and every other host/method/path remains denied.
3. A search response is selectable only when `total_items`, `total_pages`, and `items` are present, nonnegative and mutually consistent; result count is at most page size 20, all results fit a single page, and every candidate has the requested invoice number. Missing, contradictory, malformed, truncated, oversized, or multipage responses become an unknown/incomplete outcome.
4. Deterministic tests cover empty, one-match and multiple-match complete result sets; missing/inconsistent metadata; truncation and pagination/oversize; timeouts and search 401; and invalid/duplicate/unexpected URL queries before transport.
5. Preserve search as read-only, exact remote draft verification, owner scoping, durable operation fencing, and the at-most-one create POST behavior. Defer invoice-date verification.

## Prohibited

No PayPal/OpenAI/SMTP requests, credentials, MCP, owner database, migration, Render resource, deployment, merge, feature-flag change, or provider-budget reset. Keep `PAYPAL_DRAFTS_ENABLED=false`; the one-create authorization remains exhausted. Do not broaden the operation allowlist.

## Validation evidence

- `pnpm exec vitest run packages/paypal/src/client.test.ts packages/paypal/src/http.test.ts packages/paypal/src/mapping.test.ts packages/paypal/src/index.test.ts` — 132 passed across 4 files.
- `pnpm --filter @nmi/paypal typecheck` — passed.
- Workspace `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` — passed.
- `apps/api/src/paypal-create-401.pg.test.ts` and `apps/api/src/invoice-drafts.pg.test.ts` — 62 passed on a freshly initialized disposable PostgreSQL 16 cluster named `nmi_test_a3fix1`; temporary cluster removed after the run.
- The focused HTTP suite verifies the exact fixed search query is the sole query-enabled operation and keeps unsupported methods, hosts, paths, duplicate/extra/malformed query strings denied before transport.
- `git diff --check` passed after the final source/doc edits. Both required hosted workflows must still pass on the final exact PR HEAD; record their results in the handoff.

## Delivery

Open one new Draft PR from this branch and stop for independent exact-HEAD security review. Do not merge or deploy.
