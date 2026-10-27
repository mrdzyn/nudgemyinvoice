# NMI-UI-01C2 — Authenticated invoice parsing and manual fallback

- **State:** AUTHORIZED TO IMPLEMENT, not implemented by this docs-only checkpoint. Stop at independent exact-head audit.
- **Base:** `main` at `32d9132be419b48a64455fa79c0fca58f9159b89` (owner-approved squash merge PR #9).
- **Branch:** `feat/nmi-ui-01c2-parse-wiring`. Draft PR; Claude implements; GPT-6 audits; owner decides merge.
- **Phase plan:** `tasks/NMI-UI-01C-integration-plan.md`; owner-approved design `design/screens/NMI-UI-01A-SCREENS.md`. No new design direction is authorized.
- **UI gate:** NMI-UI-01A owner approved and UI-01B merged; C1 real browser auth merged. Preserve their interaction, accessibility and visual contracts.
- **Owner decisions:** D1 AG Studio deferred; D2 never persist unsaved customer data in browser storage; D3 invoice list needs a later bounded API task; D4 editing previously saved drafts deferred.
- **Security/provider gate:** NO real OpenAI inference and NO PayPal calls/writes are authorized by this task. The already consumed one-create Sandbox smoke budget cannot be reset.

## Objective

An authenticated operator in the **real** React app submits natural-language invoice text to the **existing** Fastify `POST /api/invoice-drafts/parse` route, sees a validated server-origin proposal or clarification/errors/unavailability, and can always enter an invoice manually. This slice must never misrepresent a fixture/model fake as live AI inference or claim drafts are saved to PostgreSQL. The synthetic design-review preview remains synthetic and isolated.

## Existing backend contract — do not change

- `POST /api/invoice-drafts/parse`, existing `app.requireOperator` server session; browser sends relative same-origin URL, `credentials: "same-origin"`, browser-managed HttpOnly cookie, exact `Origin`, `X-CSRF-Token` from authenticated volatile React memory, `Cache-Control: no-store`; body exactly `{ "text": "<trimmed description>" }`.
- `text`: 1–2,000 characters after trimming; **do not** send more than 2,000. Backend validates with strict Zod schema.
- HTTP 200 response **discriminated union** (`packages/shared` / `packages/ai`): `{status:"draft",draft,totals}`, `{status:"needs_clarification",questions:[{field,question}]}`, `{status:"invalid",errors:[{path,message}]}`, or `{status:"unavailable",fallback:"manual_entry",reason}`.
- Other HTTP statuses: `400 invalid_request` with issues, `401 unauthorized`, `403` Origin/CSRF denied, `429` with `Retry-After` (budget or busy), `503` / network failure; no custom provider call from browser. Do not invent response shapes or blindly trust JSON.
- If server-side `modelClient` is absent, **real backend** returns `unavailable/ai_not_configured`. Test-only fake `InvoiceModelClient` may demonstrate the real Fastify/domain pipeline. Fixtures are not proof of genuine OpenAI use.

## Allowed changes

- `apps/web/src`: narrow typed parse client (may extend network allowlist in web boundary tests only for this approved route), runtime response validation, real-mode composer/API wiring, clarification/review presentation, volatile request state, targeted tests, necessary non-material styles.
- Test-only harness or injectable existing API seams to run a browser -> actual Fastify/PostgreSQL auth -> parse journey **without** a provider call, strictly no production fake-model switch.
- `docs/STATUS.md`, `docs/HANDOFFS.md`, active task, sanitized QA/browser evidence.
- `apps/api` or `packages/*` may be read but are **not** in scope for changes; escalate demonstrated contract mismatches rather than silently expanding scope.

## Implementation acceptance criteria

1. **Trust boundary:** real mode calls the real parse endpoint only from an authenticated workspace; preview mode never calls it. A URL hash, scenario chip or reducer action cannot fabricate a real parse success. The real composer clearly distinguishes server responses from synthetic fixture-only save/detail/dashboard and reminds the operator to verify every proposed field.
2. **Transport:** same-origin relative `/api/invoice-drafts/parse` only, exact JSON body, `Content-Type: application/json`, `X-CSRF-Token`, credentials same-origin, `cache:"no-store"`, `redirect:"error"`, abort support. Keep token in memory, never in URL/log/storage/fixture reducer.
3. **Validation:** validate the 200 discriminant and complete nested payload at runtime, including supported currency, decimal-string quantities/amounts, dates, limits, totals and question/error arrays. Invalid/unknown success shapes fail closed without entering Review. Do not reconstruct, sum or FX-convert server totals using JS floats; keep browser calculations explicitly estimates.
4. **Happy path:** `draft` maps only the validated `draft` into existing editable Review, sets source to server/AI proposal (not persisted), preserves the approved field/amount/currency labels, and requires human checking before any later save step. Saving in this C2 build remains visibly **synthetic**, never a real DB persistence claim.
5. **Clarification:** render sanitized/bounded server question text; answer required questions; append answers to original text and **call the same real endpoint again**. No scenario-ID lookup in real mode; enforce total 2,000-character limit after answers. Existing manual entry remains available.
6. **Errors/fallback:** `invalid`/400 display actionable bounded messages; `unavailable` / 503 / offline / malformed 200 offer a manual route without implying a remote request succeeded. `429` reports valid `Retry-After` and does not queue automatic retries. `403` does not leak security detail. No untrusted JSON or raw provider errors rendered as HTML.
7. **Session failure / races:** a definitive 401 must immediately invalidate real auth through the C1 controller and unmount/clear drafts. Abort on logout/session end, tab/window unmount and navigation away; reject duplicate clicks while pending, late responses after abort/epoch change and out-of-order parsing results. No request from an unauthenticated or signing-out state.
8. **Privacy:** do not persist invoice text, names, email, CSRF, response or password in localStorage/sessionStorage/IndexedDB/URLs/console/analytics/screenshots. Disclose that actual server-side AI parsing **may send** description and customer details to OpenAI **when configured**; this increment is not authorized to verify a live provider.
9. **Security regression:** existing auth/login/session/logout, immediate lock, CSP `connect-src 'self'`, origin/CSRF handling, rate limit, currency boundaries and preview-only import guard unchanged; no PayPal or OpenAI model/provider request in test or demo.

## Test objective and evidence

- Targeted typed-client and component/state tests for **all four 200 variants**, schema rejection, empty/overlong descriptions, zero/2000 boundary, malformed JSON, 400/401/403/429/503/offline/abort, manual fallback, question handling, a pending duplicate, response ordering, cancellation and auth invalidation.
- Deterministic fake server-response tests are labelled **SIMULATED**.
- At least one **REAL local** browser -> production web bundle/CSP -> same-origin proxy -> Fastify -> disposable PostgreSQL 16 operator -> parse route run, with CSRF/Origin protection and a real 401/403/429 boundary where feasible. With provider unconfigured, expect genuine `unavailable`; a test-only injected fake model may verify draft/clarification paths through Fastify. Fake model is **not** real OpenAI.
- Keyboard/focus/ARIA, 390px mobile and dark-theme QA on the relevant changed states; existing manual entry works offline without making a parse request. Redacted browser evidence only.
- Run minimal relevant unit/security regressions then repository-mandated validation including exact-head hosted baseline and Stack (PostgreSQL) CI. Record **actual** command/results, SHA and skipped vs passed counts; previous C1 passing evidence is historical, not transferred.
- Keep known untested HTTPS `__Host-` cookie, Safari/Firefox, screen reader, touch, 400% zoom and hosted reverse-proxy gates explicit for demo/release.

## Forbidden scope / stop conditions

No live OpenAI inference or API key use, no PayPal Sandbox create/notify/send/remind/cancel/refund/payment requests, no DB migration, no invoice saving/detail/list wiring (C3/C4), no AG Studio, no new design redesign, no editing saved drafts, no server auth-policy weakening, no production deploy/merge. Do not remove synthetic labels on screens still backed by in-memory fixtures. On contract mismatch or newly needed provider call, stop and escalate rather than enlarge scope.

## Delivery

Implement on the **existing branch** and update the **existing Draft PR**, not a parallel PR. Reconcile stale C1 status on the working branch, append unique `NMI-UI-01C2-IMPL` handoff at completion, report implementation SHA and docs-only head if applicable, test evidence, and request exact-head independent GPT-6 audit. Do **not** self-certify, merge, deploy or start C3.
