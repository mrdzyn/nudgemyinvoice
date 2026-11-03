# NMI-PROTOTYPE-10D-A5-D — Studio Analytics screen specification (DESIGN ONLY)

**Status: PROPOSED — awaiting owner visual approval. Nothing here is implemented.**
AG Studio is **not installed**, no licence key is used, no application behavior, dependency, schema or deployment changes. All data in the previews is **synthetic** (seeded generator, `example.test` addresses).

- Task / plan: `tasks/NMI-PROTOTYPE-10D-A5-ag-studio-integration.md`, `docs/NMI-PROTOTYPE-10D-A5-AG-STUDIO-PLAN.md`
- Baseline: the approved NMI-UI-01B dashboard as shipped through A2 (AG Grid Community 36.2.0), tokens `apps/web/src/styles/tokens.css` (verbatim in the mockup)
- Reviewable mockup: [NMI-PROTOTYPE-10D-A5D-studio-analytics.html](../mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html) (open in a browser; `#state=default|loading|empty|error|unavailable|session-expired`, `&cur=USD|EUR|JPY`, `&theme=dark`, `&clean=1` hides review tags)
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
- Tooltip (hover, focus, tap): "Oct 27, 2026 / $2,037.43 · 7 invoices". Never shows customer data. No click action in v1.
- Peak line under the chart: "Peak day: … Ranges up to 366 days are allowed by the API; see open decision Q4 for long ranges."
- **Data-table alternative** (always present, native `<details>`): "View {CUR} data as a table", columns Day / Invoices / Total ({CUR}). This is the accessible equivalent regardless of Studio's own accessibility.

### 5.2 PayPal Sandbox draft status (C2)

- One row per currency in the answer (or the single filtered currency): currency + invoice count, a 100% stacked bar of the four draft states, and a 2x2 legend of badges with exact counts (zeros shown).
- Meaning is never color-only: every state has an icon + text badge (existing badge set: ○ No PayPal draft, ◔ In progress, ✓ PayPal draft created, ! Needs attention). Segment colors reuse semantic tokens; the "no draft" and "in progress" segments use `--border-input` / `--info-text` for non-text contrast.
- Footnote: "PayPal draft created means a Sandbox DRAFT exists. It is not sent, not paid and not overdue."
- Counts only; nothing is summed across currencies (counts per currency row, no grand total).

### 5.3 Panel chrome

- Heading `h2` "Activity analytics"; badge "Studio · view only" (existing `badge-info`); "Hide charts / Show charts" button (`aria-expanded`, controls the panel body). The expanded/collapsed choice is **not persisted** (no browser storage); default expanded.
- C3 reserved strip: a 24-32 px dashed slot is drawn only in review previews. In the product it exists only if A5-I1 finds that Studio renders a vendor attribution/evaluation watermark; the design must not hide or cover it.

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
| ≤ 767 px (390 px reference) | Single column. Chart-currency selector is full width, 44 px targets. A mobile chart variant (narrower plot, x labels every 7 days, compact y labels) keeps text ≥ 11 px at 390 px. Status legend becomes one column. Cards one per row. Existing bottom nav and Nudgey button unchanged; the table scrolls horizontally inside its card as today. |

Previews show **no page-level horizontal overflow** at 390, 820 and 1280 px (measured by the capture script).

## 8. States

| State | Panel | Rest of page | Preview |
| --- | --- | --- | --- |
| Default | Chart + status | Cards, table | 01, 02, 03, 11, 12, 13 |
| Loading | Skeleton blocks, `aria-busy="true"`, visually hidden `role="status"` "Loading analytics" | Existing card and table skeletons | 05, 15 |
| Empty (no invoices match) | **Not rendered** | Existing "No invoices match these filters" + "Create an invoice"; table not shown | 06, 16 |
| Analytics error (offline, timeout, unavailable, malformed, forbidden, rejected) | **Not rendered** | Existing `role="alert"` "Could not load full-population totals. … No loaded-row estimate is substituted." + Retry; table independent | 07, 17 |
| Studio unavailable (module fails to load, key absent/expired, any Studio error) | Quiet info notice "Charts are unavailable right now. The totals above and the invoice table below are not affected." + "Try loading charts again". **No licence, key or vendor text shown to the user.** | Cards and table fully usable (this is the Community fallback) | 08, 18 |
| Session expired (401 anywhere) | **Removed from the DOM** with every other authenticated widget | Existing sign-in screen with "Your session has expired. Sign in again to continue." and no dashboard data | 09, 19 |
| Offline | As Analytics error (existing offline banner stays) | As today | not separately drawn |

401 handling is the existing late-401 behavior: the session is invalidated and stale widgets are suppressed, never merely hidden.

## 9. Keyboard and accessibility

- Order: filters → currency cards (non-interactive) → panel heading → Hide/Show button → chart-currency tabs → chart (one focus stop, `role="img"` with an `aria-label`/description of range and peak) → "View as table" disclosure → status rows (each bar `role="img"` with all four counts in its label) → table.
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

## 12. Decisions requested from the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| Q1 | Placement: panel between cards and table (as drawn) vs right rail vs a "Charts" tab beside the table | Between cards and table: full width for the chart, no table width loss, one scroll column on mobile |
| Q2 | Multi-currency chart: one currency at a time with a selector (as drawn) vs stacked small multiples (one chart per currency) | Selector: constant height regardless of currency count (the API supports 6+ currencies) |
| Q3 | Interaction: pure view-only (as drawn) vs click-a-bar to set the date range | View-only now; click-to-filter is a later, separately designed change |
| Q4 | Long ranges (> ~90 days): keep daily bars with sparse labels, or aggregate to weeks client-side | Keep daily in I1; decide weekly aggregation with real data |
| Q5 | Panel default on mobile: expanded (as drawn) vs collapsed | Expanded; the Hide charts button covers the rest |
| Q6 | Approve the "Studio · view only" badge and a visible vendor-attribution slot if Studio requires one | Approve |

Approving this design authorizes **only** a separately scoped A5-I1 local implementation task. It does not authorize installing a licensed package, using the licence key, hosting Studio, Render, a judge URL or a merge.

## 13. Previews index

| File | What it shows |
| --- | --- |
| 01-desktop-default | Desktop 1280, annotated: Existing vs NEW regions, tooltip shown on the peak day |
| 02-desktop-default-clean | Same without review tags |
| 03-desktop-jpy-tab | JPY selected: zero-decimal units |
| 04-desktop-dark | Dark theme |
| 05-desktop-loading | Loading skeletons |
| 06-desktop-empty | Empty (no matches) |
| 07-desktop-error | Analytics error + Retry |
| 08-desktop-studio-unavailable | Studio fallback notice |
| 09-desktop-session-expired | Session expired, sign-in |
| 10-tablet-820-default | Stacked panel columns |
| 11-mobile-390-default | 390 px annotated |
| 12-mobile-390-default-clean | 390 px clean |
| 13-mobile-390-eur-tab | 390 px, EUR selected |
| 14-mobile-390-dark | 390 px dark |
| 15-18, 19 (mobile-390-…) | Loading, empty, error, Studio unavailable, session expired at 390 px |

Synthetic totals used in the previews: USD 117 invoices $26,941.61; EUR 56 invoices €10,561.62; JPY 20 invoices ¥657,000 (generated; cards equal the sum of the daily bars).
