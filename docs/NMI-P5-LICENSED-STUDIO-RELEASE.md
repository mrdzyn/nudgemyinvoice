# NMI-P5 — Licensed AG Studio production dashboard

**State (2026-11-05):** code merged to `main` (PR #42, squash `c575a0dc9bf158a477d71976a614f8df802d6110`) after independent P5-FIX1 re-audit PASS. **Release is not authorized:** nothing is deployed, no Render resource exists and no judge URL is published. The licence scope below remains owner-attested; the P4 gates (including G5 and G7) remain open.

## 1. Licence scope (owner-controlled release evidence)

| Item | Record |
|---|---|
| Decision | Owner message, 2026-11-04: the application has appropriate AG Studio **deployment** licensing for the PayPal AI Hackathon judge-facing production environment through the December judging window. Build the licensed production variant; do not revert to a charts-free Community-only production dashboard. |
| Scope relied on | One judge-facing production deployment of NudgeMyInvoice (PayPal Sandbox only), used by the signed-in operator and supervised judges, for the December 2026 judging window. |
| Expiry | The owner states it runs **through the December judging window**. The earlier trial expiry the owner confirmed was 2026-12-16. **The exact entitlement end date and document are owner-held and not reproduced here.** The key's contents were never read or parsed by this work. |
| Verification status | **Owner-attested, not independently verified.** No AG Grid/AG Studio terms or order documents were reviewed in this task. The owner should attach or confirm the entitlement record before G6 (create and first build) and must not let the dashboard run past the entitlement end date. |
| Where the key lives | The owner's untracked `.env.local` (local) and the Render secret store (`AG_STUDIO_LICENSE_KEY`, at release). It is never in Git, documents, logs, screenshots, test results or any build artifact. |

## 2. Licence delivery design

AG Studio's licence model is browser-side: `AgStudioProvider licenseKey` must receive the key in the page. The key is therefore **visible to any signed-in operator who opens the browser's developer tools**. This is inherent to the vendor model and accepted under §1. The design limits who receives it, and when:

- **Server-only storage:** `AG_STUDIO_LICENSE_KEY` is read by `apps/api/src/config.ts`, never logged, and never echoed in a validation error.
- **Authenticated runtime delivery:** `GET /api/studio/licence` (`apps/api/src/routes/studio-licence.ts`) has these rules:
  - It requires a valid operator session, so anonymous requests and forged or expired cookies get 401.
  - It requires the custom header `x-nmi-studio: 1`, which is absent from the CORS allow-list, so no other origin can send it.
  - Responses are `no-store, private`, `Vary: Cookie`, with the fixed API CSP.
  - It answers 404 when no licence is configured.
- **Lazy load after sign-in:** the sign-in page loads no Studio code and requests no licence. On phones the panel starts collapsed, and nothing is fetched until the operator opens it.
- **No persistent client copy:** the key is held only in React state, never in web storage, cookies, the DOM or a URL. Each chart (re)load asks the server again (at most one small request per filter change).
- **What session revocation does and does not do (SEC-N2):** signing out or revoking a session makes every **future** licence request fail (401). It **cannot retract a licence already delivered to a browser**:
  - A page that already received the key keeps it in memory and keeps showing the charts it drew, until the panel unmounts, the page reloads or the operator is signed out of the app.
  - Anyone who copied the key from that browser keeps it.
  - Delivery to a browser is irreversible. If a key is believed exposed beyond the accepted operator and judge use, the only remedy is the vendor's own process (for example, replacing the licence), followed by updating `AG_STUDIO_LICENSE_KEY`.
- **Fail closed:** in a built bundle, a missing licence (not configured, signed out, network error) shows "Charts unavailable" with Retry. It never shows an unlicensed Studio. The exact daily and status tables, the currency cards and the invoice grid stay intact.
- **Local development unchanged:** `VITE_NMI_STUDIO_LOCAL=1` on the Vite dev server still uses the loopback-only dev bridge. That bridge, its route and header are absent from every built bundle, which the build guard and the bundle scan both enforce.

## 3. Build variant and guards

| Setting | Effect |
|---|---|
| `NMI_WEB_STUDIO` unset (default, CI's ordinary build) | **Community build:** no Studio code. The build fails if a Studio package resolves, and `check:bundle` refuses any Studio marker. |
| `NMI_WEB_STUDIO=licensed` | **Licensed build:** Studio ships **only** in lazy chunks. The build fails if Studio is in an entry chunk, if no Studio chunk is produced, or if a dev-bridge marker appears. `check:bundle:licensed` requires a Studio chunk not loaded by the HTML shell. |
| any other value | The build fails, so a typo never silently picks a variant. |

Both scans also refuse provider-secret patterns, the dev bridge (`__nmi_dev`, `studio-licence`, `x-nmi-dev-studio`), the variable name `AG_STUDIO_LICENSE_KEY` and the licence value itself, taken from the environment or the local `.env.local`. On Render the licensed scan runs in the build, where the real key is set. `pnpm validate` and Stack CI now build and scan **both** variants. CI never has a licence.

Only the derived boolean `__NMI_STUDIO_LICENSED__` is defined into the bundle. `NMI_WEB_STUDIO` itself has no `VITE_` prefix and never reaches the browser.

**Release preflight:** `release-preflight env` now **requires** `NMI_WEB_STUDIO=licensed` and a well-formed `AG_STUDIO_LICENSE_KEY` (16–8192 printable ASCII). Every other `AG_STUDIO*`, `VITE_*` and `NMI_*` name stays forbidden, and values are never printed.

**Render build command:** `pnpm install --frozen-lockfile --prod=false && pnpm build:web:licensed && pnpm check:bundle:licensed`. The start command is unchanged.

## 4. CSP: per-response style nonce (no `'unsafe-inline'`)

Production QA found that AG Studio's theming, embedded AG Charts and grid core inject `<style>` elements, which `style-src 'self'` blocks. That blocking also caused a 131 px horizontal overflow. The fix:

- **Fresh nonce per shell response:** every HTML shell response gets a new 128-bit nonce, placed in the header CSP, in the build-time `<meta>` CSP and in `<meta name="nmi-style-nonce">`. The shell is `no-store`. The server refuses to start if the shell has a meta CSP it cannot extend.
- **Studio passes the nonce:** Studio passes the nonce through its official `styleNonce` option.
- **Exact vendor-stylesheet hashes (SEC-N1, replacing the earlier shim):** AG Studio 3.0.0 does not forward `styleNonce` to its colour sensor or to the AG Charts DOM manager. Instead of a page-wide patch, `style-src` also lists the SHA-256 of exactly four static vendor stylesheets (`apps/api/src/plugins/studio-style-hashes.ts`):
  - the AG Charts Community stylesheet (57,088 chars);
  - the AG Charts Enterprise stylesheet (31,898 chars);
  - AG Studio's colour-sensor `@property` rule;
  - the empty string (AG Charts inserts its `<style>` empty, then fills it; an empty sheet applies nothing).

  These were captured from Chrome's CSP reports and the blocked elements' text in the licensed production build (desktop, 390 px and dark theme, identical across runs). Two are re-derived independently in a unit test, and a test fails if the lockfile moves off the pinned `ag-studio 3.0.0` / `ag-charts-* 14.2.0`.
- **What this means for other styles:** no app code patches DOM prototypes any more (a boundary test enforces it). Any other `<style>` stays blocked, whether script-created without the nonce, injected through markup or carrying a wrong nonce. Style attributes stay blocked, scripts stay `'self'` only, and there is no `'unsafe-inline'` or `'unsafe-eval'`. The production harness proves each of these in a real browser while licensed Studio is loaded, for **both** enforcing policies (header and meta CSP), with a positive control showing it detects an applied style.
- **Residual risk:** an attacker able to inject a `<style>` whose text is *byte-identical* to one of the four vendor sheets could insert that vendor CSS again. It is the same CSS the page already uses, so this has no practical effect. The hashes must be recaptured on any AG Studio/Charts upgrade (`P5_COLLECT_HASHES=1`). Until then, a version drift shows up as unstyled charts and a failing production QA, never as a silent relaxation.
- **Result:** zero CSP violations across the full production QA session (desktop, mobile, dark theme, fallback and recovery).

## 5. Dashboard visual changes (owner-directed; accepted by the owner with the PR #42 merge on 2026-11-05)

Owner acceptance covers the visual direction shown in the committed screenshots. Safari/Firefox, real-device, screen-reader and 400% zoom QA were **not performed** and remain open manual QA gates.

The order is kept: page heading → **global currency/date/search/status filters** → coverage line → **Activity analytics** → exact per-currency cards → AG Grid invoice table.

- **Summary strip:** a headline strip for the charted currency (total, invoices, days with invoices "23 of 30", peak day/week with date and count), all from the same exact server aggregate. It replaces the single peak-day sentence and gives a sparse month context.
- **Daily chart:**
  - Height reduced from 300 to 252 px (220 px on phones), with the Studio widget sized to fit its box.
  - The rotated duplicate axis title is removed (the heading names the measure and currency).
  - Axis labels are smaller, and date labels stay horizontal on desktop.
- **Status chart and table:**
  - The status chart has slim bars sized per currency (56 + 26 px per row), where it used to fill a fixed tall box.
  - The tall per-currency badge blocks are replaced by **one exact table**: a row per currency and a column per status.
  - Header swatches match the bar colours (the chart's legend), and glyphs mean colour is never the only cue.
- **Copy:** the two explanatory lines are shortened to one, and the view-only chart-tab note appears only under All currencies.
- **Phones:**
  - Two-column headline grid, full-width tabs and visible table headers. An app-wide narrow-screen rule had been hiding the Studio table headers.
  - The status table drops its invoice-total column, since each currency card shows it.
  - Nothing overflows horizontally.
- **Placeholder:** the loading placeholder matches the loaded panel height (within 15%), so filter changes don't shift the page.
- **Unchanged:** per-currency accounting (never summed or converted), zero-day rows in the exact daily table, error and Retry handling, the AG Grid Community invoice table and the authenticated invoice workflow.

## 6. Evidence

- **Licensed production-build QA:** `design/evidence/NMI-P5/run-licensed-production-qa.mjs`, **43/43** (`qa-results.json`, screenshots `01`–`08`), including six SEC-N1 negative-CSP checks.
  - Setup: real production server entry behind a local HTTPS proxy, least-privilege DB role, disposable PostgreSQL 16, 96 synthetic invoices saved through the real route, simulated providers, headless Chrome.
  - Coverage: lazy loading, licence boundary (anonymous, sign-out, logs, storage), CSP, real Studio render, layout order, exact figures against independent SQL, keyboard tabs and toggle with a visible focus ring, filter interaction and the loading placeholder, dark theme, the licence-unavailable fallback and Retry, and 390 px mobile (collapsed, expanded, dark, no overflow).
- **A5-I1 local dev QA re-run:** corrected for the analytics-first order and the new status table, and a fault-injection race fixed. **96/96** (`a5i1-dev-rerun-results.json`). The historical A5-I1 results are unchanged.
- **Automated tests:**
  - licence route: 7 PostgreSQL tests;
  - licence config: 7 tests;
  - shell nonce: 5 tests; vendor style-hash allowlist: 4 tests;
  - release preflight: 62 tests;
  - web: Studio fallback (production fail-closed), summary strip, status table, chart sizing, boundaries.
- **Bundle cost:** the licensed entry chunk is 1,332.9 kB (379.9 kB gzip) against Community's 1,159.7 kB (332.2 kB). The shared single-file grid module keeps more code. The Studio chunk is 4,458.5 kB (1,260.3 kB gzip), lazy and loaded only after sign-in.

## 7. Not done or not verified

- **Not hosted:** no Render resource, build, deploy or judge URL (gates G1–G6 still apply).
- **Browsers and assistive tech:** Safari, Firefox, real phones and screen readers were not tested (headless Chrome only).
- **Licence terms:** not independently reviewed (§1).
- **No visible entitlement signal:** AG Studio's console reported no licence problem with the owner's key, but view mode shows no watermark either way. Entitlement is not observable in the UI.
- **Licence in the browser:** a signed-in operator (or a judge using the operator session) can extract the licence from the browser by design (§2).
- **No recall of a delivered licence:** revoking a session only stops future licence requests. A key already delivered to a browser cannot be retracted (§2, SEC-N2).
- **Vendor style hashes need upkeep:** they are tied to the pinned AG Studio and AG Charts versions and must be recaptured on upgrade (§4, SEC-N1).
- **No expiry enforcement:** nothing in the code stops the dashboard at the end of the licence entitlement. The owner must take the licensed dashboard down, or rebuild the Community variant, before the entitlement ends.
