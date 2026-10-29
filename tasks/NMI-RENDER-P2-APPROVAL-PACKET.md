# NMI-RENDER-P2 — Mrdzyn staging configuration and actual-charge approval

**State: PREPARATION ONLY.** The owner confirmed using the connected **Mrdzyn** Render workspace, and explicitly required **approval of actual charges before anything is provisioned**. No provisioning authorization has been granted.

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
