# NMI-PROTOTYPE-10D — 10-day prototype architecture and delivery plan

- **State:** Proposed; documentation-only architecture Draft PR. No implementation, provider operation, infrastructure or release is authorized by this plan.
- **Prepared:** 2026-11-02 (Asia/Manila)
- **Target:** functional PayPal AI Hackathon prototype by 2026-11-11; hosted judges' access through 2026-12-15 is a separate, owner-approved release gate.
- **Starting `main`:** `3d4c6308dd1f7263ebd7bb79920ba4c9b70ab998` (verified against GitHub on 2026-11-02).
- **Working branch:** `docs/nmi-prototype-10d`
- **Scope:** docs and evidence links only. No `render.yaml`, package change, code, migration, credential, provider call, resource, deployment, merge, publication, or PayPal budget reset.
- **Design gate:** Not applicable to this documentation PR. The proposed dashboard layout reuses the owner-approved NMI-UI-01B layout; any substantial AG Studio shell work still needs owner design approval before implementation.

## 1. Current baseline and status reconciliation

GitHub reports `main` at the supplied starting SHA. Draft PR #30 was squash-merged on 2026-10-31 at this SHA. Its scoped physical Chrome QA evidence is in `design/evidence/NMI-NDG-02-V1/QA-RESULTS.md`; the merge did not authorize hosting or providers. As of this plan, the only open Draft PRs are #24 (NMI-RENDER-P3) and #10 (NMI-UI-01C2). No prototype implementation PR exists.

The prior Render P2 selection in `docs/NMI-RENDER-P2-STAGING-APPROVAL-PACKET.md` is for Mrdzyn Hobby + Free web + Free PostgreSQL. That PostgreSQL expires after 30 days and cannot meet a November-to-December-15 availability target. This proposal therefore identifies a paid, persistent database option for a future owner decision. It does not revoke the prior selection, authorize charges, supersede its safety gates, or authorize resource creation. Before hosting, the owner must choose which plan to use and approve actual account costs and exposure. Current account pricing, credits, region capacity and invoice settings are unverified.

The prior Render runbook says not to use a Blueprint. This proposal requests a reviewed Blueprint for the future prototype as a new architecture direction; it does not authorize applying it. A separate architecture review and owner approval must explicitly supersede that older manual-only runbook constraint before any Blueprint is created or synced.

## 2. AG Studio 3.0 React analytics architecture

### Verified product and license facts (checked 2026-11-02)

