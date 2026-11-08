# NMI-JUDGE-BRANDING-01 — reviewer-accessible browser QA evidence

Independent browser verification for Draft PR #69 at exact HEAD
`80d1bd8f1337eabbe053de58a8d359e59e37d4a1` (base `main@4aea541`).
This evidence lives on a separate branch so PR #69's audited HEAD is untouched.

## What was verified (28/28 scripted checks, every screenshot inspected)

| # | Shot | Claim |
|---|------|-------|
| 1 | `01-login-light-1280.png` | Login renders; mascot icon decorative (`alt=""`); header wordmark with `alt="NudgeMyInvoice"`; favicon link present |
| 2 | `02-dashboard-light-1280.png` | Signed-in dashboard header, launcher with avatar + label |
| 3 | `03-nudgey-panel-1280.png` | Launcher opens the Nudgey panel; panel mascot loads |
| 4 | `04-safemode-open-1280.png` | Safe Mode disclosure opens with `aria-expanded="true"`; sandbox wording intact |
| 5 | `05-login-dark-1280.png` | Dark-theme login renders branded |
| 6 | `06-dashboard-dark-1280.png` | Dark-theme dashboard; wordmark tile readable; launcher visible |
| 7 | `07-login-mobile390.png` | 390px login wraps cleanly |
| 8 | `08-dashboard-mobile390.png` | 390px dashboard; no horizontal overflow; wordmark fits |
| 9 | `09-dashboard-mobile390-bottom.png` | Launcher clears the bottom mobile nav |
| 10 | `10-dashboard-zoom200.png` | 200% zoom layout intact, no horizontal breakage |

Plus script-asserted (no shot needed): `/brand/*.jpg` → 200 `image/jpeg` at
natural size (1024×1024, 1376×768); Tab moves body→Skip-link and
username→password; trusted key input reaches fields; launcher is a native
`<button>` with no tabindex/key handlers and a visible 2px focus outline;
zero CSP violations with the production CSP meta (`img-src 'self'`) intact;
only console/network entries are the expected logged-out
`GET /api/auth/session → 401` probes (app renders login gracefully).

Known harness limits (not app defects): CDP-injected Enter produces no
default button/form activation in this headless build, so Enter-activation
is argued from native semantics (verified key delivery + native button);
JPEG favicon renders per markup — cross-browser favicon display beyond
Chrome is owner-QA scope.

## Exact-HEAD local preview (reviewer reproduction)

```bash
git checkout 80d1bd8f1337eabbe053de58a8d359e59e37d4a1
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH"
pnpm install --frozen-lockfile && pnpm exec playwright 2>/dev/null || true
# disposable PG16, migrate, provision synthetic operator, serve production build:
initdb -D /tmp/nmi-pg16-qa/data -U postgres --auth=trust
pg_ctl -D /tmp/nmi-pg16-qa/data -o "-p 55449 -c listen_addresses='127.0.0.1'" -l /tmp/nmi-pg16-qa.log start
psql "postgres://postgres@127.0.0.1:55449/postgres" -c "CREATE DATABASE nmi_qadb;"
for t in $(python3 -c "import json;print(' '.join(e['tag'] for e in json.load(open('packages/db/migrations/meta/_journal.json'))['entries']))"); do
  psql -q "postgres://postgres@127.0.0.1:55449/nmi_qadb" -f "packages/db/migrations/${t}.sql"
done
DATABASE_URL="postgres://postgres@127.0.0.1:55449/nmi_qadb" \
  NMI_OPERATOR_USERNAME="qa_operator" NMI_OPERATOR_PASSWORD="<synthetic>" \
  pnpm --filter @nmi/api provision-operator
NODE_ENV=test PORT=4551 WEB_ORIGIN=http://127.0.0.1:4551 \
  WEB_DIST_DIR="$PWD/apps/web/dist" \
  DATABASE_URL="postgres://postgres@127.0.0.1:55449/nmi_qadb" \
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  HOST=127.0.0.1 PAYPAL_ENV=sandbox PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com \
  pnpm --filter @nmi/api start
# open http://127.0.0.1:4551/ in a browser (no providers called; drafts disabled)
```

The automated CDP run used for the 28 checks is `brand-qa.mjs` in this
folder (Node 22 built-ins only, headless Chrome via remote debugging).

## Sanitization

Screenshots show only the synthetic `qa_operator` account and empty demo
state. No real credentials, tokens, personal data, or provider secrets
appear in any capture or in the harness (all secrets via environment).

## Traceability

- PR #69 head: `80d1bd8f1337eabbe053de58a8d359e59e37d4a1`
- Their task contract: `tasks/NMI-JUDGE-BRANDING-01.md` (on the PR branch)
- Implementation handoff: PR #69 comment `6716456908`
- Full manual-CI + browser evidence: PR #69 comment `6716819012`
- Independent PARTIAL review: PR #69 review `5816609463`
