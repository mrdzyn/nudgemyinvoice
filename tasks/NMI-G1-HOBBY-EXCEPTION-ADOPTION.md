# NMI-G1-HOBBY-ADOPT — Adoption record for the Hobby owner-only teardown exception

**Status:** documentation only. Draft PR on `docs/nmi-g1-hobby-exception-adoption`, based on `main@6d16f45a95d1cafecb3aca2ac047ce7daab912ee` (PR #48, the proposal, independently audited PASS and squash-merged). **G1 stays OPEN.** The exception becomes effective **only** when this PR has passed independent review **and** the owner explicitly approves its merge. **UI design gate:** Not applicable (documentation only).

**Objective:** record the owner's reported 2026-11-06 ratification and reconcile the P3 pre-provisioning fallback condition and the G1 packet §6 D4, §5 E7 and §11 with the narrowly scoped, ratified exception, without rewriting any earlier decision and without changing the $25 authorized ceiling.

**Allowed files:** `docs/NMI-G1-HOBBY-EXCEPTION-ADOPTION-RECORD.md` (new), this task, `docs/NMI-RENDER-P3-25-BUDGET-GATE.md` (additive section only), `docs/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md`, `docs/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md` (status references only), `docs/STATUS.md`, `docs/HANDOFFS.md`.

**Forbidden scope:** application source, migrations, scripts, dependencies, lockfiles, workflows, secrets; a release branch or SHA; Render provisioning, billing action or API call; a first build or deployment; enabling OpenAI or PayPal; a public judge URL; spending beyond $25; deleting anything; fixing issue #49; inventing an owner-authored GitHub statement.

**Acceptance:**
1. The record states the owner's ratification as an **owner-reported decision made in conversation on 2026-11-06**, not as a GitHub comment by the owner.
2. P3 is reconciled by an **additive** section that changes only the independent-fallback prerequisite, for this one deployment, and leaves the 2026-11-04 approval text and every financial restriction intact.
3. G1 packet §6 D4, §5 E7 and §11 are updated together. D4 is satisfied by the exception **on merge**; E7 stays pending (D5 and the rest of the teardown plan); G1 stays OPEN.
4. The exception is **not** effective before an independent PASS and the owner's explicit merge approval, and the record says so.
5. Both required hosted CI workflows pass at the exact final head, and an independent review precedes any owner merge.
