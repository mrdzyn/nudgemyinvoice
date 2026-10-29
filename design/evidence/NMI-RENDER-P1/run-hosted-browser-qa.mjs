/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-RENDER-P1 offline browser QA of the HOSTED SHAPE: headless Chrome -> local TLS-terminating
// reverse-proxy simulation (self-signed, https://localhost:8443; its request-line log stands in for
// a host's HTTP request log) -> the REAL production server entry (NODE_ENV=production, serves the
// built React app and /api from one origin, connected as the least-privilege runtime role) ->
// disposable PostgreSQL 16. No OpenAI/PayPal configuration exists; no provider can be reached.
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-RENDER-P1/run-hosted-browser-qa.mjs
//
// Chrome runs with --ignore-certificate-errors ONLY because the proxy's certificate is a throw-away
// self-signed one; this is QA tooling, not a statement about real TLS (which is a Render matter).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const PROXY_PORT = 8443;
const ORIGIN = `https://localhost:${PROXY_PORT}`;
const API_PORT = 3112;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54340;
const DEBUG_PORT = 9349;
const DB = "nmi_test_render_p1";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-render";
const PASSWORD = randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const NEEDLE = "Zorblax Industries";
const NEEDLE_EMAIL = "pii.needle@zorblax.example";

const results = [];
const check = (group, name, cond, detail = "") => {
  results.push({ group, name, pass: Boolean(cond), detail: cond ? "" : detail });
  console.log(`${cond ? "PASS" : "FAIL"}  [${group}] ${name}${cond ? "" : " — " + detail}`);
};
if (!existsSync(join(root, "apps/web/dist/index.html"))) throw new Error("Run `pnpm --filter @nmi/web build` first");

const work = mkdtempSync(join(tmpdir(), "nmi-render-p1-"));
const children = [];
const cleanup = () => {
  for (const c of children) try { process.kill(-c.pid, "SIGTERM"); } catch { try { c.kill("SIGTERM"); } catch {} }
  spawnSync(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "immediate", "stop"], { stdio: "ignore" });
  rmSync(work, { recursive: true, force: true });
};
process.on("exit", cleanup);

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || "").slice(0, 300)}`);
  return r.stdout;
};
/* ------------------------------------------------ disposable PostgreSQL 16, owner + runtime role */
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_owner", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psql = (db, args) => run(join(PG_BIN, "psql"), ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_owner", "-d", db, "-X", "-v", "ON_ERROR_STOP=1", ...args]);
psql("postgres", ["-c", `CREATE DATABASE ${DB}`]);
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) psql(DB, ["-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
psql(DB, ["-q", "-c", "CREATE ROLE nmi_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"]);
psql(DB, ["-q", "-f", join(root, "packages/db/ops/runtime-role.sql")]);
const OWNER_URL = `postgres://nmi_owner@127.0.0.1:${PG_PORT}/${DB}`;
const RUNTIME_URL = `postgres://nmi_runtime@127.0.0.1:${PG_PORT}/${DB}`;
run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL: OWNER_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: PASSWORD } });
const schemaBefore = psql(DB, ["-tA", "-c", "SELECT md5(string_agg(table_name||column_name||data_type, ',' ORDER BY table_name, column_name)) FROM information_schema.columns WHERE table_schema='public'"]).trim();

/* ------------------------------------------------ the production server entry (runtime role) */
const apiLog = join(work, "api.log");
const api = spawn("pnpm", ["--filter", "@nmi/api", "start"], {
  cwd: root, detached: true, stdio: ["ignore", (await import("node:fs")).openSync(apiLog, "a"), (await import("node:fs")).openSync(apiLog, "a")],
  env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, TRUST_PROXY: "1", DATABASE_URL: RUNTIME_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", PAYPAL_DRAFTS_ENABLED: "false" },
});
children.push(api);
for (let i = 0; i < 300; i++) { try { if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) break; } catch {} await sleep(150); }

/* ------------------------------------------------ TLS-terminating proxy simulation + request log */
run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(work, "k.pem"), "-out", join(work, "c.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "pipe" });
const edgeLog = [];
const proxy = https.createServer({ key: readFileSync(join(work, "k.pem")), cert: readFileSync(join(work, "c.pem")) }, (creq, cres) => {
  edgeLog.push(`${creq.method} ${creq.url}`); // exactly what a host's HTTP request log records
  const up = http.request({ host: "127.0.0.1", port: API_PORT, method: creq.method, path: creq.url, headers: { ...creq.headers, "x-forwarded-for": [creq.headers["x-forwarded-for"], creq.socket.remoteAddress].filter(Boolean).join(", "), "x-forwarded-proto": "https" } }, (ures) => { cres.writeHead(ures.statusCode, ures.headers); ures.pipe(cres); });
  up.on("error", () => { cres.statusCode = 502; cres.end(); });
  creq.pipe(up);
});
await new Promise((r) => proxy.listen(PROXY_PORT, "127.0.0.1", r));
const viaProxy = (method, path, { headers = {}, body } = {}) => new Promise((resolveReq, reject) => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const req = https.request({ host: "127.0.0.1", port: PROXY_PORT, method, path, rejectUnauthorized: false, headers: { ...(payload ? { "content-type": "application/json" } : {}), ...headers } }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolveReq({ status: res.statusCode, headers: res.headers, body: b })); });
  req.on("error", reject); req.end(payload);
});

