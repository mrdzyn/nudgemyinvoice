# NMI-PROTOTYPE-10D-A1 — Authenticated analytics foundation

- **State:** Implementation on separate Draft PR; independent exact-HEAD review pending.
- **Scope owner:** A1 backend analytics contract only; UI/AG Studio shell requires separate design approval.
- **Base:** `main@9cf6f4ebf169e8a0c18cef106a741c2c9320df0f` (PR #31 owner squash-merged).
- **Branch:** `feat/nmi-proto-analytics-01`
- **Parent contract:** [NMI-PROTOTYPE-10D](NMI-PROTOTYPE-10D.md) and [architecture plan](../docs/NMI-PROTOTYPE-10D-PLAN.md).

## Objective

Build a real, authenticated, read-only, full-population analytics API for AG Studio charts without introducing UI, external service calls, migrations, paid resources, or changes to the audited PayPal boundary.

## Implementation scope

- `POST /api/analytics/summary`, protected by existing validated operator session, CSRF and Origin.
- Strict JSON body (no alternate operator ID): `fromInclusive`, `toExclusive` as exact UTC ISO millisecond instants; mandatory IANA `timeZone`; optional `currency`, `status`, `q`.
- **Both date bounds required for A1**. Missing/partial bounds, reversed/zero interval or range exceeding 366 UTC days are invalid. Future bounded defaults are a separate UI/API design decision.
- SQL aggregation across all matching owned invoices, independent of the cursor-paginated grid. The chart's UTC interval applies to `invoices.created_at`; local-day buckets use `timezone()` for calendar grouping and observe DST.
- Currency totals and day totals are separate per code and exponent, integer minor-unit sum returned as a decimal integer string. No cross-currency grand total, floating money, FX, paid/overdue inference or user/customer identifiers in response.
- PayPal status groups match the existing list: `none`, `progress`, `created`, `attention`. Search term stays exclusively in the request body.
- Aggregate store stays reusable by later UI and Workflow phases, but this task does not enable either.

## Deliberately out of scope

No AG Studio UI shell, visual design changes, chart configuration/report persistence, migrations, authorizations beyond existing operator session, provider execution, PayPal AI Toolkit MCP, Render resources/workflows, OpenAI, PayPal writes, fake payment status or judge-sharing. No changes to currency support: the current domain supports USD/EUR/GBP/CAD/AUD (2 decimals) and JPY (0); KWD/three-decimal currencies are **not supported** and require a separately reviewed domain/database/PayPal-mapping change.

## Objective-based evidence

1. Real Fastify + disposable PostgreSQL integration tests: anonymous/CSRF/Origin, second operator + ownerless exclusion, independent full-population SQL vs 50-row page, per-currency exact sums, status and text filters.
2. UTC half-open boundaries and `America/New_York` DST local-day bucket; strict IANA and interval error cases; no data returned in error.
3. Read-only: provider config disabled, no PayPal create/OpenAI use and no invoice/follow-up changes.
4. Required Project Baseline and Stack CI at exact PR HEAD. Local runtime tests may be unavailable to the GitHub-connected agent; report only observed CI/agent evidence.
5. Independent correctness/security audit before owner merge approval; do not merge or deploy.

## Handoff

`NMI-PROTOTYPE-10D-A1-IMPLEMENT-01` in `docs/HANDOFFS.md`. No change to the Render, AG Studio license or consumed provider authorizations.
