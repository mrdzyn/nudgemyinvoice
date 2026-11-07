# NMI-64 Stage 0 — keyless licensed-stack reproduction (2026-11-08)

Question: which runtime condition produces the Live “Charts unavailable … Try loading charts again” notice?

Method (all disposable, local only; script kept at `/tmp/nmi64-repro.mjs`, rerunnable):
- `pnpm build:web:licensed` (variant confirmed: `StudioCharts-*.js` + `StudioPanel-*.js` chunks in `apps/web/dist/assets`).
- Production API (`NODE_ENV=production`, `NMI_WEB_STUDIO=licensed`, single origin via TLS proxy) with **no `AG_STUDIO_LICENSE_KEY` in the server environment**.
- Disposable PostgreSQL 16; one operator; one USD invoice ($75.00, quantity 1) saved through the real `POST /api/invoice-drafts` route.
- Headless Chrome CDP: UI sign-in, desktop 1280 + mobile 390 viewports, licence-request statuses, console errors, CSP violations.

Results: 9/9 PASS.

- Signed-in `GET /api/studio/licence` with no key configured: **404** `{ error: "studio_licence_not_configured" }` (status only recorded).
- Licensed panel chunk served HTTP 200; licence request observed non-200; `#studio-panel` reached `data-studio="fallback"`.
- Failure copy matches the Live report verbatim: “Charts unavailable.” + “Try loading charts again” button.
- Authoritative data intact beside the notice: Total (USD) $75.00, 1 invoice, daily table, PayPal status table, currency cards, invoice grid.
- Zero CSP violations, zero uncaught exceptions during the fallback.

Screenshots: `64-desktop-keyless-fallback.jpg`, `64-mobile390-keyless-fallback.jpg`.

Conclusion: a licence-unavailable runtime (server 404/401, unreachable key, rejected chunk, or Studio error — the client fails closed identically) reproduces the exact Live symptom class while data stays intact. Code paths verified in source: `StudioPanel.tsx` lines 256–274 (`studioLicenceRequired && !key` → failed; `loadStudioModule()` rejection → failed; `onFailure` → failed). Server 404 and client null-key fallback each have deterministic unit/pg coverage (`studio-licence.pg.test.ts`, `StudioFallback.test.tsx` P5 section).

Remaining Live trigger (key absent from Render runtime env vs invalid key vs transient) requires two owner checks — no application patch until then:
1. Render dashboard → service → Environment: `NMI_WEB_STUDIO=licensed` (build selects the licensed variant) and `AG_STUDIO_LICENSE_KEY` holding the trial deployment licence (runtime only; never committed, logged, or pasted anywhere).
2. After any change (owner-gated redeploy): sign in, open the dashboard, confirm charts render. If still failing, record ONLY the HTTP status of `GET /api/studio/licence` and any console error text with the key redacted, and report back.

No licence value exists in this run, this file, or the screenshots (charts never rendered, key never configured).
