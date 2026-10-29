/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-UI-01C5-P1 genuine browser -> Vite preview (production build, strict CSP) -> Fastify -> disposable
// PostgreSQL 16 journey for the REAL PayPal Sandbox DRAFT panel, with a DETERMINISTIC FAKE PayPal
// provider injected behind the real routes and state machine (see test-api-server.ts).
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-UI-01C5-P1/run-paypal-journey.mjs
//
// NO real PayPal request and NO OpenAI request is ever made. Groups tagged REAL go through the real
// browser, proxy, Fastify, PostgreSQL and the real draft service; the provider is the fake and is
// NOT evidence of real PayPal behaviour. Groups tagged SIMULATED use Chrome request interception.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const ORIGIN = "http://localhost:4173";
const API_PORT = Number(process.env.NMI_C5_API_PORT || 3101);
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54329;
const DEBUG_PORT = 9339;
const DB = "nmi_test_c5p1_journey";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-c5";
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

const work = mkdtempSync(join(tmpdir(), "nmi-c5-"));
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
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_c5", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_c5", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_c5@127.0.0.1:${PG_PORT}/${DB}`;
const provision = (password) =>
  run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: password } });
provision(PASSWORD);

/* ----------------------------------------------------------------- servers */
const apiLog = join(work, "api.log");
const modelLog = join(work, "model-calls.log");
writeFileSync(modelLog, "");
const ppLog = join(work, "fake-paypal-calls.log");
writeFileSync(ppLog, "");
const baseEnv = { ...process.env, NODE_ENV: "development", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, DATABASE_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", OPENAI_API_KEY: "", OPENAI_MODEL: "", NMI_FAKE_MODEL_LOG: modelLog, NMI_FAKE_PAYPAL_LOG: ppLog, PAYPAL_DRAFTS_ENABLED: "true", PAYPAL_CLIENT_ID: "cid-" + randomBytes(6).toString("hex"), PAYPAL_CLIENT_SECRET: "csec-" + randomBytes(10).toString("hex") };
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
await startApi({});
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(ORIGIN + "/")).ok) break; } catch {}
  await sleep(150);
}
check("setup", "disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy", (await (await fetch(ORIGIN + "/health")).json()).status === "ok");
check("setup", "database is a throw-away nmi_test* cluster in a temp directory", /^nmi_test/.test(DB));
check("setup", "PayPal drafting ENABLED on the API but backed ONLY by the deterministic fake client; no OpenAI key/model; the real PayPal client is never constructed", true);

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-c5-"));
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
const KEYS = { Tab: { code: "Tab", vk: 9 }, Enter: { code: "Enter", vk: 13, text: "\r" }, Escape: { code: "Escape", vk: 27 } };
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
  const ppCalls = () => readFileSync(ppLog, "utf8").split("\n").filter(Boolean);
  const ppCount = (k) => ppCalls().filter((x) => x === k).length;
  const PPPOST = (since = 0) => apiCalls(since).filter((c) => c.method === "POST" && /\/paypal-draft$/.test(c.path));
  const DETAIL = (since = 0) => apiCalls(since).filter((c) => c.method === "GET" && /^\/api\/invoice-drafts\/[0-9a-f-]{36}$/.test(c.path));
  const opRow = (id) => sql(`SELECT state||'|'||coalesce(paypal_invoice_id,'')||'|'||attempts FROM paypal_draft_operations WHERE invoice_id='${id}'`);
  const idOf = (name) => sql(`SELECT id FROM invoices WHERE customer_name='${name}'`);
  const fillText = async (id, v) => { await focusId(id); await ev(`document.getElementById(${JSON.stringify(id)}).select()`); await typeText(v); };
  const sessionAuth = async () => {
    const c = await sessionCookie();
    const r = await fetch(API + "/api/auth/session", { headers: { cookie: `${c.name}=${c.value}`, origin: ORIGIN } });
    return { cookie: `${c.name}=${c.value}`, csrf: (await r.json()).csrfToken };
  };
  let keyN = 0;
  const nodeCreate = async (a, name, over = {}) => {
    const body = { customerName: name, customerEmail: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@c5.example`, currency: "USD", lineItems: [{ description: "Workshop", quantity: "2", unitPrice: "250.00" }], dueDate: "2030-01-15", taxPercent: null, discount: null, ...over };
    const r = await fetch(API + "/api/invoice-drafts", { method: "POST", headers: { "content-type": "application/json", cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf, "idempotency-key": `c5p1_probe_${String(++keyN).padStart(8, "0")}_${randomBytes(4).toString("hex")}` }, body: JSON.stringify(body) });
    if (r.status !== 201) throw new Error("create failed " + r.status);
    return (await r.json()).id;
  };
  async function signInAs(user, pass) {
    await load();
    await waitFor("!!document.getElementById('login-title') || !!document.querySelector('.app-nav')");
    if (await onLogin()) await login(user, pass);
    if (!(await waitFor("!!document.querySelector('.app-nav')"))) throw new Error("sign-in failed");
    await waitFor("!!document.getElementById('dash-title')");
    await waitFor("!!document.querySelector('.nmi-grid .ag-row') || !!document.getElementById('dash-empty')", 8000);
  }
  /** Dashboard -> search the customer -> View (the real reopen path). */
  async function openSaved(name) {
    await waitFor("!!document.getElementById('dash-search')", 6000);
    await fillText("dash-search", name);
    await waitFor(`document.querySelectorAll('.nmi-grid .ag-row').length === 1 && document.querySelector('.nmi-grid .ag-row [col-id=customer] .cell-main').textContent === ${JSON.stringify(name)}`, 6000);
    await ev("document.querySelector('.nmi-grid .ag-row [aria-label^=\"View invoice\"]').click()");
    if (!(await waitFor("!!document.getElementById('saved-id') && !!document.getElementById('pp-body')", 8000))) throw new Error("saved page did not open for " + name);
  }
  const backToDashboard = async () => {
    await ev("document.getElementById('saved-back').click()");
    await waitFor("!!document.getElementById('dash-title')", 6000);
    await waitFor("!!document.querySelector('.nmi-grid .ag-row') || !!document.getElementById('dash-empty')", 8000);
  };
  const dialogOpen = () => ev("!!document.querySelector('dialog[open]')");
  const dialogText = () => ev("document.querySelector('dialog[open]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  const clickCreate = () => ev("(() => { const b = document.getElementById('create-pp-btn'); b.focus(); b.click(); })()");
  const clickConfirm = () => ev("[...document.querySelectorAll('dialog[open] button')].find((b) => /^Create PayPal Sandbox draft$/.test(b.textContent.trim())).click()");
  const clickCancel = () => ev("[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Cancel').click()");
  const panelText = () => ev("document.getElementById('pp-body').innerText.replace(/\\s+/g, ' ') + ' ' + (document.getElementById('pp-outcome')?.innerText.replace(/\\s+/g, ' ') ?? '')");
  const dropResponses = async (re) => {
    rule = (p) => (p.responseStatusCode !== undefined && re.test(p.request.url) ? "fail" : "continue");
    await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/invoice-drafts/*", requestStage: "Response" }] });
  };
  const confirmCreate = async () => { await clickCreate(); await waitFor("!!document.querySelector('dialog[open]')", 2000); await clickConfirm(); };

  /* ======================= setup: one operator, saved invoices (created through the real save route) ======================= */
  await signInAs(USER, PASSWORD);
  const a = await sessionAuth();
  const ID = {};
  const desc = (marker) => ({ lineItems: [{ description: `Workshop ${marker}`.trim(), quantity: "2", unitPrice: "250.00" }] });
  for (const [k, name, over] of [
    ["ok", "Pay Ok", {}],
    ["cancel", "Pay Cancel", {}],
    ["slow", "Pay Slow", desc("SIM-SLOW")],
    ["unknown", "Pay Unknown", desc("SIM-UNKNOWN")],
    ["reject", "Pay Reject", desc("SIM-REJECT")],
    ["mismatch", "Pay Mismatch", desc("SIM-MISMATCH")],
    ["refused", "Pay Refused", { lineItems: [{ description: "Rounding", quantity: "1.5", unitPrice: "0.33" }] }],
    ["eur", "Pay Euro", { currency: "EUR", lineItems: [{ description: "Audit", quantity: "1", unitPrice: "300.00" }] }],
    ["jpy", "Pay Yen", { currency: "JPY", lineItems: [{ description: "Audit", quantity: "1", unitPrice: "5000" }] }],
    ["lost", "Pay Lost", {}],
    ["sim", "Pay Simulated", {}],
    ["expire", "Pay Expire", {}],
    ["kbd", "Pay Keyboard", {}],
    ["mobile", "Pay Mobile", {}],
    ["getdelay", "Pay GetDelay", {}],
    ["getmm", "Pay GetMismatch", desc("SIM-MISMATCH")],
    ["getbad", "Pay GetMalformed", {}],
  ]) ID[k] = await nodeCreate(a, name, over);
  {
    const g = "setup";
    check(g, "17 saved invoices exist in PostgreSQL and none has a PayPal operation or provider id", Number(sql("SELECT count(*) FROM invoices")) === 17 && Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 0 && ppCalls().length === 0);
  }

  /* ======================= logged-out ======================= */
  {
    const g = "REAL logged-out protection";
    const m = mark();
    const r = await fetch(`${API}/api/invoice-drafts/${ID.ok}/paypal-draft`, { method: "POST", headers: { origin: ORIGIN } });
    check(g, "the real server refuses an unauthenticated PayPal-draft POST (401) and calls nothing", r.status === 401 && ppCalls().length === 0);
    const r2 = await fetch(`${API}/api/invoice-drafts/${ID.ok}/paypal-draft`, { method: "POST", headers: { origin: ORIGIN, cookie: (await sessionAuth()).cookie } });
    check(g, "a session without the CSRF token is refused (403) and nothing is created", r2.status === 403 && ppCalls().length === 0 && Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 0);
  }

  /* ======================= the main journey: dashboard -> saved invoice -> confirmation -> DRAFT -> durable refresh -> dashboard ======================= */
  {
    const g = "REAL main journey (fake provider)";
    await load();
    await waitFor("!!document.getElementById('dash-title')");
    const m0 = mark();
    check(g, "after a reload the app makes NO PayPal-draft request on its own", PPPOST(m0).length === 0 && ppCalls().length === 0);
    await waitFor("!!document.querySelector('.nmi-grid .ag-row')", 8000);
    const mOpen = mark();
    await openSaved("Pay Ok");
    const m = mark();
    const t0 = await panelText();
    check(g, "the real saved invoice shows 'Not created in PayPal Sandbox' with an explicit create action", /Not created in PayPal Sandbox/.test(t0) && (await ev("!!document.getElementById('create-pp-btn') && !document.getElementById('create-pp-btn').disabled")), t0);
    const body = await bodyText();
    check(g, "customer, currency, server total and due date are shown, plus the PayPal Sandbox identity", /Pay Ok/.test(body) && /USD/.test(body) && /\$500\.00/.test(body) && /Jan 15, 2030/.test(body) && /PayPal Sandbox/.test(body));
    check(g, "opening the saved invoice read it with GET and made no PayPal-draft POST", PPPOST(mOpen).length === 0 && DETAIL(mOpen).length >= 1);
    await shot("01-saved-not-created.jpg");

    // dialog: content, focus, Escape, Cancel -> zero POSTs
    await clickCreate();
    check(g, "the confirmation dialog opens, with initial focus on Cancel", (await waitFor("!!document.querySelector('dialog[open]')", 2000)) && (await ev("document.activeElement.textContent.trim()")) === "Cancel");
    const dt = await dialogText();
    check(g, "the dialog names the exact saved invoice, customer, currency, server total and due date", dt.includes(ID.ok) && /Pay Ok/.test(dt) && /\$500\.00\s*USD/.test(dt) && /Jan 15, 2030/.test(dt), dt);
    check(g, "the dialog says a Sandbox DRAFT is prepared, the customer is NOT emailed, no payment is collected, nothing is sent", /DRAFT/.test(dt) && /customer will not be emailed/i.test(dt) && /No payment will be collected/.test(dt) && /does not send an invoice/.test(dt) && /Sandbox/.test(dt));
    await shot("02-confirm-dialog.jpg");
    await press("Escape");
    check(g, "Escape closes the dialog, returns focus to the Create button and sends NOTHING", (await waitFor("!document.querySelector('dialog[open]')", 1500)) && (await ev("document.activeElement.id")) === "create-pp-btn" && PPPOST(m).length === 0);
    await clickCreate();
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    await clickCancel();
    check(g, "Cancel closes the dialog and issues ZERO POST requests (no operation, no provider call)", (await waitFor("!document.querySelector('dialog[open]')", 1500)) && PPPOST(m).length === 0 && ppCalls().length === 0 && (await opRow(ID.ok)) === "");

    // confirm: one POST for this confirmation
    await confirmCreate();
    await waitFor("!!document.getElementById('pp-id')", 10000);
    const posts = PPPOST(m);
    check(g, "exactly one PayPal-draft POST for that confirmation -> 201 with CSRF, no request body", posts.length === 1 && posts[0].status === 201 && posts[0].hasCsrf && posts[0].path.endsWith(`/${ID.ok}/paypal-draft`) && (posts[0].body ?? null) === null, JSON.stringify(posts.map((p) => [p.status, p.hasCsrf, p.body])));
    const t1 = await panelText();
    const row = (await opRow(ID.ok)).split("|");
    check(g, "the panel shows the server-validated PayPal id, DRAFT, and says the customer was NOT emailed", /DRAFT/.test(t1) && new RegExp(row[1]).test(t1) && /customer has not been emailed/i.test(t1) && /PayPal Sandbox DRAFT created \(HTTP 201\)/.test(t1) && !/(was|has been|is) (sent|paid)/i.test(t1), t1);
    check(g, "the durable record agrees: operation row 'created', one attempt, id linked on the invoice, ONE fake provider create", row[0] === "created" && row[2] === "1" && sql(`SELECT paypal_invoice_id FROM invoices WHERE id='${ID.ok}'`) === row[1] && ppCount("create") === 1);
    check(g, "after the POST the page re-read the durable state with GET /api/invoice-drafts/:id (read-only) and shows it", DETAIL(m).length >= 1 && netLog.indexOf(DETAIL(m).at(-1)) > netLog.indexOf(posts[0]) && DETAIL(m).at(-1).status === 200 && (await ev("document.getElementById('pp-id').textContent")) === row[1]);
    check(g, "the create button is gone and the page text never claims the invoice was sent, paid or collected", !(await ev("!!document.getElementById('create-pp-btn')")) && !/(was|has been|is) (sent|paid)|payment (received|collected)/i.test(await bodyText()));
    check(g, "the saved-page notice no longer says 'nothing was sent to PayPal' or 'not created in PayPal'", !/nothing was sent to PayPal|not created in PayPal\b/i.test(await ev("document.getElementById('saved-notice').innerText")), await ev("document.getElementById('saved-notice').innerText"));
    await shot("03-created.jpg");
    // read-only Check status
    const mc = mark();
    check(g, "no 'Check status' is offered once created (nothing left to resolve)", !(await ev("!!document.getElementById('check-pp-btn')")));
    await backToDashboard();
    check(g, "back on the REAL dashboard the invoice's PayPal status is read from the server: 'PayPal draft created'", (await waitFor("[...document.querySelectorAll('.nmi-grid .ag-row')].some((r) => /Pay Ok/.test(r.textContent) && /PayPal draft created/.test(r.textContent))", 4000)) && !/DEMO \/ SYNTHETIC/.test(await bodyText()));
    await setStatusFilter("created");
    check(g, "the server-side 'PayPal draft created' filter lists exactly that invoice", (await waitFor("document.querySelectorAll('.nmi-grid .ag-row').length === 1", 6000)) && (await rowNames()).join() === "Pay Ok");
    await setStatusFilter("ALL");
    check(g, "no PayPal-draft POST happened on the dashboard", PPPOST(mc).length === 0);
    // reload on the saved invoice id is not restorable: and never auto-posts
    const mr = mark();
    await load();
    await waitFor("!!document.getElementById('dash-title')");
    check(g, "reloading does not restore a PayPal action and issues no PayPal-draft POST", PPPOST(mr).length === 0 && ppCount("create") === 1);
  }

  /* ======================= double click, in-flight ======================= */
  async function setStatusFilter(v) { await ev(`(() => { const e = document.getElementById('dash-status'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500); }
  async function rowNames() { return ev("[...document.querySelectorAll('.nmi-grid .ag-row [col-id=customer] .cell-main')].map((e) => e.textContent)"); }
  {
    const g = "REAL double confirm and in-flight state (fake provider takes 4 s)";
    await openSaved("Pay Slow");
    const m = mark();
    await clickCreate();
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    await ev("(() => { const b = [...document.querySelectorAll('dialog[open] button')].find((x) => /^Create PayPal Sandbox draft$/.test(x.textContent.trim())); b.click(); b.click(); b.click(); })()");
    check(g, "while creating: an accessible progress status is shown and the create control is gone", await waitFor("!!document.getElementById('pp-creating')", 3000) && (await ev("document.getElementById('pp-creating').getAttribute('role')")) === "status" && !(await ev("!!document.getElementById('create-pp-btn')")));
    await shot("04-creating.jpg");
    await sleep(500);
    check(g, "three rapid confirm clicks produced exactly ONE POST and one provider create", PPPOST(m).length === 1 && ppCount("create") === 2); // ok + slow
    await waitFor("!!document.getElementById('pp-id')", 12000);
    check(g, "the single request completes as created, with one operation attempt", (await opRow(ID.slow)).startsWith("created|") && (await opRow(ID.slow)).endsWith("|1") && PPPOST(m).length === 1);
    await backToDashboard();
  }

  /* ======================= unknown outcome, reconciliation, no blind retry ======================= */
  {
    const g = "REAL outcome unknown -> reconciliation (fake provider)";
    await openSaved("Pay Unknown");
    const m = mark();
    const creates = ppCount("create");
    await confirmCreate();
    check(g, "502 paypal_outcome_unknown: 'A PayPal draft may or may not exist', neither failure nor success", await waitFor("/may or may not exist/.test(document.getElementById('pp-outcome')?.innerText ?? '')", 8000) && !/PayPal Sandbox DRAFT created/.test(await panelText()));
    await waitFor("document.getElementById('pp-body').innerText.includes('did not confirm')", 6000);
    const t = await panelText();
    check(g, "the page re-read the durable state (GET) and shows 'unknown' with the saved code", /PayPal did not confirm the result/.test(t) && (await opRow(ID.unknown)).startsWith("unknown|"), t);
    check(g, "no automatic create: exactly one POST and one provider create so far", PPPOST(m).length === 1 && ppCount("create") === creates + 1);
    check(g, "both Check status and an explicit 'Retry (checks PayPal first)' are offered", await ev("!!document.getElementById('check-pp-btn') && /Retry \\(checks PayPal first\\)/.test(document.getElementById('create-pp-btn').textContent)"));
    await shot("05-unknown.jpg");
    // read-only check status: zero POST
    const mc = mark();
    await ev("document.getElementById('check-pp-btn').click()");
    await waitFor("document.getElementById('check-pp-btn') && !document.getElementById('check-pp-btn').disabled", 5000);
    check(g, "Check status is READ-ONLY: it re-reads GET detail and issues no POST and no provider call", PPPOST(mc).length === 0 && DETAIL(mc).length >= 1 && ppCount("create") === creates + 1);
    // explicit retry: dialog again, then reconciliation (no second create)
    await clickCreate();
    check(g, "a retry needs a FRESH confirmation dialog", await waitFor("!!document.querySelector('dialog[open]')", 2000));
    const m2 = mark();
    await clickConfirm();
    check(g, "the retry is answered 409 reconciliation_pending and says the server avoids a duplicate, with no new create", await waitFor("/reconciliation_pending/.test(document.getElementById('pp-outcome')?.innerText ?? '')", 8000) && /avoiding a duplicate/.test(await panelText()) && PPPOST(m2).length === 1 && PPPOST(m2)[0].status === 409 && ppCount("create") === creates + 1);
    check(g, "the durable state is still 'unknown' and the provider was only asked to look (find), never to create again", (await opRow(ID.unknown)).startsWith("unknown|") && ppCount("find") >= 1);
    await backToDashboard();
  }

  /* ======================= rejected -> explicit retry ======================= */
  {
    const g = "REAL rejected -> explicit retry (fake provider)";
    await openSaved("Pay Reject");
    await confirmCreate();
    check(g, "502 paypal_rejected is shown as a rejection (no draft), with the sanitized code", await waitFor("/PayPal rejected the request/.test(document.getElementById('pp-body')?.innerText ?? '')", 8000) && /No draft was created/.test(await panelText()) && (await opRow(ID.reject)).startsWith("rejected|"), (await panelText()) + " | " + (await opRow(ID.reject)));
    check(g, "the local invoice is unchanged and an explicit 'Try again' is offered", /Pay Reject/.test(await bodyText()) && (await ev("/Try again/.test(document.getElementById('create-pp-btn')?.textContent ?? '')")));
    await shot("06-rejected.jpg");
    const m = mark();
    await clickCreate();
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    check(g, "no request is made until the retry is confirmed", PPPOST(m).length === 0);
    await clickConfirm();
    check(g, "the explicit retry (fresh attempt) then creates the draft", await waitFor("!!document.getElementById('pp-id')", 10000) && (await opRow(ID.reject)).startsWith("created|") && PPPOST(m).length === 1);
    await backToDashboard();
  }

  /* ======================= mismatch ======================= */
  {
    const g = "REAL mismatch (fake provider returns a different total)";
    await openSaved("Pay Mismatch");
    await confirmCreate();
    check(g, "502 paypal_mismatch: an alert requiring manual investigation", await waitFor("!!document.getElementById('pp-mismatch')", 8000) && /Manual investigation required/.test(await panelText()) && (await ev("document.getElementById('pp-mismatch').getAttribute('role')")) === "alert");
    check(g, "NO retry control is offered and the durable state is 'mismatch'", !(await ev("!!document.getElementById('create-pp-btn')")) && (await opRow(ID.mismatch)).startsWith("mismatch|"));
    await shot("07-mismatch.jpg");
    await backToDashboard();
  }

  /* ======================= mapping refused ======================= */
  {
    const g = "REAL mapping refused (rounding)";
    await openSaved("Pay Refused");
    const creates = ppCount("create");
    const finds = ppCount("find") + ppCount("get");
    await confirmCreate();
    check(g, "422 mapping_refused shows the safe reason and says nothing is rounded silently", await waitFor("/mapping_refused/.test(document.getElementById('pp-outcome')?.innerText ?? '')", 8000) && /line total/.test(await panelText()) && /never rounds silently/.test(await panelText()));
    check(g, "no operation was created, the provider was never called and the local invoice is unchanged", (await opRow(ID.refused)) === "" && ppCount("create") === creates && ppCount("find") + ppCount("get") === finds && /Pay Refused/.test(await bodyText()) && /Not created in PayPal Sandbox/.test(await panelText()));
    check(g, "after the refusal (and its read-back) no create/retry control is offered: no blind retry of a refused mapping", await waitFor("!document.getElementById('create-pp-btn') || document.getElementById('create-pp-btn').disabled", 4000) && /not offered again from this view/.test(await panelText()));
    await shot("08-refused.jpg");
    await backToDashboard();
  }

  /* ======================= currencies ======================= */
  {
    const g = "REAL EUR and JPY totals in the confirmation";
    await openSaved("Pay Euro");
    await clickCreate();
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    check(g, "EUR: the dialog shows €300.00 EUR (server-computed) for that exact invoice", /€300\.00\s*EUR/.test(await dialogText()) && (await dialogText()).includes(ID.eur));
    await clickCancel();
    await backToDashboard();
    await openSaved("Pay Yen");
    await clickCreate();
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    check(g, "JPY: the dialog shows ¥5,000 JPY (no decimals)", /¥5,000\s*JPY/.test(await dialogText()) && (await dialogText()).includes(ID.jpy));
    await clickCancel();
    await backToDashboard();
  }

  /* ======================= response lost: server committed, browser did not see it ======================= */
  {
    const g = "REAL lost response (server creates the draft, the browser loses the answer)";
    await openSaved("Pay Lost");
    const m = mark();
    const creates = ppCount("create");
    await dropResponses(/\/paypal-draft$/);
    await confirmCreate();
    check(g, "the UI says 'a PayPal draft may or may not exist' (not failure, not success)", await waitFor("/may or may not exist/.test(document.getElementById('pp-outcome')?.innerText ?? '')", 10000));
    await stopSimulating();
    await waitFor("!!document.getElementById('pp-id')", 8000);
    check(g, "the automatic READ-ONLY re-read then shows the durable truth: the draft was created", /PayPal draft created/.test(await panelText()) && (await opRow(ID.lost)).startsWith("created|") && ppCount("create") === creates + 1);
    check(g, "exactly one POST was sent, no automatic retry, and no create button is offered", PPPOST(m).length === 1 && !(await ev("!!document.getElementById('create-pp-btn')")));
    await shot("09-lost-response.jpg");
    await backToDashboard();
  }

  /* ======================= SIMULATED server answers ======================= */
  {
    const g = "SIMULATED PayPal-draft answers (interception; the server is not reached)";
    const cases = [
      ["403", { status: 403, body: { error: "csrf_invalid", secret: "LEAK" } }, /did not accept this request/, "Nothing was created"],
      ["404", { status: 404, body: { error: "not_found" } }, /could not be found/, "Nothing was created"],
      ["400", { status: 400, body: { error: "invalid_request" } }, /refused the request/, "Nothing was created"],
      ["200 with an arbitrary body", { status: 200, body: { ok: true } }, /may or may not exist/, ""],
      ["201 with status SENT", { status: 201, body: { paypalInvoiceId: "INV2-X", status: "SENT", replayed: false } }, /may or may not exist/, ""],
      ["500", { status: 500, body: {} }, /may or may not exist/, ""],
      ["503 unavailable", { status: 503, body: { error: "unavailable" } }, /not known whether a draft was started/, ""],
      ["network failure", "fail", /may or may not exist/, ""],
    ];
    for (const [name, r, re] of cases) {
      await openSaved("Pay Simulated");
      await simulate((p) => (p.request.method === "POST" && /\/paypal-draft$/.test(p.request.url) ? r : "continue"));
      const before = ppCount("create");
      await confirmCreate();
      const ok = await waitFor("!!document.getElementById('pp-outcome')", 6000);
      const t = await bodyText();
      check(g, `${name}: fails closed (${re.source.slice(0, 28)}…), never a created draft, no LEAK`, ok && re.test(t) && !/PayPal Sandbox DRAFT created|PayPal draft created/.test(t) && !/LEAK|INV2-X/.test(t) && ppCount("create") === before, t.slice(0, 160));
      await stopSimulating();
      await backToDashboard();
    }
    // 409 in_progress simulated: the panel offers read-only status only
    await openSaved("Pay Simulated");
    await simulate((p) => (p.request.method === "POST" && /\/paypal-draft$/.test(p.request.url) ? { status: 409, body: { error: "in_progress" } } : "continue"));
    await confirmCreate();
    await waitFor("!!document.getElementById('pp-outcome')", 5000);
    check(g, "409 in_progress: says another attempt is in flight and will not repeat; create stays hidden until the state is read", /will not be repeated automatically/.test(await panelText()));
    await stopSimulating();
    await backToDashboard();
    // detail refresh failing after a successful create keeps the id visible but flags staleness
    const mm = mark();
    check(g, "(no PayPal-draft request was made by merely opening these invoices)", PPPOST(mm).length === 0);
  }

  /* ======================= MAJOR-1: POST succeeds, the authoritative GET is delayed / fails / is malformed ======================= */
  {
    const g = "REAL POST + SIMULATED detail GET failure (MAJOR-1: fail closed until the read-back lands)";
    let getMode = "continue";
    const detailRe = /\/api\/invoice-drafts\/[0-9a-f-]{36}$/;
    const startRule = () => simulate((p) => {
      if (!(p.request.method === "GET" && detailRe.test(p.request.url))) return "continue";
      if (getMode === "hold") return "hold";
      if (getMode === "500") return { status: 500, body: {} };
      if (getMode === "junk") return { status: 200, body: { id: "x", draft: {} } };
      return "continue";
    });
    const offered = () => ev("!!document.getElementById('create-pp-btn') && !document.getElementById('create-pp-btn').disabled");
    const blocked = async (label) => check(g, label, !(await offered()) && /Saved state not yet confirmed/.test(await ev("document.getElementById('pp-body').innerText")) && (await ev("!!document.getElementById('check-pp-btn')")));
    const checkStatus = async () => { await ev("document.getElementById('check-pp-btn').click()"); await sleep(700); };

    // A. created, GET delayed (held), then failed, then Check status failing, then recovering
    await openSaved("Pay GetDelay");
    getMode = "hold";
    await startRule();
    const mA = mark();
    await confirmCreate();
    await waitFor("/DRAFT created/.test(document.getElementById('pp-outcome')?.innerText ?? '')", 8000);
    check(g, "created: the POST succeeded and the draft exists in the fake provider and the operation row", (await opRow(ID.getdelay)).startsWith("created|") && PPPOST(mA).length === 1 && PPPOST(mA)[0].status === 201);
    await blocked("created + DELAYED GET: no Create control and 'Saved state not yet confirmed' with Check status only");
    check(g, "created + delayed GET: the page does not claim the record was re-read", /has not been re-read yet/.test(await panelText()));
    await shot("14-created-get-delayed.jpg");
    await releaseHeld("fail");
    await waitFor("!!document.getElementById('pp-read-failed')", 4000);
    await blocked("created + FAILED GET: still no Create control, with a stale-data warning");
    check(g, "created + failed GET: exactly one POST and one provider create (no retry happened)", PPPOST(mA).length === 1);
    getMode = "500";
    await checkStatus();
    await blocked("Check status that ALSO fails (500) leaves creation blocked");
    getMode = "continue";
    await checkStatus();
    check(g, "once a GET succeeds the durable 'created' state, id and DRAFT label are shown and nothing can be created", await waitFor("!!document.getElementById('pp-id')", 5000) && !(await offered()));
    await stopSimulating();
    await backToDashboard();

    // B. mismatch + failed GET: never a retry
    await openSaved("Pay GetMismatch");
    getMode = "500";
    await startRule();
    const mB = mark();
    await confirmCreate();
    await waitFor("/does not match this invoice/.test(document.getElementById('pp-outcome')?.innerText ?? '')", 8000);
    await blocked("mismatch + FAILED GET: no retry control (the prop still says 'not created')");
    check(g, "mismatch + failed GET: durable state is 'mismatch', exactly one POST, one create", (await opRow(ID.getmm)).startsWith("mismatch|") && PPPOST(mB).length === 1);
    await shot("15-mismatch-get-failed.jpg");
    getMode = "continue";
    await checkStatus();
    check(g, "after a successful read the mismatch alert is shown and still NO retry is offered", await waitFor("!!document.getElementById('pp-mismatch')", 5000) && !(await offered()));
    await stopSimulating();
    await backToDashboard();

    // C. created + malformed GET (200 with junk) is a failed read-back
    await openSaved("Pay GetMalformed");
    getMode = "junk";
    await startRule();
    await confirmCreate();
    await waitFor("/DRAFT created/.test(document.getElementById('pp-outcome')?.innerText ?? '')", 8000);
    await waitFor("!!document.getElementById('pp-read-failed')", 4000);
    await blocked("created + MALFORMED GET: treated as a failed read-back; no Create control");
    getMode = "continue";
    await checkStatus();
    check(g, "a valid GET afterwards shows the created draft and nothing to create", await waitFor("!!document.getElementById('pp-id')", 5000) && !(await offered()));
    await stopSimulating();
    await backToDashboard();
  }

  /* ======================= keyboard ======================= */
  {
    const g = "REAL keyboard operation";
    await openSaved("Pay Keyboard");
    await ev("document.getElementById('create-pp-btn').focus()");
    await press("Enter");
    check(g, "Enter on 'Create PayPal Sandbox draft…' opens the dialog and focus lands on Cancel", (await waitFor("!!document.querySelector('dialog[open]')", 2000)) && (await ev("document.activeElement.textContent.trim()")) === "Cancel");
    await press("Tab");
    check(g, "Tab moves to the confirm button inside the dialog", (await ev("document.activeElement.textContent.trim()")) === "Create PayPal Sandbox draft");
    await press("Tab");
    check(g, "Tab wraps back to Cancel (focus is trapped in the dialog)", (await ev("document.activeElement.textContent.trim()")) === "Cancel" && (await ev("!!document.activeElement.closest('dialog')")));
    await press("Tab", true);
    check(g, "Shift+Tab wraps to the confirm button", (await ev("document.activeElement.textContent.trim()")) === "Create PayPal Sandbox draft");
    const m = mark();
    await press("Escape");
    check(g, "Escape closes the dialog, restores focus to the Create button, sends nothing", (await waitFor("!document.querySelector('dialog[open]')", 1500)) && (await ev("document.activeElement.id")) === "create-pp-btn" && PPPOST(m).length === 0);
    await press("Enter");
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    await press("Tab");
    await press("Enter"); // keyboard confirm
    check(g, "keyboard confirm creates the draft with a single POST", (await waitFor("!!document.getElementById('pp-id')", 10000)) && PPPOST(m).length === 1 && PPPOST(m)[0].status === 201);
    await backToDashboard();
  }

  /* ======================= mobile + dark ======================= */
  {
    const g = "REAL 390px mobile and dark theme";
    await viewport(390, 844, true);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await signInAs(USER, PASSWORD);
    await openSaved("Pay Mobile");
    let ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow at 390px (saved invoice with the PayPal panel)", ov === "", ov);
    await clickCreate();
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    ov = await ev(OVERFLOW);
    const dlgFits = await ev("(() => { const r = document.querySelector('dialog[open]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })()");
    check(g, "the confirmation dialog fits the 390px viewport and the page does not overflow", dlgFits && ov === "", ov);
    let c = await ev(CONTRAST_SCAN);
    check(g, "dialog text contrast >= WCAG AA (dark, 390px)", c.length === 0, JSON.stringify(c));
    await shot("10-mobile-dark-dialog.jpg");
    await clickConfirm();
    await waitFor("!!document.getElementById('pp-id')", 10000);
    ov = await ev(OVERFLOW);
    c = await ev(CONTRAST_SCAN);
    check(g, "created panel: no overflow and AA contrast (dark, 390px)", ov === "" && c.length === 0, ov + JSON.stringify(c));
    await shot("11-mobile-dark-created.jpg");
    await backToDashboard();
    await openSaved("Pay Unknown");
    ov = await ev(OVERFLOW);
    c = await ev(CONTRAST_SCAN);
    check(g, "unknown-state panel (warning/alert styling): no overflow and AA contrast (dark, 390px)", ov === "" && c.length === 0, ov + JSON.stringify(c));
    await shot("12-mobile-dark-unknown.jpg");
    await viewport(1280, 900);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    const cl = await ev(CONTRAST_SCAN);
    check(g, "light desktop: the unknown-state panel meets AA contrast", cl.length === 0, JSON.stringify(cl));
    await backToDashboard();
  }

  /* ======================= 401 mid-flight ======================= */
  {
    const g = "REAL session expiry during a create";
    await openSaved("Pay Expire");
    await clickCreate();
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
    const m = mark();
    const creates = ppCount("create");
    await clickConfirm();
    check(g, "a real 401 ends the session at once: sign-in shows, no dialog, no protected UI", await waitFor("!!document.getElementById('login-title') && !document.querySelector('.app-nav') && !document.querySelector('dialog[open]')", 6000));
    check(g, "the POST returned 401, the provider was never called and no operation exists", PPPOST(m)[0]?.status === 401 && ppCount("create") === creates && (await opRow(ID.expire)) === "");
    check(g, "no customer data remains in the page", !/Pay Expire|Pay Ok|@c5\.example/.test(await ev("document.documentElement.outerHTML")));
  }

  /* ======================= disabled provider ======================= */
  {
    const g = "REAL provider disabled on the server (PAYPAL_DRAFTS_ENABLED=false)";
    await stopApi();
    await startApi({ PAYPAL_DRAFTS_ENABLED: "false" });
    await signInAs(USER, PASSWORD);
    await openSaved("Pay Expire");
    const m = mark();
    const calls = ppCalls().length;
    await confirmCreate();
    check(g, "503 paypal_disabled is explained and says nothing was sent anywhere", await waitFor("/paypal_disabled/.test(document.getElementById('pp-outcome')?.innerText ?? '')", 6000) && /switched off on the server/.test(await panelText()) && /local invoices keep working/i.test(await panelText()));
    check(g, "the create control is disabled so the disabled server is not probed again", await ev("!document.getElementById('create-pp-btn') || document.getElementById('create-pp-btn').disabled"));
    await sleep(500);
    const m2 = mark();
    await ev("document.getElementById('create-pp-btn')?.click()");
    await sleep(400);
    check(g, "exactly one POST was sent, a further click sends nothing, and the provider was never called", PPPOST(m).length === 1 && PPPOST(m2).length === 0 && ppCalls().length === calls && (await opRow(ID.expire)) === "");
    await shot("13-disabled.jpg");
    check(g, "local invoice data stays usable (customer and totals still shown)", /Pay Expire/.test(await bodyText()) && /\$500\.00/.test(await bodyText()));
  }

  /* ======================= global invariants ======================= */
  {
    const g = "Global invariants";
    const s = await ev(STORAGE);
    check(g, "no localStorage/sessionStorage/IndexedDB/Cache entries", s.local === 0 && s.session === 0 && s.idb === 0 && s.caches === 0, JSON.stringify(s));
    check(g, "no script-readable cookie; the browser navigation URL carries no customer data, ids or PayPal ids", s.cookie === "" && !/Pay |@|INV2|[0-9a-f]{8}-[0-9a-f]{4}-/.test(s.href), s.href);
    check(g, "no request left the app origin (no PayPal, OpenAI or other host)", foreign.length === 0, JSON.stringify(foreign));
    const paths = new Set(netLog.filter((n) => n.path.startsWith("/api/")).map((n) => n.path.replace(/[0-9a-f-]{36}/, ":id").replace(/\?.*$/, "")));
    check(g, "the browser used only the auth, save/list/detail and PayPal-draft routes", [...paths].every((p) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts(\/:id(\/paypal-draft)?)?)$/.test(p)), [...paths].join(","));
    check(g, "no send, remind, cancel, refund, payment or webhook route was ever requested", !netLog.some((n) => /send|remind|cancel|refund|payment|webhook|capture/i.test(n.path)));
    check(g, "the browser never called PayPal-draft with GET and never sent a body or any customer data in it", netLog.filter((n) => /\/paypal-draft$/.test(n.path)).every((n) => n.method === "POST" && (n.body ?? null) === null));
    const log = ppCalls();
    check(g, "the fake provider saw only create/get/find (the only operations the app can express); real PayPal was never constructed", log.every((x) => ["create", "get", "find"].includes(x)) && log.length > 0);
    check(g, "no OpenAI/model call was made (no model client configured)", modelCalls() === 0);
    const apiLogText = readFileSync(apiLog, "utf8");
    check(g, "the API log holds no customer name, e-mail, CSRF token or cookie value", !/Pay (Ok|Slow|Unknown|Reject)|@c5\.example|csrf-token\"?:\s*\"[A-Za-z0-9]/.test(apiLogText));
    check(g, "no console errors or uncaught exceptions in the browser", consoleMsgs.filter((x) => !/Failed to load resource|net::ERR|status of (4|5)\d\d/.test(x)).length === 0, consoleMsgs.slice(0, 5).join(" / "));
  }
} catch (e) {
  record("harness", "unexpected failure", false, String(e?.stack || e).slice(0, 600));
} finally {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const lines = [
    "# NMI-UI-01C5-P1 browser PayPal-draft journey",
    "",
    `Chrome: ${version?.Browser ?? "unknown"} (headless). PostgreSQL: ${run(join(PG_BIN, "postgres"), ["--version"]).trim()} (disposable cluster, destroyed after the run).`,
    "Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.",
    "Privacy scope of the checks below: they prove the browser NAVIGATION URL and browser storage hold no customer data and that the Fastify request log has query strings stripped. They do NOT claim the HTTP GET request URL is free of customer data (the search term travels in `q`), and no reverse proxy, ingress, CDN or access log was exercised (untested). Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; PayPal is a DETERMINISTIC FAKE injected behind the real routes and draft state machine (`test-api-server.ts`); these results prove the UI, transport and local state machine, NOT real PayPal behaviour. No OpenAI client exists. Invoices are created through the real save route.",
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
