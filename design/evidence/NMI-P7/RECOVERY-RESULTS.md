# NMI-P7-C — migration `0008` backup and restore verification (local PostgreSQL 16)

**Result:** 116/116 checks passed (`recovery-results.json`), regenerated after audit finding P7-C-AUD-01. The earlier 99/99 run (source `eca6b6b`) is superseded; its sensitivity control did not verify the probe restore or update, so it could in principle have passed on a failed probe. The other 99 checks are unchanged. All data is synthetic (`example.invalid` addresses, fake hashes).
**Scope:** proves a **local, disposable PostgreSQL 16** dump/restore of all nine migrations, including `invoice_nudges`. It does **not** prove Render-managed backups, Render's PostgreSQL configuration, restore time on real data, or any hosted behaviour.
**Historical evidence kept:** the P4 runner (`design/evidence/NMI-RENDER-P4/run-backup-restore-drill.mjs`) and its 26/26 result for migrations `0000`–`0007` are unchanged.

## Provenance (from `recovery-results.json`)

| Item | Value |
|---|---|
| Runner | `design/evidence/NMI-P7/run-nudge-recovery-drill.mjs`, committed at `39e6603470022152021827acf5fef0ee4724112e` |
| Source SHA of the run | `39e6603470022152021827acf5fef0ee4724112e` (working tree clean at run time) |
| Command | `LC_ALL=en_US.UTF-8 node design/evidence/NMI-P7/run-nudge-recovery-drill.mjs` |
| Server / tools | PostgreSQL 16.15 (Homebrew, aarch64 macOS); `pg_dump` and `pg_restore` 16.15; Node v24.21.0 |
| Cluster | private temp directory, `listen_addresses=127.0.0.1`, port 54392, short socket directory, trust auth |
| Inputs | SHA-256 of all nine migration files and `runtime-role.sql` are in the JSON |
| Dump / restore | `pg_dump -Fc --no-owner` (mode 0600) and `pg_restore --no-owner --exit-on-error`, both as the non-superuser `nmi_owner` |

## What was proven

| Group | What it proves |
|---|---|
| Setup | The owner and runtime roles are non-superusers. Migrations `0000`–`0008` and `runtime-role.sql` apply as the owner. `invoice_nudges` is owned by the owner. |
| Seed | One operator (the schema allows only one), 12 invoices, 12 items and 12 nudges: 3 pending, 3 approved, 2 rejected and 4 superseded. |
| Fingerprints | Source and restored match for every table's rows and content (md5), for `invoice_nudges` alone, for the schema (columns and defaults, constraints, triggers, indexes), and for every `nmi_runtime` table, column and schema privilege. The `invoice_nudges` shape is 10 check constraints, 2 foreign keys, 4 indexes and 18 columns, before and after. |
| Relationships | After restore, all 12 nudges join to their invoice and operator, each nudge's `operator_id` equals its invoice's `created_by`, and the partial unique index `invoice_nudges_one_pending_uq` is present. |
| Runtime allowed | After restore the runtime role can read nudges, insert a pending nudge, edit its text, approve it, insert a new pending draft once the old one is approved, and append to the audit log. The AI original is unchanged. |
| Runtime denied, before dump **and** after restore | One battery of 31 denial and constraint checks runs on the source before the dump and again on the restored database (62 checks). The runtime denials are all enforced: DELETE and TRUNCATE on nudges; UPDATE of `ai_message`, `rationale`, `facts`, `model`, `prompt_version`, `tone`, `invoice_id`, `operator_id`, `id` and `created_at`; CREATE, ALTER and DROP; UPDATE, DELETE and TRUNCATE on `audit_log`; UPDATE of operator credentials; UPDATE and DELETE on invoices. |
| Constraints (same battery) | A second pending draft for one invoice is rejected by `invoice_nudges_one_pending_uq`, for the runtime role and for the owner. Unknown status, approved without `approved_at`, unknown invoice, and deleting an invoice that has nudges are all rejected. The append-only trigger rejects even the owner. A second operator row is rejected by `operators_single_row_uq`. |
| Loss and recovery | The superuser deletes all nudges (the runtime role could not), the database is dropped, and it is restored as the non-superuser owner. |
| Controls | **Sensitivity (fail-closed, P7-C-AUD-01):** in a second restore, the probe database must be created, `pg_restore --exit-on-error` must exit 0, the pre-mutation nudge fingerprint must be valid and equal the 12-row source, the update must change exactly one row, and the post-mutation fingerprint must be valid, error-free and different. **Sensitivity negative controls (12 checks):** a real failed probe restore (truncated archive), a real zero-row update, and a 10-case table covering a failed create, failed restore, `ERR` or mismatched pre-fingerprint, 0 or 2 rows updated, an errored update, an `ERR`, empty or unchanged post-fingerprint. None can yield a PASS. **Corrupt archives:** a truncated archive and a wrong-header archive are each rejected by `pg_restore` and do not reproduce the source fingerprint. **Weakened-grant control:** a one-off run on the original runner, not committed and not part of the 116, with `DELETE` and `UPDATE(ai_message, facts)` granted to the runtime role. It failed 14 checks, including the DELETE and immutable-column denials, so the battery detects a weaker grant. |
| Cleanup | PostgreSQL shutdown is confirmed (`pg_ctl status` non-zero) before the data and socket directories are deleted. No temporary directory remained. |

## Limitations

- Local PostgreSQL 16.15 on one machine only. Render-managed backup, restore, retention and point-in-time recovery are unproven.
- Synthetic data of about 100 rows, so restore duration says nothing about real size.
- The schema allows a single operator (`operators_single_row_uq`). Cross-operator isolation therefore cannot be shown in the database. It is covered by the API tests in `apps/api/src/nudges.pg.test.ts`, which this drill does not rerun. The drill proves ownership links and the grants.
- Constraint text is compared with parentheses and whitespace removed, because `pg_dump` re-prints the AND nesting of some CHECK expressions (as in P4).
- The archive holds credential hashes and rows, so a real backup must be stored privately.
- No existing database, owner database, provider or network was touched.
