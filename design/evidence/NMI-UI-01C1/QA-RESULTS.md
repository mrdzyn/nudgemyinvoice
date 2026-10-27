# NMI-UI-01C1 browser authentication journey

Chrome: Chrome/156.0.8078.48 (headless). PostgreSQL: postgres (PostgreSQL) 16.15 (Homebrew) (disposable cluster, destroyed after the run).
Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.
Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment.

**116/116 checks passed.**

| Result | Group | Check | Detail |
| --- | --- | --- | --- |
| PASS | setup | disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy |  |
| PASS | setup | database is a throw-away nmi_test* cluster in a temp directory |  |
| PASS | setup | PayPal drafts disabled, no OpenAI configuration |  |
| PASS | REAL logged-out protection | protected hash deep link lands on the sign-in screen |  |
| PASS | REAL logged-out protection | the server was asked first (GET /api/auth/session -> 401) before anything protected could show |  |
| PASS | REAL logged-out protection | no dashboard, invoice or fixture content is rendered |  |
| PASS | REAL logged-out protection | no demo controls, scenario picker or simulated-login copy |  |
| PASS | REAL logged-out protection | no signed-in header, nav or Sign out |  |
| PASS | REAL logged-out protection | changing the hash afterwards cannot reveal a protected screen |  |
| PASS | REAL logged-out protection | hashchange events are ignored in real mode |  |
| PASS | REAL logged-out protection | password input is empty on mount |  |
| PASS | REAL logged-out protection | no credential or session request was made while logged out |  |
| PASS | REAL logged-out protection | no horizontal overflow on sign-in (desktop) |  |
| PASS | REAL logged-out protection | sign-in text contrast >= WCAG AA (light) |  |
| PASS | REAL keyboard sign-in | first Tab stop is the skip link |  |
| PASS | REAL keyboard sign-in | second Tab stop is the username field |  |
| PASS | REAL keyboard sign-in | empty submit shows field errors without any request |  |
| PASS | REAL keyboard sign-in | focus moves to the first invalid field |  |
| PASS | REAL keyboard sign-in | bad password shows a generic sign-in failure alert |  |
| PASS | REAL keyboard sign-in | exactly one POST /api/auth/login -> 401 |  |
| PASS | REAL keyboard sign-in | password field cleared and focused after the failure |  |
| PASS | REAL keyboard sign-in | username kept, no session created in the database |  |
| PASS | REAL keyboard sign-in | failed password is nowhere in the page or URL |  |
| PASS | REAL keyboard sign-in | error state text contrast >= WCAG AA |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | 503 -> unavailable |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | 429 + Retry-After 17 -> throttled message |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | 400 -> request could not be processed |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | 403 -> generic failure (no detail leaked) |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | 200 with malformed body -> unavailable, never signed in |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | network failure -> offline |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | none of those outcomes created a session |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | while in flight the button is disabled, busy and announced |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | a second submit while pending is ignored |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | session check 503 fails closed to sign-in with an unavailable notice |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | session check offline fails closed to sign-in with an offline notice |  |
| PASS | SIMULATED login outcomes (request interception; server not reached) | the loading state is a polite status announcement |  |
| PASS | REAL successful sign-in | workspace appears after the server accepts the credentials |  |
| PASS | REAL successful sign-in | POST /api/auth/login -> 200 through the same-origin proxy |  |
| PASS | REAL successful sign-in | header names the signed-in operator |  |
| PASS | REAL successful sign-in | workspace states invoice data is still synthetic fixture data |  |
| PASS | REAL successful sign-in | login form and password field are gone |  |
| PASS | REAL successful sign-in | focus moved to the page heading |  |
| PASS | REAL successful sign-in | session cookie is HttpOnly, SameSite=Lax, path /, no Domain widening |  |
| PASS | REAL successful sign-in | cookie is not readable from JavaScript |  |
| PASS | REAL successful sign-in | database has exactly one active session |  |
| PASS | REAL successful sign-in | localStorage, sessionStorage, IndexedDB, Cache and JS cookies are all empty |  |
| PASS | REAL successful sign-in | neither the password nor the CSRF token appears in DOM, URL or console |  |
| PASS | REAL successful sign-in | URL hash carries no screen/state/credentials in real mode |  |
| PASS | REAL successful sign-in | workspace text contrast >= WCAG AA (light) |  |
| PASS | REAL successful sign-in | no horizontal overflow (desktop) |  |
| PASS | REAL protected navigation | keyboard activation of 'New invoice' opens the composer |  |
| PASS | REAL protected navigation | no new auth request was needed to navigate |  |
| PASS | REAL protected navigation | composer keeps text only in memory |  |
| PASS | REAL protected navigation | typed draft text is not in storage or URL |  |
| PASS | REAL protected navigation | hash cannot sign the workspace out or switch screens |  |
| PASS | REAL protected navigation | no horizontal overflow at 390px (mobile) |  |
| PASS | REAL protected navigation | mobile navigation includes Sign out |  |
| PASS | REAL protected navigation | session restored after reload while in dark mode |  |
| PASS | REAL protected navigation | dark theme applied from the system preference |  |
| PASS | REAL protected navigation | workspace text contrast >= WCAG AA (dark) |  |
| PASS | REAL session restore | reload shows the checking status first or restores directly, never the sign-in form |  |
| PASS | REAL session restore | restored with GET /api/auth/session -> 200 and NO login request |  |
| PASS | REAL session restore | no new database session was created by the restore |  |
| PASS | REAL session restore | in-memory composer text did not survive the reload |  |
| PASS | REAL session restore | the hash is ignored on restore (lands on the dashboard, not the composer) |  |
| PASS | REAL Origin/CSRF enforcement | POST logout without X-CSRF-Token -> 403 through the proxy |  |
| PASS | REAL Origin/CSRF enforcement | POST logout with a wrong CSRF token -> 403 |  |
| PASS | REAL Origin/CSRF enforcement | POST logout with a foreign Origin -> 403 even with a valid CSRF token |  |
| PASS | REAL Origin/CSRF enforcement | POST logout with no Origin -> 403 |  |
| PASS | REAL Origin/CSRF enforcement | the session survived every rejected logout |  |
| PASS | REAL Origin/CSRF enforcement | no credentialed CORS grant for a foreign origin |  |
| PASS | SIMULATED pending logout | after click, request held: protected UI, navigation, composer and draft are gone while the request is pending |  |
| PASS | SIMULATED pending logout | after click, request held: a polite 'Signing out' status is shown, not a sign-in form |  |
| PASS | SIMULATED pending logout | three rapid clicks sent exactly one logout request |  |
| PASS | SIMULATED pending logout | the server session is still active while the request is pending (lock is local, revocation continues) |  |
| PASS | SIMULATED pending logout | 403 afterwards -> 'could not be confirmed', never the old workspace |  |
| PASS | SIMULATED pending logout | the UI did NOT claim a completed sign-out |  |
| PASS | SIMULATED pending logout | the database confirms the session really is still active (the warning is truthful) |  |
| PASS | SIMULATED pending logout | the draft text is nowhere in the page after the failure |  |
| PASS | SIMULATED pending logout | transport never answers: protected UI, navigation, composer and draft are gone while the request is pending |  |
| PASS | SIMULATED pending logout | transport never answers: a polite 'Signing out' status is shown, not a sign-in form |  |
| PASS | SIMULATED pending logout | a never-answered logout is bounded: reported unconfirmed after ~10 s |  |
| PASS | SIMULATED pending logout | after the timeout the browser shows sign-in, not the old workspace |  |
| PASS | SIMULATED pending logout | the session is still active server-side (the request never completed) |  |
| PASS | SIMULATED pending logout | a late 204 after the timeout is ignored (notice unchanged) |  |
| PASS | REAL logout | the still-valid cookie restores the session on reload (as the warning said) |  |
| PASS | REAL logout | workspace replaced by sign-in with 'signed out' status |  |
| PASS | REAL logout | POST /api/auth/logout -> 204 with CSRF + Origin accepted by the real server |  |
| PASS | REAL logout | database session is revoked |  |
| PASS | REAL logout | session cookie cleared in the browser |  |
| PASS | REAL logout | audit log recorded login and logout |  |
| PASS | REAL logout | reload after logout stays on sign-in (GET session -> 401) |  |
| PASS | REAL logout | re-entering the protected hash after logout does not reveal protected content |  |
| PASS | REAL logout | after a fresh sign-in no draft from the previous session exists |  |
| PASS | REAL expired / revoked / rotated session | a server-side revoked session is detected when the tab becomes visible and the workspace is dropped |  |
| PASS | REAL expired / revoked / rotated session | the user is told the session ended |  |
| PASS | REAL expired / revoked / rotated session | re-authentication starts with an empty composer |  |
| PASS | REAL expired / revoked / rotated session | password rotation revokes the live session and the workspace is dropped |  |
| PASS | REAL expired / revoked / rotated session | the OLD password no longer signs in |  |
| PASS | REAL expired / revoked / rotated session | the NEW password signs in |  |
| PASS | REAL expired / revoked / rotated session | server session TTL is bounded (<= 8h default) |  |
| PASS | REAL login throttling | the server returns 429 after the account budget and the UI shows it |  |
| PASS | REAL login throttling | the real Retry-After header surfaces as a wait time |  |
| PASS | REAL login throttling | the operator account itself is not locked by guesses at another name |  |
| PASS | GLOBAL audits | every request stayed on the page origin (no PayPal, OpenAI or third-party host) |  |
| PASS | GLOBAL audits | the only API routes touched are the three auth routes |  |
| PASS | GLOBAL audits | no invoice, parse, draft or PayPal API route was requested |  |
| PASS | GLOBAL audits | no console errors or exceptions other than expected HTTP-status resource logs |  |
| PASS | GLOBAL audits | no console message contains a credential |  |
| PASS | GLOBAL audits | the API log never contains the password, session secret or CSRF token |  |
| PASS | GLOBAL audits | the built page carries CSP connect-src 'self' with default-src 'none' and no unsafe-inline |  |
| PASS | GLOBAL audits | the production bundle contains neither the synthetic preview, its controls nor its simulated sign-in |  |
| PASS | GLOBAL audits | the CSP is live in the page under test |  |
| PASS | GLOBAL audits | final storage audit: nothing persisted |  |
| PASS | GLOBAL audits | PayPal drafts remained disabled (no PayPal rows or operations) |  |
| PASS | GLOBAL audits | no invoices were written (fixture-only invoice features) |  |

Screenshots (synthetic data only, no credentials): 01-logged-out-deep-link.jpg, 02-before-bad-login.jpg, 03-bad-credentials.jpg, 04-signing-in-pending.jpg, 05-signed-in-dashboard.jpg, 06-mobile-composer.jpg, 07-dark-dashboard.jpg, 08a-signing-out-locked.jpg, 08-logout-unconfirmed.jpg, 09-signed-out.jpg, 10-session-ended.jpg, 11-throttled.jpg

Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, 400% zoom, a hosted/TLS (`__Host-` cookie) deployment.
