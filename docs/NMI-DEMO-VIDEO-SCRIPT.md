# NudgeMyInvoice — Demo video script (draft, not recorded)

**Target length: 2:40** (hard limit: under 3:00). **Not recorded, not uploaded.** Record only after the owner picks the evidence mode below. No music, no third-party imagery or logos beyond text names; use the app UI only. All people, companies, e-mails and amounts are fictitious.

## Decide first: what is "live" in the recording

| Mode | Use when | On-screen label (permanent corner tag) |
| --- | --- | --- |
| **SIMULATED providers** (default; no credentials; matches the reproducible setup) | Nothing real-provider has been authorized yet | "SIMULATED: parser and PayPal are stand-ins (no provider calls)" |
| **Real providers** (only after the owner authorizes Gates A/B in `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` and they pass) | Real OpenAI/PayPal Sandbox were exercised | Label each step LIVE vs SIMULATED individually |

Never present a SIMULATED step as real. **Today only the SIMULATED mode is permitted** (all three provider gates are PENDING). The real interface, authentication, PostgreSQL storage, validation, dashboard and the draft **state machine** are real in both modes.

## Shot list (SIMULATED default)

| Time | Visual (actual app) | Narration (short, plain) | Live / simulated |
| --- | --- | --- | --- |
| 0:00–0:15 | Title card text only: "NudgeMyInvoice". Then the empty real dashboard. | "Freelancers lose hours turning client chats into invoices, and mistakes cost money. NudgeMyInvoice drafts the invoice for you, but you stay in control." | Real UI |
| 0:15–0:35 | Composer: paste `Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15` → Parse. Corner tag visible. | "Describe the work in plain language. An AI parser proposes structured fields. The server validates every field, and the model never calculates money." | **SIMULATED parser** (real validation) |
| 0:35–1:00 | Review screen: edit the due date; point at "Not saved yet", estimated totals, the privacy note. | "A human reviews and edits everything. Nothing is saved yet. Totals shown here are labelled estimates." | Real UI |
| 1:00–1:20 | Save → saved page: "Saved in PostgreSQL", server-computed $540.00. Then dashboard row. | "Saving stores the invoice in PostgreSQL. The server recomputes the total in exact integer minor units." | Real server + PostgreSQL |
| 1:20–1:45 | Second request in EUR (answer the due-date clarification). Dashboard shows separate USD and EUR cards. | "Each invoice has one currency. Totals are never added across currencies and nothing is converted." | Real (parser simulated) |
| 1:45–2:15 | Open the invoice → Create PayPal Sandbox draft… → read the dialog → confirm → DRAFT id, "customer not emailed". Then Check status and dashboard "PayPal draft created". | "Creating a PayPal Sandbox DRAFT is an explicit, confirmed action. The customer is not emailed, nothing is sent and no payment is collected. If the answer is uncertain, the app says a draft may or may not exist and reads the saved state instead of retrying." | **SIMULATED PayPal** (real draft state machine) |
| 2:15–2:40 | Quick montage: sign-out locks the screen; text overlay with the limits. End card with the GitHub URL. | "Sessions, CSRF and ownership checks protect the data. It is a Sandbox-only MVP: no sending, no payments, no reminders yet. The code and setup steps are open source." | Real UI |

Total ≈ 2:40. Tighten the 1:45 beat first if it runs long.

## Narration rules

- Say "simulated" aloud at 0:15 and 1:45 in the default mode. Do not say "uses OpenAI/PayPal live" unless Gates A/B passed.
- Do not claim: sending, payment collection, reminders, webhooks, production readiness, hosted availability, sponsorship, user numbers or time-saved metrics.
- Do not show: API keys, `.env`, terminal history with secrets, PayPal account emails, the dashboard URL bar with private hosts, real customer names.

## Production checklist

- [ ] Fresh disposable database and operator; 1280×720 or 1920×1080; browser zoom 100%.
- [ ] Permanent SIMULATED/LIVE tag (text overlay in the editor; the app has no badge).
- [ ] Captions (accessibility) and a transcript.
- [ ] Export under 3:00; verify length on the exported file.
- [ ] Upload (owner only, later) as **public** YouTube; test playback while signed out.

## Real-provider recording rules (only after the owner answers Request C — `docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`)

- **Do not re-create a PayPal draft for a take.** Gate B's single create is spent when it runs. Show the already-created DRAFT read-only (detail page and dashboard "PayPal draft created") and say on screen and aloud that it was created in a separate, earlier verified run; label it "REAL (recorded earlier, run R1-B-…)". A live second create needs its own separate permit.
- A live OpenAI parse in the recording consumes calls from a **new** Request C cap; practise with the simulated mode first and record the live take once.
- Segment tags: LIVE (real provider this take), RECORDED EARLIER (real, from a labelled run), SIMULATED. Use the exact label strings of the evidence templates. Keep the tag on screen for the whole segment.
- Before recording: fresh disposable database, secrets entered off-screen, `.env` and terminal not visible, no URL bar with private hosts, no real customer data, no provider dashboard with account e-mails/ids.
- If any gate is not REAL PASS at recording time, that segment is SIMULATED and says so. Length < 3:00; nothing is uploaded or submitted without separate owner action.
