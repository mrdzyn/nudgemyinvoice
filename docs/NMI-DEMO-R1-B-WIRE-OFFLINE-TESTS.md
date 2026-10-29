# Gate B observer — offline test sources and record (agent-run, loopback only; NOT PayPal, NOT OpenAI)

> Companion to `docs/NMI-DEMO-R1-B-WIRE-COUNT.md` (observer SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`, **unchanged**). These are **test-only** files, kept in Markdown (no scripts are committed to the repository). Every PayPal/OpenAI value is a dummy; the TLS and server tests run under a macOS `sandbox-exec` profile that denies all non-loopback network access, with DNS redirected to 127.0.0.1 and TLS connections redirected to a local fake server (fail-closed). Nothing here can reach PayPal or OpenAI. **Gate B remains BLOCKED / NOT AUTHORIZED.**

## Runner is fail-closed (remediation of review 5692976496, MAJOR-1)

The first version of `run-all.sh` printed diagnostic summaries and could finish with `ALL DONE` after a failure. It is now strict and **cannot print `ALL DONE` unless every check held**:

- `set -euo pipefail`, an `EXIT` trap that prints `RUNNER FAILED (exit N) at step: ...` on any failure, and **no `${VAR:?}` guards**: the self-test found that macOS `bash` 3.2 can end a script with status **0** after a `${VAR:?}` expansion error, so required variables are checked explicitly with `die`.
- **T0 preflight:** the observer file must hash to `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`; the repository `tsx` must exist; `sandbox-exec` and `openssl` must exist; the pre-fix fixture (`NMI_OLD_PAYPAL_SRC`) must exist, **must contain** the `retryOn401` marker and **must differ** from the repository client, which must contain the FIX-B1 `effect === "read"` guard and no `retryOn401`.
- **T1:** `offline-tests.mjs` must exit 0 **and** report exactly `20/20 passed`.
- **T2:** `sandbox-check.mjs` is run **only inside the sandbox** (no probe is ever made outside it): loopback must connect and a connection to the non-routable documentation address `192.0.2.1` must fail with **`EPERM`** (the sandbox's own denial code, refused before any packet exists). A generic fetch error is not accepted.
- **T3, T3b, T4, T5:** `assert-wire.mjs` parses the observer's **summary JSON files** (not stderr) and requires the exact counts object (all seven fields), `complete=true`, `signal=null`, the expected `stop`, exactly one summary for the test entry, zero events in every other process, the presence/absence of the `create>1` STOP line, no secret-like text, plus an **independent witness**: what the fake server itself saw (T3: exactly `POST /v2/invoicing/invoices host=api-m.sandbox.paypal.com`; T4/T5: its own counts of tokens, creates, gets, searches and other requests) and the client's own outcome (e.g. `PayPalOutcomeUnknownError:http_401`). T3 proves **one** send whose origin matched the real Sandbox origin (create=1, foreign=0). T4 proves **create401 = exactly one outbound create** (observer 1, server 1) with `unexpected=0`. T5 requires the pre-fix fixture and **requires** `create=2`, `oauth=2`, `stop=true`, the STOP line and two creates at the server witness; with the fixture missing or not pre-fix, the runner fails at T0.
- **T6:** `server-test.mjs` (process attachment, listening-PID identification, SDK-resend wire count, `SIGUSR2` snapshot, shutdown summaries for three shutdown shapes, secret redaction, hazard documentation) must exit 0, end with `N/N passed` (equal numbers, at least 12) and print no `FAIL`. `server-test.mjs` now also kills the server process group and stops PostgreSQL on any exit path.
- **Assertion-count guard:** exactly **8** `ASSERT OK` lines (T2, T3, T3b, four T4, T5) must have been produced, so a stubbed or skipped assertion helper cannot pass.

`runner-selftest.sh` is the **failure-injection test**: it copies the files, injects one fault per case, runs the copy of `run-all.sh`, and requires a **nonzero exit, the `RUNNER FAILED` marker, the expected failure message and no `ALL DONE`**; each mutation is checked to have actually changed its file. Cases: S1 fixture variable missing, S2 "pre-fix" fixture that is really the fixed client, S3 tampered observer (hash), S4 observer that double-counts creates with the hash check bypassed (the assertions must catch it), S5 a `sandbox-exec` shim that does not deny the network (the only run outside the sandbox: one connect to the reserved, non-routable `192.0.2.1`, in the self-test only), S6 a fixture that answers `create401` with 201, S7 `tsx` missing, S8 the actual-server test failing, S9 the assertion helper stubbed out, S10 the T5 expectation weakened to one create, S11 the fixture directory missing.

## How to reproduce

Create an empty directory, save the audited preload (WIRE-COUNT document, section 3) as `nmi-wire-observer.cjs`, save the files below next to it, then (bash; the runner and self-test also need `perl`):

```bash
export NMI_REPO="$HOME/path/to/nudgemyinvoice"
mkdir old
git -C "$NMI_REPO" archive 85470d9a5fef15b260f9e1c52673a7e2c7d03824 packages/paypal | tar -x -C old
ln -s "$NMI_REPO/packages/paypal/node_modules" old/packages/paypal/node_modules
export NMI_OLD_PAYPAL_SRC="$PWD/old/packages/paypal/src"
chmod +x mkcopy.sh run-all.sh runner-selftest.sh
./run-all.sh
./runner-selftest.sh
```

Needs Node 24, the repository's `tsx` and dependencies (`$NMI_REPO/apps/api/node_modules/.bin/tsx`), `openssl`, macOS `sandbox-exec`, `perl`, and PostgreSQL 16 binaries (`PG_BIN`, default `/opt/homebrew/opt/postgresql@16/bin`) for T6.

## Recorded result (2026-10-29, Node v24.21.0, tsx v4.23.15, Darwin 27.0.0)

`./run-all.sh` exit 0, final line `ALL DONE (8 machine-checked assertions, T1 20/20, T6 3 shutdown shapes)`; `./runner-selftest.sh` exit 0, `SELFTEST SUMMARY: 11/11 injected failures were caught`.

```
T0 preflight                    observer hash matches; tsx present; pre-fix fixture present, has retryOn401, differs from the fixed client
T1 offline-tests.mjs            20/20 passed
T2 ASSERT OK                    external connect = EPERM inside the sandbox, loopback CONNECTED (no probe outside the sandbox)
T3 ASSERT OK                    unmodified observer: events=1 create=1 foreign=0 stop=false ; server saw exactly [POST /v2/invoicing/invoices host=api-m.sandbox.paypal.com]
T3b ASSERT OK                   TLS server offering h2+http/1.1: server saw HTTP/1.1 ; events=1 create=1
T4-create201 ASSERT OK          events=2 create=1 oauth=1 ; server tokens=1 creates=1 ; outcome none
T4-create401 ASSERT OK          events=2 create=1 oauth=1 unexpected=0 ; server tokens=1 creates=1 ; outcome PayPalOutcomeUnknownError:http_401
T4-show401 ASSERT OK            events=4 oauth=2 show=2 ; server tokens=2 gets=2
T4-search ASSERT OK             events=2 oauth=1 search=1 ; server tokens=1 searches=1
T5-old-create401 ASSERT OK      pre-fix client: events=4 create=2 oauth=2 stop=true + STOP line ; server tokens=2 creates=2 ; outcome PayPalRejectedError:http_401
T6 sigint-group / sigterm-group / sigterm-pnpm   12/12, 12/12, 13/13 passed
```

### `lookup-loopback.cjs`

<!-- prettier-ignore -->
```js
// TEST-ONLY, FAIL-CLOSED redirect: DNS always resolves to 127.0.0.1 and every TLS connection is sent to
// the local test port (NMI_TEST_TLS_PORT), so nothing can leave the machine. Not part of the observer.
const dns = require("node:dns");
const tls = require("node:tls");
const PORT = Number(process.env.NMI_TEST_TLS_PORT || 0);
if (!PORT) { process.stderr.write("test redirect needs NMI_TEST_TLS_PORT\n"); process.exit(98); }
dns.lookup = function (host, opts, cb) {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  if (opts && opts.all) return process.nextTick(cb, null, [{ address: "127.0.0.1", family: 4 }]);
  process.nextTick(cb, null, "127.0.0.1", 4);
};
const orig = tls.connect;
tls.connect = function (...args) {
  const o = typeof args[0] === "object" ? args[0] : {};
  if (typeof args[0] === "object") { args[0] = { ...o, port: PORT, host: "127.0.0.1" }; }
  return orig.apply(this, args);
};
```

### `mkcopy.sh`

<!-- prettier-ignore -->
```bash
#!/bin/bash
# usage: mkcopy.sh PORT  -> test copy whose ONLY difference is the origin constant
sed "s#^const ORIGIN = \"https://api-m.sandbox.paypal.com\";#const ORIGIN = \"http://127.0.0.1:$1\";#" nmi-wire-observer.cjs > test-copy-$1.cjs
diff nmi-wire-observer.cjs test-copy-$1.cjs | grep -c '^[<>]'
```

### `client-actions.mjs`

<!-- prettier-ignore -->
```js
// Child process that makes REAL Node fetch requests to the loopback server(s). Secrets are fake markers.
const [,, base, scenario, other] = process.argv;
const hdr = { authorization: "Bearer SECRETTOKEN-ABC123", cookie: "nmi_session=SECRETCOOKIE-XYZ", "content-type": "application/json" };
const post = (p, body = { secret: "SECRETBODY-777" }) => fetch(base + p, { method: "POST", headers: hdr, body: JSON.stringify(body) }).then((r) => r.text());
const get = (p) => fetch(base + p, { headers: hdr }).then((r) => r.text());
const run = {
  one: async () => { await post("/v2/invoicing/invoices"); },
  two: async () => { await post("/v2/invoicing/invoices"); await post("/v2/invoicing/invoices"); },
  mixed: async () => { await post("/v1/oauth2/token"); await post("/v2/invoicing/invoices"); await get("/v2/invoicing/invoices/INV2-ABCD-1234"); await post("/v2/invoicing/search-invoices"); },
  unexpected: async () => {
    await post("/v2/invoicing/invoices/INV2-X/send");
    await post("/v2/invoicing/invoices?x=SECRETQUERY");
    await fetch(base + "/v2/invoicing/invoices/INV2-X", { method: "DELETE", headers: hdr });
    await get("/v2/payments/captures/ABC");
  },
  foreign: async () => { await fetch(other + "/v2/invoicing/invoices", { method: "POST", headers: hdr, body: "{}" }).then((r) => r.text()); },
  concurrent: async () => { await Promise.all(Array.from({ length: 10 }, () => post("/v2/invoicing/search-invoices"))); await Promise.all([post("/v2/invoicing/invoices"), post("/v1/oauth2/token")]); },
  none: async () => {},
};
await run[scenario]();
```

### `offline-tests.mjs`

<!-- prettier-ignore -->
```js
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : " — " + d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = () => new Promise((res) => { const s = createServer((q, r) => { q.resume(); q.on("end", () => r.end("{}")); }); s.listen(0, "127.0.0.1", () => res(s)); });
const A = await listen(), B = await listen();
const pa = A.address().port, pb = B.address().port;
const mk = spawnSync("./mkcopy.sh", [String(pa)], { encoding: "utf8" });
check("the test copy differs from the audited preload in exactly ONE line (the origin constant)", mk.stdout.trim() === "2", mk.stdout);
async function scenario(name, other) {
  const out = mkdtempSync(join(tmpdir(), "nmi-wire-"));
  const env = { ...process.env, NMI_WIRE_RUN_ID: "TEST-" + name, NMI_WIRE_OUT_DIR: out, NODE_OPTIONS: `--require ${process.cwd()}/test-copy-${pa}.cjs` };
  const r = await new Promise((res) => { import("node:child_process").then(({ spawn }) => { const p = spawn(process.execPath, ["client-actions.mjs", `http://127.0.0.1:${pa}`, name, `http://127.0.0.1:${pb}`], { env }); let e = ""; p.stderr.on("data", (d) => (e += d)); p.on("close", (code) => res({ code, e })); }); });
  const files = readdirSync(out);
  const sum = files.length ? JSON.parse(readFileSync(join(out, files[0]), "utf8")) : null;
  const text = r.e + files.map((f) => readFileSync(join(out, f), "utf8")).join("");
  rmSync(out, { recursive: true, force: true });
  return { r, sum, files, text };
}
const one = await scenario("one");
check("diagnostic event fires for REAL Node fetch: one create -> events=1, create=1, nothing else", one.sum?.counts.events === 1 && one.sum.counts.create === 1 && one.sum.counts.oauth + one.sum.counts.show + one.sum.counts.search + one.sum.counts.unexpected + one.sum.counts.foreign === 0, JSON.stringify(one.sum));
check("one create attempt: no STOP", one.sum?.stop === false && !/NMI-WIRE STOP/.test(one.r.e));
check("exactly one summary file, mode 0600-style name wire-<run>-<pid>.json, complete=true, pid recorded", one.files.length === 1 && /^wire-TEST-one-\d+\.json$/.test(one.files[0]) && one.sum.complete === true && Number.isInteger(one.sum.pid));
const two = await scenario("two");
check("two create attempts count TWO and trigger STOP (message printed at the second send)", two.sum?.counts.create === 2 && two.sum.stop === true && /NMI-WIRE STOP run=TEST-two pid=\d+ why=create>1/.test(two.r.e), JSON.stringify(two.sum));
const mixed = await scenario("mixed");
check("OAuth, create, show and search are counted separately (1 each), no STOP", JSON.stringify([mixed.sum?.counts.oauth, mixed.sum?.counts.create, mixed.sum?.counts.show, mixed.sum?.counts.search, mixed.sum?.counts.unexpected]) === "[1,1,1,1,0]" && mixed.sum.stop === false, JSON.stringify(mixed.sum?.counts));
const unx = await scenario("unexpected");
check("send/DELETE/query/payments paths on the allowed origin are all UNEXPECTED (4) and trigger STOP; create stays 0", unx.sum?.counts.unexpected === 4 && unx.sum.counts.create === 0 && unx.sum.stop === true, JSON.stringify(unx.sum?.counts));
const fr = await scenario("foreign");
check("a request to ANOTHER origin is foreign (never a create) and triggers STOP", fr.sum?.counts.foreign === 1 && fr.sum.counts.create === 0 && fr.sum.stop === true, JSON.stringify(fr.sum?.counts));
const con = await scenario("concurrent");
check("10 concurrent searches + 1 create + 1 oauth count exactly (search=10, create=1, oauth=1)", con.sum?.counts.search === 10 && con.sum.counts.create === 1 && con.sum.counts.oauth === 1 && con.sum.counts.events === 12, JSON.stringify(con.sum?.counts));
const none = await scenario("none");
check("a process that makes no request reports events=0 and all zero counts (complete summary, not a pass)", none.sum?.counts.events === 0 && none.sum.complete === true, JSON.stringify(none.sum));
const SECRETS = ["SECRETTOKEN", "SECRETCOOKIE", "SECRETBODY", "SECRETQUERY", "Bearer", "nmi_session"];
for (const [n, s] of [["one", one], ["two", two], ["mixed", mixed], ["unexpected", unx], ["foreign", fr], ["concurrent", con]]) {
  check(`no token, cookie, body, query or header text in stderr or the summary file (${n})`, SECRETS.every((x) => !s.text.includes(x)), SECRETS.filter((x) => s.text.includes(x)).join());
}
const keys = Object.keys(one.sum).sort().join();
check("the summary contains only the fixed redacted fields", keys === "complete,counts,endedAt,entry,node,observer,pid,ppid,runId,signal,startedAt,stop", keys);
const refused = spawnSync(process.execPath, ["-e", "0"], { env: { ...process.env, NODE_OPTIONS: `--require ${process.cwd()}/nmi-wire-observer.cjs`, NMI_WIRE_RUN_ID: "", NMI_WIRE_OUT_DIR: "" }, encoding: "utf8" });
check("without a run id and an absolute output directory the observer REFUSES to start (exit 97)", refused.status === 97 && /REFUSED/.test(refused.stderr), refused.stderr);
const code = readFileSync("nmi-wire-observer.cjs", "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
check("static: code (comments excluded) never touches headers, body, cookies or tokens and has no network/dispatcher/fetch/require of anything but diagnostics_channel, fs, path", !/\.headers|\.body|cookie|authorization|setGlobalDispatcher|fetch\(|\bhttp\b|https\.|net\./i.test(code) && [...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]).sort().join() === "node:diagnostics_channel,node:fs,node:path");
check("static: the live origin literal appears exactly once and is the Sandbox origin", (code.match(/https:\/\/api-m\.sandbox\.paypal\.com/g) ?? []).length === 1 && !/https:\/\/api-m\.paypal\.com|\*\.paypal/.test(code));
A.close(); B.close();
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
```

### `sandbox-check.mjs`

<!-- prettier-ignore -->
```js
// Proves the network sandbox DENIES non-loopback egress by its own error code (EPERM), not merely "some error".
// run-all.sh runs this ONLY inside the sandbox, where the connect to the reserved documentation address
// 192.0.2.1 (RFC 5737, non-routable) is refused by the sandbox before any packet exists.
import { connect, createServer } from "node:net";
const probe = (host, port) => new Promise((res) => {
  const s = connect({ host, port, timeout: 1500 });
  s.once("connect", () => { s.destroy(); res("CONNECTED"); });
  s.once("timeout", () => { s.destroy(); res("TIMEOUT"); });
  s.once("error", (e) => { s.destroy(); res(e.code || e.message); });
});
const srv = createServer((s) => s.end()); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const out = { loopback: await probe("127.0.0.1", srv.address().port), external: await probe("192.0.2.1", 80) };
srv.close();
console.log(JSON.stringify(out));
```

### `tls-origin-test.mjs`

<!-- prettier-ignore -->
```js
import { createServer } from "node:https";
import { readFileSync, writeFileSync } from "node:fs";
const calls = [];
const srv = createServer({ key: readFileSync("key.pem"), cert: readFileSync("cert.pem") }, (q, r) => { calls.push(`${q.method} ${q.url} host=${q.headers.host}`); q.resume(); q.on("end", () => r.end("{}")); });
await new Promise((res, rej) => { srv.once("error", rej); srv.listen(Number(process.env.NMI_TEST_TLS_PORT), "127.0.0.1", res); });
const r = await fetch("https://api-m.sandbox.paypal.com/v2/invoicing/invoices", { method: "POST", headers: { authorization: "Bearer SECRETTOKEN-ABC123" }, body: "{\"s\":\"SECRETBODY\"}" });
await r.text();
console.log("SERVER SAW (loopback, not PayPal):", JSON.stringify(calls));
if (process.env.NMI_SEEN_FILE) writeFileSync(process.env.NMI_SEEN_FILE, JSON.stringify(calls));
srv.close();
```

### `h2-origin-test.mjs`

<!-- prettier-ignore -->
```js
import { createSecureServer } from "node:http2";
import { readFileSync, writeFileSync } from "node:fs";
const seen = [];
const srv = createSecureServer({ key: readFileSync("key.pem"), cert: readFileSync("cert.pem"), allowHTTP1: true, ALPNProtocols: ["h2", "http/1.1"] }, (q, r) => { seen.push(`HTTP/${q.httpVersion} ${q.method} ${q.url}`); q.resume(); q.on("end", () => r.end("{}")); });
await new Promise((res) => srv.listen(Number(process.env.NMI_TEST_TLS_PORT), "127.0.0.1", res));
const r = await fetch("https://api-m.sandbox.paypal.com/v2/invoicing/invoices", { method: "POST", body: "{}" }); await r.text();
console.log("SERVER (ALPN offers h2 and http/1.1) SAW:", JSON.stringify(seen));
if (process.env.NMI_SEEN_FILE) writeFileSync(process.env.NMI_SEEN_FILE, JSON.stringify(seen));
srv.close();
```

### `client-wire-test.mts`

<!-- prettier-ignore -->
```ts
import { createServer } from "node:https";
import { readFileSync, writeFileSync } from "node:fs";
const { PayPalSandboxClient } = await import(`${process.env.NMI_PAYPAL_SRC}/index.ts`);
const mode = process.argv[2] ?? "create201";
let showN = 0;
const seen = { tokens: 0, creates: 0, gets: 0, searches: 0, other: 0 };
let outcome: { name: string; code: string } = { name: "none", code: "" };
const srv = createServer({ key: readFileSync("key.pem"), cert: readFileSync("cert.pem") }, (q, r) => {
  q.resume();
  q.on("end", () => {
    const send = (s: number, b: unknown) => { r.statusCode = s; r.setHeader("content-type", "application/json"); r.end(JSON.stringify(b)); };
    if (q.url === "/v1/oauth2/token") seen.tokens++; else if (q.method === "POST" && q.url === "/v2/invoicing/invoices") seen.creates++; else if (q.method === "GET") seen.gets++; else if (q.url === "/v2/invoicing/search-invoices") seen.searches++; else seen.other++;
    if (q.url === "/v1/oauth2/token") return send(200, { access_token: "TOK-FAKE-0123456789", token_type: "Bearer", expires_in: 3600 });
    if (q.method === "POST" && q.url === "/v2/invoicing/invoices") return mode === "create401" ? send(401, {}) : send(201, { id: "INV2-FAKE-1" });
    if (q.method === "GET") return mode === "show401" && showN++ === 0 ? send(401, {}) : send(404, {});
    if (q.url === "/v2/invoicing/search-invoices") return send(200, { total_items: 0, total_pages: 0, items: [] });
    send(500, {});
  });
});
await new Promise<void>((res) => srv.listen(Number(process.env.NMI_TEST_TLS_PORT), "127.0.0.1", res));
const c = new PayPalSandboxClient({ baseUrl: "https://api-m.sandbox.paypal.com", clientId: "id-fake-0123", clientSecret: "secret-fake-0123" });
const body = { detail: { currency_code: "USD", invoice_number: "NMI-00000000000000000001", reference: "r", invoice_date: "2026-10-25", payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: "2026-11-30" } }, primary_recipients: [], items: [], configuration: {} } as never;
try {
  if (mode.startsWith("create")) await c.createDraftInvoice({ body, requestId: "r" });
  else if (mode.startsWith("show")) await c.getInvoice("INV2-FAKE-1");
  else if (mode === "search") await c.findInvoiceIdsByNumber("NMI-00000000000000000001");
} catch (e) { outcome = { name: (e as Error).name, code: (e as { code?: string }).code ?? "" }; console.log("client outcome:", outcome.name, outcome.code); }
srv.close();
if (process.env.NMI_OUTCOME_FILE) writeFileSync(process.env.NMI_OUTCOME_FILE, JSON.stringify(outcome));
if (process.env.NMI_SEEN_FILE) writeFileSync(process.env.NMI_SEEN_FILE, JSON.stringify(seen));
```

### `assert-wire.mjs`

<!-- prettier-ignore -->
```js
// Machine-checkable assertions on observer summary files and independent witnesses. Exit 0 only if EVERY check holds.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const a = Object.fromEntries(process.argv.slice(2).map((x) => { const i = x.indexOf("="); return [x.slice(2, i), x.slice(i + 1)]; }));
const fail = (m) => { console.error("ASSERT FAILED: " + m); process.exit(1); };
const need = (k) => a[k] ?? fail("missing argument --" + k);
const label = need("label"), dir = need("dir"), run = need("run"), entry = need("entry");
const expect = JSON.parse(need("counts"));
const KEYS = ["create", "events", "foreign", "oauth", "search", "show", "unexpected"];
if (JSON.stringify(Object.keys(expect).sort()) !== JSON.stringify(KEYS)) fail("expected counts must name exactly " + KEYS.join());
const files = readdirSync(dir).filter((f) => /^wire-.*\.json$/.test(f));
const sums = files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
const mine = sums.filter((s) => s.entry === entry);
if (mine.length !== 1) fail(`expected exactly one summary with entry=${entry}, found ${mine.length} (${files.join(",")})`);
const s = mine[0];
if (s.observer !== "nmi-wire-1" || s.runId !== run) fail("observer/run id mismatch " + JSON.stringify([s.observer, s.runId]));
if (s.complete !== true || s.signal !== null) fail("summary is not a final natural-exit summary: " + JSON.stringify([s.complete, s.signal]));
if (JSON.stringify(Object.keys(s.counts).sort()) !== JSON.stringify(KEYS)) fail("unexpected count fields " + Object.keys(s.counts));
for (const k of KEYS) if (s.counts[k] !== expect[k]) fail(`counts.${k} = ${s.counts[k]}, expected ${expect[k]} (${JSON.stringify(s.counts)})`);
if (s.stop !== (need("stop") === "true")) fail(`stop = ${s.stop}, expected ${a.stop}`);
for (const o of sums.filter((x) => x !== s)) if (o.counts.events !== 0) fail("another process reported events: " + o.entry);
const err = a.stderr ? readFileSync(a.stderr, "utf8") : "";
if (a.stderr) {
  const stopLine = new RegExp(`NMI-WIRE STOP run=${run} pid=${s.pid} why=create>1`).test(err);
  if (a["stop-line"] === "yes" && !stopLine) fail("expected a create>1 STOP line on stderr");
  if (a["stop-line"] === "no" && /NMI-WIRE STOP/.test(err)) fail("unexpected STOP line on stderr");
  for (const bad of ["SECRETTOKEN", "Bearer", "TOK-FAKE", "secret-fake", "id-fake"]) if (err.includes(bad) || JSON.stringify(s).includes(bad)) fail("secret-like text in observer output: " + bad);
}
if (a.outcome) {
  if (!existsSync(a.outcome)) fail("outcome file missing");
  const o = JSON.parse(readFileSync(a.outcome, "utf8"));
  if (`${o.name}:${o.code}` !== need("outcome-expect")) fail(`client outcome ${o.name}:${o.code}, expected ${a["outcome-expect"]}`);
}
if (a.seen) {
  if (!existsSync(a.seen)) fail("independent server-side witness file missing");
  const w = JSON.parse(readFileSync(a.seen, "utf8"));
  if (a["seen-json"] !== undefined) { if (JSON.stringify(w) !== a["seen-json"]) fail(`server-side witness ${JSON.stringify(w)} != ${a["seen-json"]}`); }
}
console.log(`ASSERT OK  ${label}: ${JSON.stringify(s.counts)} stop=${s.stop}`);
```

### `server-test.mjs`

<!-- prettier-ignore -->
```js
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
const mode = process.argv[2]; // "sigint-group" | "sigterm-pnpm"
const root = process.env.NMI_REPO;
if (!root) throw new Error("set NMI_REPO to the repository root");
const here = process.cwd();
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const IDX = ["sigint-group", "sigterm-group", "sigterm-pnpm"].indexOf(mode);
const PGPORT = 54340 + IDX, API_PORT = 3140 + IDX;
const work = mkdtempSync(join(tmpdir(), "nmi-wire-srv-"));
let srvRef = null, pgDir = null;
process.on("exit", () => { // runs on normal exit, process.exit and uncaught errors
  try { if (srvRef) process.kill(-srvRef.pid, "SIGKILL"); } catch {}
  try { if (pgDir) spawnSync(join(process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin", "pg_ctl"), ["-D", pgDir, "-m", "immediate", "stop"]); } catch {}
});
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  [${mode}] ${n}${ok ? "" : " — " + d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (c, a, o = {}) => { const r = spawnSync(c, a, { encoding: "utf8", ...o }); if (r.status !== 0) throw new Error(`${c} ${a.slice(0, 3)} failed ${r.stderr.slice(0, 300)}`); return r.stdout; };
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_w", "--auth=trust", "-E", "UTF8"]);
pgDir = join(work, "pg");
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PGPORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const pa = (db) => ["-h", "127.0.0.1", "-p", String(PGPORT), "-U", "nmi_w", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...pa("postgres"), "-c", "CREATE DATABASE nmi_test_wire"]);
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...pa("nmi_test_wire"), "-q", "-f", join(root, "packages/db/migrations", e.tag + ".sql")]);
const DATABASE_URL = `postgres://nmi_w@127.0.0.1:${PGPORT}/nmi_test_wire`;
const PW = "pw-" + randomBytes(10).toString("hex");
run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: "wire-op", NMI_OPERATOR_PASSWORD: PW } });
// fake OpenAI on loopback: always 500 so the SDK's single resend is visible on the wire
let fakeHits = 0;
const fake = createServer((q, r) => { fakeHits++; q.resume(); q.on("end", () => { r.statusCode = 500; r.end("{}"); }); });
await new Promise((r) => fake.listen(0, "127.0.0.1", r));
const FAKE = fake.address().port;
const out = join(work, "obs"); (await import("node:fs")).mkdirSync(out);
const env = { ...process.env, NODE_ENV: "development", PORT: String(API_PORT), WEB_ORIGIN: "http://localhost:5173", DATABASE_URL, SESSION_SECRET: randomBytes(24).toString("base64"),
  PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", PAYPAL_DRAFTS_ENABLED: "false", PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "",
  OPENAI_API_KEY: "dummy-not-a-real-key", OPENAI_MODEL: "dummy-model", OPENAI_BASE_URL: `http://127.0.0.1:${FAKE}/v1`,
  NMI_WIRE_RUN_ID: "SRV-" + mode, NMI_WIRE_OUT_DIR: out, NODE_OPTIONS: `--require ${here}/nmi-wire-observer.cjs` };
