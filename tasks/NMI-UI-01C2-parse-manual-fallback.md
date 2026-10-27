# NMI-UI-01C2 — Wire authenticated invoice parsing and manual fallback

- **Status:** OWNER AUTHORIZED TO START 2026-10-27; docs-only task contract. Application implementation NOT STARTED. Stop at Draft PR for independent exact-head GPT-6 audit.
- **Base:** `main` `32d9132be419b48a64455fa79c0fca58f9159b89` (PR #9 owner-authorized squash merge, UI-01C1 authentication).
- **Branch:** `feat/nmi-ui-01c2-parse-manual`.
- **Phase plan:** `tasks/NMI-UI-01C-integration-plan.md`.
- **Design authority:** owner-approved NMI-UI-01A composer/review screens and merged UI-01B shell. No new material layout/design direction.
- **Owner D1–D4:** AG Studio deferred; no browser storage for unsaved data; separate later read-only invoice-list API; saved-draft editing deferred.
- **Security impact:** authenticated POST with CSRF, Origin, cookies; potential customer PII in parsing text; model output untrusted. **No authorization for genuine OpenAI inference or additional PayPal calls.**

## Objective and exact existing contract

Connect the real, logged-in React composer to the EXISTING Fastify `POST /api/invoice-drafts/parse` route, displaying its validated result and supporting clarification and manual fallback, without enabling persistence or PayPal workflows.

Existing route in `apps/api/src/routes/invoice-drafts.ts`:
- Requires server-validated operator session, exact `Origin`, `X-CSRF-Token`; JSON body `{ "text": "<trimmed 1–2000 chars>" }`; same-origin cookies, no-store.
- 200 returns a `ParseOutcome`:
  - `{status:"draft", draft: InvoiceDraft, totals: Totals}`
  - `{status:"needs_clarification", questions:[{field,question}]}`
  - `{status:"invalid", errors:[{path,message}]}`
  - `{status:"unavailable", fallback:"manual_entry", reason:string}`
- 400 invalid input; 401 missing/expired session; 403 CSRF/origin denied; 429 parse budget/busy with `Retry-After`; 503 unavailable and unexpected server/network/invalid-body errors fail closed.
- Without configured `modelClient`, route returns `unavailable` / `ai_not_configured`, **not a synthetic successful AI response**. A fake/injected model client may produce deterministic parse outcomes in local tests only.
- Server computes totals; browser must never trust an arbitrary extra/unknown response field or silently invent currency, date or amount. Respect 6 supported currency codes and exact decimal-string money rules.

## Allowed implementation

1. Extend the web-only typed same-origin API transport (or a new small invoice parse client) with `POST /api/invoice-drafts/parse`, `credentials:"same-origin"`, `cache:"no-store"`, `redirect:"error"`, `Content-Type: application/json` and `X-CSRF-Token` from volatile authenticated state. Browser automatically emits correct Origin; never manually spoof it.
2. Adapt `RealApp` / `Workspace` / `AppProvider` only as needed to make the authorized session token accessible to the composer in-memory. Do not expose CSRF or customer text in DOM, URLs, storage, logs, screenshots or analytics.
3. In **real authenticated mode**, replace synthetic `PARSE_SCENARIOS` / scheduler in the composer with the API call. Keep the old fixture-driven synthetic preview strictly gated behind the existing development-only preview switch. No surprise synthetic fallback on a network/provider error.
4. Distinguish and display draft, clarification, invalid and unavailable. For draft, use only a validated server `InvoiceDraft` to seed the existing review form for human edit/check; never auto-save, send, create PayPal draft, or mark review as provider-verified. For clarification, show the real returned questions, append user answers to the text within the 2,000-character cap and POST to the SAME endpoint again; never fabricate questions.
5. Retain full manual-entry path. It must work even when OpenAI is unconfigured, blocked or offline; manual does **not** call AI.
6. Handle loading, keyboard, focus/aria-live, error recovery, 400/401/403/429/503, offline, invalid JSON, malformed success, expired session and canceled/stale responses. A definite 401 must invalidate operator auth, unmount/clear all in-memory composer/review data and require login; a 403 must fail closed (do not leak CSRF/Origin details or treat as success). Preserve any still-authorized unsaved text across transient failures, but never across logout/session invalidation.
7. Abort work on logout/unmount/tab switch/changed text as appropriate; late parse or clarification responses may never navigate to review, leak old customer details, or resurrect an ended session. Ensure duplicate Parse clicks do not send parallel requests.
8. Update previously blanket `fixture-only` UI labels to say precisely **authentication + parser API are real; unsaved review, save/detail/dashboard/PayPal transitions remain synthetic**. Show a concise disclosure before enabling provider-backed parsing: entered customer information MAY be transmitted to OpenAI **only if the server's model is configured**. Explicitly warn not to paste card numbers or secrets. Do not claim genuine OpenAI tested.
9. Maintain strict CSP `connect-src 'self'`, responsive light/dark, keyboard and approved design system.

## Forbidden scope / stop gates

- No actual OpenAI inference, key configuration, new OpenAI provider smoke or paid request without separate owner approval. For real integration tests inject a controlled fake `InvoiceModelClient` into Fastify; keep a provider-disabled genuine-server fallback test.
- No PayPal Sandbox HTTP calls, no reused one-create authorization, no new draft or send operations; `PAYPAL_DRAFTS_ENABLED=false`.
- No invoice save/detail/list implementation (`01C3`/`01C4`), no PostgreSQL schema/migrations or auth-policy weakening, no real customer data in test/screenshots, no AG Studio dependency, no deployment or merge.
- `apps/api`, `packages/*`, migrations must remain unchanged unless an actual contract mismatch is independently substantiated and owner approval obtained before broadening scope.

## Evidence and acceptance

- Targeted unit tests for strict response parsing, correct POST shape + CSRF + relative URL, 400/401/403/429/503/offline/invalid-body outcome mapping and abort/stale suppression. Verify no silent fallback to synthetic successes.
- Deterministic fake-model API integration: real browser -> production Vite preview strict CSP -> Fastify -> disposable PostgreSQL 16, authenticated cookie/CSRF, sample synthetic parse returns `draft`, clarification returns server questions and re-POST, invalid and unavailable/manual paths. Distinguish mock model from real provider; no OpenAI/PayPal calls or secrets.
- Auth invalidation mid-parse and logout while response delayed MUST NOT restore protected content/review. Double-click sends one request. Manual-entry path makes zero model calls.
- UI manual QA: keyboard and focus/announcements, 390px mobile, dark theme, empty/over-limit text, refused/slow requests; report separately pending Safari/Firefox/assistive-tech/real touch/400% zoom.
- Targeted objective-based tests then required exact-head baseline/Stack CI including PostgreSQL, profile validation, lint, format, typecheck, build, bundle-secret scan, dependency audit. Never mark skipped/not-run as passed.
- Update `docs/STATUS.md`, task evidence, a compact unique `docs/HANDOFFS.md` handoff, and Draft PR with implementation SHA, test counts, network evidence, and exact-head CI. Independent GPT-6 audit required; **no auto-merge or deploy**.

## Delivery

Implement on this branch; open/maintain Draft PR. Stop at READY FOR INDEPENDENT AUDIT and return exact HEAD, evidence, known limitations. C3 and any real provider smoke require separate owner authorization.
