# NMI-RC70 — Judges RC browser QA evidence (review 5816666095 remediation)

Exact application HEAD exercised: PR #70 RC `a54b9d1d2f3fdf494e041084449912439642fac2`
(production `apps/web/dist` built from that tree + real API + disposable PostgreSQL 16.15,
synthetic `qa_operator`). This branch holds evidence only; PR #70 code is untouched.

## Runbook

```sh
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH"
# disposable QA DB on 127.0.0.1:55449/nmi_qadb, migrations applied, operator provisioned via
# pnpm --filter @nmi/api provision-operator
QA_USER=qa_operator QA_PASS='<secret>' QA_SESSION_SECRET='<secret>' node design/evidence/NMI-RC70/rc70-qa.mjs
```

Result on 2026-11-08: **30/30 PASS** (`{"failed":0,"total":30}`).

## What the corrected harness asserts (every PASS is an observed outcome)

- `api /health 200 + status ok + sandbox` — final response asserted
  (`{"status":"ok","paypalEnvironment":"sandbox","aiConfigured":false}`), not an
  unconditional PASS after polling.
- Branding: login logo decorative + loaded (1024x1024), header wordmark
  alt `NudgeMyInvoice` (1376x768), both brand JPEGs `200 image/jpeg`, favicon link.
- Keyboard: Tab reaches Skip link first; trusted typing lands; launcher reached by
  Tab traversal in 23 tabs (observed). Sign-in submit used programmatic
  `requestSubmit` after full keyboard traversal — the check is labeled
  `submit=requestSubmit-after-traversal` and does **not** claim native Enter
  activation (trusted CDP Enter produced no submit in headless Chrome; hardware
  Enter remains owner QA).
- Focus: `launcher focus shows visible indicator` requires an observed change —
  measured `outline-style:solid outline-width:2px` (see `04b-launcher-focused-1280.png`).
- EUR-chip operability at 390px (the reviewer's finding):
  - `08a-eur-initial-390.png` reproduces the overlap (chip x221–277/y727–771 vs
    launcher x242–378/y712–770; `elementFromPoint` hits the launcher).
  - Chip scrolled to viewport center: `overlap:false`,
    `elementFromPoint` hits `BUTTON.pill::EUR`.
  - Trusted CDP tap on the chip center flips `aria-pressed` to `true` (only EUR
    pressed); `08b-eur-tapped-390.png` shows EUR active with Clear-filters visible.
  - No product CSS changed: the fixed launcher inherently covers some scroll
    positions (standard FAB behavior); the 140px mobile body clearance lets any
    content scroll clear, which this run proves end to end.
- Zoom: `200% zoom zero horizontal overflow` asserts `h-overflow=0px`
  (`10-dashboard-zoom200.png`).
- Mobile 390: no horizontal overflow, wordmark fits, launcher clears the bottom nav.
- Safe Mode disclosure opens with `aria-expanded=true`; CSP meta intact, zero CSP
  violations; console/4xx limited to pre-auth session probes.

## Honest limitations

- Same-agent implementation + verification; cross-party review still required.
- Native Enter activation unverified in headless harness (see above).
- Favicon rendering observed in Chrome only; cross-browser display is owner QA.
- Screenshots are Chromium headless renders at the named viewports.

## Files

- `01/02/03/04/04b/05/06/07/08/08a/08b/09/10` PNGs — the full capture set viewed by the verifier.
- `rc70-qa.mjs` — the exact corrected runner (Node builtins only).
