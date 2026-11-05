# NMI-P6 — AI Nudge Intelligence

**Status:** backend + approved UI implemented and tested; **awaiting independent exact-HEAD audit**. Not merged or deployed, not complete.
**Base:** stacked on accepted P5 (Draft PR #42 at `7ab0dcd50e35e12f4f579be4929c5a7753221e2a`, itself on PR #41). P5 is preserved exactly.
**UI design gate:** **CLOSED / APPROVED** by the owner (D1–D7) on PR #43, https://github.com/mrdzyn/nudgemyinvoice/pull/43#issuecomment-6652365002 (2026-11-05), with three mandatory refinements (below), all implemented.

## Scope
- **Allowed:**
  - nudge persistence (migration `0008`, store, runtime-role grants);
  - validated server-side AI drafting (`packages/ai/src/nudge.ts`) behind a provider seam;
  - authenticated review API and audit actions;
  - after approval: the queue UI, dashboard card, saved-invoice draft card and Nudgey drafting intent (reusing on-device speech);
  - tests, design previews and QA evidence.
- **Forbidden:**
  - any outbound e-mail, SMS, WhatsApp, PayPal reminder, scheduling, automatic dispatch or background job;
  - live OpenAI/PayPal calls (Gate A/B);
  - fictional recovered cash, delivery or payment events, or risk predictions;
  - changes to P5's charts, filters, licence or security controls;
  - merge, deploy, Render or publication.

## Acceptance
1. Drafts come only from verified, operator-owned invoice data.
   - The model receives no customer data, amounts, dates or IDs.
   - Output is validated; anything invalid is refused and never stored.
   - Friendly, professional and firm tones are supported.
2. Persistence covers invoice association, the reviewed message, the immutable AI original, the rationale, the facts snapshot, the model, the prompt version, timestamps, status and version. Operators are strictly isolated, with at most one pending draft per invoice.
3. Review, edit, approve (for manual use), reject and copy, all version-bound. Nothing is sent.
4. Prominent dashboard integration with real counts and all required states; P5 unchanged.
5. Nudgey drafting with a confirmation step; speech input is reused, not extended.
6. Evidence: targeted API, database and UI tests, desktop and mobile browser QA with screenshots (synthetic data, fake model), `pnpm validate`, `pnpm test:db`, and both hosted CI workflows at the exact head.

## Progress
- **Done (backend):**
  - `invoice_nudges` + migration `0008` with constraints;
  - least-privilege grants;
  - `PostgresNudgeStore`;
  - `draftNudge` validation;
  - routes in `apps/api/src/routes/nudges.ts`;
  - nudge audit actions.
- **Tests:** AI 79 (package), store 7 (PostgreSQL), API 12 (PostgreSQL), plus updated migration/constraint/runtime-role guards.
- **Done (owner refinements):**
  1. Unsupported payment-status claims removed: date-only wording in the prompt, the model input (`due_status`) and the UI; a server-side `payment_status_claim` guard on the message AND rationale, with positive and negative tests (AI package) and an API 422 test; prompt version `p6-nudge-v2`.
  2. The tone select keeps "Professional" fully visible at 390px (`min-width: 10.5rem`); measured in browser QA.
  3. Mobile targets ≥ 44px, asserted in browser QA for every P6 surface (and in the corrected preview builder).
- **Done (D6 contract):** OpenAI nudge client `maxRetries: 0`, proven to make exactly one request on 429/500/503 via an injected `fetch` (negative control with `maxRetries: 1` fails the test); output cap 600 and `store: false` asserted.
- **Done (UI, approved frames 01–07):**
  - `apps/web/src/nudges/` — typed strict transport (`api.ts`), controller (real counts, 401 → session end, no polling), queue screen (Pending / Approved / History tabs, ARIA tablist, review panel with verified facts, edit/save, approve-for-manual-use, reject with confirmation, regenerate with confirmation, Copy only after approval), dashboard summary card (slot above the unchanged P5 filters), saved-invoice drafting card.
  - Nav "Nudge queue" tab with real pending badge (desktop) and "Nudges" (mobile).
  - Nudgey: deterministic draft intent (`nudgey/nudgeIntent.ts`), explicit invoice choice + confirmation before each costed draft (`NudgeDraftFlow.tsx`), clear refusal of send/e-mail/text/schedule requests; existing on-device speech reused unchanged.
  - All states: loading, empty, error + Retry, AI off, refused, rate-limited, busy, pending-exists, version-conflict / not-pending.
- **Evidence:** web unit/DOM tests (transport 29, intent 27, queue/card UI 22, chat flow 7); `pnpm validate` (1341 passed); `pnpm test:db` (366 passed, disposable PostgreSQL 16); browser journey `design/evidence/NMI-P6/run-nudge-journey.mjs` 150/150 with 35 synthetic screenshots (desktop + 390px, light + dark) — see `design/evidence/NMI-P6/QA-RESULTS.md`; corrected design preview 25/25.
- **Limitations:** fake model only (live OpenAI = Gate A, NOT AUTHORIZED); drafts cannot mention line items (D4); no axe-core in the repo (contrast is computed in-page, plus structural checks); the queue re-reads on open and after your own changes, not on a timer (no polling by design).
- **Next:** independent exact-HEAD audit → owner merge sequencing (#41 → #42 → #43). No merge or deploy by the implementation agent.
