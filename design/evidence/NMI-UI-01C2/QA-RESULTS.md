# NMI-UI-01C2 browser parse-wiring journey

Chrome: Chrome/156.0.8078.48 (headless). PostgreSQL: postgres (PostgreSQL) 16.15 (Homebrew) (disposable cluster, destroyed after the run).
Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.
Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; the draft/clarification paths use a deterministic TEST-ONLY FAKE model client (not OpenAI) behind the real Fastify routes.

**88/88 checks passed.**

| Result | Group | Check | Detail |
| --- | --- | --- | --- |
| PASS | setup | disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy |  |
| PASS | setup | database is a throw-away nmi_test* cluster in a temp directory |  |
| PASS | setup | PayPal drafts disabled; OPENAI_API_KEY/OPENAI_MODEL empty (no provider can be reached) |  |
| PASS | REAL logged-out protection | a composer deep link shows only the sign-in screen |  |
| PASS | REAL logged-out protection | no parse request is possible or made while logged out |  |
| PASS | REAL composer opens with no request | opening the composer makes no parse request |  |
| PASS | REAL composer opens with no request | real composer has no fixture example prompts and no 'preview only' wording |  |
| PASS | REAL composer opens with no request | real composer says parsing calls the server and saving is simulated |  |
| PASS | REAL composer opens with no request | privacy disclosure and 'live provider not verified' note present |  |
| PASS | REAL composer opens with no request | shell labels fixture data |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | a validated server draft opens the editable Review screen |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | exactly one POST /api/invoice-drafts/parse -> 200 with the CSRF header |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | request body is exactly { text } (trimmed) |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | the fake model was called once (no provider exists) |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | fields come from the server draft |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | Review says it is a server proposal, not saved, and saving is simulated |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | totals are labelled estimates |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | nothing was written to invoices/approvals by parsing |  |
| PASS | REAL parse -> review (deterministic FAKE model, not OpenAI) | no horizontal overflow on Review (desktop) |  |
| PASS | REAL clarification and re-parse (FAKE model) | needs_clarification renders the server question |  |
| PASS | REAL clarification and re-parse (FAKE model) | answers are appended and the SAME real endpoint is called again |  |
| PASS | REAL clarification and re-parse (FAKE model) | second request is a real POST with the original text plus the answer |  |
| PASS | REAL clarification and re-parse (FAKE model) | resulting review carries the answered due date |  |
| PASS | REAL error outcomes from the server (FAKE model) | unsupported currency -> invalid message, no review |  |
| PASS | REAL error outcomes from the server (FAKE model) | BADCURRENCY: manual entry is offered |  |
| PASS | REAL error outcomes from the server (FAKE model) | malformed model output -> invalid, no review |  |
| PASS | REAL error outcomes from the server (FAKE model) | BADSHAPE: manual entry is offered |  |
| PASS | REAL error outcomes from the server (FAKE model) | model outage -> unavailable (not 'not configured') |  |
| PASS | REAL error outcomes from the server (FAKE model) | MODELDOWN: manual entry is offered |  |
| PASS | SIMULATED request failures (interception; server not reached) | 429 with Retry-After 42 reports the delay and does not retry |  |
| PASS | SIMULATED request failures (interception; server not reached) | 429 produced exactly one request (no automatic retry) |  |
| PASS | SIMULATED request failures (interception; server not reached) |    text kept and manual entry offered (429 with Ret) |  |
| PASS | SIMULATED request failures (interception; server not reached) | 400 shows bounded server messages |  |
| PASS | SIMULATED request failures (interception; server not reached) |    text kept and manual entry offered (400 shows bo) |  |
| PASS | SIMULATED request failures (interception; server not reached) | 403 shows a generic message with no security detail |  |
| PASS | SIMULATED request failures (interception; server not reached) |    text kept and manual entry offered (403 shows a ) |  |
| PASS | SIMULATED request failures (interception; server not reached) | 503 -> service unavailable notice |  |
| PASS | SIMULATED request failures (interception; server not reached) |    text kept and manual entry offered (503 -> servi) |  |
| PASS | SIMULATED request failures (interception; server not reached) | 200 with an unknown outcome is rejected, never reviewed |  |
| PASS | SIMULATED request failures (interception; server not reached) |    text kept and manual entry offered (200 with an ) |  |
| PASS | SIMULATED request failures (interception; server not reached) | 200 draft with extra field is rejected |  |
| PASS | SIMULATED request failures (interception; server not reached) |    text kept and manual entry offered (200 draft wi) |  |
| PASS | SIMULATED request failures (interception; server not reached) | network failure -> offline notice |  |
| PASS | SIMULATED request failures (interception; server not reached) |    text kept and manual entry offered (network fail) |  |
| PASS | SIMULATED request failures (interception; server not reached) | server-authored text is rendered as text, never as markup |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | while pending the field is disabled and progress is announced |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | extra clicks while pending send no further request |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | navigating away aborts the browser request |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | the late server answer does not open Review or change the screen |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | returning to the composer is not stuck in a loading state |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | Sign out locks the workspace immediately (composer and text gone) |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | the pending parse request was cancelled by sign-out |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | the late parse answer cannot resurrect the workspace |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | typed text is not left anywhere in the page |  |
| PASS | REAL pending request handling (FAKE model, 4 s delay) | server session was revoked by the real logout |  |
| PASS | REAL offline manual fallback | offline: a local message is shown and NO parse request is made |  |
| PASS | REAL offline manual fallback | manual entry still opens offline |  |
| PASS | REAL CSRF, Origin and session boundary on the parse route | no cookie -> 401 |  |
| PASS | REAL CSRF, Origin and session boundary on the parse route | cookie, right Origin, missing CSRF token -> 403 |  |
| PASS | REAL CSRF, Origin and session boundary on the parse route | cookie, right Origin, wrong CSRF token -> 403 |  |
| PASS | REAL CSRF, Origin and session boundary on the parse route | valid CSRF token but foreign Origin -> 403 |  |
| PASS | REAL CSRF, Origin and session boundary on the parse route | none of the rejected requests reached the model |  |
| PASS | REAL CSRF, Origin and session boundary on the parse route | 2,001 characters -> 400 from the server as well |  |
| PASS | REAL session invalidation on HTTP 401 | a real 401 from the server ends the session and shows sign-in |  |
| PASS | REAL session invalidation on HTTP 401 | the parse request really returned 401 |  |
| PASS | REAL session invalidation on HTTP 401 | session-expired notice shown, composer text and review wiped |  |
| PASS | REAL session invalidation on HTTP 401 | after signing in again the composer is empty (fresh epoch) |  |
| PASS | REAL keyboard, 390px mobile and dark theme | keyboard Enter on 'Parse with AI' runs the real parse |  |
| PASS | REAL keyboard, 390px mobile and dark theme | clarification state text contrast >= WCAG AA (light) |  |
| PASS | REAL keyboard, 390px mobile and dark theme | no horizontal overflow at 390px (clarification) |  |
| PASS | REAL keyboard, 390px mobile and dark theme | failure state text contrast >= WCAG AA (dark, 390px) |  |
| PASS | REAL keyboard, 390px mobile and dark theme | no horizontal overflow at 390px (failure, dark) |  |
| PASS | REAL keyboard, 390px mobile and dark theme | the failure alert is an announced alert region |  |
| PASS | REAL provider-unconfigured server and real 429 (no model client at all) | genuine ai_not_configured -> unavailable notice saying nothing reached a provider |  |
| PASS | REAL provider-unconfigured server and real 429 (no model client at all) | manual entry is offered |  |
| PASS | REAL provider-unconfigured server and real 429 (no model client at all) | the third request is a REAL 429 and the UI reports the wait |  |
| PASS | REAL provider-unconfigured server and real 429 (no model client at all) | 429 carries a Retry-After and the browser did not retry |  |
| PASS | REAL provider-unconfigured server and real 429 (no model client at all) | all three were real server responses: 200, 200, 429 |  |
| PASS | REAL provider-unconfigured server and real 429 (no model client at all) | no model client existed, so no model was invoked |  |
| PASS | Global invariants | no localStorage/sessionStorage/IndexedDB/Cache entries |  |
| PASS | Global invariants | no cookie readable from script (HttpOnly) and no invoice text in the URL |  |
| PASS | Global invariants | no request left the app origin (no OpenAI/PayPal/foreign host) |  |
| PASS | Global invariants | the only /api routes the browser used are the 3 auth routes and the parse route |  |
| PASS | Global invariants | no invoice save/list/detail/PayPal request was made |  |
| PASS | Global invariants | no invoices or approvals rows were created by this journey |  |
| PASS | Global invariants | parse attempts are audited without customer text |  |
| PASS | Global invariants | API log contains no CSRF token, cookie value or invoice text |  |
| PASS | Global invariants | no console errors or uncaught exceptions in the browser |  |

Screenshots (synthetic data only, no credentials): 01-real-composer.jpg, 02-review-from-server.jpg, 03-clarification.jpg, 04-invalid-outcome.jpg, 05-failure-429.jpg, 06-pending.jpg, 07-mobile-clarification.jpg, 08-mobile-dark-failure.jpg, 09-unavailable-unconfigured.jpg, 10-real-429.jpg

Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, 400% zoom, a hosted/TLS (`__Host-` cookie) deployment.
