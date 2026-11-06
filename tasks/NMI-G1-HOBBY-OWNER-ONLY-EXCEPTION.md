# NMI-G1-HOBBY-EXCEPTION — Proposed owner-only teardown-control exception

**State:** DRAFT PROPOSAL; **not a granted exception** and **not a deployment authorization**.  
**Base:** `main@e3b68e83dec899b7aa56afa9be3e8fbf5fd07d62` (G1 packet PR #46 squash-merged).  
**Owner direction (2026-11-06):** keep Hobby and the existing $25 eligible-credit budget; **approve preparing** a limited owner-only teardown exception, with disclosure of possible charges exceeding $25 if the owner is unavailable. This does **not** close G1, accept G5/G7, grant extra spend, authorize provisioning or approve deletion.  
**UI design gate:** Not applicable (docs only).

## Objective
Draft an explicit, independently auditable **exception request** to the executable independent owner-unavailability fallback requirement of the merged `docs/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md`. Render Hobby permits just one member, and the proposed one-operator-only deployment cannot otherwise meet G1 D4. Clearly distinguish acceptance of *residual involuntary billing exposure* from **authorization to spend beyond $25**.

## Allowed files
- `docs/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md` (new)
- `docs/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md` (status-only cross-reference)
- `docs/NMI-RENDER-P3-25-BUDGET-GATE.md` (append-only status note reconciling the *proposed*, not approved, D4 exception with P3's teardown fallback requirement)
- this task
- `docs/STATUS.md`
- append-only `docs/HANDOFFS.md`

## Forbidden
Any source, tests, DB SQL/migrations, dependencies, secrets, billing or cloud write, Render provisioning, release branch/SHA, build/deploy, hosting policy changes outside the requested narrow D4 exception, live OpenAI/PayPal, public URL or destructive teardown. Do not merge PR #47 or reuse its branch.

## Audit remediation (2026-11-06, owner-supplied independent review)

PR #48 was reported PARTIAL: quantify the residual ongoing billing exposure and who receives uncovered charges; explicitly reconcile the P3 budget policy's teardown fallback clause without weakening historical approvals; and specify the exact later owner adoption / G1 D4-E7 and P3 status updates. The scope is expanded **only** to include a non-operative P3 cross-reference. Do not treat preparation approval as final adoption. PR #47's STATUS/HANDOFFS conflict remains a separate sequential merge reconciliation requirement.

## Acceptance
1. Document the one-member Hobby limitation using official Render docs and the conflict with the current D4 eligibility rule. Existing rule remains in force unless an independently reviewed exception is **explicitly adopted** by the owner.
2. Retain the $25 **authorized** spending ceiling and explain that no Render-enforced global cap exists; possible continued billing if the owner is unreachable is a risk, **not** permission to exceed the ceiling.
3. Define scope/timebox, owner-only access, synthetic-only/provider-disabled service, monitoring checkpoints, no automatic teardown, no credentials shared, export/retention obligations and separate real-time deletion permission.
4. Record owner approval to *prepare* only, never imply signed final risk acceptance or G1 completion. G5/G7/G4/G6 remain separate.
5. Obtain targeted docs validation and both mandatory hosted CI on exact PR HEAD; independently review this policy exception; require separate explicit owner adoption and merge decision.

**Next action:** independent review of the prepared exception Draft PR and subsequent owner decision. No Render resource may be created under this task.
