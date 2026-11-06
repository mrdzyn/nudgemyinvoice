# NMI-RENDER-MIG-0008 — Render P1 runbook migration list correction

**State:** documentation-only release-preparation task; no provisioning, migrations or release authorized.  
**Base:** `main@e3b68e83dec899b7aa56afa9be3e8fbf5fd07d62`.  
**UI design gate:** Not applicable.

## Objective
Correct the **manual** Render PostgreSQL bootstrap instructions so that `packages/db/migrations/meta/_journal.json` entries `0000` through `0008` are applied in order, including `0008_mushy_zarek` (`invoice_nudges`), before `packages/db/ops/runtime-role.sql` grants and operator provisioning.

## Allowed scope
`docs/NMI-RENDER-P1-RUNBOOK.md`, this task, `docs/STATUS.md`, append-only `docs/HANDOFFS.md`.

## Forbidden scope
Application or database migration SQL, runtime-role SQL, scripts, tests, dependencies, CI/workflows, real database commands, Render resource creation, paid services, release SHA/branch, deployment, tokens or secrets, enabling PayPal/OpenAI, or modifying accepted G1/G5/G7 gate policy.

## Acceptance
1. P1 runbook's migration range and exact ordered manual loop match the authoritative journal `0000`–`0008`.
2. The operator is instructed to stop on a failed migration and **never** rerun a successfully applied one; `invoice_nudges` existence is verified before the runtime role setup.
3. Documentation states no Render migrations were executed and no deployment authorization or G1 risk exception was granted.
4. A Draft PR targets `main`, required hosted CI is checked on the exact PR HEAD, and independent review precedes any owner merge.

## Active release blockers
The owner prefers **Render Hobby** and retains the **$25 eligible-credit ceiling**. However, Hobby cannot add team members, and the currently merged G1 packet requires an executable independent owner-unavailability fallback. **No fallback or owner-approved exception is yet documented.** G1/G4/G5/G6/G7 stay OPEN and G8 continues. This task does not authorize creating a billable resource, spending credits, or deployment.
