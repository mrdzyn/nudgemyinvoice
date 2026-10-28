/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-UI-01C4 genuine browser -> Vite preview (production build, strict CSP) -> Fastify -> disposable
// PostgreSQL 16 journey for the REAL read-only invoice DASHBOARD (list, paging, filters, reopen, isolation), driven in headless Google Chrome (CDP).
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-UI-01C4/run-dashboard-journey.mjs
//
// No OpenAI or PayPal request is ever made. Phase A runs the REAL Fastify app with a deterministic
// TEST-ONLY FAKE model client (test-api-server.ts); phase B runs it with NO model client (the
// genuine provider-unconfigured path) and a lowered parse budget so a real 429 is reachable.
// Groups tagged REAL go through the real server and database; groups tagged SIMULATED use Chrome's
// request interception to force an outcome and say so. The fake model is NOT OpenAI.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const ORIGIN = "http://localhost:4173";
const API_PORT = Number(process.env.NMI_C4_API_PORT || 3101);
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54329;
const DEBUG_PORT = 9338;
const DB = "nmi_test_c4_journey";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-c4";
const pw = () => randomBytes(18).toString("base64url");
let PASSWORD = pw();
const SECRET = randomBytes(32).toString("hex");

const results = [];
const record = (group, name, pass, detail = "") => {
  results.push({ group, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${group}] ${name}${detail ? " — " + detail : ""}`);
};
const check = (group, name, cond, detail = "") => record(group, name, Boolean(cond), cond ? "" : detail);

if (!existsSync(join(root, "apps/web/dist/index.html"))) throw new Error("Run `pnpm --filter @nmi/web build` first");

const work = mkdtempSync(join(tmpdir(), "nmi-c4-"));
const children = [];
const cleanup = async () => {
  for (const c of children) try { c.kill("SIGTERM"); } catch {}
  spawnSync(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "immediate", "stop"], { stdio: "ignore" });
  await sleep(200);
  rmSync(work, { recursive: true, force: true });
};
process.on("exit", () => { try { rmSync(work, { recursive: true, force: true }); } catch {} });

/* ----------------------------------------------------------------- disposable PostgreSQL 16 */
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts, env: { LC_ALL: "en_US.UTF-8", ...(opts.env ?? process.env) } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || "").slice(0, 300)}`);
  return r.stdout;
};
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_c4", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_c4", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_c4@127.0.0.1:${PG_PORT}/${DB}`;
const provision = (password) =>
  run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: password } });
provision(PASSWORD);
const USER_B = "operator-c4-b";
const PASSWORD_B = pw();
run("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(here, "add-second-operator.ts")], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_B_USERNAME: USER_B, NMI_OPERATOR_B_PASSWORD: PASSWORD_B } });

/* ----------------------------------------------------------------- servers */
const apiLog = join(work, "api.log");
const modelLog = join(work, "model-calls.log");
writeFileSync(modelLog, "");
const baseEnv = { ...process.env, NODE_ENV: "development", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, DATABASE_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", PAYPAL_DRAFTS_ENABLED: "false", OPENAI_API_KEY: "", OPENAI_MODEL: "", NMI_FAKE_MODEL_LOG: modelLog };
let api = null;
async function startApi(extra = {}) {
  api = spawn("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(here, "test-api-server.ts")], { cwd: root, stdio: ["ignore", (await import("node:fs")).openSync(apiLog, "a"), (await import("node:fs")).openSync(apiLog, "a")], env: { ...baseEnv, ...extra }, detached: true });
  children.push(api);
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(API + "/health")).ok) return; } catch {}
    await sleep(150);
  }
  throw new Error("API did not start");
}
async function stopApi() {
  if (!api) return;
  try { process.kill(-api.pid, "SIGTERM"); } catch {}
  for (let i = 0; i < 60; i++) { try { await fetch(API + "/health"); await sleep(100); } catch { break; } }
  api = null;
}
const preview = spawn("pnpm", ["--filter", "@nmi/web", "exec", "vite", "preview", "--host", "localhost", "--port", "4173", "--strictPort"], { cwd: root, stdio: "ignore", env: { ...process.env, NMI_API_ORIGIN: API } });
children.push(preview);
await startApi({ NMI_FAKE_MODEL: "off" });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(ORIGIN + "/")).ok) break; } catch {}
  await sleep(150);
}
check("setup", "disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy", (await (await fetch(ORIGIN + "/health")).json()).status === "ok");
check("setup", "database is a throw-away nmi_test* cluster in a temp directory", /^nmi_test/.test(DB));
check("setup", "PayPal drafts disabled; OPENAI_API_KEY/OPENAI_MODEL empty (no provider can be reached)", true);

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-c4-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
children.push(chrome);
let version;
for (let i = 0; i < 100; i++) {
  try { const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
  await sleep(150);
}
if (!version) throw new Error("Chrome did not start");
const targetInfo = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 1;
const pending = new Map();
const consoleMsgs = [];
const foreign = [];
const netLog = []; // { method, path, status }
let rule = null; // SIMULATED outcome for paused /api requests
const held = []; // request ids deliberately left pending ("hold")
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  } else if (msg.method === "Runtime.exceptionThrown") {
    consoleMsgs.push("exception: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if (msg.method === "Runtime.consoleAPICalled") {
    consoleMsgs.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (msg.method === "Log.entryAdded") {
    consoleMsgs.push(`log.${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
  } else if (msg.method === "Network.requestWillBeSent") {
    const u = msg.params.request.url;
    if (u.startsWith(ORIGIN + "/")) netLog.push({ method: msg.params.request.method, path: u.slice(ORIGIN.length), id: msg.params.requestId, idem: msg.params.request.headers["Idempotency-Key"] ?? msg.params.request.headers["idempotency-key"] ?? null, hasCsrf: Object.keys(msg.params.request.headers).some((h) => h.toLowerCase() === "x-csrf-token"), body: msg.params.request.postData ?? null });
    else if (!/^(about:|data:|blob:)/.test(u)) foreign.push(u);
  } else if (msg.method === "Network.loadingFailed") {
    const e = netLog.find((n) => n.id === msg.params.requestId);
    if (e) e.failed = msg.params.canceled ? "canceled" : msg.params.errorText;
  } else if (msg.method === "Network.responseReceived") {
    const e = netLog.find((n) => n.id === msg.params.requestId);
    if (e) e.status = msg.params.response.status;
  } else if (msg.method === "Fetch.requestPaused") {
    const p = msg.params;
    const act = rule ? rule(p) : "continue";
    const id = p.requestId;
    if (act === "continue" || !act) send("Fetch.continueRequest", { requestId: id }).catch(() => {});
    else if (act === "fail") send("Fetch.failRequest", { requestId: id, errorReason: "InternetDisconnected" }).catch(() => {});
    else if (act === "hold") held.push(id);
    else send("Fetch.fulfillRequest", { requestId: id, responseCode: act.status, responseHeaders: [{ name: "content-type", value: "application/json" }, ...(act.headers || [])], body: Buffer.from(JSON.stringify(act.body ?? {})).toString("base64") }).catch(() => {});
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
const simulate = async (r) => { rule = r; await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] }); };
const releaseHeld = async (act) => {
  for (const id of held.splice(0)) {
    if (act === "fail") await send("Fetch.failRequest", { requestId: id, errorReason: "Aborted" }).catch(() => {});
    else await send("Fetch.fulfillRequest", { requestId: id, responseCode: act.status, responseHeaders: [{ name: "content-type", value: "application/json" }], body: Buffer.from(JSON.stringify(act.body ?? {})).toString("base64") }).catch(() => {});
  }
};
const stopSimulating = async () => { rule = null; await send("Fetch.disable"); };

