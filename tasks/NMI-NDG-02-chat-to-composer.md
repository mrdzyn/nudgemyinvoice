# NMI-NDG-02-C3 — Chat-to-Invoice-Composer handoff (P0, issue #58 comment 6710568948)

## Provenance

- **Observed on Live combined `766dde37…`:** Ask Nudgey answered “Create an invoice for Bold Vision Enterprise …” with the generic read-only help text (“I can't send, change or schedule anything from this box”).
- **Root cause (deployed source, not a provider failure):** `apps/web/src/nudgey/intent.ts` lines 90–96 map any `create` intent to `help`; `lookup.ts` returns that read-only text. The composer (`ComposerScreen.tsx`, real `POST /api/invoice-drafts/parse` after explicit Parse) and the guarded `navigate:composer` action (`Nudgey.tsx`) already exist. The combined-provider deployment does not alter this local rule-based chat router.
- **Scope:** one bounded UX/behavior PR on `feat/nmi-chat-to-composer` from `origin/main@766dde37…`. Reuse the existing AI composer and approval flow. No merge, deploy, env change, credential, provider call, protected-branch move, or URL share.

## Implementation

1. **New pure parser `apps/web/src/nudgey/createIntent.ts`** — `parseCreateIntent(raw)` returns:
   - `{ kind: "create", text }` only for an affirmative creation opening: after an optional opener (`hey nudgey`, `can/could/would you`, `please`), a base-form creation verb (create/make/draft/generate/add/write/prepare) governing the invoice as its direct object (`create an invoice …`, `make me an invoice …`), or an explicit need/want (`i need a new invoice …`); `text` is the verbatim trimmed request (≤ `MAX_PROMPT_CHARS`, so always within the composer's 2000-char limit);
   - `{ kind: "conflict", action }` when a creation opening also contains `send|pay|capture|refund` (plus email/mail/mark-paid variants) alongside the invoice noun;
   - `{ kind: "not-create" }` for everything else: lookup participles (`invoices created today`, `invoices generated for Acme`), bare `new invoices` lists, past-tense reports, creation of something else about an invoice (`create a follow-up …`), and over-long/control-character input (existing rejection path).
2. **`ChatSession.ask` routes creation BEFORE the generic read-only/help fallback** (after nudge/schedule parsing, before `parseIntent`):
   - create → in-memory reply `COMPOSER_READY_TEXT` (“I can prepare your invoice in the composer for review …”) with `composerPrefill` set to the verbatim text; no network, no persistence, no provider call;
   - conflict → `COMPOSER_CONFLICT_TEXT` refusal, no prefill, no navigation;
   - ambiguous (e.g. bare “create”) → falls through to the untouched legacy router (still read-only help).
3. **Handoff through existing guarded navigation:**
   - `ChatMessage.composerPrefill?: string`; `ChatView` renders a native “Review in Invoice Composer” button (`followup-btn followup-btn-primary`, 44px touch target, wrapping flex) only when both prefill and `onOpenComposer` exist;
   - `Nudgey` closes the panel and dispatches `navigate:composer + resetComposer + composerText` — the RealApp leave/unsaved-work confirm still applies (`isLeavingAction`);
   - `appState` navigate gains optional `composerText`, applied only with `resetComposer` on the composer screen (clamped to `MAX_PARSE_CHARS`); composer starts at `parse: idle`, so nothing is parsed, saved, or sent until the operator clicks Parse.
4. **Preserved:** authenticated session, no background network/provider calls, no automatic save, no PayPal draft creation, no send; read-only lookup and nudge-draft workflows byte-identical; `nudgeyAction("create")` unchanged.
5. **Chips/header clipping:** not reproducible from source — `.chat-chips` wraps (`flex-wrap`), the heading is sticky with a solid background, and the new button reuses the same wrapping button row. No layout change made.

## Tests (all in-repo, fake/no-provider)

- `createIntent.test.ts` (new): reported P0 sentence, affirmative-object matrix (incl. openers and need/want variants), conflict matrix, participle/`new invoices` collision passthrough, follow-up-creation passthrough, over-long/control passthrough.
- `chatSession.test.ts` (+4): zero-network create reply with verbatim prefill, conflict refusal without prefill, ambiguous passthrough to help, replacement-cancels-lookup.
- `NudgeyChat.test.tsx` (+4): labelled button only with prefill+handler, shared responsive classes / no fixed layout, refusal carries no action, click hands verbatim text to the handler (native keyboard-focusable button).
- `appState.test.ts` (+2): prefill sets text with `parse: idle` + `seedKey` bump and no review; ignored without reset / off-screen; over-long clamped.
- Regressions run: lookup, nudgeIntent, NudgeDraftFlow, scheduleIntent, scheduleCandidate, intent, chatSession, Nudgey panel, appState.

## Validation / stop rule

Targeted suites + typecheck green; then full exact-HEAD manual CI per `docs/TESTING.md` (profile validator, secret guard, frozen install, lint, Prettier, typecheck, unit + licensed/community web builds, bundle scans, disposable PG16 `test:db`, migration-sync, prod audit, `git diff --check`) on Node 22. Hosted CI NOT RUN. Push normally; open one Draft PR; post evidence; request independent exact-HEAD audit. Stop at owner review.
