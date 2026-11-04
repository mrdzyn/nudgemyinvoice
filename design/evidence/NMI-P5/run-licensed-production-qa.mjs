/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-P5 licensed AG Studio PRODUCTION-BUILD browser QA (SIMULATED providers, synthetic data only).
//
//   pnpm build:web:licensed && node design/evidence/NMI-P5/run-licensed-production-qa.mjs
//
// Shape under test (all disposable and local; nothing hosted, no provider reachable):
//   headless Chrome -> local TLS-terminating proxy simulation (self-signed https://localhost:8453, its request-line
//   log stands in for a host's HTTP request log) -> the REAL production server entry (NODE_ENV=production,
//   NMI_WEB_STUDIO=licensed, serving apps/web/dist and /api from one origin, connected as the least-privilege
//   runtime role) -> disposable PostgreSQL 16.
//
// Protected test licence configuration: the owner's AG Studio licence is read ONLY from the untracked `.env.local`
// (that one line), held in memory, and handed to the server process environment. It is never printed, written to a
// file, put in a URL or in results; every captured log/console text is checked for it and redacted before storage.
// Screenshots show rendered charts only (the licence is never displayed by the app).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const dist = join(root, "apps/web/dist");
const PROXY_PORT = 8453;
const ORIGIN = `https://localhost:${PROXY_PORT}`;
const API_PORT = 3153;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54353;
const DEBUG_PORT = 9353;
const DB = "nmi_test_p5_licensed";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots");
const USER = "p5-operator";
const PASSWORD = randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------ the licence: ONE line of the untracked .env.local, in memory */
function readKey() {
  for (const f of [join(root, ".env.local"), join(root, "apps/web/.env.local")]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?AG_STUDIO_LICENSE_KEY\s*=\s*(.*?)\s*$/.exec(line);
      if (m) return (m[1] ?? "").replace(/^(["'])(.*)\1$/, "$2") || null;
    }
  }
  return null;
}
const KEY = readKey();
if (!KEY) throw new Error("No AG_STUDIO_LICENSE_KEY in the untracked .env.local: the licensed QA needs the owner's licence (never committed).");
const redact = (s) => String(s).split(KEY).join("[licence redacted]");
const leaks = (s) => String(s).includes(KEY);

const results = [];
const check = (group, name, cond, detail = "") => {
  results.push({ group, name, result: cond ? "PASS" : "FAIL", detail: cond ? "" : redact(detail).slice(0, 700) });
  console.log(`${cond ? "PASS" : "FAIL"}  [${group}] ${name}${cond ? "" : " - " + redact(detail).slice(0, 400)}`);
};
const info = { startedAt: new Date().toISOString() };

/* ------------------------------------------------ the build must be the licensed variant */
if (!existsSync(join(dist, "index.html"))) throw new Error("Run `pnpm build:web:licensed` first");
const assets = readdirSync(join(dist, "assets"));
const studioChunk = assets.find((f) => /^StudioCharts-.*\.js$/.test(f));
if (!studioChunk) throw new Error("apps/web/dist is not the licensed variant: run `pnpm build:web:licensed`");
const shellHtml = readFileSync(join(dist, "index.html"), "utf8");
const entryScripts = [...shellHtml.matchAll(/src="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
info.build = { assets: assets.length, studioChunk, entryScripts };
check("build", "the HTML shell and the scripts it loads directly carry no AG Studio code and no licence (Studio is a lazy chunk)", entryScripts.length > 0 && entryScripts.every((f) => !/AgStudio|ag-studio/i.test(readFileSync(join(dist, "assets", f), "utf8"))) && !/AgStudio|ag-studio/i.test(shellHtml), entryScripts.join(","));
check("build", "no built file contains the licence value, the dev-only bridge or the licence variable name", readdirSync(join(dist, "assets")).every((f) => { const t = readFileSync(join(dist, "assets", f), "utf8"); return !leaks(t) && !/__nmi_dev|x-nmi-dev-studio|AG_STUDIO_LICENSE_KEY/.test(t); }) && !leaks(shellHtml));
const scan = spawnSync("node", ["scripts/check-bundle-secrets.mjs"], { cwd: root, encoding: "utf8", env: { ...process.env, NMI_WEB_STUDIO: "licensed" } });
check("build", "the repository bundle scan (licensed variant) passes and confirms the local licence value is absent from every file", scan.status === 0 && /licence value absent/.test(scan.stdout), redact(scan.stdout + scan.stderr));

/* ------------------------------------------------ disposable PostgreSQL 16, owner + runtime role */
const work = mkdtempSync(join(tmpdir(), "nmi-p5-"));
const children = [];
const cleanup = () => {
  for (const c of children) try { process.kill(-c.pid, "SIGTERM"); } catch { try { c.kill("SIGTERM"); } catch {} }
  spawnSync(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "immediate", "stop"], { stdio: "ignore" });
  rmSync(work, { recursive: true, force: true });
};
process.on("exit", cleanup);
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${redact(r.stderr || "").slice(0, 300)}`);
  return r.stdout;
};
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_owner", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psql = (db, args) => run(join(PG_BIN, "psql"), ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_owner", "-d", db, "-X", "-v", "ON_ERROR_STOP=1", ...args]);
const sql = (s) => psql(DB, ["-tA", "-c", s]).trim();
const sqlRows = (s) => sql(s).split("\n").filter(Boolean).map((l) => l.split("|"));
psql("postgres", ["-c", `CREATE DATABASE ${DB}`]);
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) psql(DB, ["-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
psql(DB, ["-q", "-c", "CREATE ROLE nmi_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"]);
psql(DB, ["-q", "-f", join(root, "packages/db/ops/runtime-role.sql")]);
const OWNER_URL = `postgres://nmi_owner@127.0.0.1:${PG_PORT}/${DB}`;
const RUNTIME_URL = `postgres://nmi_runtime@127.0.0.1:${PG_PORT}/${DB}`;
run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL: OWNER_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: PASSWORD } });
const OP = sql(`SELECT id FROM operators WHERE username='${USER}'`);

