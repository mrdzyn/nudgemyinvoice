# NMI-UI-01C1 — Wire Browser Operator Authentication and Session

- **Status:** IMPLEMENTED at `e7ee3e33aefc17f68d76d1fdc458e5ab22d66f17`; READY FOR INDEPENDENT AUDIT (not self-certified). Do not merge, deploy or start C2 without separate owner authorization.
- **Base:** `main` `a4520440c748ff8712a10e9f65b389e8cde5db9c` (PR #8 squash merge).
- **Branch:** `feat/nmi-ui-01c1-auth-session`. **PR:** Draft, implementation by Claude; independent review by GPT-6.
- **Design gate:** Already approved NMI-UI-01A (PR #7); implement inside accepted React UI-01B visual structure without a new design phase.
- **Phase plan:** `tasks/NMI-UI-01C-integration-plan.md`.
- **Owner controls:** D1 defer AG Studio; D2 no browser persistence of unsaved data; D3 later separate listing API; D4 defer existing-draft editing.
- **Security impact:** high: cookies, authorization, CSRF, origin, preflight and expiring sessions. PayPal and OpenAI provider interactions remain forbidden.

## Test objective

Prove a real browser can log in through the existing server-side operator route, restore an authenticated session from the secure HttpOnly cookie, access protected application navigation, and log out or expire without revealing or retaining credentials/customer drafts; unauthenticated hash/direct navigation must never produce authenticated data or simulated sign-in.

## Allowed scope

- `apps/web/src` login, app/session state, minimal API transport, in-memory auth context, navigation guards, UI tests and associated styles.
- `apps/web/vite.config.ts`: development-only same-origin `/api` proxy and production CSP adjustment to permit ONLY same-origin API connections.
- Targeted browser and API/auth boundary regression tests, documentation and required evidence.
- `apps/api` only if a demonstrated, narrowly approved contract mismatch is found; do not change authentication policy, existing server origins/CSRF requirements or database schema merely for convenience.

## Server contract (already implemented)

- `POST /api/auth/login` JSON `{username,password}`: 200 `{operator:{id,username},csrfToken,expiresAt}` and HttpOnly same-site session cookie. Errors: 400 invalid request, 401 invalid_credentials, 429 too_many_attempts with Retry-After, 503 unavailable.
- `GET /api/auth/session`: validates server-side cookie; 200 same session payload; 401 unauthorized; 503 unavailable. Cache-Control no-store.
- `POST /api/auth/logout`: must include `X-CSRF-Token` and same-origin Origin; 204, revoked server-side cookie. 401/403/503 handled fail closed.
- Backend `apps/api/src/app.ts` CORS permits credentialed requests only from exact configured `WEB_ORIGIN`. ALL mutating requests require exact `Origin`; authenticated mutations require `X-CSRF-Token`. Never bypass either.
- Browser should use same-origin relative `/api` URLs; dev Vite proxy `/api` to `http://127.0.0.1:3001` (document exact `WEB_ORIGIN`, e.g. `http://localhost:5173`) and design a same-origin `/api` reverse proxy contract for later hosting. No absolute provider URLs or browser-accessible server secrets.

## Required implementation behaviors

1. Split REAL authenticated mode from synthetic review mode at a firm trust boundary. Real mode MUST default to secure login+session; fixture scenario controls, URL hash, direct deep links, demo reducer `navigate` and `authed=true` cannot bypass this guard. The standalone synthetic preview may remain only behind an explicit, clearly labelled development-only toggle, never treated as real auth. Do not silently fall back to demo upon API error.
2. On initial load, fetch `GET /api/auth/session` before any protected UI is revealed. Handle pending, 401, 429/503/offline; no cached credential or stale unauthorized content. Treat the server as the sole authority.
3. Submit username/password through `POST /api/auth/login`, same-origin, with JSON and browser-managed HttpOnly cookies; do not retain, log, send to analytics, encode in URLs or serialize credentials. Keep empty password input on mount; clear password immediately after completion/error/abort.
4. Store `csrfToken`, operator ID/username and expiry only in volatile React memory. On logout call protected `POST /api/auth/logout` with CSRF and Origin as the browser emits. Never read cookie JS-side or persist CSRF in storage. Handle stale responses and request cancellation.
5. On 401/session invalidation, drop ALL in-memory customer/draft/composer/review/session data and require re-authentication. On logout failure do not falsely assert server-side revocation; block local protected access and report the remote session could remain valid until revoked/expired. No mock fallback.
6. Keep all invoice parse/save/detail/dashboard provider operations fixture-only for this C1 increment, labelled unambiguously. Do NOT mix real operator authentication with a fake claim of backend invoice persistence.
7. Replace shell-only production `connect-src 'none'` with narrowly scoped `connect-src 'self'` (or a proven exact origin if required); maintain `default-src 'none'`, no unsafe-inline, no third-party endpoints, CSP no exfiltration. Preserve cookie, Origin, CSRF, logging/redaction rules.
8. Read-only `GET /health` may be used for local diagnosis but does not count as proof of authentication.

## Required targeted tests and QA

- Typed API response/error handling and real browser login/session bootstrap with a disposable provisioned local PostgreSQL operator (never commit real username/password or use live data).
- Protected URL/hash navigation while logged out never exposes dashboard/invoice contents or protected actions. No React reducer or DemoControls auth bypass.
- Invalid credentials 401, rate-limit 429 with Retry-After, server/down 503, aborted request, expired/rotated session, cookie mismatch, CSRF failure on logout (403), successful logout (204) and auth restore on refresh.
- Loading/error/offline screen-reader announcements and focus management; keyboard-only route, mobile viewport and dark theme.
- No credential/cookie/CSRF/customer data in `localStorage`, `sessionStorage`, IndexedDB, URL hash, console logs, screenshots, app analytics, or source. Browser never fetches PayPal/OpenAI.
- At least one genuine locally isolated browser-to-Fastify/PostgreSQL authentication journey, plus targeted CI tests. Distinguish simulated browser tests from real DB evidence. No production data or remote-provider requests.
- Use `docs/TESTING.md` objective-based minimal local checks, then required exact-HEAD CI. Report actual counts and screenshots, and manual QA exclusions honestly. Never disable or weaken tests to get green.

## Forbidden scope

No invoice parse/save/list/detail wiring; no PostgreSQL changes/migration; no AG Studio dependency; no PayPal API calls or enabling Sandbox writes; no OpenAI calls; no sending, payments, refunds, approval grants, reminders, cron, webhooks or deployment; no new account-registration workflow; no production configuration changes.

## Delivery

Implement on this branch (do not create parallel unrelated PRs), update status and append a unique handoff without rewriting earlier history, record local+hosted CI at the exact implementation HEAD, open/maintain Draft PR to `main`. Stop at **READY FOR INDEPENDENT AUDIT**. Do not merge, deploy, start C2 or call providers without separate owner authorization.

## Implementation record (implementation SHA `e7ee3e33aefc17f68d76d1fdc458e5ab22d66f17`)

- **Web (`apps/web/src`):** `auth/api.ts` (only module that calls `fetch`; three relative `/api/auth/*` routes; typed fail-closed results), `auth/authState.ts` (pure state; `authenticated` only from a validated server payload; epoch bump on every end of session), `auth/useAuthController.ts` (restore, expiry timer, re-check on tab visibility, login, honest logout), `RealApp.tsx` (root; protected `Workspace` keyed by epoch; `isBlockedInRealMode` denies `sign-in`, `sign-out`, `scenario` and navigation to `login`), `features/login/RealLoginScreen.tsx`, `screens.tsx`, small `AppShell`/`AppContext` additions (real operator name, real sign-out, fixture-data notice; the brand control is not focusable before sign-in).
- **Boundary between real and synthetic:** `main.tsx` mounts `RealApp` by default. The synthetic preview (`App.tsx`: demo controls, hash routing, simulated sign-in) loads only from the dev server with `VITE_NMI_SYNTHETIC_PREVIEW=1` behind a build-time `import.meta.env.DEV` guard and is absent from production bundles (asserted by tests and the browser journey). It is never a fallback for an API error.
- **Vite:** production CSP `connect-src 'self'` (everything else unchanged); `server.proxy` and `preview.proxy` forward `/api` and `/health` to `http://127.0.0.1:3001` (overridable with the non-bundled `NMI_API_ORIGIN`). `WEB_ORIGIN` must equal the page origin: `http://localhost:5173` (dev) or `http://localhost:4173` (preview). See `docs/ARCHITECTURE.md`.
- **Not changed:** `apps/api`, `packages/*`, migrations, authentication policy, server Origin/CSRF/cookie rules, invoice features (still fixtures), PayPal/OpenAI (no configuration present in any test).
- **Deliberate behaviours to audit:** (1) a 403 on login reads as a generic "incorrect" failure so no Origin/CSRF detail leaks; (2) a transient 503/offline during a periodic session re-check keeps the workspace (only a definite 401 or local expiry drops it), whereas on the initial load or at logout any non-success fails closed; (3) a failed/unconfirmed logout locks this browser but warns the server session may remain valid (proved real in the journey: a reload restores it); (4) the Retry-After value is shown but the submit button is not disabled for that period.

### Validation actually run (local, at `e7ee3e3`)
- `pnpm lint`, `format:check`, `typecheck`, `build`, `check:bundle` and `scripts/validate_project_profile.py`: pass.
- `pnpm test`: **364 passed, 187 skipped** (the skipped files are the real-PostgreSQL suites, which need `TEST_DATABASE_URL`; they exercise `apps/api` and `packages/db`, which this task did not change, and run in hosted Stack CI). Web portion: 128 tests across 9 files (new: `auth/api.test.ts`, `auth/authState.test.ts`, `RealApp.render.test.tsx`, extended `boundaries.test.ts`).
- Real browser journey `design/evidence/NMI-UI-01C1/run-auth-journey.mjs`: **105/105 checks** in headless Google Chrome against the production build (strict CSP) via `vite preview`, the real Fastify API and a disposable PostgreSQL 16.15 cluster migrated with `0000`-`0006` (destroyed after the run; random operator password and session secret, never written). REAL groups: logged-out deep link and hash cannot reveal anything; keyboard sign-in, 401, empty-field validation; successful sign-in (HttpOnly/SameSite=Lax cookie, empty storage, no credential/CSRF in DOM/URL/console/API log); keyboard navigation, mobile 390px, dark theme; refresh restores with no new login and no new DB session; server enforcement of missing/wrong CSRF, foreign Origin and missing Origin (403, session survives); real logout 204 + DB revocation + cookie cleared; a revoked session and a rotated password drop the workspace and drafts; real 429 with Retry-After. SIMULATED groups (request interception, server not reached): login 503/429/400/403/malformed-200/offline, session-check 503/offline, pending state, and a 403 logout (then the DB confirms the session really was still active). Screenshots are synthetic-data only.
- **Evidence gap, stated plainly:** the journey uses `localhost` over HTTP, so the `__Host-` Secure cookie variant used when `WEB_ORIGIN` is https/production was NOT exercised in a browser. Screen readers, real touch, Safari/Firefox and 400% zoom are untested. The earlier `design/evidence/NMI-UI-01B/run-browser-qa.mjs` drove the synthetic shell as the default page and no longer applies to the production build (superseded here; its 01B results remain historical).

### Hosted CI at `e7ee3e3`
- Project baseline / Common validation: PASS (run 40458040856). Stack validation: PASS (run 40458040859).
