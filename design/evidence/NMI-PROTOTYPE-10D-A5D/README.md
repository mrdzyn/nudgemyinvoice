# NMI-PROTOTYPE-10D-A5-D design evidence (design only, rev 2)

Previews and generators for the owner-approved AG Studio analytics layout. Spec: `design/screens/NMI-PROTOTYPE-10D-A5D-STUDIO-ANALYTICS.md`.

- `build-mockup.mjs` writes `design/mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html` (inlines the real `tokens.css` and `app.css`; seeded synthetic data for 30, 90 and 120 day ranges; no network). Build-time assertions: plotted buckets sum exactly (BigInt minor units) to the card totals and daily rows, and weekly grouping applies only beyond 90 days.
- `capture-previews.mjs` renders the 34 `previews/*.png` with headless Chrome (1280, 820 and 390 px emulated), performs the interactions (panel toggle by mouse, keyboard and tap; hover; keyboard focus plus Arrow keys; tap) and writes `design-checks.json`: 177 checks, all PASS at generation (overflow 0 px, no page errors, collapsed/expanded defaults, tab order of the collapsed body, no idle tooltip, Studio badge and attribution handling per state, daily vs weekly bar counts, bars = daily table = card in exact minor units).
- AG Studio is not installed and no licence key is used; the chart/status visuals are inline SVG/HTML design intent, not Studio renders.
- Known limits: the static mockup pre-renders every state in one file, so element ids repeat in hidden state pages; it is a review artifact, not production markup. Headless/emulated only: no physical device, Safari/Firefox or assistive-technology check. Existing-dashboard issues (390 px Nudgey/Load more overlap, dark date-icon contrast) are reproduced, not changed.
- Regenerate: `node build-mockup.mjs && node capture-previews.mjs` from this folder's repo path.
