/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-AG1 genuine browser -> Vite preview (production build, strict CSP) -> Fastify -> disposable
// PostgreSQL 16 journey for the REAL invoice dashboard rendered with AG Grid Community (structure, sort, resize, keyboard, theming, responsiveness), driven in headless Google Chrome (CDP).
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-AG1/run-ag-grid-journey.mjs
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
const API_PORT = Number(process.env.NMI_AG1_API_PORT || 3102);
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54330;
const DEBUG_PORT = 9339;
const DB = "nmi_test_ag1_journey";
const SHOTS = join(here, "screenshots");
const BUILD = {};
const PERF = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-ag1";
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
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_ag1", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_ag1", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_ag1@127.0.0.1:${PG_PORT}/${DB}`;
const provision = (password) =>
  run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: password } });
provision(PASSWORD);
const USER_B = "operator-ag1-b";
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

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-ag1-"));
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
const KEYS = { Tab: { code: "Tab", vk: 9 }, Enter: { code: "Enter", vk: 13, text: "\r" }, " ": { code: "Space", vk: 32, text: " " }, ArrowLeft: { code: "ArrowLeft", vk: 37 }, ArrowUp: { code: "ArrowUp", vk: 38 }, ArrowRight: { code: "ArrowRight", vk: 39 }, ArrowDown: { code: "ArrowDown", vk: 40 }, Home: { code: "Home", vk: 36 }, End: { code: "End", vk: 35 } };
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
  const rowNames = () => ev("[...document.querySelectorAll('.nmi-grid .ag-row [col-id=customer] .cell-main')].map((e) => e.textContent)");
  const rowIds = () => ev("[...document.querySelectorAll('.nmi-grid .ag-row [aria-label^=\"View invoice\"]')].map((b) => b.getAttribute('aria-label'))");
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
  const dashLoaded = (ms = 8000) => waitFor("!!document.querySelector('.nmi-grid .ag-row') || !!document.getElementById('dash-empty') || !!document.getElementById('dash-no-match') || !!document.getElementById('dash-error')", ms);
  const sessionAuth = async () => {
    const c = await sessionCookie();
    const r = await fetch(API + "/api/auth/session", { headers: { cookie: `${c.name}=${c.value}`, origin: ORIGIN } });
    return { cookie: `${c.name}=${c.value}`, csrf: (await r.json()).csrfToken };
  };
  let keyN = 0;
  const nodeCreate = async (a, body) => {
    const r = await fetch(API + "/api/invoice-drafts", { method: "POST", headers: { "content-type": "application/json", cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf, "idempotency-key": `ag1_probe_${String(++keyN).padStart(8, "0")}_${randomBytes(4).toString("hex")}` }, body: JSON.stringify(body) });
    if (r.status !== 201) throw new Error("create failed " + r.status);
    return (await r.json()).id;
  };
  const inv = (name, over = {}) => ({ customerName: name, customerEmail: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@ag1.example`, currency: "USD", lineItems: [{ description: "Service", quantity: "1", unitPrice: "100.00" }], dueDate: "2030-01-15", taxPercent: null, discount: null, ...over });
  async function uiCreate({ name, currency, price }) {
    await nav("New invoice");
    await waitFor("!!document.getElementById('comp-text')");
    await ev("[...document.querySelectorAll('[role=tab]')].find((b) => /Enter manually/.test(b.textContent)).click()");
    await ev("[...document.querySelectorAll('button')].find((b) => /Open blank invoice form/.test(b.textContent)).click()");
    await waitFor("!!document.getElementById('f-customerName')");
    await fillText("f-customerName", name);
    await fillText("f-customerEmail", `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@ag1.example`);
    await setValue("f-currency", currency);
    await setValue("f-dueDate", "2030-01-15");
    await fillText("f-line-0-description", "Workshop");
    await fillText("f-line-0-quantity", "2");
    await fillText("f-line-0-unitPrice", price);
    await ev("document.getElementById('save-btn').click()");
    if (!(await waitFor("!!document.getElementById('saved-id')", 8000))) throw new Error("ui create failed " + name);
    return ev("document.getElementById('saved-id').textContent");
  }

  /* ======================= seed (operator A, through the real API) ======================= */
  await signInAs(USER, PASSWORD);
  const a = await sessionAuth();
  const SEED = [];
  for (let i = 1; i <= 26; i++) {
    const currency = i % 5 === 0 ? "EUR" : i % 7 === 0 ? "JPY" : i % 11 === 0 ? "GBP" : "USD";
    const price = i === 3 || i === 4 ? "50.00" : currency === "JPY" ? String(1000 + ((i * 137) % 900)) : (((i * 37) % 97) + 3 + (i % 2) * 0.5).toFixed(2);
    SEED.push({ name: "Grid " + String(i).padStart(2, "0"), currency, price });
    await nodeCreate(a, inv("Grid " + String(i).padStart(2, "0"), { currency, lineItems: [{ description: "Service", quantity: "1", unitPrice: price }] }));
    await sleep(15);
  }
  const dbRows = () => sql(`SELECT string_agg(id||'~'||customer_name||'~'||currency||'~'||total_minor||'~'||created_at::text||'~'||due_date::text, '|' ORDER BY created_at DESC, id DESC) FROM invoices WHERE created_by='${A_ID()}'`).split("|").map((r) => { const [id, name, currency, minor, created, due] = r.split("~"); return { id, name, currency, minor: BigInt(minor), created, due }; });
  const gridRows = () => ev(`[...document.querySelectorAll('.nmi-grid .ag-row')].map((r) => ({ id: r.getAttribute('row-id'), name: r.querySelector('[col-id=customer] .cell-main')?.textContent, total: r.querySelector('[col-id=total]')?.textContent, status: r.querySelector('[col-id=status]')?.textContent }))`);
  const names = async () => (await gridRows()).map((r) => r.name);
  const hdr = (col) => `document.querySelector('.nmi-grid .ag-header-cell[col-id=${col}]')`;
  const clickHeader = (col) => ev(`${hdr(col)}.querySelector('.ag-header-cell-label').click()`);
  const sortOf = (col) => ev(`${hdr(col)}.getAttribute('aria-sort')`);
  const stable = (rows, cmp, dir) => rows.map((r, i) => [r, i]).sort(([x, i], [y, j]) => dir * cmp(x, y) || i - j).map(([r]) => r);
  const cmpText = (x, y) => x.name.localeCompare(y.name, "en", { sensitivity: "base" });
  const cmpTotal = (x, y) => (x.currency !== y.currency ? (x.currency < y.currency ? -1 : 1) : x.minor < y.minor ? -1 : x.minor > y.minor ? 1 : 0);
  const cmpTime = (k) => (x, y) => Date.parse(x[k]) - Date.parse(y[k]);

  /* ======================= genuine AG Grid structure ======================= */
  let firstPage;
  {
    const g = "AG Grid Community: structure and licensing";
    const m = mark();
    await load();
    await dashLoaded();
    const all = dbRows();
    firstPage = all.slice(0, 20);
    const rows = await gridRows();
    check(g, "the invoice list is a real AG Grid (ag-root-wrapper, grid role) and the native <table> is gone", await ev("!!document.querySelector('.nmi-grid .ag-root-wrapper') && !!document.querySelector('.nmi-grid [role=treegrid], .nmi-grid [role=grid]') && !document.querySelector('table')"));
    check(g, "the grid lists exactly the 20 newest invoices, identified by their invoice UUID row ids, in server order", rows.length === 20 && JSON.stringify(rows.map((r) => r.id)) === JSON.stringify(firstPage.map((r) => r.id)), JSON.stringify([rows.slice(0, 2), firstPage.slice(0, 2).map((r) => r.id)]));
    check(g, "all 20 loaded rows are present in the DOM (row virtualisation off), each with a labelled View button", (await ev("document.querySelectorAll('.nmi-grid .ag-row [aria-label^=\"View invoice\"]').length")) === 20);
    const headerList = await ev("[...document.querySelectorAll('.nmi-grid .ag-header-cell')].map((h) => h.getAttribute('col-id') + ':' + h.querySelector('.ag-header-cell-text').textContent.trim())");
    check(g, "the six approved columns are present with their headers", JSON.stringify(headerList) === JSON.stringify(["invoice:Invoice", "customer:Customer", "due:Due", "total:Total", "status:PayPal Sandbox", "actions:Actions"]), JSON.stringify(headerList));
    check(g, "totals are formatted exactly in the invoice currency and never summed across currencies", rows.every((r, i) => { const d = firstPage[i]; const want = d.currency === "JPY" ? Number(d.minor).toLocaleString("en-US") : (Number(d.minor) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return r.total.includes(want) && r.total.includes(d.currency); }), JSON.stringify(rows.slice(0, 3)));
    check(g, "every row shows the server's PayPal Sandbox status (all 26 have no operation row -> 'No PayPal draft')", rows.every((r) => /No PayPal draft/.test(r.status)));
    const warn = consoleMsgs.filter((x) => /AG Grid|ag-grid/i.test(x));
    check(g, "no AG Grid console warning or error (module/license/theme)", warn.length === 0, warn.slice(0, 3).join(" / ").slice(0, 400));
    const csp = consoleMsgs.filter((x) => /Content Security Policy|Refused to (apply|load|execute|connect)/i.test(x));
    check(g, "no Content-Security-Policy violation under the strict production CSP", csp.length === 0, csp.slice(0, 3).join(" / "));
    check(g, "no injected <style> element and no inline <style> in the page (style-src 'self' stays unweakened)", (await ev("document.querySelectorAll('style').length")) === 0);
    check(g, "no AG Grid license watermark or Enterprise/Studio text anywhere", !(await ev("!!document.querySelector('.ag-watermark, [class*=watermark]')")) && !/Enterprise|AG Studio|license key|evaluation/i.test(await bodyText()));
    check(g, "the grid is wrapped in a named group and the list is announced (result count)", (await ev("document.querySelector('.nmi-grid').getAttribute('aria-label')")) === "Saved invoices, newest first" && /20 invoices loaded, more available/.test(await ev("document.querySelector('[data-testid=result-count]').textContent")));
    check(g, "visible copy says column sorting covers only the loaded invoices and the filters cover all saved invoices, and the grid is described by it", /Sorting a column reorders only the 20 invoices loaded so far\. Search and the currency and PayPal status filters look through all your saved invoices\./.test(await ev("document.getElementById('dash-sort-note').textContent")) && (await ev("document.querySelector('.nmi-grid').getAttribute('aria-describedby')")) === "dash-sort-note" && (await ev("(() => { const r = document.getElementById('dash-sort-note').getBoundingClientRect(); return r.width > 0 && r.height > 0; })()")));
    check(g, "loading the page made only GET list requests (no mutation, no foreign host)", apiCalls(m).every((c) => c.method === "GET") && foreign.length === 0);
    await shot("01-desktop-light.jpg");
  }

  /* ======================= sorting (loaded rows only) ======================= */
  {
    const g = "Sorting: client-side, loaded rows only, exact money";
    const cardsBefore = JSON.stringify(await cards());
    const m = mark();
    await clickHeader("customer");
    check(g, "Customer ascending: header exposes aria-sort and the rows are reordered", (await sortOf("customer")) === "ascending" && JSON.stringify(await names()) === JSON.stringify(stable(firstPage, cmpText, 1).map((r) => r.name)), JSON.stringify((await names()).slice(0, 4)));
    await clickHeader("customer");
    check(g, "Customer descending: exact reverse (stable ties)", (await sortOf("customer")) === "descending" && JSON.stringify(await names()) === JSON.stringify(stable(firstPage, cmpText, -1).map((r) => r.name)));
    await clickHeader("total");
    const t1 = await names();
    check(g, "Total ascending: currency code first, then the EXACT minor-unit amount (never a cross-currency magnitude), ties keep server order", (await sortOf("total")) === "ascending" && JSON.stringify(t1) === JSON.stringify(stable(firstPage, cmpTotal, 1).map((r) => r.name)), JSON.stringify(t1.slice(0, 6)));
    await clickHeader("total");
    check(g, "Total descending matches the independent BigInt expectation", JSON.stringify(await names()) === JSON.stringify(stable(firstPage, cmpTotal, -1).map((r) => r.name)));
    await clickHeader("due");
    check(g, "Due ascending (all equal dates -> server order is kept, stable)", (await sortOf("due")) === "ascending" && JSON.stringify(await names()) === JSON.stringify(stable(firstPage, (x, y) => (x.due < y.due ? -1 : x.due > y.due ? 1 : 0), 1).map((r) => r.name)));
    await clickHeader("invoice");
    check(g, "Invoice sorts by the saved instant (oldest first), single-column sort replaces the previous one", (await sortOf("invoice")) === "ascending" && [null, "none"].includes(await sortOf("due")) && JSON.stringify(await names()) === JSON.stringify(stable(firstPage, cmpTime("created"), 1).map((r) => r.name)), JSON.stringify((await names()).slice(0, 3)));
    await clickHeader("status");
    check(g, "PayPal Sandbox status sorts by its label (all equal -> server order, stable)", (await sortOf("status")) === "ascending" && JSON.stringify(await names()) === JSON.stringify(firstPage.map((r) => r.name)));
    check(g, "Actions is not sortable", (await sortOf("actions")) === null);
    check(g, "sorting issued NO request at all (client-side over the loaded rows)", apiCalls(m).length === 0, JSON.stringify(apiCalls(m)));
    check(g, "the currency cards (loaded rows, per currency) are identical before and after sorting", JSON.stringify(await cards()) === cardsBefore);
    await clickHeader("customer"); // ascending, for the screenshot
    await shot("02-sorted.jpg");
  }

  /* ======================= keyboard sort + resize ======================= */
  {
    const g = "Resizable columns and keyboard header";
    const m = mark();
    await ev(`${hdr("due")}.focus()`);
    check(g, "a column header can take keyboard focus", (await ev("document.activeElement.getAttribute('col-id')")) === "due");
    await press("Enter");
    check(g, "Enter on a focused header sorts that column", (await sortOf("due")) === "ascending");
    const before = await ev(`${hdr("customer")}.getBoundingClientRect().width`);
    const r = await ev(`(() => { const e = ${hdr("customer")}.querySelector('.ag-header-cell-resize'); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
    for (let dx = 10; dx <= 60; dx += 10) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x + dx, y: r.y, button: "left" });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x + 60, y: r.y, button: "left", clickCount: 1 });
    await sleep(150);
    const after = await ev(`${hdr("customer")}.getBoundingClientRect().width`);
    check(g, "dragging the Customer resize handle +60px widens that column", after - before > 40 && after - before < 80, `${before} -> ${after}`);
    check(g, "resizing issued NO request and did not change the cards", apiCalls(m).length === 0);
    check(g, "the Actions column is not resizable", (await ev(`(() => { const e = ${hdr("actions")}.querySelector('.ag-header-cell-resize'); return !e || e.classList.contains('ag-hidden') || getComputedStyle(e).display === 'none'; })()`)));
  }

  /* ======================= keyboard: AG Grid cell navigation ======================= */
  {
    const g = "Keyboard: arrow-key grid navigation (supported AG Grid hooks)";
    const where = () => ev("(() => { const e = document.activeElement; const row = e.closest('.ag-row'); return { id: e.id, col: e.getAttribute('col-id'), kind: e.classList.contains('ag-header-cell') ? 'header' : e.classList.contains('ag-cell') ? 'cell' : e.tagName.toLowerCase(), rowIndex: row ? Number(row.getAttribute('row-index')) : null, rowId: row ? row.getAttribute('row-id') : null, inGrid: !!e.closest('.nmi-grid') }; })()");
    await ev("document.getElementById('dash-status').focus()");
    await press("Tab");
    let w = await where();
    check(g, "Tab from the filters enters the grid on its first column header (one tab stop)", w.kind === "header" && w.col === "invoice" && w.inGrid, JSON.stringify(w));
    await press("ArrowRight");
    check(g, "ArrowRight moves to the next header and ArrowLeft back", (await where()).col === "customer" && (await press("ArrowLeft"), (await where()).col === "invoice"));
    await press("ArrowRight");
    await press("Enter");
    check(g, "Enter on a focused header sorts that column (keyboard sorting)", (await sortOf("customer")) === "ascending");
    await press("Enter");
    check(g, "Enter again on the focused header toggles the sort to descending", (await sortOf("customer")) === "descending");
    await press("ArrowDown");
    w = await where();
    check(g, "ArrowDown moves from the header into the first body row of the same column", w.kind === "cell" && w.col === "customer" && w.rowIndex === 0, JSON.stringify(w));
    await press("ArrowDown"); await press("ArrowDown");
    check(g, "ArrowDown moves down the rows (row index 2)", (await where()).rowIndex === 2);
    const cols = [];
    for (let i = 0; i < 4; i++) { await press("ArrowRight"); cols.push((await where()).col); }
    check(g, "ArrowRight walks the cells in column order: due, total, status, actions", cols.join() === "due,total,status,actions", cols.join());
    await press("ArrowRight");
    check(g, "ArrowRight at the last column stays on it (no wrap, no escape)", (await where()).col === "actions");
    await press("ArrowUp");
    check(g, "ArrowUp moves back up the Actions column", (await where()).rowIndex === 1 && (await where()).col === "actions");
    await press("ArrowDown");
    const target = await where();
    const ring = await ev("(() => { const e = document.activeElement; const s = getComputedStyle(e); return { fv: e.matches(':focus-visible'), os: s.outlineStyle, ow: s.outlineWidth, cls: e.className }; })()");
    check(g, "the focused cell shows a visible focus ring (:focus-visible, >= 2px outline)", ring.fv && ring.os !== "none" && parseFloat(ring.ow) >= 2, JSON.stringify(ring));
    await shot("11-keyboard-focus.jpg");
    const m = mark();
    await press("Enter");
    check(g, "Enter on the focused Actions cell opens THAT invoice (GET /api/invoice-drafts/:id for exactly its UUID, once)", (await waitFor("!!document.getElementById('saved-id')", 6000)) && (await ev("document.getElementById('saved-id').textContent")) === target.rowId && DETAIL(m).length === 1 && DETAIL(m)[0].path.endsWith(target.rowId), JSON.stringify([target, DETAIL(m)]));
    check(g, "opening made only GET requests", MUTATIONS(m).length === 0);
    await load();
    await dashLoaded();
    await ev("document.getElementById('dash-status').focus()");
    await press("Tab"); await press("ArrowDown"); await press("ArrowDown");
    for (let i = 0; i < 5; i++) await press("ArrowRight");
    const t2 = await where();
    const m2 = mark();
    await press(" ");
    check(g, "Space on the focused Actions cell opens that invoice too", t2.col === "actions" && (await waitFor("!!document.getElementById('saved-id')", 6000)) && (await ev("document.getElementById('saved-id').textContent")) === t2.rowId && DETAIL(m2).length === 1, JSON.stringify([t2, DETAIL(m2)]));
    await load();
    await dashLoaded();
    const mb = mark();
    await ev("document.querySelector('.nmi-grid .ag-row [aria-label^=\"View invoice\"]').click()");
    check(g, "a pointer click on the inner View button still opens its invoice exactly once", (await waitFor("!!document.getElementById('saved-id')", 6000)) && DETAIL(mb).length === 1);
    await load();
    await dashLoaded();
    // Tab leaves the grid in one press from a header, from a cell, and Shift+Tab leaves backwards.
    await ev("document.getElementById('dash-status').focus()");
    await press("Tab"); await press("ArrowDown"); await press("ArrowRight");
    await press("Tab");
    check(g, "Tab from a body cell leaves the grid in ONE press and reaches 'Load more invoices'", (await ev("document.activeElement.id")) === "dash-more", String(await activeId()));
    await press("Tab", true);
    const back = await where();
    check(g, "Shift+Tab from 'Load more' re-enters the grid (no skip, no trap)", back.inGrid, JSON.stringify(back));
    await press("Tab", true);
    check(g, "Shift+Tab from inside the grid leaves it backwards to the status filter", (await ev("document.activeElement.id")) === "dash-status", String(await activeId()));
    await press("Tab");
    await press("Tab");
    check(g, "Tab from a column header leaves the grid in one press (forward, no trap)", (await ev("document.activeElement.id")) === "dash-more", String(await activeId()));
    let steps = 0;
    while (steps < 12 && (await ev("document.activeElement.tagName")) !== "BODY" && (await ev("document.activeElement.id")) !== "dash-title") { await press("Tab"); steps++; }
    check(g, "continued Tab presses keep moving through the page (bounded, no trap)", steps < 12, String(steps));
  }

  /* ======================= load more keeps sort ======================= */
  {
    const g = "Load more with an active sort";
    await clickHeader("customer");
    await clickHeader("customer"); // descending
    await sleep(50);
    const m = mark();
    await ev("document.getElementById('dash-more').click()");
    await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 26", 6000);
    const lists = LIST(m);
    const all = dbRows();
    check(g, "Load more asks the server for the next page with the cursor and the same limit; the sort is NOT sent", lists.length === 1 && !!q(m, lists[0]).get("cursor") && q(m, lists[0]).get("limit") === "20" && ![...q(m, lists[0]).keys()].some((k) => /sort|order/i.test(k)));
    check(g, "all 26 rows are present with no duplicate UUID", (await gridRows()).length === 26 && new Set((await gridRows()).map((r) => r.id)).size === 26);
    check(g, "the operator's descending Customer sort is kept over the now-26 loaded rows", (await sortOf("customer")) === "descending" && JSON.stringify(await names()) === JSON.stringify(stable(all, cmpText, -1).map((r) => r.name)), JSON.stringify((await names()).slice(0, 4)));
    await clickHeader("total"); await sleep(60);
    check(g, "Total ascending over all 26 loaded rows is currency-first then exact amount", JSON.stringify(await names()) === JSON.stringify(stable(all, cmpTotal, 1).map((r) => r.name)));
    const cs = await cards();
    const sums = {};
    for (const r of all) sums[r.currency] = (sums[r.currency] ?? 0n) + r.minor;
    const fmt = (c, v) => (c === "JPY" ? Number(v).toLocaleString("en-US") : (Number(v) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    check(g, "after the last page the per-currency cards equal the whole-account exact sums (independent of the grid sort), never combined", cs.length === Object.keys(sums).length && cs.every((c) => c.amount.replace(/^[^0-9]*/, "") === fmt(c.cur, sums[c.cur])), JSON.stringify(cs));
    check(g, "no 'Grand total' across currencies exists", !/Grand total/i.test(await bodyText()));
    await shot("03-all-loaded-sorted.jpg");
  }

  /* ======================= server filters with the grid ======================= */
  {
    const g = "Server filters and search still drive the grid";
    const m = mark();
    await ev("[...document.querySelectorAll('.pill')].find((b) => b.textContent.trim() === 'EUR').click()");
    const eurN = SEED.filter((s) => s.currency === "EUR").length;
    check(g, "the EUR pill asks the SERVER (currency=EUR) and the grid shows only the EUR invoices", (await waitFor(`document.querySelectorAll('.nmi-grid .ag-row').length === ${eurN}`, 6000)) && LIST(m).some((c) => q(m, c).get("currency") === "EUR") && (await gridRows()).every((r) => /EUR/.test(r.total)));
    await ev("[...document.querySelectorAll('.pill')].find((b) => /All currencies/.test(b.textContent)).click()");
    await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 20", 6000);
    const m2 = mark();
    await setValue("dash-search", "Grid 07");
    check(g, "search is server-side: the grid shows exactly the one match and the search box stays mounted", (await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 1", 6000)) && (await names()).join() === "Grid 07" && LIST(m2).some((c) => q(m2, c).get("q") === "Grid 07"));
    await setValue("dash-search", "zzz-no-such");
    check(g, "no match: the grid is replaced by the honest 'No invoices match' state with Clear filters", await waitFor("!!document.getElementById('dash-no-match') && !document.querySelector('.nmi-grid')", 6000));
    await shot("04-no-match.jpg");
    await ev("document.getElementById('dash-clear').click()");
    check(g, "Clear filters restores the grid from the server", await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 20 && document.getElementById('dash-search').value === ''", 6000));
  }

  /* ======================= failure states (SIMULATED) ======================= */
  {
    const g = "SIMULATED failures: no grid, no fixture, working Retry";
    await simulate((p) => (p.request.method === "GET" && /\/api\/invoice-drafts\?/.test(p.request.url) ? "fail" : "continue"));
    await setValue("dash-search", "retry me");
    check(g, "SIMULATED offline list: the alert replaces the grid; no row and no sample data is shown", (await waitFor("!!document.getElementById('dash-error') && !document.querySelector('.nmi-grid .ag-row')", 6000)) && !/Grid 0|Acme|Northwind/.test(await bodyText()));
    await shot("05-error.jpg");
    await stopSimulating();
    await ev("document.getElementById('dash-retry').click()");
    check(g, "Retry reaches the real server again and no match is reported for the unusual search", await waitFor("!!document.getElementById('dash-no-match')", 6000));
    await ev("document.getElementById('dash-clear').click()");
    await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 20", 6000);
  }

  /* ======================= dark theme (desktop) ======================= */
  {
    const g = "Dark theme and contrast";
    const cl = await ev(CONTRAST_SCAN);
    check(g, "light desktop: all grid and page text >= WCAG AA", cl.length === 0, JSON.stringify(cl));
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await load();
    await dashLoaded();
    const bg = await ev("getComputedStyle(document.querySelector('.nmi-grid .ag-row')).backgroundColor");
    const root = await ev("getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()");
    check(g, "the grid follows the app's dark tokens (rows use the dark surface, not AG Grid's white)", /rgb\(19, 27, 46\)|rgba\(0, 0, 0, 0\)/.test(bg) || root === "#131b2e", `${bg} / ${root}`);
    const cd = await ev(CONTRAST_SCAN);
    check(g, "dark desktop: all grid and page text >= WCAG AA", cd.length === 0, JSON.stringify(cd));
    check(g, "dark: header, row and cell backgrounds are not light (no white flash)", await ev("(() => { const l = (c) => { const m = c.match(/\\d+/g).map(Number); return (m[0] + m[1] + m[2]) / 3; }; return ['.nmi-grid .ag-header', '.nmi-grid .ag-row', '.nmi-grid .ag-root'].every((s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)' || l(getComputedStyle(e).backgroundColor) < 90; }); })()"));
    await shot("06-desktop-dark.jpg");
  }

  /* ======================= 390px mobile (dark, then light) ======================= */
  {
    const g = "390px mobile";
    await viewport(390, 844, true);
    await load();
    await dashLoaded();
    let ov = await ev(OVERFLOW);
    check(g, "no page-level horizontal overflow at 390px (the grid scrolls inside itself)", ov === "", ov);
    const sc = await ev("(() => { const v = document.querySelector('.nmi-grid .ag-body-horizontal-scroll-viewport, .nmi-grid .ag-body-viewport'); return v ? { sw: v.scrollWidth, cw: v.clientWidth } : null; })()");
    check(g, "all six columns remain in the DOM and the grid body scrolls horizontally when it must", (await ev("document.querySelectorAll('.nmi-grid .ag-header-cell').length")) === 6 && !!sc, JSON.stringify(sc));
    const c = await ev(CONTRAST_SCAN);
    check(g, "dark 390px: text contrast >= WCAG AA", c.length === 0, JSON.stringify(c));
    await ev("document.getElementById('dash-status').focus()");
    await press("Tab"); await press("ArrowDown");
    for (let i = 0; i < 5; i++) await press("ArrowRight");
    const off = await ev("(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); const vp = document.querySelector('.nmi-grid .ag-body-horizontal-scroll-viewport, .nmi-grid .ag-body-viewport').getBoundingClientRect(); return { col: e.getAttribute('col-id'), x: r.x, right: r.right, vpx: vp.x, vpr: vp.right, vw: innerWidth }; })()");
    check(g, "at 390px ArrowRight reaches the off-screen 'due' cell and the grid scrolls it fully into view (keyboard access to hidden columns)", off.col === "due" && off.x >= off.vpx - 1 && off.right <= off.vpr + 1 && off.right <= off.vw + 1, JSON.stringify(off));
    await press("Home");
    check(g, "Home returns to the first column and scrolls back", (await ev("document.activeElement.getAttribute('col-id')")) === "customer");
    await shot("07-mobile-dark.jpg");
    const first = await ev(`(() => { const row = document.querySelector('.nmi-grid .ag-row'); const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, r: r.right, w: r.width, h: r.height }; }; return { vw: innerWidth, customer: rect(row.querySelector('[col-id=customer]')), total: rect(row.querySelector('[col-id=total]')), view: rect(row.querySelector('[aria-label^="View invoice"]')), scroll: document.querySelector('.nmi-grid .ag-body-horizontal-scroll-viewport')?.scrollLeft ?? 0 }; })()`);
    check(g, "at 390px (grid not scrolled) the first row shows the customer, the exact total and the View action together, all inside the viewport", [first.customer, first.total, first.view].every((r) => r.x >= 0 && r.r <= first.vw + 1) && first.scroll === 0, JSON.stringify(first));
    check(g, "the View action target is >= 24 x 24 CSS px (WCAG 2.2 AA target size)", first.view.w >= 24 && first.view.h >= 24, JSON.stringify(first.view));
    check(g, "the narrow column order is Customer, Total, Actions, PayPal Sandbox, Invoice, Due (nothing removed)", JSON.stringify(await ev("[...document.querySelectorAll('.nmi-grid .ag-header-cell')].map((h) => h.getAttribute('col-id'))")) === JSON.stringify(["customer", "total", "actions", "status", "invoice", "due"]));
    await ev("document.querySelector('.nmi-grid').scrollIntoView({ block: 'center' })");
    await shot("07b-mobile-dark-first-view.jpg");
    await ev("document.querySelector('.nmi-grid .ag-row [col-id=status]').scrollIntoView({ inline: 'center', block: 'center' })");
    check(g, "the remaining columns (PayPal status, invoice, due) are reachable by scrolling the grid sideways", await ev("(() => { const b = document.querySelector('.nmi-grid .ag-row [col-id=due]'); const r = b.getBoundingClientRect(); return r.width > 0; })()"));
    await shot("08-mobile-dark-scrolled.jpg");
    const m = mark();
    await ev("document.querySelector('.nmi-grid .ag-row [aria-label^=\"View invoice\"]').click()");
    check(g, "tapping View at 390px opens the saved invoice", await waitFor("!!document.getElementById('saved-id')", 6000) && DETAIL(m).length === 1);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    await load();
    await dashLoaded();
    ov = await ev(OVERFLOW);
    const cm = await ev(CONTRAST_SCAN);
    check(g, "light 390px: no page overflow and text contrast >= WCAG AA", ov === "" && cm.length === 0, ov + JSON.stringify(cm));
    await shot("09-mobile-light.jpg");
  }

  /* ======================= 400% zoom smoke ======================= */
  {
    const g = "400% zoom smoke (320 x 256 CSS px, equivalent to 400% on a 1280 x 1024 window)";
    await viewport(320, 256, false);
    await load();
    await dashLoaded();
    const ov = await ev(OVERFLOW);
    check(g, "no page-level horizontal scroll at 400% equivalent (reflow, WCAG 1.4.10)", ov === "", ov);
    check(g, "the title, filters, grid, View action and Load more all remain present and reachable", await ev("!!document.getElementById('dash-title') && !!document.getElementById('dash-search') && !!document.querySelector('.nmi-grid .ag-row [aria-label^=\"View invoice\"]') && !!document.getElementById('dash-more')"));
    await ev("document.getElementById('dash-more').scrollIntoView()");
    const vis = await ev("(() => { const r = document.getElementById('dash-more').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 1; })()");
    check(g, "Load more is fully visible without horizontal scrolling", vis);
    await shot("10-zoom-400.jpg");
    await viewport(1280, 900);
  }

  /* ======================= larger dataset: bounded rendering ======================= */
  {
    const g = "Scale: 600 invoices, bounded rendering";
    const t0 = Date.now();
    for (let i = 27; i <= 600; i++) await nodeCreate(a, inv("Scale " + String(i).padStart(4, "0"), { currency: ["USD", "EUR", "GBP", "JPY"][i % 4], lineItems: [{ description: "Service", quantity: "1", unitPrice: ["USD", "EUR", "GBP"].includes(["USD", "EUR", "GBP", "JPY"][i % 4]) ? ((i * 53) % 900 + 1 + 0.25 * (i % 4)).toFixed(2) : String((i * 53) % 9000 + 1) }] }));
    check(g, "600 synthetic invoices exist for the owner (seeded through the real API)", Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${A_ID()}'`)) === 600, `${Date.now() - t0} ms`);
    const all = dbRows();
    const heap = async () => { await send("HeapProfiler.collectGarbage"); return ev("performance.memory ? performance.memory.usedJSHeapSize : 0"); };
    const nodes = () => ev("document.getElementsByTagName('*').length");
    await load();
    await dashLoaded();
    const h0 = await heap();
    const n0 = await nodes();
    const m = mark();
    const loadTimes = [];
    while (await ev("!!document.getElementById('dash-more')")) {
      const have = await ev("document.querySelectorAll('.nmi-grid .ag-row').length");
      const t = Date.now();
      await ev("document.getElementById('dash-more').click()");
      if (!(await waitFor(`document.querySelectorAll('.nmi-grid .ag-row').length === ${have + 20}`, 10000))) break;
      loadTimes.push(Date.now() - t);
    }
    const rows = await gridRows();
    const lists = LIST(m);
    check(g, "Load more stops at the 200-invoice rendering bound: exactly 200 rows, no Load more button, an explanation instead", rows.length === 200 && !(await ev("!!document.getElementById('dash-more')")) && (await ev("document.getElementById('dash-limit')?.textContent ?? ''")).includes("200 invoices are loaded"), String(rows.length));
    check(g, "the server cursor pagination is unchanged: 9 further GETs (20 each, cursor chained) and none after the bound", lists.length === 9 && lists.every((c, i) => c.status === 200 && !!q(m, c).get("cursor") && q(m, c).get("limit") === "20"), String(lists.length));
    check(g, "the 200 rows are exactly the owner's newest 200, no gap and no duplicate, keyed by UUID", JSON.stringify(rows.map((r) => r.id)) === JSON.stringify(all.slice(0, 200).map((r) => r.id)) && new Set(rows.map((r) => r.id)).size === 200);
    const cs = await cards();
    const sums = {};
    for (const r of all.slice(0, 200)) sums[r.currency] = (sums[r.currency] ?? 0n) + r.minor;
    const fmtc = (c, v) => (c === "JPY" ? Number(v).toLocaleString("en-US") : (Number(v) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    check(g, "the currency cards equal the exact per-currency sums of the 200 loaded rows (never mixed, never the whole 600)", cs.length === Object.keys(sums).length && cs.every((c) => c.amount.replace(/^[^0-9]*/, "") === fmtc(c.cur, sums[c.cur]) && /200|loaded/.test(c.meta)), JSON.stringify(cs));
    const h1 = await heap();
    const n1 = await nodes();
    PERF.rowsLoaded = 200; PERF.domNodes0 = n0; PERF.domNodes200 = n1; PERF.heapBefore = h0; PERF.heapAfter200 = h1; PERF.loadMoreMs = loadTimes;
    check(g, "DOM stays bounded at the 200-row limit (fewer than 20,000 elements)", n1 < 20000, `${n0} -> ${n1} elements`);
    const ts = Date.now();
    await clickHeader("total");
    await waitFor(`document.querySelector('.nmi-grid .ag-row [col-id=customer] .cell-main')?.textContent !== ${JSON.stringify(rows[0].name)}`, 5000);
    PERF.sortMs = Date.now() - ts;
    check(g, "sorting Total over 200 rows is currency-first then exact BigInt, matches the independent expectation and completes in < 2 s", JSON.stringify(await names()) === JSON.stringify(stable(all.slice(0, 200), cmpTotal, 1).map((r) => r.name)) && PERF.sortMs < 2000, `${PERF.sortMs} ms`);
    check(g, "the cards are unchanged by the sort", JSON.stringify(await cards()) === JSON.stringify(cs));
    await ev("document.getElementById('dash-status').focus()");
    await press("Tab"); await press("ArrowDown");
    const tk = Date.now();
    for (let i = 0; i < 120; i++) await press("ArrowDown");
    PERF.arrow120Ms = Date.now() - tk;
    const kw = await ev("(() => { const e = document.activeElement; const r = e.closest('.ag-row'); return { kind: e.className.includes('ag-cell') ? 'cell' : e.tagName, rowIndex: r ? Number(r.getAttribute('row-index')) : -1 }; })()");
    check(g, "From the first row, 120 ArrowDown presses move focus to row index 120 of the 200-row grid in real time", kw.kind === "cell" && kw.rowIndex === 120, `${JSON.stringify(kw)} in ${PERF.arrow120Ms} ms`);
    await press("Tab");
    check(g, "Tab from deep inside the 200-row grid leaves it in one press (no focus trap)", !(await ev("!!document.activeElement.closest('.nmi-grid')")), String(await activeId()));
    await sleep(200);
    const h2 = await heap();
    PERF.heapAfterInteract = h2;
    check(g, "memory observation recorded (JS heap after GC, bytes): no unbounded growth through load, sort and 120 key presses (< 100 MB)", h2 < 100 * 1024 * 1024, `${h0} -> ${h1} -> ${h2}`);
    await ev("document.getElementById('dash-limit').scrollIntoView({ block: 'end' })");
    await shot("12-scale-200-limit.jpg");
    await setValue("dash-search", "Grid 01");
    check(g, "an invoice outside the 200-row bound is still reachable through the server-side search over the whole account", (await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 1", 6000)) && (await names()).join() === "Grid 01");
    await shot("13-scale-search-beyond-bound.jpg");
    await ev("document.getElementById('dash-clear')?.click(); true");
    await setValue("dash-search", "");
    await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 20", 6000);
  }

  /* ======================= sign out locks the workspace ======================= */
  {
    const g = "Session lock";
    await load();
    await dashLoaded();
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
    check(g, "Sign out removes the grid and every customer name from the page at once", (await waitFor("!!document.getElementById('login-title')", 6000)) && !(await ev("!!document.querySelector('.nmi-grid')")) && !/Grid \d\d/.test(await ev("document.documentElement.outerHTML")));
  }

  /* ======================= build facts ======================= */
  {
    const g = "Build facts";
    const dist = join(root, "apps/web/dist/assets");
    const js = readdirSync(dist).filter((f) => f.endsWith(".js"));
    const css = readdirSync(dist).filter((f) => f.endsWith(".css"));
    const gz = (f) => spawnSync("gzip", ["-9c", join(dist, f)], { maxBuffer: 1 << 26 }).stdout.length;
    const size = (f) => readFileSync(join(dist, f)).length;
    const jsText = js.map((f) => readFileSync(join(dist, f), "utf8")).join("\n");
    BUILD.js = js.map((f) => `${f} ${size(f)} B (${gz(f)} B gzip)`);
    BUILD.css = css.map((f) => `${f} ${size(f)} B (${gz(f)} B gzip)`);
    const ent = jsText.match(/ag-grid-enterprise/g) ?? [];
    const entCtx = ent.length ? jsText.slice(jsText.indexOf("ag-grid-enterprise") - 60, jsText.indexOf("ag-grid-enterprise") + 40) : "";
    check(g, "the production bundle imports no Enterprise, Charts or Studio package: the only 'ag-grid-enterprise' text is the core's own 'missing module' error message", !/AgGridEnterprise|ag-studio|ag-charts-enterprise|LicenseManager\(/.test(jsText) && (ent.length === 0 || (ent.length === 1 && /requires the ag-grid-enterprise script/.test(entCtx + jsText.slice(jsText.indexOf("ag-grid-enterprise"), jsText.indexOf("ag-grid-enterprise") + 60)))), entCtx);
    check(g, "the production CSS contains no data: font (CSP font-src 'self' stays unweakened)", !/@font-face[^}]*data:/i.test(css.map((f) => readFileSync(join(dist, f), "utf8")).join("\n")));
    const pkg = JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8"));
    check(g, "exactly ag-grid-community and ag-grid-react are the added dependencies, pinned to one exact version", pkg.dependencies["ag-grid-community"] === pkg.dependencies["ag-grid-react"] && /^\d+\.\d+\.\d+$/.test(pkg.dependencies["ag-grid-community"]), pkg.dependencies["ag-grid-community"]);
    const html = readFileSync(join(root, "apps/web/dist/index.html"), "utf8");
    check(g, "the production page still carries the strict CSP (no unsafe-inline / unsafe-eval)", /style-src (&#39;|')self(&#39;|')/.test(html) && !/unsafe-inline|unsafe-eval/.test(html), html.match(/content="([^"]*)"/g)?.join(" ").slice(0, 300));
  }

  /* ======================= global invariants ======================= */
  {
    const g = "Global invariants";
    const s = await ev(STORAGE);
    check(g, "no localStorage/sessionStorage/IndexedDB/Cache entries", s.local === 0 && s.session === 0 && s.idb === 0 && s.caches === 0, JSON.stringify(s));
    check(g, "no script-readable cookie; the browser NAVIGATION URL carries no customer data or id", s.cookie === "" && !/Grid|@/.test(s.href) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(s.href), s.href);
    check(g, "no request left the app origin (no PayPal/OpenAI/foreign host)", foreign.length === 0, JSON.stringify(foreign));
    const paths = new Set(netLog.filter((n) => n.path.startsWith("/api/")).map((n) => n.path.replace(/[0-9a-f-]{36}/, ":id").replace(/\?.*$/, "")));
    check(g, "the browser used only auth, GET /api/invoice-drafts and GET /api/invoice-drafts/:id (the seed POSTs came from the harness, not the browser)", [...paths].every((p) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts(\/:id)?)$/.test(p)), [...paths].join(","));
    check(g, "the browser sent no mutation of invoice data", netLog.filter((n) => n.path.startsWith("/api/invoice-drafts") && n.method !== "GET").length === 0);
    check(g, "no PayPal operations, approvals or model calls exist", Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 0 && Number(sql("SELECT count(*) FROM approvals")) === 0 && modelCalls() === 0);
    const ag = consoleMsgs.filter((x) => /AG Grid|ag-grid/i.test(x));
    check(g, "no AG Grid console message at any point in the journey", ag.length === 0, ag.slice(0, 3).join(" / ").slice(0, 300));
    check(g, "no console errors or uncaught exceptions in the browser", consoleMsgs.filter((x) => !/Failed to load resource|net::ERR|status of (4|5)\d\d/.test(x)).length === 0, consoleMsgs.slice(0, 5).join(" / "));
  }

} catch (e) {
  record("harness", "unexpected failure", false, String(e?.stack || e).slice(0, 600));
} finally {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const lines = [
    "# NMI-AG1 browser AG Grid Community dashboard journey",
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
    `Scale observations (600 invoices, 200-row bound, headless Chrome, this machine; indicative, not a benchmark): ${JSON.stringify(PERF)}.`, "",
    `Build facts: JS ${BUILD.js?.join("; ")}; CSS ${BUILD.css?.join("; ")}.`, "", "Not covered: screen readers (VoiceOver/NVDA), real touch devices, Safari/Firefox, a real browser zoom control (the 400% check is a 320 x 256 CSS px viewport emulation), a hosted/TLS (`__Host-` cookie) deployment.",
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