// Seed (harness, a separate session): two synthetic invoices through the real save route.
const login = await viaProxy("POST", "/api/auth/login", { headers: { origin: ORIGIN }, body: { username: USER, password: PASSWORD } });
const seedCookie = login.headers["set-cookie"][0].split(";")[0];
const seedCsrf = JSON.parse(login.body).csrfToken;
const seed = async (name, email, n) => (await viaProxy("POST", "/api/invoice-drafts", { headers: { origin: ORIGIN, cookie: seedCookie, "x-csrf-token": seedCsrf, "idempotency-key": `render-p1-seed-${n}-0000` }, body: { customerName: name, customerEmail: email, currency: "USD", lineItems: [{ description: "Synthetic work", quantity: "1", unitPrice: "10.00" }], dueDate: "2030-12-01", taxPercent: null, discount: null } })).status;
check("setup", "production server entry (runtime role) reachable only through the HTTPS proxy; two synthetic invoices saved via the real route", (await seed(NEEDLE, NEEDLE_EMAIL, 1)) === 201 && (await seed("Other Customer", "other@example.com", 2)) === 201);
edgeLog.length = 0;

/* ------------------------------------------------ headless Chrome over CDP */
const profile = mkdtempSync(join(tmpdir(), "nmi-qa-render-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--ignore-certificate-errors", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore", detached: true });
children.push(chrome);
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break; } catch {} await sleep(150); }
const targetInfo = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1; const pending = new Map(); const consoleMsgs = []; const foreign = []; const requests = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
  else if (msg.method === "Runtime.exceptionThrown") consoleMsgs.push("exception: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  else if (msg.method === "Runtime.consoleAPICalled") consoleMsgs.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Log.entryAdded") consoleMsgs.push(`log.${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
  else if (msg.method === "Network.requestWillBeSent") { const u = msg.params.request.url; if (u.startsWith(ORIGIN + "/")) requests.push({ method: msg.params.request.method, path: u.slice(ORIGIN.length) }); else if (!/^(about:|data:|blob:)/.test(u)) foreign.push(u); }
  else if (msg.method === "Network.responseReceived") { const r = msg.params.response; const e = [...requests].reverse().find((x) => ORIGIN + x.path === r.url && !x.status); if (e) { e.status = r.status; e.headers = r.headers; } }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(60); } return false; };
const press = async (key, code, vk, text) => { await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await sleep(40); };
const setValue = async (id, v) => { await ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.focus(); e.select(); })()`); if (v) await send("Input.insertText", { text: v }); else await press("Backspace", "Backspace", 8); await sleep(60); };
const names = () => ev("[...document.querySelectorAll('.nmi-grid .ag-row')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim())");
mkdirSync(SHOTS, { recursive: true });
const shot = async (n) => writeFileSync(join(SHOTS, n), Buffer.from((await send("Page.captureScreenshot", { format: "jpeg", quality: 65 })).data, "base64"));

// 1. page + deep link through one origin
await send("Page.navigate", { url: ORIGIN + "/" });
check("single-origin", "the built React app loads over HTTPS from Fastify (sign-in form present)", await waitFor("!!document.getElementById('login-title')"));
const hdr = (p) => requests.find((r) => r.path === p)?.headers ?? {};
const rootHeaders = Object.fromEntries(Object.entries(hdr("/")).map(([k, v]) => [k.toLowerCase(), v]));
check("single-origin", "the page carries the header CSP incl. frame-ancestors 'none', HSTS and nosniff", /frame-ancestors 'none'/.test(rootHeaders["content-security-policy"] ?? "") && /max-age=/.test(rootHeaders["strict-transport-security"] ?? "") && rootHeaders["x-content-type-options"] === "nosniff", JSON.stringify(rootHeaders));
const missing = await ev(`fetch('/assets/does-not-exist.js').then(async (r) => [r.status, r.headers.get('content-type'), (await r.text()).slice(0, 40)])`);
check("single-origin", "a missing asset is a 404 JSON, never the SPA shell", missing[0] === 404 && /json/.test(missing[1]) && !/<html/i.test(missing[2]), JSON.stringify(missing));
const healthJson = await ev(`fetch('/health').then(async (r) => [r.status, r.headers.get('content-type'), await r.text()])`);
check("single-origin", "/health is JSON through the same origin", healthJson[0] === 200 && /json/.test(healthJson[1]) && JSON.parse(healthJson[2]).status === "ok", JSON.stringify(healthJson));
await send("Page.navigate", { url: ORIGIN + "/some/deep/link" });
check("single-origin", "an SPA deep link reload serves the app shell", await waitFor("!!document.getElementById('login-title')"));
await shot("01-hosted-signin.jpg");