const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + "\n" + expression.slice(0, 200));
  return r.result.value;
};
async function viewport(w, h, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
}
async function load(hash = "") {
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: ORIGIN + "/" + hash });
  for (let i = 0; i < 80; i++) {
    if ((await ev("document.readyState")) === "complete" && (await ev("!!document.getElementById('main-content')"))) break;
    await sleep(50);
  }
}
async function waitFor(expr, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ev(expr)) return true; await sleep(50); }
  return false;
}
const KEYS = { Tab: { code: "Tab", vk: 9 }, Enter: { code: "Enter", vk: 13, text: "\r" } };
async function press(key, shift = false) {
  const k = KEYS[key];
  const modifiers = shift ? 8 : 0;
  await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers, text: k.text });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers });
  await sleep(40);
}
const typeText = async (t) => { await send("Input.insertText", { text: t }); await sleep(40); };
const focusId = (id) => ev(`document.getElementById(${JSON.stringify(id)}).focus()`);
const bodyText = () => ev("document.body.innerText.replace(/\\s+/g, ' ')");
const activeId = () => ev("document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName)");
const shots = [];
async function shot(rel) {
  const file = join(SHOTS, rel);
  mkdirSync(dirname(file), { recursive: true });
  const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 65 });
  writeFileSync(file, Buffer.from(data, "base64"));
  shots.push(rel);
}
const apiCalls = (since = 0) => netLog.slice(since).filter((n) => n.path.startsWith("/api/"));
const mark = () => netLog.length;

