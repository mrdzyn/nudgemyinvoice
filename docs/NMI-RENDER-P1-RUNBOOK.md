# NMI-RENDER-P1 — Render staging: manual setup, migration and rollback runbook

> **NOT EXECUTED. NOT AUTHORIZED.** Nothing here has been run on Render. No Render service, database, Blueprint, preview environment, DNS record, secret or URL exists. Every step below needs a **separate, written owner approval** after the P1 Draft PR has an independent audit PASS and is owner-merged. This runbook contains variable **names only**, never values.
>
> Gates A, B and C (`docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`) remain **NOT AUTHORIZED**. The staging instance has **no OpenAI or PayPal credentials**.

## 1. What the code now guarantees (offline-tested)

| Property | Evidence |
| --- | --- |
| One origin: Fastify serves the built React app (`apps/web/dist`), `/api/*` and `/health`; SPA deep links fall back to the shell; `/api`, `/health` and file-looking unknown paths never return HTML; dotfiles, symlinks and unknown file types are never served | `apps/api/src/hosting.test.ts` |
| Listens on `127.0.0.1` by default; `HOST=0.0.0.0` accepted only with `NODE_ENV=production`; `PORT` is read from the environment | `hosting.test.ts` (real server process) |
| Production refuses to start with a non-https `WEB_ORIGIN` or `TRUST_PROXY=true` | `hosting.test.ts` |
| `__Host-nmi_session` is `Secure; HttpOnly; SameSite=Lax; Path=/`, no `Domain`; exact-Origin and CSRF on every mutation including search; logout revokes server-side | `hosted-staging.pg.test.ts`, `design/evidence/NMI-RENDER-P1/` (real Chrome) |
| `TRUST_PROXY=1` trusts exactly one hop, so a client-supplied `X-Forwarded-For` cannot dodge login throttling (negative control with `true` is evaded) | `hosted-staging.pg.test.ts` |
| Header CSP (`frame-ancestors 'none'`), HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer` on every response; CORS only for `WEB_ORIGIN` | `hosting.test.ts`, `hosted-staging.pg.test.ts` |
| **Search text never appears in a request URL**: search is `POST /api/invoice-drafts/search` (JSON body); legacy `GET ...?q=` is refused with `400 search_requires_post`; a simulated edge request-line log and Fastify logs contain no term, including 401/403/400 cases | `hosted-staging.pg.test.ts` (with negative control), `invoice-list.pg.test.ts`, web `api.test.ts`/`boundaries.test.ts` |
| Providers disabled: PayPal create → `503 paypal_disabled`; parse → manual-entry fallback; zero outbound `fetch` | `hosted-staging.pg.test.ts` |
| Migrations `0000`–`0006` apply in journal order by the owner role; the app never changes schema; the runtime role cannot alter schema, delete, or touch the audit log | `hosted-staging.pg.test.ts`, `packages/db/ops/runtime-role.sql` |

## 2. What is NOT proven (do not claim)

- Real Render behavior: TLS routing, `PORT` injection, health checks, `X-Forwarded-For` shape (**`TRUST_PROXY=1` assumes exactly one Render hop appends the client address — verify, §6**), what Render's HTTP request log records for a POST (Render documents method, status and *requested URL*, Pro+ workspaces; it does not say whether the query string is included, nor offer redaction — which is why search text is kept out of URLs entirely).
- Real browsers other than headless Chrome; screen readers; touch; Safari/Firefox; 400% zoom.
- Render Postgres: role creation rights, TLS mode, backups, lifespan through 2026-12-15, cost and credit coverage (owner has not verified any of these).
- Rate limiting is in-memory per process: **exactly one instance** (no scaling, no zero-downtime overlap that serves two instances for long).
- Single operator, shared state: a public login is unsafe. Judge access (credentials, a reset between judges, or demo video only) is a separate owner decision. **Never** put the operator password in the repo, README, screenshots or Devpost text.

## 3. Release gates (all must be true, in order)

1. Independent exact-head audit PASS of the P1 PR; owner squash-merge. *(not yet)*
2. Owner written approval to create Render resources and to spend credits; the owner has inspected balance/expiry/billing privately.
3. Staging stays **provider-disabled** (§4). A real-provider change is a different gate.
4. §6 verification checklist passes on the live URL before any URL is shared.
5. Separate owner approval to share the URL with judges.

## 4. Environment variable matrix (names only; set in Render's secret store, never in git)

| Variable | Staging value / source | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables Secure `__Host-` cookie, https-only origin, `WEB_DIST_DIR` default |
| `HOST` | `0.0.0.0` | Render requires binding `0.0.0.0` |
| `PORT` | injected by Render (default 10000) | Do not hard-code |
| `WEB_ORIGIN` | the exact public `https://…onrender.com` (or custom) origin, no path | Must equal the browser origin exactly |
| `TRUST_PROXY` | `1` | After §6 step 4 confirms one trusted hop. Never `true` (refused in production) |
| `DATABASE_URL` | **runtime role** connection string (internal URL) | Secret. Not the owner role |
| `SESSION_SECRET` | generated, ≥ 32 chars | Secret. Rotating it invalidates CSRF tokens |
| `SESSION_TTL_MINUTES`, `SESSION_IDLE_MINUTES` | defaults (480 / 60) | optional |
| `PAYPAL_ENV` | `sandbox` | required |
| `PAYPAL_API_BASE_URL` | `https://api-m.sandbox.paypal.com` | required; sandbox allowlist enforced |
| `PAYPAL_DRAFTS_ENABLED` | `false` | |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | **absent** | |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | **absent** | parse → manual-entry fallback |
| `WEB_DIST_DIR` | absent (default `apps/web/dist`) | |
| `NMI_*` simulated-evaluation switches | **never set** | test-only launcher is not shipped |

