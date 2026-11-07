# NMI-MIG-0008-ISSUE49 — Local judge and operator preflight migration alignment

- **State:** IMPLEMENTATION / DRAFT REVIEW; not a release or hosting authorization.
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

**Release gates:** G1/G4/G5/G6/G7 remain OPEN, G8 provider-disabled continuing, provider Gates A/B/C unauthorized, D4-X adoption valid only for its approved Hobby scope. The $25 authorized credit ceiling is unchanged. No Render creation/deployment authorized by this work.
