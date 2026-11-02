# NMI-PROTOTYPE-10D-A2 Browser QA

- **Result:** PASS
- **Chrome:** Chrome/156.0.8078.80 (headless, DevTools Protocol)
- **Stack:** local Fastify API + Vite React client + disposable PostgreSQL database `nmi_test_a2_qa_20261102`.
- **Data:** synthetic operator and 257 synthetic USD invoice rows; one local Sandbox draft-state row; one ownerless negative-control row. No customer data.
- **Providers:** PayPal draft creation disabled; OpenAI unconfigured; no SMTP configured or called.
- **Coverage:** desktop dashboard, 257-row authoritative exact total, 200-row pagination cap, date/search/currency filters, clear-filter recovery, keyboard focus, dark system theme, 390px mobile overflow, browser-origin observation, console/runtime errors.
- **Network:** only local application-origin requests observed; no request to provider or other external host.
- **Artifacts:** `desktop-dashboard.png`, `filtered-dashboard.png`, `dark-dashboard.png`, `mobile-dashboard.png`, and machine-readable `qa-results.json`.

| Check | Result | Evidence |
|---|---|---|
| authenticated dashboard loads server aggregate and rows | PASS | {"coverage":"Matching invoices owned by this operator, created Oct 4, 2026 through Nov 2, 2026 inclusive (Asia/Manila).","visibleRows":20} |
| aggregate stays independent of page size and is labelled by currency | PASS | ["USD\n257 invoices\n$3,171.38\nFull matching operator-owned USD total · PayPal Sandbox drafts created: 1"] |
| pagination stops at 200 loaded rows without changing full-population KPI | PASS | load-more actions=9; visible grid rows=200 |
| date and customer filters apply to both SQL reads | PASS | — |
| search term is absent from the browser URL | PASS | — |
| currency filter has a truthful no-match state | PASS | — |
| search-to-status keyboard navigation works | PASS | focused control=dash-status |
| system dark theme renders the authenticated dashboard | PASS | — |
| 390px mobile dashboard has no page-level horizontal overflow | PASS | {"width":390,"documentWidth":390,"card":true,"range":true} |
| date range remains visible and tappable after mobile scroll | PASS | — |
| no browser request left the local app origin | PASS | no non-local requests observed |
| no browser runtime or console errors | PASS | — |

This is an automated local browser run with synthetic data, not physical device QA or hosted-provider evidence.
