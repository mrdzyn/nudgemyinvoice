# NMI-RENDER-P1-PREFLIGHT — Operator-provisioning credential proof (sanitized evidence)

**Status:** PASS, 54/54 checks (36 original + 18 failure-injection self-tests), offline; re-run after audit review `5698125509` (remediation FIX1 of the verifier). **Run by:** implementation agent (Claude), 2026-10-29, local macOS. **Not** an independent audit; not a Render, provider or staging test.

## What was proven

The actual shipped CLI, `pnpm --filter @nmi/api provision-operator` (`apps/api/src/cli/provision-operator.ts`, **unmodified**), authenticates to a password-enforcing PostgreSQL 16 using exactly the runbook §5 owner convention: non-secret `PGHOST/PGPORT/PGDATABASE/PGUSER/PGSSLMODE`, a temporary mode-`0600` `PGPASSFILE`, and a **passwordless** `DATABASE_URL`. No production code, schema, grant, UI or provider file changed.

## Environment

| Item | Value |
| --- | --- |
| OS | Darwin 27.0.0 arm64 |
| Node / pnpm | v24.21.0 / 10.28.0 |
| PostgreSQL | 16.15 (Homebrew), isolated `initdb` in a fresh 0700 temp dir, loopback only, random port, no unix socket |
| Driver | `pg` 8.23.1 (pinned) using `pgpass` 1.0.5 |
| Auth enforced | `--auth-host=scram-sha-256 --auth-local=scram-sha-256`; `password_encryption=scram-sha-256` |
| TLS | `PGSSLMODE=disable` and `?sslmode=disable` (loopback fixture has no TLS). The runbook uses `require` against Render; TLS to Render is **not** covered here |

Reproduce: `pnpm preflight:provision` (= `node scripts/preflight-provision-operator.mjs`; needs PostgreSQL 16 binaries, `PG_BIN` defaults to `/opt/homebrew/opt/postgresql@16/bin`). All credentials are synthetic, random per run, never printed, never an argument, and never written inside the repository. Exit 0 only if every check passes. The report also runs 18 fault-injection self-tests before it touches PostgreSQL.

## Command outline (secrets redacted)

```text
initdb -D <tmp>/pg -U nmi_owner --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=<0600 tmp, deleted>
pg_ctl start -o "-p <random> -c unix_socket_directories='' -c listen_addresses=127.0.0.1"
env PGHOST=127.0.0.1 PGPORT=<random> PGDATABASE=nmi_preflight PGUSER=nmi_owner PGSSLMODE=disable PGPASSFILE=<tmp, 0600>
  psql -X -v ON_ERROR_STOP=1 -1 -f packages/db/migrations/000N_*.sql      (x7, journal order)
env <the same PG* + PGPASSFILE> DATABASE_URL=postgres://nmi_owner@127.0.0.1:<port>/nmi_preflight?sslmode=disable
    NMI_OPERATOR_USERNAME=<random> NMI_OPERATOR_PASSWORD=<synthetic, contains ':' and '\'>
  pnpm --filter @nmi/api provision-operator                                (child process; arguments contain no secret)
```

