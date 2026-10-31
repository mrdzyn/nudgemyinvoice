# NMI-NDG-02 C2 — Natural-language follow-up scheduling

**State:** Product-owner flow/design **APPROVED**; implementation ready to begin on the existing Draft PR. No functional C2 code has been delivered yet.  
**Base:** `main` at `9f23ef40dd8a7b8b99303cdd4ee3659500d86a35` after independently audited and owner-approved PR #27.  
**Scope authority:** Owner instruction "start NMI-NDG-02 C2".  
**Design preview:** [Nudgey C2 scheduling states](../design/mockups/NMI-NDG-02-C2-scheduling.html).  
**Human design decision:** APPROVED by owner on 2026-10-31 (proposal → explicit invoice selection → editable existing scheduler → manual Save). Implementation is now authorized within this task's safe boundaries; merge and deployment remain unapproved.

## Goal and non-negotiable behavior

An authenticated operator can type a constrained natural-language follow-up command, e.g. **"Remind me to follow up with Northwind Studio tomorrow at 9 AM"**. Nudgey proposes an invoice and local date/time, asks for clarification if needed, and opens the **existing editable ScheduleForm** with a visibly marked proposed prefill. Only a separate explicit operator click on **Save follow-up** can POST to the existing `/api/follow-ups` endpoint. Chat text and previews themselves NEVER save, email, notify, schedule jobs, access PayPal, or call an LLM. "Follow-up" remains a **local reminder for the operator**, not a customer notification or payment-status claim.

C2 adds a bounded deterministic intent/field parser plus read-only invoice candidate resolution and form handoff. C1 read-only questions, manual scheduler, PR #28 status selector, auth/session guards, and the PR #26 401/read generation protections must remain intact.

## UI screen map / flow (all inside authenticated Nudgey)

1. **Ask:** Operator submits a prompt. Existing C1 read-only intents behave unchanged. C2 candidate recognition is evaluated only for a clear scheduling command, before C1 generic-help fallback; ambiguous "send", "email", "mark paid", "cancel", or "auto" actions remain refused.
2. **Candidate:** Show customer search phrase, proposed **date + time in the browser's IANA zone**, and explicit label **"Proposal only — nothing scheduled"**. Search the existing owner-scoped invoice API: `POST /api/invoice-drafts/search` with `q` only in body, bounded page ≤20, AbortSignal, same authenticated transport. Never put names or prompts in URLs, analytics or storage.
3. **Disambiguation:** Exactly one verified matching invoice -> show a selectable candidate (still require operator selection/confirmation); multiple matches -> list distinct verified invoice IDs, customer and amount/currency/due date, requiring explicit choice. No match, truncated page, or unknown/rejected response -> ask operator to refine the search or choose manually in the existing scheduler, no silent first-match or false "none" claims. If a customer has two invoices, never choose solely from customer name.
4. **Clarification:** Missing/ambiguous date or time, unspecified AM/PM in 12-hour format, DST gap/overlap, invalid zone, past instant, ambiguous customer, or unsupported phrasing -> show an honest prompt and/or open the existing manual form **without prefilled ambiguous values**. Do not guess.
5. **Review:** After operator selects an exact invoice, use a single-use ephemeral candidate object to open the **existing ScheduleForm in create mode**. Visibly label inferred prefill. Fields remain editable: invoice, date, time, note and proposed message. Existing Save button performs the ONLY mutation. Existing server-side duplicate-active-follow-up, operator ownership, time, CSRF and Origin checks remain authoritative. No submit from the chat/candidate UI.
6. **Return/clear:** Back from form returns to Ask Nudgey or home without scheduling; Close/Escape/outside/sign-out/401/navigation/new incompatible prompt cancels lookup and discards candidate. No session cross-contamination, transcript persistence, localStorage or query params.

## Supported initial grammar (MVP, deliberately narrow)

- `Remind me to follow up with <customer> tomorrow at <time>`
- `Remind me to follow up with <customer> today at <time>`
- `Schedule a follow-up for <customer> on YYYY-MM-DD at <time>`
- Time: unambiguous `9 AM`, `9:30 PM` or `21:30`; 12-hour bare `9` needs clarification; no timezone abbreviation guessing.
- Name: nonempty normalized customer phrase (2–100 chars); cap entire prompt at C1's existing 200 chars; reject control chars before whitespace normalization.
- Unsupported grammar: `next Friday`, numeric locale-ambiguous dates (`11/12`), month-name-only dates without year, recurring reminders, "in two hours", "send customer a reminder", or missing required field -> explicit clarification/manual entry, **not** unexpected scheduling.
- Date/time evaluated against an **injected clock** at attempt time and the **operator's current browser IANA zone** (not hardcoded Asia/Manila). The time shown in the candidate and carried into form must refer to the same local wall time and zone. Validate skipped/repeated DST times rather than silently rounding; on timezone change or stale candidate require reconfirmation. If the browser cannot report a reliable IANA zone, do not infer a timestamp: require manual input and zone confirmation.
- **Example:** If the browser zone is `Asia/Manila` and "now" is Oct 31, 2026, `tomorrow at 9 AM` is **Nov 1, 2026, 09:00 Asia/Manila**. Do not treat this example fixture as the current date at runtime.

