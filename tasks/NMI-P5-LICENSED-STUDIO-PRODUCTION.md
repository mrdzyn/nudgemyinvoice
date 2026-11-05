# NMI-P5 — Licensed AG Studio Production Dashboard

**Status:** Implemented on a Draft PR. Awaiting owner visual acceptance and independent security review. Not merged or deployed.
**Owner decision (2026-11-04):** the application has appropriate AG Studio deployment licensing for the PayPal AI Hackathon judge-facing production environment through the December judging window. Build the licensed production variant; do not revert to a charts-free Community-only production dashboard.
**Base:** stacked on Draft PR #41 (`feat/nmi-ui-analytics-first-01@f52483699593be24a78728133b0f22a60eaee42a`, itself on `main@8cc2f4d`). It reuses #41's analytics-first order. #41 stays Draft and is not merged by this task.
**UI design gate:** these are owner-directed refinements inside the approved A5-D panel structure (same two-column panel, same order, same data). The owner named the problems to fix, and the final acceptance gate is the owner's visual review of the committed screenshots. No new product behaviour or data is introduced.

## Scope
- **Allowed:**
  - web Studio slot, panel, charts, report, licence fetch and CSS;
  - Vite variant switch and build guard;
  - bundle scan;
  - API licence route, config, the static shell's CSP nonce, and the release preflight environment matrix;
  - tests;
  - P5 and A5-I1 QA harnesses;
  - docs (P5 release doc, P4 supersession note, STATUS, HANDOFFS);
  - root scripts and a Stack CI step that adds the licensed build and scan.
- **Forbidden:**
  - live providers, invoice sending, reminders, webhooks or autonomous provider actions;
  - fake recovered revenue, payment predictions or nudge claims;
  - Render resources, release branch, deploy, judge URL or merge;
  - committing, logging or documenting the licence value;
  - new dependencies or schema changes.

## Acceptance
1. **Licensed production build:** real AG Studio charts appear in the production build after operator sign-in. Community stays the default build. A strict `NMI_WEB_STUDIO=licensed` switch selects the licensed variant. Guards and scans fail closed for each variant.
2. **Licence delivery:**
   - The licence is released only to the authenticated operator, `no-store`, through a header no other origin can send.
   - It never appears in a build, log, DOM, storage or document.
   - Production fails closed to "Charts unavailable" plus Retry.
   - The local dev bridge is unchanged.
3. **Production CSP:** kept without `'unsafe-inline'`; a per-response style nonce covers runtime `<style>` elements.
4. **Dashboard visuals:**
   - Filters stay above the panel, which sits directly below them.
   - Improved: the sparse daily chart (headline context), whitespace, status proportions, labels, the responsive layout and card spacing.
   - Preserved: real aggregates, per-currency accounting, zero days, exact tables and error handling.
5. **Evidence:**
   - The A5-I1 order assertion is corrected and its dev QA re-run.
   - The licensed production-build browser QA covers screenshots (desktop and 390 px), keyboard, themes, filters, loading, the fallback, and the absence of any key or dev endpoint.
   - `pnpm validate`, `pnpm test:db` and both hosted CI workflows pass at the exact final HEAD.

Details and results are in `docs/NMI-P5-LICENSED-STUDIO-RELEASE.md`.

## Audit remediation (P5-FIX1, after review 5771745273 at `2bbc5a8`)
- **SEC-N1:** the page-wide `Document.prototype.createElement` nonce shim is **removed**. The four static vendor stylesheets AG Studio 3.0.0 injects without `styleNonce` are allowed by exact SHA-256 in `style-src` (`apps/api/src/plugins/studio-style-hashes.ts`), with provenance, two hashes re-derived independently, a lockfile version pin and a boundary test that forbids DOM-prototype patches. The production harness now also proves, with licensed Studio loaded and for both the header and the meta policy, that markup-injected `<style>`, nonce-less script `<style>`, wrong-nonce `<style>` and inline style attributes stay blocked, with a positive control.
- **SEC-N2:** documentation corrected. Revocation blocks only **future** licence requests; a licence already delivered to a browser cannot be retracted.
- **Unchanged:** the licensed variant, dashboard visuals, authentication and every other control, and PR #41's layout.
