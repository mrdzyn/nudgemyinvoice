# NMI-P6-FIX2 — Browser QA Evidence Summary

- **Task:** `tasks/NMI-P6-FIX2-queue-open-popover-focus.md`
- **Implementation SHA:** `03f743a569e2e220cbd26f18750b86a2cb0f9d7a` (`sourceTreeDirtyAtRun: []`)
- **Runner:** `design/evidence/NMI-P6-FIX2/run-p6-fix2-journey.mjs`
- **Machine-readable results:** `design/evidence/NMI-P6-FIX2/qa-results.json`
- **Outcome:** **41/41 PASS** (implementation-agent local evidence; not independently rerun)
- **Model / data:** Deterministic fake model (no OpenAI call); synthetic operator and synthetic invoices (`Zorblax Industries`, `Northwind Studio`, `Bluebird Bakery`, `Zorblax Logistics`); disposable local PostgreSQL 16 (`0000`–`0008` + `packages/db/ops/runtime-role.sql`), confirmed stopped (`pg_ctl status` exit `3`) before deleting the temporary cluster directory.

## Verified Journey & Accessibility Checks

1. **Desktop (1280x900, light + dark) — already-mounted queue `Open in queue`:**
   - Operator starts on the mounted `NudgeQueueScreen` (`History` tab), clicks **Draft a nudge**, drafts a friendly nudge for `Zorblax Industries`, and clicks **Open in queue**.
   - `.nudgey-panel` closes immediately (`document.querySelector(".nudgey-panel") === null`), `document.activeElement.id === "nq-title"`, the mounted queue switches to `Pending review` and selects `Zorblax Industries`, and `document.elementFromPoint(...)` confirms **Approve for manual use**, **Save edits**, **Regenerate**, and **Reject** are completely unoccluded (`fix2-01-after-open-in-queue-desktop-light.png`).
2. **Desktop (1280x900, light + dark) — consecutive same-screen `Open existing in queue`:**
   - Without reloading the page, the operator switches to `Approved`, clicks **Draft a nudge** again (verifying the previous Nudgey chat log cleared on close), triggers `pending-exists` on `Northwind Studio`, and clicks **Open existing in queue**.
   - `.nudgey-panel` closes again, focus returns to `#nq-title`, the mounted queue switches from `Approved` to `Pending review` and selects `Northwind Studio`, and review controls remain unoccluded in both light (`fix2-02-after-open-existing-desktop-light.png`) and dark (`fix2-03-queue-desktop-dark.png`) modes.
3. **Mobile (390x844, light + dark) — already-mounted queue `Open in queue`:**
   - On an emulated 390x844 viewport starting on `History`, clicking **Draft a nudge** -> drafting `Zorblax Logistics` -> clicking **Open in queue** closes `.nudgey-panel`, focuses `#nq-title`, leaves zero horizontal overflow, keeps `"Professional"` fully visible in the tone `<select>`, keeps every interactive P6 control `>= 44px` tall, and passes computed WCAG AA text contrast and accessible-name checks in both light (`fix2-04-after-open-in-queue-mobile-light.png`) and dark (`fix2-05-queue-mobile-dark.png`) modes.
4. **Security & non-send boundaries:**
   - Zero requests to any foreign host; zero send/schedule/dispatch/approve/reject/copy calls; all 4 rows remain `pending_review`; every fake-model input is customer-free; zero console errors or uncaught page exceptions.

## Screenshots (`design/evidence/NMI-P6-FIX2/screenshots/`)

- `fix2-01-after-open-in-queue-desktop-light.png` — Desktop light immediately after clicking **Open in queue** on an already-mounted queue (compare against pre-fix `design/evidence/NMI-P7/screenshots-p7a/p7a-02-queue-retargeted-desktop-light.png` where `.nudgey-panel` remained open over **Regenerate**/**Reject**).
- `fix2-02-after-open-existing-desktop-light.png` — Desktop light immediately after a second consecutive same-screen **Draft a nudge** -> **Open existing in queue** flow without page reload.
- `fix2-03-queue-desktop-dark.png` — Desktop dark theme on the re-targeted review panel.
- `fix2-04-after-open-in-queue-mobile-light.png` — 390x844 phone light immediately after clicking **Open in queue** on an already-mounted queue.
- `fix2-05-queue-mobile-dark.png` — 390x844 phone dark theme on the re-targeted review panel.

## Explicit Limitations

- Uses a deterministic fake model and synthetic data only (`NUDGE_AI_DRAFTING_ENABLED` remains `false` by default; live OpenAI Gate A, PayPal Gate B, and SMTP Gate C remain **NOT AUTHORIZED**).
- Runs in headless Chrome with emulated desktop/phone viewports; real Safari/Firefox, physical touch devices, VoiceOver/NVDA screen readers, 400% browser zoom, and HTTPS `__Host-` cookie behavior behind a hosted reverse proxy remain **NOT PERFORMED** here and stay open under `docs/STATUS.md`.
