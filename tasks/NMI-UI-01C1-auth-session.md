# NMI-UI-01C1 — Wire Browser Operator Authentication and Session

- **Status:** AUTHORIZED TO IMPLEMENT on feature branch; not implemented by this planning checkpoint. Stop at independent audit.
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
