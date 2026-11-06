# NMI-G1 — Render hosting cost and teardown approval packet (owner decision packet)

**Status (2026-11-06): G1 is OPEN. This is a read-only assessment and documentation packet.** It approves nothing and spends nothing. No Render resource, release branch or release SHA exists, no Render API or connector call was made, no charge was incurred, and no provider was enabled. G1 closes only when **the owner** supplies actual Billing evidence (§5) and approves the teardown plan (§7). Base: `main@0e10e8d1f6d521bba9b0c503f4ce0fdf188ded19`.

## 1. What is verified and what is not

| Item | State | Source |
|---|---|---|
| Hobby workspace, Starter web, PostgreSQL 16 Basic 256 MB, 1 GB storage, autoscaling OFF as the proposed shape | Proposed by owner and recorded in P3; **not created** | `docs/NMI-RENDER-P3-25-BUDGET-GATE.md` |
| List prices: Starter web $7/month, Basic 256 MB $6/month (about $13/month); no extras | **Carried from P3 (checked 2026-11-04). Not re-verified for this packet:** the pricing page returned no figures to the fetch tool today. The owner confirms them at checkout. | P3 |
| Billing is **prorated by the second** | Verified 2026-11-06 | Render FAQ |
| Bandwidth: a monthly allowance shared across services; overage is billed. Build pipeline: a monthly allowance of minutes. | **Amounts and overage rates NOT FOUND** (the FAQ points to the pricing page). Treated as unknown. | Render FAQ |
| Whether a suspended service, or a suspended paid database, keeps billing | **Not stated** in the pages read. Assume the database keeps billing until deleted. | Render FAQ |
| Hobby: point-in-time recovery for 3 days; logical backups kept 7 days, regardless of plan; a logical export is created on the database's Recovery page and downloads as `.dir.tar.gz`; a point-in-time restore creates a **new** instance | Verified 2026-11-06 | Render Postgres backups doc |
| Backups and recovery are unavailable on the Free compute plan | Verified | same |
| What happens to backups when a database is deleted | **Not stated.** Treat the owner's private export as the only surviving copy. | same |
| Promotional credit: $50 expiring 2027-10-01 | Owner screenshot of **Oct 29**; **the current balance, eligible categories, tax treatment and charges are unverified** | STATUS, P3 |
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

- **Bandwidth overage:** the allowance and overage rate were not found. Supervised judging uses a small amount of traffic, so $0 is expected, but **unverified**.
- **Build pipeline minutes:** the allowance and price were not found. Expect about 4 to 6 builds: the first build at creation, one redeploy after setting `WEB_ORIGIN`, and a few fixes. Whether that is inside the allowance is **unverified**. The owner can set Render's build-pipeline spend limit as a guard.
- **Extra storage:** none, with 1 GB and autoscaling OFF. A Blueprint can default to a larger disk, so none is used.
- **Any charge not covered by credits** (for example tax, or a category the credit does not cover) would be out of pocket. Credit applicability to each resource is unverified.

### 3d. Conservative planning figure

**About $20.00** (5-day teardown slip plus an illustrative 9% tax), **before** any bandwidth or build overage. That leaves about **$5.00** of headroom under the $25 ceiling for those unknowns. The rules that keep it inside the ceiling are the same as P3 and P4 §8:

1. Delete the paid resources on 15 Dec. The ceiling is not safe past about **25 December** once tax is counted.
2. Check Billing at C0 to C6, and at the same time record each charge against the forecast.
3. Warn the owner at a projected **$20**. At a projected **$25**, or any charge not covered by credits, suspend the web service and stop, with no new resources and no upgrade.

## 4. Credits: assumptions to confirm (not assumptions to rely on)

1. A $50 credit expiring 2027-10-01 exists (Oct 29 screenshot).
2. It applies to Starter compute **and** PostgreSQL **and** any bandwidth or build overage (unconfirmed).
3. It applies to **tax** (unconfirmed; tax is often not creditable).
4. No pending charges or earlier invoices exist (as at Oct 29).
5. A payment method on file does not mean spending beyond credits is intended: any charge not covered by credits is a stop condition.

## 5. G1 evidence the owner must supply (G1 stays OPEN until this exists)

Redact account identifiers and payment details before sharing; never commit raw screenshots, invoices or card data.

| # | Evidence | Why |
|---|---|---|
| E1 | Workspace Billing page showing the plan is **Hobby** | The cost model assumes it |
| E2 | Current credit balance, expiry and the resource categories it covers | Section 4 items 1 to 3 |
| E3 | Checkout or price preview for the **Starter** web service and the **Basic 256 MB** PostgreSQL 16 | Confirms the list prices |
| E4 | The database storage setting: **1 GB, autoscaling OFF**, no other add-on | Prevents silent storage charges |
| E5 | The build-pipeline minute spend limit if the owner sets one, and the included bandwidth and build allowances read from the pricing page | Fills the unknowns in 3c |
| E6 | A written forecast of at most **$25 including tax**, for the planned teardown date | The G1 requirement |
| E7 | The approved teardown and retention plan (section 7), with the fallback if the owner is unavailable | P3 makes this a precondition for creating anything |

