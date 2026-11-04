# NMI-PROTOTYPE-10D-A5-D — Studio Analytics screen specification (DESIGN ONLY)

**Status: OWNER DESIGN DIRECTION APPROVED — 2026-11-04 (Asia/Manila); previews RECONCILED (rev 2) and awaiting independent exact-HEAD design audit; implementation NOT STARTED.** The mockup generator, HTML and all 34 PNG previews now show the approved refinements: weekly plotted buckets after 90 days, mobile panel collapsed by default, truthful Studio badge/attribution handling, and tooltips only on hover, keyboard focus or tap. 227 automated design checks pass (177 preview checks plus a 9-combination data-only matrix) (`design/evidence/NMI-PROTOTYPE-10D-A5D/design-checks.json`). No AG Studio package or license is installed.
AG Studio is **not installed**, no licence key is used, no application behavior, dependency, schema or deployment changes. All data in the previews is **synthetic** (seeded generator, `example.test` addresses).

- Task / plan: `tasks/NMI-PROTOTYPE-10D-A5-ag-studio-integration.md`, `docs/NMI-PROTOTYPE-10D-A5-AG-STUDIO-PLAN.md`
- Baseline: the approved NMI-UI-01B dashboard as shipped through A2 (AG Grid Community 36.2.0), tokens `apps/web/src/styles/tokens.css` (verbatim in the mockup)
- Reviewable mockup: [NMI-PROTOTYPE-10D-A5D-studio-analytics.html](../mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html) (open in a browser; `#state=default|off|loading|empty|error|unavailable|session-expired`, `&cur=USD|EUR|JPY`, `&range=30|90|120` days, `&panel=open|closed` (overrides the viewport default), `&theme=dark`, `&clean=1` hides review tags; hover/focus/tap the chart)
- Previews (PNG): `design/evidence/NMI-PROTOTYPE-10D-A5D/previews/` (index below). Regenerate: `build-mockup.mjs`, then `capture-previews.mjs` in that folder.

> **Honesty note.** The chart and status visuals in the previews are inline SVG/HTML that express the **design intent** for a view-only Studio region. They are **not renderings of AG Studio**, whose real chrome, theming hooks, accessibility and watermark behavior are unverified until A5-I1. Where the spec depends on Studio, it says "to verify".

## 1. Proposal in one paragraph

Keep today's dashboard exactly as it is (filters → currency cards → AG Grid Community table). Add **one optional, view-only "Activity analytics" panel** between the currency cards and the invoice table. The panel contains two widgets fed by the **same** `POST /api/analytics/summary` answer that already drives the cards: a **daily invoice-value chart** (one currency at a time) and a **PayPal Sandbox draft-status breakdown** (per currency). It adds no filters, no table, no totals of its own. It is behind a default-OFF local feature gate; if it is off, fails to load, or is unlicensed, the page is today's dashboard unchanged.

## 2. Screen map and placement (desktop)

```
Sandbox banner · header · nav · signed-in notice                         EXISTING
Page head: "Invoice drafts" + New invoice                                  EXISTING
A  Filter bar (currency pills, date range, search, status)                 EXISTING   single source of truth
   Coverage line (range, time zone)                                        EXISTING
B  Currency cards, one per currency, full population                       EXISTING
   Totals note                                                             EXISTING
C  Activity analytics (Studio, view only)  <── NEW, the only addition
     C1 Daily invoice value (+ chart-currency selector, data-table alternative)
     C2 PayPal Sandbox draft status (per currency)
     C3 Reserved vendor-attribution strip (only if Studio shows one)
D  Invoice table (AG Grid Community) + paging footer                       EXISTING   own pagination, outside Studio
Nudgey button · mobile bottom nav                                          EXISTING
```

Why between B and D: the cards give the exact totals first, the charts explain them, the table remains the working surface. Nothing moves; D only shifts down by the panel height. Alternatives considered (see §12): right-rail panel, tab beside the table, replacing the cards.

## 3. How Studio integrates without duplicating the dashboard

| Concern | Owner | Decision |
| --- | --- | --- |
| Date range, currency, search, status filters | **Existing bar (A)** | Studio gets **no** filter UI. It renders the answer for the current filters; the only Studio-adjacent control is a view-only chart-currency selector (§5.1) that does not change any filter. |
| Currency totals / invoice counts | **Existing cards (B)** | Studio draws **no** KPI tiles and no totals row. Chart values are per-day buckets that sum to the card totals. |
| Invoice rows, customer names/e-mails, row paging | **Existing AG Grid Community (D)** | Studio never receives rows or customer fields; no second table. |
| Daily value chart | **Studio (C1)** | New. |
| Draft-status breakdown | **Studio (C2)** | New; counts only, from `stateCounts`. |
| Loading / error / retry / 401 | **Existing dashboard** | Studio panel follows the page's states exactly (§8). |
| Studio edit mode, report save/share, export, fullscreen, drill-through, cross-filter, AI agent, data-source UI | **Excluded in v1** | View-only. Nothing persisted. |