The owner role's connection string (migrations, provisioning) is used only from the operator's machine/shell for §5 and is **never** stored on the web service.

## 5. PostgreSQL: migration and least-privilege plan (owner-run, manual)

No migration runs on app start. Migrations are forward-only plain SQL in journal order (`packages/db/migrations/meta/_journal.json`: `0000`–`0006`).

1. Create the Render PostgreSQL instance (region = web service region; paid plan covering 2026-12-15; confirm backup/retention). Record plan/price privately.
2. From the operator's machine, with the **owner** connection string in the shell only (use the external URL with `sslmode=require`; add the operator's IP to the allow list only for the duration):
   ```sh
   for f in 0000_young_mister_fear 0001_complete_spot 0002_light_proteus 0003_audit_log_immutable \
            0004_zippy_namorita 0005_glorious_giant_girl 0006_known_colleen_wing; do
     psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "packages/db/migrations/$f.sql" || break
   done
   ```
   (`-1` = one transaction per file; stop on the first error. If one fails midway the earlier files remain applied — fix and continue from that file; never re-run an applied file. Take a backup/snapshot **before** step 2.) Drizzle files contain `--> statement-breakpoint` comments; `psql` ignores them as comments.
3. Create the runtime role. The password is **never** written in a command line, SQL file, shell history, `psql -c` argument or process list:
   ```sh
   psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
     "CREATE ROLE nmi_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"
   psql "$OWNER_DATABASE_URL"
   ```
   In the interactive session run `\password nmi_runtime` and type a long random password at the hidden prompt twice (generate it with a password manager; `psql` hashes it client-side with SCRAM before sending, so the cleartext is never sent in a statement, logged by the server, or kept in history). Quit, paste the same value once into Render's secret store as part of the runtime `DATABASE_URL`, then run the grants:
   ```sh
   psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/ops/runtime-role.sql
   ```
   Until the password is set the role cannot log in over password authentication. Do not use `ALTER ROLE … PASSWORD '…'`, `CREATE ROLE … PASSWORD '…'` or `-c`/`-v` with the secret, and do not echo the connection string.
   If Render does not let the owner create roles, **stop**: do not run the app as the owner; escalate to the owner (the least-privilege requirement is a gate, not a nicety).
4. Provision the single operator **as the owner**, once, from the operator's machine:
   `DATABASE_URL=… NMI_OPERATOR_USERNAME=… NMI_OPERATOR_PASSWORD=… pnpm --filter @nmi/api provision-operator`
   (password generated locally; never printed or committed).
5. Verify as `nmi_runtime`: `SELECT` works on `invoices`; `CREATE TABLE`, `DELETE FROM invoices`, `UPDATE audit_log`, `TRUNCATE` fail with `42501` (the same denials `hosted-staging.pg.test.ts` asserts offline).
6. Use TLS for any connection leaving Render's private network. The app connects over the internal URL in the same region.