const SB = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))';
let errlog = "";
const srv = spawn("sandbox-exec", ["-p", SB, "pnpm", "--filter", "@nmi/api", "start"], { cwd: root, env, detached: true, stdio: ["ignore", "ignore", "pipe"] });
srvRef = srv;
srv.stderr.on("data", (d) => (errlog += d));
const API = `http://127.0.0.1:${API_PORT}`;
for (let i = 0; i < 300; i++) { try { if ((await fetch(API + "/health")).ok) break; } catch {} await sleep(200); }
const health = await (await fetch(API + "/health")).json();
check("the production server started via `pnpm --filter @nmi/api start` with NODE_OPTIONS preload; /health ok, aiConfigured true, drafting not configured", health.status === "ok" && health.aiConfigured === true, JSON.stringify(health));
const listenPid = Number(run("sh", ["-c", `lsof -ti tcp:${API_PORT} -sTCP:LISTEN | head -1`]).trim());
const active = [...errlog.matchAll(/NMI-WIRE ACTIVE run=\S+ pid=(\d+) entry=(\S+)/g)].map((m) => ({ pid: Number(m[1]), entry: m[2] }));
console.log("   observer ACTIVE markers:", JSON.stringify(active), "listening pid:", listenPid);
check("the observer attached to EVERY node process of the launch chain (pnpm, tsx wrapper, server) and one of them is the process that listens on the API port", active.length >= 2 && active.some((a) => a.pid === listenPid), JSON.stringify(active));
check("the listening process' entry is the real server file (server.ts), not a helper", active.find((a) => a.pid === listenPid)?.entry === "server.ts", JSON.stringify(active.find((a) => a.pid === listenPid)));
// login + one parse attempt (server -> fake OpenAI loopback, a REAL outbound fetch from the server process)
const login = await fetch(API + "/api/auth/login", { method: "POST", headers: { origin: "http://localhost:5173", "content-type": "application/json" }, body: JSON.stringify({ username: "wire-op", password: PW }) });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); const csrf = (await login.json()).csrfToken;
const parse = await fetch(API + "/api/invoice-drafts/parse", { method: "POST", headers: { origin: "http://localhost:5173", "content-type": "application/json", cookie, "x-csrf-token": csrf }, body: JSON.stringify({ text: "Invoice Wire Test for 1 item at 10 USD each, due 2030-01-15 to w@wire.example" }) });
await parse.text();
check("one application parse attempt reached the loopback fake provider TWICE (SDK maxRetries:1): the observer saw real server-process sends, wire count != application attempts", fakeHits === 2, String(fakeHits));
// snapshot without exiting
const before = errlog.length;
process.kill(listenPid, "SIGUSR2"); await sleep(500);
const snap = errlog.slice(before).match(/NMI-WIRE SUMMARY (\{.*?"signal":"SIGUSR2","complete":false\})/);
const snapJson = snap ? JSON.parse(snap[1]) : null;
check("SIGUSR2 gives a live, NON-final snapshot from the listening PID (complete=false) showing the sends so far, without stopping the server", snapJson && snapJson.pid === listenPid && snapJson.complete === false && snapJson.counts.events === 2 && snapJson.counts.foreign === 2 && snapJson.counts.create === 0 && snapJson.stop === true, JSON.stringify(snapJson));
check("the foreign-origin sends printed an immediate STOP line from the server process", new RegExp(`NMI-WIRE STOP run=SRV-${mode} pid=${listenPid} why=foreign`).test(errlog));
check("/health still answers after the snapshot", (await fetch(API + "/health")).ok);
// shutdown
let orphan = false;
if (mode === "sigint-group") process.kill(-srv.pid, "SIGINT");
else if (mode === "sigterm-group") process.kill(-srv.pid, "SIGTERM");
else process.kill(srv.pid, "SIGTERM");
await new Promise((r) => { const t = setTimeout(r, 15000); srv.on("close", () => { clearTimeout(t); r(); }); });
await sleep(1500);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
if (mode === "sigterm-pnpm") {
  orphan = alive(listenPid);
  check("HAZARD (documented): SIGTERM to the pnpm process ALONE leaves the real server process RUNNING and writes NO server summary; operators must stop with Ctrl-C / a signal to the whole process group", orphan && !readdirSync(out).some((f) => f.endsWith(`-${listenPid}.json`)));
  process.kill(listenPid, "SIGINT"); await sleep(1500);
}
const files = readdirSync(out).sort();
const sums = files.map((f) => JSON.parse(readFileSync(join(out, f), "utf8")));
console.log("   summary files:", files.join(", "));
const server = sums.find((s) => s.pid === listenPid);
check("shutdown produced a COMPLETE summary file for the listening server PID (complete=true, final counts events=2 foreign=2 create=0, stop=true, signal recorded)", !!server && server.complete === true && server.counts.events === 2 && server.counts.foreign === 2 && server.counts.create === 0 && server.stop === true && !!server.signal, JSON.stringify(server));
check("every other observed process wrote its own summary with zero events (ambiguity is detectable: only the listening PID has events)", sums.filter((s) => s.pid !== listenPid).every((s) => s.counts.events === 0), JSON.stringify(sums.filter((s) => s.pid !== listenPid).map((s) => [s.pid, s.entry, s.counts.events])));
check("each summary file name carries the run id and a distinct PID; one file per observed process", new Set(files).size === files.length && files.every((f) => f.startsWith(`wire-SRV-${mode}-`)) && files.length === active.length, `${files.length} files vs ${active.length} markers`);
const all = errlog + files.map((f) => readFileSync(join(out, f), "utf8")).join("");
check("no key, token, cookie, csrf token, password, request text or header appears in the observer output (stderr + files)", ![PW, csrf, "dummy-not-a-real-key", "wire-op", "Wire Test", "w@wire.example", "Bearer", "nmi_session"].some((x) => all.includes(x)), "leak");
check("no process is listening on the API port after shutdown", !alive(listenPid));
fake.close(); run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "fast", "stop"]); rmSync(work, { recursive: true, force: true });
const bad = results.filter((r) => !r).length; console.log(`${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
```

### `run-all.sh`

<!-- prettier-ignore -->
```bash
#!/bin/bash
# Offline observer validation. FAIL-CLOSED: any failed step exits nonzero and "ALL DONE" prints only at the very end.
# Needs: NMI_REPO, NMI_OLD_PAYPAL_SRC (pre-fix client fixture), node 24, the repo's tsx, openssl, macOS sandbox-exec, PostgreSQL 16 (PG_BIN).
set -euo pipefail
STEP=startup
trap 'rc=$?; if [ "$rc" -ne 0 ]; then echo "RUNNER FAILED (exit $rc) at step: $STEP" >&2; fi; rm -rf "${WORK:-/nonexistent-nmi}"' EXIT
die() { echo "CHECK FAILED: $*" >&2; exit 1; }
EXPECTED_SHA="004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e"
# NOTE: no ": ${VAR:?}" here. macOS bash 3.2 can end the script with status 0 on that expansion error; explicit checks fail closed.
[ -n "${NMI_REPO:-}" ] || die "set NMI_REPO to the repository root"
[ -n "${NMI_OLD_PAYPAL_SRC:-}" ] || die "set NMI_OLD_PAYPAL_SRC to the pre-FIX-B1 packages/paypal/src (T5 cannot be skipped)"
SB='(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))'
export NMI_TEST_TLS_PORT=48443
WORK="$(mktemp -d)"
: > "$WORK/asserts.log"
aw() { node assert-wire.mjs "$@" | tee -a "$WORK/asserts.log"; }

STEP="T0 preflight"
GOT_SHA="$(shasum -a 256 nmi-wire-observer.cjs | cut -d' ' -f1)"
[ "$GOT_SHA" = "$EXPECTED_SHA" ] || die "observer hash is $GOT_SHA, expected $EXPECTED_SHA"
TSX="$NMI_REPO/apps/api/node_modules/.bin/tsx"
[ -x "$TSX" ] || die "tsx not found at $TSX"
command -v sandbox-exec >/dev/null || die "sandbox-exec not available (T2-T6 need the network sandbox)"
command -v openssl >/dev/null || die "openssl not available"
[ -f "$NMI_OLD_PAYPAL_SRC/index.ts" ] || die "pre-fix client fixture missing: $NMI_OLD_PAYPAL_SRC/index.ts"
grep -q "retryOn401" "$NMI_OLD_PAYPAL_SRC/client.ts" || die "fixture is not the pre-fix client (no retryOn401 marker)"
if grep -q "retryOn401" "$NMI_REPO/packages/paypal/src/client.ts"; then die "the repository client still contains retryOn401 (not FIX-B1)"; fi
grep -q 'effect === "read"' "$NMI_REPO/packages/paypal/src/client.ts" || die "the repository client lacks the FIX-B1 read-only resend guard"
echo "preflight OK: observer hash matches, tsx present, pre-fix fixture present and distinct from the fixed client"

STEP="T1 loopback offline tests"
echo "### T1 loopback-only offline tests (real Node fetch, test copy differs by the origin line)"
node offline-tests.mjs > "$WORK/t1.txt"
cat "$WORK/t1.txt"
grep -Eq "^20/20 passed$" "$WORK/t1.txt" || die "T1 did not report 20/20 passed"

STEP="T2 sandbox denial"
echo "### T2 INSIDE the sandbox a non-loopback connect is refused with the sandbox's own EPERM while loopback connects (no probe is ever made outside the sandbox)"
INSIDE="$(sandbox-exec -p "$SB" node sandbox-check.mjs)"
echo "inside:  $INSIDE"
IN="$INSIDE" node -e '
const i = JSON.parse(process.env.IN);
if (!(i.loopback === "CONNECTED" && i.external === "EPERM")) { console.error("sandbox denial NOT proven: " + JSON.stringify(i)); process.exit(1); }
console.log("ASSERT OK  T2: external connect is EPERM inside the sandbox and loopback connects");' | tee -a "$WORK/asserts.log"

STEP="T3 unmodified observer origin match"
echo "### T3 UNMODIFIED observer, default-port https origin through a fail-closed loopback redirect"
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj "/CN=api-m.sandbox.paypal.com" -addext "subjectAltName=DNS:api-m.sandbox.paypal.com" 2>/dev/null
D="$WORK/t3"; mkdir -p "$D"
NMI_SEEN_FILE="$D/seen.json" NMI_WIRE_RUN_ID=TLS-1 NMI_WIRE_OUT_DIR="$D" NODE_EXTRA_CA_CERTS="$PWD/cert.pem" NODE_OPTIONS="--require $PWD/lookup-loopback.cjs --require $PWD/nmi-wire-observer.cjs" sandbox-exec -p "$SB" node tls-origin-test.mjs > "$D/out.txt" 2> "$D/err.txt"
aw --label=T3 --dir="$D" --run=TLS-1 --entry=tls-origin-test.mjs --stop=false --stderr="$D/err.txt" --stop-line=no \
  --counts='{"create":1,"events":1,"foreign":0,"oauth":0,"search":0,"show":0,"unexpected":0}' \
  --seen="$D/seen.json" --seen-json='["POST /v2/invoicing/invoices host=api-m.sandbox.paypal.com"]'

STEP="T3b http2 offered"
echo "### T3b TLS server offers h2 and http/1.1: Node fetch must still use HTTP/1.1 and the event must fire once"
D="$WORK/t3b"; mkdir -p "$D"
NMI_SEEN_FILE="$D/seen.json" NMI_WIRE_RUN_ID=H2-1 NMI_WIRE_OUT_DIR="$D" NODE_EXTRA_CA_CERTS="$PWD/cert.pem" NODE_OPTIONS="--require $PWD/lookup-loopback.cjs --require $PWD/nmi-wire-observer.cjs" sandbox-exec -p "$SB" node h2-origin-test.mjs > "$D/out.txt" 2> "$D/err.txt"
aw --label=T3b --dir="$D" --run=H2-1 --entry=h2-origin-test.mjs --stop=false --stderr="$D/err.txt" --stop-line=no \
  --counts='{"create":1,"events":1,"foreign":0,"oauth":0,"search":0,"show":0,"unexpected":0}' \
  --seen="$D/seen.json" --seen-json='["HTTP/1.1 POST /v2/invoicing/invoices"]'

t45() { # label mode src stop stopline counts outcome seenjson
  local label="$1" mode="$2" src="$3" stop="$4" stopline="$5" counts="$6" outcome="$7" seen="$8"
  local d="$WORK/$label"; mkdir -p "$d"
  NMI_PAYPAL_SRC="$src" NMI_OUTCOME_FILE="$d/outcome.json" NMI_SEEN_FILE="$d/seen.json" NMI_WIRE_RUN_ID="$label" NMI_WIRE_OUT_DIR="$d" NODE_EXTRA_CA_CERTS="$PWD/cert.pem" NODE_OPTIONS="--require $PWD/lookup-loopback.cjs --require $PWD/nmi-wire-observer.cjs" sandbox-exec -p "$SB" "$TSX" client-wire-test.mts "$mode" > "$d/out.txt" 2> "$d/err.txt"
  aw --label="$label" --dir="$d" --run="$label" --entry=client-wire-test.mts --stop="$stop" --stderr="$d/err.txt" --stop-line="$stopline" --counts="$counts" --outcome="$d/outcome.json" --outcome-expect="$outcome" --seen="$d/seen.json" --seen-json="$seen"
}
STEP="T4 production client at the wire"
echo "### T4 production PayPalSandboxClient + production fetch transport, UNMODIFIED observer, observer counts AND an independent server-side witness"
SRC="$NMI_REPO/packages/paypal/src"
t45 T4-create201 create201 "$SRC" false no '{"create":1,"events":2,"foreign":0,"oauth":1,"search":0,"show":0,"unexpected":0}' 'none:' '{"tokens":1,"creates":1,"gets":0,"searches":0,"other":0}'
t45 T4-create401 create401 "$SRC" false no '{"create":1,"events":2,"foreign":0,"oauth":1,"search":0,"show":0,"unexpected":0}' 'PayPalOutcomeUnknownError:http_401' '{"tokens":1,"creates":1,"gets":0,"searches":0,"other":0}'
t45 T4-show401 show401 "$SRC" false no '{"create":0,"events":4,"foreign":0,"oauth":2,"search":0,"show":2,"unexpected":0}' 'none:' '{"tokens":2,"creates":0,"gets":2,"searches":0,"other":0}'
t45 T4-search search "$SRC" false no '{"create":0,"events":2,"foreign":0,"oauth":1,"search":1,"show":0,"unexpected":0}' 'none:' '{"tokens":1,"creates":0,"gets":0,"searches":1,"other":0}'

STEP="T5 negative control"
echo "### T5 NEGATIVE CONTROL: the pre-FIX-B1 client (fixture) must show create=2, oauth=2, STOP, and two creates at the independent server witness"
t45 T5-old-create401 create401 "$NMI_OLD_PAYPAL_SRC" true yes '{"create":2,"events":4,"foreign":0,"oauth":2,"search":0,"show":0,"unexpected":0}' 'PayPalRejectedError:http_401' '{"tokens":2,"creates":2,"gets":0,"searches":0,"other":0}'

STEP="T6 actual pnpm/tsx server process"
echo "### T6 actual pnpm/tsx Fastify server process (three shutdown shapes)"
for m in sigint-group sigterm-group sigterm-pnpm; do
  STEP="T6 $m"
  node server-test.mjs "$m" > "$WORK/t6-$m.txt"
  cat "$WORK/t6-$m.txt"
  LAST="$(tail -n 1 "$WORK/t6-$m.txt")"
  case "$LAST" in */*" passed") N="${LAST%%/*}"; REST="${LAST#*/}"; T="${REST%% *}"; [ "$N" = "$T" ] && [ "$N" -ge 12 ] || die "T6 $m: '$LAST'";; *) die "T6 $m: unexpected last line '$LAST'";; esac
  if grep -q "^FAIL" "$WORK/t6-$m.txt"; then die "T6 $m printed a FAIL line"; fi
done
STEP="assertion count"
N_ASSERT="$(grep -c '^ASSERT OK' "$WORK/asserts.log" || true)"
[ "$N_ASSERT" = "8" ] || die "assertion count is $N_ASSERT, expected exactly 8 (T2, T3, T3b, four T4, T5): assertions were skipped or disabled"
STEP="done"
echo "ALL DONE (8 machine-checked assertions, T1 20/20, T6 3 shutdown shapes)"
```

### `runner-selftest.sh`

<!-- prettier-ignore -->
```bash
#!/bin/bash
# FAILURE-INJECTION self-test for run-all.sh: every injected fault must make the runner exit NONZERO, print its failure
# marker, and never print "ALL DONE". Needs NMI_REPO and NMI_OLD_PAYPAL_SRC like run-all.sh, and perl.
set -euo pipefail
[ -n "${NMI_REPO:-}" ] && [ -n "${NMI_OLD_PAYPAL_SRC:-}" ] || { echo "SELFTEST ERROR: set NMI_REPO and NMI_OLD_PAYPAL_SRC"; exit 1; }
HERE="$PWD"; ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
FILES="nmi-wire-observer.cjs lookup-loopback.cjs mkcopy.sh client-actions.mjs offline-tests.mjs tls-origin-test.mjs h2-origin-test.mjs client-wire-test.mts server-test.mjs sandbox-check.mjs assert-wire.mjs run-all.sh"
TOTAL=0; PASSED=0
changed() { # a mutation that did not change its file would make an injection meaningless: fail loudly
  cmp -s "$HERE/$2" "$1/$2" && { echo "SELFTEST ERROR: mutation did not change $2"; exit 1; } || true; }
mk() { local d="$ROOT/$1"; mkdir -p "$d"; for f in $FILES; do cp "$HERE/$f" "$d/$f"; done; chmod +x "$d/mkcopy.sh" "$d/run-all.sh"; echo "$d"; }
inject() { # name marker mutate-command ... ; env assignments via ENVSET
  local name="$1" marker="$2" d="$3"; shift 3
  local rc=0 out
  out="$(cd "$d" && env "$@" ./run-all.sh 2>&1)" || rc=$?
  TOTAL=$((TOTAL+1))
  local ok=1
  [ "$rc" -ne 0 ] || { echo "SELFTEST FAIL $name: runner exited 0"; ok=0; }
  if printf '%s' "$out" | grep -q "ALL DONE"; then echo "SELFTEST FAIL $name: runner printed ALL DONE"; ok=0; fi
  printf '%s' "$out" | grep -q "RUNNER FAILED" || { echo "SELFTEST FAIL $name: no RUNNER FAILED marker"; ok=0; }
  printf '%s' "$out" | grep -q -- "$marker" || { echo "SELFTEST FAIL $name: expected marker '$marker' not found"; ok=0; }
  if [ "$ok" = 1 ]; then PASSED=$((PASSED+1)); echo "SELFTEST PASS $name: exit $rc, no ALL DONE, marker '$marker'"; fi
}
OLD="$NMI_OLD_PAYPAL_SRC"; REPO="$NMI_REPO"; BASE=(NMI_REPO="$REPO" NMI_OLD_PAYPAL_SRC="$OLD")

d="$(mk s1)"; inject "S1 pre-fix fixture variable missing (T5 cannot be skipped)" "NMI_OLD_PAYPAL_SRC" "$d" -u NMI_OLD_PAYPAL_SRC NMI_REPO="$REPO"
d="$(mk s2)"; inject "S2 'pre-fix' fixture is really the fixed client" "not the pre-fix client" "$d" NMI_REPO="$REPO" NMI_OLD_PAYPAL_SRC="$REPO/packages/paypal/src"
d="$(mk s3)"; echo "// tampered" >> "$d/nmi-wire-observer.cjs"; changed "$d" nmi-wire-observer.cjs; inject "S3 tampered observer (hash)" "observer hash is" "$d" "${BASE[@]}"
d="$(mk s4)"; perl -pi -e 's/c\[kind\] \+= 1;/c[kind] += (kind === "create" ? 2 : 1);/' "$d/nmi-wire-observer.cjs"; changed "$d" nmi-wire-observer.cjs
NEW="$(shasum -a 256 "$d/nmi-wire-observer.cjs" | cut -d' ' -f1)"; perl -pi -e "s/004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e/$NEW/" "$d/run-all.sh"
inject "S4 observer double-counts creates (hash bypassed so the ASSERTIONS must catch it)" "FAIL\|ASSERT FAILED\|did not report" "$d" "${BASE[@]}"
d="$(mk s5)"; mkdir "$d/bin"; printf '#!/bin/bash\nshift 2\nexec "$@"\n' > "$d/bin/sandbox-exec"; chmod +x "$d/bin/sandbox-exec"
inject "S5 sandbox that does not deny the network (the ONLY run outside the sandbox: one connect to the non-routable 192.0.2.1; T2 must reject it)" "sandbox denial NOT proven" "$d" PATH="$d/bin:$PATH" "${BASE[@]}"
d="$(mk s6)"; perl -pi -e 's/mode === "create401" \? send\(401, \{\}\)/mode === "create401" ? send(201, { id: "INV2-FAKE-1" })/' "$d/client-wire-test.mts"; changed "$d" client-wire-test.mts
inject "S6 fixture serves 201 instead of 401 for create401 (T4 outcome assertion)" "ASSERT FAILED" "$d" "${BASE[@]}"
d="$(mk s7)"; inject "S7 tsx missing" "tsx not found" "$d" NMI_REPO="$ROOT" NMI_OLD_PAYPAL_SRC="$OLD"
d="$(mk s8)"; perl -pi -e 's/fakeHits === 2/fakeHits === 99/' "$d/server-test.mjs"; changed "$d" server-test.mjs
inject "S8 the actual-server test fails (T6 must propagate)" "FAIL" "$d" "${BASE[@]}"
d="$(mk s9)"; perl -pi -e 's/^aw\(\) \{ node assert-wire\.mjs/aw() { true assert-wire.mjs/' "$d/run-all.sh"; changed "$d" run-all.sh
inject "S9 the JSON assertion helper is stubbed out (runner would otherwise pass silently)" "assertion count is" "$d" "${BASE[@]}"
d="$(mk s10)"; perl -pi -e 's/yes \x27\{"create":2,/yes \x27{"create":1,/' "$d/run-all.sh"; changed "$d" run-all.sh
inject "S10 T5 expectation weakened to a single create (the pre-fix client must contradict it)" "ASSERT FAILED" "$d" "${BASE[@]}"
d="$(mk s11)"; inject "S11 pre-fix fixture directory missing (T5 cannot be skipped)" "pre-fix client fixture missing" "$d" NMI_REPO="$REPO" NMI_OLD_PAYPAL_SRC="$ROOT/does-not-exist"
echo "SELFTEST SUMMARY: $PASSED/$TOTAL injected failures were caught"
[ "$PASSED" = "$TOTAL" ] || exit 1
echo "SELFTEST OK"
```

