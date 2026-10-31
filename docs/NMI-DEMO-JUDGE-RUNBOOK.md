# NudgeMyInvoice — Judge runbook

> **What was tested.** The **Mode A (simulated) path with a local PostgreSQL** was executed from a **clean clone** on macOS (Node 24.21.0, pnpm 10.28.0, PostgreSQL 16.15, headless Chrome) during NMI-DEMO-R0 and worked. **Not tested:** **Mode B** (your own real OpenAI/PayPal credentials: never run), the **Docker** database option, and any non-macOS platform. Those parts are instructions only. No private credentials, passwords or undisclosed setup are needed.

NudgeMyInvoice is a **PayPal Sandbox-only** hackathon app: a freelancer describes an invoice in plain language, reviews and edits the proposal, saves it to PostgreSQL, sees it on a dashboard, and can *explicitly* confirm creation of a PayPal Sandbox **DRAFT** invoice. It never sends an invoice, collects a payment or contacts the customer.

There are two ways to evaluate it. Pick one (or both).

| Mode | Needs your credentials? | What is real | What is simulated |
| --- | --- | --- | --- |
| **A. SIMULATED evaluation mode** (recommended first) | **No** | Browser app, authentication, CSRF/Origin, strict parsing pipeline, PostgreSQL, owner scoping, the real PayPal draft service and its durable state machine | OpenAI (a regex stand-in parser) and PayPal (an in-memory fake). **No provider request is made.** |
| **B. Your own providers** | Your own OpenAI key and your own PayPal **Sandbox** app credentials | Everything above plus real provider calls | Nothing |

Everything in mode A that involves OpenAI or PayPal is **SIMULATED** and is not evidence of real provider behaviour. The project owner's PayPal credentials, OpenAI key and login password are **never** distributed; you configure your own.

## 1. Prerequisites

> **Pasting into an interactive zsh:** run `setopt interactive_comments` first so lines starting with `#` in the blocks below are treated as comments (bash does this by default).

- **Node.js ≥ 22** (`node -v`; tested 24.21.0) and **pnpm 10** (`pnpm -v`; tested 10.28.0; `corepack enable` provides it).
- **PostgreSQL 16** with `psql`, `createdb` and either `initdb`/`pg_ctl` (local install) or a container runtime. Only PostgreSQL is supported (SQLite is not).
- Ports **3001** (API) and **5173** (web) free, or see "Changing ports".
- Optional, for the automated browser check: Google Chrome (set `CHROME_BIN` if it is not at the macOS default path).

## 2. Get the code and dependencies

```bash
git clone https://github.com/mrdzyn/nudgemyinvoice.git
cd nudgemyinvoice
pnpm install --frozen-lockfile
```

pnpm may print "Ignored build scripts: esbuild …". That is expected; nothing here needs those scripts.

## 3. Create a database

Use a throw-away database. Option 1 needs only a local PostgreSQL install; option 2 needs a container runtime (**not exercised in R0: Docker was not available on the test machine**).

```bash
# Option 1: a private cluster in a temp directory (tested)
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"   # adjust to your PostgreSQL 16 bin directory
initdb -D /tmp/nmi-pg -U nmi --auth=trust -E UTF8
pg_ctl -D /tmp/nmi-pg -o "-p 54370 -c unix_socket_directories='' -c listen_addresses=127.0.0.1" -l /tmp/nmi-pg.log -w start
createdb -h 127.0.0.1 -p 54370 -U nmi nmi_judge
export DATABASE_URL=postgres://nmi@127.0.0.1:54370/nmi_judge

# Option 2: Docker (UNTESTED in R0; uncomment to use)
# NMI_DB_PASSWORD="$(openssl rand -hex 16)"
# docker run -d --name nmi-pg -e POSTGRES_PASSWORD="$NMI_DB_PASSWORD" -e POSTGRES_DB=nmi_judge -p 127.0.0.1:54370:5432 postgres:16
# export DATABASE_URL="postgres://postgres:$NMI_DB_PASSWORD@127.0.0.1:54370/nmi_judge"
```

`--auth=trust` is acceptable only for a local throw-away cluster bound to 127.0.0.1.

## 4. Apply the migrations

There is no `db:migrate` script. Apply the eight committed migrations in journal order (they are plain SQL):

```bash
(
  tags="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("packages/db/migrations/meta/_journal.json","utf8")).entries.map(e=>e.tag).join("\n"))')" || exit 1
  [ "$(printf '%s\n' "$tags" | wc -l)" -eq 8 ] || { echo "expected 8 migrations in the journal" >&2; exit 1; }
  while IFS= read -r t; do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "packages/db/migrations/$t.sql" || { echo "MIGRATION FAILED at $t: stopping" >&2; exit 1; }
    echo "applied $t"
  done <<< "$tags"
)
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "all 8 migrations applied"
else
  echo "SETUP INCOMPLETE: drop and recreate the database, fix the error, then start again" >&2
fi
(exit "$rc")
```

