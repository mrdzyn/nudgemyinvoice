# NudgeMyInvoice — Owner authorization requests (UNANSWERED)

> **Status of all three requests: NOT AUTHORIZED.** **Request B is additionally BLOCKED** (the PayPal client can resend a draft-create POST after HTTP 401; `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` section 5.0) and must not be answered YES until a separately approved, independently audited code fix is merged. This file contains forms only. The coding agent never signs, answers or infers an answer. An authorization exists only if the owner writes it in a **new message to the orchestrating reviewer/agent** (or in a dated, owner-signed record committed by the owner) that **quotes the request ID, run ID, model and limits** below. Silence, "go ahead", "next", a documentation merge, a passing audit, or approval of a different request is **NO**. Each authorization expires at the end of its run or at the stated expiry, whichever is first, and cannot be reused.

Common conditions for every request: the **owner** (not the coding agent) holds the credentials and executes the checklist; credentials are never pasted into chat, a ticket, a commit or a screenshot; results use the REAL / PENDING / SIMULATED labels and the redacted templates in `docs/NMI-DEMO-EVIDENCE-TEMPLATES.md`; **no product or provider code changes** are part of any request (a code change is its own task and its own approval).

---

## Request A — OpenAI Responses (real parsing)

**Request ID:** `R1-A` · **Proposed run ID:** `R1-A-YYYYMMDD-01` · **Expiry:** end of the run, at most 24 hours after approval.

**The owner must choose exactly one request-count path (otherwise the answer is NO).** Three application parse attempts are **not** three provider requests: the OpenAI client has `maxRetries: 1`, so the provider can receive up to **six** wire requests.

- **Path A-strict (at most 3 provider requests):** requires a **separate, approved and independently audited code fix** (`maxRetries: 0` with a test that one failure yields one request) **merged first**. Request A cannot use this path until then.
- **Path A-six (up to 6 provider requests):** valid today.

> *I, the project owner, authorize **at most 3 parse attempts** with model **`gpt-6-luna`** (or: `<other model I name>`), only with the three synthetic input strings in section 4.4 of `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`, executed by me with a dedicated key under a provider-side spend limit of **USD `<amount>`**, with PayPal drafting **disabled and PayPal credentials unset**, `OPENAI_MAX_OUTPUT_TOKENS=`**`4096`** (or `<value>`), and redacted evidence. **Request-count path: A-strict, fix merged at commit `<sha>`** — OR — **A-six: I explicitly accept up to SIX actual OpenAI requests (each attempt may be resent once), a worst-case arithmetic cost of about USD 0.0126, and I will record the provider-reported request count.** No retry after a failure, no other model, no more attempts. Account entitlement and price are mine to confirm.*

Owner answers: **YES / NO / CHANGES** · model · spend limit · path A-strict (with fix commit) or A-six · reasoning-budget choice (`4096` cap, or a separate audited code task first) · optional third input A3 **include / skip**.

Agent-visible facts: `gpt-6-luna` price USD 0.10 / 1M input and 0.50 / 1M output tokens (public pages checked 2026-10-29; recheck on the day); worst-case arithmetic: about USD 0.0021 per request, 0.0063 for 3, 0.0126 for 6; a REAL PASS proves two synthetic inputs worked once, nothing about accuracy or reliability.

**Not covered by A:** PayPal in any form; Gate B/C; another model; hosting; publishing.

---

## Request B — PayPal Sandbox, exactly one new DRAFT — **BLOCKED, do not answer YES**

**Request ID:** `R1-B` · **Fix status (information only, no answer given):** implemented on Draft PR #19 (`90aba259ef0f6643f428d3bd9b7bb2e1d16cd230`), not audited, not merged. **Block:** `packages/paypal/src/client.ts` resends a draft-create `POST` after HTTP 401 and `client.test.ts` asserts two create POSTs, so "exactly one create request" cannot be guaranteed. **Unblock conditions** (acceptance doc 5.0): a separate fix task that never resends a create after 401, keeps the safe refresh for read-only calls, fails closed without recreating and tests that one 401 yields exactly one create POST; independent exact-head audit; merged to `main`; this form updated to cite the fix commit and to count **wire** requests. Only then may the owner be asked again.

