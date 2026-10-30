# NMI-UX-02 — Nudgey quick-action assistant

## Decision and scope
- **Owner approval:** concept approved and final name **Nudgey**, 2026-10-30.
- **Goal:** make the existing authenticated NudgeMyInvoice workflow approachable without adding an AI chatbot, autonomous actions, or extra provider usage.
- **UI design gate:** owner approved the bottom-right floating quick-action concept in conversation; no new page, route, or backend UI is introduced. Existing app tokens and screen patterns remain authoritative.
- **Files:** `apps/web/src/components/Nudgey.tsx`, `AppShell.tsx`, `app.css`, and focused render/component tests.
- **No changes to:** PayPal/OpenAI clients, invoice schema, approvals, databases, sessions/auth implementation, billing, deployment, or source/provider tests.

## Screens and flow
- **Authenticated dashboard / protected workspace:** compact Nudgey launcher fixed lower right, with the existing mobile nav left unobstructed.
- **Open:** nonmodal, dismissible quick-action panel. Greet by the authenticated operator username (never infer a personal name). Buttons:
  1. **Create an invoice** → existing new-invoice composer (reset to fresh form).
  2. **View my invoices** → existing AG Grid Community dashboard.
  3. **Check invoice status** → existing invoice dashboard; operator opens a saved invoice to inspect its PayPal Sandbox state.
- **Dismiss:** close control, Escape, outside pointer; panel closes on route changes. Escape/Close returns focus to the launcher.
- **Offline and degraded states:** shortcuts only navigate; existing screens own their connection/offline errors.
- **Security/privacy:** launcher renders only with a server-authenticated session; cannot appear in login/checking/signing-out states. No new network request, persistence, automated send, new privilege, or session leak.

## Acceptance / manual review
- Launcher is accessible by keyboard, has accurate expanded state, and the panel uses a titled nonmodal dialog.
- Keyboard open focuses the first action; Escape and Close restore launcher focus; outside click dismisses.
- Navigate to composer/dashboard via existing dispatch, preserving unsaved-form leave guards.
- Light/dark, desktop, mobile narrow and reduced motion work. On mobile, the launcher sits above the fixed navigation.
- No overlay on the unauthenticated page or after sign-out.
- No new dependency or paid AG Grid feature.

## Focused verification
- Run `pnpm exec vitest run apps/web/src/components/Nudgey.test.tsx apps/web/src/RealApp.render.test.tsx`.
- Run `pnpm --filter @nmi/web typecheck`, `pnpm format:check`, and the required CI gates on the exact PR HEAD.
- Manually inspect authenticated dashboard/composer, mobile layout, keyboard focus, and sign-out.
- **Stop once these Nudgey objectives are verified.** No replay of Gate A/B provider acceptance, no PayPal/OpenAI API calls.
- **Release boundary:** Draft PR only until independent review and explicit owner merge approval.
