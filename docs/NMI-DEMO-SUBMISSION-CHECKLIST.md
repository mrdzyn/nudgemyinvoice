# NudgeMyInvoice — Submission checklist and release-blocker register

> Maintained by NMI-DEMO-R0. **Nothing has been submitted, published, uploaded or deployed.** Deadline (owner brief): **Nov 12, 2026, 12:00 PM PST = Nov 13, 2026, 4:00 AM Asia/Manila.** Official rules: https://paypalaihackathon.devpost.com/rules — **not retrievable by R0's own tooling (HTTP 403); independently retrieved and verified by the independent reviewer** for: setup instructions OR hosted demo is acceptable; a public open-source repository/license and a public YouTube video under 3 minutes are required. All other criteria (dates, eligibility, team, sponsor rules) are **not** independently verified here; the owner confirms every row marked "owner" against the live page.

## A. Official requirements (per owner brief) — status

| Requirement | Status | Evidence / action |
| --- | --- | --- |
| Meaningful PayPal + AI integration | Implemented; **real-provider verification incomplete** | PayPal Invoicing Sandbox draft flow + OpenAI Responses parser are implemented; PayPal create+show was verified once against the real Sandbox (2026-10-26, backend only); OpenAI never verified live. See `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`. |
| Working, reproducible application | **Met (simulated + local)** | Clean-clone run of `docs/NMI-DEMO-JUDGE-RUNBOOK.md`; `run-e2e-journey.mjs` 32/32. |
| Public source repository | Owner to confirm repo visibility | https://github.com/mrdzyn/nudgemyinvoice |
| Visible open-source license | Met | `LICENSE` (MIT), referenced in the README. Owner to confirm it shows in the GitHub sidebar. |
| Functional judge access (setup instructions OR hosted deployment) | **Met by setup instructions** (recommended); independently verified that setup instructions satisfy the rule | `docs/NMI-DEMO-DEPLOYMENT-DECISION.md` (Option A). |
| Public YouTube demo < 3:00 | **Not done** | Script in `docs/NMI-DEMO-VIDEO-SCRIPT.md`; not recorded or uploaded. |
| Project description + implementation details | Draft ready | `docs/NMI-DEMO-DEVPOST-DRAFT.md` (not submitted). |
| Available through judging (to Dec 15, 2026) | Met for Option A (repository stays public) | Keep repo public and dependencies resolvable; no hosting to keep alive. |
| Eligibility, team, sponsor-tool rules | **Owner** | Not verifiable from the repository. |

## B. Owner tasks before submission (none done in R0)

- [ ] Confirm the rules not independently verified (eligibility, team/account, sponsor rules, judging dates, testing-instructions field) on the live Devpost page; the access, repository/license and video-length rules are already independently verified.
- [ ] Decide deployment (A only, or A + B) — see the decision doc.
- [ ] Decide whether to authorize real-provider **Request A** (OpenAI, up to 3 calls), **Request B** (exactly one new PayPal Sandbox USD 540.00 DRAFT; **BLOCKED** until the 401-resend code fix is merged) and, later, **Request C** (combined walkthrough) — three separate forms in `docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`, procedure in `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md`. All three are **NOT AUTHORIZED** today; without them the demo is SIMULATED and must be labelled so.
- [ ] Choose the OpenAI model for the Devpost text: proposed `gpt-6-luna` (public docs list Responses + Structured Outputs, USD 0.10/0.50 per 1M input/output tokens; account entitlement unconfirmed). Name it publicly **only** after Gate A is REAL PASS; otherwise write "not verified live".
- [ ] Record, caption and upload the video (public YouTube, < 3:00); test playback signed out.
- [ ] Fill and submit Devpost (paste the draft; add video URL; testing instructions = runbook link).
- [ ] Re-run `pnpm validate` and the runbook on the exact final commit; tag the submitted commit.
- [ ] Keep the repository public and the default branch stable through Dec 15.

## C. Release-blocker register (untested or unresolved)

