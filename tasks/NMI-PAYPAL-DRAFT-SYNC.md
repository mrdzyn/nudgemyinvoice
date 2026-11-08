# NMI PayPal Sandbox DRAFT Sync (HOTFIX)

One-way, manually initiated import of existing PayPal Sandbox DRAFT invoices into PostgreSQL.

## Contract

- Trigger: authenticated operator clicks **Sync PayPal Drafts** on the dashboard. No scheduler,
  webhook, auto-approve, or production-mode bypass. Ambiguity fails closed.
- Reads ONLY the allowlisted, bounded, paginated `GET /v2/invoicing/invoices` list (plus the
  existing `show` detail helper). No send, remind, cancel, pay, capture, refund, update, or
  delete path exists in the adapter or transport allowlist.
- Stores ONLY validated DRAFT rows in the new owner-scoped `paypal_imported_drafts` table.
  Unique key: PayPal environment + remote invoice ID. Money as minor-unit bigint + ISO currency
  (never floats); remote status, source, and last-synced timestamp preserved.
- Reconciles by verified remote ID + exact currency/total match into `linked_invoice_id`.
  NEVER writes to `invoices` or `paypal_draft_operations`; mismatches stay unlinked.
- Imported rows render in a dedicated dashboard section and are NEVER added to invoice analytics.
- Response returns `{ created, updated, unchanged, skipped, failed }`; per-row independence
  preserves earlier rows on partial failure (`partialFailure: true`).
- Gated by existing operator auth, Origin/CSRF, audit (`paypal.draft_sync`), rate limits
  (5 syncs / 10 min / operator, single in-flight slot), server-side secrets, and the separate
  default-OFF `PAYPAL_SYNC_ENABLED` flag (credentials still mandatory when ON).

## What changed (branch `fix/nmi-paypal-draft-sync`)

- `packages/paypal`: allowlisted bounded list operation (`http.ts`, `client.ts`, `index.ts`);
  fake client `listInvoices` in `apps/api/src/test-paypal.ts`.
- `packages/db`: `paypal_imported_drafts` table (`schema.ts`), migration `0009_quiet_nightmare`,
  `PostgresPayPalImportStore`, `findOwnedByPayPalId` lookup, `paypal.draft_sync` audit action,
  runtime-role grants (`ops/runtime-role.sql`).
- `apps/api`: `PAYPAL_SYNC_ENABLED` flag (`config.ts`, `server.ts`, `.env.example`),
  `paypal-sync-service.ts`, `routes/paypal-sync.ts` (`POST /api/paypal/imports/sync`,
  `GET /api/paypal/imports`), wired in `app.ts`.
- `apps/web`: `paypal/importsApi.ts` transport, `ImportedDrafts.tsx` dashboard section
  (loading / success / partial-failure / disabled states), session + `RealDashboard` wiring.
- Tests: `paypal-sync.pg.test.ts` (7, disposable PostgreSQL 16), paypal unit tests,
  `importsApi.test.ts` (8), `ImportedDrafts.test.tsx` (4); updated `migration-plan`,
  `hosted-staging`, and `constraints` expectations for migration 0009.

## Validation (agent-run, disposable resources only)

- PostgreSQL 16.15 (Homebrew, disposable cluster): sync suite 7/7, constraints 37/37,
  hosted-staging 14/14, ownership 13/13, create-401 9/9, invoice-drafts 53/53,
  combined-judge 7/7, migration-plan 21/21.
- PayPal package 152/152; web dashboard/render suites 229/229; new web tests 12/12.
- `pnpm typecheck` clean; `pnpm lint` 0 errors (1 pre-existing warning);
  `pnpm format:check` clean except pre-existing `release-preflight.test.ts` drift (untouched).
- `pnpm db:generate` reports no schema drift; unlicensed + licensed web builds pass;
  both bundle secret scans clean.
- NOT RUN: hosted GitHub Actions (`workflow_dispatch`-only during development), real PayPal
  calls, production database migration, manual QA (screen reader, Safari/Firefox, devices).

## Remediation of independent review 5818469160 (same Draft PR, rebased onto `main@26d3f84`)

- **INT-01:** branch rebased `--onto origin/main`; PR diff is hotfix-only (README/showcase bytes
  byte-identical to main; only required STATUS/HANDOFFS pointers differ besides hotfix files).
