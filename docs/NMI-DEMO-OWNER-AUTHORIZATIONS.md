# NudgeMyInvoice — Owner authorization requests (UNANSWERED)

> **Status of all three requests: NOT AUTHORIZED.** **Request B is additionally BLOCKED**: FIX-B1 passed independent audit (review `5692753316`) and was owner squash-merged into `main` at `09bbe90a977516c27bc0715141e74e090b41fba5`. Its locally tested no-resend code is not real-provider evidence. The live server-to-PayPal send-attempt observation procedure (`docs/NMI-DEMO-R1-B-WIRE-COUNT.md`, observer SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`): Offline validated by the implementation agent (loopback and network-sandbox only; `docs/NMI-DEMO-R1-B-WIRE-OFFLINE-TESTS.md`); **not independently reproduced, not independently audited, not owner-merged**, and never run against the real PayPal Sandbox. Gate B remains **BLOCKED / NOT AUTHORIZED**. No new Request B is requestable until the procedure is independently audited (and ideally independently reproduced), the readiness documentation is owner-merged, and a fresh written one-create permit is separately issued. This file contains forms only. The coding agent never signs, answers or infers an answer. An authorization exists only if the owner writes it in a **new message to the orchestrating reviewer/agent** (or in a dated, owner-signed record committed by the owner) that **quotes the request ID, run ID, model and limits** below. Silence, "go ahead", "next", a documentation merge, a passing audit, or approval of a different request is **NO**. Each authorization expires at the end of its run or at the stated expiry, whichever is first, and cannot be reused.

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

**Request ID:** `R1-B` · **FIX-B1 code merged:** independently audited PR #19 (`5692753316`) was owner squash-merged at `09bbe90a977516c27bc0715141e74e090b41fba5`. The old create-side 401 resend defect is no longer in `main`: one create invocation emits at most one create POST and an uncertain create 401 leads to read-only reconciliation. **Remaining BLOCKER:** a method to count actual **backend-originated HTTP send attempts**, not browser requests or database claims, has been offline-tested by the implementation agent on the real Node/tsx server (local-only tests) but must still be independently audited, owner-merged and used only under a new Request B. Procedure: `docs/NMI-DEMO-R1-B-WIRE-COUNT.md` (SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`) — offline validated by the implementation agent only; not independently reproduced, audited or merged. Then issue a **new** written Request B for one synthetic USD 540.00 draft, without resetting the prior exhausted 1/1 permit. All authorizations remain NOT AUTHORIZED.

The form below is the **draft for the future request** (not answerable now):

**Proposed run ID:** `R1-B-YYYYMMDD-01` · **Expiry:** end of the run, at most 24 hours after approval.

> *I, the project owner, acknowledge that the earlier one-create budget (`NMI-P2-I2-SANDBOX-SMOKE-01`, 1/1) is **exhausted and is not reset or bypassed**, and that the PayPal client fix `09bbe90a977516c27bc0715141e74e090b41fba5` is merged and independently audited, and that the audited and owner-merged observer procedure `docs/NMI-DEMO-R1-B-WIRE-COUNT.md` at commit `<sha>` with preload SHA-256 `<hash>` (agent-computed: `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`) has been offline validated and independently audited, and that I will start the server with it, check the listening PID and a zero-count snapshot before the single click, stop with Ctrl-C, and treat a missing, incomplete or ambiguous summary, any STOP line, `create` other than 1, or any `unexpected`/`foreign` send as a failed run with no retry. I **separately authorize exactly ONE new** PayPal **Sandbox** Invoicing v2 draft-create **HTTP request** (counted on the wire), through the browser path only, for the single synthetic invoice in section 5.1 of `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` (Northwind Studio, **USD 540.00**, due 2030-01-15), against my existing Sandbox REST app **`NudgeMyBillsAI`**, plus only the read-only OAuth / show / (if uncertain) search-by-number calls the service itself makes. **No retry of any kind, no second create, no send, remind, payment, cancel, delete, refund, webhook or Live host.** OpenAI stays unset. I will disable drafting and unset the credentials immediately after the run. Database after the run: **drop (default)** / **preserve under the retention plan in section 6.3** (explicitly chosen). I will not ask the agent to delete or alter the resulting Sandbox draft.*

Owner answers (when unblocked): **YES / NO / CHANGES** · merged fix commit · approved observer procedure commit/hash and offline proof · drop or preserve the database · Sandbox invoice count (N) recorded before the run. **No answer has been provided.**

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
