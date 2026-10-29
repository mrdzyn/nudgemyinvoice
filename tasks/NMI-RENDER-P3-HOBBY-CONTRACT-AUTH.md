# NMI-RENDER-P3 — Hobby privacy-evidence contract and separate unsigned provisioning approval

**State: DOCS PREPARED FOR INDEPENDENT AUDIT — NO CLOUD AUTHORIZATION.**
**Base `main`:** `18b86c1ad2eeef14deec2b7a50a03232c39d4f05` (owner-authorized squash merge PR #23).
**Branch:** `docs/nmi-render-p3-hobby-evidence-authorization`.
**Active handoff:** `NMI-RENDER-P3-CONTRACT-AUTH-PREP`.
**UI design gate:** Not applicable (documentation only).
**Selected configuration:** Mrdzyn Hobby; Singapore; Free Node web and Free PostgreSQL 16 (1 GB); intended for short-lived PayPal hackathon judge review; $0 published compute baseline, not a no-overage guarantee.
**Deployment source candidate:** audited `652cf702fd93b05a9b9d64ee9b4c2151c30833b2`; future `release/nmi-render-judges-2026` branch explicitly **NOT CREATED** in this task.

## Objective and scope

Prepare exactly two logically separate, unsigned controls:
1. `docs/NMI-RENDER-P3A-HOBBY-PRIVACY-EVIDENCE-CONTRACT.md`: independent, reproducible, *testable* criteria for what Hobby can demonstrate about POST search URL privacy and associated security boundaries; mark Render-owned HTTP request logs unavailable/NOT OBSERVABLE; define test negatives, sanitized evidence, no-PASS-on-missing-data policy, independent reviewer and owner-specific risk acceptance prior to judge URL distribution.
2. `docs/NMI-RENDER-P3B-PROVISIONING-AUTHORIZATION.md`: future **UNSIGNED** owner authorization that distinctly gates pinned release-branch creation, actual billing/overage decision, Free PG create, Free web create (which may deploy immediately), owner-only QA, residual edge-log risk and judge URL sharing. Not all gates are implied by any one consent.

Update `docs/STATUS.md` and append only the active `NMI-RENDER-P3-CONTRACT-AUTH-PREP` handoff in `docs/HANDOFFS.md`. No edits to P1/P2 runbook or production code in this task; P2 precedence continues.

## Hard constraints

- **NO** Render create/update/configure/deploy/upgrade/secret operation; NO GitHub release branch creation; NO provider calls, real PayPal/OpenAI keys, live judge traffic, email/URL publication or Devpost submission.
- **NO** change to app code, migrations, grants, tests, build, CI, cloud config, branch protection, policy gates or account billing.
- No transfer of cookies, secrets, raw HAR, session tokens, customer data or private billing identifiers to PR or chat. Public contract can include only *synthetic* test examples.
- No actual owner signature, approval, live test results, waiver or cost cap may be fabricated. Gates A, B, C remain NOT AUTHORIZED; historic PayPal Sandbox one-create budget remains exhausted.
- Current P1 runbook paid-DB, Dec15 and Pro HTTP-log claims are superseded by P2 only for the chosen Free judges configuration; preserve all other controls.

## Acceptance criteria

1. Contract explicitly states that Hobby **cannot verify Render's platform-generated HTTP request log contents**, and that app/browser/simulated ingress evidence is neither complete nor equivalent. Missing edge logs stay NOT OBSERVABLE even if owner later accepts residual risk.
2. Runnable future owner-only tests cover: fixed POST search path, legacy GET rejection and local negative control, live browser/network metadata and sanitized application logs; HTTPS/session/CSRF/Origin/CSP, XFF spoof/limiter, least-privileged DB role, zero-provider guard, Free expiration/cold starts and safe judge access. Each test is either PASS/FAIL/NOT TESTED/NOT OBSERVABLE.
3. Evidence capture protects cookies/CSRF tokens, secrets, PII, full HAR and query bodies from public GitHub; test failures remain blocking.
4. Separate unsigned authorization requires cost/overage/payment-method verification, deadline within Free PG 30-day lifetime (no backups), explicit distinct permission for release branch, DB creation, first web create/deploy, no Pro/paid resource, independent privacy acceptance, separately approved judge URL.
5. Docs distinguish selection vs resource creation vs first deploy vs QA vs residual-risk acceptance vs sharing vs teardown. No form template is itself an executable approval.
6. Required PR CI runs against exact HEAD. Independent reviewer audits docs-only diff, remaining residuals and status accuracy before owner decides merge.

## Targeted validation

- Review docs for contradictory PASS, fake signed approval, assumed $0 hard cap, unspecified release SHA or outdated P1 paid/pro-logging requirements.
- Compare `main` to the branch: only the two new contracts, this task, STATUS and HANDOFFS may change.
- GitHub-hosted Project Baseline and Stack CI required for any merge. Validation not run = NOT TESTED, never PASS.

**Next human decision, AFTER independent audit of Draft PR:** whether to squash-merge the docs; this does **not** authorize any Render or GitHub release-branch action.