- **SYNC-01:** pagination now uses raw page count + `total_items`/`total_pages`, never the
  filtered valid-invoice length (`rawCount` surfaced from `listInvoices`). Regression test drives
  the REAL client parsing path (raw HTTP list bodies, 19 valid + 1 malformed on page 1, 5 on
  page 2) through the HTTP route and asserts both pages are consumed.
- **SYNC-02:** reaching the 25-page cap with more pages reported returns `truncated: true` with
  `partialFailure: true` and audit state `incomplete` (never a clean success). Tested with 501
  fake invoices; dashboard shows an explicit incomplete notice with no no-progress retry.
- **AUD-01:** audit failure no longer swallowed: the service returns `auditOk: false`, the route
  answers `500 audit_failed` WITH the counts, rows stay committed, and a retry is idempotent
  (`unchanged`, audit completes). Injection test uses a selectively throwing audit sink. Dashboard
  maps `audit-failed` to an explicit notice with retry.
- **CON-01:** upsert rewritten as atomic single statements (INSERT ... ON CONFLICT DO NOTHING,
  owner-predicated UPDATE ... IS DISTINCT FROM, owner-predicated timestamp touch) plus a
  classification-only SELECT. No SELECT-then-act race; concurrent duplicates converge to one
  `created` + rest `unchanged`; cross-owner writes impossible. Store-level tests: 4-way duplicate
  race, update/unchanged, NULL transitions, owner conflict with values intact.
- Remediation validation (all agent-run, disposable PostgreSQL 16 where marked PG): sync
  suite 10/10 (PG, incl. real-parsing pagination, 501-row truncation, audit-failure injection),
  import-store suite 4/4 (PG), constraints 37/37 (PG), migration-plan 21/21, hosted-staging 14/14
  (PG), ownership/create-401/drafts/combined/config 105/105 (PG where applicable), PayPal package
  + web paypal/dashboard suites 218/218; `pnpm typecheck` 0 errors; `pnpm lint` 0 errors (1
  pre-existing warning); `pnpm format:check` fails ONLY on pre-existing untouched
  `release-preflight.test.ts` drift; `pnpm db:generate` no drift.

## Remediation of independent review 5818531939 (PP-LIST-01, same Draft PR)

- List query now requests the documented `fields=amount` via a fixed, allowlisted, bounded
  GET query; the transport guard accepts only that exact spelling (`fields` value fixed,
  no caller-controlled fields; legacy shape without it refused).
- Amount-less rows are enriched read-only through the already allowlisted detail endpoint
  before being dropped: a valid DRAFT imports instead of silently skipping. A missing/failed
  detail degrades to a single-row skip; the page always survives.
- Fake-HTTP regressions: exact outgoing query inspection, minimal list responses enriched
  via detail (unit + end-to-end through the HTTP route asserting `created: 2, skipped: 0`),
  detail-missing and detail-outage cases asserting skip-without-page-failure.
- Validation: PayPal package 162/162, sync suite 11/11 (PG); `pnpm typecheck` 0 errors;
  `pnpm lint` 0 errors (1 pre-existing warning); `pnpm format:check` fails ONLY on pre-existing
  untouched `release-preflight.test.ts` drift. No schema change; no real PayPal calls.

## Rollback

- Branch unmerged: `git checkout <base>; git branch -D fix/nmi-paypal-draft-sync` (or close the
  Draft PR). No production state is touched by the branch itself.
- If migration 0009 were ever applied to a real database (NOT authorized, NOT done): owner
  approval + verified backup first, then `DROP TABLE paypal_imported_drafts;` removes only the
  mirror — `invoices` and `paypal_draft_operations` are never written by the sync and need no
  repair. No down-migration is committed (repo convention: forward migrations only).
- Runtime: set `PAYPAL_SYNC_ENABLED=false` (default) to disable the routes (`503 sync_disabled`).

## Owner actions required

1. Independent exact-HEAD audit of the Draft PR (requested, not done).
2. Explicit merge approval (agents must not merge); no deploy authorized by this task.
3. If a real sandbox trial is ever wanted: separate Request scoping code + run ID, sandbox
   credentials only, disposable database first. No live PayPal, no production migration, no
   backup-free database change.
