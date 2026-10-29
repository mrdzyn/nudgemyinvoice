# NMI-RENDER-P2 — Mrdzyn staging configuration and cost-approval packet

**Status: PREPARED, NOT AUTHORIZED TO PROVISION.** Prepared 2026-10-29. This document contains **no actual prices from Mrdzyn billing, credentials, deployment or mutable Render configuration**. It is a read-only pre-provisioning proposal, not an approval or a runbook execution record.

- **Product:** NudgeMyInvoice, provider-disabled, single-operator hackathon demo.
- **Repository:** `mrdzyn/nudgemyinvoice`, [GitHub](https://github.com/mrdzyn/nudgemyinvoice).
- **Approved code candidate:** `main@652cf702fd93b05a9b9d64ee9b4c2151c30833b2` (owner squash merge of independently audited P1/preflight PR #22; original P1 implementation merged via PR #21).
- **Render destination (user selected):** workspace name **Mrdzyn**, confirmed Render workspace ID `tea-dbgnjq1srm7s73ebcq2g`.
- **Read-only Render inspection at preparation:** `list_workspaces` returned one workspace named Mrdzyn. `list_postgres_instances` said **No Postgres instances found**. `list_services` returned `null`, **not sufficient to prove zero services**. The connected tools do not expose workspace plan or billing forecasts. **Owner-supplied Render Billing screenshot (2026-10-29) confirms $50.00 Hackathon Participant promotional credit expiring 2027-10-01, no pending charges and no past invoices.** The owner now identifies the workspace as **Hobby** and provided its **Monthly Included Usage** screenshot (750 free instance-hours, 5 GB outbound bandwidth, two custom domains, 25 allowed services, 500 build pipeline minutes; all counters at zero). This supports a Hobby-first proposal; the screenshot itself is from Included Usage, not the Plan tab, so the plan should be rechecked at creation. Whether the promotion offsets Pro subscription/compute/storage remains **UNKNOWN**. **Do not claim credits will cover any specific charge.**
- **Current approval scope:** PREPARE ONLY. The owner expressly requires separate review and written approval of **actual Mrdzyn charges** before provisioning anything. Proposed upper spending figures (including previously discussed $85) are **not** authorized and are **not enforceable automatic budget caps**.
- **External/provider gates:** OpenAI Gate A, PayPal Gate B and combined Gate C are **NOT AUTHORIZED**. Historical one-create Sandbox smoke budget stays exhausted. No live provider access, credentials or calls.
- **Authoritative implementation/ops:** `docs/NMI-RENDER-P1-RUNBOOK.md` and `docs/NMI-RENDER-P1-PREFLIGHT-EVIDENCE.md`; this packet adds specific cost/approval restrictions, and does not supersede security/runbook gates.

## 1. Proposed resources (not created)

| Field | Web | PostgreSQL |
| --- | --- | --- |
| Name (proposed; confirm free) | `nudgemyinvoice-staging-web` | `nudgemyinvoice-staging-pg` |
| Workspace | Mrdzyn (`tea-dbgnjq1srm7s73ebcq2g`) | Same |
| Region | Singapore | Singapore |
| Resource type | Node.js web service | Managed Render PostgreSQL |
| Plan ID | `0.5c-512mb` (512 MB, 0.5 CPU) | `0.1c-256mb` (256 MB, 0.1 CPU) |
| Database version | n/a | PostgreSQL **16** |
| Storage | none | **1 GB** initial allocation; disable storage auto-scaling |
| Count | **1 instance**, no horizontal autoscaling | **1 database**, no replicas or additional disks |
| Source | linked GitHub `mrdzyn/nudgemyinvoice`, branch `main` | Render-managed |
| Auto deploy | **OFF**; no PR previews, no Blueprint | n/a |
| Health probe | `/health` | managed |
| Exposure | public HTTPS endpoint **but authenticated access only**; URL must not be shared during QA | prefer internal connection from web; external owner-only maintenance TLS and temporary IP allowlist |
| Pre-first-deploy action | exact `WEB_ORIGIN` and runtime secrets must be set before functional acceptance | owner-run 0000–0006 migrations; create least-privilege `nmi_runtime`, grants, operator |

**Security clarification:** a Render **Web Service has a publicly reachable URL**, so “private staging” here means *unshared, password-protected owner QA*, **not private-network isolation**. Do not treat secrecy of the URL or a single shared judge login as an access-control boundary. Do not invite judges or publish a URL until explicitly authorized after real live QA.

**Initial deployment caution:** Render's standard New Web Service flow starts a **first build/deploy when created**, even when future Auto-Deploy is set to OFF. The connected Render create-service tool accepts a branch and `autoDeploy=no`, but does not pin an exact SHA for creation or guarantee avoiding initial deployment. Therefore **DO NOT invoke any Render create tool** during this preparation phase. After owner resource and price approval, explicitly plan initial deployment with prefilled safe configuration and an owner-approved pinned SHA. Check for source SHA and all secrets before exposing any functional endpoint; if this cannot be assured, STOP and revise the setup process before using the create tool.

## 2. Public list prices (not actual account charges)

Official sources checked 2026-10-29:
- [Render pricing](https://render.com/pricing): Pro workspace **$25/month**, web `0.5c-512mb` **$7/month**, PostgreSQL `0.1c-256mb` **$6/month**; compute can be prorated. Includes 1 GB Postgres SSD storage; additional storage quoted at **$0.30/GB**.
- [Render logging](https://render.com/docs/logging): platform HTTP request logs are available only to **Pro workspace or higher**; request URLs are logged.
- [Render dashboard billing](https://render.com/docs/render-dashboard): Billing page shows actual current plan, past invoices and accrued charges.
- [Render PostgreSQL setup](https://render.com/docs/postgresql-creating-connecting): PG16, region and 1-GB storage are selectable; expansion cannot later be shrunk.

| Scenario | Indicative recurring baseline (USD/month) | Staging trade-off |
| --- | ---: | --- |
| **Hobby + Free web + Free PostgreSQL** | **$0** for free compute | Free web sleeps after 15 minutes idle (roughly 1-minute cold start), Free PostgreSQL **expires 30 days after creation**, 1 GB, no managed backups; Pro-only Render HTTP request-log acceptance gate unresolved |
| **Hobby + Free web + paid PostgreSQL** | **$6** DB compute | Durable paid DB; web still spins down; platform HTTP-log gate unresolved |
| **Hobby + paid web + paid PostgreSQL** | **$13** ($7 + $6) | Avoids web cold starts and free DB expiration; platform HTTP-log gate unresolved |
| **Pro + paid web + paid PostgreSQL** | **$38** ($25 + $7 + $6) | Can verify native platform HTTP request logs; promotion's applicability to Pro fee remains unverified |

These are public *baseline* prices, **not Mrdzyn quotes**, and do not include usage overages, taxes, proration or additional storage. The included **750 hours are for Free web instances only**, not a subsidy for paid compute. The **25 services** allowance is a workspace limit, not 25 paid services free of charge. Render's free Postgres **30-day expiry makes it incompatible with the existing 2026-12-15 lifespan** unless an owner-approved upgrade, new disposable rebuild or shorter lifespan is selected. Free instances are not a production or guaranteed-uptime hosting model.

**Security trade-off / NON-WAIVER:** Hobby can run the application, but Render's native **platform HTTP request logs require Pro or higher**. App-origin logs plus an external HTTPS client probe can offer useful supporting evidence but **cannot prove what Render's own request-log pipeline records**. The current P1 runbook's native-log verification therefore remains **BLOCKED/NOT VERIFIED** on Hobby. Do not silently mark it PASS or share the judge URL under the old acceptance contract. Any revised Hobby acceptance must be a separate, explicitly owner-approved and independently reviewed evidence plan.

**Important:** these are published standard **list rates only**; current workspace plan, Pro fee applicability and an actual incremental quote were not available through the connector. The owner supplied an account screenshot with **no pending charges and no past invoices** at capture, but that does not price future resources. These are **not** firm quotes, a guarantee of no overages or proof that promotional credits offset workspace subscription, DB storage or compute. Render charges can span more than one billing cycle before the intended **2026-12-15** teardown. Even a requested hard maximum (for example $85) cannot be claimed as enforced until an actual billing/limiting mechanism is reviewed. No Pro upgrade or paid resource is permitted under this document.

### Verified promotional credit (2026-10-29)

The user supplied a screenshot of **Mrdzyn → Billing → Credit Balance** showing:

- **Total promotional credit:** **US$50.00** (Hackathon Participant, one promotion).
- **Expires:** **October 1, 2027**; displayed as $50 credit, expires after 12 months.
- **Pending charges:** none shown.
- **Invoice history:** no past invoices shown.
- **Not shown in the screenshot:** **current workspace plan**, Pro subscription price on this account, whether promo credit applies to workspace fees, supported PostgreSQL backups/PITR, tax and other overage forecasts. All remain **unverified**.

At published list prices, if a **new Pro** workspace ($25) plus web ($7) plus database ($6) are *all credit-eligible*, the simple steady-state baseline is **$38/month**; $50 then covers about **1.3 months**, before tax/overages/proration. The user has **not approved** that $38 plan, and credit use has **not** been proven for Pro. The owner identifies Mrdzyn as Hobby; on Hobby, **$0/month** Free web + Free PG is a valid **short-lived prototype** option subject to the 30-day PG deadline and Pro-only logging gap, whereas **$6/month** Free web + paid PG offers persistence without upgrading the workspace. Neither option has been selected or provisioned.

**Approval rule:** Do **not** upgrade the workspace or create paid resources until account-specific plan and credit coverage are confirmed and the owner approves the actual prospective charges and a bounded total spend. Only $50 in promotion is supported by evidence, not an $85 credit allowance.

### Hobby included-usage screenshot (2026-10-29)

Owner identified **Mrdzyn as Hobby**, and supplied **Billing → Included Usage** showing 0 of 750 monthly Free instance-hours used, 0 of 5 GB bandwidth, 0 of 2 custom domains, 0 of 25 services and 0 of 500 pipeline minutes. This is a report of *usage and quotas*, **not** proof that any paid service compute or a Pro plan is included. The credit balance remains **US$50**, expiring **2027-10-01**.

**Recommended next decision for the owner:** choose between (A) zero-baseline-cost temporary Hobby Free+Free test strictly for short-lived smoke QA with no native HTTP log PASS; (B) Hobby Free web + $6/month paid PG if persistent synthetic data is essential; (C) owner-approved Pro for the original native-log acceptance plan. Any plan choice requires an explicit approval before creating resources, even Free resources.

## 3. Owner must supply actual billing facts (no secret values)

Open **Render Dashboard → select Mrdzyn workspace → Billing** and privately inspect the following; share only non-sensitive figures/plan names or a sanitized screenshot (no payment method, card digits, invoice addresses, tokens or passwords).

| Required fact | As of 2026-10-29 | Approval condition |
| --- | --- | --- |
| Mrdzyn workspace plan | **Owner reports Hobby ($0/month workspace fee); Included Usage screenshot consistent but does not show Plan tab** | Verify in Plan before provisioning; Pro upgrade not authorized |
| Promotional credit balance and expiry | **$50.00, expires 2027-10-01 — confirmed in owner-supplied Billing screenshot** | Not a spend authorization or indication of recurring-credit renewal |
| Eligible charges covered by this promotion (Pro plan vs compute/DB/storage) | **UNKNOWN** | Verify applicability with Render before approving a Pro upgrade or charges |
| Billing screenshot's pending charges and invoice history | **No pending charges; no past invoices (as captured 2026-10-29)** | Check again immediately before any resource creation; other services still unconfirmed |
| Estimated web compute, DB compute, storage, tax, bandwidth/build overages | **ESTIMATE ONLY** | Reconcile plan selection to live dashboard quote and billing basis |
| Price exposure from provisioning date to teardown (target 2026-12-15) | **UNKNOWN** | Record full period and billing cycle boundaries; no auto-expiration assumption |
| PostgreSQL backup/PITR, retention and access-level rights | **UNKNOWN** | Check plan support and who can create `LOGIN` roles; no superuser assumption |
| User-approved total incremental budget and response if expected billing increases | **NOT GRANTED** | Specific upper bound and **STOP-before-spend** rule to be explicitly approved |

If any necessary figure cannot be verified using the actual Mrdzyn billing dashboard and plan selection, **do not proceed**. Resource creation incurs costs; do not treat GitHub approval, connector installation or this packet as permission.

## 4. Prepared web service configuration (not submitted)

**Important:** The table below is the earlier *paid-service/Pro-compatible* candidate, **NOT** a decision to purchase it. For a separately approved Hobby Free-web alternative, change web plan to `free` and, if short-lived disposable testing is accepted, DB plan to `free`. Those changes affect cold starts, 30-day database lifetime and the unresolved native-log gate; do not silently switch plans on creation.

| Setting | Proposed value |
| --- | --- |
| Repository | `https://github.com/mrdzyn/nudgemyinvoice` |
| GitHub branch | `main` with **pin verified SHA** `652cf702fd93b05a9b9d64ee9b4c2151c30833b2` |
| Region | `singapore` |
| Runtime | `node` |
| Instance | `0.5c-512mb` |
| Build command | `pnpm install --frozen-lockfile --prod=false && pnpm --filter @nmi/web build` |
| Start command | `pnpm --filter @nmi/api start` |
| Auto-Deploy | **NO** |
| Preview environments | **OFF** |
| Instance count | **1**; no autoscale |
| Health path | `/health`; note this doesn't check DB availability |
| Node + pnpm | Node **>=22**, pinned `pnpm@10.28.0`; verify runtime availability |
| GitHub PR preview | none; no `render.yaml` |
| Domain | Render-provided `onrender.com`; **verify actual hostname before setting `WEB_ORIGIN`** |
| External sharing | **NO** |

Proposed **non-secret** environment names and safe values:
- `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT` supplied by Render.
- `WEB_ORIGIN` = exact generated HTTPS origin, not a guess; fail startup if not configured.
- `TRUST_PROXY=1` as *provisional*, then verify real hop behavior with spoofed XFF/rate-limit test; use a bounded count or safe fallback `false`, never `true`.
- `PAYPAL_ENV=sandbox`; `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com`; `PAYPAL_DRAFTS_ENABLED=false`.
- **ABSENT:** `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL`, all synthetic-evaluation switches, any production credentials or customer records.
- **Secret only via Render secret store:** `SESSION_SECRET` random >=32 chars and `DATABASE_URL` for **nmi_runtime** role only; never a DB-owner credential on the web service. No secret values in GitHub or the assistant response.

**DB-only owner operations, after provisioning is separately approved:** follow P1 runbook §5 with 0600 temporary `PGPASSFILE`, non-secret `PG*` args, secure interactive `\\password nmi_runtime`, migrations 0000–0006 and grants; actual `provision-operator` CLI via passwordless URL and the pinned `pg@8.23.1`. PR #22 proved the CLI only with disposable SCRAM Postgres and local non-TLS; real Render DB TLS and role creation remain unverified.

## 5. Execution order AFTER separate owner approvals (none granted yet)

1. **Owner billing inspection and cost sign-off:** actual plan, credits, costs, taxes, storage, expected lifespan, and proposed spending cap — reviewed before any plan upgrade or resource creation.
2. **Owner provisioning approval:** named Mrdzyn workspace, plan and region, explicit maximum cost and abort criteria. Render account connector must not assume implicit permission.
3. **Create managed PG16** only with approved plan/storage, no autoscale/replicas. Verify DB status, role-creation rights, backup/PITR, remote TLS, maintenance access; stop if not satisfied.
4. **Prepare schema/roles safely** through owner-only session and temporary password file; never run web API with DB owner. Apply migrations and role grants and create a single synthetic operator using the CLI, with sanitized evidence.
5. **Create web only with approved initial deployment path**, auto-deploy OFF, pinned code and provider-disabled environment. The web resource may start initial deploy on creation; verify all preconditions and actual SHA; stop if workflow would deploy an unapproved tip.
6. **Owner-only live HTTPS QA:** `/health` JSON, React shell and SPA fallback, API non-fallback, headers/CSP/HSTS, secure `__Host-` cookie, login/CSRF/Origin/logout, synthetic manual invoice/search, same-origin POST body containing a synthetic marker, query marker **absent** from Render HTTP *request* logs and app logs, denial of PayPal draft create/zero provider calls, XFF spoof/rate-limit behavior, least-privilege DB operations, service count and resource/credit meter.
7. **Independent release report + owner approval before any URL sharing.** No automatic judge access, customer imports, Devpost publication or real AI/payment traffic.
8. **End-of-test teardown by 2026-12-15 or earlier owner instruction:** revoke sessions, delete/revoke secrets/roles as applicable, delete paid web+DB resources with separate owner authorization, review final invoice and credit deductions. Never presume resources auto-expire.

## 6. Decision record / approval request — NOT answered

**Current authorized action:** prepare docs and inspect publicly published pricing and read-only account metadata; do not provision/upgrade/deploy/charge.

Before an owner can grant a bounded next step, request confirmation of:

- Mrdzyn is **owner-reported Hobby** with no workspace monthly fee. Should staging remain Hobby (with explicit disposition of the Pro-only native HTTP request-log gate), or should a separately approved `$25/month` Pro upgrade be considered?
- Confirmed **$50 promotional credit expiring 2027-10-01**; still need what charge types it covers (particularly the $25 Pro subscription), and projected post-charge balance.
- Choose Free web/Free PG vs Free web/paid PG vs paid web/paid PG on Hobby vs Pro; decide whether a short-lived 30-day Free DB window is acceptable or if persistence **through 2026-12-15** is required. Confirm the approved incremental ceiling for the chosen timeline, including taxes, storage, bandwidth, fees and a stop threshold.
- Whether staged public HTTPS access is acceptable for *owner-only* authenticated QA; external sharing will be a later separate approval.

Suggested written approval **only after** those values are filled and owner accepts:
> I approve provisioning in the Mrdzyn Render workspace, limited to one Singapore Node web service (0.5c-512mb) and one Singapore PostgreSQL 16 database (0.1c-256mb, 1 GB, storage autoscaling off), with the *account-verified* monthly/incremental prices and a total approved incremental spend of [AMOUNT] through 2026-12-15. Any Pro upgrade [YES/NO] is separately approved in that amount. Stop before additional charges, changing plans, expanding storage, deploying different code or enabling providers. Staging is single-operator, synthetic-only, auto-deploy off, based on audited SHA 652cf702; do not share URLs or call OpenAI/PayPal. All additional provisioning operations require explicit step approval.

**Gate status:** No deployment/provisioning authorization; PayPal/OpenAI Gates A/B/C remain NOT AUTHORIZED; owner merge authorization for this docs-only PR is also separate.

## References

- https://render.com/pricing
- https://render.com/docs/logging
- https://render.com/docs/render-dashboard
- https://render.com/docs/compute-plans
- https://render.com/docs/postgresql-creating-connecting
- `docs/NMI-RENDER-P1-RUNBOOK.md`
- `docs/NMI-RENDER-P1-PREFLIGHT-EVIDENCE.md`
