# NudgeMyInvoice — Owner authorization requests (UNANSWERED)

> **Status of all three requests: NOT AUTHORIZED.** This file contains forms only. The coding agent never signs, answers or infers an answer. An authorization exists only if the owner writes it in a **new message to the orchestrating reviewer/agent** (or in a dated, owner-signed record committed by the owner) that **quotes the request ID, model/run ID and cap** below. Silence, "go ahead", "next", a documentation merge, a passing audit, or approval of a different request is **NO**. Each authorization expires at the end of its run or at the stated expiry, whichever is first, and cannot be reused. Procedure: `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`.

Common conditions that apply to every request: the **owner** (not the coding agent) holds the credentials and executes the checklist; credentials are never pasted into chat, a ticket, a commit or a screenshot; results are recorded with the REAL / PENDING / SIMULATED labels and the redacted templates in `docs/NMI-DEMO-EVIDENCE-TEMPLATES.md`; `main` already contains the audited code, and **no product or provider code changes** are part of any request (a code change, e.g. retries or reasoning effort, would be its own task and its own approval).

---

## Request A — OpenAI Responses (real parsing)

**Request ID:** `R1-A` · **Proposed run ID:** `R1-A-YYYYMMDD-01` · **Expiry:** end of the run, at most 24 hours after approval.

> *I, the project owner, authorize **at most 3** real OpenAI Responses parse calls using model **`gpt-6-luna`** (or: `<other model I name here>`), only with the three synthetic input strings in section 4.4 of `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`, executed by me with a dedicated key under a provider-side spend limit of **USD `<amount>`**, with PayPal drafting **disabled and PayPal credentials unset** throughout, `OPENAI_MAX_OUTPUT_TOKENS=`**`4096`** (or `<value>`), and redacted evidence. Decision A-F1 (SDK resend, up to 6 HTTP requests): **accept (a)** / **require a code task first (b)**. Decision A-F2 (reasoning budget): **4096 cap, no code change (a)** / **require a code task first (b)**. I understand: no retry after a failure, no other model, no more calls, and that the account entitlement and price are mine to confirm.*

Owner answers (fill in your own message): **YES / NO / CHANGES** · model · spend limit · A-F1 · A-F2 · A3 optional call **include / skip**.

Agent-visible facts for the decision: price for `gpt-6-luna` USD 0.10 / 1M input and 0.50 / 1M output tokens (checked 2026-10-29, recheck on the day); worst-case arithmetic ceiling ≈ USD 0.0021 per call, USD 0.0063 for 3 calls, USD 0.0126 if each request were resent once; a REAL PASS proves two synthetic inputs worked once, not accuracy or reliability.

**Not covered by A:** PayPal in any form; Gate B/C; any other model; hosting; publishing.

---

## Request B — PayPal Sandbox, exactly one new DRAFT

**Request ID:** `R1-B` · **Proposed run ID:** `R1-B-YYYYMMDD-01` · **Expiry:** end of the run, at most 24 hours after approval.

> *I, the project owner, acknowledge that the earlier one-create budget (`NMI-P2-I2-SANDBOX-SMOKE-01`, 1/1) is **exhausted and is not reset or bypassed**, and I **separately authorize exactly ONE new** PayPal **Sandbox** Invoicing v2 draft-create request, through the browser path only, for the single synthetic invoice in section 5.1 of `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` (Northwind Studio, **USD 540.00**, due 2030-01-15), against my existing Sandbox REST app **`NudgeMyBillsAI`** and its Sandbox Business account, plus only the read-only OAuth / show / (if uncertain) search-by-number calls the service itself makes. **No retry of any kind, no second create, no send, remind, payment, cancel, delete, refund, webhook or Live host.** OpenAI stays unset. I will disable drafting and unset the credentials immediately after the run, and I will not ask the agent to delete or alter the resulting Sandbox draft.*

Owner answers: **YES / NO / CHANGES** · confirmation that the dashboard shows the Sandbox app and account · confirmation that the Sandbox invoice count (N) is recorded before the run.

Facts for the decision: the repository has **no in-code counter** for this permit; the bound is procedural plus `attempts=1` and one operation row; the create is irreversible in the sense that the Sandbox draft remains afterwards; an `unknown`/`rejected` outcome ends the run as REAL FAIL with no retry; REAL PASS does not prove search/reconciliation/timeout behaviour.

**Not covered by B:** OpenAI; a second create for any reason (including a video retake); Gate C.

---

## Request C — Combined real-provider browser walkthrough

**Request ID:** `R1-C` · **Precondition:** Gate A **REAL PASS** and Gate B **REAL PASS**, each independently reviewed. Do not send this request before then.

> *I, the project owner, authorize one recorded walkthrough in which: the **real OpenAI parse** of one synthetic input (**one** additional call within a **new** Request-A-style cap of `<n ≤ 1>` calls on model `<model>`) is shown live; the invoice is saved and appears on the dashboard; and the **already-existing Gate B Sandbox DRAFT is shown read-only** (detail page / PayPal Sandbox dashboard) and labelled as created in run `<R1-B id>` — **no new PayPal create**. Any step I have not authorized is labelled SIMULATED. Credentials stay private; the video is not uploaded or submitted by this authorization.*

Optional **Request C+** (default **NOT requested**): a **third** PayPal create live during the recording. If the owner ever wants it, it must be a new, separate Request B-style form with its own run ID and expiry; this document does not ask for it.

Owner answers: **YES / NO / CHANGES** · model · call cap · whether C+ is wanted (default no).

**Not covered by C:** uploading to YouTube, submitting to Devpost, deploying, hosting, publishing.

---

## Record of answers (owner fills; the agent never edits this table)

| Request | Answer | Date / time (PHT) | Run ID | Expiry | Used? |
| --- | --- | --- | --- | --- | --- |
| R1-A | **NOT AUTHORIZED** | — | — | — | No |
| R1-B | **NOT AUTHORIZED** | — | — | — | No |
| R1-C | **NOT AUTHORIZED** | — | — | — | No |