## 4. Data contract per widget (no new endpoint, no new data)

Source: `AnalyticsSummary` from the existing endpoint (A2). Fields used: `currencies[].{currency, exponent, invoiceCount, totalMinor, stateCounts}` and `days[].{day, currency, exponent, invoiceCount, totalMinor}`.

- **C1** uses `days` for the selected currency: x = local day (`YYYY-MM-DD` in the operator's time zone, shown as "Oct 5"), y = `totalMinor` in that currency's own units.
- **C2** uses `stateCounts` per currency: `none`, `progress`, `created`, `attention` (UI labels: No PayPal draft, In progress, PayPal draft created, Needs attention).
- **Exactness.** `totalMinor` is an integer string (BigInt). Labels and tooltips are formatted from exact minor units (as the cards do). Only chart **geometry** may use a bounded scaled number; the chart never displays a value computed in floating point. A5-I1 must test this with a value above 2^53 minor units and with JPY (exponent 0).
- **Not provided to Studio:** operator id, customer names/e-mails, invoice ids, provider payloads, SQL, tokens, PayPal operations, model tools.
- **Strict wording:** "PayPal draft created" = a Sandbox DRAFT exists. Never "sent", "paid", "overdue" or "collected".

## 5. Widget specifications

### 5.1 Daily invoice value (C1)

- Title: "Daily invoice value · {CUR}". Subtitle (panel level): "Same filters and the same full-population server totals as the cards above. Values are invoice totals by creation day ({time zone}), not payments."
- **One currency per chart; no shared axis, no stacked or combined series, no FX.** Chart-currency selector = segmented control (`role="tablist"`, one tab per currency present in the answer, label "Chart currency (view only; does not change the filters)"). Default selection: the currency with the most invoices (ties: alphabetical).
- When the global currency pill is not "All currencies", the selector is not rendered and the chart is fixed to that currency.
- Marks: vertical bars, token `--action-bg`; baseline at zero; 4-5 horizontal gridlines at round steps; y labels compact ("$2K", "¥60K"), tooltip/data table exact. Days with no invoices show no bar.
- **Tooltip: only on pointer hover, keyboard focus or tap; never shown idle** (no tooltip in any default or loading preview). Daily: "Oct 28, 2026 / $1,592.18 · 7 invoices". Weekly: "Oct 19 – Oct 25, 2026 / $8,952.96 · 37 invoices", with "(partial week)" on clipped boundary weeks. Keyboard: the chart is one focus stop (`role="group"`, visible focus ring); on keyboard focus it shows the peak bar, Left/Right/Home/End move between bars, Escape hides it, and a polite live region announces the bar. Pointer leave and blur hide it. Never shows customer data. No click action (no drill-down) in v1.
- Peak line under a daily chart: "Peak day: …". **Owner-approved density rule:** show local-day bars at ranges of **90 calendar days or fewer**; when the selected range exceeds 90 local calendar days, display **weekly buckets** grouped by the operator's local week (Monday start; partial boundary weeks retained). Aggregate each currency separately from the original day buckets using exact integer-minor-unit arithmetic, with no floating-point monetary sums. The **accessible table must preserve every original daily row (including zero-invoice days) and exact formatted values regardless of chart density**. Verify edge cases across IANA time zones and DST; never change the authoritative cards or API request window.
- **Data-table alternative** (always present, native `<details>`): "View {CUR} daily data as a table", columns Day / Invoices / Total ({CUR}). It has **exactly one row per local calendar day of the selected range (30, 90 or 120 rows in the previews), including days with no invoices, shown as 0 invoices and the exact zero in the currency's own units** ($0.00, €0.00, ¥0), in both daily and weekly modes. Zero days are visually muted but never omitted. Table, plotted buckets and the currency card agree exactly in integer minor units. This is the accessible equivalent regardless of Studio's own accessibility.

### 5.2 PayPal Sandbox draft status (C2)

- One row per currency in the answer (or the single filtered currency): currency + invoice count, a 100% stacked bar of the four draft states, and a 2x2 legend of badges with exact counts (zeros shown).
- Meaning is never color-only: every state has an icon + text badge (existing badge set: ○ No PayPal draft, ◔ In progress, ✓ PayPal draft created, ! Needs attention). Segment colors reuse semantic tokens; the "no draft" and "in progress" segments use `--border-input` / `--info-text` for non-text contrast.
- Footnote: "PayPal draft created means a Sandbox DRAFT exists. It is not sent, not paid and not overdue."
- Counts only; nothing is summed across currencies (counts per currency row, no grand total).

### 5.3 Panel chrome

- Heading `h2` "Activity analytics"; neutral badge "Studio · view only" **only when the actual Studio panel is active**. It is never shown while loading, in the unavailable fallback, or when the feature is off (previews 12, 15, 16, 17, 29, 33). "Hide charts / Show charts" is a native button (`aria-expanded`, `aria-controls`); the choice is **not persisted** (no browser storage). Default **expanded at >=768px and collapsed at <=767px** (390px reference). Heading, badge and the Show charts control stay visible when collapsed; the collapsed body is removed from the tab order and the accessibility tree, and expanding keeps focus on the button.
- C3 **vendor-attribution area** belongs to the Studio-active variant and is drawn in every expanded preview, including the clean ones: "Vendor attribution area. Shown by AG Studio if it requires one; its content comes from Studio and is never hidden or covered (unverified until A5-I1)." It is not drawn while the panel is collapsed (no Studio widget is displayed then), and not at all in loading, fallback or off states, which contain no Studio content. A5-I1 replaces the placeholder with whatever Studio actually renders (attribution, evaluation watermark, or nothing) and must not clip, overlay or restyle it away.

## 6. Filters (shared, single source)

The existing bar is unchanged: currency pills, "Created date range" (From / Through), search, PayPal status select, Clear filters, coverage line. Behavior of the panel under filters:

| Filter | Effect on the panel |
| --- | --- |
| Date range / search | Charts and status rows recompute from the same request as the cards. |
| Currency pill ≠ All | Selector hidden; chart and status show that currency only. |
| Status ≠ All | Only the matching group is non-zero in C2; C1 shows matching invoices' days. |
| Invalid range (existing inline error) | Panel is not shown, same as the cards. |

A change in filters never leaves a chart for the previous filters on screen: panel goes to the loading state and stale answers are suppressed (as for the cards).

## 7. Responsive behavior

| Width | Layout |
| --- | --- |
| ≥ 1024 px | Two columns inside the panel: chart (≈ 64%) and status (≈ 36%). Currency cards in a row. |
| 768-1023 px | Panel columns stack (chart, then status). Everything else as today. |
| ≤ 767 px (390 px reference) | Panel **collapsed by default** with a full-width, accessible "Show charts" action; once expanded, single-column contents. Chart-currency selector has 44 px targets; plot labels are sparse (more sparse for weekly mode), text >= 11 px. Status legend becomes one column. Cards one per row. Existing bottom nav and Nudgey button remain; verify the separate known Nudgey/Load more overlap. Table scrolls only inside its card as today. |

Every preview is checked for **no page-level horizontal overflow** at 390, 820 and 1280 px (capture script, `design-checks.json`).

## 8. States

| State | Panel | Rest of page | Preview |
| --- | --- | --- | --- |
| Default | Desktop/tablet: chart + status expanded. Mobile <=767px: heading, badge and "Show charts" only until expanded. | Cards, table | 01, 02, 19, 20, 21 (collapsed), 22, 26 (expanded) |
| Loading | Skeleton blocks, `aria-busy="true"`, visually hidden `role="status"` "Loading analytics"; **no Studio badge** (Studio not active yet); mobile follows the same collapsed default | Existing card and table skeletons | 12, 29 |
| Empty (no invoices match) | **Not rendered** | Existing "No invoices match these filters" + "Create an invoice"; table not shown | 13, 30 |
| Analytics error (offline, timeout, unavailable, malformed, forbidden, rejected) | **Not rendered** | Existing `role="alert"` "Could not load full-population totals. … No loaded-row estimate is substituted." + Retry; table independent | 14, 31 (light); 11, 32 (dark) |
| Studio unavailable (module fails to load, key absent/expired, any Studio error) | Quiet info notice "Charts unavailable. The totals above and the invoice table below are not affected." + "Try loading charts again". **No Studio badge, no attribution area, no collapse button, and no licence, key or vendor text shown to the user.** | Cards and table fully usable (this is the Community fallback) | 15, 16 (dark), 33 |
| Session expired (401 anywhere) | **Removed from the DOM** with every other authenticated widget | Existing sign-in screen with "Your session has expired. Sign in again to continue." and no dashboard data | 18, 34 |
| Studio feature OFF / not installed | Not rendered; nothing reserved | Exactly today's dashboard | 17 |
| Offline | As Analytics error (existing offline banner stays) | As today | not separately drawn |

401 handling is the existing late-401 behavior: the session is invalidated and stale widgets are suppressed, never merely hidden.

## 9. Keyboard and accessibility

- Order when **expanded**: filters → currency cards (non-interactive) → panel heading → Hide/Show button → chart-currency tabs → chart (one focus stop, `role="group"` with `aria-roledescription="chart"` and a label giving range and peak; Arrow keys read bars) → "View as table" disclosure → status rows (each bar `role="img"` with all four counts in its label) → table. On mobile's initial **collapsed** view, hidden panel controls are removed from the tab sequence; the native Show charts button expands and announces `aria-expanded=true` without unexpected focus loss.
- Tabs: arrow keys move and select, Home/End jump, roving `tabindex`; selection is announced (`aria-selected`). Hide/Show and the disclosure are native buttons/`details`.
- Visible focus ring: existing `--focus` token on every control. Targets ≥ 44 px on mobile (tabs, buttons).
- Not color-only: state badges carry icon + text; chart values available in the table; tooltips are also reachable by focus.
- Contrast: all text/background pairs are the existing tokens in light and dark (previews 04 and 14 show dark). Bars (`--action-bg`) and the status segments meet 3:1 against the surface.
- Reduced motion: no animated transitions in charts; skeleton shimmer already disabled by `prefers-reduced-motion`.
- Zoom/text scaling: panel reflows to one column at narrow widths; verify at 200% in A5-I1.
- **To verify in A5-I1:** Studio's own keyboard/screen-reader behavior. If it does not meet the above, the panel renders the hand-built accessible equivalent (table + labeled status text) and the Studio canvas is `aria-hidden` decoration, or the panel falls back to "Studio unavailable".

## 10. Privacy, security and licence boundaries carried into design

- Aggregates only; no customer fields; no new browser persistence; no licence string, trial email or screenshot of a licence in any preview.
- Feature gate default OFF; lazy-loaded; no effect on the default dashboard when absent. Hosted/public use of Studio requires written AG Grid confirmation and a separate owner gate (plan §Source and licence prerequisites). Community fallback stays the demo default.
- No AI/agent, MCP, provider or payment action is reachable from the panel.

## 11. What is not verified (deliberately)

AG Studio rendering, chrome, theming API and accessibility; vendor watermark/attribution; licence behavior; performance and bundle cost; real data scale (366-day ranges); physical device, Safari/Firefox and assistive-technology behavior. Previews are static, headless Chrome, synthetic data.

## 12. Owner-approved design decisions (2026-11-04, Asia/Manila)

**Approval given in conversation after review of PR #37's proposals and the independent design-review recommendations** ([PR review](https://github.com/mrdzyn/nudgemyinvoice/pull/37#issuecomment-6620932029)). This authorizes the **design direction** and preparation of a separate A5-I1 local-only implementation contract; it is **not** authorization to install/use the private trial key, publish a licensed Studio bundle, deploy, incur costs or merge any PR. The generated HTML and PNG previews were reconciled with these decisions in rev 2 (this PR): no idle tooltip, mobile default collapse, weekly buckets after 90 days, truthful badge/attribution. Independent exact-HEAD design audit and both hosted CI workflows remain required before A5-D is called final.

### Recorded answers

| # | Decision | Recommendation |
| --- | --- | --- |
| Q1 | Placement | **APPROVED:** full-width Activity analytics panel between authoritative currency cards and Community invoice table; no other layout changes. |
| Q2 | Multi-currency chart | **APPROVED:** one currency at a time, view-only selector, never changes global filters; no multi-currency axis. |
| Q3 | Interaction | **APPROVED:** view-only for A5-I1; no click-to-filter, edit, save, export, AI agent or new persistence. |
| Q4 | Long ranges (>90 local calendar days) | **APPROVED: weekly plotted bars after 90 days**, local Monday week boundaries, exact per-currency sums. Retain day-level table; if vendor capability blocks exact weekly behavior, log a separate design exception and request owner sign-off instead of silently omitting it. |
| Q5 | Panel default on mobile <=767px | **APPROVED: collapsed by default**, Show charts button; expanded on desktop/tablet; no persistence. Preview regeneration is required. |
| Q6 | Studio badge and vendor attribution | **APPROVED** when actual Studio is active; never conceal vendor watermark. In fallback mode, use truthful "Charts unavailable" wording without Studio-active badge. |

Owner approval authorizes a separately scoped A5-I1 **local implementation task after final design-preview reconciliation and review**. It does **not** authorize use of the private licence key, hosting Studio, Render, a judge URL or a merge. **Implementation priority:** show tooltips only on hover/focus/tap, not initially; track Nudgey/Load-more occlusion and dark calendar icon contrast as separate existing-dashboard QA, not an unreviewed A5 scope expansion.

## 13. Previews index (rev 2, 34 PNGs; automated checks in `design-checks.json`)

Every preview uses synthetic data; the three data ranges are 30, 90 and 120 days ending 2026-11-03.

| File | What it shows |
| --- | --- |
| 01-desktop-default | Desktop 1280, annotated Existing vs NEW, daily 30 days, expanded, **no idle tooltip** |
| 02-desktop-default-clean | Same without review tags (vendor-attribution area still visible) |
| 03-desktop-tooltip-hover | Tooltip after hovering a daily bar |
| 04-desktop-tooltip-keyboard | Tooltip and focus ring after keyboard focus plus Arrow keys |
| 05-desktop-jpy-tab | JPY selected: zero-decimal units |
| 06-desktop-range-90-daily | Exactly 90 days: still daily (90 bars) |
| 07-desktop-range-120-weekly | 120 days: weekly bars (Monday start, partial boundary weeks) with the Weekly view note |
| 08-desktop-weekly-tooltip-hover | Weekly tooltip with week range |
| 09-desktop-weekly-table-open | Complete daily table kept in weekly mode (all 120 days, zero days included) |
| 10-desktop-dark | Dark theme |
| 11-desktop-dark-error | Analytics error, dark |
| 12-desktop-loading | Loading skeletons, no Studio badge |
| 13-desktop-empty | Empty (no matches) |
| 14-desktop-error | Analytics error + Retry |
| 15-desktop-studio-unavailable | Fallback: "Charts unavailable", no badge |
| 16-desktop-studio-unavailable-dark | Fallback, dark |
| 17-desktop-studio-off | Feature off: today's dashboard, nothing added |
| 18-desktop-session-expired | Session expired, sign-in |
| 19-tablet-820-default | 820 px: stacked panel columns, expanded |
| 20-mobile-390-collapsed-default | **390 px default: collapsed**, heading + badge + Show charts |
| 21-mobile-390-collapsed-clean | Same, no review tags |
| 22-mobile-390-expanded-keyboard | Expanded via keyboard Enter on the toggle; focus stays on it |
| 23-mobile-390-expanded-tooltip-tap | Expanded via tap, tooltip after tapping a bar |
| 24-mobile-390-weekly-expanded | 390 px weekly mode |
| 25-mobile-390-range-90-daily-expanded | 390 px, 90 thin daily bars |
| 26-mobile-390-eur-expanded | EUR selected |
| 27-mobile-390-dark-collapsed | Dark, collapsed |
| 28-mobile-390-dark-expanded | Dark, expanded |
| 29-mobile-390-loading | Loading (collapsed by default) |
| 30-mobile-390-empty | Empty |
| 31-mobile-390-error | Error + Retry |
| 32-mobile-390-error-dark | Error, dark |
| 33-mobile-390-studio-unavailable | Fallback |
| 34-mobile-390-session-expired | Session expired |

Synthetic totals (30-day default): USD 117 invoices $26,941.61; EUR 56 invoices €10,561.62; JPY 20 invoices ¥657,000. The 120-day range: USD 487 invoices $110,960.60; EUR 202 €37,192.50; JPY 111 ¥3,626,300. `design-checks.json` also asserts, for all nine currency x range combinations (USD/EUR/JPY x 30/90/120 days), that the daily table has exactly 30, 90 or 120 consecutive calendar days, that zero-invoice days (always present for JPY) show the exact zero value, and that zero rows match zero-height daily bars. In every default preview the card total equals the exact sum of the plotted bars and of the daily table rows (checked in minor units, including weekly mode and JPY).

### Known existing-dashboard issues visible in the previews (not A5 scope)

The 390 px Nudgey button partly covers "Load more invoices", and the dark-mode date-input calendar icon contrast is unmeasured. Both are existing-dashboard QA items tracked separately; the mockup reproduces the existing behavior and A5 does not change it.
