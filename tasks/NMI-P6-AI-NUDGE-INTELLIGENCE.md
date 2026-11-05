# NMI-P6 — AI Nudge Intelligence

**Status:** backend implemented and tested; **UI design awaiting owner approval** (`design/screens/NMI-P6-AI-NUDGE-QUEUE.md`). Not merged or deployed.
**Base:** stacked on accepted P5 (Draft PR #42 at `7ab0dcd50e35e12f4f579be4929c5a7753221e2a`, itself on PR #41). P5 is preserved exactly.
**UI design gate:** **required and OPEN.** The screen map, flows, states and previews are submitted. The UI shell, dashboard integration and Nudgey wiring start only after owner approval.

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
- **Next (after approval):** UI shell → wiring → browser QA → CI → independent review.
