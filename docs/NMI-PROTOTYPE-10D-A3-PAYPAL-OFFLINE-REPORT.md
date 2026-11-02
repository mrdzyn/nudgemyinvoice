# NMI-PROTOTYPE-10D-A3 — Offline PayPal Investigation Report

- **Date:** 2026-11-02 (Asia/Manila)
- **Repository/base:** `mrdzyn/nudgemyinvoice`, `main@dd6d5723eadba5c55afe9d0a6912f1510b2bb9de`
- **Branch:** `docs/nmi-prototype-10d-a3-paypal-offline`
- **Verdict:** **DEFECT REPRODUCED** — API-contract mismatch observed statically/offline. No live PayPal behavior is claimed.
- **Change scope:** Documentation and evidence only. Payment implementation is unchanged.

## Summary

The offline behavior tests support the key safety properties: create is behind an authenticated operator confirmation; ownership is checked before provider access; the create effect does not retry after HTTP 401; timeout, 5xx, malformed success, and other uncertain outcomes are reconciled with reads; empty or delayed search never triggers a second create; and the final linked draft is checked against exact DRAFT status, currency, amount, due date, invoice number, and local reference.

An API-contract defect was reproduced by comparing the current serialized request and the pinned official Invoicing v2 OpenAPI schema. `findInvoiceIdsByNumber()` sends `page`, `page_size`, and `total_required` in the JSON body along with `invoice_number`; the OpenAPI defines pagination controls as query parameters. The existing fake test asserts this body shape, so it validates current implementation behavior rather than API compatibility. Because `total_required=true` and pagination are not sent in their documented location, the server is not contractually required to return `total_items`/`total_pages`; the adapter could therefore accept an incomplete result as complete. That weakens the completeness premise used for safe duplicate reconciliation. No provider request was made to determine whether PayPal tolerates or rejects the current shape.

## Reviewed safety behavior

### Explicit confirmation and authorization

The saved-invoice PayPal panel opens a confirmation dialog; its component comment states the POST is issued only from the confirmation action, once per confirmation (single flight). The dialog identifies the invoice and says draft creation does not send it. Server-side `createPayPalDraft` first calls the owner-scoped store lookup. Foreign, ownerless, and unknown invoices fail identically before operation/provider work. Durable operation reservation and create-attempt fencing precede the one create call. `PAYPAL_DRAFTS_ENABLED` defaults to `false` in `apps/api/src/config.ts` and `.env.example`.

### At-most-one create and reconciliation

`PayPalSandboxClient.call()` has an explicit `read | create` effect. Only reads may refresh/resend after a 401; create is never resent. `createDraftInvoice()` classifies a returned 401 as an unknown outcome, not a definite rejection. Transport timeout and server failures are also unknown. Service-level retries/re-entry reconcile through search or show. Empty search, delayed indexing, ambiguous multiple matches, and incomplete search do not cause blind creation. Tests cover zero provider calls for foreign invoice ownership and the fixed Sandbox host/method/path allowlist excludes send/remind/cancel/payment/refund operations.

### Exact remote verification and notification boundary

The verifier compares status exactly to `DRAFT`, currency code, amount using currency-aware exact decimal parsing, due date, invoice number, and the local invoice UUID reference. Focused tests cover a mismatch for each. PayPal create creates a draft; the product's only approved path does not call send or send-reminder endpoints. The read-back projection currently contains `dueDate`, but does not parse or verify PayPal `detail.invoice_date`. Thus due-date exactness is verified; invoice-date exactness is **not verified** and should be explicitly decided in the separate remediation task if “date” includes the invoice issue date.

## Reproduced compatibility finding

**P2 — Search pagination parameters are serialized in the wrong location (reproduced offline).**

