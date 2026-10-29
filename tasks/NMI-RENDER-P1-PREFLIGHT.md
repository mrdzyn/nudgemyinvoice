# NMI-RENDER-P1-PREFLIGHT — Local operator-provisioning credential proof

**State:** ACTIVE, bounded offline pre-deployment evidence task. **Not** a Render deployment or provider-acceptance task.

- **Base `main`:** `d13c0a6e28443642ce611ce459122b682c1de92f` — owner-approved squash merge of independently audited PR #21.
- **Working branch:** `docs/nmi-render-p1-operator-provision-preflight`; use the **existing Draft PR**.
- **Active handoff:** `NMI-RENDER-P1-PREFLIGHT-START`.
- **UI design gate:** Not applicable (offline CLI verification only).

## Objective

Independently demonstrate that the *actual* `pnpm --filter @nmi/api provision-operator` CLI, in `apps/api/src/cli/provision-operator.ts`, securely authenticates to a disposable **password-enforcing PostgreSQL 16** database using the exact owner-run approach of `docs/NMI-RENDER-P1-RUNBOOK.md` §5: non-secret PG connection parameters, a **0600, temporary `PGPASSFILE`**, and a **passwordless** `DATABASE_URL`. Verify safe failure without that file. Resolve the last deferred staging release proof without changing the production invoice or provider behavior.

This is **not** authorization to create Render services, a managed database, bills, secrets or a staging URL. No external provider requests, real customer data or public sharing.

## Required startup context

Read unchanged repository instructions as needed: `AGENTS.md`, `docs/STATUS.md`, `config/project-profile.json`, this task, the active handoff `NMI-RENDER-P1-PREFLIGHT-START`, `docs/TESTING.md`, `docs/SECURITY.md` and `docs/NMI-RENDER-P1-RUNBOOK.md` §5. Inspect only relevant CLI, auth provisioning, database migrations, password-file library and testing helpers. Do not load all historical handoffs or project memory.

## Exact verification contract

Use an **isolated disposable PostgreSQL 16 instance** configured to require SCRAM password authentication for TCP connections; verify the enforced authentication method, not just that a password happened to be supplied. Never touch Render, production/staging DBs, an existing developer database, or a customer dataset.

1. **Secure owner connection:** using throwaway credentials, prove the runbook's `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSSLMODE` (choose appropriate TLS setting for localhost-only fixture), `PGPASSFILE` and no-password URL conventions. The `PGPASSFILE` must be mode `0600`, have correct five-field syntax, and escape `:` and `\\` in the password. Use a synthetic password containing **both** special characters. Capture only sanitized evidence; no plaintext secrets, auth tokens, full DSNs, temp-file content, or operator password in logs/PR.
2. **Actual CLI:** invoke `pnpm --filter @nmi/api provision-operator` as a child process with a **passwordless** `DATABASE_URL`, a safe ephemeral operator username/password and the file; assert exit 0 / `Operator created.`, a single operator row with a **password hash** (not plaintext), and a corresponding audit entry. Use the same provisioning code actually shipped; not a mocked `pg.Pool` or an isolated driver-only connection.
3. **Retry/rotation:** invoke the **same CLI again** using a different synthetic operator password. Assert `Operator updated; existing sessions revoked.` and the credential version/old-session revocation behavior, without relying on an unsafe generic reset. Confirm single-operator invariant; no secrets in outputs. Avoid changes to another environment.
4. **Negative control:** repeat an invocation with no valid `PGPASSFILE`, no `PGPASSWORD` and no other password source under SCRAM auth; require a clean nonzero exit and no new account/audit mutation. Confirm other file-permission cases only if the local driver actually enforces them; note any differences.
5. **Cleanup:** stop and remove isolated DB, disposable role, temporary file, shell-secret variables and any temporary credential material; check cleanup even after a failed command. Make no DB changes outside the disposable fixture. No shell history / process-argument leakage.
6. **Evidence:** record exact versions of Node, pnpm, PostgreSQL 16 and pinned `pg@8.23.1`, command outlines with redacted arguments, safe result counts and SQL state, test environment/OS, cleanup proof, limitations and whether `pg` emits its documented deprecation warning for `PGPASSFILE`. **Do not suppress or hide that warning.** Treat future pg@9 removal as a deferred compatibility item requiring a separate reviewed approach, not permission to embed secrets in URLs.

## Scope and tests

- Primary deliverable: `docs/NMI-RENDER-P1-PREFLIGHT-EVIDENCE.md` recording **actual completed** test results; never fabricate PASS. Update `docs/STATUS.md`, this task and append `NMI-RENDER-P1-PREFLIGHT-IMPL` handoff.
- Optional small **test-only** verifier under `scripts/` or `apps/api/src/*test*` solely if reproducibility meaningfully improves evidence. No production CLI modifications unless a failure proves a defect; **stop and report** the smallest required remediation before changing runtime behavior, libraries, migrations, security grants or secrets handling.
- If the exact CLI cannot use `PGPASSFILE`, mark **BLOCKED** and propose safe alternatives for owner decision; **never** substitute a password-bearing URL, `psql -c` secret, insecure process argument or production/staging provider credential.
- Run the smallest targeted validation proving this objective, plus mandatory Project Baseline / Stack CI on exact HEAD. Do not unnecessarily re-run unrelated browser/provider tests whose code was not changed. If testing on local nonpassword-auth PostgreSQL would give misleading evidence, do not claim PASS.
- Do not edit PR #21 history, real provider authorization answers, payment API contracts, OpenAI/PayPal clients, UI, schema or production deploy config. Any observed issue outside scope is a new explicit decision, not an implied expansion.

## Next gate

After the independent GPT-6 exact-head evidence audit and **separate owner squash approval**, staging remains **NOT AUTHORIZED** until the owner makes a new, cost-scoped explicit decision to create a Render web service/database. Even then, run the live QA from `docs/NMI-RENDER-P1-RUNBOOK.md` before sharing any URL. This P1 preflight does not authorize Gate A (OpenAI), Gate B (PayPal — historical one-create budget exhausted) or Gate C (combined); all remain NOT AUTHORIZED.

Deliver exact final HEAD, local evidence, CI runs and independent-audit request on **the existing Draft PR**. Do not merge, provision, deploy, upload or publish.

## Implementation record (NMI-RENDER-P1-PREFLIGHT-IMPL)
**State:** verification complete, awaiting independent exact-head audit. Verifier `scripts/preflight-provision-operator.mjs` (`pnpm preflight:provision`); sanitized results in `docs/NMI-RENDER-P1-PREFLIGHT-EVIDENCE.md` (54/54). Production CLI and all runtime code unmodified. Deferred: `pg@9` removal of `PGPASSFILE` support needs a separate reviewed approach; Render TLS/role behavior untested.

### Remediation FIX1 (review 5698125509; verifier + docs only)
MINOR-1: the three negative controls now require exit 1, exactly one `Provisioning failed.` line, no success line, no secret, and (0644) the pgpass permission warning. MINOR-2: teardown is fail closed (pg_ctl stop status, pg_ctl status = not running, pid gone, Node TCP probe where only ECONNREFUSED counts, ENOENT-only absence). 18 fault-injection self-tests plus a real `PG_BIN=/nonexistent` injection (found and fixed a report-crash in the version banner). Production code unchanged.
