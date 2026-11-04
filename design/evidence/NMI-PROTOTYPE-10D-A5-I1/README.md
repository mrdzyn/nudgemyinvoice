# NMI-PROTOTYPE-10D-A5-I1: real AG Studio 3.0 local integration (evidence)

Evidence for the opt-in, **development-only** "Activity analytics" region rendered by real **AG Studio 3.0.0** (`ag-studio` + `ag-studio-react`, exact pins) inside the authenticated dashboard. Results: [QA-RESULTS.md](QA-RESULTS.md); raw output: `qa-results.json`.

## What is committed here, and what deliberately is not

- `run-studio-qa.mjs`: the browser QA harness (self-contained, test-only; no application code).
- `qa-results.json`: every check with PASS / FAIL, from the final run.
- `screenshots/`: **key-withheld (licence request blocked) renders** of real Studio with synthetic data only. The licensed session (owner's trial key) is observed through text checks only, and **no licensed screenshot is saved or committed**; the harness refuses to take a screenshot outside its unlicensed phase.
- Never committed: the licence key, `.env.local`, any licensed render, any customer data.

## How to run the local integration yourself

```text
# one-time: the owner's untracked .env.local (repo root) holds AG_STUDIO_LICENSE_KEY=<trial key>
pnpm install --frozen-lockfile
VITE_NMI_STUDIO_LOCAL=1 pnpm --filter @nmi/web dev      # dev server only
```

Sign in as usual; the panel appears between the currency cards and the invoice table. Without `VITE_NMI_STUDIO_LOCAL=1`, or in any build, the dashboard is exactly the AG Grid Community dashboard.
A synthetic-only lab page (no API or database) is at `/studio-lab/index.html` on the same dev server (`#days=30|90|120|366`, `&tz=`, `&cur=USD,EUR`, `&theme=dark`, `&huge=1`, `&mismatch=1`).

## Safety model in one paragraph

The key stays out of Git, CI and every build artifact. A Vite plugin that exists only on the **dev server** reads just the one `AG_STUDIO_LICENSE_KEY` line from `.env.local` and serves it to the same-origin browser at runtime on a loopback-only, flagged request (`/__nmi_dev/studio-licence`); it is never injected with `define`. The key is inevitably visible to the local browser once Studio is activated (`AgStudioProvider licenseKey`); that is why this is local-only, why no licensed render is committed, and why hosted/public use still needs written AG Grid confirmation. Production builds fail if any licensed package is ever bundled, and `pnpm check:bundle` scans for Studio markers and for the key value (yes/no only).
