# Gate B observer — offline test sources and record (agent-run, loopback only; NOT PayPal, NOT OpenAI)

> Companion to `docs/NMI-DEMO-R1-B-WIRE-COUNT.md` (observer SHA-256 `004f3dbf092cb8b94990b0fed2dc8cbe8136021f5da765a27974355ae005f94e`). These are **test-only** files, kept in Markdown (no scripts are committed to the repository). Every PayPal/OpenAI value is a dummy; the TLS and server tests run under a macOS `sandbox-exec` profile that denies all non-loopback network access, with DNS redirected to 127.0.0.1 and TLS connections redirected to a local fake server (fail-closed: if the redirect failed, the sandbox would block the connection). Nothing here can reach PayPal or OpenAI. **Gate B remains BLOCKED / NOT AUTHORIZED.**

## How to reproduce

Create an empty directory, save the audited preload (from the WIRE-COUNT document, section 3) as `nmi-wire-observer.cjs`, save the files below next to it, then:

<!-- prettier-ignore -->
```bash
export NMI_REPO="$HOME/path/to/nudgemyinvoice"
export NMI_OLD_PAYPAL_SRC="$PWD/old/packages/paypal/src"
chmod +x mkcopy.sh run-all.sh
./run-all.sh
```

`mkcopy.sh` and `run-all.sh` are below. The negative control T5 needs the pre-fix client: `mkdir old && git -C "$NMI_REPO" archive 85470d9a5fef15b260f9e1c52673a7e2c7d03824 packages/paypal | tar -x -C old && ln -s "$NMI_REPO/packages/paypal/node_modules" old/packages/paypal/node_modules`. Needs Node 24, the repository's `tsx` and dependencies, `openssl`, macOS `sandbox-exec`, and PostgreSQL 16 binaries (`PG_BIN`) for T6.

## Recorded result (2026-10-29, Node v24.21.0, tsx v4.23.15, Darwin 27.0.0; `run-all.sh` exit 0)

