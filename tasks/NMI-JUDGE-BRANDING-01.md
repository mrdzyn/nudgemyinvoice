# NMI-JUDGE-BRANDING-01 — Judge demo visual identity

**Source:** user-owned Google Drive folder `1GRb5jMEE5nk3meK4JJW_oOHlWa2vur-M`; source images identified as JPEG despite the original `.png` filenames.
**Base:** `main@4aea541d358e419f835e1f59811216003ba56305`.
**Scope:** Add two original JPEG assets to Vite public `/brand/`. Show horizontal wordmark in the signed-in and signed-out header; mascot icon on both login variants, favicon and the authenticated Nudgey floating launcher + panel. Keep all control accessible names, Safe Mode disclosures, app state, navigation and existing business actions unchanged. No providers, deployments, protected branches or other PR changes.

## Validation objective

- Verify browser resolves both JPEG paths with proper content types and 200 response; source art is not publicly linked to Drive at runtime.
- Verify logo header on desktop and 390px mobile without overlapping sign-out, Safe Mode or Nudgey; verify dark/light modes, layout at 200%/400% zoom and keyboard/focus behavior.
- Verify image/favicons are same-origin and compatible with existing `img-src 'self' data:` CSP, including produced licensed/community bundles.
- Preserve and run focused AppShell/Nudgey tests and required full exact-HEAD manual CI (`pnpm validate`, disposable PostgreSQL 16 tests, migration synchronization, security audit and secret guard) per `docs/TESTING.md`.
- Request genuinely independent exact-HEAD audit. No merge/deploy without separate owner approval.

## Known limitations and follow-ups

JPEG assets contain white backgrounds, intentionally displayed as white islands to avoid silently altering owner-provided art. The horizontal image uses CSS `object-fit: cover` to remove empty vertical canvas. Site icon is a JPEG source; confirm cross-browser favicon display in manual QA. Historical `docs/STATUS.md` belongs to separate ops PR #68; avoid modifying it from this parallel branch.
