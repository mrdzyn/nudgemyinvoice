# Hackathon plan — NudgeMyInvoice (55 hours)

Deadline per Devpost: **2026-11-12 12:00 PST** = 2026-11-13 04:00 Asia/Manila. Internal target: **2026-11-09 end-of-day Manila**.

## Week 1 — Oct 24–30 (20 hours)
- 4h: repository initialization, public MIT, pruning, agents/tasks/docs, project-profile validator and real baseline PR.
- 3h: UI requirements, navigation and screen states, reviewable mockups, human design approval.
- 4h: React/Vite + Fastify monorepo scaffold, auth/demo gate, env validation, CI/lint/typecheck.
- 4h: Drizzle + persistent invoices/items/approvals/events; DB dialect parity spike.
- 5h: OpenAI Responses API schema-constrained invoice parsing with deterministic fixtures, currency amount precision, manual edit.

**Gate:** parse natural language into auditable draft and display fixture UI; no privileged API bypass.

## Week 2 — Oct 31–Nov 6 (20 hours)
- 7h: PayPal sandbox OAuth + Invoicing draft/send with exact human approval, contract tests and retries.
- 6h: signature-verified invoicing webhooks, DB event idempotency, reconciliation and sandbox paid event evidence.
- 4h: AG Studio currency-separated dashboard + one focused overdue custom widget, overdue state and reminder drafts.
- 3h: responsive/error UX, auth/session and approval-boundary negative tests.

**Gate:** genuine end-to-end sandbox create -> approve/send -> sandbox buyer payment -> webhook -> paid state for one invoice.

## Week 3 — Nov 7–9 (15 hours)
- 4h: Render service/Postgres deploy, environment setup and rollback, public hosted demo/access.
- 4h: independent exact-head security and integration audit; fixes and required CI/manual fallback.
- 3h: multi-currency second scenario, accessibility/manual QA, fresh-clone judge instructions.
- 2h: original under-3-minute demo video + YouTube upload.
- 2h: README polish, Devpost submission writeup, screenshot and final verification.

**Gate:** working sandbox product and video available well before deadline; do not let extra integrations displace this.

## Explicitly deferred unless ahead of schedule
Orders API, refunds, sending AI reminders, real foreign exchange rates, teams, subscriptions, multi-tenant SaaS, enterprise AG Grid paid features, complex cron/Workflows orchestration, production payments.

## Evaluation story
**Implementation:** real sandbox + verified webhooks + idempotency and approval gate.
**Design:** simple invoice composer and AG Studio interactive invoice oversight.
**Impact:** less manual administrative work for small businesses.
**Innovation:** agentic reads/drafts with explicit human consent for sends and money.
**Presentation:** show cross-currency status without misleading FX totals.
**Sponsor evidence:** disclose exactly how AG Grid, Render and APIMatic were used; installation alone does not prove integration.

## Judging-period dependency checklist
The official judging window ends Dec 15, 2026. Verify AG Studio trial-license coverage through that date (45-day trial timing or sponsor extension) and avoid relying on 30-day Render Free Postgres beyond its expiry. Secure hosting/credits suitable for continued judge access. Do not publish secret sandbox credentials; offer a safe guest demo or independent sandbox setup.
