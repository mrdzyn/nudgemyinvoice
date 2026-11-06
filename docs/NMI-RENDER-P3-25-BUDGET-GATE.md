# NMI-RENDER-P3 — Owner-approved $25 hosting budget; provisioning still gated

**2026-11-04 owner decision:** YES — authorize **up to $25 in Render promotional credits** for NudgeMyInvoice hosting **through 2026-12-15**. This changes the prior preferred **Free web + Free PostgreSQL** cost proposal into a **proposed paid Starter web + paid Basic-256MB PostgreSQL 16** configuration, conditional on checkout and release QA. It is a **spending ceiling only**. It does **not** authorize provisioning, the unavoidable first deploy, spending beyond $25, workspace upgrade, actual public judge access, AG Studio external license usage, live PayPal/OpenAI calls, or irreversible database teardown. No resources have been created by this phase.

## Cost and workspace verification

| Resource | Proposed plan | Public monthly list rate | Conditions |
|---|---|---:|---|
| Mrdzyn workspace | Hobby | $0 | User-reported Hobby; verify in Billing |
| Web | Starter (one instance) | $7 | Singapore; one service; no autoscaling; auto-deploy OFF |
| PostgreSQL | Basic 256 MB (0.1 CPU), PostgreSQL 16 | $6 | Singapore; one DB; initial 1 GB storage included |
| Extras | None | $0 planned | May incur bandwidth/build/extra storage/tax; not covered by base price |
| **Total base rate** | | **$13/month** | Approximately $17–20 for proposed Nov 8–Dec 15 interval before variable charges |