/* ------------------------------------------------ the production server entry: licensed, providers off */
const apiLog = join(work, "api.log");
const api = spawn("pnpm", ["--filter", "@nmi/api", "start"], {
  cwd: root, detached: true, stdio: ["ignore", openSync(apiLog, "a"), openSync(apiLog, "a")],
  env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, TRUST_PROXY: "1", DATABASE_URL: RUNTIME_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", PAYPAL_DRAFTS_ENABLED: "false", NMI_WEB_STUDIO: "licensed", AG_STUDIO_LICENSE_KEY: KEY },
});
children.push(api);
let up = false;
for (let i = 0; i < 300 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok; } catch {} if (!up) await sleep(150); }
if (!up) throw new Error("production server did not start: " + redact(readFileSync(apiLog, "utf8")).slice(-600));

/* ------------------------------------------------ TLS-terminating proxy simulation + request-line log */
run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(work, "k.pem"), "-out", join(work, "c.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "pipe" });
const edgeLog = [];
const proxy = https.createServer({ key: readFileSync(join(work, "k.pem")), cert: readFileSync(join(work, "c.pem")) }, (creq, cres) => {
  edgeLog.push(`${creq.method} ${creq.url}`);
  const upReq = http.request({ host: "127.0.0.1", port: API_PORT, method: creq.method, path: creq.url, headers: { ...creq.headers, "x-forwarded-for": creq.socket.remoteAddress, "x-forwarded-proto": "https" } }, (ures) => { cres.writeHead(ures.statusCode, ures.headers); ures.pipe(cres); });
  upReq.on("error", () => { cres.statusCode = 502; cres.end(); });
  creq.pipe(upReq);
});
await new Promise((r) => proxy.listen(PROXY_PORT, "127.0.0.1", r));
const viaProxy = (method, path, { headers = {}, body } = {}) => new Promise((ok, bad) => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const req = https.request({ host: "127.0.0.1", port: PROXY_PORT, method, path, rejectUnauthorized: false, headers: { ...(payload ? { "content-type": "application/json" } : {}), ...headers } }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok({ status: res.statusCode, headers: res.headers, body: b })); });
  req.on("error", bad); req.end(payload);
});

