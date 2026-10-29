# NMI-RENDER-P3A — Hobby judge-demo security and privacy evidence contract

> **DRAFT CONTRACT — NOT TESTED, NOT ACCEPTED, NOT A WAIVER.** Prepared 2026-10-29 for independent audit. This is a prospective QA contract for the owner-selected **Mrdzyn Hobby Free web + Free PostgreSQL 16** judge demo, not a statement that live HTTPS/Render behavior has passed. No production data, Render resources, accounts, browser credentials, secrets, cloud deployment or judge URL is created by this document.

## 1. Authority and precise evidence gap

- Implementation source is the independently audited **`652cf702fd93b05a9b9d64ee9b4c2151c30833b2`** commit; after separate approval an owner-created `release/nmi-render-judges-2026` branch must remain at precisely that SHA. The **merged P2 documentation** lives at `main@18b86c1ad2eeef14deec2b7a50a03232c39d4f05` and does not change the release source. See `docs/NMI-RENDER-P2-STAGING-APPROVAL-PACKET.md` §1A/§1B.
- Existing P1 verification `docs/NMI-RENDER-P1-RUNBOOK.md` §6 step 5 requires examination of **Render-generated HTTP request logs**, which Render makes available to **Pro workspaces and above**. The owner chose **Hobby**, so the specific check is **NOT VERIFIED / UNAVAILABLE**, never PASS or silently waived. Source: https://render.com/docs/logging (checked 2026-10-29).
- Render platform request logging sits outside application control. Application logs, web-browser Network/HAR, P1's local simulated ingress, and URL-construction audits **cannot establish the exact contents of Render's inaccessible platform logs**, redaction rules, or third-party retention. They are *bounded alternative evidence* only.
- **No risk acceptance is granted here.** After this **contract** itself receives independent exact-head audit PASS and owner approval of its test scope, the later live owner-only QA must be run and independently evaluated. Only then may the owner sign the **separate residual-risk acceptance** in §7 and subsequently consider judge URL sharing. A failed test is never overridable by the missing-log exception.
- **Privacy invariant to test:** no search/customer name/email/PII or secret appears in a request URL or emitted application log. Only **synthetic, unique markers** may be entered; this stage must not collect or export real data.

## 2. Evidence integrity rules

1. Pin evidence to **deployed SHA**, exact HTTPS origin, timestamp (UTC), test run ID, tester, GitHub audit/CI refs, Render service and database **IDs stored privately only**, configuration names (no values), and specific observed response/status. Redact internal/external connection URLs, headers with cookies, passwords, CSRF tokens, session tokens, secrets, database owner credentials, judge credentials, and personal accounts.
2. Capture source-level and test evidence from the approved release commit: `apps/api/src/hosted-staging.pg.test.ts` (simulated TLS ingress and negative controls), `apps/api/src/hosting.test.ts`, the search API/browser tests and relevant CI results. Do not claim those mocks reproduce Render edge internals.
3. During *approved* live QA, capture sanitized DevTools Network metadata (method, path only, status, request origin) and carefully redacted application-log excerpts in a **restricted owner-only evidence store**. Never commit raw HAR (often carries cookies/CSRF/body) or unredacted logs to public GitHub. Treat even a synthetic email as a marker to remove from shared evidence.
4. Record redaction methodology, negative-control output, tests that could not run and their reason, and a manifest of hashes of privately stored evidence. No tool or review may output secrets, identifiers, signed URLs or tokens. Evidence retention: until judge QA + independent review ends, then remove raw captures securely on owner-approved teardown; keep only a sanitized pass/fail report. Record the real retention date privately.
5. Each test is **PASS / FAIL / NOT TESTED / NOT OBSERVABLE**, with an explicit evidence mode **LIVE / LOCAL SIMULATED / SOURCE REVIEW**. A successfully executed local simulation may be **PASS for its expressly simulated objective only** (e.g. HPE-03 detection of unsafe request-line logging); it must never be counted as a live HTTPS observation or Render-owned edge-log verification. Missing or skipped execution is **NOT TESTED**, not PASS. A mandatory live objective cannot be satisfied by simulation alone. An independent reviewer must be distinct from the implementation/QA operator for the overall readiness verdict.

