# NMI-G1 — Render hosting cost and teardown approval packet

**Status:** documentation and read-only assessment; **G1 remains OPEN**. Draft PR `docs/nmi-g1-render-cost-teardown`, based on `main@0e10e8d1f6d521bba9b0c503f4ce0fdf188ded19` (P7 PR #45 merged). **UI design gate:** Not applicable (documentation only).
**Objective:** give the owner one decision packet for the proposed Hobby, Starter web and PostgreSQL 16 Basic 256 MB configuration, with a conservative forecast through 2026-12-15, backup, retention and teardown procedures, and the exact G5 and G7 decisions, without changing any gate.
**Allowed files:** `docs/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md`, this task, `docs/STATUS.md`, `docs/HANDOFFS.md`, a status note in `docs/NMI-RENDER-P4-RELEASE-READINESS.md` and the P7 task status line.
**Forbidden scope:** application source, migrations, lockfiles, workflows, dependencies, secrets; a release branch or SHA; Render provisioning, billing action or API call; deployment; enabling OpenAI or PayPal; deleting anything.
**Acceptance:**
1. The post-P7 status is reconciled and historical handoffs and audit evidence are preserved.
2. The packet separates fixed charges, run-on risk, tax and unknowns, and labels what is verified versus carried or unknown.
3. G1, G4, G5, G6, G7 stay OPEN and G8 continues; Gates A, B and C stay NOT AUTHORIZED.
4. Required hosted CI passes at the exact final head, and an independent documentation review is requested.
