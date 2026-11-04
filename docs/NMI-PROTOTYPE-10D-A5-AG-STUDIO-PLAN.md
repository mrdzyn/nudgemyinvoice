# A5 — AG Studio 3.0 local analytics implementation brief

**State:** owner approved A5-D visual direction on **2026-11-04**, with desktop/tablet panel expanded, **mobile collapsed by default** and **weekly plotted bars for ranges >90 local calendar days**. Mockups/previews were regenerated to reflect these decisions (rev 2); independent final design review is pending. Packages **NOT INSTALLED**, Studio UI **NOT IMPLEMENTED**, owner license **NOT PROVIDED TO REPO**, public/hosted rights **NOT VERIFIED**.

## Approved existing product data boundary

```text
authenticated React session
  → POST /api/analytics/summary (bounded date/timezone/currency/status/search filters)
  → Fastify session, CSRF/Origin, owner scope and PostgreSQL full-population SQL
  → sanitized currency-level aggregates + day buckets
  → AG Studio built-in read-only chart/KPI widgets (local feature-gated view)
```

- Keep existing pagination for the standalone AG Grid Community invoice table at `POST /api/invoice-drafts/search`. Studio is **not** to infer a population from loaded grid rows, accept operator IDs or query database/PayPal directly.
- Initial proposed layout (owner visual approval required): existing dashboard header/date/search/filter controls → existing authoritative currency-separated KPI cards → optional **Studio Analytics** view-only region with daily per-currency chart and draft-state breakdown → existing Community invoice grid. An alternative swap of widgets requires a revised design approval.
- For a blank aggregate or failed fetch, retain the current empty/loading/error/Retry states; 401 must invalidate the session and suppress stale widgets. No customer emails/names or invoices in the Studio chart data source; no stored report definitions or browser storage.
- Strict interpretation: `created` means Sandbox **DRAFT** exists, not that it was sent, paid or overdue.
- Studio data representations must preserve exact amount semantics; avoid floating-point aggregation and formatting that turns minor-unit `BigInt` / decimal-string totals into inaccurate currency figures. Prefer server-calculated and preformatted display strings or safe verified-scale chart values with defined bounds.

## Library/version and security checklist

- Studio 3.0: `ag-studio-react@3.0.0`, `ag-studio@3.0.0`; matching AG Grid 36.2 and AG Charts 14.2 if present separately. Confirm actual npm resolved versions against vendor compatibility docs before use.
- Current NMI React 19/TypeScript 5.9/AG Grid 36.2: likely compatible per vendor matrix, **not yet built** with Studio.
- A trial expiry of **Dec 16, 2026** is recorded from owner evidence, no licence string stored. For client-side `AgStudioProvider`, a build-time `VITE_` key is *not secret*; never claim secrets remain server-side after bundling. Local development may be unlicensed/watermarked as allowed by vendor.
- The public vendor page says production evaluation is available with a trial; published v40 EULA clause 13 appears narrower (internal evaluation). Require vendor written confirmation before external judge access or public demo distribution. No hosted Studio deployment in this plan.
- Community fallback remains the production demo default until local Studio tests, exact-head CI and design/license gates pass. No AG Studio AI module, OpenAI key in browser, MCP, new persistence, or per-judge shared account claim.

## Decisions requiring human approval

1. Visual direction: optional new Studio chart region **vs.** replacing an existing visual; approve view-only and 390px mobile layout.
2. Trial terms: confirm AG Grid authorizes external judge access/recording/public deployment for NudgeMyInvoice through Dec 15 (or use Community in the hosted demo).
3. Licence handling: accept that licence activation is client-visible at runtime if Studio is published; never commit/license-key paste.
4. Future deployment: Render resources, paid plan/cost ceiling, owner-only QA and judge sharing remain a separate authorization.

Official references: https://www.ag-grid.com/studio/react/installation/ ; https://www.ag-grid.com/studio/react/licence-install/ ; https://www.ag-grid.com/studio/react/compatibility/ ; https://www.ag-grid.com/studio/react/enterprise-licence/ ; https://www.ag-grid.com/studio/licenses/ag-studio/LICENSE.html .
