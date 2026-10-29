# NMI-RENDER-P3B — SEPARATE, UNSIGNED Hobby Free staging provisioning authorization

> **UNSIGNED REQUEST / NOT APPROVED / NOT EXECUTED.** Prepared 2026-10-29 to be reviewed **after** independent audit and owner approval of the P3A privacy-evidence contract. This is a **different authority from approving the configuration, contract, PR merge or judge access**. Do NOT use this text or an unsigned template as permission to create a release branch, cloud resource, deployment, secret, payment method or charge.

## 1. Fixed scope being proposed, not yet authorized

| Dimension | Proposed and permitted ONLY after actual owner approval |
| --- | --- |
| Account | Owner-selected Mrdzyn Render **Hobby** workspace; confirm destination privately in dashboard |
| Location | **Singapore** web and DB |
| Web | Exactly **one** Render Free **Node** web service `nudgemyinvoice-staging-web`, single instance; no custom domain, previews, Blueprint, disks or paid addon |
| Database | Exactly **one** **Free PostgreSQL 16**, **1 GB** `nudgemyinvoice-staging-pg`; 30-day expiry and no managed backups; no paid upgrade |
| Source | **Future dedicated** `release/nmi-render-judges-2026` branch with HEAD exactly `652cf702fd93b05a9b9d64ee9b4c2151c30833b2`. The owner separately approves its creation when executing this authorization; `main` is **not** a valid source |
| First deploy | **MUST be authorized separately along with web resource creation**: Render may start first build/deploy on creation regardless of Auto-Deploy OFF; verify deployed SHA and stop if different |
| Auto-Deploy | **OFF**; no PR previews; no commit tracking to moving `main`, no force-push of release branch |
| App | Node >= 22, pnpm 10.28.0; build `pnpm install --frozen-lockfile --prod=false && pnpm --filter @nmi/web build`, start `pnpm --filter @nmi/api start`, health `/health` |
| Runtime | Production, `HOST=0.0.0.0`, Render `PORT`, exact generated HTTPS `WEB_ORIGIN` (fail closed if not yet known), `TRUST_PROXY=1` provisional then tested; secure secret store |
| Data/provider | Only synthetic invoices and single operator; `PAYPAL_DRAFTS_ENABLED=false`; no PayPal secrets, OpenAI key, provider calls or real PII |
| Exclusions | Workspace Pro, paid compute, external managed log service, secrets in Git, customer import, public judge credentials, Devpost publication, production release, any Gate A/B/C call |

The existing P2 document `docs/NMI-RENDER-P2-STAGING-APPROVAL-PACKET.md` §1A/§1B and P1 security/runbook rules govern. **Read and obey their stop conditions**, especially no database owner credentials in the web service and exact code pin. This authorization is not authority to relax them.

## 2. Financial facts and missing decisions

| Financial fact | Evidence / current value | Release of gate |
| --- | --- | --- |
| Workspace | Owner screenshot identified **Hobby**, $0 workspace subscription, 2026-10-29 | Reconfirm at creation |
| Promotional balance | Owner screenshot **$50 Hackathon Participant** credit expiring **2027-10-01** | **Not** a spending allowance or guarantee of free overages |
| Included quota | Owner screenshot: 750 Free instance-hours, 5 GB bandwidth, 500 pipeline minutes monthly | Recheck immediately before creation |
| Selected Free web and Free PG compute | Render public baseline **$0** for those Free plans; 1 GB Free PG | Verify the actual **Free** checkout labels and any current charges |
| Payment method on workspace | **UNKNOWN — must privately verify and record YES / NO** | **BLOCK** before provisioning |
| Overage policy | With payment method, bandwidth/build overages **may be charged**; without, services/builds **may suspend** at quota | Owner must explicitly choose bounded paid risk vs suspension; do not claim an enforced cap from a written amount alone |
| Accrued charges/tax/other projects | Screenshot showed no pending charges or invoices at capture; **future accruals unverified** | Review fresh Mrdzyn Billing/Included Usage before approval; do not leak billing identity in GitHub |
| Owner maximum new out-of-pocket cost | **NOT SET** | Explicit dollar amount and action if exceeded required; if the owner wants strict $0, verify a **platform-enforced no-billing mechanism** or STOP. A user-stated $0 preference alone does not block Render from billing if a method is attached |
| Free PG expiration / judge evaluation | **Unknown creation date, unknown final judge date**, expires 30 days after creation; 14-day grace not usable as availability | Confirm actual judge end, QA window and teardown cutoff **before** PG create |

