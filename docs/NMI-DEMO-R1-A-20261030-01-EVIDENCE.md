# Gate A evidence — R1-A-20261030-01 (sanitized)

Labels: REAL = observed on a real provider; DB = verified by the agent in the disposable database; OWNER = reported by the owner; PENDING = not observed. No key, token, header, cookie, organisation/project id, billing detail or full PayPal id appears here.

```
Run ID: R1-A-20261030-01          Authorization quoted: owner message 2026-10-30 (path A-six, 3 parse attempts / 6 wire requests, gpt-6-luna, cap 4096, intended US$1 ceiling, A3 skipped)
Executed by: owner                Commit under test: 18b86c1ad2eeef14deec2b7a50a03232c39d4f05 (main; no code changes)
Model requested: gpt-6-luna       Model shown by provider usage page: PENDING (owner to read)
OPENAI_MAX_OUTPUT_TOKENS: 4096    Request-count path: A-six   A-F2 choice: 4096-cap
Provider-side limit set: PENDING (owner to state yes/no and amount; the US$1 ceiling was "intended")
Entitlement + price confirmed without a billable request: PENDING (owner); public pages rechecked by agent 2026-10-30: USD 0.10 in / 0.50 out per 1M, Responses API + Structured Outputs listed
Environment: production server (apps/api start via launcher script, SETUP OK check): OWNER-reported; /health aiConfigured=true: PENDING (owner)
PayPal credentials unset: yes (launcher refuses otherwise) ; PAYPAL_DRAFTS_ENABLED=false: yes (launcher) ; paypal_draft_operations rows: 0 (DB, verified after the run)

Call  Input id  HTTP      Latency   Outcome                                   Label
A1    A1        PENDING   PENDING   validated draft reached Review, saved     REAL PASS (OWNER) ; server audit: invoice.parse success (DB)
A2    A2        PENDING   PENDING   validated draft reached Review, saved     REAL PASS (OWNER) ; server audit: invoice.parse success (DB)
A3    skip      -         -         skipped by authorization                  n/a
Application parse attempts used: 2/3   Provider-reported wire requests: 2 (limit 6 under A-six; no resend observed)

A1 saved record (DB): customer Northwind Studio, ap@northwind.example, USD, 1 line "logo concepts" qty 2.00 x 250.00, due 2030-01-15, server total USD 540.00 (54000 minor). Matches section 4.4.
A2 saved record (DB): customer Vienna Cafe, cafe@vienna.example, EUR, 1 line "brand audits" qty 3.00 x 199.99, due 2030-03-01, server total EUR 599.97 (59997 minor). Matches section 4.4.
Dashboard rows / separate USD and EUR cards: OWNER-reported saved correctly; card separation PENDING (owner)
Database state after run (DB): invoices 2, invoices with a PayPal id 0, paypal_draft_operations 0, approvals 0, paypal_webhook_events 0, operators 1.
Audit log (DB): invoice.parse success x2, invoice.draft_save success x2, auth.login success x1, auth.login failure x1 (bad_credentials, unknown username), auth.request_denied x2 (no_session, pre-login), operator.provision success x1. Not STOP conditions.

Usage (provider dashboard): requests 2 ; input tokens 668 (~334 per request, inside the 300-400 estimate) ; output tokens PENDING (not reported) ; cost: project spend shows USD 0.00 at dashboard precision.
Organisation October spend shows USD 0.01. That figure is NOT attributed to this run: it is an organisation total with unknown other usage and display rounding.
Arithmetic bound only (not a measurement): input 668 x 0.10/1M = USD 0.0000668; output <= 2 x 4096 x 0.50/1M = USD 0.004096; total <= about USD 0.0042, consistent with a USD 0.00 project display and below the A-six worst case of USD 0.0126.
Fallback on a real provider failure: n/a (no failure observed)
STOP condition triggered: none observed
Teardown: API stopped: owner-reported yes, BUT an agent check after that report (2026-10-30) still found the API serving on port 3001 with aiConfigured=true, so API stopped = PENDING (re-verify) ; OPENAI_* unset: PENDING ; dedicated key revoked: OWNER-reported yes (not independently verifiable) ; database dropped: no (not dropped; owner approval required)
Secrets review before sharing (owner initials): ____
Overall label: REAL PASS (provisional) — A1 and A2 produced validated drafts that saved with the expected server totals; 2 provider requests, no PayPal operation. Fields marked PENDING remain owner-confirmations.
```

What this proves: this model, schema and these two synthetic inputs worked once each. It does not prove accuracy, robustness, cost at scale, PayPal behaviour, or anything about Gate B/C.