Works in bash and zsh (no `#` comments inside the block, so it also pastes cleanly into an interactive zsh). The snippet's exit status is the migration result (0 only if all eight applied; nonzero otherwise): the final `(exit "$rc")` sets `$?` without closing an interactive shell. **Do not continue to step 5 unless it printed `all 8 migrations applied`.** Each `psql` call is checked explicitly (`ON_ERROR_STOP` plus `|| exit 1` inside a subshell, so your terminal is not closed), so the loop stops at the **first** failing migration and a later one never runs on a half-applied schema; if it fails, drop and recreate the database and start again. Migrations run in journal order. Expected: `applied 0000_…` through `applied 0006_…`, then `all 8 migrations applied`, and 8 tables in the `public` schema (`psql "$DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'"`).

## 5. Provision the single operator

The app has exactly one operator account (no self-registration, no shared default password). Choose your own password; it is read from the environment and never printed:

```bash
export NMI_OPERATOR_USERNAME=judge
export NMI_OPERATOR_PASSWORD="$(openssl rand -base64 18)"   # or choose one; 12+ characters
echo "Your sign-in password: $NMI_OPERATOR_PASSWORD"          # keep it for step 8
pnpm --filter @nmi/api provision-operator                      # prints: Operator created.
```

## 6. Start the API

Common settings for both modes (the session secret is random per run):

```bash
export SESSION_SECRET="$(openssl rand -base64 48)"
export WEB_ORIGIN=http://localhost:5173
export PORT=3001
export PAYPAL_ENV=sandbox PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
```

### Mode A — SIMULATED evaluation (no credentials)

```bash
export PAYPAL_DRAFTS_ENABLED=true PAYPAL_CLIENT_ID=simulated-not-a-real-id PAYPAL_CLIENT_SECRET=simulated-not-a-real-secret
export NMI_SIMULATED_EVAL=1
pnpm --filter @nmi/api exec tsx ../../design/evidence/NMI-DEMO-R0/simulated-eval-server.ts
```

The console prints a **SIMULATED EVALUATION MODE** banner. The launcher is a separate, test-only entry point: it refuses to start without `NMI_SIMULATED_EVAL=1`, refuses `NODE_ENV=production`, refuses any PayPal host other than the Sandbox host, and never constructs the real OpenAI or PayPal clients. The production server (`apps/api/src/server.ts`) contains no such switch (a unit test enforces this). The placeholder PayPal values above are fake and never sent anywhere. (`/health` reports `aiConfigured:false` in this mode because no OpenAI key exists; the simulated parser is injected separately.)

What the simulated parser understands: simple English such as
`Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15` (customer after "Invoice", quantity/description after "for", unit price before the currency, optional "N% tax", an ISO due date). Leave out the due date to see the clarification question. It is **not** OpenAI.

> The web UI does not display a "simulated" badge (the product is unchanged). Treat everything in this mode as simulated and say so in any recording.

### Mode B — your own providers

**UNTESTED by the project** (real providers were never run). Enter your own secrets at silent prompts so they never appear in the command line, your shell history or this repository (bash or zsh):

```bash
# Optional: real AI parsing with YOUR OpenAI key and a model YOU choose and have verified.
printf 'OpenAI API key (hidden): ';  read -rs OPENAI_API_KEY; echo; export OPENAI_API_KEY
printf 'OpenAI model name you verified: '; read -r OPENAI_MODEL; export OPENAI_MODEL
# Optional: real PayPal Sandbox DRAFT creation with YOUR Sandbox REST app (Sandbox, never Live).
printf 'PayPal SANDBOX client id: ';   read -r PAYPAL_CLIENT_ID; export PAYPAL_CLIENT_ID
printf 'PayPal SANDBOX secret (hidden): '; read -rs PAYPAL_CLIENT_SECRET; echo; export PAYPAL_CLIENT_SECRET
export PAYPAL_DRAFTS_ENABLED=true
pnpm --filter @nmi/api start
```

Choose the OpenAI model from the models available to your own account (the app has no default and the project did not verify any model); skip the OpenAI lines to keep manual entry. Skip the PayPal lines to keep drafting off.

- Create your own Sandbox REST app at the PayPal Developer dashboard (Sandbox → Apps & Credentials) with the **Invoicing** feature enabled and a Sandbox **Business** (merchant) account. Do not use Live credentials; the server refuses any non-Sandbox PayPal base URL.
- Keep credentials in your shell or an ignored `.env` file. Never commit them. Without these variables the app still works: parsing falls back to manual entry and PayPal draft creation answers `paypal_disabled`.
- Real PayPal drafting creates **one DRAFT per invoice in your Sandbox**. It does not email anyone, send the invoice or move money.
- Real-provider behaviour has **not** been verified end to end by the project (see `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`); expect to be the first to try it. The **project owner's** bounded acceptance runs (call caps, synthetic inputs, evidence rules) are a separate, separately authorized procedure there; this Mode B section is for judges using their own accounts and does not authorize or substitute for those runs.

