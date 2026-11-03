# NMI-PROTOTYPE-10D-A5 — AG Studio 3.0 Local Integration and Licence Gate

**State:** A5-D **design proposal delivered for owner visual approval** (`design/screens/NMI-PROTOTYPE-10D-A5D-STUDIO-ANALYTICS.md`, mockup and 19 previews; synthetic data, design only; A5-I1 NOT started). A5 planning/design gate initiated; **no AG Studio package or license key installed in the repository yet**. Draft PR is documentation only. Owner confirms trial expiry **December 16, 2026**; actual hosted-judge entitlement remains **UNVERIFIED**.

**Base:** `main@653c44451efc1c59b8a805382dc5b44d57fc7790`, including independently audited/owner-merged A4 simulated-local READY evidence.

**Objective:** Add an opt-in locally evaluated AG Studio 3.0 analytics experience with real owner-scoped, full-population Fastify analytics; preserve the current AG Grid Community 36.2.0 dashboard as default and safe fallback. No production or publicly hosted licensed bundle without written licensing confirmation and a separate deployment authorization.

## Source and licence prerequisites

- Official installation: https://www.ag-grid.com/studio/react/installation/ ; licence: https://www.ag-grid.com/studio/react/licence-install/ ; compatibility: https://www.ag-grid.com/studio/react/compatibility/ .
- Official AG Studio 3.0 requires matching `ag-studio-react@3.0.0` and `ag-studio@3.0.0`, AG Grid 36.2 and AG Charts 14.2 where separately installed. Existing AG Grid Community/React 36.2.0 and React 19 satisfy the documented versions; do not assume the install/build is proven until clean install/typecheck/build.
- `AgStudioProvider licenseKey={...}` is a **client-side** licence configuration. An environment variable prevents committing the literal but does **not** hide it from a delivered JavaScript bundle. Do not print/log/store/commit the owner's licence string, include it in screenshots, send it to an AI coding agent, or put it in CI. Record presence/validation/expiry only, redacted. Use local unlicensed/watermarked evaluation when possible until licence-distribution decision.
- Owner-provided expiry: **2026-12-16**; planned judge period runs to **2026-12-15**. The provider marketing page advertises production evaluation (https://www.ag-grid.com/studio/react/enterprise-licence/), but the published commercial EULA v40 clause 13.2(a)/13.3 limits standard trial use to **internal evaluation and review** (https://www.ag-grid.com/studio/licenses/ag-studio/LICENSE.html). Any specific trial agreement/quote may differ. **Before any public judge deployment or public recording of licensed Studio, obtain written AG Grid confirmation for external judges, intended application, permitted developer count, redistribution/hosting and expiry.** Expiry alone does not grant those permissions. Preserve Community fallback through Dec 15 and afterwards.
- Never attach the owner screenshot, trial email, key, or licence claims beyond the confirmed expiry to a public PR.

## Delivery stages and gates

### A5-D — contract/design (this Draft PR)
1. Review the existing approved NMI-UI-01B dashboard/screens, `docs/DESIGN-SYSTEM.md` and `docs/ACCESSIBILITY.md`. Produce a precise **screen map, view/edit behavior, loading/empty/error/401 states, keyboard/mobile 390px layout** and fallback UX; no duplicate invoice grid.
2. Specify read-only AG Studio dashboard surface and initial widgets: full-population per-currency counts/totals from `POST /api/analytics/summary`; daily buckets and durable PayPal **draft-state**, never payment-status claims. Show separate currency cards/charts; no FX, combined total, paid/overdue claims. Keep the existing Community grid and its own `POST /api/invoice-drafts/search` pagination outside Studio in the first integration, or explicitly get design approval for a later swap.
3. Require **human design approval** before material UI shell changes. If owner approves the already existing visual arrangement with an additional Studio panel, record exact placement, view/edit mode and responsive states.

### A5-I1 — local-only controlled implementation (separate task/PR after design approval)
1. Install precisely compatible Studio 3.0 packages with lockfile updates and dependency/bundle verification. No unlicensed Enterprise standalone widgets or AG Studio Agent Framework. Use a code-split, opt-in Studio surface behind a default-OFF local/test feature gate. Community experience must work when Studio module fails to load or key is absent/expired.
2. Read the AG Studio 3.0 current API and use view-only mode with bounded, sanitized, owner-scoped aggregate DTOs fetched from the existing authenticated Fastify endpoint. Do not provide invoice rows, customer names/e-mails, provider payloads, tokens, SQL connections, PayPal operations or model tools to Studio. Never compute totals from the visible grid page. Treat aggregate API errors/stale cancellations/401 like the current dashboard; no localStorage/IndexedDB persistence or autosave.
3. Licence key: owner sets it **locally outside Git and CI** only after acceptance of the client-visible nature. Do not use the owner's actual licence in CI, public previews, committed snapshots or PR evidence. If the only way to show a no-watermark local demo is via a client-bundled key, document the local-only distribution boundary; no public build until external rights and client exposure have been acknowledged.
4. Targeted validation: local clean install/typecheck/build, full-population SQL vs Studio charts/cards for >1 grid page including USD/EUR/JPY, exact minor-unit/currency correctness, date/DST/status/search filters, 401/session revocation, keyboard/390px view, failure fallback and zero provider calls. Mark real device/assistive tech NOT RUN unless executed. Both hosted CI at exact final PR SHA; independent code/license/security audit. Leave Draft until owner merge approval.
5. No report persistence or Studio AI agent in I1. Any new DB migration/provider call/hosted deployment is a separate gate.

## Explicitly disallowed during A5-D

No changes to running production frontend, backend, schema, lockfile/dependencies, environment or secrets; no AG Studio licence use in browser, Cloud/Render, live PayPal/OpenAI, owner DB, hosting, publication, merge, or public judge URL. This task is design-and-contract preparation only.

## Exit criteria

A5-D closes only when the architecture/licence conflict and approved visual/design decision are documented and independently reviewed. A5-I1 must return actual local integration evidence—not merely the Community dashboard rehearsal—before claiming `AG Studio INTEGRATED`. Hosted Studio requires separate written AG Grid licence rights and owner release gates.
