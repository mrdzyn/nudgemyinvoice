# NMI-UI-ANALYTICS-FIRST-01 — Analytics-first authenticated dashboard

**Status:** **COMPLETE — merged.** PR #41 was owner-approved and squash-merged to `main` as `08bd5ad63f26e95414c864d14bc14f4c84cef65d` on 2026-11-05. The squash tree is identical to the audited head `f52483699593be24a78728133b0f22a60eaee42a`. Independent exact-HEAD audit: **PASS WITH MINOR QA FOLLOW-UP** (PR #41 comment 6633839151). Hosted Project Baseline CI 41849124293 and Stack CI 41849124024 passed at that head. The historical 95/96 local result below is preserved; its one failure checked the superseded order and was corrected in P5. No deployment.
**Owner visual direction:** Screenshot and instruction on 2026-11-04: “activity analytics should be at the top, it should be filterable by currency which is the one on the top.”
**Starting base:** `main@8cc2f4db945af5449d99c01236baca9a21396a50` after P4 release readiness PR #40 squash merge.
**Scope:** Small, targeted layout correction to the real authenticated dashboard, **not** the separate full Receivables Command Center visual redesign.

## UI contract and design acceptance
- Visual hierarchy on authenticated dashboard: page heading/new invoice → **shared currency/date/search/status controls** → coverage → **Activity analytics** → exact, per-currency full-population KPI cards → AG Grid Community invoice list.
- Use the existing **global currency pills** (All currencies, USD, EUR, GBP, CAD, AUD, JPY). Selecting a specific currency already causes the authoritative list and analytics API to refetch under one filter epoch. Never convert currencies or compute mixed-currency totals.
- Under **All currencies**, keep the established A5 chart tabs for inspecting one trend currency at a time; status counts remain per currency. Explicitly explain the distinction between global filters and view-only chart tabs to avoid implying that currencies are summed.
- All other filters (date/status/search) remain shared. No second fetch, new chart data or local synthetic substitution.
- Analytics is still **local development-only** under `VITE_NMI_STUDIO_LOCAL=1`, with key solely from ignored `.env.local`. Production Community dashboard and Render G7 licensing restriction are unchanged. Do not enable hosted Studio.
- Preserve loading/empty/error/retry behavior, accurate text alternatives, keyboard handling, privacy boundaries, authenticated ownership checks, API and DB schemas. No Render operations or live provider calls.

## Files and tests
- Edit only `apps/web/src/features/dashboard/RealDashboard.tsx`, `apps/web/src/features/studio/StudioPanel.tsx`, `apps/web/src/features/studio/StudioSlot.tsx`, and targeted UI regression tests. Update STATUS and one handoff; no schema/lockfile/provider/hosting changes.
- Add a deterministic view-level test for reading-order: global pills → chart → cards → grid and a selected EUR pill flowing through StudioSlot props.
- Existing `useDashboard` tests cover one filter epoch and joint backend queries; existing Studio QA proves independent per-currency totals. Run smallest targeted tests, required Project Baseline and Stack CI at final exact HEAD. A physical authenticated desktop/mobile visual QA remains **owner acceptance**; do not claim a new screenshot without creating it.
- No merge/deploy/publish until explicit owner approval.

## Review refinements (REV1, 2026-11-04)
Low-risk refinements inside the owner's stated direction and the approved A5 panel design, so no separate visual-approval round is needed. The owner still does the authenticated visual QA:
- **Spacing defect:** the Studio card sat flush on the currency cards, which have no top margin. A `.studio-slot` wrapper in `app.css` adds the gap (in app.css so the fallback is spaced even when the Studio chunk never loads).
- **Layout jump:** every filter change clears analytics, so the panel at the top unmounted and the cards/grid jumped up and back. `StudioSlotPlaceholder` reserves the space while analytics reloads. It shows no figures, is `aria-hidden`, shows only the header on narrow screens, and renders nothing when Studio is disabled (production unchanged).
- **Copy:** duplicated "below … below" fixed. The visible note required by this contract now explains that under All currencies the chart tabs only switch the drawn currency, and the filter above filters totals and invoices.
- **Tests:** the tautological "no USD total" assertion was replaced with All-currencies separate-card, reload-placeholder order, tabs-note and placeholder-disabled tests.
- **Local QA (simulated providers, synthetic data, key withheld for screenshots):** the A5-I1 harness ran 95/96. Its single FAIL is the A5-I1 assertion that the panel sits between cards and grid, which this task deliberately changes. Screenshots were reviewed locally and not committed; the A5-I1 evidence files were restored unchanged.
