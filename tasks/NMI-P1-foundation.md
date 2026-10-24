# NMI-P1 — Application Foundation and OpenAI Invoice Parsing

- **Status:** Review (stacked on NMI-P0; pending CI, independent audit, owner design approval and merge approval)
- **Owner/orchestrator:** project owner
- **Implementation agent:** Claude Code
- **Target branch:** `phase-0/nmi-bootstrap-pruning` (stacked; retarget to `main` after PR #1 merges)
- **Working branch:** `phase-1/nmi-app-foundation`
- **Dependency:** PR #1 (NMI-P0) must merge first. Do not merge this PR before PR #1.

## Objective
Provide a strict-TypeScript pnpm workspace with a health-only API, a placeholder web app, shared exact-money contracts, an OpenAI structured invoice parser that treats model output as untrusted, the approval/tool-allowlist primitives, a replaceable PayPal sandbox adapter interface, and a database schema/migration strategy.

## Delivery mode / UI design gate
- **Material user-facing UI:** Yes (later) — **UI design gate: Required, NOT approved.**
- **Screen map / mockups:** `design/nmi-p1/SCREENS.md` (draft for owner review).
- **Human design approval:** PENDING.
- **UI shell scope in this task:** none. `apps/web` is a single status placeholder; no business screens, no AG Studio.

## Test objective / validation budget
- **Objective:** prove parsing/validation, exact money, multi-currency separation, tool allowlist, approval gate and sandbox-only config deterministically, with no OpenAI key and no network.
- **Evidence:** `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle`, migration-in-sync check, plus baseline CI.
- **Not covered:** real OpenAI calls, real PayPal sandbox calls (separate owner-triggered smoke tests).

## Allowed scope
`apps/`, `packages/`, root workspace/tooling config, `.github/workflows/stack.yml`, `scripts/check-bundle-secrets.mjs`, `design/nmi-p1/`, this task file, docs updates.

## Forbidden scope
No invoice send, reminder send, cancel, refund, capture or mark-paid implementation; no PayPal MCP/tools; no live PayPal; no deployment; no auth/session implementation; no AG Studio dependency; no second AI provider; no real secrets.

## Acceptance criteria
- [x] pnpm workspace, strict TS, ESLint, Prettier, Vitest, committed lockfile.
- [x] Fastify `GET /health`; Vite React placeholder.
- [x] Zod invoice-draft contracts, clarification requests, validation errors, exact calculated totals.
- [x] OpenAI Responses API parser behind an injectable `InvoiceModelClient`; output validated before use.
- [x] Fixtures/tests: two+ currencies, missing fields, invalid amounts, prompt injection, model unavailable.
- [x] `PayPalInvoicingReadDraft` / `PayPalInvoicingPrivileged` interfaces only; sandbox host guard.
- [x] Drizzle PostgreSQL schema and generated migration; dialect recommendation recorded.
- [x] Stack CI workflow added alongside unchanged baseline caller/reusable pair.
- [x] C2 audit remediation (independent audit of `393052a` = PARTIAL): trusted-actor + `consumeIfMatches` approval contract; PostgreSQL CHECK constraints + migration `0001`; expanded negative tests; calendar-valid reference date. Limits: no auth; DB atomicity of approval consumption unproven until the PostgreSQL adapter exists.
- [ ] Hosted CI green at final head; independent exact-head audit; owner design approval (blocks UI shell work).
