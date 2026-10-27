# NMI-UI-01C — Secure React-to-API Integration Plan

- **Status:** IN PROGRESS — owner authorized starting this integration phase on 2026-10-27. No real API wiring or provider call has been implemented by this planning commit.
- **Approved main base:** `a4520440c748ff8712a10e9f65b389e8cde5db9c` (owner-squash-merged PR #8, accepted UI-01B).
- **UI design authority:** owner-approved NMI-UI-01A; `design/screens/NMI-UI-01A-SCREENS.md`, tokens and screenshots. UI-01B React shell is on `main`.
- **Review model:** Claude implements one bounded Draft PR at a time; GPT-6 independently audits exact HEAD; owner explicitly approves each merge. No deployment authorized.
- **Owner decisions D1–D4:** AG Studio deferred pending license; no browser persistence of unsaved customer data; a separate bounded read-only invoice-list route is planned; editing existing saved drafts deferred.
- **Hackathon submission deadline:** 2026-11-12 12:00 Pacific / 2026-11-13 04:00 Asia/Manila.
- **Safety:** PayPal Sandbox-only DRAFT creation is off by default (`PAYPAL_DRAFTS_ENABLED=false`), and the prior one-create authorization is exhausted. No new PayPal provider write without new owner approval. Real OpenAI model inference has not been tested and requires a separately approved controlled validation. Do not claim provider states proven by mocks.

## Integration slices, in priority order

1. **NMI-UI-01C1 — Auth/session/browser transport.** Wire real operator login, session restoration and logout; enforce route guards and session expiry; eliminate all mock-auth bypasses in real mode. Same-origin `/api` proxy with strict CSP and origin/CSRF controls. **Active contract:** `tasks/NMI-UI-01C1-auth-session.md`.
2. **NMI-UI-01C2 — Invoice parse and manual fallback.** Wire `POST /api/invoice-drafts/parse`, strict proposal and error-state mapping and disclosure; test deterministically with fake model. A genuine OpenAI call is separately authorized and limited.
3. **NMI-UI-01C3 — Draft save/detail.** Wire `POST /api/invoice-drafts` and `GET /api/invoice-drafts/:id` with idempotency keys, server totals and durable local records. Test same-key identical-body replay and conflicting-body 409; never infer success from timeout.
4. **NMI-UI-01C4 — Read-only list.** Add an authenticated, bounded, paginated `GET /api/invoice-drafts` backed by PostgreSQL with strict operator scope and no global mixed-currency sum. This is the approved D3 separate API task.
5. **NMI-UI-01C5 — Explicit PayPal Sandbox draft UI / controlled demonstration.** Wire only the *existing* protected Sandbox draft-creation route and read-state reconciliation. Default remains disabled; any real create requires fresh owner authorization and a strict call budget. No send/notify/payment/refund/mark-paid.
6. **NMI-DEMO — Submission evidence, genuine AI verification, demo runbook, release-quality manual browser QA, video and Devpost.** At least one genuine AI+PayPal integrated, operator-reviewable demonstration is critical; keep a deterministic synthetic test mode that is visibly distinct from live provider evidence.

## Submission definition of done

- Functioning installable/runnable application (or separately owner-approved hosted demo) demonstrates natural-language invoice proposal with real AI integration, operator review, PostgreSQL-backed save and PayPal Sandbox DRAFT creation in a reproducible, truthful flow.
- Single-purpose public repository with visible MIT license; sanitized `.env.example`, tested setup/run/database/seed instructions, safe judge access through Dec 15 2026.
- Public YouTube demonstration **under 3 minutes** showing actual working application, link and narrative prepared for Devpost.
- Demonstrated value for freelancers, human-control security boundary, multi-currency invoices with no FX mixing. Document missing features (reminders, webhooks, paid-state reconciliation) candidly; do not claim implemented if absent.
- Independent exact-HEAD audits and CI, actual browser/keyboard QA, no secrets in sources/screenshots/logs; no deployment without explicit owner approval.

**Deferred and NOT needed to qualify for the narrower draft MVP:** live PayPal transactions, automatic reminders/sending, escrow, refunds, account registration, editing old saved drafts, AG Studio and autonomous financial actions.