## 3. Test matrix: owner-only HTTPS QA (NOT YET EXECUTED)

| ID | Objective / bounded procedure | PASS evidence | Failure / STOP |
| --- | --- | --- | --- |
| HPE-01 | **Pin/runtime:** verify `release/nmi-render-judges-2026` GitHub HEAD and Render deployed SHA each exactly `652cf702…`; Auto-Deploy OFF; one instance, Hobby/Free web + PG16 Free, Singapore; externally exposed URL not distributed | Read-only SHA/config snapshots with secrets redacted | SHA differs, unknown origin, extra service, auto-deploy on: STOP/suspend; do not test on an unaudited release |
| HPE-02 | **Source-level transport:** inspect real browser's authenticated synthetic search; method **POST** `/api/invoice-drafts/search`, marker in JSON body, **not URI/path/query**; normal and malformed/unauthorized (401, 403/CSRF, 400) responses; verify legacy `GET ?q=` returns `400 search_requires_post` **only in local simulated-ingress tests; never send the deliberately leaky URL to Render** | Sanitized Network/URL log: fixed path with no marker, redacted body; app logs contain no marker; published tests PASS on pinned SHA | Marker in any URL/log: STOP, suspend/unshare, investigate; do not deliberately put real data into URL |
| HPE-03 | **LOCAL SIMULATED negative-control integrity:** in an isolated disposable PostgreSQL test checkout at pinned source SHA, run the existing `hosted-staging.pg.test.ts` search test with the simulated edge request-line collector intact: the intentionally unsafe legacy `GET ?q=` is rejected by the app but its encoded synthetic marker is captured by `edgeLog`, and the test passes. Then, in a **temporary uncommitted mutation only**, remove/disable the `edgeLog.push(\`${creq.method} ${creq.url}\`)` call inside the simulated-edge handler (not the `expect(edgeLog.at(-1)).toContain(...)` assertion). Re-run the same targeted test with its disposable DB: it **must FAIL at the marker-capture assertion**. Restore the collector line and re-run to PASS; verify clean tracked diff. Record all three results and mutation diff privately, with no secrets. **Never send the intentionally leaky URL to real Render.** | Baseline PASS → collector-disabled mutation FAIL at marker-capture assertion → restored PASS, with test identifiers/results and `LOCAL SIMULATED` label. This demonstrates sensitivity of the test to removal of request-line capture, **not** Render logging behavior. | Baseline fails, mutation does not fail at stated assertion, restoration fails, missing disposable DB, or change left in source: BLOCK; record NOT TESTED if unavailable |
| HPE-04 | **App logging:** scan sanitized Fastify logs for fresh, random synthetic search and e-mail markers across 200/400/401/403 and invalid/missing Origin cases; confirm no query/PII in log message, URL, error stack | Test count and redacted absence/presence table; negative-control proof from P1, not a claim about Render's platform logs | Any marker/secret in application logs: STOP |
| HPE-05 | **Real HTTPS/security headers:** validate HTTPS certificate, HSTS, CSP `frame-ancestors 'none'`, `nosniff`, no wildcard CORS, SPA/static/API fallback isolation and `/health` not mistaken for DB health | Browser or curl metadata with no cookies, test outcomes | Insecure cookie/headers/routing: STOP |
| HPE-06 | **Session/CSRF/Origin:** `__Host-nmi_session`: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain; missing/foreign Origin rejected; missing/wrong CSRF rejected; logout revokes old session; no token values captured | Attribute checklist plus HTTP statuses only | Any auth bypass or cross-origin mutation: STOP |
| HPE-07 | **Proxy spoof:** assess Render real XFF shape; `TRUST_PROXY=1` only if hop count justified; 21 failed login attempts with rotating spoofed XFF must reach `429`, or `TRUST_PROXY=false` safe one-bucket behavior explicitly documented | Status series, sanitized address classification; no brute-force on third-party accounts | Spoofed XFF defeats limiter or wrong hop config: STOP |
| HPE-08 | **DB and lifecycle:** TLS in external owner connection; app runtime DB role `nmi_runtime` cannot DDL/DELETE/audit mutation (SQLSTATE `42501`), while allowed synthetic app writes work; no owner credential on web; Free PG 1 GB, no managed backups, expiry within 30 days, actual judge cutoff before expiry | Privilege denial results, creation/expiry date, approved teardown, migration/rebuild evidence | Cannot create least-privilege role or prove denials: STOP; do not substitute owner role |
| HPE-09 | **Provider isolation:** `PAYPAL_DRAFTS_ENABLED=false`; no PayPal/OpenAI credentials or related env variables; manual-entry fallback works; attempted PayPal draft yields disabled result; no outbound provider calls **only to the extent directly observable** (local mock test and deployed config/log checks) | Evidence of disabled configuration, UI response and mocked transport; note real egress not independently intercepted | Any actual provider request or credential present: STOP; Gates A/B/C unchanged |
| HPE-10 | **Judge access/cold starts:** one high-entropy single-operator credential, no registration, no PII, password manager delivery; confirm sessions revocable; confirm rotation/reset between independent judges **or owner-supervised access**; test idle spin-down and re-entry once; video fallback | Private QA statement + synthetic reset/revocation evidence | Shared unsupervised login, password public, or judge unavailable beyond window: BLOCK |
| HPE-11 | **Billing/retention/stop:** record Free-tier allocation, actual checkout, whether payment method exists, estimated and actual overage terms, $50 credit balance, no unintended resource; document 30-day PG expiry and 14-day grace **not relied on**, verified judge end, target teardown, alert/check cadence | Owner-supplied **non-sensitive** cost sign-off; verified dates and limits | Unknown payment method, billing risk, expiration before judging, missing shutdown plan: BLOCK |

