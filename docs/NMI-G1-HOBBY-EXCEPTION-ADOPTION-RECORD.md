# NMI-G1 — Adoption record: Hobby owner-only teardown exception

**Status: EFFECTIVE ONLY WHEN this record's PR has passed independent exact-HEAD review and the owner has explicitly approved its merge. Before that, this document changes nothing: the P3 fallback prerequisite and the G1 packet §6 D4 requirement stay in force, and a Draft PR is not an adoption.** After it takes effect, **D4 is satisfied by this exception, for this one deployment only. G1 remains OPEN** (§6).

**Base:** `main@6d16f45a95d1cafecb3aca2ac047ce7daab912ee`. **Proposal:** [`NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md`](NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md), PR #48, independently audited PASS and squash-merged. **Task:** `tasks/NMI-G1-HOBBY-EXCEPTION-ADOPTION.md`.

## 1. How the owner's decision is attributed

- **Owner-reported, in conversation.** The owner reports that on **2026-11-06** they explicitly ratified the Hobby owner-only teardown exception, in a conversation with another assistant (ChatGPT), after reviewing the complete risk-acceptance statement. They then authorized preparing this record.
- This is **not** an owner-authored GitHub comment, and no such comment is claimed. The ratifying words are not reproduced in this repository, so this record does **not** quote them. It records the scope the owner reports accepting (§2), and it points to the proposal's §4 statement as the text under review.
- **If the project requires a signed or owner-authored GitHub acknowledgment, that is requested separately and is not supplied here.** The owner's explicit approval to merge this PR is a separate owner action on GitHub, and it is what makes this record effective (§7).
- Reviewers should not treat the conversation as independently verified. The independent review of this PR checks the record's wording and consistency, not the conversation.

## 2. What the owner reports accepting

1. **Render Hobby with one workspace administrator**, and **no independently executable teardown fallback**. Render does not allow team members on a Hobby workspace.
2. Paid Render services, **particularly PostgreSQL, can keep billing after the 15 December 2026 target teardown date if the owner is unavailable.**
3. **Potential charges beyond $25**, including **non-creditable charges to the workspace payment method**, which remain the owner's responsibility to resolve.
4. **No guaranteed maximum financial exposure** during a prolonged absence. The proposal's examples (about $0.42/day; $16.26, $18.35 and $22.97 through 15, 20 and 31 December; the illustrative 9% tax reaching $25 around 31 December) are illustrations, not a bound.
5. The **$25 authorized spending ceiling is unchanged.** It is the maximum authorized eligible-credit spend, **not a Render-enforced cap**, and this acceptance of a risk is **not** an authorization to spend more.
6. The **mandatory protections** remain: cost monitoring, backup, encryption, retention, security and privacy (§4).
7. **Separate explicit owner approval at teardown** before any irreversible deletion.

## 3. What the exception satisfies, and what it does not

**It satisfies only** the *independent, executable owner-unavailability fallback* requirement: the P3 pre-provisioning teardown-plan clause "the fallback if the owner is unavailable" and the G1 packet §6 D4 rule. It is accepted **instead of** a delegate, because a delegate is not possible on Hobby.

**Its scope is one deployment:** the single-operator, synthetic-only NudgeMyInvoice demo in the existing **Mrdzyn Hobby** workspace, with one Starter web service and one PostgreSQL 16 Basic 256 MB (1 GB, autoscaling OFF), one instance each, no add-ons, no Blueprint, no Pro upgrade, provider-disabled (G8), target teardown by **15 December 2026 23:59 Asia/Manila**, subject to confirming the official end of judge access. Any change to that shape needs a new forecast and a new owner decision.

**It does not:**
- close G1, or satisfy any of E1 to E6, D1 to D3 or D5;
- change the $25 ceiling, the P3 spending restrictions, the stop conditions or the budget checkpoints C0 to C6;
- delegate, automate or pre-authorize deletion, or let any later agent infer a deletion approval;
- permit credentials, recovery codes, a payment card or keys to be shared with anyone;
- waive or decide G4, G5, G6 or G7, or change G8 or provider Gates A, B and C;
- authorize creating a Render resource, a first build or deployment, a release SHA or branch, a public URL, or any provider call.

