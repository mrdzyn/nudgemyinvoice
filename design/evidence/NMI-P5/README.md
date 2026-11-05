# NMI-P5 evidence: licensed AG Studio production dashboard

All runs are local and disposable, with synthetic data and simulated providers. Nothing here is hosted or real-provider evidence.

| Artifact | What it shows |
|---|---|
| `run-licensed-production-qa.mjs` → `qa-results.json` | **43/43** (including six SEC-N1 negative-CSP checks). The licensed **production** build is served by the real production server entry (`NODE_ENV=production`, runtime DB role) behind a local HTTPS proxy and driven by headless Chrome. The owner's licence is read in memory from the untracked `.env.local` and passed to the server's environment only. It is never printed or written, and every log is checked for it. |
| `a5i1-dev-rerun-results.json` | **96/96.** The A5-I1 dev-server QA re-run on the P5 code, with its order assertion corrected for the analytics-first layout. |
| `screenshots/01`–`08` | Desktop 1280 (all currencies, loading placeholder, EUR filter, dark theme, licence-unavailable fallback) and 390 px mobile (collapsed, expanded, expanded dark). The rendered charts use synthetic data. The daily table is opened in `01` only because the harness compares it with SQL. |

Reproduce: `pnpm build:web:licensed && node design/evidence/NMI-P5/run-licensed-production-qa.mjs`. This needs PostgreSQL 16 (`PG_BIN`), Chrome (`CHROME_BIN`) and `AG_STUDIO_LICENSE_KEY` in the untracked `.env.local`.

After any AG Studio or AG Charts upgrade, recapture the vendor style hashes with `P5_COLLECT_HASHES=1 node design/evidence/NMI-P5/run-licensed-production-qa.mjs`.
