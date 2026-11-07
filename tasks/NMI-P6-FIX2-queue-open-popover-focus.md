# NMI-P6-FIX2 — Close Nudgey popover and focus heading on already-mounted queue open; reconcile P6 status

**Status:** In progress on `fix/nmi-p6-postmerge-ux` from `main@0b652348dfc546b4e9bc5bbf2e5a21fef142c124`.
**UI design gate:** Low-risk defect remediation within the owner-approved P6 D1–D7 screens (PR #43 comment 6652365002); no visual layout, design-token, component, API, schema, or product-behavior changes. Preserves screen-reader heading focus (`#nq-title`), 390 px layout, ≥44 px touch targets, and light/dark themes.

## Context & Defect

1. **Stale P6 post-merge status:** `docs/STATUS.md` and `tasks/NMI-P6-AI-NUDGE-INTELLIGENCE.md` still list the two PR #43 Codex review `5787025325` UX findings as *"not fixed, not independently verified"*, even though PR #45 (`0e10e8d1f6d521bba9b0c503f4ce0fdf188ded19`, slice P7-A) already merged audited fixes and tests for both on `main`.
2. **Residual already-mounted "Open in queue" UX defect:** On `NudgeQueueScreen` (`state.screen === "nudges"`), clicking **Draft a nudge** opens the Nudgey chat popover over the mounted queue. When the operator finishes drafting (or hits `pending-exists`) and clicks **Open in queue** / **Open existing in queue**:
   - `apps/web/src/components/Nudgey.tsx` (`onOpenQueue`) dispatches `{ type: "open-nudges", view: "pending", id }` without calling `setOpen(false)` (unlike `openInvoiceById`, `openDashboard`, `openStatusInvoice`, and `choose`), and its close effect watches `[state.screen]` only. Because `state.screen` stays `"nudges"`, the Nudgey dialog remains open over the review panel (visible in `design/evidence/NMI-P7/screenshots-p7a/p7a-02-queue-retargeted-desktop-light.png`, and covering the viewport on 390 px mobile).
   - `apps/web/src/nudges/NudgeQueueScreen.tsx` re-applies `view` and `selected` on a new `nudgeFocus` object, but does not move keyboard/assistive focus to `#nq-title` (`headingRef.current?.focus()`), leaving focus stranded when the popover unmounts.

## Scope

- **Allowed files:**
  - `tasks/NMI-P6-FIX2-queue-open-popover-focus.md` (this task contract)
  - `apps/web/src/components/Nudgey.tsx`
  - `apps/web/src/nudges/NudgeQueueScreen.tsx`
  - `apps/web/src/nudges/NudgeQueue.test.tsx`
  - `apps/web/src/invoices/leaveGuard.test.ts`
  - `design/evidence/NMI-P6-FIX2/` (focused browser QA runner, results JSON, summary, and synthetic screenshots)
  - `docs/STATUS.md`
  - `tasks/NMI-P6-AI-NUDGE-INTELLIGENCE.md`
  - `docs/HANDOFFS.md`
- **Forbidden scope:**
  - Database schema, migrations, runtime-role SQL, API routes, AI/PayPal provider clients, P5 Studio/CSP/analytics, historical `design/evidence/NMI-P6/` and `design/evidence/NMI-P7/` artifacts (including `run-nudge-recovery-drill.mjs`), Issue #49 files (`scripts/preflight-provision-operator.mjs`, `docs/NMI-DEMO-JUDGE-RUNBOOK.md`, `README.md`), Render resources, deployment, merge, or live provider calls.
- **Schema / API / security / billing / deployment / user-data impact:** None. Preserves session authentication, CSRF/Origin, `NUDGE_AI_DRAFTING_ENABLED=false`, `PAYPAL_DRAFTS_ENABLED=false`, version-bound transitions, `mustConfirmLeave` review save guard, local-speech unmount abort, and strict no-send boundaries.

## Acceptance Criteria & Test Objective

1. Clicking **Open in queue** or **Open existing in queue** inside Nudgey while `NudgeQueueScreen` is already mounted closes `.nudgey-panel` (`open === false`), resets Nudgey's transient chat/speech state via its existing close effect, switches the mounted queue to the requested tab and nudge ID, and focuses `<h1 id="nq-title">`.
2. Any same-screen action that increments `state.seedKey` (`open-nudges`, `open-saved`, `resetComposer`) also closes an open Nudgey popover; `mustConfirmLeave` on `ReviewScreen` still intercepts `open-nudges` when a save is `pending` or `uncertain`.
3. Ordinary manual tab/row selections on `NudgeQueueScreen` are never overwritten when no new `open-nudges` request arrives, and clearing `nudgeFocus` (`navigate` to `"nudges"`) resets `seeded.current` cleanly.
4. **Test objective:** Deterministic Vitest DOM regressions prove the integrated `AppShell` (`Nudgey` + `NudgeQueueScreen`) closes `.nudgey-panel`, focuses `#nq-title`, selects the requested nudge across consecutive same-screen drafts (`Draft a nudge` → draft → `Open in queue` → `Draft a nudge` → `pending-exists` → `Open existing in queue`), aborts active local speech on close, and respects `mustConfirmLeave`; real headless Chrome QA (1280 px + 390 px, light + dark, fake model, disposable PostgreSQL 16) verifies zero popover overlap, `#nq-title` focus, ≥44 px mobile targets, computed WCAG AA contrast, and zero send/provider calls; full `pnpm validate` and `pnpm test:db` pass.
5. `docs/STATUS.md` and `tasks/NMI-P6-AI-NUDGE-INTELLIGENCE.md` accurately reflect P7-A's merged closure, this P6-FIX2 follow-up, PR #50's merge on `main@0b65234`, and all unchanged open release gates.
