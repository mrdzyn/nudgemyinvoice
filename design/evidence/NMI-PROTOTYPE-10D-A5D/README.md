# NMI-PROTOTYPE-10D-A5-D design evidence (design only)

Previews and generators for the proposed AG Studio analytics layout. Spec: `design/screens/NMI-PROTOTYPE-10D-A5D-STUDIO-ANALYTICS.md`.

- `build-mockup.mjs` writes `design/mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html` (inlines the real `tokens.css` and `app.css`; seeded synthetic data; no network).
- `capture-previews.mjs` renders `previews/*.png` with headless Chrome (1280, 820 and 390 px emulated). It reports page-level horizontal overflow per shot (0 px for all 19).
- AG Studio is not installed and no licence key is used; the chart/status visuals are inline SVG/HTML design intent, not Studio renders.
- Known limits: the static mockup pre-renders every state in one file, so element ids repeat in hidden state pages; it is a review artifact, not production markup. Headless/emulated only: no physical device, Safari/Firefox or assistive-technology check.