// 2. sign in through the real UI
await setValue("login-username", USER);
await ev("document.getElementById('login-password').focus()");
await send("Input.insertText", { text: PASSWORD });
await press("Enter", "Enter", 13, "\r");
check("session", "sign-in through the UI over HTTPS reaches the workspace", await waitFor("!!document.querySelector('.app-nav') && !document.getElementById('login-title')"));
const ck = (await send("Network.getCookies", { urls: [ORIGIN] })).cookies.find((c) => c.name === "__Host-nmi_session");
check("session", "Chrome stored __Host-nmi_session as Secure, HttpOnly, SameSite=Lax, Path=/ (no Domain attribute)", ck && ck.secure && ck.httpOnly && ck.sameSite === "Lax" && ck.path === "/" && !ck.domain.startsWith("."), JSON.stringify(ck));
check("session", "the cookie value is not readable by page script", !(await ev("document.cookie")).includes("nmi_session"));

// 3. dashboard + search through the real UI
check("dashboard", "the owner-scoped dashboard lists both invoices", await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 2"));
await shot("02-hosted-dashboard.jpg");
const before = edgeLog.length;
await setValue("dash-search", NEEDLE);
check("search", "typing a customer name filters on the server to exactly one row", (await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 1")) && /Zorblax/.test((await names()).join()));
await setValue("dash-search", NEEDLE_EMAIL);
check("search", "searching by e-mail also finds the row", (await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 1")) && /Zorblax/.test((await names()).join()));
await setValue("dash-search", "zzz-no-such");
check("search", "a search with no match shows the no-match state", await waitFor("!!document.getElementById('dash-no-match')"));
await shot("03-hosted-search-nomatch.jpg");
await setValue("dash-search", "");
check("search", "clearing the search restores both rows", await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 2"));
const searchLines = edgeLog.slice(before);
check("privacy", "every request line the proxy (host request log) saw for searching was the fixed 'POST /api/invoice-drafts/search'", searchLines.length >= 3 && searchLines.every((l) => l === "POST /api/invoice-drafts/search"), JSON.stringify(searchLines));
const allEdge = edgeLog.join("\n");
check("privacy", "no customer name, e-mail, fragment or ?q= appears anywhere in the whole proxy request log", !/zorblax|pii\.needle|zzz-no-such|[?&]q=/i.test(allEdge), allEdge);
check("privacy", "the browser navigation URL and storage hold no search text", await ev(`!/zorblax|zzz/i.test(location.href + JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)))`));
const apiLogText = readFileSync(apiLog, "utf8");
check("privacy", "the server process output holds no search text or e-mail", !/zorblax|pii\.needle|zzz-no-such/i.test(apiLogText));
check("privacy", "negative control: the legacy GET ?q= WOULD be visible to the proxy log, and is refused", await (async () => { const r = await viaProxy("GET", "/api/invoice-drafts?q=" + encodeURIComponent(NEEDLE), { headers: { cookie: seedCookie } }); const seen = edgeLog.at(-1); edgeLog.pop(); return r.status === 400 && JSON.parse(r.body).error === "search_requires_post" && seen.includes("Zorblax"); })());

// 4. providers disabled
check("providers", "no browser request left the one origin (no OpenAI/PayPal/CDN host)", foreign.length === 0, foreign.join(","));
check("providers", "the console shows no CSP violation or script error on the hosted build", consoleMsgs.filter((m) => /Content Security Policy|CSP|exception/i.test(m)).length === 0, consoleMsgs.join(" | "));

// 5. sign out
await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
check("session", "Sign out returns to the sign-in form", await waitFor("!!document.getElementById('login-title')"));
check("session", "after sign out the cookie is gone and the old server session is revoked", !(await send("Network.getCookies", { urls: [ORIGIN] })).cookies.some((c) => c.name === "__Host-nmi_session") && Number(psql(DB, ["-tA", "-c", "SELECT count(*) FROM sessions WHERE revoked_at IS NOT NULL"]).trim()) >= 1);
const afterLogout = await viaProxy("POST", "/api/invoice-drafts/search", { headers: { origin: ORIGIN }, body: {} });
check("session", "an unauthenticated search is 401", afterLogout.status === 401);

const schemaAfter = psql(DB, ["-tA", "-c", "SELECT md5(string_agg(table_name||column_name||data_type, ',' ORDER BY table_name, column_name)) FROM information_schema.columns WHERE table_schema='public'"]).trim();
check("database", "the schema is unchanged by running the app as the runtime role", schemaBefore === schemaAfter);
const bad = psql(DB, ["-tA", "-c", "SELECT count(*) FROM audit_log WHERE outcome='failure' AND action <> 'invoice.parse'"]).trim();
check("database", "no unexpected audit failures", Number(bad) === 0, bad);

const failed = results.filter((r) => !r.pass);
const out = { generatedBy: "design/evidence/NMI-RENDER-P1/run-hosted-browser-qa.mjs", passed: results.length - failed.length, total: results.length, results };
writeFileSync(join(here, "qa-results.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\n${out.passed}/${out.total} checks passed`);
ws.close(); proxy.close();
process.exit(failed.length ? 1 : 0);