```
T1 offline-tests.mjs            20/20 passed
T2 sandbox egress sanity        blocked
T3 unmodified observer, TLS     SERVER SAW (loopback): POST /v2/invoicing/invoices host=api-m.sandbox.paypal.com ; counts events=1 create=1 foreign=0
T4 production client+transport  create201: create=1 oauth=1 | create401: create=1 oauth=1 (client outcome PayPalOutcomeUnknownError http_401)
                                show401: show=2 oauth=2 | search: search=1 oauth=1 ; all unexpected=0 foreign=0 stop=false
T5 NEGATIVE CONTROL (85470d9)   create=2 oauth=2 stop=true ; "NMI-WIRE STOP ... why=create>1" ; client outcome PayPalRejectedError http_401
T6a sigint-group (Ctrl-C shape) 12/12 passed
T6b sigterm-group               12/12 passed
T6c sigterm-pnpm (hazard)       13/13 passed (server orphaned and no server summary until stopped separately; documented)
T3b (separate check) h2-origin-test.mjs: ALPN offered h2+http/1.1 -> server saw HTTP/1.1; create=1
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

### `tls-origin-test.mjs`

<!-- prettier-ignore -->
```js
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
const calls = [];
const srv = createServer({ key: readFileSync("key.pem"), cert: readFileSync("cert.pem") }, (q, r) => { calls.push(`${q.method} ${q.url} host=${q.headers.host}`); q.resume(); q.on("end", () => r.end("{}")); });
await new Promise((res, rej) => { srv.once("error", rej); srv.listen(Number(process.env.NMI_TEST_TLS_PORT), "127.0.0.1", res); });
const r = await fetch("https://api-m.sandbox.paypal.com/v2/invoicing/invoices", { method: "POST", headers: { authorization: "Bearer SECRETTOKEN-ABC123" }, body: "{\"s\":\"SECRETBODY\"}" });
await r.text();
console.log("SERVER SAW (loopback, not PayPal):", JSON.stringify(calls));
srv.close();
```

### `h2-origin-test.mjs`

<!-- prettier-ignore -->
```js
import { createSecureServer } from "node:http2";
import { readFileSync } from "node:fs";
const seen = [];
const srv = createSecureServer({ key: readFileSync("key.pem"), cert: readFileSync("cert.pem"), allowHTTP1: true, ALPNProtocols: ["h2", "http/1.1"] }, (q, r) => { seen.push(`HTTP/${q.httpVersion} ${q.method} ${q.url}`); q.resume(); q.on("end", () => r.end("{}")); });
await new Promise((res) => srv.listen(Number(process.env.NMI_TEST_TLS_PORT), "127.0.0.1", res));
const r = await fetch("https://api-m.sandbox.paypal.com/v2/invoicing/invoices", { method: "POST", body: "{}" }); await r.text();
console.log("SERVER (ALPN offers h2 and http/1.1) SAW:", JSON.stringify(seen));
srv.close();
```

### `client-wire-test.mts`

<!-- prettier-ignore -->
```ts
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
const { PayPalSandboxClient } = await import(`${process.env.NMI_PAYPAL_SRC}/index.ts`);
const mode = process.argv[2] ?? "create201";
let showN = 0;
const srv = createServer({ key: readFileSync("key.pem"), cert: readFileSync("cert.pem") }, (q, r) => {
  q.resume();
  q.on("end", () => {
    const send = (s: number, b: unknown) => { r.statusCode = s; r.setHeader("content-type", "application/json"); r.end(JSON.stringify(b)); };
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
} catch (e) { console.log("client outcome:", (e as Error).name, (e as { code?: string }).code ?? ""); }
srv.close();
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
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  [${mode}] ${n}${ok ? "" : " — " + d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (c, a, o = {}) => { const r = spawnSync(c, a, { encoding: "utf8", ...o }); if (r.status !== 0) throw new Error(`${c} ${a.slice(0, 3)} failed ${r.stderr.slice(0, 300)}`); return r.stdout; };
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_w", "--auth=trust", "-E", "UTF8"]);
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
# Offline observer validation. Run from the directory holding the files. Needs: NMI_REPO, node 24, tsx (repo), openssl, macOS sandbox-exec, PostgreSQL 16 binaries (PG_BIN).
set -u
: "${NMI_REPO:?set NMI_REPO}"
TSX="$NMI_REPO/apps/api/node_modules/.bin/tsx"
SB='(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))'
export NMI_TEST_TLS_PORT=48443
echo "### T1 loopback-only offline tests (real Node fetch, test copy differs by the origin line)"
node offline-tests.mjs || exit 1
echo "### T2 egress is blocked by the sandbox (sanity)"
sandbox-exec -p "$SB" node -e "fetch('https://example.com').then(()=>{console.log('REACHED INTERNET');process.exit(1)}).catch(e=>console.log('blocked:',e.cause&&e.cause.code||e.message))"
echo "### T3 UNMODIFIED observer, default-port https origin through a fail-closed loopback redirect"
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj "/CN=api-m.sandbox.paypal.com" -addext "subjectAltName=DNS:api-m.sandbox.paypal.com" 2>/dev/null
RUNDIR=$(mktemp -d)
NMI_WIRE_RUN_ID=TLS-1 NMI_WIRE_OUT_DIR=$RUNDIR NODE_EXTRA_CA_CERTS=$PWD/cert.pem NODE_OPTIONS="--require $PWD/lookup-loopback.cjs --require $PWD/nmi-wire-observer.cjs" sandbox-exec -p "$SB" node tls-origin-test.mjs 2>&1 | grep -E "SERVER SAW|SUMMARY" | sed 's/.*"counts"/"counts"/'
echo "### T4 production PayPalSandboxClient + production fetch transport, UNMODIFIED observer"
for m in create201 create401 show401 search; do
  echo "-- $m"
  NMI_PAYPAL_SRC="$NMI_REPO/packages/paypal/src" NMI_WIRE_RUN_ID=CL-$m NMI_WIRE_OUT_DIR=$RUNDIR NODE_EXTRA_CA_CERTS=$PWD/cert.pem NODE_OPTIONS="--require $PWD/lookup-loopback.cjs --require $PWD/nmi-wire-observer.cjs" sandbox-exec -p "$SB" "$TSX" client-wire-test.mts $m 2>&1 | grep -E "client outcome|SUMMARY" | grep -v '"events":0' | sed 's/.*"entry"/"entry"/;s/"startedAt[^}]*"counts"/"counts"/'
done
if [ -n "${NMI_OLD_PAYPAL_SRC:-}" ]; then
  echo "### T5 NEGATIVE CONTROL: the pre-FIX-B1 client (commit 85470d9) must show create=2 and STOP"
  NMI_PAYPAL_SRC="$NMI_OLD_PAYPAL_SRC" NMI_WIRE_RUN_ID=OLD-create401 NMI_WIRE_OUT_DIR=$RUNDIR NODE_EXTRA_CA_CERTS=$PWD/cert.pem NODE_OPTIONS="--require $PWD/lookup-loopback.cjs --require $PWD/nmi-wire-observer.cjs" sandbox-exec -p "$SB" "$TSX" client-wire-test.mts create401 2>&1 | grep -E "client outcome|STOP|SUMMARY" | grep -v '"events":0' | sed 's/.*"entry"/"entry"/;s/"startedAt[^}]*"counts"/"counts"/'
fi
rm -rf "$RUNDIR"
echo "### T6 actual pnpm/tsx Fastify server process (three shutdown shapes)"
for m in sigint-group sigterm-group sigterm-pnpm; do node server-test.mjs $m || exit 1; done
echo "ALL DONE"
```

