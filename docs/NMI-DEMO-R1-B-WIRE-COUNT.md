# Gate B — Local outbound PayPal request counting (DRAFT; NOT VALIDATED)

> **Do not run a real provider test using this document yet.** The production PayPal retry fix was independently audited and merged on `main` at `09bbe90a977516c27bc0715141e74e090b41fba5` (PR #19, review `5692753316`). The observation method below has **not been validated under the NudgeMyInvoice Node/tsx application launch**. Gates A and C remain NOT AUTHORIZED; **Gate B remains BLOCKED / NOT AUTHORIZED pending observer offline verification, independent audit, owner merge of this documentation and an entirely new written Request B**. Historical PayPal Sandbox create budget: **1/1 exhausted**.

## Evidence gap

The following are complementary but cannot substitute for observing the server's outbound HTTP request:

| Source | What it supports | What it does NOT prove |
| --- | --- | --- |
| Browser DevTools | One browser-to-Fastify create confirmation | How many HTTP create requests the server sent to PayPal |
| PostgreSQL `paypal_draft_operations.attempts=1` | One durable claim/fence | Number of actual transport sends or internal retries |
| Counting fake transport + PostgreSQL tests | The reviewed FIX-B1 client emits at most one create per invocation | What happened at a real Sandbox host |
| Sandbox dashboard before/after count N→N+1, status DRAFT, matching USD 540.00 | One matching remote draft is visible | There was exactly one attempted HTTP create; duplicates/errors may be invisible or delayed |
| Local-only `undici:client:sendHeaders` observer (proposed) | A counted outgoing HTTP send **attempt** for the exact method, path and Sandbox origin | Guaranteed provider receipt or a completed/accepted operation |

## Chosen proposed observer design

The production HTTP transport (`packages/paypal/src/http.ts`) calls the Node `fetch()` implementation; the production server entry point is `apps/api/src/server.ts` and its command is `pnpm --filter @nmi/api start` (`tsx src/server.ts`). Node's Undici documents an experimental diagnostics-channel event `undici:client:sendHeaders`, emitted immediately before the first outgoing request bytes are written to the socket. See https://undici.nodejs.org/api/DiagnosticsChannel .

For the **future separately authorized owner-run local test**, prepare an individually reviewed CommonJS preload outside the repository (for example an ephemeral, owner-only temp directory) loaded via Node `--require` / `NODE_OPTIONS`. Subscribe only to `undici:client:sendHeaders`. Handle **only** the structured fields `request.origin`, `request.method`, `request.path`. Never open, log, access, retain, serialize or write the `headers` event field (it contains bearer credentials), `request.headers`, request body, response, cookies or request object. Do not override `fetch` or dispatcher or change request contents. Aggregate integer counters in memory for these **exact** operations on `https://api-m.sandbox.paypal.com`:

- `POST /v2/invoicing/invoices` — CREATE; accepted expected **1** only after a separate Permit B and actual create.
- `POST /v1/oauth2/token` — OAuth; record count separately.
- `GET /v2/invoicing/invoices/<syntactically valid remote id>` — SHOW; counter only, never the ID.
- `POST /v2/invoicing/search-invoices` — READ-ONLY SEARCH; counter only, never search contents.

Count an `unexpected` bucket for any other observed Sandbox method/path or query, and **stop** on nonzero unexpected. Never permit a Live `paypal.com` origin. On orderly process exit output only one **sanitized aggregate summary** for the correct actual API PID and one run ID. The owner reviews this line and copies only the redacted counts to Template B. Do not write a raw diagnostic dump or capture all process logs.

**Do not** use `NODE_DEBUG`, `curl -v`, system-wide packet capture, TLS interception proxies, recorded raw request headers, browser network exports/HAR, or PayPal dashboard screenshots containing account identifiers to attempt request counting.

### Mandatory offline proof (agent may perform without credentials)

1. **Provenance:** state exact reviewed observer code, SHA-256 hash, Node version, whether the Node 24+ runtime supports the diagnostic channel, PID and exact `pnpm --filter @nmi/api start` child-process shape.
2. **Positive loopback test:** with zero PayPal/OpenAI credentials and `PAYPAL_DRAFTS_ENABLED=false`, demonstrate an actual Node `fetch` to a disposable loopback HTTP server emits `undici:client:sendHeaders`. The test-only listener may accept a loopback origin **only** in an isolated offline test, not in the future real run.
3. **Filtering tests:** verify single send = CREATE 1, double send = CREATE 2 (STOP), OAuth/search/show do not count as CREATE, unexpected path increments unexpected and STOP, first 401 does not imply observer resend, summary has no secret/PII fields. Test the exact observer to be used, not a separate implementation.
4. **Application-process attachment:** verify that `NODE_OPTIONS` loads the observer into the actual Fastify process, not merely the pnpm/tsx parent. With `PAYPAL_DRAFTS_ENABLED=false` the *production* entry point must start and the observer must print a recognizable API-process active marker and an orderly summary, still **0 create**. If this needs a production code change, stop and request a new separately approved task instead of silently modifying it.
5. **Robustness:** verify interrupt/Ctrl-C, signal handling, process-exit summary, multiple Node processes, observer failure behavior, concurrent requests, and mismatch between summary count and what was witnessed. Every absent/ambiguous/unverified observation is **PENDING/STOP**, not zero and not PASS.
6. **Only after independent GPT-6 audit and owner authorization** may the observer be used during a real Sandbox test. Before clicking create, require count 0, allow one click, then read-only verification and immediate teardown; **no second create on any outcome**. Record the final total: CREATE=1, unexpected=0, exact approved observer hash, API PID, run ID, no secret exposure, plus one browser POST/operation row and DRAFT N+1. If the API exits before a trustworthy summary, STOP and do not retry.

### Important limits

The diagnostic send event is emitted just before socket write; it is **stronger than a fake-transport assertion** but is **not proof of remote arrival**. PayPal's read-only dashboard and exact state checks corroborate the result. When transport and provider disagree, record **REAL FAIL / PENDING** and stop. Node/Undici diagnostics-channel API is experimental: re-verify on the exact runtime.

**No observer, executable script, key, account access, live request, DB change, deployment or Render resource has been created by this planning document.** A later agent must provide the exact audited offline-tested preload and pasteable setup/teardown blocks **in this Markdown document**, with a reviewer confirming that its source is safe and that the observer was attached to the actual API process. Never rely solely on the existence of these paragraphs to assert the procedure is ready.

## Proposed run evidence fields (blank until permit / live execution)

Run ID: PENDING; merged FIX-B1 SHA: `09bbe90a977516c27bc0715141e74e090b41fba5`; observer-reviewed SHA-256: PENDING; offline positive/negative tests: PENDING; Node version: PENDING; actual API PID: PENDING; observer-active marker: PENDING; pre-click CREATE count: PENDING; post-stop CREATE count: PENDING; OAuth count: PENDING; SHOW count: PENDING; SEARCH count: PENDING; unexpected count: PENDING; browser POSTs: PENDING; durable attempts: PENDING; Sandbox draft-count delta: PENDING; draft status/currency/total/due date: PENDING; teardown: PENDING; secret review: PENDING; overall Gate B: **PENDING / BLOCKED**.

## Operator and acceptance constraints

The future approved invoice stays the single synthetic Northwind Studio USD 540.00 due 2030-01-15; credentials stay owner-only and are entered silently. No OpenAI key during Gate B. `PAYPAL_DRAFTS_ENABLED` is false before and immediately after the separately approved run. Historical USD 5.00 budget does not reset. Do not create a draft for instrument-test purposes or for video retakes.

This does **not** authorize Gate A, Gate B, Gate C, Render hosting, billing changes, YouTube upload or Devpost submission.