The password-file line is `host:port:database:user:password` with `\` and `:` in the password escaped as in the runbook.

## Results

| Area | Check | Result |
| --- | --- | --- |
| Fixture | SCRAM-only: every `pg_hba` rule is `scram-sha-256`; owner verifier is `SCRAM-SHA-256$…` | PASS |
| Fixture | No password source → server refuses ("no password supplied"); wrong password → "password authentication failed" | PASS |
| Password file | Mode `0600`; five fields; owner password contains both `:` and `\` and both are escaped | PASS |
| Migrations | Seven committed migrations applied in journal order through `psql` + `PGPASSFILE` | PASS |
| Create | CLI exit 0; exactly one `Operator created.` line; `pg` deprecation warning emitted (see below) | PASS |
| Create | 1 operator row; `password_hash` is a salted `scrypt$N$r$p$salt$hash`, does not contain the plaintext; `credential_version = 1` | PASS |
| Create | 1 `operator.provision` audit row (`outcome=success`, `reason=created`) | PASS |
| Rotate | Same CLI, different password: exit 0, `Operator updated; existing sessions revoked.` | PASS |
| Rotate | Still 1 operator; `credential_version` 1 → 2; hash changed; the one pre-existing live session now revoked (0 live); 2nd audit row `reason=rotated` | PASS |
| Negative: missing `PGPASSFILE` | exit code exactly 1, **exactly one** `Provisioning failed.` stderr line, no `Operator created/updated` line, no secret | PASS |
| Negative: password file for a different password | same contract (exit 1, `Provisioning failed.`, no success line, no secret) | PASS |
| Negative: `PGPASSFILE` mode `0644` | same contract **and** the driver's `WARNING: password file "…" has group or world access; permissions should be u=rw (0600) or less` line is required (the file is ignored, then `Provisioning failed.`) | PASS |
| Negative: no mutation | After the three failures operator count, audit count, credential version, hash and session count are identical | PASS |
| Leaks | No `PGPASSWORD`, no password-bearing URL given to any command; no secret in any sampled process argument list (9 samples at 150 ms across the two successful CLI runs); no secret in any captured stdout/stderr/`ps` output; no secret in any of 558 repository files after the run | PASS |
| Cleanup (fail closed) | `pg_ctl stop` exit status 0 (no spawn error); `pg_ctl status` reports not running (exit 3); the postmaster pid read before stop no longer exists (`kill(pid,0)` → ESRCH); the port refuses connections by a Node TCP probe (only `ECONNREFUSED` counts as closed; timeouts/other errors are failures; no dependency on `nc`); temp dir and `PGPASSFILE` absent (`ENOENT` only); no leftover process | PASS |
| Failure injection | 18 self-tests: 2 controls accept good teardown/good CLI failure; 16 injected faults are each detected as a failure (see below) | PASS |

## Failure-injection evidence (verifier self-tests)

Run before PostgreSQL starts, with fake dependencies, so a broken teardown or an over-permissive negative-control assertion cannot pass silently. Each fault must make the verdict *not ok*:

- Teardown: `pg_ctl stop` nonzero; `pg_ctl` cannot be spawned; `pg_ctl status` says running; pid still alive; pid undeterminable; pid liveness inconclusive (EPERM); port probe inconclusive (probe tool unavailable); port still accepts connections; temp directory not removed; password file not removed. A fully good teardown is accepted (control).
- CLI failure contract: nonzero exit with a different message (e.g. the usage error, exit 2); exit 1 with the wrong message; exit 0 despite the message; the 0644 case without the permission warning; a success line printed on a failure. The expected failure (with and without the warning) is accepted (controls).
- Real end-to-end injection: `PG_BIN=/nonexistent node scripts/preflight-provision-operator.mjs` fails closed (exit 1; `pg.init` and `pg.start` FAIL; 21/23 checks) and leaves nothing behind. This exposed a verifier defect (the version banner threw when `postgres` could not be run, so no report was written); it is fixed and the report is now produced.

The first harness runs failed because of fixture bugs (a bootstrap `CREATE DATABASE` used a password-file entry for the wrong database, and two assertions compared against the wrong string); no result was edited to pass and no production file changed. The recorded run is the final one.

## `pg@8.23.1` compatibility warning (left visible)

The successful create run (asserted by the verifier) prints, to stderr:

`DeprecationWarning: pgpass support is deprecated and will be removed in pg@9.0. You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. …`

Implications: (1) it works in the **pinned** version, which is exactly what this evidence covers; (2) the warning is expected, harmless output and must not be suppressed (the verifier asserts it is present); (3) a `pg` upgrade to 9 would silently remove the fallback and the CLI would then fail closed with `Provisioning failed.` (no password) rather than weaken anything; (4) **do not** pin to a password-bearing `DATABASE_URL` as a workaround. A reviewed alternative (for example an async `password` callback that reads the file in the CLI) needs a separate task and approval; none is made here.

## Limitations (not proven)

- Real Render PostgreSQL: external host, role-creation rights, TLS verification with `sslmode=require`, allow-list and plan behavior are NOT TESTED.
- Production-CLI behavior is unchanged: the negative-control strictness comes from the verifier, not the CLI.
- The process-table check samples every 150 ms; it cannot prove a short-lived process never exposed an argument, though no secret is passed as one by construction.
- Only the owner-run provisioning CLI was exercised, not the web login with the rotated password (covered by existing auth tests) or the runtime-role login (covered in PR #21's tests).
- Single machine, macOS, Homebrew PostgreSQL 16.15; a Linux host was not run. Hosted CI does **not** run this verifier (it needs local PostgreSQL binaries); it runs lint, format and typecheck on the script.
- Local single-user filesystem; protection of the temp file relies on mode 0600 and a 0700 parent directory.

## Authorization

Nothing was merged, provisioned, deployed, published or billed; no OpenAI or PayPal request occurred. Gates A, B and C remain NOT AUTHORIZED.