- AG Grid's official React documentation labels AG Studio **3.0.0** as the current major version and describes its Agent Framework and server-side pagination ([AG Studio 3 upgrade guide](https://www.ag-grid.com/studio/react/upgrading-to-ag-studio-3/), [what's new](https://www.ag-grid.com/studio/whats-new/)). Pin the exact compatible packages only after a compatibility check; the existing standalone AG Grid Community 36.2.0 is not proof of AG Studio compatibility.
- AG Studio is commercial; each deployment requires a license. AG Grid currently offers a **45-day trial** including production evaluation and engineering support ([React license page](https://www.ag-grid.com/studio/react/enterprise-licence/)). A trial started on/near Nov 2 may cover Dec 15, but the actual issued license start/expiry and distribution/hosted-judge terms must be confirmed in writing before relying on it. The prior project note's trial assumption is not a license grant. No trial has been requested or activated for this sprint.
- AG Studio's license covers Studio and its built-in grid/chart widgets only; standalone Enterprise widgets/custom widgets may require separate licenses. Keep the existing AG Grid Community table outside AG Studio or use Studio's built-ins until licensing is reviewed.

### Runtime and data boundary

```text
Authenticated React dashboard
  └─ AG Studio data source / server-side paging adapter
       └─ same-origin Fastify analytics routes
            ├─ verified session → TrustedActor.operatorId
            ├─ strict request/response Zod schemas
            └─ PostgreSQL owner-scoped query/aggregate
```

AG Studio receives only bounded DTOs returned by Fastify. It never connects to PostgreSQL, PayPal, or Render directly. Operator identity comes exclusively from the validated session and SQL predicates; request bodies cannot select another operator. Reuse existing `POST /api/invoice-drafts/search` for list filters where its response shape suffices. Add a narrow analytics read route only if an actual widget needs aggregate data that the existing route cannot provide. All protected reads are `no-store`; all search terms remain in POST bodies, never URLs or browser storage. Keep operator/customer emails out of chart rows unless a specifically approved table interaction needs them.

**Proposed read contract** (versioned and strict; exact route names remain an implementation decision):

- Invoice rows: opaque local invoice UUID, created/due date, currency, exact total as decimal string plus currency code, line count if needed, and durable PayPal draft state (`none | progress | created | attention`). Do not expose PayPal tokens, request digests, raw provider payloads, audit rows or `paypal_invoice_id` unless an existing detail view requires it.
- Currency summary: one row per ISO currency with invoice count, count by draft state, and exact total in that currency's minor units. Return the currency code and exponent with every total. Never produce a grand total or rank unlike currencies by numeric magnitude.
- Time basis: store/compare timestamps as UTC instants. Define dashboard calendar grouping and the displayed operator timezone explicitly; never silently treat PayPal Sandbox `DRAFT` as sent, unpaid, overdue, or settled. Due-date counts may be described as date-based only, with the underlying PayPal state visible.
- Bound every query and response (page size, range, filter enum, output row cap and timeout); validate cursor and every response at runtime. Do not accept arbitrary SQL, expressions, or model-supplied field names.

### Dashboard layout and cross-filter behavior

Carry forward the approved NMI-UI-01B dashboard: title/operator context and date range; currency-separated KPI cards; compact invoice-state chart; the existing searchable/filterable invoice grid; and an optional read-only insights panel. Keep existing navigation, status labels, keyboard behavior, light/dark styles and 390px mobile layout. Prefer replacing the invoice-table surface with Studio only after licensing and accessibility checks; do not add a second competing table.

Cross-filtering updates a single validated filter state (date range, currency, supported PayPal draft-state group, and bounded text search). Chart selections update filters and grid results; row selection opens the existing owner-scoped detail route; pagination is server-side for the entire operator account. Changing filters cancels/invalidate stale requests. Empty/loading/error/401 states reuse the app's existing behavior. The dashboard must make clear that filters cover the authenticated operator's invoices, not all PayPal records.

### Report persistence

Persist only an explicitly saved, versioned report definition/layout (widget IDs, supported dimension/measure IDs, filter defaults, layout settings, schema version); do not snapshot invoice rows, customer text, generated insight, credentials or provider responses. Use a new owner-scoped table and forward-only migration if needed. Save/update/delete require session, exact Origin, CSRF and a server-validated schema; reads are owner-scoped and indistinguishable for foreign/unknown IDs. Set payload/widget/row bounds and validate supported fields server-side. No automatic localStorage/IndexedDB persistence and no autosave of customer-bearing filters. Report persistence requires a migration review and test-only second-operator isolation evidence before code is merged.

### AG Studio Agent Framework feasibility

The official framework is opt-in, supplies no model/backend, and delegates provider requests to an adapter selected by the application. The docs' browser-side adapter example warns that placing a provider key in the browser exposes it. Tool results can include live row values, while field names and tool schemas may also be sent to the selected model ([Agent Framework overview](https://www.ag-grid.com/studio/react/ai/), [quick start](https://www.ag-grid.com/studio/react/ai-quickstart/)).

**Feasibility:** technically plausible for read-only dashboard Q&A and report construction, but not an assumed C2 deliverable. Keep disabled until (a) owner approves the AI data flow and a new bounded provider request, (b) a same-origin server adapter owns the key, (c) only aggregate/synthetic rows and read-only tools are exposed, (d) prompts/results are not persisted by default, and (e) privacy, output validation, cost/rate limits and independent audit pass. No browser key, direct browser-to-OpenAI call, AG Grid hosted AI endpoint, arbitrary query tool, PayPal tool, or model-triggered invoice action. Existing OpenAI Gate A authorization was consumed and is not reusable.

## 3. PayPal Sandbox draft-creation investigation

### Evidence-based starting point

- The backend has a fenced `paypal_draft_operations` state machine, an owner check before operation access, durable create intent before dispatch, fixed Sandbox host/method/path allowlists, and exact read-back verification. Its source contract says PayPal does **not** document `PayPal-Request-Id` for create-invoice, so that header is not treated as the guarantee. The app fails closed after unclear outcomes and never blindly recreates.
- The known create-side 401 defect was a real adapter bug: a create 401 could trigger automatic resend. FIX-B1 is merged on `main` (PR #19), with offline wire-count correction in PR #20. Current behavior sends no automatic retry for create; it records an unknown outcome and leaves only read-only reconciliation. Evidence: `tasks/NMI-DEMO-R1-FIX-B1-paypal-401-no-resend.md`, `design/evidence/NMI-DEMO-R1-FIX-B1/`, and `docs/NMI-DEMO-R1-B-WIRE-COUNT.md`.
- The only recorded real Sandbox success is the owner-run 2026-10-26 happy path: one synthetic USD 5.00 line, zero tax/discount, OAuth 200, one create 201, one read-only show 200, verified DRAFT; temporary process guard was used and the one-create budget is exhausted. Other mapping, search-lag, error, duplicate and reconciliation variants are fixture/DB evidence only. This is not evidence of a current Sandbox defect and does not permit another call.

### Bounded investigation (offline only for this sprint's first pass)

1. Reproduce the UI journey using the existing deterministic fake transport and PostgreSQL suites. Confirm exactly one backend wire create attempt for explicit confirmation; no create during parse/save/list/refresh; create 401 => one POST, unknown outcome, later read-only reconcile; no blind second POST after timeout/5xx/empty search; exact status/currency/total/date/number/reference verification.
2. Compare the adapter/allowlist against PayPal's current Invoicing v2 docs and OpenAPI, with the official [PayPal AI Toolkit](https://github.com/paypal/AI-Toolkit) best-practices material used only as developer documentation. Record source version/commit and exact mismatched request/response field, status and sanitized local reproduction. Toolkit recommendations do not override our code contract.
3. Treat PayPal AI Toolkit MCP as a **development aid only**, never an app dependency or runtime agent. Do not configure a sandbox access token or invoke its MCP server in this task. Its advertised tools include mutating invoice operations; exclude create/send/remind/cancel/delete and all payment/refund tools from any future agent allowlist. No toolkit agent gets a route around backend ownership, explicit operator confirmation, audit, or one-create fencing.
4. If existing tests do not reproduce a defect, say **no current defect reproduced offline** and list the provider behaviors still unverified; do not call PayPal to force a reproduction. A new real provider attempt requires a new owner-written request naming the run ID, target, exact action and one-create budget; historical 1/1 authorization remains exhausted.

Preserve the audited backend, authorization requirement (explicit authenticated operator confirmation tied to the owned invoice), and at-most-one remote create attempt. Any proposed code change needs its own bounded task and exact-head independent security review; this architecture PR changes no code.

## 4. Render hosted architecture and judge access

### Proposed topology

- One same-origin Render **Node web service** runs Fastify and serves the built React/Vite assets. Browser routes and API use one HTTPS origin; keep `connect-src 'self'`, secure `__Host-` session cookie on HTTPS, exact Origin + CSRF for mutations, CSP/HSTS, body limits, redacted logs and bounded auth rate-limits. No separate public API origin.
- One persistent **paid Render PostgreSQL** instance in Singapore (or the owner-approved supported region), private networking only. The previously selected Free database is not suitable: 30-day expiry is shorter than Nov 11 → Dec 15. Select storage/compute, backup/recovery and lifecycle only after current price/account review.
- One TypeScript **Render Workflow** hosts exactly one read-only AI-insight task. It has no listener, webhook, cron, PayPal client, write-capable DB credentials or task for send/remind/payment. The web app may trigger it only from an authenticated, CSRF-protected explicit operator action with a rate limit. It may read only an allow-listed aggregate view; use a read-only DB role or server-produced minimal aggregate input. Never pass customer names/emails, invoice text, PayPal IDs/tokens, session/CSRF values or raw invoice rows. Render retains task arguments and returns for 30 days, so even aggregate payloads/results must be minimized and retention accounted for. The result is advisory, validated as bounded plain text, shown as generated insight, and is not saved unless a separate explicit report-save action is later approved. No background scheduling: Render Workflows currently has no native scheduler.
- Workflow provider access, if approved, uses server-side OpenAI credentials and the existing single-provider architecture. Default deployment has providers disabled. Without an approved provider, judges use the truthful deterministic/local fallback, clearly labeled; no fabricated “AI generated” claim.

### Blueprint and deployment controls

Render's current Blueprint supports `type: web` and `type: workflow` services; Render PostgreSQL is declared under the Blueprint's `databases` section (a private service `type: pserv` is a different resource). TypeScript workflow tasks use `@renderinc/sdk` **1.x or later**. `region` is required for workflows. Render CLI Blueprint validation requires CLI **2.7.0+** or the Validate Blueprint API. Workflows are not supported by PR preview environments or Blueprint replication. A workflow has no `preDeployCommand`; run migrations only through an explicitly reviewed one-time/manual operation or another supported paid web-service pre-deploy path. Never run migrations from every web instance at startup. References: [Blueprint spec](https://render.com/docs/blueprint-spec), [Workflows](https://render.com/docs/workflows), [TypeScript SDK](https://render.com/docs/workflows-sdk-typescript), [Blueprint/IaC](https://render.com/docs/infrastructure-as-code).

Future Blueprint review should require: `previews.generation: off`; `autoDeployTrigger: off` on web and workflow; exact `branch`/repo and region; explicit resource names and plan; DB `fromDatabase` private connection; generated session secret; unresolved secrets declared with `sync: false` and entered only in Dashboard; `PAYPAL_DRAFTS_ENABLED=false`; no `PAYPAL_*`, OpenAI key or Render API key in git; workflow task state minimization; and a reviewed one-time migration/rollback/backup procedure. Blueprint sync is infrastructure-changing and requires separate owner approval. First resource creation may immediately build/deploy; approval must name that effect and exact commit. Keep branch pinning and deployed SHA verification in the runbook.

### Migrations, runtime role and recovery

Use the committed ordered migrations through current HEAD, then any separately reviewed report/read-only-view migration. Test a clean database, upgrade from the last released schema and rollback/recovery on a disposable PostgreSQL instance. Back up and verify restore before any hosted migration. Use the existing restricted runtime role grants, adding only least-privilege SELECT on approved insight views and necessary CRUD for authenticated app functionality. The workflow role gets SELECT only; do not grant it audit-log writes, invoice changes, approval changes or sequence ownership. No migration against the owner's existing local database.

### Security, costs, license, operations and availability

- Public MIT app; no production-mode PayPal, outbound customer notification, secrets in Git, judge-shared owner/admin password, real customer data, or uncensored provider/log output. Judges receive synthetic records and a separately rotated, least-privilege demo credential/access plan after owner-only HTTPS QA. Preserve an isolated operator account/database; single-operator schema means concurrent judges otherwise share state and credentials.
- Judge access target: working hosted environment through **Dec 15, 2026**, plus explicit teardown/backup at owner-selected time after that date. Monitor availability, DB storage, workflow compute/state retention, bandwidth, build minutes, and provider usage daily. Free web sleep/Free DB expiry cannot meet the target. Pro-only native HTTP request log availability is unverified on the selected Hobby workspace; the alternative privacy evidence and acceptance must be reviewed, not waived silently.
- Public July 2026 Render guidance lists a minimum paid Postgres at about **$6/month**; an official Render article gives an illustrative Starter web + Basic-256MB Postgres baseline around **$13/month**, before storage/usage; this is planning context, not current checkout/account pricing. Workflows use `flex` at $0.20 per active CPU-hour + $0.05 per active GB-hour (up to $0.40/hour at full 1 CPU/4 GB use), minimum one-second charge at 0.1 CPU/0.1 GB, and retained task state is $0.25/GB-month for 30 days. Private same-region traffic, storage growth, logs, pipeline, workspace plan, tax, overage and credits can alter cost. Recheck official [Render pricing](https://render.com/pricing), [Postgres recovery/backup limits](https://render.com/docs/postgresql-backups), [Workflow limits/pricing](https://render.com/docs/workflows-limits), and the owner's Billing screen immediately before any resource decision. No fixed cap or no-charge assumption is made.
- AG Studio requires a separate confirmed commercial deployment license. If trial terms, compatibility, or hosted access through Dec 15 are not confirmed, use the existing MIT Community grid and keep the approved layout; do not ship an expired trial watermark or redistribute unlicensed Studio.
- Hosted application health check, exact deploy SHA, HTTPS cookie, CSRF/Origin, CSP, rate-limit, proxy/request-log privacy, owner isolation, backup restore, provider-disabled checks and synthetic judge journey must pass before sharing the URL. Provide a fresh-clone local fallback throughout the judging period.

## 5. Day-by-day implementation plan (Nov 2–11, Manila)

No implementation begins until the architecture is independently reviewed and the owner approves the scope. Provider and Render work each need separate, explicit authorization; the schedule below is conditional, not permission.

| Day | Date | Primary output | Parallel boundary / gate |
|---|---|---|---|
| 1 | Mon Nov 2 | Reconcile current baseline; approve this architecture; AG Studio trial/package compatibility and Render workspace-cost questions | Docs/architecture only. No code or provider/resource calls. |
| 2 | Tue Nov 3 | Dashboard DTOs, currency KPIs, screen states, report schema; owner design review | UI/data-contract work can run in parallel with offline PayPal evidence review; separate branches/files. |
| 3 | Wed Nov 4 | PayPal defect investigation report and deterministic reproduction of current fix; toolkit guidance pinned/reviewed | No MCP, credentials, provider, or code bypass. Any code defect becomes separate task. |
| 4 | Thu Nov 5 | AG Studio shell on approved design, Community fallback retained | Starts only after owner design and license/trial approval; no report persistence or AI yet. |
| 5 | Fri Nov 6 | Wire existing owner-scoped list + currency-safe aggregation; cross-filter cancellation/stale guards | API/DB contract owner, UI consumes DTO only; any migration has own review. |
| 6 | Sat Nov 7 | Explicit report save/read with owner-scoped persistence and migration/restore proof | No autosave; synthetic data and disposable DB; audit before merge. |
| 7 | Sun Nov 8 | Read-only insight Workflow, local task tests, bounded inputs/outputs and spend estimate | Only after explicit OpenAI/Render approval; otherwise deterministic insight fixture and clear SIMULATED label. |
| 8 | Mon Nov 9 | Integrated no-provider browser QA, currency/isolation/security tests, local judge-runbook fallback | PayPal integration remains fake/offline unless a new bounded provider authorization is approved. |
| 9 | Tue Nov 10 | Independent exact-head audit, fix findings, required CI, owner-only hosted HTTPS/security QA if separately authorized | Audit is by a person/agent who did not implement; freeze candidate SHA. |
| 10 | Wed Nov 11 | Release freeze, verify evidence and hosted availability plan through Dec 15, prepare handoff | No new feature after freeze. Only owner-approved blocker fixes with targeted tests, CI and fresh audit. No merge/deploy without separate owner approval. |

Parallel lanes: (A) analytics UI/contracts; (B) PayPal offline defect diagnosis; (C) hosting/workflow design and cost verification. A lane may not modify another lane's owned files without coordination. Shared API/schema/security changes require one integrator, written contract and serialized review. No parallel provider calls.

## 6. Acceptance tests and independent gates

### Objective-based acceptance

1. Dashboard contract tests prove authenticated operator scoping on every endpoint, foreign/ownerless IDs are indistinguishable from unknown, response bounds, strict schemas, search-body-only transport, 401 expiry, and stale/cancelled reads cannot repopulate old state.
2. Exact-money tests for USD/EUR/GBP and zero-/three-decimal currencies as supported prove totals and sort/group rules remain per-currency; no cross-currency KPI, FX or misleading paid/overdue state appears.
3. Browser tests prove cross-filter ↔ grid synchronization, server pagination, explicit report save only, reload of saved layouts, empty/error/401 states, keyboard/accessibility behaviors and 390px design.
4. Persistence tests prove report schemas are versioned/strict, user-scoped, bounded, safe against unknown fields, and contain no row snapshots/provider result/customer data; test two operators in a disposable DB.
5. PayPal regression suite verifies one actual adapter create attempt per explicit request including 401, no automatic create in parse/save/list, read-only reconciliation and no send/remind/cancel/refund/capture/payment path. Existing owner-run Sandbox evidence is cited, not repeated. Any newly authorized provider smoke is separately bounded and recorded; no test budget reset.
6. Workflow tests prove only the single insight task is registered, no write-capable DB operations/tools are available, payload/output are bounded and redacted, retries cannot create side effects, unauthorized triggers are denied, 429/spend/rate limits behave, and a missing provider uses the labelled fallback.
7. Render preflight on a disposable configuration validates Blueprint with Render CLI >=2.7.0, checks no secret literals, migration ordering/rollback/backup, exact deploy SHA, HTTPS/session/CSP/log boundaries, private DB access, and synthetic judges' end-to-end access until Dec 15. Do not create real resources during implementation tests.
8. Required hosted Project Baseline and Stack CI pass on exact final PR SHA. Focused tests are selected from the changed objective under `docs/TESTING.md`; full provider tests are not repeated. Manual accessibility/mobile/Chrome and owner-only HTTPS evidence are recorded honestly.

### Gates

`docs-only architecture Draft PR → independent architecture review → owner scope/design/license/cost/provider approval → bounded implementation task(s) → targeted tests and no-provider browser QA → hosted CI → independent exact-head security/correctness audit → owner merge decision → separate owner release/deployment authorization → owner-only HTTPS QA → private judge access approval.`

No stage is implicitly approved by the previous one. First PR acceptance is only a review of this plan.

## 7. Cut lines and reproducible fallback

Cut in this order if a sponsor dependency threatens Nov 11: (1) AG Studio Agent Framework; (2) AI insight Workflow; (3) saved customizable report definitions; (4) advanced chart cross-filter combinations. Keep approved Community grid, currency-separated summaries, existing invoice search/status/detail, local follow-up UI, and PayPal draft UI only as already authorized and tested.

- **AG Studio license/compatibility/terms fail:** use the already-merged AG Grid Community 36.2.0 invoice grid and app-owned KPI cards on the existing approved dashboard. No trial-dependent binary in the release.
- **Render Workflow or AI approval/failure:** disable the Workflow service/provider and show no AI-insight claim; use a deterministic, explicitly `SIMULATED` fixture for local rehearsals only. Hosted demo may omit insights.
- **Render paid plan/cost/Blueprint approval unavailable:** keep the clean-clone local judge setup in `docs/NMI-DEMO-JUDGE-RUNBOOK.md` and publish no live URL. The old Free PG selection is not a valid Dec 15 fallback.
- **PayPal Toolkit/install/docs unavailable:** use existing official API/OpenAPI references and checked-in fixture suites; no MCP. If a defect is not reproducible without a provider, document NOT VERIFIED and preserve the existing safe UI/backend; do not spend the exhausted test budget.
- **OpenAI unavailable or unauthorized:** existing manual-entry flow remains usable; no model call. Never substitute another AI provider or browser key.

## 8. Security, privacy, and release impact

This PR changes documentation only. It grants no new external or database behavior. Future implementation must preserve the NMI-P0 human approval boundary, current `TrustedActor` and owner-scoped queries, local-only follow-up notifications, `PAYPAL_DRAFTS_ENABLED=false` by default, sandbox hostname allowlist, audit, exact money, current migration policy, no raw customer data in logs/prompts/task state, and no cloud speech. No live provider calls, Render resources, local DB changes, or secrets are allowed during this plan PR.

## Official source check log (2026-11-02)

- [AG Studio 3.0 React license/version](https://www.ag-grid.com/studio/react/enterprise-licence/) and [trial terms](https://www.ag-grid.com/studio/license-pricing/): commercial, per-deployment license; 45-day trial. Hosted period and project-specific entitlement still require owner confirmation.
- [AG Studio Agent Framework](https://www.ag-grid.com/studio/react/ai/): provider/backend supplied by app; optional; tool output may contain row values; no AG Grid service call by default.
- [Render Blueprint spec](https://render.com/docs/blueprint-spec): workflow Node/Python only; workflow requires region; CLI 2.7.0+ or API validates Blueprint; previews unsupported for workflow; no workflow pre-deploy command.
- [Render TypeScript SDK](https://render.com/docs/workflows-sdk-typescript): install `@renderinc/sdk`, current docs require `^1.0` or later.
- [Render Workflow pricing/limits](https://render.com/docs/workflows-limits): active compute and temporary argument/result retention are billable; 30-day retention; no native scheduling.
- [PayPal AI Toolkit](https://github.com/paypal/AI-Toolkit) and [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit): development skills/MCP can expose mutating invoice actions; they are not an application authorization mechanism. Reviewed for planning only; no installation, credential configuration or MCP call performed.
- [Render Postgres pricing overview](https://render.com/articles/managed-postgresql-pricing-2026) is a public overview, not an owner-specific quote. Account Billing, checkout, current plan, taxes, credits and overages remain unverified.
