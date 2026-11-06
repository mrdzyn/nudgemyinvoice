# NMI-G1 — Render hosting cost and teardown approval packet (owner decision packet)

**Status (2026-11-06): G1 is OPEN. This is a read-only assessment and documentation packet.** It approves nothing and spends nothing. No Render resource, release branch or release SHA exists, no Render API or connector call was made, no charge was incurred, and no provider was enabled. G1 closes only when **the owner** supplies the remaining Billing evidence (§5; **partly evidenced by owner-supplied 2026-11-06 screenshots, see §1**) and approves the teardown plan (§7). Base: `main@0e10e8d1f6d521bba9b0c503f4ce0fdf188ded19`.

## 1. What is verified and what is not

| Item | State | Source |
|---|---|---|
| Hobby workspace, Starter web, PostgreSQL 16 Basic 256 MB, 1 GB storage, autoscaling OFF as the proposed shape | Proposed by owner and recorded in P3; **not created** | `docs/NMI-RENDER-P3-25-BUDGET-GATE.md` |
| List prices: Starter web $7/month, Basic 256 MB $6/month (about $13/month); no extras | **Carried from P3 (checked 2026-11-04). Not re-verified for this packet:** the pricing page returned no figures to the fetch tool today. The owner confirms them at checkout. | P3 |
| Billing is **prorated by the second** | Verified 2026-11-06 | Render FAQ |
| **Owner-supplied Billing screenshots, 2026-11-06** (described only; the screenshots are private and are **not** committed): workspace plan **Hobby**; credit balance **$50.00**, expiring **2027-10-01**; **October 2026 invoice Paid, $0.00**; included usage **0 MB of 5 GB** bandwidth and **0 of 500** pipeline minutes this month; no services and no custom domains shown in the usage panel | **Owner-supplied, as of 2026-11-06; not independently checked against an authenticated Render account.** It supersedes the older Oct 29 screenshot for these items only. Not shown or not established: credit **applicability** to Starter, PostgreSQL, bandwidth, build overage and tax; **current unbilled charges**; checkout prices; tax; overage rates; the database storage settings. | Owner message |
| Bandwidth: a monthly allowance shared across services; overage is billed. Build pipeline: a monthly allowance of minutes. | Allowances **5 GB** and **500 minutes** per month are shown in the owner-supplied screenshot (0 used). **Overage rates NOT FOUND** (the FAQ points to the pricing page), so they stay UNVERIFIED. | Render FAQ; owner screenshot |
| Whether a suspended service, or a suspended paid database, keeps billing | **Not stated** in the pages read. Assume the database keeps billing until deleted. | Render FAQ |
| Hobby: point-in-time recovery for 3 days; logical backups kept 7 days, regardless of plan; a logical export is created on the database's Recovery page and downloads as `.dir.tar.gz`; a point-in-time restore creates a **new** instance | Verified 2026-11-06 | Render Postgres backups doc |
| Backups and recovery are unavailable on the Free compute plan | Verified | same |
| What happens to backups when a database is deleted | **Deleting a Render Postgres instance deletes its backups and snapshots with it, and point-in-time recovery is lost with it** ("not retained for 'rescue' later"). The page does not say what happens to on-demand export files, so **treat them as gone too**. Render keeps an export file for 7 days regardless. Verified 2026-11-06. | [Render Postgres tutorial: backups and PITR](https://render.com/tutorials/postgres-on-render/backups-and-pitr) |
| Restoring an export | An export is a `.dir.tar.gz` containing a PostgreSQL **directory-format** archive; "only restore exports into an empty database". Verified 2026-11-06. | [Render Postgres backups](https://render.com/docs/postgresql-backups) |
| Promotional credit: $50 expiring 2027-10-01 | Shown on the owner-supplied screenshots of **Oct 29 and Nov 6** (the Nov 6 balance is $50.00 with no October charge). **Eligible categories and tax treatment are unverified, and November unbilled charges are unknown.** | STATUS, P3, owner screenshots |
| A $25 hard cap | **Does not exist.** Render's only limit is for build pipeline minutes. The $25 is owner discipline. | P3 |

## 2. Proposed configuration (to be confirmed at checkout, not created)

Workspace **Hobby** · one **Starter** web service · one **PostgreSQL 16 Basic 256 MB** with **1 GB** storage and **storage autoscaling OFF** · Singapore · auto-deploy OFF, no Blueprint, no preview environments, one instance each · no Pro upgrade, add-on, extra disk, second service or second database · provider-disabled environment (G8). A single web instance is required, because rate limiting is in-memory.

## 3. Conservative hosting forecast through 2026-12-15

**Method.** A fixed rate of $13/month ($7 web, $6 database), prorated by the day within each calendar month as an approximation of per-second billing, from a **2026-11-08 00:00** start. These are arithmetic on list prices, **not a Render quote**. Costs are shown separately: fixed charges, then run-on risk, then tax, then the unknowns.

### 3a. Fixed charges by teardown date

| Scenario | Days | Web $7 | DB $6 | **Fixed total** |
|---|---:|---:|---:|---:|
| **Planned:** running 8 Nov through 15 Dec, deleted at the end of 15 Dec | 38 | $8.75 | $7.50 | **$16.26** |
| Teardown slips 5 days (deleted end of 20 Dec) | 43 | $9.88 | $8.47 | **$18.35** |
| Left running to month end (31 Dec) | 54 | $12.37 | $10.60 | **$22.97** |
| Left running to 8 Jan 2027 (deleted end of 8 Jan) | 62 | $14.17 | $12.15 | **$26.32** (over $25) |

Start-date sensitivity (teardown 15 Dec): a 10 Nov start costs $15.39, and a 12 Nov start costs $14.52. A later start only lowers the figure.

**Each day of delay costs about $0.42 to $0.43** ($13 divided by the days in the month). With **zero** overage and **zero** tax, the $25 ceiling is reached about **5 January 2027**, and the $20 warning level on about **24 December 2026**. The database is the part most likely to keep billing silently, so the teardown date, not the hosting, is the main cost risk.

### 3b. Tax (illustrative sensitivity only)

The owner's tax treatment is **unknown and not a Render statement**. The 9% figure is an illustrative stand-in for a possible consumption tax, **not advice**.

| Scenario | Fixed | Tax at 9% | Total |
|---|---:|---:|---:|
| Planned (teardown 15 Dec) | $16.26 | $1.46 | $17.72 |
| 5-day slip | $18.35 | $1.65 | **$20.00** |
| Left to 31 Dec | $22.97 | $2.07 | **$25.04** (over $25) |

### 3c. Unknowns (not forecastable from the sources read)

- **Bandwidth overage:** the included allowance is **5 GB per month** and 0 MB was used (owner-supplied screenshot, 2026-11-06). Supervised judging should stay far below that, but the **overage rate was not found**, so any overage is **UNVERIFIED**.
- **Build pipeline minutes:** the included allowance is **500 per month** and 0 were used (owner-supplied screenshot). Expect about 4 to 6 builds (the first build at creation, one redeploy after setting `WEB_ORIGIN`, a few fixes), which is expected to fit inside the allowance. The **per-minute overage price was not found**, so it stays UNVERIFIED. The owner can set Render's build-pipeline spend limit as a guard.
- **Extra storage:** none, with 1 GB and autoscaling OFF. A Blueprint can default to a larger disk, so none is used. The storage setting is not yet visible (no database exists).
- **Any charge not covered by credits** (for example tax, or a category the credit does not cover) would be out of pocket. Credit applicability to each resource is unverified.
- **November unbilled charges:** the October invoice is Paid at $0.00, but charges since 1 November are not shown on what was supplied.

### 3d. Conservative planning figure

**About $20.00** (5-day teardown slip plus an illustrative 9% tax), **before** any bandwidth or build overage. That leaves about **$5.00** of headroom under the $25 ceiling for those unknowns. The rules that keep it inside the ceiling are the same as P3 and P4 §8:

1. Delete the paid resources on 15 Dec. The ceiling is not safe past about **25 December** once tax is counted.
2. Check Billing at C0 to C6, and at the same time record each charge against the forecast.
3. Warn the owner at a projected **$20**. At a projected **$25**, or any charge not covered by credits, suspend the web service and stop, with no new resources and no upgrade.

## 4. Credits: what is evidenced and what is still an assumption

**Evidenced by owner-supplied screenshots (Oct 29 and 2026-11-06; not independently checked against an authenticated Render account):** a **$50.00** credit balance expiring **2027-10-01**, and an **October 2026 invoice that is Paid at $0.00**.

**Still UNVERIFIED, so none of these may be relied on:**
1. The credit applies to **Starter compute** and to **PostgreSQL**.
2. It applies to any **bandwidth or build overage**.
3. It applies to **tax** (tax is often not creditable).
4. **November unbilled charges** are zero.
5. Spending beyond credits is not intended: any charge not covered by credits is a stop condition, whatever payment method exists on the account.

## 5. G1 evidence matrix (G1 stays OPEN)

Redact account identifiers and payment details before sharing; **never commit raw screenshots, invoices or card data**. This repository records only a redacted, non-identifying description and a status. "Owner-supplied" means described from the owner's screenshot, not independently checked against an authenticated Render account.

| # | Evidence | State as of 2026-11-06 | Still needed |
|---|---|---|---|
| E1 | Workspace Billing shows the plan is **Hobby** | **EVIDENCED (owner-supplied)** | Nothing further for the plan itself |
| E2 | Credit balance, expiry and the categories it covers | **PARTIAL:** $50.00 balance and 2027-10-01 expiry are evidenced; the October invoice is Paid at $0.00. **Applicability to Starter, PostgreSQL, overage and tax is UNVERIFIED**, as are November unbilled charges. | Owner confirms what the credit covers, and the November unbilled amount |
| E3 | Checkout or price preview for the **Starter** web service and the **Basic 256 MB** PostgreSQL 16 | **NOT YET EVIDENCED** (P3 list prices carried) | Owner reads the checkout or preview before creating anything |
| E4 | Database storage: **1 GB, autoscaling OFF**, no other add-on | **NOT YET EVIDENCED** (no database exists; the usage panel shows no services) | Owner confirms at creation |
| E5 | Included allowances, overage rates and a build-pipeline spend limit | **PARTIAL:** 5 GB bandwidth and 500 pipeline minutes are shown, 0 used. **Overage rates and any spend-limit setting are UNVERIFIED.** | Owner reads the overage rates and decides whether to set the spend limit |
| E6 | A written forecast of at most **$25 including tax**, for the planned teardown date | **PENDING** (owner) | Owner states it after E2, E3 and E5 |
| E7 | The approved teardown and retention plan (§7), including a genuine owner-unavailability fallback (D4) | **PENDING** (owner) | Owner decisions D4 and D5 |

G1 does not close on E1, E2 and E5 alone.

## 6. Decisions the owner must make for G1 (all PENDING; none is answered by this packet)

| # | Decision | Recommended |
|---|---|---|
| D1 | Confirm the exact configuration in §2, or change it (any change needs a new forecast) | Confirm as proposed |
| D2 | The teardown date. P3 sets 15 Dec 23:59 Asia/Manila, subject to the official judging end | 15 Dec, or the day judging access ends |
| D3 | The warning level and the stop level | $20 warn, $25 stop, as P3 |
| D4 | **A genuine fallback if the owner is unavailable at teardown** (below). A calendar reminder is **not** a fallback. | D4-A or D4-B, with the latest-by date written down |
| D5 | The private storage destination, the retention deadline and the destruction plan for the verified export (below) | Owner-private encrypted storage, a fixed destruction date |

**D4: owner-unavailability fallback (the owner must choose one in writing).**

| Option | What it means | Notes |
|---|---|---|
| **D4-A** | A **named delegate** holds written authority, limited to this teardown, and has the Render access needed, **including the verified-export and the deletion steps of §7c**. Deletion still requires the owner's explicit approval, which the owner pre-records in writing for the delegate. | The owner sets up the access. An agent does not. A delegate needs access that Render may or may not allow on a Hobby workspace, so the owner confirms it is possible. |
| **D4-B** | **No delegate.** The owner pre-commits in writing to (1) a non-destructive containment step, **suspending the web service**, performed on a fixed date, and (2) a **latest-by date for deletion**. The database may keep billing until deletion, so the latest-by date is chosen against the forecast: with no overage and no tax, the $20 warning is reached about 24 Dec, and the $25 ceiling about 5 Jan; with the illustrative 9% tax, about 30 to 31 Dec. | Suspending the web service alone does not end database charges (billing after suspension is not stated by Render). |
| **D4-C** | No fallback. | **G1 cannot be closed and nothing should be provisioned.** |

**D5: private export storage, retention and destruction (PENDING owner confirmation).** The owner decides, before G1 closes: (a) a private, **encrypted** destination and who can read it, (b) a retention deadline (for example, a fixed date after judging results are final), (c) the destruction method and date, and (d) that no copy is committed, emailed, uploaded or kept on a shared drive. The export holds the operator password hash and application rows.

## 7. Backup export, retention, restore verification and teardown (owner-executed; **nothing here was run**)

An agent runs none of this. **Deleting a service or database is destructive and irreversible and needs separate explicit owner approval at that time; this packet does not grant it.**

**Why a verified private export is mandatory.** **Deleting a Render Postgres instance deletes its Render-held backups and snapshots, and its point-in-time recovery, with it** (Render tutorial, verified 2026-11-06). Render does not say what happens to export files, so treat them as gone too. After deletion, the owner's downloaded copy is the **only** copy. It must therefore be **verified as restorable off Render before any deletion is requested**.

### 7a. Verifying a real Render export (a separate, source-specific procedure)

Render's on-demand export is a `*.dir.tar.gz` holding a PostgreSQL **directory-format** archive. It is restored with `pg_restore --format=directory` (`-Fd`) against the **extracted archive directory**, into an **empty** database ("only restore exports into an empty database", Render). See [Render Postgres backups](https://render.com/docs/postgresql-backups).

**The P7-C runner is not this procedure.** `design/evidence/NMI-P7/run-nudge-recovery-drill.mjs` builds a *new synthetic* PostgreSQL 16 database and restores its own `pg_dump -Fc` **custom-format** archive. It proves the schema, grants and checks survive a dump and restore of *that* synthetic data, and it **cannot be applied to a real Render export**. Its checks are a useful list of what to verify here, to be adapted by hand or by a **new reviewed script**. It is not a substitute for verifying a real backup.

**Steps (owner or a separately authorized operator; nothing here was run):**

1. **Download** the `.dir.tar.gz` from the database's Recovery page to a private, encrypted location. Treat it as confidential. Record its SHA-256 as downloaded.
2. **Check integrity and path safety before extracting:** `gzip -t`; list the contents (`tar -tzvf`) and confirm there are no absolute paths, no `..` components and no links or device nodes, and that the expected directory-format files are present (`toc.dat` and the numbered `.dat.gz` data files).
3. **Extract** as an ordinary (non-root) user into a **new, empty, private directory**, with ownership and permissions from the archive not applied. Confirm everything stayed inside that directory.
4. **List the archive:** `pg_restore --format=directory --list <extracted-dir>`. Confirm the table of contents reads, the expected tables are present, and **`invoice_nudges` (migration `0008`) is among them**. Inspect which roles the archive's privileges name (`pg_restore --format=directory --schema-only -f - <extracted-dir>`, reviewed as text).
5. **Create a brand-new, isolated, disposable local PostgreSQL 16 cluster** (private temporary directory, loopback only, its own port) and an **empty** database owned by a non-superuser owner role. **Never** point the restore at an existing, shared or production database, and **never** use `--clean` or `--create` against anything that is not this disposable database.
6. **Roles and privileges.** Create the `nmi_runtime` role (no password) **before** restoring, so that `GRANT`s naming it can apply, then restore with
   `pg_restore --format=directory --exit-on-error --no-owner --dbname=<disposable database> <extracted-dir>`.
   If instead `--no-privileges` is used, the runtime grants are **not** restored, and `packages/db/ops/runtime-role.sql` must be **explicitly re-applied as the owner** and recorded before any permission result is believed. Render's own database roles are not expected on the disposable cluster, which is why `--no-owner` is used.
7. **Verify the restored data:** per-table row counts against counts the owner recorded at export time; the constraints, indexes and triggers (including `invoice_nudges`: 10 check constraints, 2 foreign keys, the partial unique index `invoice_nudges_one_pending_uq`, 18 columns); and that the audit log append-only trigger is present.
8. **Verify authorized and denied operations as `nmi_runtime`, and keep the error classes apart.** Privilege denials (`DELETE`, `TRUNCATE`, `CREATE TABLE`, `UPDATE audit_log`, `UPDATE` of `invoice_nudges.ai_message` or `facts`) are `42501`. Constraint and trigger rejections are **different** errors: a second pending draft for one invoice is `23505`, a check violation is `23514`, a foreign-key violation is `23503`, and the append-only trigger raises its own error, so it must not be expected to be `42501`.
9. **Log sanitized PASS/FAIL per step**, with counts only and no row content. Then shut the disposable cluster down, **confirm it is stopped** (for `pg_ctl status`, only exit 3 means "not running"), and only then delete its temporary directory.

### 7b. During judging

Render keeps point-in-time recovery for 3 days and logical backups for 7 days on Hobby. A recovery creates a **new** database instance, so a recovery also means re-pointing `DATABASE_URL` and re-running the role checks above.

### 7c. At judging end (C5 and C6)

1. Take a **final** export and verify it by **7a, steps 1 to 9**. Do not proceed past a failure.
2. Store it according to D5 and record its checksum. **A verified, independently restorable, off-Render private export must exist before deletion is requested.**
3. Revoke sessions (`UPDATE sessions SET revoked_at = now()` as the owner) and **suspend** the web service. Do not treat this as ending database billing.
4. **Separate explicit owner approval to delete** (or the D4-A delegate's pre-recorded approval, within the owner's written limits). Then delete the web service and the PostgreSQL database in the Render dashboard. This also deletes the Render-held backups, snapshots and recovery state.
5. Confirm in Billing that no resource is running and no further charge is accruing (C6).
6. Remove secrets: delete the Render secret entries, rotate `SESSION_SECRET` and the database credentials, and note that the AG Studio licence key that was held in Render's secret store has been removed. If it was ever exposed beyond accepted use, the only remedy is the vendor's own process (see `docs/NMI-P5-LICENSED-STUDIO-RELEASE.md` §2).
7. At the D5 destruction date, destroy the private export as decided, and record the outcome privately, with actual charges against this forecast.

## 8. G5 — the exact request-log decision (must be resolved before any URL is shared)

**Fact:** Hobby shows service (application) logs, kept 7 days. HTTP request logs appear only for Pro or higher. We cannot inspect, or know, what Render's edge records for a request.

**What may exist outside our view:** request lines (method, path, UUID, timing and the client IP of judges). By construction (P4 §6 A1) no customer text, name, e-mail or token is ever in a URL.

**The owner decides one of the following, in writing:**

| Option | Consequence |
|---|---|
| **G5-A. Accept the residual risk** | The owner records: "I accept that Render's edge may log request lines (method, path, invoice UUID, timing, judge IP) that I cannot inspect on Hobby." Conditions that still must hold: P4 §6 A1 to A4; synthetic-only data; the A2 marker check of application logs before sharing; the judge note says data is synthetic. |
| G5-B. Upgrade to Pro for request logs | Not authorized. It changes the cost model, so a new forecast and a new owner approval are needed. |
| G5-C. Do not host for judges | Use the local runbook (Option A) or a demo video. No Render resources are needed, and G1, G4 and G6 would not apply. |

## 9. G7 — the exact AG Studio licensing decisions (must be resolved before deployment)

The licence scope is **owner-attested, not independently legally verified**. The code does not enforce expiry. The owner decides, and attaches the entitlement record privately:

| # | Question | Why it matters |
|---|---|---|
| G7-1 | May Render's **build host download** `ag-studio`, `ag-studio-react`, `ag-grid-enterprise` and `ag-charts-enterprise` from public npm? | They are regular dependencies of `apps/web`, so the build downloads them **even for the Community build**. P4 §3 flagged this. |
| G7-2 | Does the licence cover **hosted use** for judges, with the key in Render's secret store? | P5 attests it does. The key reaches **any signed-in operator's browser by design** and cannot be recalled once delivered (P5 §2). |
| G7-3 | What is the **entitlement end date**? | The earlier trial expiry was 2026-12-16, and the teardown is 2026-12-15. The owner holds the exact date and document. Nothing in the code takes the dashboard down. |
| G7-4 | Is **replacement or rotation** of a key the owner's vendor process? | The only remedy if exposed beyond accepted use. |
| G7-5 | If any answer is "no" or "not sure" | Fall back to the Community build (no Studio packages in the bundle). G7-1 still applies unless the Studio packages are made optional dependencies, which is a **code and lockfile change not made here** and would need its own task. |

## 10. Remaining requirements for G4, G6 and G8 (none complete)

| Gate | State | Still required |
|---|---|---|
| **G4** | **OPEN** | The owner chooses a **full 40-character release SHA** on `main` and creates `release/nmi-render-judges-2026` at exactly that SHA, with no force-push or deletion. Then `pnpm --filter @nmi/api release-preflight source --expect <SHA>` must print PASS on a clean clone, and again before every deploy. **No release SHA has been chosen. This packet creates no branch.** |
| **G6** | **OPEN** | Three **separate** owner approvals: (a) creating resources and the unavoidable first build (Render builds the branch tip at creation even with auto-deploy off, so the tip must equal the approved SHA); (b) sharing a URL, after the live checks and the §8 decision; (c) the judge-access method (supervised credentials or video). The live checks (cookie flags, one-hop proxy, `X-Forwarded-For` throttling, the log-marker check) are **unperformed**. |
| **G8** | **CONTINUING** | The service environment holds no OpenAI, PayPal-credential, test or simulated variables; `NUDGE_AI_DRAFTING_ENABLED` is absent or `false`; `PAYPAL_DRAFTS_ENABLED=false`; `PAYPAL_ENV=sandbox`. `release-preflight env` must be run against the **service's** actual variable names. **P7 ran it against synthetic inputs only.** Gates A, B and C remain NOT AUTHORIZED. |
| G1 | **OPEN** | The remaining section 5 evidence (E3, E4, E6, E7 not yet evidenced; E2 and E5 only partial; E1 evidenced from an owner-supplied screenshot) and the section 6 decisions. |
| G5 | **OPEN** | Section 8 decision. |
| G7 | **OPEN** | Section 9 decisions. |

## 11. Approvals the owner must give, in order

1. Confirm or amend the section 2 configuration and the section 6 decisions D1 to D5.
2. **G1:** supply the remaining evidence (E3, E4, E6 and E7, and the unverified parts of E2 and E5), and approve the teardown and retention plan, including the D4 fallback and the D5 storage decision.
3. **G5:** choose A, B or C in section 8.
4. **G7:** answer G7-1 to G7-5 and attach the entitlement record privately.
5. **G4:** choose the release SHA and create the release branch.
6. **G6:** approve resource creation and the first build; then, after the live checks, the URL and judge-access method.
7. Throughout: Gates A, B and C stay off, and deletion needs its own approval at the time.

## 12. How this packet was checked

- `main` verified at `0e10e8d` (P7, PR #45, squash merged); its tree is identical to the independently accepted head `3b5278c`.
- The pricing, proration and backup facts were fetched from Render's public docs on 2026-11-06, including the backup-deletion statement and the directory-format restore guidance. The numbers that could **not** be fetched (list prices at checkout, overage rates) are labelled as such, not invented.
- The Nov 6 Billing facts come from **owner-supplied screenshots**, described here without committing them. They were not checked against an authenticated Render account.
- The forecast arithmetic is reproducible: $13 times the prorated month fractions, from 8 Nov. It is not a Render quote, and it is **unchanged** by the Billing evidence.
- The Render connector was not used (it is unauthenticated), no Render API was called, and nothing was provisioned.