**Restore / reset.** Restore is the host's snapshot/backup restore of the whole database followed by §5 step 5. Between judging sessions a reset is: revoke sessions (`UPDATE sessions SET revoked_at = now()` as the owner) and, if wanted, restore the pre-judging snapshot. Never run a destructive statement as the runtime role.

## 6. Web service: manual setup (no Blueprint, no previews, no auto-deploy)

- **Do not** connect a Blueprint or add a `render.yaml`. If a Blueprint is ever separately approved: `autoDeployTrigger: off` and `previews.generation: off` (Render's defaults are `commit` auto-deploy and previews disabled only when omitted; verify against the live docs at that time).
- Create a **Web Service** from the GitHub repo/branch the owner names, instance count **1**, **Auto-Deploy: Off** in the dashboard, region = database region. A public-repository URL service cannot auto-deploy at all; a linked GitHub service auto-deploys on push unless switched off (Render docs, rechecked 2026-10-29).
- Build command: `pnpm install --frozen-lockfile --prod=false && pnpm --filter @nmi/web build`
  (`--prod=false` because Render may set `NODE_ENV=production` at build time, which would skip `vite`/`tsx` dev dependencies; the server runs through `tsx`.)
- Start command: `pnpm --filter @nmi/api start`
- Health check path: `/health` (returns JSON `{"status":"ok","paypalEnvironment":"sandbox","aiConfigured":false}`; it does not touch the database, so a DB outage is visible through login/`503`, not through the probe).
- Node ≥ 22 and pnpm 10.28.0 (repository `packageManager`); pin via `NODE_VERSION`/Corepack if Render's default differs.
- **Pinned release:** deploy a specific commit SHA manually (dashboard "Deploy a specific commit"); record the SHA in the owner's private log. Never deploy a branch tip.
- Environment: §4 only.

### Verification checklist on the live URL (before sharing; record results privately, redact secrets)

1. `GET /health` → JSON; `GET /` → app; `GET /assets/nope.js` → 404 JSON; `GET /api/nope` → 404 JSON.
2. Response headers: CSP with `frame-ancestors 'none'`, `Strict-Transport-Security`, no `Access-Control-Allow-Origin` for a foreign `Origin`.
3. Sign in through the UI. In DevTools → Application: cookie `__Host-nmi_session` is Secure, HttpOnly, SameSite Lax, Path `/`, no Domain.
4. **Proxy hops:** log in with a request carrying a spoofed `X-Forwarded-For: 198.51.100.9` and confirm the server-side address (a throttle behavior test: 21 failed logins with rotating spoofed values still hit `429`). If Render's header shape differs from one trusted hop, set `TRUST_PROXY` accordingly or keep it `false` (all users then share one throttle bucket — acceptable for one operator).
5. **Request-log privacy:** run a search for a unique synthetic marker (e.g. `zz-render-marker-001`). In Render's Logs → HTTP request logs (needs a Pro+ workspace) and the application logs, search for the marker and the synthetic e-mail. **Expected: absent; the only line is `POST /api/invoice-drafts/search`.** If present anywhere → STOP, unshare, report.
6. Sign out → old cookie → `401`.
7. Create a synthetic invoice (manual entry); confirm it saves; PayPal draft attempt is refused (`paypal_disabled`); no outbound provider traffic.
8. `psql` as owner: `SELECT count(*) FROM audit_log WHERE outcome='failure'` is explainable.

## 7. Rollback and shutdown

- **Bad deploy:** in the dashboard redeploy the previous pinned SHA (the app is stateless apart from PostgreSQL). Migrations are forward-only: do not change the schema during judging.
- **Data problem:** restore the snapshot taken before judging (§5), then re-verify §6 steps 3, 6, 7.
- **Incident (suspected leak):** suspend the web service, `UPDATE sessions SET revoked_at = now()`, rotate `SESSION_SECRET` and the operator password, rotate `nmi_runtime`'s password (interactive `\password nmi_runtime`, as in §5 step 3).
- **After judging (after 2026-12-15):** delete the web service and database, delete the secrets, revoke sessions first, rotate anything ever loaded into Render.
- Option A (clone-and-run) remains the judge-access fallback at all times.

## 8. Historical evidence note

NMI-AG1/C4 browser journeys recorded before P1 asserted the GET `q` transport; those scripts predate this change and are superseded for search by `design/evidence/NMI-RENDER-P1/`. The AG1/C4/R0 evidence documents are unchanged historical records.
