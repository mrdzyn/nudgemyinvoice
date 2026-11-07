# NMI-COMBINED-JUDGE-01 — Unified PayPal + OpenAI final judge release

**State:** DRAFT IMPLEMENTATION; no merge, deploy, env change, credential, provider call, branch move, or URL share.
**Repository base:** `main@68bf77a971c6a8b28b7a948bb1b16d22d31d8bb7` (PR #60 squash-merged).
**Tracker:** issue #58 (P0 unified final judge release).
**Branch:** `feat/nmi-combined-judge-mode`.

## Objective

Deliver one independently reviewable integrated release implementation in which explicitly enabled OpenAI parsing, AI Nudge drafting and PayPal Sandbox draft creation coexist — with evidence that both provider paths work together, not two separate demonstrations. Synthetic test data only; no real provider calls in this task.

## Bounded change contract

**Permitted:** this task file; `apps/api/src/config.ts` + `apps/api/src/app.ts` + `apps/api/src/routes/invoice-drafts.ts` (combined mode + shared judge budgets); `apps/api/src/release-preflight.ts` (combined env matrix); `apps/api/src/judge-ai-mode.test.ts`, `apps/api/src/release-preflight.test.ts`, `apps/api/src/combined-judge-mode.pg.test.ts` (new); `docs/NMI-OPENAI-JUDGE-ACTIVATION-PACKET.md` (combined matrix note); `docs/STATUS.md` current-state lines; append-only `docs/HANDOFFS.md`.

**Forbidden:** app behavior beyond the combined gate, schema/journal/migrations, `pnpm-lock.yaml`, workflows, other testing scripts, security mechanisms, branch force-push/deletion, creating/moving/protecting any `release/*` branch, Render create/deploy/billing, env changes, secret collection or storage in Git, public URL, PayPal/OpenAI live calls, provider enabling beyond the gate, license publication, Devpost publication, claiming hosted CI ran, merging, or closing any gate by declaration.

**UI design gate:** Not applicable — API/config release engineering; approved screens reused unchanged. **Test objective:** prove the combined mode enables the full human-controlled loop (parse → review/save → explicit draft → nudge) with fake providers, fails closed on every missing credential, live host, provider failure and unauthorized operation, and preserves all existing off/limited boundaries.

## Design

- New explicit mode `NMI_JUDGE_AI_MODE=combined`: requires everything `limited` requires (approved key, `gpt-6-luna`, 4096 cap, nudge opt-in) **plus** `PAYPAL_DRAFTS_ENABLED=true` with sandbox credentials. Live PayPal hosts are refused by the existing sandbox guard; the adapter exposes no send/capture/refund path in any mode.
- Shared judge safeguards (`isJudgeAiMode`): 3 requests/10 min/endpoint, concurrency 1, SDK retries 0 — identical in `limited` and `combined`. `off` default unchanged (SEC-01 production boundary intact).
- Preflight: `combined` accepted as a third allowlisted judge state; PayPal credentials allowed **only** in combined (still forbidden in `limited`, absent in `off`); `PAYPAL_DRAFTS_ENABLED=true` required in combined, `false` elsewhere.
- Human approval stays the only trigger: AI parse proposes, the operator reviews/saves, the operator explicitly POSTs the draft action, the operator reviews/approves the nudge for manual use. AI, jobs and webhooks can never trigger provider writes.

## Preserved

$5 enforced monthly OpenAI limit (financial control; in-memory budgets are not a cap), no cumulative call cap (owner decision), sandbox-only PayPal, CSRF/Origin/auth/ownership/audit/idempotency, SEC-01 default-off boundary, preflight allowlist + source controls, Gate A consumed PASS, live rollback deployment.

## Superseded

`release/nmi-openai-judges-2026@82996c4…` is OpenAI-only code and is **unsuitable for the complete judge demonstration** (no PayPal path). It is not modified or moved by this task; a new combined candidate SHA/branch decision comes later through the established gates.

## Execution order

1. Config/preflight/wiring + unit tests (this branch).
2. Combined e2e pg suite (fake providers, disposable PG16).
3. Docs (task, packet note, STATUS, handoff) → commit → push → open Draft PR.
4. Full exact-HEAD manual CI (Node 22, disposable PG16) → evidence → independent audit.
