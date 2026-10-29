# NMI-DEMO-R1-FIX-B1 — PayPal Sandbox DRAFT 401 no-resend boundary

- **State:** READY FOR IMPLEMENTATION; no production code change or provider call has been made in this initial preparation commit.
- **Starting main:** `85470d9a5fef15b260f9e1c52673a7e2c7d03824` (NMI-DEMO-R1 documentation, PR #18 owner squash-merged after independent audit review `5692461625`).
- **Branch:** `fix/nmi-demo-r1-fix-b1-paypal-create-retry`; **one Draft PR**; owner must separately approve squash merge after independent GPT-6 exact-head audit.
- **Source of requirements:** `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` §5.0, `docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md` Request B, existing PayPal operation state-machine invariants, `AGENTS.md`, `docs/TESTING.md`, `docs/SECURITY.md`.
- **Authority:** Owner's “Next” initiates this **local bounded code-fix work** only, not a new PayPal create permit, a provider acceptance run, deployment, Render provisioning, or any payment operation.

## Background / exact bug

`PayPalSandboxClient.call(method, path, ..., retryOn401=true)` in `packages/paypal/src/client.ts` automatically gets a new OAuth token and **resends the same request** on HTTP 401. `createDraftInvoice` uses this helper with default `retryOn401=true`, so a single service invocation may send **two `POST /v2/invoicing/invoices` requests**. `packages/paypal/src/client.test.ts` currently asserts two create POSTs on a repeated 401. Neither one browser POST nor one durable operation row and `attempts=1` proves only one provider egress request.

**Additional discovered consequence:** `apps/api/src/services/paypal-draft-service.ts` maps `PayPalRejectedError` to durable `rejected`, while `packages/db/src/paypal-operation-store.ts` allows `rejected` to be claimed again in **create** mode. A non-retried create 401 alone would therefore still allow a later browser request to send another create. This task must close that path **without weakening** existing rejected-state handling for genuinely preflight-failed calls or other definite rejections.

## Objective

Prove that **one fenced PayPal DRAFT create invocation emits at most ONE provider-level `POST /v2/invoicing/invoices` HTTP request**, including OAuth refresh, 401, timeout, 5xx, malformed replies and concurrent duplicate requests; after an uncertain or create-attempted 401, any follow-up is read-only reconciliation, **not another create**. Preserve all existing Sandbox, ownership, idempotency, authorization and no-money-movement guarantees.

The guarantee is per bound operation, including an attempted create; do **not** claim that browser DevTools counts server-to-PayPal egress. The Gate B live procedure remains **BLOCKED** until this PR independently passes, owner merges it and the separate real-provider Request B is freshly authorized.

## Bounded implementation

1. **Adapter:** Refactor `packages/paypal/src/client.ts` so create-DRAFT explicitly disables the HTTP 401 resend. Pre-create OAuth `accessToken` may be obtained/refreshed before POST. A single call to `createDraftInvoice` must not send a second create on any status/exception. Keep existing one-refresh-on-401 behavior for *non-mutating reads*, including `GET /v2/invoicing/invoices/:id` and the logically read-only `POST /v2/invoicing/search-invoices`. If simplifying `call`, ensure it is impossible for a future mutating POST to accidentally use the resend default.
2. **Fail closed across browser re-entry:** For an HTTP 401 returned **after a draft-create POST was sent**, choose an explicit conservative outcome (recommended: `PayPalOutcomeUnknownError("http_401")`) so the service records **unknown** and future requests perform **read-only reconciliation**. Do not mark it `rejected` if that makes the durable operation re-enter create mode. For OAuth 401 **before** the create POST, continue to record a definite preflight rejection with zero egress creates. Preserve existing distinctions for other confirmed rejection/status cases; no broad state-machine changes.
3. **No money / privacy scope creep:** Keep the `guardRequest` exact Sandbox allow-list and hostname; fixed `PAYPAL_DRAFTS_ENABLED=false` default; ownership `getOwned` before any operation access; audit and fencing, request-number/digest/date, strict validation and read-only reconciliation; no send, remind, cancel, refund, payment, webhooks or Live host. No credentials in code, tests, logs or screenshots. Continue fake transport injection only.
4. **Tests:** Update the existing 401 test to expect exactly one provider create POST and the expected error kind. Add counted-transport tests for create 201, 401, timeout, 5xx, malformed 201 body and OAuth failure before any create; assert **at most one** create POST for every case while safe read/search 401 refresh remains. Add targeted service/integration tests with disposable PostgreSQL (where necessary) that one create 401 leaves `attempts=1`, no erroneous `created` or linked remote ID, then an authenticated second request performs read-only search/get or returns `reconciliation_pending` **without a second provider create**. Add a negative control proving the tests fail when 401 resend is re-enabled. Preserve previously valid C5-P1/browser semantics.
5. **Documentation:** Mark FIX-B1 implemented **only after code and tests exist**. Update task/STATUS/handoff, the acceptance §5.0 and Gate B blocker text to say “code implemented on Draft PR, **Gate B remains BLOCKED pending independent audit, merge and new Request B**”; do not fill authorization forms or evidence templates with results and do not claim REAL PASS. After a later owner squash merge, a separate documentation step must cite the merged fix SHA and adjust the real-provider wire-count evidence mechanism before any live Gate B call.

## Allowed files

- `packages/paypal/src/client.ts`, `packages/paypal/src/client.test.ts` and only directly necessary local PayPal types/helper tests.
- `apps/api/src/services/paypal-draft-service.ts` **only if required** to protect 401 fail-closed classification; targeted `apps/api/src/*paypal*.pg.test.ts` / `invoice-drafts.pg.test.ts` as necessary for service and operator isolation evidence.
- Relevant `docs/STATUS.md`, `docs/HANDOFFS.md`, `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`, `docs/NMI-DEMO-SUBMISSION-CHECKLIST.md`, `docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md` (status only, no answers), and this task.

**Forbidden without a new owner decision:** Schema/migrations, `packages/db/` state-machine changes, React dashboard/composer, API route or auth/CSRF contract, unrelated tests/code, other provider integrations, new dependencies, OpenAI retry change, Render hosting/deployment, static production demo mode or actual provider use. Escalate if the fix truly requires a forbidden change.

## Verification and stop rule

- Run **smallest targeted automated** PayPal client/service tests to prove one-create egress and safe reconciliation, then applicable PostgreSQL integration tests against a **disposable local** DB, followed by required repository CI/security checks. Use deterministic fake `HttpTransport` only. Verify the existing unit's “two create POSTs” expectation is replaced and negative control demonstrates failure when retry is restored; preserve safe read-only 401 tests and other known failure paths.
- Record exact implementation SHA, final PR HEAD, targeted test evidence, any CI IDs, impact on status/error/reconciliation semantics, and any remaining manual QA. Do not claim tests not run.
- Keep **Draft PR**, request independent GPT-6 exact-head audit, and do **not** merge without explicit owner approval. **No real PayPal or OpenAI requests, no PayPal create budget reset, no credential access, no publishing/deployment/Devpost submission, no Render provisioning.**

## Agent handoff

Active handoff: **NMI-DEMO-R1-FIX-B1-START** in `docs/HANDOFFS.md`. Coding agent proceeds on this existing branch/PR only, then reports for independent exact-head security review.
