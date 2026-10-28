# NMI-UI-01C5-P0 — PayPal draft operator ownership security gate

- **State:** IMPLEMENTED at `2f208c057ee046dd8037c19f409d7051fe5aa9c1`; READY FOR INDEPENDENT GPT-6 AUDIT. Not self-certified, not merged. C5-P1 (the C5 frontend) is NOT started.
- **Base:** `main` at `568faa0a475af34372520bea5d19e63a4829cb19` (C4, PR #13, independently audited and squash-merged).
- **Branch:** `fix/nmi-c5-p0-paypal-ownership`. Draft PR; Claude implements; GPT-6 audits; owner decides merge.
- **UI design gate:** Not applicable (backend security-only).
- **Provider gate:** NO real PayPal Sandbox, NO OpenAI, no new draft creation, the exhausted one-create budget is neither reset nor bypassed, and `PAYPAL_DRAFTS_ENABLED=false` stays the default.

## Objective

An authenticated operator may trigger PayPal Sandbox draft creation or reconciliation ONLY for an invoice that operator owns. This closes the finding documented in C4: `createPayPalDraft` loaded the invoice with the unscoped `drafts.get(invoiceId)`.

## Change (apps/api only)

`apps/api/src/services/paypal-draft-service.ts`: the first data access is now `drafts.getOwned(input.invoiceId, input.operatorId)`. A foreign, ownerless or unknown invoice returns the existing `{ kind: "not_found" }`, which the route already maps to `404 {"error":"not_found"}`. Because the gate is the first statement that touches data, none of the following run for such an invoice: reading the operation row, returning a stored PayPal invoice id, `reserve`, `claim`, any audit write, any provider call, any reconciliation. For owners nothing else changed.

Not changed (by design): the PayPal provider adapter, money mapping (`assertExactMapping`), the fencing/claim algorithm, the state machine, reconciliation policy, idempotency rules, the route's `503 paypal_disabled` check (which still precedes everything, so a disabled deployment answers owner and non-owner identically), the schema and migrations (none added), dependencies, and configuration.

## Security tests (real disposable PostgreSQL 16 + fake PayPal; `apps/api/src/paypal-ownership.pg.test.ts`, 13 tests)

Two operators exist only in the disposable scratch schema, created by the existing test-only procedure (drop `operators_single_row_uq`, insert operator B with a real scrypt hash); production still allows exactly one operator.

- Owner behaviour preserved: A creates a verified draft for A's invoice and a replay makes no second external call; B equally for B's invoice; an uncertain owner attempt (`unknown`) is reconciled by the same owner (`409 reconciliation_pending`, one search, no second create); 12 simultaneous owner requests still give exactly one create and eleven `409 in_progress`; six foreign requests during an owner's in-flight create get 404 and do not join, refuse or disturb it (the owner still gets `201`, the operation stays A's).
- Cross-operator: A cannot create for B's invoice, B cannot for A's, neither for an ownerless one: always `404 {"error":"not_found"}`; no operation row, no audit row (including `paypal.*`), nothing linked, zero provider calls.
- Indistinguishable: foreign, ownerless, unknown and malformed ids give byte-identical 404 bodies with `no-store`; the foreign body contains neither the invoice id nor any PayPal id.
- Existing PayPal draft id of another operator is never returned (no `replayed`, no remote id); the owner still gets it as a replay.
- Another operator's `pending`/`unknown` operation is inaccessible and every `paypal_draft_operations` row is byte-identical before and after (attempts, state, timestamps); the detail read of that invoice is also 404.
- 20 parallel unauthorized attempts: counts of operations, audit rows and links unchanged; zero provider calls.
- Service-level (not only the route): `createPayPalDraft` returns `{kind:"not_found"}` to a foreign operator even for an already-created draft, with zero provider calls and no row changes.
- Disabled provider: with `PAYPAL_DRAFTS_ENABLED=false` owner, non-owner and unknown ids all get the same `503 paypal_disabled` with no operation row and no external call.

## Evidence (implementation SHA `2f208c057ee046dd8037c19f409d7051fe5aa9c1`)

- **Negative control:** with the check reverted to `drafts.get(input.invoiceId)`, the new suite fails **7 of 13** tests (every cross-operator test, including the in-flight race and the service-level test); the 6 owner-behaviour and disabled-provider tests still pass, as they should. The fix was restored and the suite passes 13/13.
- **Payment state-machine regression (unchanged suites, real PostgreSQL 16.15):** `apps/api/src/invoice-drafts.pg.test.ts` and `packages/db/src/paypal-operation-store.pg.test.ts`: 62 tests passed.
- **Full local gates:** lint, format:check, typecheck, build, bundle scan clean. `pnpm test` without a database: 695 passed, 250 skipped (PostgreSQL-only suites). `pnpm test:db` (real PostgreSQL 16.15): 11 files, 267 tests passed (254 before + 13 new). Skipped tests are reported as skipped, not passed; hosted Stack CI runs them.

## Remaining limitations

Only the C5 backend ownership gate is closed. The C5 frontend (P1) is not built. HTTPS `__Host-` cookie, screen readers, real touch, Safari/Firefox, 400% zoom and a hosted proxy remain untested. Production still enforces exactly one operator, so the gate is defense in depth today; no real PayPal Sandbox call was made.
