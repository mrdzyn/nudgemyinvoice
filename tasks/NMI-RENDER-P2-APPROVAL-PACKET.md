# NMI-RENDER-P2 — Mrdzyn staging configuration and actual-charge approval

**State: CONFIGURATION SELECTED, PREPARATION ONLY.** The owner selected **Mrdzyn Hobby + Free web + Free PostgreSQL 16** ($0 published compute baseline) **for PayPal hackathon judges**. The owner previously required separate approval of actual billing/overage exposure **before anything is provisioned**; that requirement is unchanged. **No resource creation, initial deploy, judge sharing, provider call, native-log evidence waiver or cost approval is granted by this selection.**

**Base `main`:** `652cf702fd93b05a9b9d64ee9b4c2151c30833b2` (owner squash merge of audited offline preflight PR #22).  
**Branch:** `docs/nmi-render-p2-staging-approval` — Draft PR, documentation only.  
**Active handoff:** `NMI-RENDER-P2-APPROVAL-PREP`.  
**Design gate:** Not applicable, no UI change.  
**Output:** `docs/NMI-RENDER-P2-STAGING-APPROVAL-PACKET.md`.

## Deliverable

- Read existing security and release policies, P1 staging runbook and preflight evidence.
- Confirm current verified repository SHA and connected Render workspace. Query **read-only** resources only; report `null`/unavailable without guessing.
- Verify current public Render pricing, the Pro HTTP-request-log requirement, expected PostgreSQL storage and plan choices.
- Prepare exact prospective service/database configuration and provider-disabled environment matrix, without storing actual secrets and without creating `render.yaml`/auto-deploy or cloud resources.
- Explain distinction between published list prices and actual workspace-specific charges; show current plan, credits, expiry, credit applicability, accrued charges and tax as **UNKNOWN until verified in Render Billing**.
- Document necessary owner approval for any workspace upgrade, database/web creation, first build/deploy, use of credits, real QA, URL sharing and eventual teardown.
- Correct `docs/STATUS.md` from preflight-draft/unaudited to PR #22 merged and P2 planning only. Append the active handoff to `docs/HANDOFFS.md`.

## Acceptance

1. Documentation names confirmed Mrdzyn workspace, audited `main` commit and region/resource candidates; no secrets.
2. Pricing clearly marked as public list rates, **not actual account quote**; no authorization or hard billing cap inferred.
3. A stop-before-provision step captures the real credit/plan/actual-charge review and explicit owner approval.
4. Documentation reflects limitations: Render Web Services publicly reachable, auto-deploy off does not prevent the initial build on creation, no platform HTTP request logs on Hobby, real Render TLS/proxy/Postgres rights not verified.
5. No code, permissions, providers, migrations, grants, runtime secrets, deployment files, Render resources, billing plan, live URLs, published artifacts or CI policy changed.
6. Submit docs-only Draft PR and await independent review and owner decision. Mandatory hosted CI still required to pass for a future merge.

**Stop:** If exact charges cannot be read via the connector, document what the owner needs to inspect in Dashboard → Mrdzyn → Billing. **Do not try to provision as a way of discovering prices.**

**Gates A (OpenAI), B (PayPal), C (combined): NOT AUTHORIZED.** Render provisioning/deployment/sharing NOT AUTHORIZED.

## Owner selection recorded — 2026-10-29 (not a release authorization)

- **Selected resource options:** Free Node.js Web Service and Free PostgreSQL 16 (1 GB), Singapore, one of each, in Mrdzyn **Hobby**; no Pro or paid resource. Published compute baseline $0, not a guarantee of $0 overage/other charges. Confirm actual Free plan labels before any eventual create.
- **Audience:** judges after owner-only QA and separate authorization to share a password-protected URL; judges must not see provider claims beyond the tested manual/offline path. Single shared-operator app means no per-judge isolation; require safe credential distribution and reset/rotation or supervised demos.
- **Hard limits:** Free web sleeps after 15 minutes inactivity and cold start may be ~1 minute; Free PG expires after 30 days, has no managed backups or managed pooling, may be unavailable for maintenance, and is capped at 1 GB. Confirm actual judging period plus teardown before PG expiry. Earlier Dec 15 persistence assumption is NOT met by the selected Free plan; no production or customer data permitted.
- **Unresolved Pro-only HTTP logs:** Native Render edge request logs unavailable on Hobby. Existing P1 privacy/edge-log acceptance step remains NOT VERIFIED; an independently reviewed alternative evidence contract plus explicit owner acceptance is required before judge URL sharing. Do not silently waive it.
- **Cost controls:** User screenshot confirms $50 credit expiring Oct 1, 2027 and Hobby monthly included quotas (750 Free hours, 5 GB bandwidth, 500 pipeline minutes). Overages may still be billed; no resource creation/initial deployment until the owner sees actual checkout settings, overage terms and grants bounded provisioning/billing approval.
- **Execution warning:** Render may initiate the first deploy at service creation even with Auto-Deploy OFF; tool does not pin initial SHA. Source is a future owner-created branch `release/nmi-render-judges-2026` at exactly `652cf702…` (packet §1A; not created here); verify branch HEAD before and the deployed SHA after the first deploy, STOP on mismatch; provider-disabled secrets and independent HTTPS QA. P2 overrides P1's paid-DB/Dec-15/Pro-log requirements for this configuration (packet §1B). Do not add Blueprints, paid add-ons, secrets to Git or external services.
- **Authority:** selection only. No provisioning, deploy, merge, publication, judge access, provider Gates A/B/C or financial charges authorized.

## Remediation FIX1 — audit PR #23 comment 6500483434 (docs only)
MAJOR-1 deployment source mechanism (§1A); MAJOR-2 precedence (§1B, runbook banner, STATUS); MINOR-1 stale Dec-15/$85 wording; MINOR-2 header; MINOR-3 complete teardown checklist and mandatory judge reset/supervised-access criterion; MINOR-4 in-memory throttling and credential rules; INFO: 14-day grace recorded but not relied on, payment-method row added, workspace ID removed. Release branch NOT created; nothing provisioned.