Default (neither set): `pnpm --filter @nmi/api start`. Check it is up: `curl http://127.0.0.1:3001/health` → `{"status":"ok","paypalEnvironment":"sandbox","aiConfigured":false}`.

## 7. Start the web app

In a second terminal in the repository root:

```bash
pnpm --filter @nmi/web dev
```

Open **http://localhost:5173** (use exactly this origin; it must equal `WEB_ORIGIN`). The dev server proxies `/api` to the API on port 3001.

## 8. Walk through the product

1. **Sign in** with `judge` and the password from step 5.
2. **Describe an invoice:** New invoice → paste `Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15` → *Parse with AI*. In mode A this is the SIMULATED parser; with no provider configured you get "AI parsing is unavailable" and can use *Enter manually*.
3. **Review (human control):** every field is editable; the totals shown are labelled estimates. Nothing is saved yet.
4. **Save:** *Save draft* writes to PostgreSQL. The page that opens says "Saved in PostgreSQL"; the totals are server-computed.
5. **Dashboard:** *Back to drafts* lists the saved invoice (read from PostgreSQL). Amounts of different currencies appear in separate cards and are never added together. Try a second invoice in EUR: `Invoice Vienna Cafe for 3 brand audits at 199.99 EUR each` (the simulated parser asks for the due date: answer `2030-03-01`).
6. **Sandbox DRAFT:** open a saved invoice → *Create PayPal Sandbox draft…* → read the confirmation (exact invoice, customer, currency, server-computed total; the customer is **not** emailed, no payment is collected, nothing is sent) → confirm. The page shows the validated DRAFT id and re-reads the saved state.
7. **Status verification:** *Check status* only re-reads the server record. The dashboard shows "PayPal draft created" for that invoice.

Not implemented (by design): sending invoices, collecting payments, automatic reminders, payment webhooks, multi-user accounts.

## 9. Automated check (optional)

Reproduces steps 1–8 headlessly against a disposable database with both providers simulated, using the production build and strict CSP:

```bash
pnpm --filter @nmi/web build
node design/evidence/NMI-DEMO-R0/run-e2e-journey.mjs     # expects: 32/32 passed
```

Other checks: `pnpm validate` (lint, format, typecheck, tests, build, bundle scan). PostgreSQL integration tests need a disposable database whose name starts with `nmi_test`: `TEST_DATABASE_URL=postgres://nmi@127.0.0.1:54370/nmi_test pnpm test:db` (create that database first).

## 10. Changing ports

If port 3001 is busy: set `PORT` to a free port (for example `PORT=3002`) for the API **and** run the web dev server with `NMI_API_ORIGIN` pointing at it (for example `NMI_API_ORIGIN=http://127.0.0.1:3002 pnpm --filter @nmi/web dev`). If port 5173 is busy, set `WEB_ORIGIN` to the exact new web origin and start Vite with `--port` on it.

## 11. Safe teardown and cleanup

```bash
# Stop only the processes you started (Ctrl-C in each terminal), then:
pg_ctl -D /tmp/nmi-pg -m fast stop
rm -rf /tmp/nmi-pg /tmp/nmi-pg.log
unset DATABASE_URL SESSION_SECRET NMI_OPERATOR_USERNAME NMI_OPERATOR_PASSWORD NMI_SIMULATED_EVAL \
      OPENAI_API_KEY OPENAI_MODEL PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET PAYPAL_DRAFTS_ENABLED
# Docker option: docker rm -f nmi-pg
```

If you used your own PayPal Sandbox app, drafts created in it remain in your Sandbox account until you delete them there.

## 12. Troubleshooting

- **Login fails with 403:** the browser origin must equal `WEB_ORIGIN` exactly (`http://localhost:5173`, not `127.0.0.1`).
- **API refuses to start:** `SESSION_SECRET` must be ≥ 32 characters; `DATABASE_URL` must be `postgres://…`; with `PAYPAL_DRAFTS_ENABLED=true` both PayPal credentials are mandatory.
- **"AI parsing is unavailable":** expected without a provider. Use *Enter manually* or mode A.
- **"Follow-ups could not be loaded" in Nudgey:** a database/API problem, **not** an email or SMTP setting (no mail feature exists). The usual cause is a database created before follow-ups existed: apply migration `0007` (`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/migrations/0007_perfect_doomsday.sql`). Check first with `psql "$DATABASE_URL" -Atc "select to_regclass('public.invoice_follow_ups')"` (empty = missing) and read the API log for the failing `/api/follow-ups` request. See `tasks/NMI-NDG-03-invoice-status-selector.md`.
- **Too many sign-in attempts (429):** throttling is in-memory per process; restart the API to clear it.