**HPE-EDGE:** **NOT OBSERVABLE on Hobby.** Render-owned per-request HTTP request logs are not available under the selected plan. Record that explicitly, with a separate field for the unproven behavior: whether Render's platform logs retain query strings, redirect targets, untrusted headers, or request bodies and for how long. Neither HPE-02 nor HPE-03 can mark HPE-EDGE PASS.

**Coverage nuance:** offline tests and client-captured actual traffic support that the *app as tested* sends no sensitive search data in the URL. They do not provide independent visibility into every Render edge component, unseen requests or proprietary logging/retention. No simulation is a guarantee of no PII in Render logs.

## 4. Minimal evidence table (fill AFTER approved QA)

| Case | Verdict | Observed / source evidence ID | Independent reviewer | Notes |
| --- | --- | --- | --- | --- |
| HPE-01 through HPE-11 | **NOT TESTED** | — | — | Do not pre-fill PASS |
| HPE-EDGE | **NOT OBSERVABLE — Hobby** | Render published limitation | — | Requires explicit §7 residual acceptance, not technical PASS |
| Additional real browser Safari/Firefox, mobile/touch, 400% zoom, assistive tech | **NOT TESTED** | — | — | Document separately; do not imply universal accessibility verification |

No public link or credential should be in this table. Retain a *private* per-test evidence worksheet if multiple steps run; write the exact result for each HPE ID, not merely the table's grouped placeholder.

## 5. Stop / remediation policy