**Public pricing is not an account quote.** Verify all actual Render terms from the owner-visible checkout and Billing page without sending card/payment/credential data to the assistant or PR. The connected Render tools do not expose private billing. Do not create resources merely to discover the bill.

**Payment-method decision (private owner attestation, NOT yet supplied):** `[NO METHOD / METHOD PRESENT / NOT CONFIRMED]`. If `NOT CONFIRMED`, **STOP**. The no-payment-method approach may protect against unapproved monetary charges at the cost of suspension when quota is exhausted; it is not an uptime guarantee and must not be inferred from the old screenshot.

## 3. Approvals are separable; no signature has been given

| Gate | What it permits | Status |
| --- | --- | --- |
| P3A-C | Owner accepts the **privacy-evidence test contract** *as a plan*, after independent audit | **PENDING — no live QA authorized by document creation** |
| P3B-R | Owner approves creation of dedicated GitHub **release branch** pinned to `652cf702…` (non-cloud) | **PENDING** |
| P3B-DB | Owner approves **one** Free PG16 database, accepting no managed backup and 30-day expiry, with financial/teardown conditions | **PENDING** |
| P3B-WEB+DEPLOY | Owner approves **one** Free web service **and its unavoidable possible first deploy** from fixed release branch; must specify fail-closed origin and credential policy | **PENDING** |
| P3C-QA | Owner approves executing tests on the *owner-only deployed URL*, synthetic-only | **PENDING** |
| P3C-EDGE | After QA, owner accepts/rejects **unobservable Render platform request logs** risk (P3A §7); not a generic security waiver | **PENDING** |
| P3D-SHARE | After owner-only QA and independent evidence audit, owner separately approves live judge URL sharing/credential process and expiration | **PENDING** |
| Provider Gates A, B, C | Real OpenAI/PayPal/combined acceptance | **NOT AUTHORIZED** |

P3B-DB and P3B-WEB+DEPLOY may be written in a **single explicitly signed bounded execution instruction** if the owner chooses, but they remain separately identifiable actions. **Creation of the web service can immediately start a first deploy**; do not create it before P3B-WEB+DEPLOY consent. A GitHub docs PR approval or merge alone does not sign any of these.

## 4. Before any eventual execution: verifiable checklist

- [ ] P3A contract independently audited PASS and owner approves test plan (not a risk waiver).
- [ ] Owner confirms Mrdzyn workspace Hobby, exactly Free web and Free PG16, same Singapore region; no competing Free PG in workspace.
- [ ] Owner checks whether a payment method is attached, actual Free checkout, latest balances/quotas, and agrees **precise maximum additional monetary exposure** and STOP conditions; if strictly $0, verified fail-safe against billing is recorded.
- [ ] Judging window is documented with date/timezone and **ends before PG expires**; owner sets teardown cutoff and acknowledges cold starts, no managed backups, synthetic-only/rebuild if needed.
- [ ] Owner explicitly authorizes creating pinned `release/nmi-render-judges-2026` from exact `652cf702…`. Check `git ls-remote` equality before *any* Render action. Never push a docs-only successor or moving `main`.
- [ ] Owner explicitly authorizes Free PG creation and confirms owner can create least-privileged `nmi_runtime` role; verify after create, STOP if unsupported. Do **not** run app as PG owner.
- [ ] Owner explicitly authorizes Free web creation **including the first deployment**, with Auto-Deploy OFF, safe variables and secrets; Render public web creation may deploy before hostname is known. Production must **fail closed** until exact `WEB_ORIGIN` is set; never set fake URL or loosen HTTPS checks.
- [ ] On first deployed commit, verify Render dashboard SHA = `652cf702…`; if mismatch, suspend/STOP and seek new owner authorization/audit.
- [ ] Use temporary `0600` `PGPASSFILE` for owner-side SQL migration and CLI provisioning, restrict external database IP allowlist during maintenance and remove afterward. No credentials in process argv, Git or screenshots; no owner role in runtime app.
- [ ] Create the initial account with password-manager-generated, high-entropy operator password. Single operator is **not per-judge isolation**. Keep judge URL/password private; no external sharing on provisioning approval.
- [ ] No managed Free PG backup available. For owner-approved synthetic-only data, prepare repeatable **clean database creation + migrations 0000–0006 + runtime grants + operator provisioning + synthetic fixture**. Do not rely on P1's snapshot restore instructions. A logical `pg_dump` / `pg_restore` path, if separately tested and permitted, is only a *user-created logical backup*, not a Render-managed backup; never claim it was performed until actually run.
- [ ] After deployment, separate approval to perform HPE-01…11 owner-only QA. HPE-EDGE remains NOT OBSERVABLE; no judge release until independent review + explicit residual-risk decision + separate judge-share approval.