## Interface contracts / implementation guidance

- Add pure `apps/web/src/nudgey/scheduleIntent.ts` and `scheduleIntent.test.ts`: return discriminated `proposal | clarify | unsupported`, with parsed local date/time and customer term, **not** a side effect. It must not degrade C1 paid/unpaid/payment refusals or reinterpret searches such as "Find invoices for Unpaid Ventures".
- Add narrow `scheduleCandidate.ts` state machine/controller and focused tests: candidate lookup and stable ID selection, cancellation, late 401/session-expiry, stale non-401 rejection, empty/multi/truncation/retry; no writes. Use the already-authorized `session.listInvoices` and existing `ListItem`/invoice types.
- Extend Nudgey's `ChatSession`/view through explicit typed results and callbacks; **no arbitrary LLM tool execution**, no OpenAI call. Preserve read-only C1 semantics for all old intents. Separate proposed action from operator's final manual form submit.
- Extend existing `ScheduleForm` only as needed to accept a prefill **for create mode**, generated from a selected verified invoice ID and local date/time. Existing `initial` currently also controls reschedule and requires an editable message; do not impersonate reschedule mode or carry a stale `edited` state. Supply the resolved invoice as a select option even if it was outside the first 50 of the manual form's general list; do not invent records or weaken owner scope. Key form instance by candidate generation/ID so an older candidate cannot repopulate it.
- Reuse `checkSchedule`, `toUtcInstant`, `buildFollowUpMessage`, original mutation controller and duplicate handling. Do not use the current default "tomorrow 9 AM" when input is incomplete unless the operator explicitly selects that default in the manual form.
- Data boundary: only existing owner-scoped authenticated reads until the operator presses Save; no additional backend endpoint, migration, table, package, telemetry, secret or provider integration. Never claim payment status from a PayPal draft.

## Design states / accessibility

Preview includes: (A) proposal and exact selection; (B) several matching invoices requiring a choice; (C) editable prefilled existing scheduler. Implement corresponding loading, offline/403/500, invalid, no-match, truncation, 401/signout, duplicate, cancellation and Back/Close states. Avoid text-only apparent selection; use native radio/button, semantic labels and focus. Announce concise proposed time and zone, not a long invoice list. Target keyboard/Touch, Escape focus return, 390px, 400% zoom, reduced motion, light/dark using current semantic tokens. Preview is static synthetic design evidence, **not** working code or functional confirmation.

## Acceptance tests and stop rule

**Test objective:** A deterministic natural-language command produces only a proposed, exact invoice/time prefill; *no request writes anything* until the existing operator Save, including every ambiguity and failure path.

- Pure clock/zone/parser matrix: today/tomorrow/YMD; 12h/24h; control chars, hostile prompts, omitted/ambiguous time, invalid/past date, DST gap/overlap, injected now/day rollover, IANA zone change, unsupported recurrence. Avoid relying on host/test machine timezone.
- Controller tests: exact/multiple/zero/truncated owner-scoped results, request body privacy, cancellation/replacement/late 401, stale responses, explicit invoice selection, no auto-selection or write, no storage, rejected prompt.
- Form tests: candidate prefill matches chosen invoice and local moment, message editable, explicit Save creates at most one local follow-up, duplicate refusal, errors/retry, Back/Escape/sign-out discard. Ensure the prefilled invoice is present even if outside the manual initial list page.
- Browser no-provider acceptance: desktop + 390px mobile, keyboard/Escape and focus, selection/multi-match/clarification/Retry, local-only state, and preserved C1/status/scheduler guards; use disposable PostgreSQL and synthetic data. No owner's DB or provider requests.
- Follow `docs/TESTING.md`: focused tests then required Project Baseline and Stack hosted CI at exact implementation HEAD, human visual approval, independent exact-HEAD audit; never merge/deploy without separate approval.

## Current gate

This PR began **design/spec only**; the owner subsequently approved the flow on 2026-10-31. Implementation may proceed as separately reviewed commits on this Draft PR (or a bounded successor), preserving the approved static UI contract. No merge/deployment permission follows from approval. No OpenAI/PayPal/SMTP requests, email, provider tests, database migration, deployment or release is authorized. C3 outbound messaging remains separate and unapproved.

## V1 on-device speech input — separately approved but NOT part of C2 wiring

The owner approved optional voice entry on 2026-10-31 with a **strict on-device-only transcription** requirement. Delivery is a separate bounded post-C2 follow-on task/PR: check native browser support for `SpeechRecognition.processLocally`, `available({ langs, processLocally:true })`, local language packs and user-gesture consent; if local processing cannot be guaranteed, disable the mic and retain typed input. A one-time language-pack download may require explicit operator consent; never use cloud fallback, OpenAI STT, raw audio upload, transcript storage, automatic Ask submission, or auto-schedule. Preserve 401/session/Close/Back cleanup. See owner decision on PR #29. **Do not expand C2 implementation or mandatory test scope to V1 silently.**
