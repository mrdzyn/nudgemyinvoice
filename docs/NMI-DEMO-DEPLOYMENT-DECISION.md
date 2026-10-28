# NudgeMyInvoice — Deployment decision (planning and readiness audit)

> **Planning only (NMI-DEMO-R0).** Nothing was provisioned or deployed. This document compares two ways to give hackathon judges access and recommends one. The owner decides.

## Requirement being satisfied

The owner's brief states the official PayPal Hackathon (Devpost) requires **functional judge access through setup instructions OR a hosted deployment**, available through the judging period (to **December 15, 2026**), with a public repository, visible open-source license and a public YouTube demo under 3 minutes. **The official rules page was not retrievable by R0's own tooling (HTTP 403), but it has since been independently retrieved and verified by the independent reviewer: repository setup/run instructions OR a hosted demo satisfy the functional-access requirement, and a public open-source repository/license and a public YouTube video under 3 minutes are required.** Other criteria (judging dates, eligibility, sponsor rules) come from the owner's brief and `docs/HACKATHON-PLAN.md` and remain for the owner to confirm. Hosting is therefore **not mandatory**.

## Option A — Reproducible local judge setup (recommended default)

What it is: judges clone the public repository and follow `docs/NMI-DEMO-JUDGE-RUNBOOK.md` (PostgreSQL + `pnpm`), using either the **SIMULATED evaluation mode** (no credentials) or **their own** OpenAI/PayPal Sandbox credentials.

| Aspect | Assessment |
| --- | --- |
| Meets "setup instructions" access | Yes. The runbook was executed from a clean clone and works; an automated 32/32 end-to-end check reproduces the whole workflow. |
| Cost | $0 to the project. |
| Secrets | None distributed. Judges bring their own, or none (simulated mode). |
| Operator/account sharing | Not applicable: each judge provisions their own operator in their own database. |
| PII / logging exposure | None beyond the judge's own machine. |
| Availability through Dec 15 | Permanent as long as the repository stays public and dependencies resolve. |
| Risks | Setup friction for non-technical judges (needs Node, pnpm, PostgreSQL); the UI does not show a "simulated" badge in evaluation mode (documented in the runbook; a SIMULATED banner would be a product change); real-provider behaviour unverified. |
| Mitigation | A short, clearly labelled video of the real interface; the one-command automated check; the runbook's troubleshooting section. |

## Option B — Private or restricted HTTPS judge demo (optional add-on)

What it is: a hosted instance (for example a small Render web service + managed PostgreSQL) reachable by judges over HTTPS.