## 5. UNSIGNED owner decision template — **DO NOT EXECUTE**

**Status:** `NOT SIGNED`. The owner may use the text below as an explicit approval **only after** completing §2/§4. Do not prefill absent values.

> For NudgeMyInvoice, I authorize in **Mrdzyn Hobby / Singapore** only these actions: **[LIST: release-branch creation, one Free PG16 1-GB database, one Free Node web service INCLUDING its possible first deployment]**. The source branch must be `release/nmi-render-judges-2026` at exactly `652cf702fd93b05a9b9d64ee9b4c2151c30833b2` with Auto-Deploy OFF. I personally verified both Free checkout plans, current billing/quotas and payment-method status **[YES/NO]**. My additional out-of-pocket ceiling for the authorized test window is **US$[AMOUNT]**; the enforcement/stop mechanism is **[EXPLICIT VERIFIED MECHANISM]**, not merely a dashboard warning. Judging is expected to end **[DATE/TIMEZONE]** and I approve teardown by **[DATE/TIMEZONE]** within 30 days of the Free PG creation. I accept synthetic-only data and no managed database backup. If the approved ref, Free plan, cost-stop rule, runtime database role, or fail-closed HTTPS configuration cannot be assured, stop rather than substitute a paid tier or relax security. This approval does **not** permit judge URL/credential sharing, real OpenAI/PayPal requests, Pro upgrade, publication, or acceptance of unavailable platform HTTP logs.

**Private owner decision record** (never include payment method identifiers or secrets):
- Decision: **PENDING**
- Approving owner and timestamp: **PENDING**
- Actions explicitly selected (P3B-R, P3B-DB, P3B-WEB+DEPLOY): **PENDING**
- Payment method present and verified credit/quota snapshot: **PENDING**
- Cost ceiling and actual enforcement / stop mechanism: **PENDING**
- Judge evaluation end, provisioning date, PG expiry and teardown date: **PENDING**
- Execution operator, approved release SHA and resource names: **PENDING**
- P3A independent review and owner contract approval: **PENDING**
- Notes/risk exceptions: **NONE APPROVED**

**No Render create/update/trigger-deploy action, GitHub release-branch creation or any cost-bearing action is approved by this unsigned document.** Even after it is eventually signed, live QA, residual risk and external sharing remain separate gates.

## 6. References

- `docs/NMI-RENDER-P3A-HOBBY-PRIVACY-EVIDENCE-CONTRACT.md`
- `docs/NMI-RENDER-P2-STAGING-APPROVAL-PACKET.md`, §1A/§1B
- `docs/NMI-RENDER-P1-RUNBOOK.md`, as superseded for Free configuration
- https://render.com/docs/free
- https://render.com/docs/logging
- https://render.com/docs/postgresql-creating-connecting
