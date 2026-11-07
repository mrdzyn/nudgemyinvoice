# NMI-64 — AG Studio chart recovery (P0) + action-led dashboard (P1)

Source: [Issue #64](https://github.com/mrdzyn/nudgemyinvoice/issues/64) with the verified textual design brief in [issue comment 6711414196](https://github.com/mrdzyn/nudgemyinvoice/issues/64#issuecomment-6711414196) (auditor-read from the owner's Drive; the agent's 401 is an access-context limitation, not a blocker — do not demand sharing changes). The brief's mocked figures/statuses (`$4,250 overdue`, `Final Notice`, `#PP-892`) are **design-only illustrations, never facts to implement**. Live combined `766dde37…` shows “Charts unavailable … Try loading charts again” on Activity analytics → Daily invoice value · USD while data (1 USD invoice, $75.00, 1 No draft) renders.

Branch: `feat/nmi-64-studio-charts` from `origin/main@766dde37…`. PR #63 untouched.

## Stage 0 — P0 diagnosis (no code change until root cause is proven)

1. Read `StudioPanel.tsx` failure paths (`studioLicenceRequired && !key` → failed; `loadStudioModule()` rejection → failed; `onFailure` → failed), `studioLicence.ts`, `routes/studio-licence.ts` (400/404/401), `web-static.ts` (hashed immutable chunks, per-response nonce + hashes), `release-preflight.ts` (licensed build + key required), P4/P5 docs (key in `.env.local` local-only 2026-11-04; Render secret store at release).
2. Reproduce locally: licensed production build + production API **without** `AG_STUDIO_LICENSE_KEY`, one USD $75 synthetic invoice via the real save route, headless-Chrome CDP screenshots (desktop + 390px). Record licence-endpoint status, console errors (sanitized), CSP violations. Proven 2026-11-08: signed-in endpoint 404, chunk 200, verbatim fallback copy, data intact, zero CSP/exceptions (9/9; evidence in `design/evidence/NMI-64/`).
3. Root-cause verdict before patching. Established: the Live serving process had no effective licence value (404 `studio_licence_not_configured`). Do NOT claim the owner never configured the variable — both relevant keys previously appeared in the Render Environment page; the check is correct service/environment, saved values' presence, and process reload on the next approved deploy. Positive control (licensed-chart rendering with a valid key) and the next production runtime check are PENDING and must be labeled unverified, never claimed. Code changes only for a proven in-repo defect, with a deterministic regression test for that mechanism.

## Stage 1 — P0 fix (only if Stage 0 proves an in-repo defect)

Stage 0 proved an environment-shaped failure (no effective runtime licence), not an in-repo
defect: NO application patch. Mechanism coverage already exists both sides
(`studio-licence.pg.test.ts` 404, `StudioFallback.test.tsx` null-key fallback).

## Stage 1b — P1 action-led header/filter/FAB + review-routed Spotlight (IMPLEMENTED 2026-11-08, PR #65)

UX-01 remediation (audit 6711702334): removed the top full-width Sandbox banner and the
verbose signed-in PostgreSQL Notice from the AppShell shell — the Safe Mode disclosure is now
the single Safe Mode identity (safeguards inline on demand; precise confirmations at each
point of action unchanged). Spotlight no longer duplicates its item in the mini list (rest
only; single-draft case shows a "featured above" note). Pill labeled `Sandbox Safe Mode` so
the no-send-or-pay-controls guard keeps passing unmodified.

Done: Safe Mode disclosure button + inline safeguards (`AppShell.tsx`); real
matching-invoice total in the dashboard head (`RealDashboard.tsx`); review-only Spotlight of
the first pending draft (`NudgeSummaryCard.tsx`, tones type-locked, no approve/copy/send
surface); desktop single-row ~48px toolbar with contained pill scroll + mobile FAB clearance
(`app.css`). Verified: keyless 14/14 (fallback + layout + dark + 390px clearance + zero
CSP/exceptions) and keyed 15/15 (licence 200 no-store, real canvases, badge) on the disposable
licensed stack; screenshots in `design/evidence/NMI-64/`. Local positive control VERIFIED;
Live runtime check still PENDING owner-gated deploy. Nav-level invoice counts need
filter-independent totals (deferred — dashboard head count is filter-aware and labeled).

## Stage 2 — P1 action-led dashboard (bounded stages, verified Issue #64 brief as visual reference; guide wins over mockup on conflicts)

Per issue §P1, each independently reviewable: (a) compact header (brand, Invoices/Nudge switch with real counts, Sandbox Safe Mode status, New Invoice CTA, sign-out); (b) action-first hero (currency-safe overview + one real AI Nudge Spotlight from actual pending/approved drafts, friendly/professional/firm only; approval + copy explicit, never auto-send); (c) streamlined filters (single-row desktop, wrapped/collapsible mobile; server-side semantics, Asia/Manila dates, per-currency totals, keyboard nav); (d) invoice worklist (Saved → PayPal Sandbox DRAFT → Nudge pipeline from real operator-scoped records; Open/Create-draft/Review actions under existing gates; never claim unpaid/overdue without reconciliation); (e) analytics demoted below worklist/hero, 390px without chip/header overlap.
Demo-data rules: no fabricated PayPal IDs/invoices/AI text on Live; any showcase is isolated, clearly labeled synthetic preview fixtures; no “Reset Demo Data” for production records; no cross-currency sums; no bulk nudges/auto-send/translation/capture.
The mockup disclaimer-banner removal is resolved with a concise safety tooltip/inline confirmation, never by dropping safeguards.

## Validation / stop rules

- Exact-HEAD manual CI per `docs/TESTING.md` (Node 22, disposable PG16, both builds, scans, audit, diff check); hosted CI NOT RUN.
- Real browser screenshots at the failing viewport + 390px + dark, compared against the mockup where applicable.
- Independent audit per stage boundary; no merge, deploy, credential, provider, or protected-branch action without separate owner approval.