- **STOP/SUSPEND immediately** if any actual query/customer marker, session secret or credential reaches any observed request URL/log; a proxy test bypasses throttling; real provider traffic occurs; the deployed SHA is not approved; unauthorized paid plan appears; database owner credentials are placed in the runtime app; or security headers/CSRF/session fail.
- Remove public availability (suspend web service where approved), revoke all sessions, rotate potentially exposed credentials, preserve *sanitized* incident evidence in a restricted store, notify owner. Recovery requires a separately audited remediation PR, refreshed CI and live QA; never treat this contract as permission to patch deployed code.
- **BLOCK, not PASS**, if the payment-method status is unknown; the Free PG expires before judging; the login reset/supervision process fails; least-privilege role creation is unavailable; or any mandatory HPE case cannot be executed.
- **Fallback** for judges: the approved reproducible local setup/demo video (Option A), subject to owner release decision. Do not represent hosted Option B as live or fully verified if blocked.

## 6. Independent review, readiness and external sharing sequence

1. **Now:** independent exact-head source/document review of this contract **only**, then owner approves this *test plan* via explicit written decision. No live test permission is implicit.
2. **Later:** resource creation and first deployment require the **separate, signed authorization in `docs/NMI-RENDER-P3B-PROVISIONING-AUTHORIZATION.md`**, with privately verified Free checkout and billing/overage conditions; opening or merging this PR does **not** grant that approval.
3. **Owner-only approved QA:** execute HPE-01…11, record all observed evidence. Any failure or nonexecution must be reported, not papered over.
4. **Independent exact-deployed-SHA evidence audit:** verify technical results, evidence integrity and no omissions; report PASS/FAIL/BLOCKED per case. The independent reviewer does **not** approve the owner's residual privacy risk.
5. **Owner residual-risk decision (§7):** if all mandatory live objectives PASS on live evidence and HPE-03 separately PASSes its explicit **LOCAL SIMULATED** objective (no mandatory case FAIL/NOT TESTED), owner may independently **ACCEPT** or **REJECT** the narrowly scoped inability to inspect **Render-owned HTTP request logs**. Even owner acceptance does not change HPE-EDGE from NOT OBSERVABLE.
6. **Separate judge sharing approval:** explicitly authorize the live URL's distribution and secure credential-delivery/reset procedure, judge window and teardown. No public password; no Devpost/video publication without separate approval.
7. **Teardown:** follow P2 §5 step 8, revoke access, delete authorized resources and verify final credit/usage. Stop before Free PG expires; no reliance on 14-day grace.

## 7. UNSIGNED residual-risk acceptance (not an authorization for the current PR)

**Status: NOT REQUESTED / NOT GRANTED.** Only after approved live owner QA and independent review, the owner may record one decision in a private approval record, referencing the final HPE evidence report:

- Exact Render deployment SHA: **PENDING**
- Mandatory HPE-01…HPE-11 outcomes / independent audit link: **PENDING**
- HPE-EDGE status: **NOT OBSERVABLE ON HOBBY** (cannot be labeled PASS)
- Known residual: no access to platform-owned HTTP request URL logs; exact platform log contents, query-string/body retention and sanitation unverified.
- Data scope: only fictional/synthetic invoices, no real personal or customer records; no provider credentials/calls.
- Decision: **[ACCEPT / REJECT — UNSIGNED]**
- Owner, decision date, permitted judge window, mitigation and stop plan: **PENDING**

**No acceptance is inferred from selection of Hobby, approval of the contract, resource provisioning, or a passing application test.** If rejected, do not share hosted credentials/URL; use Option A or seek a separately approved hosting/logging alternative.

## References

- https://render.com/docs/logging — platform HTTP request logs are Pro+
- https://render.com/docs/free — Free web spin down, 750 hours, PG 30-day expiry/14-day grace/1 GB/no backup
- https://render.com/docs/postgresql-creating-connecting — same-region internal database, TLS and external-IP restrictions
- `docs/NMI-RENDER-P1-RUNBOOK.md`; `docs/NMI-RENDER-P2-STAGING-APPROVAL-PACKET.md`
- `apps/api/src/hosted-staging.pg.test.ts`; `apps/api/src/hosting.test.ts`; `docs/SECURITY.md`
