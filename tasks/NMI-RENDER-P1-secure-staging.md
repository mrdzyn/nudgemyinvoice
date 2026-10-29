# NMI-RENDER-P1 — Secure staging and judge-demo hosting readiness

**State:** IMPLEMENTED OFFLINE — awaiting independent exact-head audit (Draft PR #21 ONLY; see `NMI-RENDER-P1-IMPL`). This task authorizes **repository implementation and offline validation**, NOT a Render resource, external deployment, billable infrastructure, production release, provider request, or merging any PR.

- **Approved base `main`:** `451abc292737775f0c58458520b8f5bf004cd474` (owner squash-merged NMI-DEMO-R1-B-WIRE PR #20).
- **Working branch:** `feat/nmi-render-p1-secure-staging`.
- **Active handoff:** `NMI-RENDER-P1-START`.
- **UI design gate:** Not applicable for infrastructure/transport only. Preserve the existing approved UI, navigation, states and brand; if any material new UI is needed, stop for a separate design/owner decision.
- **Project profile:** `config/project-profile.json`, project/web/design selected.
- **Required guidance:** `AGENTS.md`, `docs/STATUS.md`, `docs/TESTING.md`, `docs/SECURITY.md`, `docs/NMI-DEMO-DEPLOYMENT-DECISION.md`, `docs/NMI-DEMO-JUDGE-RUNBOOK.md`, the active handoff, and bounded code/tests. Do not load project memory by default.

## Objective

Build and **independently audit a deployable code candidate** for a *single-origin, single-instance, access-restricted, provider-disabled* NudgeMyInvoice staging demo on Render with managed PostgreSQL. Preserve the authenticated manual invoice-entry, save, read-only dashboard, review and logout flows, with unchanged monetary, authorization and privacy guarantees.

**No online deployment is part of P1.** Owner approval after a PASS on the exact-head Draft PR is required before merge, and a **separate owner approval** is required to provision Render resources, connect a repo, start paid services, enter secrets, deploy or share an URL. Stage first with no OpenAI/PayPal credentials.

### Current source facts and blockers

1. `apps/api/src/server.ts` binds `127.0.0.1` regardless of runtime. Render public web services require `0.0.0.0` on `PORT`. Add a narrowly scoped and tested listen-host configuration: production container/Render can use `0.0.0.0`; local development remains loopback by default. No wildcard listen in local default.
2. `apps/web` produces `dist/` but only Vite dev/preview proxies `/api` and `/health`; that proxy disappears after build. Provide a production **single HTTPS origin** mapping `/api/*` and `/health` to Fastify and built React static assets/SPA fallback to the frontend. Protect API paths, health path, response types and security headers from SPA fallback. Avoid runtime Vite server. Use the smallest maintainable static-serving strategy; adding `@fastify/static` or equivalent is permitted only if necessary and with a lockfile update.
3. Hosted `GET /api/invoice-drafts?q=...` sends customer search text in the URL. Fastify redacts its own log, **but Render Pro HTTP request logs show requested URLs**. Host release must not leak personal customer names/emails to platform/edge logs. This is a **hard STOP**, not a waiver because the demo is synthetic. Prefer a bounded, privacy-preserving search transport with exactly the existing owner-scoped semantics (e.g. authenticated CSRF-protected POST with JSON body and no query parameter), including rejection/redaction of legacy search query at public production ingress. If this would materially alter the approved API/UI or violate a task boundary, write an explicit privacy remediation decision and **mark deployment BLOCKED**; do not claim public-log redaction without host proof.
4. `NODE_ENV=production` produces `Secure; HttpOnly; SameSite=Lax; Path=/` `__Host-nmi_session`. Verify HTTPS termination, `WEB_ORIGIN` exact comparison and safe `TRUST_PROXY` configuration; never blindly trust arbitrary forwarded client-IP headers. Ensure login, Origin/CSRF, cookie rotation and logout behave behind one trusted proxy; no permissive CORS or wildcard origin. No login tokens or secrets in any log or build artifact.
5. PostgreSQL is mandatory; migrations `0000`–`0006` are plain SQL in journal order. Prepare a **separate, fail-closed offline migration runbook** with owner/migrator vs least-privilege runtime role, TLS requirements when appropriate, idempotence/restore strategy and no destructive automated migration on startup. No schema change unless separately audited and required.
6. The app has exactly one operator and in-memory per-process throttles. A shared public login is unsafe; recommend an access-restricted staging instance with only synthetic records, one instance, nonshared credentials and explicit owner-controlled demo session. Judge access needs separate owner approval; never distribute a privileged operator password through a public README, source or screenshots. No multi-tenant/auth redesign in P1.
7. Keep `PAYPAL_DRAFTS_ENABLED=false`, `OPENAI_API_KEY` and `OPENAI_MODEL` absent, no `PAYPAL_CLIENT_ID/SECRET`, `PAYPAL_ENV=sandbox`, and never use the `NMI_SIMULATED_EVAL=1` test-only launcher for production. A provider-disabled hosted demo means **manual-entry and real PostgreSQL flows**, not simulated OpenAI/PayPal. No claim of real integration accepted until separate gates.
8. Render deploys on push by default and Blueprints/preview environments can provision resources automatically. **Do not connect a Render Blueprint, generate an automatically deployed `render.yaml` with enabled previews, trigger a preview environment, or create any cloud resources**. Provide a reviewed, **manual setup / rollback runbook** instead, with automatic deploy OFF, pinned Git SHA, health check, cost/region/backup choices, environment-variable matrix **without values for secrets**, database lifespan through Dec 15 2026, one-instance constraint and clear release gates.

Official references (recheck before implementation):
- https://render.com/docs/web-services — bind 0.0.0.0 and PORT
- https://render.com/docs/logging — HTTP request logs may expose requested URL
- https://render.com/docs/blueprint-spec — `autoDeployTrigger: off` if a Blueprint is separately approved later

## Allowed repository work

- Production deployment transport and targeted tests in `apps/api/`, `apps/web/`, `packages/` (only bounded search transport if necessary); related `package.json`/lockfile updates only for a justified dependency.
- Safe static/hosting configuration or non-provisioning startup helpers in `scripts/` if needed; no automatic infrastructure creation.
- `docs/NMI-RENDER-P1-RUNBOOK.md` (new), `docs/STATUS.md`, task, handoff and directly relevant security/testing docs.
- Existing local development and clean-clone simulated evaluation must remain functional and unchanged except where demonstrably necessary.

**Forbidden:** provider client changes, OAuth or payment action scope expansion, PayPal draft enablement, live-provider tests, new AI provider, money operations, cross-tenant/customer access, shared public credentials, real customer/PII data, billing, Render account provisioning/deployment, DNS/SSL live changes, GitHub merges, video/Devpost submission. Do not write secrets to repo/logs; do not modify unapproved owner authorization answers. Preserve PR #19 FIX-B1 and merged PR #20 observer/docs exactly unless a contradiction is discovered and escalated.

## Acceptance tests / evidence (offline only)

A. **Single origin + host:** built web page loads through Fastify and same-origin `/api`; `/health` is JSON and *never* SPA HTML; SPA deep links work; missing assets 404, traversals forbidden, HTML never returned for unknown `/api` routes. Local default binds `127.0.0.1`; production host switch explicitly permits Render binding `0.0.0.0` on injected `PORT`. No network beyond localhost for tests.

B. **Secure browser:** tests for production `__Host-` cookies over HTTPS/proxy simulation, `Secure/HttpOnly/SameSite`, CSRF on mutations, strict origin comparisons, login/logout/expiry and no leaked secrets; don't accept spoofed X-Forwarded headers from untrusted clients. CSP permits working build but no broader third-party connections.

C. **Privacy:** show that no customer query text appears in **request URLs** of the hosted search path, including error and unauthorized cases, and neither Fastify logs nor simulated reverse proxy request-URL capture receives names/emails. Existing authenticated owner-scoped search returns the same ordered data and has no cross-account leakage. If unresolved, **release verdict = BLOCKED** even when builds pass.

D. **Database:** seven migrations applied against disposable Postgres in journal order, separate migrator/runtime permissions validated where feasible, no startup schema modification, login + saved draft + dashboard + logout. No secrets in output.

E. **Providers disabled:** attempted PayPal create yields disabled result with **zero transport traffic**; OpenAI path uses explicit manual fallback without provider requests; real PayPal and OpenAI credentials are absent in all test environments. Keep any synthetic evaluation fixture strictly local and not enabled for hosted production.

F. **Operational safety:** deployment runbook lists exact build/start commands, env matrix with variable *names only*, access restriction, backout/backup, TLS and logs validation, one-instance operation, health/readiness probes, manual deployment only, responsible owner approvals. Include an explicit gate against logging `q` as URL parameters. No Render service/database created.

Follow `docs/TESTING.md`: smallest targeted source-backed automated objective and targeted real-browser/proxy-simulation QA as needed, then mandatory hosted Project Baseline and Stack CI. If required PostgreSQL, Linux proxy, or browser verification is unavailable, mark NOT TESTED and leave deployment gated. Request independent GPT-6 exact-head security/functional audit; do not merge/deploy.

## Delivery / handoff

Continue on **the existing Draft PR opened for this phase**; do not create a second feature PR. After implementation, update STATUS and append `NMI-RENDER-P1-IMPL` handoff, record exact final HEAD, CI runs, scope, test evidence, blockers and release-gate truth. Keep owner separate merge and staging-provision decisions. `NMI-DEMO-R1-B-WIRE` is already merged on main, but **Gate B still has no owner permit**; Gates A and C also NOT AUTHORIZED.

## Implementation record (NMI-RENDER-P1-IMPL)

Delivered (all offline; nothing provisioned/deployed): `HOST`/`PORT` listen config (wildcard only with `NODE_ENV=production`); production fail-closed config (https `WEB_ORIGIN`, `TRUST_PROXY` hop count, never `true`); `plugins/web-static.ts` single-origin static + SPA fallback (startup file index, no request-built paths, symlinks/dotfiles/unknown types excluded); header CSP/HSTS/frame/referrer policy on every response; **`POST /api/invoice-drafts/search`** (body carries the whole query; web client switched; legacy `GET ?q=` refused) — an additive API change with the approved UI unchanged; `packages/db/ops/runtime-role.sql` least-privilege grants (found and documented one PostgreSQL requirement: `FOR UPDATE` on `operators` needs a column UPDATE grant, given on `created_at` only); `docs/NMI-RENDER-P1-RUNBOOK.md`.

Acceptance A–F: tests `apps/api/src/hosting.test.ts`, `hosted-staging.pg.test.ts`, updated `invoice-list.pg.test.ts` and web `api.test.ts`/`boundaries.test.ts`, plus `design/evidence/NMI-RENDER-P1/run-hosted-browser-qa.mjs`. **Privacy (C): resolved in code and proven offline; real Render request-log behavior is NOT TESTED and is a live-verification gate.** Deployment itself remains gated by audit, merge and separate owner approvals. No provider client, OAuth, PayPal draft enablement, schema or migration change was made.

### Remediation FIX1 (review 5695189217)
- MAJOR-1: `hosted-staging.pg.test.ts` now connects its application pool as a disposable `LOGIN` role (ephemeral in-memory password), not as the owner with `-c role=`; it asserts `session_user`/`current_user`, that `SET ROLE NONE` and `SET [SESSION AUTHORIZATION|ROLE]` cannot recover owner privileges, the privilege denials (`42501`), audit INSERT success, and drops the role afterwards. Local trust-auth caveat: password verification itself is evidenced by hosted CI, not the local server.
- MAJOR-2: runbook §5 step 3 and `runtime-role.sql` create the role without a password and set it with interactive `\password`; no secret in any command argument or file.
- Unchanged: production code, UI, search contract, providers, schema.
