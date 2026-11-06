# NMI-G1 — PROPOSED Hobby owner-only teardown exception (not authorized)

**Status: PROPOSED, NOT ADOPTED (2026-11-06).** This is a request to independently review a narrow exception to **D4 only** of `docs/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md`. Until the owner separately ratifies it following review, **the merged D4 executable-fallback requirement remains in force; G1 is OPEN, and resource creation is prohibited**.

**Provenance:** the owner on November 6 instructed us to **keep Render Hobby and the existing $25 eligible-credit budget and prepare** an owner-only risk exception. The owner acknowledged the possibility that charges might continue past $25 while unavailable. **That instruction authorized preparing this document only**: it was not an unconditional acceptance of the final exception terms, no release/host approval, and no increase in spending authority.

## 1. Why a narrowly bounded exception is proposed

- Official [Render Workspaces, Members and Roles](https://render.com/docs/team-members) states: **you cannot add team members to a Hobby workspace**. Hobby is intentionally a single-member workspace; a paid Pro upgrade is not authorized.
- The accepted G1 packet §6, D4 requires an **independently executable, authorized fallback when the owner is unavailable**, normally a named delegate with confirmed Render/export access. A reminder or promise to return cannot qualify.
- No such alternate actor or automated control is established for this workspace. **Do not fabricate a delegate, grant another person the owner's credentials, assert that suspension halts PostgreSQL charges, or represent a calendar reminder as an executable fallback.**
- A narrow *governance exception*, if independently audited and expressly owner-ratified, would acknowledge the missing fail-safe while keeping all other gates intact. **Without that ratification, D4-B is ineligible and G1 stays OPEN.**

## 2. Proposed exception contract — acceptance is NOT recorded here

| Topic | Proposed rule (subject to independent audit + owner ratification) |
|---|---|
| **Applies only to** | NudgeMyInvoice's **single-operator synthetic PayPal AI Hackathon demo**, hosted in the existing **Mrdzyn Hobby** workspace; no unrelated product or user data |
| **Approved deployment shape stays proposed, not created** | Singapore; one Starter web service; one PostgreSQL **16 Basic 256 MB**, **1 GB**, storage autoscaling OFF; one app instance, auto-deploy OFF, no Blueprint/previews, no Pro upgrade or extra resources |
| **Timebox** | Provision only after all gates close; aim to delete after judging **by 2026-12-15 23:59 Asia/Manila**, subject to verifying the official judge-access end; do not assume that date itself grants deletion authority |
| **Financial authority unchanged** | The existing **$25 total of eligible Render promotional credits through December 15**, per P3, is the **maximum authorized spend**, not a Render-enforced account-wide hard cap. Unknown taxes, overages, credit categories, or noncreditable charges remain STOP conditions. No over-$25 costs are authorized by this exception |
| **Residual risk explicitly requested for acceptance** | If the sole owner is incapacitated, unreachable, cannot access Render, or cannot supply a fresh deletion approval, **paid PostgreSQL and other resources can continue to generate charges after the planned teardown and may exceed the $25 authorization limit**. Exposure is possible even if web access is suspended. The exception does **not** prevent, pay for, or authorize those charges; there may be no independently executable response in time |
| **Owner-only security** | No sharing Render login, recovery codes, payment card, API keys, live provider keys or operator credentials with unapproved persons. Do not weaken GitHub, DB or application least-privilege controls |
| **Data and providers** | Synthetic data only; **OpenAI and real PayPal drafting remain disabled**, no provider credentials, no invoice sending, no live-provider Gate A/B/C authorization. Separate G8 environment preflight must PASS on actual deployment configuration |
| **Backups / deletion** | G1 E7 still requires an owner-selected private **encrypted export location, retention deadline and destruction method** (D5). Before deletion, download and independently restore-verify the latest Render `.dir.tar.gz` backup; **destructive resource deletion still requires fresh, separate, explicit owner approval at teardown**, after verification |
| **Other owner gates** | E2–E6 final checkout/billing evidence, G5 Hobby request-log residual-risk acceptance, G7 Studio package-download and hosted rights, G4 release SHA, and G6 first-build/resource creation/URL sharing decisions are **not waived** |

## 3. Compensating controls (cannot guarantee prevention of excess charges)

**Before separate first-resource approval (C0):**
1. Record remaining credit balance, prepaid/credit eligibility for Starter web and paid PostgreSQL, the latest unbilled charges and any applicable taxes/overages in a **private redacted** owner record.
2. Confirm current checkout price and intended PostgreSQL **1 GB, autoscaling OFF**; recompute a **maximum $25 including tax** forecast. If no credible bound is possible, stop.
3. Obtain final owner decisions D1–D3 and D5, G5 and G7, plus independent audit and a **separate written owner adoption of this D4-only exception**. Owner's acceptance must describe the *possibility of involuntary cost overrun* while absent, not “approval to spend more”.
4. Owner ensures account access remains functional, keeps a private emergency-access/recovery plan for themselves (no credentials in repo), and places calendar notifications for December 10, 14 and 15. **Notifications are reminders only, not independent fallbacks.**
5. Retain independent release preflight and exact-SHA/first-build control; no provisioning until G1/G5/G7/G4 and G6 prerequisites are separately satisfied.

**While running (C1–C5):**
1. Check actual Billing 24 hours after first resource creation, November 15, December 1, December 10, and daily December 10–15. Keep a private history of charges and projected spend. **At $20 projected, warn; at $25 projected or any noncreditable charge, suspend the web service and seek a new explicit decision.** Suspending the web service is containment, **not** a database billing stop.
2. Keep autoscaling OFF, one web service/DB, no add-ons, no automatic deployments; disable live providers. Do not silently extend hosting past the judge-access period.
3. Create an independently restorable off-Render encrypted export before judge sharing and a final one at teardown, according to the accepted G1 packet §7.

**At end of judging (C5–C6):**
1. Owner verifies final private export by test restore and checks role/data integrity; revokes sessions; suspends web.
2. Owner grants **separate explicit approval at that time** for deleting the service and database, then performs/oversees deletion. Verify billing cessation and remove/rotate secrets.
3. If the owner is unreachable, **there is no delegated or automated deletion** under this exception; paid resource charges may continue, possibly beyond $25, while authorized spending remains capped. This situation demands prompt owner intervention when available and a new spending decision, but it is not proof that the cap was enforced.

## 4. Explicit decisions required AFTER independent review

**Exception adoption is not yet authorized.** The project owner must separately approve or reject a written statement substantially equivalent to:

> I request a narrow **D4 owner-unavailability exception** for NudgeMyInvoice's synthetic-only Render Hobby deployment. I acknowledge Hobby has no second workspace member, no independently executable teardown fallback is implemented, and if I am unavailable paid resources may remain billable past the intended teardown date and may exceed $25. **I accept that residual exposure without increasing the existing $25 authorized spending limit.** I remain the sole resource administrator, and I will give a **separate explicit approval at teardown time** before irreversible deletion. I approve the specified monitoring/backup controls. This approval does not authorize provisioning, first build, public URL, live providers or an over-budget charge.

The owner must also choose/confirm **D5** (private encrypted backup location, access, retention and destruction dates), **D1–D3**, and all non-D4 G1 evidence. Do not put account identifiers, export bytes, licence keys or private screenshots into this repository.

**Independent reviewer questions:** Is the residual billing risk sufficiently bounded and explained? Are compensating controls executable without implying a hard cap? Does the exception supersede *only* D4 while leaving all other owner-controlled gates and mandatory CI/release policies intact? Has owner adoption been clearly distinguished from approval to prepare?

## 5. State and stop conditions

- **Current status:** D4 exception **PROPOSED / NOT RATIFIED**, **G1 OPEN**. G4/G5/G6/G7 OPEN; G8 continues; Gates A/B/C NOT AUTHORIZED.
- The active G1 packet §6 **still governs** until this proposal passes independent review and is expressly adopted by the owner; merely merging a proposal does not implicitly waive D4.
- If owner does not approve the exception, or actual account charges/credit eligibility cannot support the $25 forecast, **do not provision**. Use the local judge/demo-video fallback rather than a hidden Pro upgrade.
- No deployment/release SHA/resource creation/deletion/provider call took place when this proposal was prepared.