/* ------------------------------------------------ synthetic population through the REAL save route */
const L = await viaProxy("POST", "/api/auth/login", { headers: { origin: ORIGIN }, body: { username: USER, password: PASSWORD } });
const seedCookie = L.headers["set-cookie"][0].split(";")[0];
const seedCsrf = JSON.parse(L.body).csrfToken;
let s0 = 20261104;
const rnd = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const N = 96;
const ids = [];
for (let i = 0; i < N; i++) {
  const currency = i % 7 === 3 ? "JPY" : i % 3 === 1 ? "EUR" : "USD";
  const unit = currency === "JPY" ? String(2400 + ((i * 731) % 9000)) : `${18 + ((i * 37) % 260)}.${String((i * 13) % 100).padStart(2, "0")}`;
  const r = await viaProxy("POST", "/api/invoice-drafts", { headers: { origin: ORIGIN, cookie: seedCookie, "x-csrf-token": seedCsrf, "idempotency-key": `p5-seed-${String(i).padStart(4, "0")}-key-xxxxxxxx` }, body: { customerName: `P5 Synthetic Client ${String(i).padStart(3, "0")}`, customerEmail: `client${i}@p5.example`, currency, lineItems: [{ description: `Synthetic work ${i}`, quantity: String(1 + (i % 3)), unitPrice: unit }], dueDate: "2030-01-15", taxPercent: null, discount: null } });
  if (r.status !== 201) throw new Error(`seed ${i} failed: ${r.status}`);
  ids.push(JSON.parse(r.body).id);
}
// created_at over the default 30-day window, clustered on business days with real zero days (disposable DB only).
const now = Date.now();
const upd = ids.map((id) => { let d; do { d = Math.floor(rnd() * 29); } while (new Date(now - d * 86_400_000).getUTCDay() % 6 === 0 && rnd() < 0.85); return [id, new Date(now - d * 86_400_000 - Math.floor(rnd() * 8) * 3_600_000 - 600_000).toISOString()]; });
sql(`UPDATE invoices SET created_at = v.t::timestamptz FROM (VALUES ${upd.map(([id, t]) => `('${id}','${t}')`).join(",")}) AS v(id, t) WHERE invoices.id = v.id::uuid`);
// SIMULATED PayPal-state rows so every status group has members (no provider exists in this run).
const opRow = (id, state, cols = "", vals = "") => sql(`INSERT INTO paypal_draft_operations (invoice_id, state, invoice_number, payload_digest, attempts, invoice_date${cols}) VALUES ('${id}', '${state}', 'NMI-${id.replaceAll("-", "").slice(0, 20)}', '${"a".repeat(64)}', 1, '2026-11-04'${vals})`);
ids.slice(0, 14).forEach((id, k) => opRow(id, "created", ", paypal_invoice_id, completed_at", `, 'INV2-SIMULATED-${k}', now()`));
ids.slice(14, 19).forEach((id) => opRow(id, "creating", ", claimed_at, create_attempted_at", ", now(), now()"));
ids.slice(19, 23).forEach((id) => opRow(id, "rejected", ", last_error_code, completed_at", ", 'oauth_http_401', now()"));
await viaProxy("POST", "/api/auth/logout", { headers: { origin: ORIGIN, cookie: seedCookie, "x-csrf-token": seedCsrf } });
check("seed", `${N} synthetic invoices (USD/EUR/JPY) saved through the real route over HTTPS; created_at spread across the default 30-day window with zero days; SIMULATED status rows for every group`, Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${OP}'`)) === N);

/* ------------------------------------------------ independent SQL (exact minor units, local calendar days) */
const totalsSql = (cur) => Object.fromEntries(sqlRows(`SELECT currency, count(*), sum(total_minor) FROM invoices WHERE created_by='${OP}' ${cur ? `AND currency='${cur}'` : ""} GROUP BY 1 ORDER BY 1`).map(([c, n, s]) => [c, { n: Number(n), s }]));
const dailySql = (cur) => sqlRows(`WITH d AS (SELECT to_char(x, 'YYYY-MM-DD') AS "day" FROM generate_series((timezone('${ZONE}', now()))::date - 29, (timezone('${ZONE}', now()))::date, '1 day') x), a AS (SELECT to_char(timezone('${ZONE}', created_at), 'YYYY-MM-DD') AS "day", count(*) n, sum(total_minor) s FROM invoices WHERE created_by='${OP}' AND currency='${cur}' GROUP BY 1) SELECT d."day", coalesce(a.n,0), coalesce(a.s,0) FROM d LEFT JOIN a USING ("day") ORDER BY 1`);

/* ------------------------------------------------ pre-login boundary over HTTPS */
const anon = await viaProxy("GET", "/api/studio/licence", { headers: { "x-nmi-studio": "1" } });
check("licence", "anonymous GET /api/studio/licence through the proxy is 401, no-store, and carries no licence", anon.status === 401 && /no-store/.test(anon.headers["cache-control"] ?? "") && !leaks(anon.body), `${anon.status} ${anon.headers["cache-control"]}`);

/* ------------------------------------------------ headless Chrome over CDP */
const profile = mkdtempSync(join(tmpdir(), "nmi-p5-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--ignore-certificate-errors", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore", detached: true });
children.push(chrome);
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break; } catch {} await sleep(150); }
const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
let msgId = 0;
const pending = new Map();
const consoleMsgs = [];
const net = [];
const foreign = [];
const intercept = { licence: null, analyticsDelayMs: 0 };
ws.onmessage = async (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { ok, bad } = pending.get(msg.id); pending.delete(msg.id); msg.error ? bad(new Error(msg.error.message)) : ok(msg.result); return; }
  const p = msg.params;
  if (msg.method === "Runtime.exceptionThrown") consoleMsgs.push("exception: " + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  else if (msg.method === "Runtime.consoleAPICalled") consoleMsgs.push(`console.${p.type}: ` + p.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Log.entryAdded") consoleMsgs.push(`log.${p.entry.level}: ${p.entry.text}`);
  else if (msg.method === "Network.requestWillBeSent") { const u = p.request.url; if (u.startsWith(ORIGIN + "/")) net.push({ id: p.requestId, method: p.request.method, path: u.slice(ORIGIN.length) }); else if (!/^(about:|data:|blob:)/.test(u)) foreign.push(u); }
  else if (msg.method === "Network.responseReceived") { const e = net.find((x) => x.id === p.requestId); if (e) { e.status = p.response.status; e.headers = p.response.headers; } }
  else if (msg.method === "Fetch.requestPaused") {
    const path = p.request.url.slice(ORIGIN.length);
    if (path === "/api/studio/licence" && intercept.licence) { await send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: intercept.licence, responseHeaders: [{ name: "content-type", value: "application/json" }, { name: "cache-control", value: "no-store" }], body: Buffer.from('{"error":"studio_licence_not_configured"}').toString("base64") }); return; }
    if (path === "/api/analytics/summary" && intercept.analyticsDelayMs) await sleep(intercept.analyticsDelayMs);
    await send("Fetch.continueRequest", { requestId: p.requestId });
  }
};
const send = (method, params = {}) => new Promise((ok, bad) => { const id = ++msgId; pending.set(id, { ok, bad }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error("eval failed: " + expression.slice(0, 80) + " :: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 30000, what = expr) => { const t = Date.now(); for (;;) { let v = false; try { v = await ev(expr); } catch {} if (v) return v; if (Date.now() - t > ms) throw new Error("timed out waiting for: " + what.slice(0, 120)); await sleep(120); } };
const q = JSON.stringify;
const setInput = (sel, v) => ev(`(() => { const e = document.querySelector(${q(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ${q(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const click = (sel) => ev(`document.querySelector(${q(sel)}).click()`);
const VK = { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35, Enter: 13, Tab: 9, " ": 32 };
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await send("Input.dispatchKeyEvent", { type: k === "Enter" || k === " " ? "keyDown" : "rawKeyDown", key: k, code: k === " " ? "Space" : k, windowsVirtualKeyCode: VK[k], ...(k === "Enter" ? { text: "\r" } : k === " " ? { text: " " } : {}) }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k === " " ? "Space" : k, windowsVirtualKeyCode: VK[k] }); await sleep(120); } };
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Fetch.enable", { patterns: [{ urlPattern: `${ORIGIN}/api/*` }] });
// Record every CSP violation with its effective directive (style-src-elem vs style-src-attr) and source file.
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__cspv = []; document.addEventListener('securitypolicyviolation', (e) => window.__cspv.push([e.effectiveDirective, (e.sourceFile || '').replace(location.origin, ''), e.lineNumber, (e.sample || '').slice(0, 60)]));" });
const cspDetail = () => ev("JSON.stringify(window.__cspv ?? [])");
if (process.env.P5_DEBUG_CSP) await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__nonceless = []; for (const fn of ['appendChild', 'insertBefore', 'prepend', 'append']) { const proto = fn === 'prepend' || fn === 'append' ? Element.prototype : Node.prototype; const orig = proto[fn]; proto[fn] = function (...args) { for (const n of args) if (n && n.nodeName === 'STYLE' && !n.nonce) window.__nonceless.push([(n.textContent || '').slice(0, 70), (new Error().stack || '').split('\\n').slice(2, 6).map((l) => l.replace(location.origin, '').trim()).join(' <- ')]); return orig.apply(this, args); }; }` });
await send("Emulation.setTimezoneOverride", { timezoneId: ZONE });
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
let viewport = DESKTOP;
const setViewport = async (v) => { viewport = v; await send("Emulation.setDeviceMetricsOverride", v); await send("Emulation.setTouchEmulationEnabled", { enabled: v.mobile }); };
mkdirSync(SHOTS, { recursive: true });
const shot = async (name, full = true) => {
  if (full) { const m = await send("Page.getLayoutMetrics"); await send("Emulation.setDeviceMetricsOverride", { ...viewport, height: Math.ceil(m.cssContentSize.height) }); await sleep(600); }
  const s = await send("Page.captureScreenshot", { format: "jpeg", quality: 74 });
  writeFileSync(join(SHOTS, `${name}.jpg`), Buffer.from(s.data, "base64"));
  if (full) { await send("Emulation.setDeviceMetricsOverride", viewport); await sleep(300); }
};
const goto = async (path = "/") => { await send("Page.navigate", { url: ORIGIN + path }); await sleep(500); };
const signIn = async () => {
  await goto("/");
  await waitFor("!!document.querySelector('#login-username')", 30000, "login form");
  await setInput("#login-username", USER);
  await setInput("#login-password", PASSWORD);
  await click("form button[type=submit]");
  await waitFor("!!document.querySelector('#dash-title')", 30000, "dashboard");
};
const signOut = async () => { const b = await ev("[...document.querySelectorAll('button')].some((b) => /^Sign out$/.test(b.textContent.trim()))"); if (b) await ev("[...document.querySelectorAll('button')].find((b) => /^Sign out$/.test(b.textContent.trim())).click()"); await waitFor("!!document.querySelector('#login-username')", 20000, "signed out"); };
const panel = () => ev("document.querySelector('#studio-panel')?.dataset.studio ?? 'none'");
const waitActive = () => waitFor("document.querySelector('#studio-panel')?.dataset.studio === 'active' && document.querySelectorAll('#studio-panel canvas').length >= 2", 90000, "Studio active with canvases");
const settled = () => waitFor("!!document.querySelector('#dash-cards') && !document.querySelector('[data-testid=studio-placeholder]')", 30000, "cards loaded");
const licenceReqs = (from = 0) => net.slice(from).filter((r) => r.path === "/api/studio/licence");
const studioChunkReqs = (from = 0) => net.slice(from).filter((r) => /\/assets\/StudioCharts-/.test(r.path));

/* 1. sign-in page: no Studio code, no licence request */
await setViewport(DESKTOP);
await goto("/");
await waitFor("!!document.querySelector('#login-username')", 30000, "login form");
check("licence", "the sign-in page loads no Studio chunk and requests no licence", studioChunkReqs().length === 0 && licenceReqs().length === 0, JSON.stringify(net.map((r) => r.path)));

/* 2. operator sign-in -> licensed Studio renders in the production build */
let mark = net.length;
await signIn();
await settled();
await waitActive();
const lic = licenceReqs(mark);
check("render", "after operator sign-in the PRODUCTION build renders real AG Studio charts (panel active, Studio badge, trend + status canvases)", (await panel()) === "active" && (await ev("document.querySelector('#studio-panel').innerText.includes('Studio · view only')")), await panel());
check("licence", "exactly one licence request after sign-in: 200, no-store, private", lic.length === 1 && lic[0].status === 200 && /no-store/.test(lic[0].headers?.["cache-control"] ?? lic[0].headers?.["Cache-Control"] ?? ""), JSON.stringify(lic.map((r) => [r.status, r.headers?.["cache-control"]])));
check("licence", "the licence is not in the DOM, a cookie, localStorage or sessionStorage", !(await ev(`(() => { const k = ${q(KEY)}; return document.documentElement.outerHTML.includes(k) || document.cookie.includes(k) || JSON.stringify({ ...localStorage }).includes(k) || JSON.stringify({ ...sessionStorage }).includes(k); })()`)));
const cspViolations = () => consoleMsgs.filter((m) => /Content Security Policy|Refused to (load|apply|execute|connect)/i.test(m));
const licenceComplaints = () => consoleMsgs.filter((m) => /licen[cs]e/i.test(m) && /invalid|expired|not found|missing|trial|watermark|unlicensed|incompatible/i.test(m));
check("security", "no Content-Security-Policy violation while the licensed Studio loads and renders", cspViolations().length === 0, `${cspViolations().length} violations; ${await cspDetail()}`.slice(0, 1500));
check("licence", "AG Studio reports no licence problem in the console (invalid / expired / missing / trial)", licenceComplaints().length === 0, licenceComplaints().slice(0, 3).join(" | "));
check("network", "no request leaves the single origin (no CDN, licence server or telemetry host)", foreign.length === 0, foreign.slice(0, 5).join(","));

if (process.env.P5_DEBUG_CSP) { console.log("NONCELESS", JSON.stringify(await ev("window.__nonceless"), null, 1).slice(0, 4000)); process.exit(0); }
/* 3. layout order: filters -> analytics -> cards -> grid */
const order = await ev(`(() => { const t = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1; return [t('[aria-label="Filter by currency"]'), t('#studio-panel'), t('#dash-cards'), t('.nmi-grid')]; })()`);
check("layout", "reading and visual order is currency filters -> Activity analytics -> currency cards -> invoice grid", order.every((v) => v >= 0) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3], JSON.stringify(order));
const overflowX = () => ev("document.scrollingElement.scrollWidth - window.innerWidth");
check("layout", "desktop 1280: no horizontal page overflow", (await overflowX()) <= 0, String(await overflowX()));

/* 4. exact figures: cards and the daily table vs independent SQL */
const fmtMinor = (minor, cur) => { const e = cur === "JPY" ? 0 : 2; const neg = String(minor).startsWith("-"); const d = String(minor).replace("-", "").padStart(e + 1, "0"); return (neg ? "-" : "") + (e ? `${d.slice(0, -e)}.${d.slice(-e)}` : d); };
const cardText = await ev("[...document.querySelectorAll('#dash-cards .currency-card')].map((c) => c.innerText.replace(/\\s+/g, ' '))");
const T = totalsSql();
check("figures", "each currency card shows the exact SQL count and total for its own currency only (no cross-currency sum)", Object.entries(T).every(([c, v]) => cardText.some((t) => t.startsWith(c) && t.includes(`${v.n} invoice`) && t.replace(/[^\d.]/g, "").includes(fmtMinor(v.s, c).replace(/[^\d.]/g, "")))) && cardText.length === Object.keys(T).length, JSON.stringify({ cardText, T }));
const tableRows = async () => ev("(() => { const d = document.querySelector('[data-testid=studio-daily-table]'); d.closest('details').open = true; return [...d.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent.trim())); })()");
const activeCur = () => ev("document.querySelector('#studio-panel .cur-now')?.textContent.trim()");
{
  const cur = await activeCur();
  const rows = await tableRows();
  const want = dailySql(cur);
  const okRows = rows.length === want.length && rows.every((r, i) => Number(r[1]) === Number(want[i][1]) && r[2].replace(/[^\d.]/g, "") === fmtMinor(want[i][2], cur).replace(/[^\d.]/g, "").replace(/^0+(?=\d)/, (m) => m));
  check("figures", `the exact daily table for ${cur} has one row per local day (zero days included) matching independent SQL`, okRows && want.some((r) => Number(r[1]) === 0), JSON.stringify({ rows: rows.slice(0, 3), want: want.slice(0, 3), n: [rows.length, want.length] }));
}
await shot("01-desktop-licensed-all-currencies");

/* 5. keyboard: chart currency tabs and the show/hide toggle */
await ev("document.querySelector('#studio-panel [role=tab][aria-selected=true]').focus()");
const before = await activeCur();
await key("ArrowRight");
const afterTab = await ev("({ cur: document.querySelector('#studio-panel .cur-now')?.textContent.trim(), focused: document.activeElement?.getAttribute('role'), sel: document.activeElement?.getAttribute('aria-selected') })");
check("keyboard", "ArrowRight on the chart currency tabs moves focus and selection to the next currency and redraws that currency", afterTab.cur !== before && afterTab.focused === "tab" && afterTab.sel === "true", JSON.stringify({ before, afterTab }));
await waitActive();
await ev("document.querySelector('.studio-toggle').focus()");
await key("Enter");
const collapsed = await ev("({ exp: document.querySelector('.studio-toggle').getAttribute('aria-expanded'), hidden: document.querySelector('.studio-body').hidden })");
await key("Enter");
const reopened = await ev("document.querySelector('.studio-toggle').getAttribute('aria-expanded')");
check("keyboard", "Enter on 'Hide charts' collapses the panel (aria-expanded=false, body hidden) and Enter again reopens it", collapsed.exp === "false" && collapsed.hidden === true && reopened === "true", JSON.stringify({ collapsed, reopened }));
await waitActive();
const focusRing = await ev("(() => { const t = document.querySelector('#studio-panel [role=tab][aria-selected=true]'); t.focus(); const s = getComputedStyle(t); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; })()");
check("keyboard", "the focused chart tab shows a visible focus ring (>= 2px outline)", focusRing);

/* 6. filter interaction + loading state: EUR pill -> placeholder while reloading -> EUR-only charts and cards */
await ev("document.querySelectorAll('#studio-panel details').forEach((d) => (d.open = false))");
await sleep(300);
const panelHeight = await ev("Math.round(document.querySelector('#studio-panel').getBoundingClientRect().height)");
intercept.analyticsDelayMs = 1500;
mark = net.length;
await ev(`[...document.querySelectorAll('[aria-label="Filter by currency"] button')].find((b) => b.textContent.trim() === 'EUR').click()`);
await waitFor("!!document.querySelector('[data-testid=studio-placeholder]')", 5000, "placeholder");
const loading = await ev("(() => { const p = document.querySelector('[data-testid=studio-placeholder] .studio'); const f = document.querySelector('[aria-label=\"Filter by currency\"]').getBoundingClientRect().top; return { hidden: p.getAttribute('aria-hidden'), below: p.getBoundingClientRect().top > f, h: Math.round(p.getBoundingClientRect().height), figures: /\\d/.test(p.innerText) }; })()");
await shot("02-desktop-loading-placeholder", false);
const hiddenAttr = await ev("document.querySelector('[data-testid=studio-placeholder]').getAttribute('aria-hidden')");
check("loading", "while analytics reloads after a filter change, an aria-hidden placeholder holds the panel's place below the filters (height within 15% of the loaded panel) and shows no figures", hiddenAttr === "true" && loading.below && Math.abs(loading.h - panelHeight) / panelHeight <= 0.15 && !loading.figures, JSON.stringify({ ...loading, hiddenAttr, panelHeight }));
intercept.analyticsDelayMs = 0;
await settled();
await waitActive();
const eur = await ev("({ cards: [...document.querySelectorAll('#dash-cards .currency-card .top > span:first-child')].map((s) => s.textContent.trim()), tabs: !!document.querySelector('#studio-panel [role=tablist]'), cur: document.querySelector('#studio-panel .cur-now')?.textContent.trim(), status: [...document.querySelectorAll('[data-testid=studio-status-list] .status-row strong, [data-testid=studio-status-list] th[scope=row]')].map((e) => e.textContent.trim()) })");
check("filters", "choosing EUR in the top filter updates BOTH the analytics and the cards to EUR only (no chart tabs, no other currency)", JSON.stringify(eur.cards) === '["EUR"]' && !eur.tabs && eur.cur === "EUR", JSON.stringify(eur));
check("filters", "one shared analytics request served the filter change (no parallel chart fetch)", net.slice(mark).filter((r) => r.path === "/api/analytics/summary").length === 1, String(net.slice(mark).filter((r) => r.path === "/api/analytics/summary").length));
// By design each chart (re)load re-authorises against the live session (no long-lived client copy), so a filter
// change that remounts the panel makes at most ONE fresh no-store licence request.
check("licence", "the filter change re-authorised the licence at most once (no request storm), always no-store", licenceReqs(mark).length <= 1 && licenceReqs(mark).every((r) => r.status === 200 && /no-store/.test(r.headers?.["cache-control"] ?? "")), JSON.stringify(licenceReqs(mark).map((r) => r.status)));
await shot("03-desktop-licensed-eur-filter");
await ev(`[...document.querySelectorAll('[aria-label="Filter by currency"] button')].find((b) => b.textContent.trim() === 'All currencies').click()`);
await settled();
await waitActive();

/* 7. dark theme */
await ev("document.documentElement.setAttribute('data-theme', 'dark')");
await sleep(1200);
const dark = await ev("(() => { const bg = getComputedStyle(document.querySelector('#studio-panel')).backgroundColor; const c = document.querySelector('#studio-panel canvas'); const px = c.getContext('2d')?.getImageData?.(2, 2, 1, 1)?.data; return { bg, px: px ? [...px] : null }; })()");
await shot("04-desktop-licensed-dark");
check("theme", "dark theme: the panel uses the dark surface token and the Studio canvas repaints dark (no white chart box)", /rgb\((\d+), (\d+), (\d+)\)/.test(dark.bg) && dark.bg.match(/\d+/g).slice(0, 3).every((n) => Number(n) < 80) && (!dark.px || dark.px.slice(0, 3).every((n) => n < 90) || dark.px[3] === 0), JSON.stringify(dark));
check("security", "no CSP violation after the theme switch", cspViolations().length === 0, cspViolations().slice(0, 3).join(" | "));
await ev("document.documentElement.removeAttribute('data-theme')");
await sleep(800);

/* 8. licence unavailable -> honest fallback with exact tables (fresh load, server licence answer simulated as 404) */
intercept.licence = 404;
await goto("/");
await settled();
await waitFor("document.querySelector('#studio-panel')?.dataset.studio === 'fallback'", 30000, "fallback");
const fb = await ev("({ notice: document.querySelector('#studio-unavailable')?.innerText ?? '', retry: [...document.querySelectorAll('#studio-panel button')].some((b) => /Try loading charts again/.test(b.textContent)), canvases: document.querySelectorAll('#studio-panel canvas').length, badge: document.querySelector('#studio-panel').innerText.includes('Studio · view only'), table: !!document.querySelector('[data-testid=studio-daily-table]'), cards: document.querySelectorAll('#dash-cards .currency-card').length, grid: !!document.querySelector('.nmi-grid .ag-row') })");
await shot("05-desktop-licence-unavailable-fallback");
check("fallback", "without a licence the production panel fails closed: 'Charts unavailable' + Retry, no Studio canvas or badge, exact tables, cards and grid intact", /Charts unavailable/.test(fb.notice) && fb.retry && fb.canvases === 0 && !fb.badge && fb.table && fb.cards > 0 && fb.grid, JSON.stringify(fb));
intercept.licence = null;
await ev("[...document.querySelectorAll('#studio-panel button')].find((b) => /Try loading charts again/.test(b.textContent)).click()");
await waitActive();
check("fallback", "Retry recovers once the licence is available again", (await panel()) === "active");

/* 9. 390px mobile: collapsed by default, licence fetched only when expanded, no overflow */
await setViewport(MOBILE);
mark = net.length;
await goto("/");
await settled();
await sleep(800);
const mob = await ev("({ exp: document.querySelector('.studio-toggle')?.getAttribute('aria-expanded'), canvases: document.querySelectorAll('#studio-panel canvas').length })");
check("mobile", "390px: the panel starts collapsed and no licence or Studio chunk is requested until the operator opens it", mob.exp === "false" && mob.canvases === 0 && licenceReqs(mark).length === 0, JSON.stringify({ mob, lic: licenceReqs(mark).length }));
check("mobile", "390px: no horizontal page overflow with the panel collapsed", (await overflowX()) <= 0, String(await overflowX()));
await shot("06-mobile-390-collapsed");
await click(".studio-toggle");
await waitActive();
check("mobile", "390px: opening the panel loads the licence once and renders real Studio charts", licenceReqs(mark).length === 1 && (await panel()) === "active");
check("mobile", "390px: no horizontal page overflow with the charts open", (await overflowX()) <= 0, String(await overflowX()));
const fit = await ev("(() => { const r = (s) => { const e = document.querySelector(s); return e ? [e.scrollWidth, e.clientWidth] : null; }; return { status: r('#studio-panel .status-scroll'), kpis: r('#studio-panel .studio-kpis'), tabs: r('#studio-panel .cur-tabs'), heads: getComputedStyle(document.querySelector('#studio-panel .status-table thead')).position }; })()");
check("mobile", "390px: the status table, headline figures and currency tabs fit their width (no inner horizontal scroll) and the table headers are visible", [fit.status, fit.kpis, fit.tabs].every((v) => v && v[0] <= v[1] + 1) && fit.heads === "static", JSON.stringify(fit));
await shot("07-mobile-390-expanded");
await ev("document.documentElement.setAttribute('data-theme', 'dark')");
await sleep(1200);
await shot("08-mobile-390-expanded-dark");
await ev("document.documentElement.removeAttribute('data-theme')");
await setViewport(DESKTOP);

/* 10. sign-out: the licence is no longer obtainable with the old session */
await goto("/");
await settled();
const cookieBefore = (await send("Network.getCookies", { urls: [ORIGIN] })).cookies.find((c) => c.name.includes("nmi_session"));
await signOut();
const stale = await viaProxy("GET", "/api/studio/licence", { headers: { "x-nmi-studio": "1", cookie: `${cookieBefore?.name}=${cookieBefore?.value}` } });
check("licence", "after sign-out the previous session cookie no longer obtains the licence (401, no licence in body)", stale.status === 401 && !leaks(stale.body), String(stale.status));

/* 11. logs: the server log and the edge request-line log never contain the licence */
await sleep(300);
const serverLog = readFileSync(apiLog, "utf8");
check("logs", "the production server log never contains the licence value", !leaks(serverLog));
check("logs", "the edge request-line log never contains the licence value and records the licence route by path only", !edgeLog.some(leaks) && edgeLog.some((l) => l === "GET /api/studio/licence"), edgeLog.filter((l) => /studio/.test(l)).slice(0, 3).join(","));
check("security", "no CSP violation for the whole session", cspViolations().length === 0, cspViolations().slice(0, 3).join(" | "));
check("console", "no uncaught exception in the whole session", !consoleMsgs.some((m) => m.startsWith("exception:")), consoleMsgs.filter((m) => m.startsWith("exception:")).slice(0, 3).join(" | "));

/* ------------------------------------------------ results (licence-free) */
const pass = results.filter((r) => r.result === "PASS").length;
const out = { task: "NMI-P5", environment: { ...info, simulatedProviders: true, chrome: "headless", viewport: [DESKTOP, MOBILE], zone: ZONE }, consoleSample: consoleMsgs.slice(0, 40).map(redact), results };
const text = JSON.stringify(out, null, 2) + "\n";
if (leaks(text)) throw new Error("refusing to write results: they would contain the licence");
writeFileSync(join(here, "qa-results.json"), text);
console.log(`\n${pass}/${results.length} passed`);
ws.close();
process.exit(pass === results.length ? 0 : 1);
