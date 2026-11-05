# NMI-P6 — AI Nudge Queue: screen map, flows and states

**Status:** **APPROVED** by the owner (D1–D7), https://github.com/mrdzyn/nudgemyinvoice/pull/43#issuecomment-6652365002 (2026-11-05), with three refinements that are now implemented: (1) no unsupported payment-status claims ("still unpaid") — date-only wording plus a server-side output guard; (2) the mobile tone select shows "Professional" in full at 390px; (3) mobile targets are checked at ≥ 44px. The preview below was corrected for (1) and (3) and re-captured (25/25 checks). The implemented UI is evidenced in `design/evidence/NMI-P6/QA-RESULTS.md`.
**Preview:** `design/mockups/NMI-P6-ai-nudge-queue.html` (static, real `tokens.css` + `app.css`, synthetic data). Screenshots are in `design/evidence/NMI-P6/previews/` (desktop 1280 px and mobile 390 px, frames `01`–`07`), and objective checks in `design-checks.json` (24/24).

## 1. Screen map

| # | Screen / region | Where | Purpose |
|---|---|---|---|
| 01 | **AI Nudge Queue** summary card | Dashboard, **between the page heading and P5's filters** (P5's filters → analytics → cards → grid order is untouched) | Real counts (pending review / approved for manual use / history), the three most recent pending drafts, Open queue, Draft a nudge |
| — | **Nudge queue** nav tab with a pending-count badge | Main nav, between "Invoice drafts" and "New invoice" | Entry to the full queue |
| 02 | Queue: **Pending review** | Nudge queue screen | List + review panel: verified facts used, editable message, AI rationale, Approve for manual use, Save edits, Regenerate (tone), Reject |
| 03 | Queue: **Approved** | Nudge queue screen | Read-only approved text, approval time, "Not sent", **Copy message**, original AI draft kept |
| 04 | Queue: **History** | Nudge queue screen | Rejected drafts and drafts replaced by a newer one |
| 05 | **AI payment nudge** card | Saved-invoice detail page | Tone choice (Friendly / Professional / Firm), privacy note, Draft nudge, drafting state |
| 06 | Required states | Queue and drafting | Loading, empty, error + Retry, AI off, draft limit reached, draft refused, changed in another tab, draft already pending |
| 07 | **Nudgey** drafting flow | Existing Nudgey panel | "draft a firm nudge for zorblax" → matching invoice → confirm → draft goes to the queue → Open in queue. The mic reuses the existing on-device speech input. |

## 2. Flows

1. **Draft from an invoice:** saved invoice → AI payment nudge → choose tone → Draft nudge → the draft appears as **Pending review**, and the queue opens on it.
2. **Review:** Pending review → read the verified facts → edit (optional) → Save edits → **Approve for manual use**, or Reject (→ History), or Regenerate with another tone (the old draft → History as "Replaced").
3. **Use:** Approved → **Copy message** → the operator pastes it into their own email or messaging app. The app never sends, schedules or dispatches anything.
4. **Chat:**
   - The operator types or speaks (on-device) "draft a <tone> nudge for <customer>".
   - Nudgey finds the operator's matching saved invoices with the existing lookup; with several matches, the operator picks one.
   - Nudgey asks for confirmation. Every draft is a costed AI call, so it never drafts without a click.
   - The result is a short preview plus Open in queue. Unsupported requests ("send it", "email them") get a clear refusal.

## 3. States and copy rules

- **Counts:** real server counts only. No recovered cash, delivery or read events, payment confirmations, likelihood or risk scores.
- **Not-sent statement:** every screen says nothing is sent. "Approve" is always "Approve for manual use". There is no "Send" button anywhere (the chat submit is "Ask").
- **Loading:** skeletons. Empty: a call to action plus a chat example. Error: Retry, and the invoices are unaffected. AI off (no model configured): review, approve and copy still work. Rate limited: wait time shown. Refused output: nothing saved, try again. Version conflict: reload before approving. Pending exists: replace (old → History) or review the existing draft.
- **Accessibility:**
  - Tabs follow the ARIA tablist pattern, with the list as buttons with `aria-current`.
  - Notices use `role=status`/`alert`, the textarea has a label and a character count, and copy success is announced.
  - All controls are ≥ 44 px on phones (checked at 44 px in the preview and in browser QA).
  - Light and dark themes use tokens only.

## 4. Decisions (approved by the owner)

- **D1 — Placement:** a summary card above P5's filters on the dashboard, plus a "Nudge queue" nav tab. P5's charts, filters, licence and order are not changed.
- **D2 — Copy only after approval:** pending drafts cannot be copied, to encourage review.
- **D3 — One pending draft per invoice:** regenerating replaces it, and the old one moves to History as "Replaced".
- **D4 — Privacy-first generation:**
  - The model receives **only** the tone, currency code, a due-status bucket and whether an earlier nudge was approved. It never gets the name, e-mail, items, amounts, dates or IDs.
  - The real values are filled in from the saved invoice.
  - Consequence: drafts cannot mention project or line-item details. The operator can add those by editing.
- **D5 — Edits while pending only:** approved text is locked; to change it, draft a new one. The AI original is always kept.
- **D6 — Cost bound:**
  - Drafting uses the existing `OPENAI_MODEL`.
  - Each draft is one call, capped at ≤ 600 output tokens, with no retries.
  - Limits: 20 drafts per 10 minutes per operator, and 2 in flight.
  - **Live OpenAI use is still Gate A (NOT AUTHORIZED):** tests and QA use a deterministic fake.
- **D7 — Chat confirmation:** Nudgey always confirms before drafting, and never acts on "send".

## 5. Backend contract (implemented)

| Route | Notes |
|---|---|
| `GET /api/nudges/summary` | `{counts:{pending,approved,rejected,superseded,total}, aiAvailable}` |
| `GET /api/nudges?view=pending\|approved\|history[&invoiceId=]` | Newest first, at most 100 |
| `GET /api/nudges/:id` | One nudge |
| `POST /api/invoice-drafts/:id/nudges` | `{tone, timeZone, replace?:{id,version}}`. Returns 201, or 404 / 409 `pending_exists` / 409 `version_conflict` / 429 / 503 `ai_unavailable` / 422 `ai_output_rejected` |
| `POST /api/nudges/:id/edit` | `{version, message}` |
| `POST /api/nudges/:id/approve` | `{version}`. Approved **for manual use**; `sentToCustomer` is always `false` |
| `POST /api/nudges/:id/reject` | `{version}` |

All routes require an operator session. Mutations also require CSRF + exact Origin, and everything is operator-scoped (another operator's data answers 404). Audit records carry no message text.
