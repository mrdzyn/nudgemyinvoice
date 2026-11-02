# NMI-PROTOTYPE-10D-A3 — Offline PayPal Investigation

- **Status:** Investigation complete; docs-only Draft PR. No payment implementation changes.
- **Prepared:** 2026-11-02 (Asia/Manila)
- **Base:** `main@dd6d5723eadba5c55afe9d0a6912f1510b2bb9de`
- **Branch:** `docs/nmi-prototype-10d-a3-paypal-offline`
- **Design gate:** Not applicable (no user-facing change).
- **Objective:** Independently test the existing PayPal Sandbox invoice-draft flow using deterministic local fakes and a freshly initialized disposable PostgreSQL cluster; compare the adapter with dated official PayPal Invoicing v2/OpenAPI and PayPal AI Toolkit material.
- **Verdict:** **DEFECT REPRODUCED** (offline API-contract mismatch in search pagination serialization; see report). No PayPal/OpenAI/SMTP request was made.

## Scope and constraints

Inspect only existing draft-create behavior, reconciliation, ownership/authorization, local-only notification boundary, tests/evidence, and official API/developer guidance. Record compatibility and provider uncertainties. This is an investigation/documentation task; any application fix is a separately scoped remediation task with independent review.

No credentials, provider authorization reset, MCP installation/invocation, real provider request, owner database use, Render resource, deployment, merge, or change to `PAYPAL_DRAFTS_ENABLED=false`. Historical PayPal one-create authorization remains exhausted (1/1). Do not retry a create based on `PayPal-Request-Id`.

## Acceptance criteria

- [x] Confirm an explicit authenticated operator confirmation is the only UI path to the backend create POST; server checks ownership before provider access and persists/fences intent.
- [x] Offline tests establish at most one create POST per operation, including create-side 401, timeout, 5xx, malformed success response; ambiguous outcomes reconcile through reads only.
- [x] Verify empty/delayed search fails closed and later reconciliation does not blindly create again.
- [x] Verify read-back checks DRAFT, currency, exact amount, due date, invoice number, and local reference.
- [x] Compare current request/response handling to official dated references and toolkit guidance without installing or invoking MCP.
- [x] Record exact test evidence, reproduced defects, unresolved provider questions, and a bounded next action.
- [x] Update STATUS and handoff; open one Draft PR and verify both required hosted checks at the final exact HEAD.

## Offline evidence

All evidence used synthetic fixtures and a fresh PostgreSQL 16 cluster under `/tmp`, with `TEST_DATABASE_URL` pointed only at the disposable DB and `REQUIRE_DB_TESTS=1`. No owner/local database was used; the temporary cluster was stopped and removed.

- `pnpm exec vitest run packages/paypal/src/client.test.ts packages/paypal/src/mapping.test.ts packages/paypal/src/http.test.ts packages/paypal/src/index.test.ts` — **106/106 passed**, 4 files.
- `pnpm --filter @nmi/paypal typecheck` — **passed**.
- `apps/api/src/paypal-create-401.pg.test.ts` — **9/9 passed** on disposable PostgreSQL 16.
- `apps/api/src/invoice-drafts.pg.test.ts` — **53/53 passed** on disposable PostgreSQL 16.
- Combined PostgreSQL target — **62/62 passed**, 2 files.
- `git diff --check` and changed-document Prettier check — must pass on final PR revision.
- Hosted Project Baseline and Stack workflows — final exact-HEAD results recorded in PR checks; both required checks must be green before handoff.

These are local deterministic fake-transport/database observations, not a claim about live PayPal Sandbox behavior.

## Findings and next action

See `docs/NMI-PROTOTYPE-10D-A3-PAYPAL-OFFLINE-REPORT.md`. The reproduced issue is that the current adapter places `page`, `page_size`, and `total_required` in the JSON search body; the pinned official OpenAPI defines them as query parameters. As a result, locally tested completeness protection assumes response metadata that this request does not contractually ask the server to return. Search results are used for duplicate-number reconciliation, so uncertainty must remain fail-closed.

Create a separate narrow remediation task: serialize search pagination controls per the official contract and reject search responses whose completeness cannot be established; update fake tests to assert query parameters and missing/incomplete metadata behavior. Preserve at-most-one create, read-only reconciliation, owner scoping, Sandbox host allowlist, and local-only notifications. Also assess whether remote `invoice_date` should be part of required read-back identity verification; current tests prove exact `due_date` verification, not `invoice_date` verification. Do not run live provider tests without new explicit written authorization.
