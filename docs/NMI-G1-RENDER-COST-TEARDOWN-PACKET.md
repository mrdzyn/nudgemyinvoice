# NMI-G1 — Render hosting cost and teardown approval packet (owner decision packet)

> **2026-11-07 release-path status (proposal, not gate closure):** The owner selected SHA `abfbbfc3153cb3b4238ebf201daca830fed2e8f9`, created and protected `release/nmi-render-judges-2026`, and reported clean-clone source checks 7/7 PASS. GitHub-hosted release workflows are **NOT RUN** due to an external billing block. The owner directed a one-time independently verified manual-CI substitution, now **proposed** in `tasks/NMI-RENDER-RC-MANUAL-CI-EXCEPTION.md` and `docs/TESTING.md`. It changes only a prospective G4 *validation path* after independent review, verified policy merge, complete manual evidence, an independent release audit and separate owner approval. No G1 E/D item, G5 risk acceptance, G6 approval, G7 entitlement, G8 provider restriction, $25 ceiling or teardown right is waived or automatically closed. Historical "no SHA" lines below remain the original packet state; this paragraph states the current repository state. No resource/first build/deploy authorization is inferred.

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
| E3 | **Pre-creation (G1):** the Starter web and Basic 256 MB PostgreSQL 16 prices as Render shows them at the create or checkout step, **reviewed without confirming creation**; or, if Render shows no price before the final confirm, the owner records that gap in writing | **NOT YET EVIDENCED** (P3 list prices carried; this packet does not assume a preview exists) | Owner reads the price where Render shows it, or records the gap |
| E4 | **Pre-creation (G1): the intended database configuration**, recorded by the owner in writing: PostgreSQL 16 Basic 256 MB, **1 GB** storage, **autoscaling OFF**, no add-on, no second resource; and read from the create form if the form shows it before the final confirm | **NOT YET EVIDENCED**. No database exists, and nothing here says a form or preview has been seen. | Owner records the intended settings (and the form's values, if shown before confirming) |
| E4b | **Post-creation (G6, not G1):** the **actual** storage size, autoscaling state and absence of add-ons on the created database, and the actual charge against the forecast | **NOT APPLICABLE until a resource exists** (it cannot be evidenced before a separately authorized creation) | Checked at C1 (+24 h after create) and recorded under the G6 creation approval |
| E5 | Included allowances, overage rates and a build-pipeline spend limit | **PARTIAL:** 5 GB bandwidth and 500 pipeline minutes are shown, 0 used. **Overage rates and any spend-limit setting are UNVERIFIED.** | Owner reads the overage rates and decides whether to set the spend limit |
| E6 | A written forecast of at most **$25 including tax**, for the planned teardown date | **PENDING** (owner) | Owner states it after E2, E3 and E5 |
| E7 | The approved teardown and retention plan (§7), including an **eligible, executable** owner-unavailability fallback (D4). **Exception:** for the one approved Hobby deployment and timebox, **D4-X, once effective, substitutes for the executable-fallback requirement**; the ordinary requirement applies to every other case. | **PENDING.** The **fallback part is satisfied by the adopted owner-only exception only once the adoption record is effective** (all four conditions, including a verified completed merge; see §13a). **D5 (encrypted destination, retention deadline, destruction method and date) and the rest of the §7 plan are still pending.** | Owner decision D5 and confirmation of the §7 plan. If the adoption record is not effective, no eligible fallback exists, and E7 and G1 stay open. |

G1 does not close on E1, E2 and E5 alone. **E4 is split on purpose:** G1 needs the owner's *pre-creation* confirmation of the intended configuration and prices (E3, E4). Verifying what was *actually created* (E4b) can only happen after provisioning, which is a separate G6 approval, so E4b is not a G1 requirement.

## 6. Decisions the owner must make for G1 (D4 is reported as ratified through exception D4-X, effective only when the four conditions in the adoption record hold; D1 to D3 and D5 are PENDING; this packet answers none of them)

| # | Decision | Recommended |
|---|---|---|
| D1 | Confirm the exact configuration in §2, or change it (any change needs a new forecast) | Confirm as proposed |
| D2 | The teardown date. P3 sets 15 Dec 23:59 Asia/Manila, subject to the official judging end | 15 Dec, or the day judging access ends |
| D3 | The warning level and the stop level | $20 warn, $25 stop, as P3 |
| D4 | **An executable fallback if the owner is unavailable at teardown** (below). A reminder or a future commitment by the owner is **not** one, and deletion is never delegated in advance. **Status: satisfied by the adopted exception D4-X, but only once the adoption record is effective (§13a), and only for the one approved Hobby deployment and timebox.** | D4-A with a confirmed delegate; on Hobby no delegate is possible, so D4-X applies |
| D5 | The private storage destination, the retention deadline and the destruction plan for the verified export (below) | Owner-private encrypted storage, a fixed destruction date |

**D4: owner-unavailability fallback.** *Originally PENDING, none chosen. The owner has since reported ratifying the narrowly scoped exception D4-X below. It is effective only when all four of these hold: an independent exact-HEAD review PASS, both required hosted CI workflows passing at the final head, the owner's new explicit merge approval, and a verified completed merge on GitHub. Until then D4 is unmet and the original text governs.*

**Eligibility rule.** A fallback counts only if it is **operationally executable while the owner is unavailable**: someone other than the owner, with the authority and the actual access to act, can carry out the non-destructive teardown steps without the owner. A calendar reminder, a written future promise by the owner, or a latest-by date is **not** a fallback, because the owner is the unavailable party. **Without an eligible fallback, G1 cannot close and nothing may be provisioned. This rule applies to every case except the one Hobby deployment and timebox covered by D4-X (below), for which D4-X, once effective, substitutes for it. Wherever D4-X is not effective or does not apply, this rule and D4-B stay fully binding.**

| Option | What it means | Notes |
|---|---|---|
| **D4-A** | A **named delegate**, who is not the owner, is reachable on the teardown dates and holds **written authority limited to the non-destructive steps of §7c (take and verify the export, revoke sessions, suspend the web service)**, with **confirmed, feasible Render and export-storage access**. The owner confirms that this access is possible, because Hobby workspace access for a second person is not established here. **Revoking sessions needs the database owner credential**, which the owner decides whether to share; if it is not shared, the delegate's steps are the export and the suspension only. | **Deletion is not delegated by this option.** Deleting the web service or the database still needs the owner's **separate explicit approval at teardown time** (§7c step 4). Neither general advance approval nor granted access substitutes for it. If the owner cannot be reached, the delegate does **not** delete: the resources stay, and the **continuing cost is outside the $25 ceiling** until the owner approves a deletion or renews the spending limit. |
| **D4-B** | **Not eligible: no delegate, an unconfirmed delegate, or only a future commitment, reminder or latest-by date by the owner.** | **G1 cannot close and nothing may be provisioned** (except where D4-X is effective and applies, below). Suspending the web service does not end database charges (Render does not state billing after suspension), so it is not a cost cap. |
| **D4-X** | **Adopted Hobby owner-only exception** (the owner is the sole workspace administrator, with no executable fallback), for **this one deployment and timebox only**. The scope, accepted exposure and unchanged conditions are in [`NMI-G1-HOBBY-EXCEPTION-ADOPTION-RECORD.md`](NMI-G1-HOBBY-EXCEPTION-ADOPTION-RECORD.md). | **Applies only to the one approved Hobby deployment and timebox** (the Mrdzyn Hobby workspace, one Starter web service and one PostgreSQL 16 Basic 256 MB, synthetic-only and provider-disabled, target teardown by 15 December 2026 23:59 Asia/Manila subject to the official judge-access end), and **only once the adoption record is effective**: independent PASS, exact-head CI, the owner's new explicit merge approval **and a verified completed merge**. An approved but unmerged PR is not enough. It substitutes for this D4 rule **only**; **the original requirement is preserved for every other case**. The $25 ceiling is unchanged and is not a Render cap, and charges beyond it are possible with no guaranteed maximum. There is **no delegated or automated deletion**, so deletion needs the owner's separate explicit approval at teardown time. D5, the checkpoints C0 to C6 and every other gate stay in force, and G1 stays OPEN. D4-B above is kept as written and applies to any deployment, plan, shape or date not covered by D4-X. |
| **D4-C** | Any **other** mechanism | Eligible only if it is independently actionable without the owner, authorized in writing, and verified feasible. **None is proposed, and none has been verified.** |

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
3. **Non-destructive containment** (the owner, or the D4-A delegate within the delegate's written limits): revoke sessions (`UPDATE sessions SET revoked_at = now()` as the owner role) and **suspend** the web service. Do not treat this as ending database billing.
4. **Deletion needs the owner's separate explicit approval, given at teardown time, for that deletion, after the export is verified (steps 1 and 2).** Neither a pre-recorded or general advance approval nor delegated Render access substitutes for it. Only after that approval, the owner (or the delegate acting on that approval) deletes the web service and the PostgreSQL database in the Render dashboard. This also deletes the Render-held backups, snapshots and recovery state.
   - **If the approval cannot be obtained:** nothing is deleted. The resources and their charges continue, **outside the $25 ceiling**, until the owner approves the deletion or renews the spending limit. That posture is a known cost risk, not a plan within the budget.
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
| **G6** | **OPEN** | Three **separate** owner approvals: (a) creating resources and the unavoidable first build, **after which the actual configuration is verified (E4b)** at C1 (Render builds the branch tip at creation even with auto-deploy off, so the tip must equal the approved SHA); (b) sharing a URL, after the live checks and the §8 decision; (c) the judge-access method (supervised credentials or video). The live checks (cookie flags, one-hop proxy, `X-Forwarded-For` throttling, the log-marker check) are **unperformed**. |
| **G8** | **CONTINUING** | The service environment holds no OpenAI, PayPal-credential, test or simulated variables; `NUDGE_AI_DRAFTING_ENABLED` is absent or `false`; `PAYPAL_DRAFTS_ENABLED=false`; `PAYPAL_ENV=sandbox`. `release-preflight env` must be run against the **service's** actual variable names. **P7 ran it against synthetic inputs only.** Gates A, B and C remain NOT AUTHORIZED. |
| G1 | **OPEN** | The remaining section 5 evidence: pre-creation E3 and E4, E6 and E7 not yet evidenced; E2 and E5 only partial; E1 evidenced from an owner-supplied screenshot; and the section 6 decisions, including an **eligible D4 fallback**. E4b is a G6 item, not a G1 item. |
| G5 | **OPEN** | Section 8 decision. |
| G7 | **OPEN** | Section 9 decisions. |

## 11. Approvals the owner must give, in order

1. Confirm or amend the section 2 configuration and the section 6 decisions D1 to D5.
2. **G1:** supply the remaining evidence (pre-creation E3 and E4, E6 and E7, and the unverified parts of E2 and E5), and approve the teardown and retention plan, including the D5 storage decision. **D4 is satisfied by the adopted exception D4-X only once the adoption record is effective** (the owner has reported ratifying it; it becomes effective only when the independent PASS, the exact-head CI, the owner's new explicit merge approval and a **verified completed merge** all hold; approval alone is not enough). If the adoption record is not effective, or for any case it does not cover, an eligible D4 fallback is still required, and without one G1 cannot close.
3. **G5:** choose A, B or C in section 8.
4. **G7:** answer G7-1 to G7-5 and attach the entitlement record privately.
5. **G4:** choose the release SHA and create the release branch.
6. **G6:** approve resource creation and the first build; after creation, verify the actual configuration and charge (E4b) at C1; then, after the live checks, approve the URL and the judge-access method.
7. Throughout: Gates A, B and C stay off, and deletion needs its own **fresh, explicit owner approval at teardown time**, which neither the exception nor any advance approval replaces.

## 12. How this packet was checked

- `main` verified at `0e10e8d` (P7, PR #45, squash merged); its tree is identical to the independently accepted head `3b5278c`.
- The pricing, proration and backup facts were fetched from Render's public docs on 2026-11-06, including the backup-deletion statement and the directory-format restore guidance. The numbers that could **not** be fetched (list prices at checkout, overage rates) are labelled as such, not invented.
- The Nov 6 Billing facts come from **owner-supplied screenshots**, described here without committing them. They were not checked against an authenticated Render account.
- The forecast arithmetic is reproducible: $13 times the prorated month fractions, from 8 Nov. It is not a Render quote, and it is **unchanged** by the Billing evidence.
- The Render connector was not used (it is unauthenticated), no Render API was called, and nothing was provisioned.

## 13. Hobby owner-only exception: proposal history (PR #48, merged) and adoption (§13a)

*The paragraph below is the proposal-stage text, kept as history. Its statements that the exception was "NOT ADOPTED" and that D4 "remains effective" describe the state when PR #48 merged and are superseded by §13a once the adoption record takes effect.*

The owner on **2026-11-06** approved **preparing**, not adopting, a bounded owner-only exception to §6 D4 while retaining Hobby and the existing $25 authorized eligible-credit budget. The proposal and risk disclosure are in [`docs/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md`](NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md). Render's Hobby plan cannot add team members; a reminder or owner commitment does not satisfy the existing independently executable fallback rule. **The existing D4 requirement remains effective until independent review and a separate, explicit owner adoption of that exception.** No declaration here closes G1, authorizes involuntary over-budget charges, approves resource creation/first deploy, delegates destruction, or changes G5/G7/G4/G6/G8. All other E1–E7 and D1–D5 owner conditions remain as written. The proposed exception also concerns **the same pre-provisioning fallback prerequisite in the previously owner-merged P3 budget policy**; a non-operative cross-reference has been appended there. **Only after** a new, explicit owner ratification, independent review and merge of a separate adoption record may P3's narrowly stated fallback requirement and this packet's **§6 D4 / E7 / §11** be revised together to acknowledge an owner-only exception. Until then, none of those requirements is satisfied, and a proposed exception cannot be treated as G1 closure or provisioning authority.

## 13a. Adoption of the exception (effective only when the adoption record's four conditions hold)

The owner reports that on **2026-11-06** they ratified the narrowly scoped Hobby owner-only exception in conversation (not as a GitHub comment). The adoption record, [`NMI-G1-HOBBY-EXCEPTION-ADOPTION-RECORD.md`](NMI-G1-HOBBY-EXCEPTION-ADOPTION-RECORD.md), makes **D4 satisfied by exception D4-X** and reconciles the P3 fallback prerequisite, **only when** its PR has passed independent exact-HEAD review, both required hosted CI workflows have passed at its final head, the owner has given a new explicit merge approval, **and the merge has been completed on GitHub and verified**. It applies to the one approved Hobby deployment and timebox only; the original requirement is preserved for every other case. **G1 stays OPEN:** E2 to E6, D1 to D3 and D5 are unchanged, E7 stays pending, and G4, G5, G6 and G7 stay OPEN. G8 continues and Gates A, B and C stay NOT AUTHORIZED. No resource creation, first build, release SHA, public URL, provider call, spend beyond $25 or deletion is authorized.
