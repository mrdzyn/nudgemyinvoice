# Gate B — Local outbound PayPal request counting (OFFLINE-VALIDATED; NOT YET INDEPENDENTLY AUDITED; NOT AUTHORIZED TO RUN LIVE)

> **Status.** The observer below was **validated offline by the implementation agent** (loopback and fail-closed network sandbox only; no PayPal, no OpenAI, no credential; results in section 6 and `docs/NMI-DEMO-R1-B-WIRE-OFFLINE-TESTS.md`). It has **not** been independently audited and has **never been run against the real PayPal Sandbox**. Using it is **not authorized**: Gate B is **BLOCKED / NOT AUTHORIZED** until (1) an independent audit of this procedure and of the exact observer hash, (2) the owner's merge of this documentation, and (3) a **new written Request B** that cites the merged commit and the observer hash. Gates A and C remain NOT AUTHORIZED. The historical one-create budget stays **1/1 exhausted**. FIX-B1 (never resend a create after HTTP 401) is merged on `main` at `09bbe90a977516c27bc0715141e74e090b41fba5` (PR #19, review `5692753316`).

## 1. Evidence gap

| Source | Supports | Does NOT prove |
| --- | --- | --- |
| Browser DevTools | One browser-to-Fastify confirmation | How many HTTP creates the **server** sent to PayPal |
| PostgreSQL `attempts=1` | One durable claim | The number of transport sends |
| Counting fake transport + PostgreSQL tests (FIX-B1) | The reviewed client sends at most one create per invocation | Behaviour at a real host |
| Sandbox dashboard N → N+1, DRAFT, USD 540.00 | One matching remote draft is visible | Exactly one HTTP create was attempted |
| **This observer** (`undici:client:sendHeaders`) | A counted **send attempt** for an exact method, path and origin, from the real server process | That PayPal received or accepted it (detection, **not prevention**) |

Never substitute browser, database or dashboard counts for the observer count. If the observer is missing, silent, ambiguous or incomplete the wire count is **PENDING / STOP**, never zero and never PASS.

## 2. What the observer does and does not do

