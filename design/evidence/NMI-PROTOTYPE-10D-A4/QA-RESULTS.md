# NMI-PROTOTYPE-10D-A4 — QA and Release Readiness Evidence

**Status: NOT RUN.** This file is an evidence template, NOT a successful rehearsal report.

- Source base: `main@588717a7b04cae185da2ad12995346943fe27d02`
- Branch: `docs/nmi-prototype-10d-a4-readiness`
- Test environment (OS / Node / pnpm / PostgreSQL / browser): **NOT RECORDED**
- Tested commit SHA / date/time (Asia/Manila): **NOT RUN**
- Clean clone / isolated database name, port and teardown evidence: **NOT RUN**
- Network isolation and no real-provider evidence: **NOT RUN**
- Host CI at final A4 HEAD: **PENDING**
- Independent exact-HEAD audit: **PENDING**

## Rehearsal results

| Gate | Result | Evidence/observed command | Limitation |
| --- | --- | --- | --- |
| Clean clone + frozen dependencies | NOT RUN | — | — |
| New disposable PG16 + journal migrations | NOT RUN | — | Never run owner DB migrations |
| Mode A launcher; no real provider egress | NOT RUN | — | SIMULATED only |
| Login / CSRF / Origin / late 401 / logout | NOT RUN | — | — |
| Parse / clarify / manual / review / Save | NOT RUN | — | Fake parser, real local DB |
| Dashboard list / detail / pagination | NOT RUN | — | — |
| Full-population analytics vs independent SQL | NOT RUN | — | More than 1 page, filter parity |
| Exact multi-currency/date-timezone behavior | NOT RUN | — | USD/EUR/JPY and DST where applicable |
| PayPal fake DRAFT confirmation / no resend | NOT RUN | — | Not live PayPal |
| Follow-up local-only boundary | NOT RUN | — | No SMTP |
| 390px + desktop / keyboard / error states | NOT RUN | — | Emulation ≠ device QA |
| Build / bundle security checks | NOT RUN | — | — |
| Current runbook reproducibility + cleanup | NOT RUN | — | — |
| Fresh-hosted Render / HTTPS / backup restore | NOT RUN | — | Not authorized |
| AG Studio hosted trial entitlements | NOT VERIFIED | — | Community fallback |
| Devpost public YouTube / submission | NOT DONE | — | Owner release action |

## Notes and discrepancies

No A4 measurements have yet been collected. Prior R0 browser PASS and PR #33 A2 test evidence are historical only. A3-FIX1 is merged into the current baseline but live search/reconciliation interoperability remains **NOT TESTED**. Do not copy earlier pass counts into this table.

## Handoff

- **Local demo:** INCOMPLETE — A4 rehearsal not executed
- **Hosted demo:** NOT AUTHORIZED — no resources provisioned or owner deployment permit
- **Next evidence owner:** A4 implementation/QA agent
- **Required next action:** execute scoped local no-provider rehearsal, update verified matrix/runbook, open/refresh Draft PR, run required exact-HEAD CI, obtain independent audit and owner merge decision.
