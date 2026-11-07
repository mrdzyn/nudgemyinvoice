# NMI-JUDGE-LIVE-OPENAI-01 — controlled live AI for hackathon judges

**Status:** Draft feature implementation. **Issue:** #56. **Base:** `main@04240209add5bcdae67f4b925e9f194abaad8b66`. **Feature branch:** `feat/nmi-judge-live-openai`. Existing protected and deployed release `abfbbfc3153cb3b4238ebf201daca830fed2e8f9` is untouched.

## Objective and explicit owner instruction

Judges must be able to demonstrate actual AI-powered invoice parsing and AI Nudge Intelligence instead of only seeing disabled UI. Owner's 2026-11-07 instruction explicitly authorizes implementing this feature branch **now**, not issuing live API requests, changing billing, merging, deploying, or sharing the judge URL. Existing OpenAI client and nudge functionality are reused; no new SDK or database migration.

## Approved historical evidence — do not lose

- PR #25: 2026-10-30 Gate A OpenAI Responses real provider provisional PASS, requested `gpt-6-luna`, 2 synthetic invoice parses (USD 540.00 and EUR 599.97), consumed finite permit (no reuse).
- PR #43: AI Nudge Intelligence implementation with tone, review, approval and copy; browser proof 150/150 with **fake** model; server-side AI live provider opt-in previously default OFF.
- PR #55: manual CI exception was independently reviewed/owner accepted solely for old SHA; **not** a blanket future CI or provider authorization. Render Hobby budget and D4-X exceptions unchanged.
- Issue #56: judge-facing AI demonstration gap.

## Scope

- **Code:** `apps/api/src/config.ts`, `apps/api/src/server.ts`, `apps/api/src/release-preflight.ts` and tests, `apps/api/src/routes/invoice-drafts.ts`, `apps/api/src/app.ts`, `packages/ai/src/client.ts`.
- **Docs:** this task, P4 G8 proposal, STATUS and append-only HANDOFFS.
- **Forbidden:** live provider request, PayPal credentials/draft creation, real customer data, unapproved funds, migration, additional Render resources, modifying old protected branch, public URL, any secret in a commit, merging or deploying without explicit owner permission.
- **UI design gate:** Not applicable (existing approved P6 UI and composer flow reused; no new visual screens).

## Proposed judge-AI mode

Set `NMI_JUDGE_AI_MODE=limited` **only after owner and security review** with:
`OPENAI_API_KEY` (dedicated server-only key), `OPENAI_MODEL=gpt-6-luna` (historical verified model; check current entitlement), `OPENAI_MAX_OUTPUT_TOKENS=4096`, `NUDGE_AI_DRAFTING_ENABLED=true`, `PAYPAL_DRAFTS_ENABLED=false`, no PayPal credentials. `NMI_JUDGE_AI_MODE=off` or absent is the default release preflight posture. Release preflight rejects unsupported models, missing key, forbidden names and mismatched flags without printing secrets. Runtime limited-mode validation fails closed for absent/mismatched credentials/flag and PayPal activation. The existing parser and nudge models are server-side only; user content must be synthetic.

In limited mode the parser SDK disables retries (one wire attempt per call), and existing nudge SDK already retries zero times. Existing authenticated + CSRF/Origin constraints remain. Parser and nudge each allow only **3 requests per 10 minutes per operator, concurrency 1**. These are in-memory budgets: **restart resets the quota and they are not a lifetime cap or guaranteed dollar maximum**. A separately verified OpenAI project-level spend restriction + observed usage and owner-specified total call cap are deployment prerequisites, not assertions already met.

## Test objective

Pure offline test: (a) disabled remains the default and cannot silently whitelist an OpenAI key in release preflight; (b) limited permits only the exact approved model, 4096 parser output tokens, explicit nudge opt-in and PayPal-disabled posture; (c) no secret is leaked by preflight; (d) runtime limited mode rejects missing/mistyped flags and credentials; (e) parser retries are zero in judge mode; (f) existing fake-model and DB contracts remain intact. Run changed-file formatting/lint/typecheck + focused tests, then **exact-HEAD manual CI** as required by `docs/TESTING.md` including disposable PG16 and both web variants. Hosted GitHub Actions are blocked by external billing/quota; report **NOT RUN**, no CI green claims.

## Audit and release gate

Independent audit must accept the exact PR HEAD before owner-authorized squash merge. Establish a **new protected immutable release candidate** and new manual-release validation/exception: PR #55's old candidate exception cannot be inherited. Before a live provider call the owner must separately specify OpenAI project/key, available model, exact cap on total requests/spend, authorized synthetic sample(s), expiry, key revocation/kill switch and provider usage verification. Before judge access: private login, real AI parse and nudge smoke within authorized caps; no PayPal calls, no real data; record provider and server evidence truthfully. Devpost/video evidence must distinguish REAL from SIMULATED and RECORDED EARLIER.

**Nothing in this feature branch approves environment changes, spending, hosted calls, deployment, merge, or judge URL sharing.**