The form below is the **draft for the future request** (not answerable now):

**Proposed run ID:** `R1-B-YYYYMMDD-01` · **Expiry:** end of the run, at most 24 hours after approval.

> *I, the project owner, acknowledge that the earlier one-create budget (`NMI-P2-I2-SANDBOX-SMOKE-01`, 1/1) is **exhausted and is not reset or bypassed**, and that the PayPal client fix `<sha>` (never resends a create after 401) is merged and audited. I **separately authorize exactly ONE new** PayPal **Sandbox** Invoicing v2 draft-create **HTTP request** (counted on the wire), through the browser path only, for the single synthetic invoice in section 5.1 of `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` (Northwind Studio, **USD 540.00**, due 2030-01-15), against my existing Sandbox REST app **`NudgeMyBillsAI`**, plus only the read-only OAuth / show / (if uncertain) search-by-number calls the service itself makes. **No retry of any kind, no second create, no send, remind, payment, cancel, delete, refund, webhook or Live host.** OpenAI stays unset. I will disable drafting and unset the credentials immediately after the run. Database after the run: **drop (default)** / **preserve under the retention plan in section 6.3** (explicitly chosen). I will not ask the agent to delete or alter the resulting Sandbox draft.*

Owner answers (when unblocked): **YES / NO / CHANGES** · fix commit · drop or preserve the database · Sandbox invoice count (N) recorded before the run.

**Not covered by B:** OpenAI; a second create for any reason (including a video retake); Gate C.

---

## Request C — Combined real-provider browser walkthrough (depends on Gate B; NOT requestable yet)

**Request ID:** `R1-C` · **Preconditions:** Gate A **REAL PASS** and Gate B **REAL PASS** (Gate B cannot pass while blocked), each independently reviewed. Do not send this request before then.

Why the earlier plan changed: Gate B drops its disposable database, so the Gate B invoice and operation row **no longer exist in any app database**; the app cannot reopen them later.

> *I, the project owner, authorize one recorded walkthrough on a fresh disposable database in which: the **real OpenAI parse** of **one** synthetic input from section 4.4 is shown live within a **new** cap of `<n ≤ 3>` parse attempts on model `<model>` under path `<A-strict fix sha | A-six: up to 2n wire requests>`; the **only in-app invoice records created** are the ones I list here: `<name, currency, amount>`; and the **Gate B Sandbox DRAFT is shown read-only in the PayPal Sandbox dashboard**, labelled as created in run `<R1-B id>` and **not linked to the app records in the recording**. **No PayPal create and no PayPal request is made by the recording.** Everything else is labelled SIMULATED or RECORDED EARLIER.* — OR, only if Request B chose **preserve**: *the walkthrough instead uses the restored Gate B database under the retention plan in 6.3, with PayPal credentials unset and drafting false.*

Owner answers: **YES / NO / CHANGES** · model and cap · the explicit list of in-app invoices to be created · default (dashboard read-only) or approved preserved-database option.

**Not requested (each needs its own separate permission):** a live second PayPal create, any invoice created implicitly, uploading to YouTube, deploying/hosting or provisioning anything, publishing, Devpost submission.

---

## Record of answers (owner fills; the agent never edits this table)

| Request | Answer | Date / time (PHT) | Run ID | Expiry | Used? |
| --- | --- | --- | --- | --- | --- |
| R1-A | **NOT AUTHORIZED** | — | — | — | No |
| R1-B | **NOT AUTHORIZED (BLOCKED)** | — | — | — | No |
| R1-C | **NOT AUTHORIZED** | — | — | — | No |