- It subscribes to the Node/Undici diagnostics channel `undici:client:sendHeaders` (documented, experimental: https://undici.nodejs.org/api/DiagnosticsChannel) and reads exactly three string fields: `request.origin`, `request.method`, `request.path`. It never touches headers, body, cookies, tokens, the response, or the event/request objects (the audit can confirm this by reading the 100 lines below).
- It classifies each send: `create` = `POST https://api-m.sandbox.paypal.com/v2/invoicing/invoices`; `oauth` = `POST /v1/oauth2/token`; `search` = `POST /v2/invoicing/search-invoices`; `show` = `GET /v2/invoicing/invoices/<id>`; any other method/path/query on that origin = `unexpected`; any other origin (including any Live host, OpenAI, a proxy) = `foreign`. No wildcard, no hostname fallback, no override by environment variable.
- It prints `NMI-WIRE STOP` immediately on a second create, any `unexpected` or any `foreign` send, but it **cannot block** the request. A STOP is a verdict (REAL FAIL), not a safety interlock.
- It records only integers, the run id, the PID/PPID, Node version, entry file name and timestamps, and writes one `0600` summary file per observed Node process at exit (and prints it to stderr). It refuses to start (exit 97) without `NMI_WIRE_RUN_ID` and an absolute `NMI_WIRE_OUT_DIR`.
- A final summary is also produced on SIGINT (exit 130) and SIGTERM (exit 143); `SIGUSR2` prints a **non-final** live snapshot without stopping the process.

## 3. The audited preload (exact source, SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`)

The file is exactly the content of the block below (including the final newline). The auditor and the operator must confirm the hash before use; a different hash means STOP.

<!-- prettier-ignore -->
```js
"use strict";
// NMI Gate B wire-count observer (nmi-wire-1). COUNTS ONLY. It reads exactly three string fields
// of the Undici send event (origin, method, path) and nothing else: never headers, body, cookies,
// tokens, response or the request/event objects. It changes no request and no global dispatcher.
const dc = require("node:diagnostics_channel");
const fs = require("node:fs");
const path = require("node:path");

const ORIGIN = "https://api-m.sandbox.paypal.com";
const RUN = process.env.NMI_WIRE_RUN_ID || "";
const OUT = process.env.NMI_WIRE_OUT_DIR || "";
const valid = /^[A-Za-z0-9-]{1,40}$/.test(RUN) && OUT !== "" && path.isAbsolute(OUT);
if (!valid) {
  process.stderr.write("NMI-WIRE REFUSED: set NMI_WIRE_RUN_ID and an absolute NMI_WIRE_OUT_DIR\n");
  process.exit(97);
}

const c = { events: 0, create: 0, oauth: 0, show: 0, search: 0, unexpected: 0, foreign: 0 };
const startedAt = new Date().toISOString();
let stopped = false;
let written = false;

function classify(origin, method, p) {
  if (origin !== ORIGIN) return "foreign";
  if (typeof p !== "string" || p.includes("?") || p.includes("#")) return "unexpected";
  if (method === "POST" && p === "/v2/invoicing/invoices") return "create";
  if (method === "POST" && p === "/v1/oauth2/token") return "oauth";
  if (method === "POST" && p === "/v2/invoicing/search-invoices") return "search";
  if (method === "GET" && /^\/v2\/invoicing\/invoices\/[A-Za-z0-9-]{1,64}$/.test(p)) return "show";
  return "unexpected";
}

function stop(why) {
  if (stopped) return;
  stopped = true;
  process.stderr.write("NMI-WIRE STOP run=" + RUN + " pid=" + process.pid + " why=" + why + "\n");
}

dc.subscribe("undici:client:sendHeaders", (message) => {
  const r = message && message.request;
  const kind = classify(r && r.origin, r && r.method, r && r.path);
  c.events += 1;
  c[kind] += 1;
  if (kind === "foreign" || kind === "unexpected") stop(kind);
  if (c.create > 1) stop("create>1");
});

function summary(signal, complete) {
  return JSON.stringify({
    observer: "nmi-wire-1",
    runId: RUN,
    pid: process.pid,
    ppid: process.ppid,
    node: process.version,
    entry: path.basename(String(process.argv[1] || "")),
    startedAt,
    endedAt: new Date().toISOString(),
    counts: { ...c },
    stop: stopped,
    signal: signal || null,
    complete,
  });
}

function write(signal, final) {
  if (final && written) return;
  const line = summary(signal, final);
  process.stderr.write("NMI-WIRE SUMMARY " + line + "\n");
  if (final) {
    written = true;
    try {
      fs.writeFileSync(path.join(OUT, "wire-" + RUN + "-" + process.pid + ".json"), line + "\n", {
        flag: "wx",
        mode: 0o600,
      });
    } catch {
      process.stderr.write("NMI-WIRE FILE-WRITE-FAILED pid=" + process.pid + "\n");
    }
  }
}

process.stderr.write(
  "NMI-WIRE ACTIVE run=" + RUN + " pid=" + process.pid + " entry=" + path.basename(String(process.argv[1] || "")) + "\n",
);
process.on("exit", () => write(null, true));
for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.on(sig, () => {
    write(sig, true);
    process.exit(code);
  });
}
process.on("SIGUSR2", () => write("SIGUSR2", false));
```

## 4. Operator procedure (owner executes; only after the unblock conditions in section 8)

Use an interactive bash or zsh. The blocks contain no inline comments, one command per line, so they can be pasted. Nothing here is run by the coding agent.

**Block 1 — create an owner-only directory outside the repository and write the audited file:**

<!-- prettier-ignore -->
```bash
export NMI_WIRE_DIR="$(mktemp -d)"
chmod 700 "$NMI_WIRE_DIR"
mkdir -m 700 "$NMI_WIRE_DIR/out"
printf '%s\n' "$NMI_WIRE_DIR"
```

Then write `nmi-wire-observer.cjs` into that directory with the exact section 3 content (for example, paste the block into an editor and save it as `"$NMI_WIRE_DIR/nmi-wire-observer.cjs"`).

**Block 2 — verify the hash (must print the section 3 hash; any difference is a STOP):**

<!-- prettier-ignore -->
```bash
shasum -a 256 "$NMI_WIRE_DIR/nmi-wire-observer.cjs"
```

**Block 3 — run id, environment and proxy check (a proxy would change what the process sends; nothing may be set):**

<!-- prettier-ignore -->
```bash
printf 'Run ID from the authorization: '
read -r NMI_WIRE_RUN_ID
export NMI_WIRE_RUN_ID
export NMI_WIRE_OUT_DIR="$NMI_WIRE_DIR/out"
export NODE_OPTIONS="--require $NMI_WIRE_DIR/nmi-wire-observer.cjs"
if [ -z "${HTTPS_PROXY-}${https_proxy-}${HTTP_PROXY-}${http_proxy-}${ALL_PROXY-}${all_proxy-}${NODE_USE_ENV_PROXY-}" ]; then echo "PROXY CHECK OK"; else echo "PROXY SET - STOP"; fi
```

Then add the Gate B environment exactly as in `docs/NMI-DEMO-PROVIDER-ACCEPTANCE.md` section 5.2 steps 3 (blocks 1-2: silent PayPal client id and secret, `PAYPAL_DRAFTS_ENABLED=true`, OpenAI **unset**). `NODE_OPTIONS` applies to every Node process started from that shell, including `pnpm` and `tsx`; that is expected.

**Block 4 — start the real server (leave it running; stop it only as in block 7):**

<!-- prettier-ignore -->
```bash
pnpm --filter @nmi/api start
```

Expected in the server terminal within seconds: three `NMI-WIRE ACTIVE` lines (entries `pnpm`, `cli.mjs`, `server.ts`). **Record the PID of the `server.ts` line.**

**Block 5 — second terminal: confirm the observer is in the listening process and idle before any click (no PayPal contact happens here):**

<!-- prettier-ignore -->
```bash
lsof -ti tcp:3001 -sTCP:LISTEN
```

The printed PID must equal the `server.ts` PID. Then run `kill -USR2` followed by that PID: the server terminal prints a `NMI-WIRE SUMMARY` line with `"complete":false` and **all counts 0** (`events`, `create`, `oauth`, `show`, `search`, `unexpected`, `foreign`). If the PID differs, the marker is missing, the snapshot is absent or any count is not 0: **STOP** (do not click).

**Block 6 — the single authorized click.** Follow the Gate B checklist (acceptance doc 5.2): one browser confirmation for the one synthetic invoice; no double-click, reload or second tab. After the outcome, optionally take one more `kill -USR2` snapshot (read-only check). **STOP immediately** (no further PayPal-facing action, shut down per block 7) if a `NMI-WIRE STOP` line appears.

**Block 7 — shutdown. Use Ctrl-C in the terminal that runs the server** (it signals the whole process group). Never send SIGTERM to the `pnpm` process alone: the offline test showed that leaves the real server running and writes no server summary (section 6, test T6c). If it was killed any other way, find and stop the listening PID, then treat the wire count as **PENDING** unless the listening PID's summary file exists with `"complete":true`. Then:

<!-- prettier-ignore -->
```bash
unset NODE_OPTIONS
ls -l "$NMI_WIRE_OUT_DIR"
cat "$NMI_WIRE_OUT_DIR"/wire-"$NMI_WIRE_RUN_ID"-*.json
```

**Reading the result.** Exactly one summary file per observed Node process is expected (three: `pnpm`, `cli.mjs`, `server.ts`). Only the file whose `pid` equals the listening PID counts. All the following must hold, otherwise the wire count is **REAL FAIL** (a STOP/violation) or **PENDING** (missing/ambiguous), never REAL PASS:

| Field in the listening PID's summary | Required |
| --- | --- |
| `complete` | `true` (final summary, `signal` is `SIGINT` for Ctrl-C) |
| `counts.create` | exactly `1` |
| `counts.unexpected`, `counts.foreign` | `0` |
| `stop` | `false` |
| `counts.oauth` | at least `1` (record the number) |
| `counts.show`, `counts.search` | record the numbers (verification reads; `search` normally `0`) |
| `counts.events` | equals the sum of the other counts |
| other processes' files | `counts.events` is `0` in each |

Then copy **only** these numbers, the run id, the observer hash and the PID into Template B. Never copy any other text. Delete the output directory after the review (`rm -rf "$NMI_WIRE_DIR"` after checking the variable is the temp directory printed in block 1).

## 5. STOP rules (any one ends the run; no retry, no second create)

The observer does not attach to the `server.ts` PID, no `ACTIVE` marker, the hash differs, a proxy variable is set, the pre-click snapshot is missing or non-zero, `STOP` is printed, `create` is not exactly 1 at the end, `unexpected` or `foreign` is non-zero, the listening PID's final summary is missing or `complete` is not `true`, another process shows events, any secret/header/body text appears in observer output, the server was stopped in a way that skipped the summary, or anything is unclear. Do not "test" the counter by creating a draft.

## 6. Offline validation record (agent; macOS; loopback and network-sandbox only)

Date 2026-10-29; Node `v24.21.0`; `tsx v4.23.15`; Darwin 27.0.0; repository base `09bbe90a977516c27bc0715141e74e090b41fba5` plus this branch. Full sources and the runner are in `docs/NMI-DEMO-R1-B-WIRE-OFFLINE-TESTS.md`. The runner is **fail-closed** (`set -euo pipefail`, observer-hash preflight, machine-checked JSON assertions, an exact assertion-count guard, `ALL DONE` only at the very end) and a **failure-injection self-test** (11 injected faults: missing/non-pre-fix fixture, tampered or double-counting observer, a sandbox that does not deny the network, a wrong fixture answer, missing `tsx`, a failing server test, a stubbed assertion helper, a weakened expectation) proves the runner exits nonzero and never prints `ALL DONE` in each case (11/11 caught). Both were re-run from files extracted from the Markdown documents. **No request left the machine**: the TLS and server tests ran under `sandbox-exec` denying all non-loopback network, DNS is redirected to 127.0.0.1 and TLS connections to a local fake, and every secret/provider value is a dummy.

| # | What was proved | Result |
| --- | --- | --- |
| T1 | **Real Node `fetch`** to a loopback server fires the event; one create → `events=1, create=1`, no STOP; two creates → `create=2` and STOP at the second send; OAuth, create, show and search count separately (1 each); 10 concurrent searches + 1 create + 1 OAuth count exactly; unexpected shapes (`.../send`, DELETE, query string, `/v2/payments/...`) → `unexpected=4`, `create=0`, STOP; a different origin → `foreign=1`, STOP; an idle process → all zero, complete summary; **no token, cookie, request body, query or header text** in stderr or summary files (6 scenarios); fixed summary fields only; refuses to start without run id/dir; static check: code (comments excluded) reads no headers/body/cookies, uses only `diagnostics_channel`, `fs`, `path`, and the live origin literal appears once. The test copy differs from the audited file in **exactly one line** (the origin constant). | 20/20 PASS |
| T2 | The network sandbox denies non-loopback egress by its **own error code**: a connect to the reserved non-routable documentation address `192.0.2.1` is refused with `EPERM` **inside** the sandbox while loopback still connects (a generic fetch error is not accepted; the runner makes **no** probe outside the sandbox) | PASS (asserted) |
| T3 | (machine-asserted from the summary JSON **and** the fake server's own record) The **unmodified** audited observer matches the real default-port origin `https://api-m.sandbox.paypal.com` over TLS through the fail-closed redirect (`create=1`, no foreign) | PASS |
| T3b | (asserted) With TLS ALPN offering h2 and http/1.1, Node `fetch` still used HTTP/1.1 and the event fired (`create=1`) | PASS |
| T4 | (each case asserted on exact counts, the client outcome and an independent server-side count of tokens/creates/gets/searches/other) The **production** `PayPalSandboxClient` and production `fetchTransport` through the unmodified observer: create 201 → `create=1, oauth=1`; **create 401 → `create=1`** (FIX-B1 holds at the wire; client outcome unknown `http_401`); GET show 401 → `show=2, oauth=2` (safe read refresh); search → `search=1, oauth=1` | PASS |
| T5 | (asserted; requires the pre-fix fixture, fails if it is missing or not pre-fix) **Negative control:** the pre-fix client (commit `85470d9`) → `create=2, oauth=2`, **STOP printed**, `stop=true` | detected |
| T6a-c | The **actual `pnpm --filter @nmi/api start` (pnpm → tsx `cli.mjs` → `server.ts`) Fastify process** with `NODE_OPTIONS` preload, disposable PostgreSQL, dummy OpenAI key redirected to a loopback fake via `OPENAI_BASE_URL` (the only way to make the server emit a real outbound send offline): three `ACTIVE` markers, the listening PID is the `server.ts` process; one application parse attempt produced **2 wire sends** (SDK `maxRetries: 1`), counted as `foreign=2` with STOP; `SIGUSR2` gave a live `complete:false` snapshot; Ctrl-C shape (`SIGINT` to the process group) and `SIGTERM` to the group each produced a complete summary for the listening PID; the other two processes reported 0 events; no secret in output; `SIGTERM` to the `pnpm` process alone **left the server running without a summary (hazard, hence the Ctrl-C rule)**. | 12/12, 12/12, 13/13 PASS |

**Not witnessed (honest limits).** (1) A real send to the real PayPal Sandbox from the real server process: it needs credentials and a create, which is exactly what is not authorized. The PayPal paths were classified in standalone processes using the production client/transport and in the server process only for a foreign origin; the origin string is proven for default-port https. (2) Linux/Windows, other Node majors, proxies and `NODE_USE_ENV_PROXY` (the procedure forbids them), HTTP/2 negotiation by Node `fetch` (it used 1.1 in T3b). (3) The diagnostics channel is experimental and may change: re-run the validation on the exact runtime before every live use. (4) Detection, not prevention; a send event is not proof of receipt. (5) The observer changes exit semantics slightly on SIGINT/SIGTERM (exit 130/143 after the summary). (6) The agent, not an independent party, ran these tests.

## 7. Run evidence fields (blank until a separately authorized run)

Run ID: PENDING; merged FIX-B1 SHA: `09bbe90a977516c27bc0715141e74e090b41fba5`; observer SHA-256 reviewed by the auditor: PENDING (agent-computed: `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`); offline validation independently reproduced: PENDING; Node version: PENDING; listening PID: PENDING; observer-active marker (server.ts): PENDING; pre-click snapshot all zero: PENDING; final summary file complete: PENDING; CREATE / OAuth / SHOW / SEARCH / unexpected / foreign counts: PENDING; browser POSTs: PENDING; durable attempts: PENDING; Sandbox draft-count delta and DRAFT status/currency/total/due date: PENDING; teardown: PENDING; secret review: PENDING; overall Gate B: **PENDING / BLOCKED**.

## 8. Unblock conditions (all required; none is met today)

1. An **independent exact-head audit** of this procedure, the exact observer source and hash, and the offline evidence (ideally reproducing section 6 on the auditor's machine).
2. The owner's authorized merge of this documentation into `main`.
3. A **new written Request B** (`docs/NMI-DEMO-OWNER-AUTHORIZATIONS.md`) that cites the merged commit and the observer hash and is answered by the owner. Gate B must also still respect: exactly one synthetic USD 540.00 Sandbox draft, no retry, drafting disabled after the run, the 1/1 historical budget not reset, OpenAI unset.

This document does **not** authorize Gate A, Gate B, Gate C, Render hosting, billing changes, a YouTube upload or a Devpost submission.