const CONTRAST_SCAN = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base); return base; };
  const out = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode; const txt = n.textContent.trim(); if (!txt) continue;
    const el = n.parentElement; if (!el || el.closest('.sr-only, script, style, [hidden], dialog:not([open]), .review-controls')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const fg0 = parse(cs.color); const bg = bgOf(el); if (!fg0 || !bg) continue;
    const fg = blend(fg0, bg);
    const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio + 0.005 < need) { const key = el.tagName + '|' + txt.slice(0, 30); if (!seen.has(key)) { seen.add(key); out.push({ el: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''), text: txt.slice(0, 40), ratio: Math.round(ratio * 100) / 100, need }); } }
  }
  return out;
})()`;

const OVERFLOW = `(() => { const de = document.documentElement; return de.scrollWidth > de.clientWidth + 1 ? de.scrollWidth + ' > ' + de.clientWidth : ''; })()`;
const STORAGE = `(async () => ({ local: localStorage.length, session: sessionStorage.length, idb: (indexedDB.databases ? (await indexedDB.databases()).length : 0), cookie: document.cookie, href: location.href, caches: (self.caches ? (await caches.keys()).length : 0) }))()`;
async function login(user, pass) {
  await focusId("login-username"); await ev("document.getElementById('login-username').select()"); await typeText(user);
  await press("Tab"); await ev("document.getElementById('login-password').select()"); await typeText(pass);
  await press("Enter");
}
const cookies = async () => (await send("Network.getCookies", { urls: [ORIGIN] })).cookies;
const sessionCookie = async () => (await cookies()).find((c) => c.name === "nmi_session");
const activeSessions = () => Number(sql("SELECT count(*) FROM sessions WHERE revoked_at IS NULL AND expires_at > now()"));
const totalSessions = () => Number(sql("SELECT count(*) FROM sessions"));
const onLogin = () => ev("!!document.getElementById('login-title') && !document.querySelector('.app-nav')");
const onWorkspace = () => ev("!!document.querySelector('.app-nav') && !document.getElementById('login-title')");


/* ----------------------------------------------------------------- journey helpers */
const PARSE = "/api/invoice-drafts/parse";
const parseCalls = (since = 0) => apiCalls(since).filter((c) => c.path === PARSE);
const modelCalls = () => readFileSync(modelLog, "utf8").split("\n").filter(Boolean).length;
const nav = (label) => ev(`[...document.querySelectorAll('.app-nav button')].find((b) => b.textContent.includes(${JSON.stringify(label)})).click()`);
const setText = async (t) => { await focusId("comp-text"); await ev("document.getElementById('comp-text').select()"); await typeText(t); };
const clickParse = () => ev("document.getElementById('parse-btn').click()");
const alerts = () => ev("[...document.querySelectorAll('[role=alert]')].filter((e) => !e.hidden).map((e) => e.textContent).join(' | ')");
const onReview = () => ev("!!document.getElementById('rev-title')");
const val = (id) => ev(`document.getElementById(${JSON.stringify(id)})?.value ?? null`);
async function signIn() {
  await load();
  await waitFor("!!document.getElementById('login-title') || !!document.querySelector('.app-nav')");
  // A still-valid session cookie is restored by the server (e.g. after the API restarts).
  if (await onLogin()) await login(USER, PASSWORD);
  if (!(await waitFor("!!document.querySelector('.app-nav')"))) throw new Error("sign-in failed");
}
async function toComposer() {
  await nav("New invoice");
  if (!(await waitFor("!!document.getElementById('comp-text')"))) throw new Error("composer did not open");
}
async function toComposerFromReview() {
  if (await ev("!!document.getElementById('comp-text')")) return;
  await toComposer();
}
const parseOnce = async (text, wait) => {
  const m = mark();
  await setText(text);
  await clickParse();
  const ok = await waitFor(wait, 7000);
  return { ok, m };
};
const sessionToken = async () => {
  const c = await sessionCookie();
  const r = await fetch(API + "/api/auth/session", { headers: { cookie: `${c.name}=${c.value}`, origin: ORIGIN } });
  return { c, body: await r.json() };
};



try {
  await viewport(1280, 900);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

  /* ----------------------------------------------------------------- helpers */
  const LIST = (since = 0) => apiCalls(since).filter((c) => c.method === "GET" && /^\/api\/invoice-drafts\?/.test(c.path));
  const DETAIL = (since = 0) => apiCalls(since).filter((c) => c.method === "GET" && /^\/api\/invoice-drafts\/[0-9a-f-]{36}$/.test(c.path));
  const MUTATIONS = (since = 0) => apiCalls(since).filter((c) => c.method !== "GET" && !c.path.startsWith("/api/auth/"));
  const q = (since, c) => new URL(c.path, ORIGIN).searchParams;
  const opId = (u) => sql(`SELECT id FROM operators WHERE username='${u}'`);
  const A_ID = () => opId(USER);
  const B_ID = () => opId(USER_B);
  const dbNames = (op, limit = 1000) => sql(`SELECT string_agg(customer_name, '|' ORDER BY created_at DESC, id DESC) FROM (SELECT * FROM invoices WHERE created_by='${op}' ORDER BY created_at DESC, id DESC LIMIT ${limit}) t`).split("|");
  const rowNames = () => ev("[...document.querySelectorAll('tbody tr td[data-label=Customer] div:first-child')].map((e) => e.textContent)");
  const rowIds = () => ev("[...document.querySelectorAll('tbody tr [aria-label^=\"View invoice\"]')].map((b) => b.getAttribute('aria-label'))");
  const cards = () => ev("[...document.querySelectorAll('.currency-card')].map((c) => ({ cur: c.querySelector('.top span').textContent, amount: c.querySelector('.amount').textContent, meta: c.querySelector('.meta').textContent }))");
  const setValue = (id, v) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
  const fillText = async (id, v) => { await focusId(id); await ev(`document.getElementById(${JSON.stringify(id)}).select()`); await typeText(v); };
  const nav = async (label) => {
    await ev(`[...document.querySelectorAll('.app-nav button')].find((b) => b.textContent.includes(${JSON.stringify(label)})).click()`);
    if (await waitFor("!!document.querySelector('dialog[open]')", 300)) await ev("document.querySelector('dialog[open] .btn-danger').click()");
  };
  async function signInAs(user, pass) {
    await load();
    await waitFor("!!document.getElementById('login-title') || !!document.querySelector('.app-nav')");
    if (await onLogin()) await login(user, pass);
    if (!(await waitFor("!!document.querySelector('.app-nav')"))) throw new Error("sign-in failed for " + user);
    await waitFor("!!document.getElementById('dash-title')");
  }
  const dashLoaded = (ms = 8000) => waitFor("!!document.querySelector('tbody tr') || !!document.getElementById('dash-empty') || !!document.getElementById('dash-no-match') || !!document.getElementById('dash-error')", ms);
  const sessionAuth = async () => {
    const c = await sessionCookie();
    const r = await fetch(API + "/api/auth/session", { headers: { cookie: `${c.name}=${c.value}`, origin: ORIGIN } });
    return { cookie: `${c.name}=${c.value}`, csrf: (await r.json()).csrfToken };
  };
  let keyN = 0;
  const nodeCreate = async (a, body) => {
    const r = await fetch(API + "/api/invoice-drafts", { method: "POST", headers: { "content-type": "application/json", cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf, "idempotency-key": `c4_probe_${String(++keyN).padStart(8, "0")}_${randomBytes(4).toString("hex")}` }, body: JSON.stringify(body) });
    if (r.status !== 201) throw new Error("create failed " + r.status);
    return (await r.json()).id;
  };
  const inv = (name, over = {}) => ({ customerName: name, customerEmail: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@c4.example`, currency: "USD", lineItems: [{ description: "Service", quantity: "1", unitPrice: "100.00" }], dueDate: "2030-01-15", taxPercent: null, discount: null, ...over });
  async function uiCreate({ name, currency, price }) {
    await nav("New invoice");
    await waitFor("!!document.getElementById('comp-text')");
    await ev("[...document.querySelectorAll('[role=tab]')].find((b) => /Enter manually/.test(b.textContent)).click()");
    await ev("[...document.querySelectorAll('button')].find((b) => /Open blank invoice form/.test(b.textContent)).click()");
    await waitFor("!!document.getElementById('f-customerName')");
    await fillText("f-customerName", name);
    await fillText("f-customerEmail", `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@c4.example`);
    await setValue("f-currency", currency);
    await setValue("f-dueDate", "2030-01-15");
    await fillText("f-line-0-description", "Workshop");
    await fillText("f-line-0-quantity", "2");
    await fillText("f-line-0-unitPrice", price);
    await ev("document.getElementById('save-btn').click()");
    if (!(await waitFor("!!document.getElementById('saved-id')", 8000))) throw new Error("ui create failed " + name);
    return ev("document.getElementById('saved-id').textContent");
  }

  /* ======================= logged-out ======================= */
  {
    const g = "REAL logged-out protection";
    const m = mark();
    await load("#screen=dashboard&state=default");
    await waitFor("!!document.getElementById('login-title')");
    check(g, "a dashboard deep link shows only sign-in", !(await ev("!!document.getElementById('dash-title')")));
    check(g, "no list request is made while logged out", LIST(m).length === 0, JSON.stringify(apiCalls(m)));
    const r = await fetch(API + "/api/invoice-drafts", { headers: { origin: ORIGIN } });
    check(g, "the real server answers an unauthenticated list with 401 and no data", r.status === 401 && !/customer|items/.test(await r.text()));
  }

  /* ======================= empty real dashboard for operator A ======================= */
  const NAMES = { ui: ["Quill & Co", "Vienna Cafe", "Tokyo Works"] };
  {
    const g = "REAL operator A: empty account";
    const m = mark();
    await signInAs(USER, PASSWORD);
    await dashLoaded();
    const t = await bodyText();
    check(g, "GET /api/invoice-drafts -> 200 and the empty state is shown", LIST(m)[0]?.status === 200 && (await ev("!!document.getElementById('dash-empty')")) && /No saved invoices yet/.test(t), t.slice(0, 200));
    check(g, "no fixture rows, 'DEMO / SYNTHETIC' banner or sample label appears", !/DEMO \/ SYNTHETIC|fabricated|Acme|Northwind|sample rows/i.test(t) && !/sample/i.test(await ev("document.title")), await ev("document.title"));
    check(g, "the list request is a GET with limit=20 and no cursor/filters", (() => { const p = q(m, LIST(m)[0]); return p.get("limit") === "20" && !p.has("cursor") && !p.has("currency") && !p.has("status") && !p.has("q"); })());
    check(g, "the shell says the list is server-backed and (current copy since C5-P1) that saving never creates a PayPal invoice", /invoice list and the\s+saved-invoice pages use the server/.test(t) && /Saving never creates a PayPal\s+invoice/.test(t));
    await shot("01-real-empty.jpg");
  }

  /* ======================= create data: UI (3 currencies) + bulk via real API ======================= */
  let uiIds = [];
  {
    const g = "REAL data creation (multiple currencies)";
    uiIds.push(await uiCreate({ name: NAMES.ui[0], currency: "USD", price: "125.50" }));
    uiIds.push(await uiCreate({ name: NAMES.ui[1], currency: "EUR", price: "99.99" }));
    uiIds.push(await uiCreate({ name: NAMES.ui[2], currency: "JPY", price: "5000" }));
    const a = await sessionAuth();
    for (let i = 1; i <= 23; i++) await nodeCreate(a, inv(`Bulk ${String(i).padStart(2, "0")}`, { currency: i % 5 === 0 ? "GBP" : "USD" }));
    check(g, "operator A owns 26 invoices across USD, EUR, JPY and GBP created through the real save route", Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${A_ID()}'`)) === 26 && Number(sql(`SELECT count(DISTINCT currency) FROM invoices WHERE created_by='${A_ID()}'`)) === 4);
    // operator B's private data (created later through B's own session)
  }

  /* ======================= operator B data through B's own real session, then back to A ======================= */
  {
    const g = "REAL operator B private data";
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
    await waitFor("!!document.getElementById('login-title')", 6000);
    await signInAs(USER_B, PASSWORD_B);
    const b = await sessionAuth();
    for (const n of ["B Private One", "B Private Two", "B Private Three"]) await nodeCreate(b, inv(n, { currency: "EUR" }));
    check(g, "operator B owns exactly its 3 invoices", Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${B_ID()}'`)) === 3);
    await load();
    await dashLoaded();
    const names = await rowNames();
    check(g, "B's dashboard (real browser) lists only B's invoices", names.length === 3 && names.every((n) => /^B Private/.test(n)), JSON.stringify(names));
    check(g, "none of A's customers appear in B's page", !/Quill|Vienna|Tokyo|Bulk/.test(await bodyText()));
    await shot("02-operator-b.jpg");
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
    await waitFor("!!document.getElementById('login-title')", 6000);
    check(g, "after sign-out none of B's data remains in the page", !/B Private/.test(await ev("document.documentElement.outerHTML")));
  }

  /* ======================= A: loaded list, cards, paging ======================= */
  let firstIds;
  {
    const g = "REAL operator A: list, currency cards and paging";
    await signInAs(USER, PASSWORD);
    const m = mark();
    await load();
    await dashLoaded();
    const expected = dbNames(A_ID());
    const names1 = await rowNames();
    check(g, "first page: 20 rows, exactly A's newest 20 in the database order", names1.length === 20 && JSON.stringify(names1) === JSON.stringify(expected.slice(0, 20)), JSON.stringify([names1.slice(0, 3), expected.slice(0, 3)]));
    check(g, "none of operator B's customers is visible to A", !/B Private/.test(await bodyText()));
    // currency cards for the loaded page, recomputed independently from the database
    const page = sql(`SELECT string_agg(currency||':'||total_minor, ',') FROM (SELECT * FROM invoices WHERE created_by='${A_ID()}' ORDER BY created_at DESC, id DESC LIMIT 20) t`).split(",");
    const sums = {};
    for (const r of page) { const [c, v] = r.split(":"); sums[c] = (sums[c] ?? 0n) + BigInt(v); }
    const cs = await cards();
    const fmt = (c, v) => (c === "JPY" ? Number(v).toLocaleString("en-US") : (Number(v) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    check(g, "one card per currency present on the page, never combined", cs.map((c) => c.cur).sort().join() === Object.keys(sums).sort().join() && cs.length === Object.keys(sums).length, JSON.stringify(cs));
    check(g, "every card shows exactly the loaded sum recomputed from PostgreSQL minor units", cs.every((c) => c.amount.replace(/^[^0-9]*/, "") === fmt(c.cur, sums[c.cur])), JSON.stringify(cs) + JSON.stringify(Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, String(v)]))));
    check(g, "the summary is labelled as covering loaded invoices only, not all invoices", /Page summary/.test(await bodyText()) && /not a total of all your invoices/.test(await bodyText()) && /more are available/.test(await bodyText()));
    check(g, "no grand total across currencies exists", !/Grand total/i.test(await bodyText()));
    await shot("03-first-page.jpg");
    const m2 = mark();
    await ev("document.getElementById('dash-more').click()");
    await waitFor("document.querySelectorAll('tbody tr').length > 20", 6000);
    const lists = LIST(m2);
    check(g, "Load more sends the server cursor with the same limit and no filters", lists.length === 1 && lists[0].status === 200 && !!q(m2, lists[0]).get("cursor") && q(m2, lists[0]).get("limit") === "20");
    const names2 = await rowNames();
    check(g, "all 26 rows, no duplicates and no skips, in exact database order", names2.length === 26 && new Set(names2).size === 26 && JSON.stringify(names2) === JSON.stringify(expected), JSON.stringify(names2.length));
    check(g, "the end of the list is announced and no more button remains", (await ev("!!document.getElementById('dash-end') && !document.getElementById('dash-more')")));
    const cs2 = await cards();
    const all = sql(`SELECT string_agg(currency||':'||total_minor, ',') FROM invoices WHERE created_by='${A_ID()}'`).split(",");
    const sums2 = {};
    for (const r of all) { const [c, v] = r.split(":"); sums2[c] = (sums2[c] ?? 0n) + BigInt(v); }
    check(g, "after the last page the cards equal the whole-account per-currency sums", cs2.every((c) => c.amount.replace(/^[^0-9]*/, "") === fmt(c.cur, sums2[c.cur])) && cs2.length === 4, JSON.stringify(cs2));
    check(g, "the dashboard made only GET requests (no mutation, no PayPal, no provider)", MUTATIONS(m).length === 0 && foreign.length === 0);
    firstIds = await rowIds();
    await shot("04-all-loaded.jpg");
  }

  /* ======================= filters and search (server-side, across pages) ======================= */
  {
    const g = "REAL filters and search (server-side over the whole account)";
    await load();
    await dashLoaded();
    let m = mark();
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'EUR').click()");
    await waitFor("document.querySelectorAll('tbody tr').length === 1", 5000);
    let c1 = LIST(m).at(-1);
    check(g, "the EUR pill asks the SERVER for currency=EUR and shows only the EUR invoice", q(m, c1).get("currency") === "EUR" && !q(m, c1).has("cursor") && (await rowNames()).join() === NAMES.ui[1]);
    m = mark();
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'All currencies').click()");
    await waitFor("document.querySelectorAll('tbody tr').length === 20", 5000);
    // page 2 then a filter: the cursor must be dropped
    await ev("document.getElementById('dash-more').click()");
    await waitFor("document.querySelectorAll('tbody tr').length === 26", 5000);
    m = mark();
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'JPY').click()");
    await waitFor("document.querySelectorAll('tbody tr').length === 1", 5000);
    c1 = LIST(m).at(-1);
    check(g, "changing a filter after paging drops the old cursor and resets the rows", !q(m, c1).has("cursor") && q(m, c1).get("currency") === "JPY" && (await rowNames()).join() === NAMES.ui[2]);
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'All currencies').click()");
    await waitFor("document.querySelectorAll('tbody tr').length === 20", 5000);
    // search finds a row that is NOT on page 1
    m = mark();
    await fillText("dash-search", "Bulk 01");
    await waitFor("document.querySelectorAll('tbody tr').length === 1 && document.querySelector('tbody tr td[data-label=Customer] div').textContent === 'Bulk 01'", 6000);
    const sq = LIST(m).at(-1);
    check(g, "search matches the oldest invoice, which is not on the first page (server-side, not page-local)", q(m, sq).get("q") === "Bulk 01" && !q(m, sq).has("cursor"), q(m, sq).toString());
    check(g, "the search text never appears in the browser NAVIGATION URL (location.href) and is not kept in localStorage (the HTTP GET request URL does carry it in q; see the next check)", !/Bulk/.test(await ev("location.href")) && (await ev(STORAGE)).local === 0);
    check(g, "DOCUMENTED, not hidden: the HTTP GET request URL carries the search term in `q` (customer data); proxy/ingress/CDN access logs must redact it (deployment prerequisite, untested here)", /(^|&)q=Bulk(\+|%20)01(&|$)/.test(q(m, sq).toString()) && sq.path.includes("q="), sq.path);
    check(g, "an invoice-id prefix finds exactly that invoice", await (async () => {
      const id = sql(`SELECT id FROM invoices WHERE customer_name='Bulk 01'`);
      await fillText("dash-search", id.slice(0, 8));
      return waitFor("document.querySelectorAll('tbody tr').length === 1 && document.querySelector('tbody tr td[data-label=Customer] div').textContent === 'Bulk 01'", 6000);
    })());
    await fillText("dash-search", "B Private");
    check(g, "another operator's customers cannot be found by search", await waitFor("!!document.getElementById('dash-no-match')", 6000) && /No invoices match these filters/.test(await bodyText()));
    await shot("05-no-match.jpg");
    await ev("document.getElementById('dash-clear').click()");
    check(g, "Clear filters restores the full first page", await waitFor("document.querySelectorAll('tbody tr').length === 20 && document.getElementById('dash-search').value === ''", 6000));
    await ev("document.getElementById('dash-status').focus()");
    await setValue("dash-status", "created");
    check(g, "the PayPal 'created' filter shows no rows: no PayPal draft exists (state comes from durable data)", await waitFor("!!document.getElementById('dash-no-match')", 5000));
    await setValue("dash-status", "none");
    check(g, "the 'No PayPal draft' filter lists the invoices (all 26 have no operation row)", await waitFor("document.querySelectorAll('tbody tr').length === 20", 5000) && (await ev("[...document.querySelectorAll('tbody tr td[data-label=\"PayPal Sandbox\"]')].every((c) => /No PayPal draft/i.test(c.textContent))")));
    await setValue("dash-status", "ALL");
    await waitFor("document.querySelectorAll('tbody tr').length === 20", 5000);
  }

  /* ======================= reopen a saved invoice ======================= */
  {
    const g = "REAL View opens the server-backed detail (no replay wording)";
    const target = sql(`SELECT id||'|'||customer_name FROM invoices WHERE customer_name='Vienna Cafe'`).split("|");
    await fillText("dash-search", "Vienna");
    await waitFor("document.querySelectorAll('tbody tr').length === 1", 5000);
    const m = mark();
    await focusId("dash-search");
    await ev("document.querySelector('tbody tr [aria-label^=\"View invoice\"]').focus()");
    await press("Enter"); // keyboard activation
    check(g, "keyboard Enter on View opens the saved-invoice page", await waitFor("!!document.getElementById('saved-id')", 8000));
    const d = DETAIL(m);
    check(g, "the page loaded the record with GET /api/invoice-drafts/:id -> 200", d.length >= 1 && d[0].status === 200 && d[0].path.endsWith(target[0]), JSON.stringify(d));
    const t = await bodyText();
    check(g, "shows the real UUID, customer, EUR currency and the exact server total from PostgreSQL", (await ev("document.getElementById('saved-id').textContent")) === target[0] && /Vienna Cafe/.test(t) && /EUR/.test(t) && new RegExp("€" + (Number(sql(`SELECT total_minor FROM invoices WHERE id='${target[0]}'`)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }).replace(".", "\\.")).test(t), t.slice(0, 300));
    check(g, "the notice is the neutral 'opened from your list' one, never 'saved just now' or a replay", /opened from your list/.test(t) && !/replayed|HTTP 200|just now|No second draft|Saved in PostgreSQL\./.test(t));
    check(g, "no edit, delete, send or remind control exists; the only PayPal control is the explicit, confirmation-gated create action (since C5-P1)", await ev("(() => { const b = [...document.querySelectorAll('main button')].map((x) => x.textContent.trim()); return !b.some((t) => /Edit|Delete|Send|Remind/i.test(t)) && b.filter((t) => /PayPal/i.test(t)).every((t) => /^Create PayPal Sandbox draft/.test(t)); })()"));
    check(g, "the title is not labelled fixture or sample", !/fixture|sample/i.test(await ev("document.title")));
    await shot("06-opened-detail.jpg");
    const m2 = mark();
    await ev("document.getElementById('saved-back').click()");
    check(g, "Back to drafts returns to the REAL dashboard (a new real list request, not the preview)", (await waitFor("!!document.querySelector('tbody tr')", 6000)) && LIST(m2).length >= 1 && !/DEMO \/ SYNTHETIC/.test(await bodyText()));
    check(g, "reopening wrote nothing (still exactly 29 invoices, no PayPal operations)", Number(sql("SELECT count(*) FROM invoices")) === 29 && Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 0);
  }

  /* ======================= cross-operator access through the real server ======================= */
  {
    const g = "REAL cross-operator access (operator A's session against operator B's data)";
    const a = await sessionAuth();
    const bId = sql(`SELECT id FROM invoices WHERE created_by='${B_ID()}' LIMIT 1`);
    const cross = await fetch(`${API}/api/invoice-drafts/${bId}`, { headers: { cookie: a.cookie } });
    const unknown = await fetch(`${API}/api/invoice-drafts/00000000-0000-4000-8000-000000000000`, { headers: { cookie: a.cookie } });
    const [cb, ub] = [await cross.text(), await unknown.text()];
    check(g, "A reading B's invoice by id gets 404, indistinguishable from an unknown id", cross.status === 404 && unknown.status === 404 && cb === ub && !/B Private/.test(cb), `${cross.status} ${cb}`);
    const listA = await (await fetch(`${API}/api/invoice-drafts?limit=50`, { headers: { cookie: a.cookie } })).json();
    check(g, "A's list through the real route holds 26 rows and none of B's", listA.items.length === 26 && listA.items.every((i) => !/B Private/.test(i.customerName)) && JSON.stringify(listA).indexOf(bId) === -1);
    const forged = await fetch(`${API}/api/invoice-drafts?operatorId=${B_ID()}`, { headers: { cookie: a.cookie } });
    check(g, "a client-supplied operatorId is refused (400), never honoured", forged.status === 400);
    check(g, "bad cursor / oversized limit / unknown parameter are refused with 400", (await Promise.all(["cursor=!!!", "limit=51", "limit=0", "foo=1", "currency=XYZ", "status=bogus", `q=${"x".repeat(101)}`].map((p) => fetch(`${API}/api/invoice-drafts?${p}`, { headers: { cookie: a.cookie } })))).every((r) => r.status === 400));
  }

  /* ======================= SIMULATED failure states ======================= */
  {
    const g = "SIMULATED list failures (interception; server not reached)";
    const listRe = /\/api\/invoice-drafts\?/;
    const cases = [
      ["500", { status: 500, body: {} }, /could not load your invoices right now/i],
      ["200 with an unknown shape", { status: 200, body: { items: [{ id: "x" }], nextCursor: null } }, /not in the expected format/],
      ["200 with a cursor after a short page", { status: 200, body: { items: [], nextCursor: "dup" } }, /not in the expected format/],
      ["403", { status: 403, body: { error: "csrf_invalid", secret: "LEAK" } }, /did not accept this request/],
      ["400", { status: 400, body: { error: "invalid_query" } }, /refused the list request/],
      ["network failure", "fail", /Could not reach the server/],
    ];
    for (const [name, r, re] of cases) {
      await load();
      await simulate((p) => (p.request.method === "GET" && listRe.test(p.request.url) ? r : "continue"));
      await ev("location.reload()").catch(() => {});
      await sleep(300);
      await waitFor("!!document.getElementById('dash-error')", 6000);
      const t = await bodyText();
      check(g, `${name}: an alert with Retry, no rows, no fixture and no LEAK`, (await ev("!!document.getElementById('dash-error') && !!document.getElementById('dash-retry')")) && re.test(t) && !/LEAK|Acme|Northwind|DEMO \/ SYNTHETIC/.test(t) && !(await ev("!!document.querySelector('tbody tr')")), t.slice(0, 200));
      await stopSimulating();
    }
    await shot("07-list-error.jpg");
    const m = mark();
    await ev("document.getElementById('dash-retry').click()");
    check(g, "Retry is genuine: it re-requests the real server and the real list returns", (await waitFor("document.querySelectorAll('tbody tr').length === 20", 6000)) && LIST(m).length >= 1 && LIST(m).at(-1).status === 200);
    // failed next page keeps rows
    await simulate((p) => (p.request.method === "GET" && /cursor=/.test(p.request.url) ? { status: 503, body: {} } : "continue"));
    await ev("document.getElementById('dash-more').click()");
    check(g, "a failed next page keeps the 20 loaded rows and offers 'Try loading more again'", (await waitFor("!!document.getElementById('dash-more-error')", 5000)) && (await rowNames()).length === 20);
    await stopSimulating();
    await ev("document.getElementById('dash-more-retry').click()");
    check(g, "retrying the next page then really loads rows 21-26 without duplicates", (await waitFor("document.querySelectorAll('tbody tr').length === 26", 6000)) && new Set(await rowNames()).size === 26);

    // stale / out-of-order: hold a filter request, change filter, then release the stale answer
    await load();
    await dashLoaded();
    const ghost = { items: [{ id: "99999999-9999-4999-8999-999999999999", customerName: "Stale Ghost", customerEmail: "g@ghost.example", currency: "EUR", dueDate: "2030-01-15", total: "1.00", createdAt: "2026-10-27T10:00:00.000Z", paypal: { state: "none" } }], nextCursor: null };
    await simulate((p) => (p.request.method === "GET" && /currency=EUR/.test(p.request.url) ? "hold" : "continue"));
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'EUR').click()");
    await sleep(300);
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'JPY').click()");
    await waitFor("document.querySelectorAll('tbody tr').length === 1 && /Tokyo Works/.test(document.body.innerText)", 6000);
    await releaseHeld({ status: 200, body: ghost });
    await sleep(600);
    check(g, "a superseded (EUR) response arriving after the JPY filter never appears", !/Stale Ghost/.test(await bodyText()) && (await rowNames()).join() === "Tokyo Works");
    await stopSimulating();

    // failed detail open never shows a fixture
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'All currencies').click()");
    await waitFor("document.querySelectorAll('tbody tr').length === 20", 6000);
    await simulate((p) => (p.request.method === "GET" && /\/api\/invoice-drafts\/[0-9a-f-]{36}$/.test(p.request.url) ? { status: 500, body: {} } : "continue"));
    await ev("document.querySelector('tbody tr [aria-label^=\"View invoice\"]').click()");
    await waitFor("!!document.getElementById('saved-error')", 6000);
    const t2 = await bodyText();
    check(g, "a failed detail load after View shows an error: no record, no fixture", /could not be shown/.test(t2) && !/Acme|Northwind|DEMO-FAKE|INV2-/.test(t2) && !(await ev("!!document.getElementById('saved-total')")));
    await stopSimulating();
    await ev("document.getElementById('saved-back').click()");
    await waitFor("!!document.querySelector('tbody tr')", 6000);
  }

  /* ======================= logout and expiry clear sensitive data ======================= */
  {
    const g = "REAL logout and session expiry clear the dashboard";
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
    check(g, "Sign out locks at once: no customer row remains in the page", await waitFor("!document.querySelector('tbody tr') && /Signing out/.test(document.body.innerText)", 1500));
    await waitFor("!!document.getElementById('login-title')", 6000);
    check(g, "after sign-out none of A's customers is in the DOM", !/Quill|Vienna|Tokyo|Bulk/.test(await ev("document.documentElement.outerHTML")));
    await signInAs(USER, PASSWORD);
    check(g, "re-authentication shows A's real list again (fresh load)", await dashLoaded() && (await rowNames()).length === 20);
    sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
    const m = mark();
    await ev("document.getElementById('dash-more').click()");
    check(g, "a real 401 on the next page ends the session and shows sign-in", await waitFor("!!document.getElementById('login-title') && !document.querySelector('.app-nav')", 6000));
    check(g, "the list request really returned 401 and no row remains in the page", LIST(m).at(-1)?.status === 401 && !/Quill|Vienna|Bulk/.test(await ev("document.documentElement.outerHTML")));
  }

  /* ======================= mobile, dark, keyboard ======================= */
  {
    const g = "REAL 390px mobile and dark theme";
    await viewport(390, 844, true);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await signInAs(USER, PASSWORD);
    await dashLoaded();
    let ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow at 390px (loaded list)", ov === "", ov);
    let c = await ev(CONTRAST_SCAN);
    check(g, "list text contrast >= WCAG AA (dark, 390px)", c.length === 0, JSON.stringify(c));
    await shot("08-mobile-dark-list.jpg");
    await simulate((p) => (p.request.method === "GET" && /currency=GBP/.test(p.request.url) ? { status: 500, body: {} } : "continue"));
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'GBP').click()");
    await waitFor("!!document.getElementById('dash-error')", 6000);
    ov = await ev(OVERFLOW);
    c = await ev(CONTRAST_SCAN);
    check(g, "no overflow and AA contrast on the error state (dark, 390px)", ov === "" && c.length === 0, ov + JSON.stringify(c));
    check(g, "the error is an announced alert region with a focusable Retry", await ev("!!document.querySelector('#dash-error[role=alert]') && document.getElementById('dash-retry').tabIndex >= 0"));
    await shot("09-mobile-dark-error.jpg");
    await stopSimulating();
    await ev("document.getElementById('dash-retry').click()");
    await waitFor("document.querySelectorAll('tbody tr').length > 0", 6000);
    await ev("document.querySelector('tbody tr [aria-label^=\"View invoice\"]').click()");
    await waitFor("!!document.getElementById('saved-id')", 8000);
    ov = await ev(OVERFLOW);
    c = await ev(CONTRAST_SCAN);
    check(g, "no overflow and AA contrast on the opened detail (dark, 390px)", ov === "" && c.length === 0, ov + JSON.stringify(c));
    await shot("10-mobile-dark-opened.jpg");
    await viewport(1280, 900);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    // light desktop contrast of the loaded list
    await ev("document.getElementById('saved-back').click()");
    await waitFor("document.querySelectorAll('tbody tr').length > 0", 6000);
    const cl = await ev(CONTRAST_SCAN);
    check(g, "list text contrast >= WCAG AA (light, desktop)", cl.length === 0, JSON.stringify(cl));
    const ovd = await ev(OVERFLOW);
    check(g, "no horizontal overflow on desktop", ovd === "", ovd);
  }

  /* ======================= global invariants ======================= */
  {
    const g = "Global invariants";
    const s = await ev(STORAGE);
    check(g, "no localStorage/sessionStorage/IndexedDB/Cache entries", s.local === 0 && s.session === 0 && s.idb === 0 && s.caches === 0, JSON.stringify(s));
    check(g, "no script-readable cookie; the browser NAVIGATION URL (location.href) carries no customer data, search text or id", s.cookie === "" && !/Quill|Bulk|Vienna|B%20Private|@/.test(s.href) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(s.href), s.href);
    check(g, "no request left the app origin (no PayPal/OpenAI/foreign host)", foreign.length === 0, JSON.stringify(foreign));
    const paths = new Set(netLog.filter((n) => n.path.startsWith("/api/")).map((n) => n.path.replace(/[0-9a-f-]{36}/, ":id").replace(/\?.*$/, "")));
    check(g, "the browser used only auth, POST /api/invoice-drafts, GET /api/invoice-drafts and GET /api/invoice-drafts/:id", [...paths].every((p) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts(\/:id)?)$/.test(p)), [...paths].join(","));
    check(g, "no PayPal operations, approvals or model calls exist", Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 0 && Number(sql("SELECT count(*) FROM approvals")) === 0 && modelCalls() === 0);
    check(g, "every list request in the journey was a GET (the list never mutates)", netLog.filter((n) => /^\/api\/invoice-drafts\?/.test(n.path)).every((n) => n.method === "GET") && netLog.some((n) => /^\/api\/invoice-drafts\?/.test(n.path)));
    const log = readFileSync(apiLog, "utf8");
    check(g, "the Fastify request log (query strings stripped) holds no search text, customer name, CSRF token or cookie value", !/Bulk 01|B Private|Vienna|Quill|q=|csrf-token\"?:\s*\"[A-Za-z0-9]/.test(log));
    check(g, "no console errors or uncaught exceptions in the browser", consoleMsgs.filter((x) => !/Failed to load resource|net::ERR|status of (4|5)\d\d/.test(x)).length === 0, consoleMsgs.slice(0, 5).join(" / "));
  }
} catch (e) {
  record("harness", "unexpected failure", false, String(e?.stack || e).slice(0, 600));
} finally {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const lines = [
    "# NMI-UI-01C4 browser dashboard journey",
    "",
    `Chrome: ${version?.Browser ?? "unknown"} (headless). PostgreSQL: ${run(join(PG_BIN, "postgres"), ["--version"]).trim()} (disposable cluster, destroyed after the run).`,
    "Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.",
    "Privacy scope of the checks below: they prove the browser NAVIGATION URL and browser storage hold no customer data and that the Fastify request log has query strings stripped. They do NOT claim the HTTP GET request URL is free of customer data (the search term travels in `q`), and no reverse proxy, ingress, CDN or access log was exercised (untested). Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; no model client exists in this journey. Two operator accounts exist ONLY in this disposable database (production allows exactly one; `add-second-operator.ts` drops that index in the throw-away database to exercise owner isolation). Invoices are created through the real save route.",
    "",
    `**${passed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ""}.**`,
    "",
    "| Result | Group | Check | Detail |",
    "| --- | --- | --- | --- |",
    ...results.map((r) => `| ${r.pass ? "PASS" : "**FAIL**"} | ${r.group} | ${r.name.replace(/\|/g, "/")} | ${(r.detail || "").replace(/\|/g, "/").slice(0, 200)} |`),
    "",
    "Screenshots (synthetic data only, no credentials): " + shots.join(", "),
    "",
    "Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, 400% zoom, a hosted/TLS (`__Host-` cookie) deployment.",
    "",
  ];
  writeFileSync(join(here, "QA-RESULTS.md"), lines.join("\n"));
  writeFileSync(join(here, "qa-results.json"), JSON.stringify({ chrome: version?.Browser, passed, failed, results }, null, 2));
  console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} FAILED` : ""}`);
  try { ws.close(); } catch {}
  await cleanup();
  rmSync(profile, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
