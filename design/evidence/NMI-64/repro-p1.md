# NMI-64 Stage 1 — action-led header/filter/FAB + Spotlight (2026-11-08)

Implements the verified Issue #64 brief's first bounded item on top of the Stage-0 diagnosis
(no Studio licence/CSP change — none was warranted).

## What changed (app code)

- `AppShell.tsx`: the header `PayPal Sandbox` pill is now a `Safe Mode` disclosure button
  (`aria-expanded`/`aria-controls`); opening it shows the exact safeguards inline below the
  header (draft-only, never sent/emailed, no money movement). Same tokens, no new colors.
- `RealDashboard.tsx`: the `Invoice drafts` head carries the real full-population matching total
  (`dash-match-total`, counts add — currencies are never summed as money), null until the
  server analytics answer arrives. No fake metrics.
- `NudgeSummaryCard.tsx`: new review-only `Spotlight` featuring the first pending draft
  (customer, amount, tone badge, due badge, full message, `Review in queue` → opens the queue
  on that draft). Approval and Copy stay explicit in the queue; tones are type-locked to
  friendly/professional/firm, so Final Notice cannot appear.
- `app.css`: desktop (≥1024px) single-row ~48px filter toolbar (pill group scrolls inside its
  row; the page never scrolls sideways); mobile `body` bottom clearance raised past the fixed
  mobile nav + raised Nudgey launcher so bottom content scrolls fully into view.

## Browser evidence (disposable licensed stack, 1 USD $75 invoice, headless Chrome CDP)

Keyless run: 14/14 PASS — fallback notice verbatim, USD $75 intact, head total `1 matching
invoice`, Safe Mode disclosure present, desktop 1280 zero page-level overflow, 390px zero
overflow, FAB-vs-button rect comparison `false` after scrolling to bottom, dark mode clean,
zero CSP violations, zero exceptions.

Keyed run (`NMI64_WITH_KEY=1`, owner's trial key held in process memory only, all outputs
redacted, leak-guarded): 15/15 PASS — licence 200 no-store, panel `active` with real Studio
canvases, `Studio · view only` badge, no failure notice. Local positive control VERIFIED
(Live runtime check still requires the owner-gated deploy and stays PENDING).

Screenshots: `64-desktop-keyed-charts.jpg` (single-row toolbar, real charts, head count, Safe
Mode pill), `64-desktop-keyed-dark.jpg`, `64-mobile390-bottom-clear.jpg` (grid fully clear of
the raised FAB above the mobile nav), plus the Stage-0 keyless fallback pair.

No licence value exists in this file or any screenshot (charts never display the key; the
keyless run never configured one).
