# NMI-MIG-0008-ISSUE49 — Local judge and operator preflight migration alignment

- **State:** **COMPLETED — Issue #49 CLOSED (2026-11-07)**; PR #51 independently audited PASS and owner squash-merged into `main@cd4dd1e3f4589205dc832c28bfe75593681ea44d`. This does not authorize deployment or override release validation.
- **Base:** `main@5e110efb5bbdd6fe92639beca0e7dc5a19626230` (reconciled via non-history-rewriting merge with owner-merged PR #53 CI cost-conservation policy, PR #52 `NMI-P6-FIX2`, and PR #50 D4-X adoption).
- **Issue:** https://github.com/mrdzyn/nudgemyinvoice/issues/49
- **UI design gate:** Not applicable; CLI/script and instructional docs only.

## Objective

Fix the local judge runbook and disposable operator provisioning preflight to apply the **journal-defined ordered migrations** through `0008_mushy_zarek`, refuse missing/corrupt/partial migration plans, and verify `public.invoice_nudges` before operator provisioning. Do not rewrite committed SQL or apply migrations to existing data.

## Allowed files

- `scripts/migration-plan.mjs` (new shared read-only journal validator and CLI)
- `scripts/preflight-provision-operator.mjs`
- `apps/api/src/migration-plan.test.ts` (new isolated, deterministic CLI negative controls)
- `docs/NMI-DEMO-JUDGE-RUNBOOK.md`
- `README.md` (remove stale duplicate migration procedure)
- this task
- `docs/STATUS.md`
- append-only `docs/HANDOFFS.md`

## Forbidden scope

Published SQL/migration journal changes, application feature/domain/auth changes, dependencies/lockfiles, CI/security workflow changes, real/hosted database operations, existing local DB mutations, real operator creation, live PayPal/OpenAI, hosted resources, paid actions, release branch or SHA, deployment, public URL, GitHub issue closure, merge or policy gate closure.

## Acceptance and fail-closed evidence

1. Parse and validate the journal, contiguous ordered IDs, safe unique tags, required `0008_mushy_zarek` at index 8, real non-symlink regular directories/files, nonempty non-whitespace SQL files, and absence of unexpected/unjournaled entries in `packages/db/migrations`, allowing later correctly ordered migrations without stale hardcoded totals.
2. Judge instructions run **only** on a verified empty disposable `nmi_judge` database. A failure closes the loop inside a subshell, does not close the interactive terminal and does not proceed to operator provisioning. Verify `public.invoice_nudges` after migration. Do not assert an obsolete fixed public-table count.
3. The independent SCRAM PostgreSQL 16 operator preflight uses the same validated journal, stops at the first failed migration and refuses to run the operator CLI unless all migrations and the `invoice_nudges` check pass; preserve existing secret handling and teardown guarantees.
4. Deterministic tests prove valid current journal, missing 0008, wrong ordering/index, missing SQL, empty/corrupt journal, dangerous tag and later valid migration behavior; optional real disposable PostgreSQL 16 owner/CI preflight must be reported separately from unit tests.
5. Inventory stale operational eight-migration wording, preserve historical evidence, run targeted tests, lint/format/profile and mandatory exact-HEAD CI; request independent review before any owner merge.

## SEC-N1 remediation

The judge runbook must reject every `DATABASE_URL` query parameter and fragment, and refuse libpq routing environment overrides (`PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE`, and a non-matching `PGHOST`, `PGPORT`, or `PGDATABASE`) before any migration SQL or operator provisioning. Migration SQL runs only through the pinned `127.0.0.1:54370/nmi_judge` conninfo. Deterministic tests prove those refusals without contacting a remote database. Journal validation, the operator preflight, cleanup, CI policy, and historical handoffs stay in place.

**Release gates:** G1/G4/G5/G6/G7 remain OPEN, G8 provider-disabled continuing, provider Gates A/B/C unauthorized, D4-X adoption valid only for its approved Hobby scope. The $25 authorized credit ceiling is unchanged. No Render creation/deployment authorized by this work.


## Closure record (2026-11-07)

- **Issue:** [#49](https://github.com/mrdzyn/nudgemyinvoice/issues/49) CLOSED as `completed`; this task's original implementation-stage scope and prohibitions above remain historical context.
- **PR:** [#51](https://github.com/mrdzyn/nudgemyinvoice/pull/51) owner-approved squash merge `cd4dd1e3f4589205dc832c28bfe75593681ea44d`, Git tree identical to independently audited HEAD `dd171aab8bdc56b2ccd0f511bd678ffa353489f4`; [independent SEC-N1 PASS](https://github.com/mrdzyn/nudgemyinvoice/pull/51#issuecomment-6703477602).
- **Validation:** implementing-agent local exact-HEAD CI: 1,432 unit tests, 367 disposable PG16 tests, 56/56 operator preflight, 21/21 migration-plan checks; nine journal migrations applied in bash and zsh; loopback-only refusal before any SQL on hostile routing inputs; zero known production dependency vulnerabilities; bundle scans/migration drift clean. Source/evidence independently audited, local commands not independently re-executed.
- **Hosted CI:** NOT RUN for development; the final release requires both hosted workflows successful on the exact candidate SHA. No deployment/Render resource/PayPal/OpenAI calls authorized by closing this issue.
- **Next:** clean-clone judge rehearsal and Devpost prep. Any unresolved hosting evidence is tracked separately; previous owner approvals for the Hobby/$25/D4-X choices remain in force within their documented scopes.
