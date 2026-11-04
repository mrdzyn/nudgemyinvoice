# NMI-RENDER-P3 — Owner-approved $25 hosting budget; provisioning still gated

**2026-11-04 owner decision:** YES — authorize **up to $25 in Render promotional credits** for NudgeMyInvoice hosting **through 2026-12-15**. This changes the prior preferred **Free web + Free PostgreSQL** cost proposal into a **proposed paid Starter web + paid Basic-256MB PostgreSQL 16** configuration, conditional on checkout and release QA. It does **not** authorize provisioning, the unavoidable first deploy, spending beyond $25, workspace upgrade, actual public judge access, AG Studio external license usage, live PayPal/OpenAI calls, or irreversible database teardown. No resources have been created by this phase.

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
2. A5-I1 real Studio integration has separately passed local audit/merge OR a separately reviewed Community-only release SHA is selected; hosted Studio remains OFF absent written AG Grid rights for external judges. `.env.local` trial key `AG_STUDIO_LICENSE_KEY` is local only, never copied to Render or client build by this hosting phase.
3. Exact audited `release/nmi-render-judges-2026` branch, auto-deploy OFF, provider-disabled environment, startup fail-closed without exact HTTPS `WEB_ORIGIN`; security acceptance including least-privilege DB user and same-origin reverse proxy documented.
4. Render resource creation and first deployment separately approved by owner against actual checkout and exact code SHA. Render may auto-build at initial service creation even if `autoDeploy=no`.
5. No judge/public URL sharing until supervised login/reset policy, real HTTPS tests, no PII in platform logs, Hobby platform-request-log alternative risk acceptance, backup/recovery, and teardown schedule are reviewed.
6. Billing checks (pre-create/post-create/Nov15/Dec1/Dec10/teardown); halt expansion or extend nothing beyond budget without further owner approval.

**Outcome of this phase:** budget decision recorded; no billing or deployment action executed.