| Topic | What must be true / known facts from this repository | Residual risk |
| --- | --- | --- |
| **Cost / duration** | Plan hosting for **Nov 12 → Dec 15, 2026**. Free-tier databases may expire (the hackathon plan notes a 30-day Render Free Postgres limit); a paid tier or fresh database is likely needed. Owner to price it. | Cost; accidental expiry mid-judging. |
| **HTTPS and cookie** | The API issues the session cookie as `__Host-nmi_session` with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` when `NODE_ENV=production` **or** `WEB_ORIGIN` is https (`config.cookieSecure`). `__Host-` requires HTTPS, no `Domain`, and `Path=/`. **This path has never been tested** (README/STATUS list it as a release blocker). | Cookie not accepted by a browser/proxy combination; login loop. |
| **Same-origin hosting** | The web app calls a relative `/api`; the Vite dev proxy does not exist in production. A production deployment needs the static build and the API served from one origin (or a reverse proxy routing `/api` + `/health` to the API) so cookies, CSRF and CSP `connect-src 'self'` work. `WEB_ORIGIN` must equal the exact public origin; mutations are refused otherwise. **No such static-serving/proxy configuration exists in the repository today** (the build artifact is `apps/web/dist`; `apps/web` only ships a Vite dev/preview proxy). | This is new, untested deployment work (R1). |
| **Trust proxy** | `TRUST_PROXY=true` only behind a trusted proxy, otherwise login throttling keys on the wrong client IP. | Mis-set value lets clients spoof IPs or collapses all judges into one throttle bucket. |
| **Single operator / account sharing** | The database enforces exactly one operator (`operators_single_row_uq`). All judges would share one account and one invoice list (no isolation), and a shared password must be distributed. | Judges overwrite each other's data; credential distribution; any judge can create Sandbox drafts. Mitigation: reset the database between judges or keep drafting disabled/simulated. |
| **Auth throttling** | In-memory per process: 5 attempts/account and 20/IP; resets on restart; not shared across instances. | Lock-out of a shared account by one judge; single instance only. |
| **PostgreSQL** | Provision a dedicated database; apply the seven migrations manually in journal order (no migrate command, no production migration path is established); take a backup before judging; **use least-privilege credentials** (a runtime role with only DML on the application tables; migrations by a separate owner role). `docs/SECURITY.md` lists DB least-privilege as a deployment prerequisite. | Owner-role credentials in the app would allow schema changes/audit tampering. |
| **Secrets** | `SESSION_SECRET` (≥32 chars), `DATABASE_URL`, optional `OPENAI_API_KEY`, `PAYPAL_CLIENT_ID/SECRET` in the host's secret store only; never in the repo, build output (the bundle scan guards the browser bundle), logs or screenshots. | Leakage via host logs/dashboards. |
| **CSP / CORS / Origin / CSRF** | Production CSP is `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'` (set on the Vite build output via the index.html meta tag); CORS allows only `WEB_ORIGIN`; every mutation needs the exact Origin and an `X-CSRF-Token`. A reverse proxy must not rewrite `Origin`, strip cookies or add wildcard CORS. A header-based CSP at the proxy is preferable to the meta tag. | Proxy misconfiguration silently weakening controls. |
| **Log redaction (important)** | The API log keeps URL **paths only** (query strings stripped). But the dashboard search term travels in the **`q` query parameter of `GET /api/invoice-drafts`** (customer names/e-mails). **Reverse-proxy, ingress, load-balancer, CDN/WAF and platform access logs must omit or redact the query string for `/api/invoice-drafts`.** Untested; no proxy privacy claim exists. | Customer data in third-party access logs. An absolute "no PII in URLs" rule would need an owner-approved API change (e.g. POST search). |
| **Judge access through Dec 15** | Keep the instance, database and credentials alive and monitored; document the access method (public URL + judge credentials shared privately via the Devpost testing-instructions field). | Expiry, cost, key rotation. |
| **Shutdown and cleanup** | Delete the service, database and secrets after judging; rotate any credential that was ever loaded into the host; revoke sessions (`UPDATE sessions SET revoked_at = now()`). | Forgotten live resources. |
| **Rollback** | Redeploy the previous commit (the app is stateless apart from PostgreSQL); restore the pre-judging database backup. Migrations are forward-only; do not run new migrations during judging. | Data loss if no backup. |
| **Provider calls from a shared instance** | PayPal drafting must stay disabled (or simulated) unless the owner authorizes real Sandbox calls under `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`; the one-create budget is exhausted. | Unauthorized provider usage by judges. |

## Recommendation

**Choose Option A (reproducible local setup, with the SIMULATED evaluation mode and a recorded real-interface video) as the submission's judge-access method.** It is the lowest-risk option that satisfies "setup instructions": no hosting cost, no shared credentials, no PII-in-proxy-logs exposure, no untested HTTPS/`__Host-` cookie path, and no single-operator sharing problem.

**Do not deploy Option B unless the owner explicitly wants it.** If the owner does, it is a separate, approved phase (R1) with these prerequisites before any infrastructure is created: (1) a tested single-origin static+API serving/proxy configuration; (2) a real HTTPS test of the `__Host-` cookie; (3) a least-privilege database role and backup; (4) proxy/ingress log redaction of `q`; (5) a decision on account sharing/reset between judges; (6) cost and expiry plan through December 15; (7) drafting kept simulated/disabled unless separately authorized.

## Owner decisions needed

1. Confirm on the official Devpost rules page that "setup instructions" is an acceptable alternative to a hosted deployment.
2. Choose A-only (recommended) or A + B.
3. If B: authorize an R1 phase and a budget; decide how judge credentials are shared (Devpost private testing-instructions field).
4. Decide whether to approve a small product change adding a visible SIMULATED banner for evaluation mode (not done in R0: no product changes).