Sources (checked 2026-11-04): [Render pricing](https://render.com/pricing), [compute plans](https://render.com/docs/compute-plans), [Render FAQ](https://render.com/docs/faq). Actual checkout and account-specific credit applicability, taxes and balance are **UNVERIFIED**. The Oct 29 owner screenshot showed **$50 credits expiring 2027-10-01**, not an independently verified Nov 4 remaining balance.

**Read-only connector inventory Nov 4:** Mrdzyn workspace found; no PostgreSQL instances returned; service inventory returned `null` (not a proof of no services). No billing/credit endpoint is available through this connector. The owner must check Dashboard → Workspace Billing and checkout before any create.

### Approval boundaries and spending guardrails

- **Approved:** aggregate incremental NMI hosting spend, paid from available Render credits, **up to $25 total**, through 2026-12-15. If any charge cannot be covered by credits, tax or estimated overage is unclear, or total spend may exceed $25, STOP before incurring the charge and seek explicit renewed owner approval.
- **Not approved:** resource creation, first deploy/publication, Render Pro/Hobby upgrade, other projects' costs, cloud secret entry by agent, live provider access, sending invoices, creating PayPal drafts, public judge URL, public Studio license key, deletion/teardown, or merge of any PR. These need separately satisfied release/owner gates.
- **No hard spending cap at $25:** Render documents an optional **build pipeline minute spend limit** (not full workspace/service/DB charges). Check charges and forecast manually; propose warning around $20. See [Render build pipeline](https://render.com/docs/build-pipeline).
- **Start/stop:** suggested provisioning window Nov 8–9 after release gates; judge access through Dec 15; teardown after judging in a separately owner-authorized, backed-up operation. Recheck actual judging end time before deciding teardown. Never let paid resources run indefinitely after the hackathon.
- **Resource selection supersedes P2's FREE instance choices only when this P3 packet is independently audited and owner-merged.** P2/P1 security, least privilege, platform logging, provider-disabled and initial-deployment protections remain. In particular, the Hobby native platform HTTP request-log evidence gap is unresolved and requires an explicit alternative acceptance + owner risk decision before judge sharing.

## Deployment gate checklist

**BLOCKED until:**

1. Owner confirms live Mrdzyn billing, credit eligibility, plan prices and $25 total forecast; no accidental Pro upgrade, paid add-on or extra resource.
2. **Lifecycle (reconciled 2026-11-04):** A5-I1 (PR #38) is independently audited and **merged** (`main@e314bef`); its AG Studio integration is dev-only, default-OFF and local. NMI-RENDER-P4 (Draft **PR #40**) has passed independent audit but is **NOT merged**; its readiness work (production Community-only build exclusion, preflight CLI, backup/restore drill, checklist, cost checkpoints C0–C6) and owner gates **G1–G8** govern release. Hosted Studio **use** remains OFF absent written AG Grid rights for external judges. `.env.local` trial key `AG_STUDIO_LICENSE_KEY` is local only, never copied to Render or a client build by this hosting phase.
   - **G7 — UNRESOLVED:** the Render build would *download* `ag-studio`, `ag-studio-react`, `ag-grid-enterprise` and `ag-charts-enterprise` as regular npm dependencies of `apps/web` even though the production browser bundle excludes them. Do **not** assume this download is covered by the trial terms. The safest path is a separately reviewed hosted-dependency exclusion; otherwise the owner must decide on written AG Grid confirmation. Treating Studio as merely "disabled" does not close G7.
3. Exact audited `release/nmi-render-judges-2026` branch, auto-deploy OFF, provider-disabled environment, startup fail-closed without exact HTTPS `WEB_ORIGIN`; security acceptance including least-privilege DB user and same-origin reverse proxy documented.
4. Render resource creation and first deployment separately approved by owner against actual checkout and exact code SHA. Render may auto-build at initial service creation even if `autoDeploy=no`.
5. No judge/public URL sharing until supervised login/reset policy, real HTTPS tests, no PII in platform logs, **G5** (written owner acceptance of the Hobby request-log residual risk, using P4's alternative-evidence contract A1–A4), backup/recovery, and teardown schedule are reviewed.
6. Billing checks (pre-create/post-create/Nov15/Dec1/Dec10/teardown); halt expansion or extend nothing beyond budget without further owner approval.

## P4 gates carried into this budget (G1–G8, all OWNER-only and open)

| Gate | Requirement | State |
|---|---|---|
| G1 | Owner confirms live Billing: Hobby, credit applicability, tax, ≤ $25 forecast | OPEN |
| G2 | Independent audit of P4 PR #40 (done: PASS) and owner decision to merge it | audit done, merge OPEN |
| G3 | PR #39 (this packet) re-audited and owner-merged | OPEN |
| G4 | Owner picks the release SHA and creates `release/nmi-render-judges-2026` | OPEN |
| G5 | Owner accepts the Hobby request-log residual risk in writing | OPEN |
| G6 | Separate approvals: resource creation + unavoidable first build; judge-URL sharing; judge-access method | OPEN |
| G7 | Studio packages downloaded by the Render build (licence boundary above) | **UNRESOLVED** |
| G8 | Gates A (OpenAI), B (PayPal), C stay NOT AUTHORIZED; no provider credentials on Render | HOLDS |

## Manual budget monitoring, storage and teardown (required before provisioning)

- The $25 ceiling is **owner discipline, not a Render-enforced cap**. Render's only spend limit is for build-pipeline minutes. Use P4's cost checkpoints C0–C6 (pre-create, post-create, Nov 15, Dec 1, Dec 10, pre-teardown) and compare each against the owner-visible Billing page. The ~$17–20 figure is an **estimate, never a verified invoice**; live credit balance, eligibility, bandwidth and tax are NOT VERIFIED. Warn at about $20; stop and re-ask the owner before any charge that could exceed $25.
- **Stopping or suspending only the web service does not necessarily stop paid PostgreSQL charges.** A still-billing database could therefore exceed $25 silently.
- **Before ANY resource is created, the owner must approve in writing a feasible teardown/retention plan:** who deletes what and when, the fallback if the owner is unavailable, the pre-deletion export/backup and its retention location, and the date the plan is evaluated against actual judging end time. Deletion is destructive and irreversible: it needs separate explicit owner approval at that time, and this document does not grant it. No teardown plan, no provisioning.
- At checkout the owner reviews: credit applicability to each resource, tax, and the Postgres storage setting. **Database storage autoscaling must be OFF** and the disk must stay at the selected **1 GB** (a Render Blueprint may default to a larger disk if the size is omitted, so set it explicitly). No Pro upgrade, no paid add-on, no second instance or database.

**Outcome of this phase:** budget decision recorded; no billing or deployment action executed.

## Post-approval D4 owner-only exception proposal — NON-OPERATIVE (2026-11-06)

The owner approved **preparing** (not ratifying) a narrowly bounded **Hobby owner-only exception** to the *independently executable owner-unavailability fallback* prerequisite in this P3 budget policy and the subsequently merged G1 packet §6 D4. See [`docs/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md`](NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md), Draft PR #48. This is a **status-only cross-reference**, not a revision of the owner-approved 2026-11-04 P3 spending policy. The **$25 authorized eligible-credit limit, cost/checkout evidence, backup/retention, separate actual-at-teardown deletion approval, and all release/owner gates remain in force**.

**Today the original pre-provisioning fallback condition remains unmet and binding.** Hobby cannot add a second workspace member; no alternative executable operator has been verified. The proposed exception discloses possible **unbounded ongoing billing exposure if the owner is unavailable** and possible collection from the workspace billing account/payment method; such exposure is not an increased spending authorization or a Render-enforced cap.

**If and only if the owner separately ratifies the final exception after independent review**, a subsequent independently audited and owner-merged adoption-record change must expressly update this **one P3 fallback prerequisite**, the G1 packet §6 D4, E7/§11 and STATUS together, recording D4 as **satisfied by exception for this one Hobby deployment/timebox**, not by an imaginary delegate. **Proposal merge alone has no effect**. Until that adoption record and all remaining E1–E7/D1–D5 requirements pass, **G1 stays OPEN and no Render resource creation is authorized**.

## Adoption record for the D4 owner-only exception (effective only when its four conditions hold, including a verified completed merge; 2026-11-06)

*This section is additive. The 2026-11-04 owner approval, the $25 ceiling and every restriction above, and the earlier "proposal, non-operative" section, are not edited. It supersedes that earlier section only for the one prerequisite named below, and only when it takes effect.*

**Takes effect only when **all four** of these hold: (1) an independent exact-HEAD review of the adoption-record PR has passed; (2) both required hosted CI workflows have passed at its exact final head; (3) the owner has given a new, explicit approval to merge it; and (4) **the merge has actually been completed on GitHub and verified** (the PR is MERGED and its merge commit is on `main`).** Approval alone, an open or Draft PR, a review PASS or passing CI is not enough. Until then, **the original pre-provisioning fallback condition remains unmet and binding.** The record is [`NMI-G1-HOBBY-EXCEPTION-ADOPTION-RECORD.md`](NMI-G1-HOBBY-EXCEPTION-ADOPTION-RECORD.md); the owner's ratification of 2026-11-06 is **owner-reported**, made in conversation, not an owner-authored GitHub comment.

**Reconciliation, for one prerequisite only.** The clause above that requires the owner-approved teardown plan to include "the fallback if the owner is unavailable" may be met, **for this single Hobby deployment and timebox only**, by the **explicitly ratified owner-only exception** instead of a delegate, **once the exception is effective as above**. For every other case the original requirement applies unchanged. The owner accepts, without increasing the $25 limit, that paid resources (particularly PostgreSQL) may keep billing past the 15 December 2026 target teardown if the owner is unavailable, that charges beyond $25 (including non-creditable charges to the workspace payment method) are possible with no guaranteed maximum, and that deletion still needs the owner's **separate explicit approval at teardown time**.

**Unchanged by the exception:** the $25 authorized eligible-credit ceiling (not a Render-enforced cap); the cost and checkout evidence, the checkpoints C0 to C6 and the $20 and $25 stop rules; backup, encryption and retention (D5 stays pending); no credential sharing; no delegated or automated deletion; and every other gate (G1 itself stays **OPEN**, G4, G5, G6 and G7 stay **OPEN**, G8 continues, provider Gates A, B and C stay NOT AUTHORIZED). No resource creation, first build, deployment, release SHA, public URL or provider call is authorized by this section.