## 4. Conditions that remain mandatory

- **Cost monitoring:** the checkpoints C0 to C6 in P4 §8 and the proposal §3 (including the extra daily checks from 10 to 15 December). At a projected **$20**, warn. At a projected **$25**, or any noncreditable charge, **suspend the web service and seek a new explicit owner decision**. Suspending the web service is containment, **not** a way to stop database billing.
- **Backup:** a verified private **off-Render** export before any judge sharing and a final one at teardown, verified by the packet §7a procedure (a real `.dir.tar.gz`, directory format, isolated disposable PostgreSQL 16). The synthetic P7-C runner is not that verifier.
- **Encryption, retention, destruction (D5):** a private **encrypted** destination, a retention deadline and a destruction method and date. **D5 is not yet decided and stays pending.**
- **Security and privacy:** the owner stays the sole resource administrator, no credential sharing, synthetic data only, providers disabled, least-privilege controls kept, and no private billing artifact or export committed to the repository.
- **Calendar reminders** (10, 14 and 15 December) are reminders only and are not a fallback.
- **Deletion:** a **separate, explicit, fresh owner approval at teardown time**, given after the final export is verified. If the owner is unavailable, **nothing is deleted** (no delegate, no automation), resources and charges may continue, and any further spending needs a new explicit owner decision.

## 4a. If a listed assumption stops being true

If Hobby later permits a second member, the workspace plan changes, the resources or the date change, the deployment stops being synthetic-only or provider-disabled, or the forecast cannot support the $25 ceiling, this exception no longer covers the situation. Stop, and ask the owner for a new decision before provisioning or continuing.

## 5. What changes in the repository (all additive or status-only)

| Document | Change |
|---|---|
| `docs/NMI-RENDER-P3-25-BUDGET-GATE.md` | A new section, below the earlier non-operative addendum, states the reconciliation for the **one fallback prerequisite only**. The 2026-11-04 approval text and the earlier addendum are not edited. |
| `docs/NMI-G1-RENDER-COST-TEARDOWN-PACKET.md` | §6 D4: new row **D4-X** (the adopted exception) and a status line, with D4-B kept as written; §5 **E7**: the fallback part is satisfied by the exception on merge and E7 stays PENDING; §11: the sequence is updated; §13: the "NOT ADOPTED" heading is replaced by a status pointing here. |
| `docs/NMI-G1-HOBBY-OWNER-ONLY-EXCEPTION.md` | Status references only. The proposal text is kept as reviewed. |
| `docs/STATUS.md`, `docs/HANDOFFS.md` | Status and the appended handoff `NMI-G1-HOBBY-ADOPT-01`. |

## 6. G1 after this record takes effect (still OPEN)

| Item | State |
|---|---|
| D4 (owner-unavailability fallback) | **SATISFIED BY EXCEPTION** for this one deployment (this record) |
| E7 (teardown and retention plan) | **PENDING**: needs D5 (encrypted destination, retention deadline, destruction method and date) and the rest of the §7 plan |
| E2, E3, E4, E5, E6 | Unchanged (partial or not yet evidenced) |
| D1, D2, D3, D5 | Unchanged (pending owner decisions) |
| G4, G5, G6, G7 | **OPEN** |
| G8 | Continuing |
| Gates A, B, C | **NOT AUTHORIZED** |
| Issue #49 (local judge runbook and operator preflight still assume eight migrations) | Separate release blocker, **not fixed here** |

## 7. Effectiveness checklist

This record is effective only when **all** of these hold. None is assumed:
1. An **independent exact-HEAD review of this PR** has passed.
2. **Both required hosted CI workflows** have passed at the exact final head.
3. **The owner explicitly approves the merge** of this PR on GitHub.

Until then, the earlier statements stand: the P3 fallback prerequisite is unmet and binding, and the G1 packet §6 D4 requirement applies.