| # | Item | Blocks | Status |
| --- | --- | --- | --- |
| 1 | Real OpenAI Responses call never executed | Any claim of real AI parsing | **Open** (Gate A) |
| 2 | No complete real-provider browser journey | Any claim "works end to end against real providers" | **Open** (Gates A+B) |
| 3 | PayPal search/reconciliation/timeout/error paths never run against the real Sandbox | Claims about real error handling | **Open**; fake-transport + PostgreSQL tests only |
| 4 | One-create PayPal Sandbox budget exhausted (1/1) | Any new real draft | **Open**; not reset by R1; only Request B (exactly one new create, separate permit) can authorize a new create |
| 5 | HTTPS + `__Host-nmi_session` cookie never tested | Any hosted deployment | **Open** (Option B only) |
| 6 | Reverse-proxy/ingress/CDN log redaction of `q` (customer search text in GET URL) | Any hosted deployment | **Open**; documented prerequisite |
| 7 | No single-origin static+API serving configuration exists | Any hosted deployment | **Open** (Option B only) |
| 8 | Hosted trust-proxy / throttling behaviour | Any hosted deployment | **Open**; throttling is in-memory per process |
| 9 | Exactly one operator in production; shared account on a hosted instance | Hosted multi-judge use | **Open** (design limit; use Option A) |
| 10 | No migrate command or production migration path | Any hosted deployment | **Open**; manual SQL in journal order (runbook) |
| 11 | DB least-privilege role not provisioned/tested | Any hosted deployment | **Open** |
| 12 | Screen readers (VoiceOver/NVDA) | Accessibility claims | **Open**; not tested |
| 13 | Real touch devices, Safari, Firefox, 400% zoom | Cross-browser/accessibility claims | **Open**; only headless Chrome/390 px emulation |
| 14 | Evaluation mode shows no in-app "SIMULATED" badge | Judges mistaking simulated for real | **Open** (needs owner-approved product change); mitigated by runbook, console banner and video labels |
| 15 | Docker container path of the runbook not exercised | Runbook completeness | **Open** (local PostgreSQL path tested) |
| 16 | Webhooks, sending, payment collection, reminders, multi-user | Not implemented | Out of scope; do not claim |
| 17 | Gate A request count: 3 parse attempts can be up to 6 provider requests (`maxRetries: 1`); `gpt-6-luna` default medium reasoning vs 1024 default output cap | Authorizing Request A | **Open**: owner must pick A-strict (needs a separate audited `maxRetries: 0` code fix) or A-six (explicit up to-6-request authorization with spend limit); config-only `OPENAI_MAX_OUTPUT_TOKENS=4096` recommended; no code change in R1 |
| 18 | **Historical create-401 resend defect fixed:** independently audited PR #19 squash-merged at `09bbe90a977516c27bc0715141e74e090b41fba5`. No automatic create resend; create 401 -> unknown/reconcile. However neither browser POST count nor DB `attempts=1` independently proves server egress. | **Gate B / Request B: BLOCKED** | **Open:** observer plan `docs/NMI-DEMO-R1-B-WIRE-COUNT.md` is DRAFT / NOT OFFLINE VALIDATED. Require actual Fastify/Node send-attempt counter with loopback negative control, exact-process attachment, independent audit and owner merge; then a NEW, separately authorized one-create Request B. Historical budget 1/1 remains exhausted. |
| 19 | Real-provider evidence | Any REAL claim | All three gates **PENDING** (B BLOCKED); templates in `docs/NMI-DEMO-EVIDENCE-TEMPLATES.md` |
| 20 | Gate B drops its disposable database, so the Gate B invoice cannot be reopened in the app; Gate C must not imply it | Gate C wording / video | **Open**: default is a read-only PayPal Sandbox dashboard view labelled RECORDED EARLIER; a preserved-database plan (acceptance doc 6.3) needs its own owner decision and audit |

## D. Security and privacy confirmations (R0 audit)

| Check | Result | How verified |
| --- | --- | --- |
| No secrets committed | **Confirmed** | `git grep` for key/secret/private-key patterns: no hits; only `.env.example` (placeholders) is tracked; `pnpm check:bundle` (browser bundle scan) clean. Not a substitute for a dedicated secret scanner on full git history; owner may run one. |
| No real customer PII in evidence | **Confirmed by construction + scan** | All journeys create only fictitious customers (`*.example` addresses); a scan of docs/design/tasks found no non-reserved e-mail domains. Screenshots were generated from those synthetic runs; a sample was inspected, not every image. |
| No credentials in screenshots | **Confirmed by construction** | Passwords/secrets are random per run and never rendered; no `.env` or terminal is captured. |
| No unsafe demo accounts / default passwords | **Confirmed** | No default password exists; the operator is provisioned from the environment per run (runbook uses a random password). Scan for hard-coded passwords: none. |
| No PayPal Live credentials or host | **Confirmed** | Only the Sandbox host appears in source/docs; the server refuses any other host (tests assert refusal); the simulated launcher also refuses it. |
| No automatic financial operations | **Confirmed** | No send/remind/cancel/refund/payment/webhook route exists (route enumeration + browser journeys assert none requested); draft creation requires an explicit confirmation. |
| No unintended provider calls | **Confirmed for R0** | R0 made no OpenAI/PayPal request; simulated launcher never constructs the real clients (unit-tested); `PAYPAL_DRAFTS_ENABLED` defaults to false. |
| No newly exposed debug/test routes | **Confirmed** | Routes: `/health`, `/api/auth/{login,logout,session}`, `/api/invoice-drafts[/parse|/:id[/paypal-draft]]` only. The fake-provider launcher is a separate file never imported by production (unit-tested: `no-fake-provider-switch.test.ts`). |
| Browser origin restrictions preserved | **Confirmed** | Origin/CSRF tests and journeys unchanged and passing (runbook: login from the exact `WEB_ORIGIN`). |
| No customer data in browser persistent storage or the browser navigation URL/history | **Confirmed** | Every journey asserts empty localStorage/sessionStorage/IndexedDB/Cache and no customer data in the navigation URL. **Not claimed:** the dashboard search text IS sent in the `q` parameter of the HTTP GET request URL; Fastify strips query strings from its logs; proxy/ingress/CDN log redaction is unverified (blocker 6). |

## E. Evidence summary on `main` + R0 (all deterministic fakes; none is real-provider evidence)

- `pnpm test` (no database): see the R0 PR for exact counts; `pnpm test:db` on real PostgreSQL 16.15: 277 passed (+ the R0 tests that need no database run in the main suite).
- Browser journeys rerun on the merged code in R0: C2 88/88, C3 116/116, C4 79/79 (stale-copy assertions updated to the approved current behaviour: **C2 = 3, C3 = 5, C4 = 2**; behavioural assertions unchanged), C5-P1 102/102, **R0 end-to-end 32/32**.