- Local source: `packages/paypal/src/client.ts`, `findInvoiceIdsByNumber()` sends JSON `{ invoice_number, page: 1, page_size: 20, total_required: true }` to `POST /v2/invoicing/search-invoices`; `packages/paypal/src/client.test.ts` asserts those values in the JSON body.
- Official contract: PayPal Invoicing v2 OpenAPI version 2.6 defines `invoice_number` in the search request body and defines `page`, `page_size`, and `total_required` as query parameters. Pinned specification: [`openapi/invoicing_v2.json`](https://github.com/paypal/paypal-rest-api-specifications/blob/90e8041ffe02d80c452d2b476bedd59a8d219bdc/openapi/invoicing_v2.json), repository commit `90e8041ffe02d80c452d2b476bedd59a8d219bdc` (checked 2026-11-02).
- Impact: request pagination/completeness controls are not sent as the contract specifies. If ignored, the documented default for `total_required` is false, and the adapter cannot rely on pagination totals to detect truncation. This is material because reconciliation treats an empty result as no match and can later be eligible for a first create when the operation state permits; incomplete search must not be interpreted as absence.
- Reproduction level: deterministic source-to-OpenAPI contract comparison; no outbound request. Whether the live service ignores the extra body properties, rejects them, or happens to return totals anyway remains **NOT TESTED**.
- Action: separate bounded implementation task to move pagination controls to the query, request totals as documented, and fail closed unless response completeness can be proven; adapt fakes and tests. Keep the one-create invariant regardless of idempotency support.

## Official compatibility notes (checked 2026-11-02)

1. **PayPal Invoicing v2 OpenAPI:** pinned OpenAPI 3.0.3, API version 2.6, commit above. Search pagination location is the reproduced mismatch. Create operation documents HTTP 201, and `Prefer: return=representation` requests the full invoice representation. The local client also accepts HTTP 200; no live evidence was collected that the endpoint returns 200 for create. Treat 201 as the normative documented response and 200 as unverified compatibility tolerance.
2. **Invoice fields:** the OpenAPI invoice schema includes `detail.invoice_date`, `detail.payment_term.due_date`, currency/amount, invoice number, reference, and status. The app sends `invoice_date` and persists the chosen date across operation retries, but its read-back schema/verifier does not include it. Due date is tested exactly; issue-date echo/verification is not.
3. **`PayPal-Request-Id`:** the operation schema does not declare this header. PayPal's [Invoicing troubleshooting guidance](https://developer.paypal.com/invoicing/troubleshooting) (checked 2026-11-02) specifically recommends a stable `PayPal-Request-Id` to avoid duplicates when retrying create requests. General [REST API request guidance](https://developer.paypal.com/api/rest/requests/) (last updated 2026-07-27, checked 2026-11-02) describes it as optional and directs clients to verify endpoint support. Toolkit guidance similarly recommends request IDs on POST and reuse for retries. This is more specific than the stale plan statement that PayPal does not document the header for invoice creation. The current client sends it but explicitly does not rely on replay protection; the app's stricter at-most-one create rule forbids automatic replay, so no safety guarantee depends on the header. Update the plan claim in a later docs-only reconciliation.
4. **Draft vs notification:** PayPal's [Invoicing API reference](https://developer.paypal.com/api/invoicing/v2/) and [Invoicing reference](https://developer.paypal.com/invoicing/reference/) distinguish draft creation from the explicit send operation. A draft is not sent to the recipient until the send operation. This matches the app's local boundary: no send/reminder method or route is present in the approved workflow.
5. **PayPal AI Toolkit (official source):** repository commit `1401791aca82568525bd60aa40aaeb3e9a9615d0`, checked 2026-11-02. Pinned guidance: [invoicing best practices](https://github.com/paypal/AI-Toolkit/blob/1401791aca82568525bd60aa40aaeb3e9a9615d0/skills/paypal-best-practices/references/invoicing.md), [authentication](https://github.com/paypal/AI-Toolkit/blob/1401791aca82568525bd60aa40aaeb3e9a9615d0/skills/paypal-best-practices/references/authentication.md), and [MCP tools inventory](https://github.com/paypal/AI-Toolkit/blob/1401791aca82568525bd60aa40aaeb3e9a9615d0/skills/paypal-best-practices/references/mcp-tools.md). The invoicing material distinguishes create and send; authentication guidance recommends request IDs for POST/retry and keeping credentials server-side; MCP inventory includes mutating invoice and payment operations. These are development references, not authorization for app runtime tools. The toolkit was not installed, configured, or invoked.

## Test evidence (offline only)

- `pnpm exec vitest run packages/paypal/src/client.test.ts packages/paypal/src/mapping.test.ts packages/paypal/src/http.test.ts packages/paypal/src/index.test.ts` — **106/106 passed**, 4 files.
- `pnpm --filter @nmi/paypal typecheck` — passed.
- Fresh disposable PostgreSQL 16 cluster (new `/tmp` data directory, isolated port/database; stopped and removed afterward): `apps/api/src/paypal-create-401.pg.test.ts` — **9/9 passed**; `apps/api/src/invoice-drafts.pg.test.ts` — **53/53 passed**; combined **62/62 passed**.
- The fake-transport/PostgreSQL tests exercise HTTP 401, timeout, 5xx, malformed create response, explicit single create, foreign operator, empty search, indexing delay, read-only later reconcile, multiple matches, and exact field mismatches. They do **not** catch the OpenAPI request-location mismatch because the test fixture asserts the same body shape as the adapter.
- No real provider integration, credentials, owner DB, migration, or provider budget was used.
- Required hosted Project Baseline and Stack checks: see the final Draft PR #34 check runs, which must be green at the final PR HEAD before the independent review handoff.

## Remaining provider uncertainties

- Whether the live PayPal Sandbox accepts extra pagination properties in the body and/or ignores them; whether it returns total metadata without the documented query flag.
- Search indexing latency, duplicate invoice-number behavior, and exact search response behavior under real Sandbox load.
- Whether create returns 200 in any supported configuration; OpenAPI documents 201.
- Whether invoice date is echoed consistently on show-invoice and should be included as a required identity field.
- Whether PayPal honors a stable request ID for this operation in current Sandbox despite its omission from the pinned operation schema. It is not relied upon and does not authorize another create.

No uncertainty above may be resolved by using the exhausted authorization. Any provider probe requires a new explicit written owner request with a bounded run id, exact action, and budget.

## Next action

Open a separate remediation task and obtain independent review of the request serialization/completeness fix before any code change is merged. Keep `PAYPAL_DRAFTS_ENABLED=false`, preserve the 1/1 exhausted one-create budget, and never add send/reminder calls. No provider call is recommended as the immediate next step; first fix and offline-verify the documented request contract.