## 6. Decisions the owner must make for G1

| # | Decision | Recommended |
|---|---|---|
| D1 | Confirm the exact configuration in section 2, or change it (any change needs a new forecast) | Confirm as proposed |
| D2 | The teardown date. P3 sets 15 Dec 23:59 Asia/Manila, subject to the official judging end | 15 Dec, or the day judging access ends |
| D3 | The warning level and the stop level | $20 warn, $25 stop, as P3 |
| D4 | Who performs the teardown, and the **fallback** if the owner is unavailable (a named delegate or a scheduled reminder) | Owner, with a calendar reminder on 14 Dec |
| D5 | Where the final export is kept privately, for how long, and how it is destroyed (section 7) | Owner-private encrypted storage, destroyed on a fixed date |

## 7. Backup export, retention, restore verification and teardown (owner-executed; nothing here was run)

An agent runs none of this. **Deleting a service or database is destructive and irreversible and needs separate explicit owner approval at that time; this packet does not grant it.**

### 7a. Before judging (pre-share)

1. After the §9 live checks (P4) pass, create a **logical export** on the database's Recovery page and download the `.dir.tar.gz`. Only one export can run at a time.
2. Verify it as soon as it is downloaded: extract it, then run `pg_restore --list` against it, and restore it into a **new local disposable PostgreSQL 16** database, in a private temporary directory. That is the P7-C drill (`design/evidence/NMI-P7/run-nudge-recovery-drill.mjs`) applied to a real export.
3. Verify the roles on the restored copy: as `nmi_runtime`, `SELECT` works, and `DELETE`, `TRUNCATE`, `CREATE TABLE`, `UPDATE audit_log` and `UPDATE` of `invoice_nudges.ai_message` or `facts` fail with `42501`. Check that `invoice_nudges` is present (migration `0008`).
4. Treat the export as **sensitive**: it holds the operator password hash and application rows. Keep it private; never commit, email or upload it.

### 7b. During judging

Render keeps point-in-time recovery for 3 days and logical backups for 7 days on Hobby. A recovery creates a **new** database instance, so a recovery also means re-pointing `DATABASE_URL` and re-running the role checks above.

### 7c. At judging end (C5 and C6)

1. Take a **final** export and verify it as in 7a (items 2 and 3).
2. Revoke sessions (`UPDATE sessions SET revoked_at = now()` as the owner) and **suspend** the web service. Do not treat this as ending database billing.
3. Decide retention (D5): which copies are kept, where, and until what date; then the destruction method.
4. **Separate explicit owner approval to delete.** Then delete the web service and the PostgreSQL database in the Render dashboard.
5. Confirm in Billing that no resource is running and no further charge is accruing (C6).
6. Remove secrets: delete the Render secret entries, rotate `SESSION_SECRET` and the database credentials, and note that the AG Studio licence key that was held in Render's secret store has been removed. If it was ever exposed beyond accepted use, the only remedy is the vendor's own process (see `docs/NMI-P5-LICENSED-STUDIO-RELEASE.md` §2).
7. Record the outcome privately, with actual charges against this forecast.

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
| G1 | **OPEN** | Section 5 evidence and section 6 decisions. |
| G5 | **OPEN** | Section 8 decision. |
| G7 | **OPEN** | Section 9 decisions. |

## 11. Approvals the owner must give, in order

1. Confirm or amend the section 2 configuration and the section 6 decisions D1 to D5.
2. **G1:** supply evidence E1 to E7, and approve the teardown and retention plan.
3. **G5:** choose A, B or C in section 8.
4. **G7:** answer G7-1 to G7-5 and attach the entitlement record privately.
5. **G4:** choose the release SHA and create the release branch.
6. **G6:** approve resource creation and the first build; then, after the live checks, the URL and judge-access method.
7. Throughout: Gates A, B and C stay off, and deletion needs its own approval at the time.

## 12. How this packet was checked

- `main` verified at `0e10e8d` (P7, PR #45, squash merged); its tree is identical to the independently accepted head `3b5278c`.
- The pricing and backup facts above were fetched on 2026-11-06 from Render's public docs. The numbers that could **not** be fetched are labelled as such, not invented.
- The forecast arithmetic is reproducible: $13 times the prorated month fractions, from 8 Nov. It is not a Render quote.
- The Render connector was not used (it is unauthenticated), no Render API was called, and nothing was provisioned.
