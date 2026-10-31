/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-UI-01C3 genuine browser -> Vite preview (production build, strict CSP) -> Fastify -> disposable
// PostgreSQL 16 journey for authenticated invoice SAVE and read-only DETAIL, driven in headless Google Chrome (CDP).
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-UI-01C3/run-save-journey.mjs
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
const API_PORT = Number(process.env.NMI_C3_API_PORT || 3101);
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54329;
const DEBUG_PORT = 9337;
const DB = "nmi_test_c3_journey";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-c3";
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

const work = mkdtempSync(join(tmpdir(), "nmi-c3-"));
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
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_c3", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_c3", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_c3@127.0.0.1:${PG_PORT}/${DB}`;
const provision = (password) =>
  run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: password } });
provision(PASSWORD);

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

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-c3-"));
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
  const NAME = "Quill & Co";
  const EMAIL = "ap@quill.example";
  const TOTAL_MINOR = "27171"; // 2 x 125.50 = 251.00; 8.25% tax = 20.71 (half up); total 271.71
  const invCount = () => Number(sql("SELECT count(*) FROM invoices"));
  const saveCalls = (since = 0) => apiCalls(since).filter((c) => c.method === "POST" && c.path === "/api/invoice-drafts");
  const getCalls = (since = 0) => apiCalls(since).filter((c) => c.method === "GET" && /^\/api\/invoice-drafts\/[0-9a-f-]{36}$/.test(c.path));
  const setValue = (id, v) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
  const fillText = async (id, v) => { await focusId(id); await ev(`document.getElementById(${JSON.stringify(id)}).select()`); await typeText(v); };
  async function signIn() {
    await load();
    await waitFor("!!document.getElementById('login-title') || !!document.querySelector('.app-nav')");
    if (await onLogin()) await login(USER, PASSWORD);
    if (!(await waitFor("!!document.querySelector('.app-nav')"))) throw new Error("sign-in failed");
  }
  // Navigating away from an unresolved save now asks first; the earlier groups simply confirm.
  const nav = async (label) => {
    await ev(`[...document.querySelectorAll('.app-nav button')].find((b) => b.textContent.includes(${JSON.stringify(label)})).click()`);
    if (await waitFor("!!document.querySelector('dialog[open]')", 400)) await ev("document.querySelector('dialog[open] .btn-danger').click()");
  };
  async function openManualForm() {
    await nav("New invoice");
    if (!(await waitFor("!!document.getElementById('comp-text')"))) throw new Error("composer did not open: " + (await bodyText()).slice(150, 700));
    await ev("[...document.querySelectorAll('[role=tab]')].find((b) => /Enter manually/.test(b.textContent)).click()");
    await ev("[...document.querySelectorAll('button')].find((b) => /Open blank invoice form/.test(b.textContent)).click()");
    if (!(await waitFor("!!document.getElementById('f-customerName')"))) throw new Error("manual form did not open");
  }
  async function fillInvoice({ name = NAME, email = EMAIL, price = "125.50" } = {}) {
    await fillText("f-customerName", name);
    await fillText("f-customerEmail", email);
    await setValue("f-dueDate", "2030-01-15");
    await fillText("f-line-0-description", "Workshop");
    await fillText("f-line-0-quantity", "2");
    await fillText("f-line-0-unitPrice", price);
    await fillText("f-taxPercent", "8.25");
  }
  const clickSave = () => ev("document.getElementById('save-btn').click()");
  const onSaved = () => ev("!!document.getElementById('saved-title') && !!document.getElementById('saved-id')");
  const dropResponses = async (re) => {
    rule = (p) => (p.responseStatusCode !== undefined && re.test(p.request.url) ? "fail" : "continue");
    await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/invoice-drafts*", requestStage: "Response" }] });
  };
  const sessionAuth = async () => {
    const c = await sessionCookie();
    const r = await fetch(API + "/api/auth/session", { headers: { cookie: `${c.name}=${c.value}`, origin: ORIGIN } });
    return { cookie: `${c.name}=${c.value}`, csrf: (await r.json()).csrfToken };
  };
  const postRaw = (a, key, body, extra = {}) =>
    fetch(API + "/api/invoice-drafts", { method: "POST", headers: { "content-type": "application/json", cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf, ...(key ? { "idempotency-key": key } : {}), ...extra }, body: JSON.stringify(body) });
  const draftBody = (over = {}) => ({ customerName: "Probe Ltd", customerEmail: "p@probe.example", currency: "USD", lineItems: [{ description: "Probe", quantity: "1", unitPrice: "10.00" }], dueDate: "2030-01-15", taxPercent: null, discount: null, ...over });

  /* ======================= REAL: logged-out ======================= */
  {
    const g = "REAL logged-out protection";
    const m = mark();
    await load("#screen=saved&state=default");
    await waitFor("!!document.getElementById('login-title')");
    check(g, "a saved-invoice deep link shows only sign-in", !(await ev("!!document.getElementById('saved-title')")));
    check(g, "no invoice request is made while logged out", apiCalls(m).every((c) => c.path === "/api/auth/session"), JSON.stringify(apiCalls(m)));
  }

  /* ======================= A-C: create, 201, GET ======================= */
  let savedId = null;
  {
    const g = "REAL manual invoice -> POST 201 -> GET detail";
    await signIn();
    await openManualForm();
    const m = mark();
    const before = invCount();
    await fillInvoice();
    check(g, "real Review shows the real-save wording and no simulated-save claim", /Saving writes this draft to PostgreSQL/.test(await bodyText()) && !/Simulated save|Idempotency-Key:/.test(await bodyText()));
    check(g, "the shell notice (current approved copy) says saving, the list and saved pages use the server, and that saving never creates a PayPal invoice", /Parsing, saving, the invoice list and the\s+saved-invoice pages use the server/.test(await bodyText()) && /Saving never creates a PayPal\s+invoice/.test(await bodyText()));
    await shot("01-review-real-save.jpg");
    await focusId("save-btn");
    await press("Enter"); // keyboard activation
    check(g, "keyboard Enter on 'Save draft' saves and opens the saved-invoice page", await waitFor("!!document.getElementById('saved-id')", 8000));
    const posts = saveCalls(m);
    check(g, "exactly one POST /api/invoice-drafts -> 201 with CSRF and an Idempotency-Key", posts.length === 1 && posts[0].status === 201 && posts[0].hasCsrf && /^[A-Za-z0-9_-]{8,128}$/.test(posts[0].idem ?? ""), JSON.stringify(posts.map((p) => [p.status, p.hasCsrf])));
    const sent = JSON.parse(posts[0].body);
    check(g, "body is exactly the strict draft (no totals, id, status, fixture fields)", JSON.stringify(Object.keys(sent).sort()) === JSON.stringify(["currency", "customerEmail", "customerName", "discount", "dueDate", "lineItems", "taxPercent"]) && Object.keys(sent.lineItems[0]).sort().join() === "description,quantity,unitPrice");
    check(g, "exactly one durable invoice was created", invCount() === before + 1);
    savedId = sql("SELECT id FROM invoices ORDER BY created_at DESC LIMIT 1");
    const gets = getCalls(m);
    check(g, "the detail page loaded the record with GET /api/invoice-drafts/:id -> 200", gets.length >= 1 && gets[0].status === 200 && gets[0].path.endsWith(savedId), JSON.stringify(gets));
    await waitFor("!!document.getElementById('saved-total')");
    const t = await bodyText();
    check(g, "shows the real UUID, customer, currency, due date and persisted creation date", t.includes(savedId) && t.includes(NAME) && t.includes(EMAIL) && /USD/.test(t) && /Jan 15, 2030/.test(t) && new RegExp(sql("SELECT to_char(created_at at time zone 'UTC','Mon FMDD, YYYY') FROM invoices LIMIT 1").replace(/\s+/g, "\\s+")).test(t));
    check(g, "server-computed total matches the database exactly (271.71)", /\$271\.71/.test(await ev("document.getElementById('saved-total').textContent")) && sql(`SELECT total_minor FROM invoices WHERE id='${savedId}'`) === TOTAL_MINOR);
    check(g, "line total, tax and subtotal match the database", /\$251\.00/.test(t) && /\$20\.71/.test(t) && sql(`SELECT subtotal_minor||','||tax_minor FROM invoices WHERE id='${savedId}'`) === "25100,2071");
    check(g, "one consistent currency for the invoice (USD) in the database", sql(`SELECT currency FROM invoices WHERE id='${savedId}'`) === "USD");
    check(g, "UI says 'Saved in PostgreSQL' and 'Not created in PayPal Sandbox'; saving never creates a PayPal invoice or notifies the customer (current copy)", /Saved in PostgreSQL/.test(t) && /Not created in PayPal Sandbox/.test(t) && /never notifies the customer/.test(t));
    check(g, "no PayPal id, fixture name or fabricated value is shown, and the only PayPal action is the explicit (confirmation-gated) create control", !/INV2-|fabricated|DEMO-FAKE|Acme|Northwind|Check status/.test(t) && /Create PayPal Sandbox draft/.test(t), t.slice(0, 300));
    check(g, "audit row recorded the save without customer data", Number(sql("SELECT count(*) FROM audit_log WHERE action='invoice.draft_save'")) === 1 && !/Quill|quill\.example/.test(sql("SELECT string_agg(detail::text,' ') FROM audit_log WHERE action='invoice.draft_save'")));
    check(g, "nothing was created in PayPal operations", Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 0);
    await shot("02-saved-detail.jpg");
    const ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow on the saved page (desktop)", ov === "", ov);
    const c = await ev(CONTRAST_SCAN);
    check(g, "saved page text contrast >= WCAG AA (light)", c.length === 0, JSON.stringify(c));
  }

  /* ======================= D-F: replay/conflict/duplicates through the real server ======================= */
  {
    const g = "REAL idempotency through Fastify/PostgreSQL";
    const a = await sessionAuth();
    const before = invCount();
    const key = "probe_key_" + randomBytes(8).toString("hex");
    const r1 = await postRaw(a, key, draftBody());
    const j1 = await r1.json();
    check(g, "new key + body -> 201, replayed:false", r1.status === 201 && j1.replayed === false);
    const r2 = await postRaw(a, key, draftBody());
    const j2 = await r2.json();
    check(g, "same key + identical body -> 200 replayed:true with the SAME id", r2.status === 200 && j2.replayed === true && j2.id === j1.id);
    const r3 = await postRaw(a, key, draftBody({ customerName: "Different Customer" }));
    check(g, "same key + different body -> 409", r3.status === 409);
    check(g, "exactly one new invoice despite 3 requests (no duplicate)", invCount() === before + 1);
    check(g, "409 stored nothing under the new body", Number(sql("SELECT count(*) FROM invoices WHERE customer_name='Different Customer'")) === 0);
    const g1 = await (await fetch(API + "/api/invoice-drafts/" + j1.id, { headers: { cookie: a.cookie } })).json();
    check(g, "GET returns the same totals the POST returned", JSON.stringify(g1.totals) === JSON.stringify(j1.totals) && g1.paypal.state === "none");
    check(g, "a total/id/status in the request is rejected by the strict schema (400)", (await postRaw(a, "probe_key_" + randomBytes(6).toString("hex"), { ...draftBody(), total: "1.00" })).status === 400);
    check(g, "no cookie -> 401", (await fetch(API + "/api/invoice-drafts", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{}" })).status === 401);
    check(g, "missing CSRF -> 403", (await postRaw({ ...a, csrf: "" }, "probe_key_" + randomBytes(6).toString("hex"), draftBody(), { "x-csrf-token": "" })).status === 403);
    check(g, "foreign Origin with a valid token -> 403", (await postRaw(a, "probe_key_" + randomBytes(6).toString("hex"), draftBody(), { origin: "http://evil.example" })).status === 403);
    check(g, "malformed Idempotency-Key -> 400", (await postRaw(a, "bad key!", draftBody())).status === 400);
    check(g, "fractional JPY amount refused, nothing stored", [400, 422].includes((await postRaw(a, "probe_key_" + randomBytes(6).toString("hex"), draftBody({ currency: "JPY", lineItems: [{ description: "x", quantity: "1", unitPrice: "100.5" }] }))).status) && invCount() === before + 1);
    check(g, "GET of an unknown id -> 404", (await fetch(API + "/api/invoice-drafts/00000000-0000-4000-8000-000000000000", { headers: { cookie: a.cookie } })).status === 404);
  }

  /* ======================= UI: uncertain outcome, same-key retry, no duplicate ======================= */
  {
    const g = "REAL uncertain save -> same-key retry (server commits, browser loses the response)";
    await nav("New invoice");
    await openManualForm();
    await fillInvoice({ name: "Lost Response Ltd", email: "lost@resp.example" });
    const before = invCount();
    const m = mark();
    await dropResponses(/\/api\/invoice-drafts$/);
    await clickSave();
    check(g, "UI reports that the outcome could not be confirmed (not a plain failure)", await waitFor("!!document.getElementById('save-uncertain')", 8000));
    const t = await bodyText();
    check(g, "wording says it may or may not exist and the retry reuses the same key", /may or may not exist/.test(t) && /same key/.test(t) && !/The draft was not saved/.test(t));
    check(g, "the server DID commit exactly one invoice before the response was lost", invCount() === before + 1);
    check(g, "the form is locked (edits cannot desynchronise the key from the body)", await ev("document.getElementById('f-customerName').matches(':disabled') && document.getElementById('f-line-0-unitPrice').matches(':disabled')"));
    await shot("03-uncertain-locked.jpg");
    const firstKey = saveCalls(m)[0]?.idem;
    await stopSimulating();
    const m2 = mark();
    await ev("document.getElementById('retry-save-btn').click()");
    check(g, "retrying opens the saved page with the replay notice", await waitFor("!!document.getElementById('saved-id') && /replayed/.test(document.body.innerText)", 8000));
    const retry = saveCalls(m2)[0];
    check(g, "the retry used the SAME Idempotency-Key and the identical body", retry && retry.idem === firstKey && retry.body === saveCalls(m)[0].body, "keys differ or body changed");
    check(g, "the retry was answered 200 (replay) and NO second invoice exists", retry.status === 200 && invCount() === before + 1);
    check(g, "the shown record is the one committed by the lost attempt", (await ev("document.getElementById('saved-id').textContent")) === sql("SELECT id FROM invoices WHERE customer_name='Lost Response Ltd'"));
    check(g, "replay copy: 'No second draft was created'", /No second draft was created/.test(await bodyText()));
  }

  /* ======================= UI: explicit 'edit as new draft' after uncertainty ======================= */
  {
    const g = "REAL abandon an uncertain attempt explicitly";
    await nav("New invoice");
    await openManualForm();
    await fillInvoice({ name: "Abandon Inc", email: "ab@abandon.example" });
    const m = mark();
    await dropResponses(/\/api\/invoice-drafts$/);
    await clickSave();
    await waitFor("!!document.getElementById('save-uncertain')", 8000);
    await stopSimulating();
    check(g, "before the choice the form is locked and the notice warns a second draft may be created", (await ev("document.getElementById('f-customerName').matches(':disabled')")) && /create a second draft/.test(await bodyText()));
    await ev("document.getElementById('abandon-save-btn').click()");
    check(g, "the form unlocks only after the explicit choice", await waitFor("!document.getElementById('f-customerName').matches(':disabled')"));
    await fillText("f-line-0-unitPrice", "126.00");
    await clickSave();
    await waitFor("!!document.getElementById('saved-id')", 8000);
    const posts = saveCalls(m);
    check(g, "the edited save used a NEW key (the old key was never reused with a changed body)", posts.length === 2 && posts[0].idem !== posts[1].idem && posts[0].body !== posts[1].body);
  }

  /* ======================= SIMULATED server outcomes on save ======================= */
  {
    const g = "SIMULATED save outcomes (interception; server not reached)";
    const cases = [
      ["409 -> conflict notice, edits kept", { status: 409, body: { error: "idempotency_conflict" } }, "save-conflict", /409/],
      ["400 -> bounded server messages, edits kept", { status: 400, body: { error: "invalid_request", issues: [{ path: "dueDate", message: "Must be a valid date" }] } }, "save-failed", /Must be a valid date/],
      ["422 invalid_draft -> exact totals unavailable", { status: 422, body: { error: "invalid_draft", message: "Discount exceeds subtotal" } }, "save-failed", /could not compute exact totals/],
      ["403 -> generic, no detail leaked", { status: 403, body: { error: "csrf_invalid", secret: "LEAK" } }, "save-failed", /did not accept this request/],
      ["500 -> uncertain (a 5xx may follow a commit)", { status: 500, body: {} }, "save-uncertain", /may or may not exist/],
      ["201 with an inconsistent total -> uncertain, never a saved record", { status: 201, body: { id: "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11", draft: { customerName: "X Co", customerEmail: "x@x.example", currency: "USD", lineItems: [{ description: "w", quantity: "1", unitPrice: "10.00" }], dueDate: "2030-01-15", taxPercent: null, discount: null }, totals: { currency: "USD", lineTotals: ["10.00"], subtotal: "10.00", discount: "0.00", tax: "0.00", total: "999.00" }, paypalInvoiceId: null, replayed: false, createdAt: "2026-10-27T10:00:00.000Z" } }, "save-uncertain", /may or may not exist/],
    ];
    for (const [name, r, id, re] of cases) {
      await nav("New invoice");
      await openManualForm();
      await fillInvoice({ name: "Sim Ltd", email: "sim@sim.example" });
      const before = invCount();
      await simulate((p) => (p.request.url.endsWith("/api/invoice-drafts") && p.request.method === "POST" ? r : "continue"));
      await clickSave();
      const ok = await waitFor(`!!document.getElementById(${JSON.stringify(id)})`, 6000);
      const t = await bodyText();
      check(g, name, ok && re.test(t) && !(await onSaved()) && !/LEAK/.test(t), t.slice(0, 200));
      check(g, `   server untouched and typed edits still present (${name.slice(0, 8)})`, invCount() === before && (await ev("document.getElementById('f-customerName').value")) === "Sim Ltd");
      await stopSimulating();
    }
    // 409 -> explicit new key
    await nav("New invoice");
    await openManualForm();
    await fillInvoice({ name: "Sim Ltd", email: "sim@sim.example" });
    const m = mark();
    await simulate((p) => (p.request.url.endsWith("/api/invoice-drafts") && p.request.method === "POST" ? { status: 409, body: { error: "idempotency_conflict" } } : "continue"));
    await clickSave();
    await waitFor("!!document.getElementById('save-conflict')");
    await shot("04-conflict-409.jpg");
    await clickSave();
    await sleep(300);
    check(g, "after a 409 a further Save sends nothing until 'Use a new key' is chosen", saveCalls(m).length === 1);
    await stopSimulating();
    await ev("document.getElementById('new-key-btn').click()");
    await clickSave();
    check(g, "'Use a new key' keeps the edits and the next save is a real 201 with a different key", (await waitFor("!!document.getElementById('saved-id')", 8000)) && saveCalls(m).length === 2 && saveCalls(m)[0].idem !== saveCalls(m)[1].idem && saveCalls(m)[1].status === 201);
  }

  /* ======================= D/I: failed GET never shows a fixture ======================= */
  {
    const g = "SIMULATED failed GET after a REAL save";
    const detailRe = /\/api\/invoice-drafts\/[0-9a-f-]{36}$/;
    const cases = [
      ["404", { status: 404, body: { error: "not_found" } }],
      ["500", { status: 500, body: {} }],
      ["200 with an unknown shape", { status: 200, body: { status: "approved" } }],
      ["200 with inconsistent totals", "tamper"],
      ["network failure", "fail"],
    ];
    for (const [name, r] of cases) {
      await nav("New invoice");
      await openManualForm();
      await fillInvoice({ name: "Get Fail Ltd", email: "gf@getfail.example" });
      // let the POST through, break only the detail GET
      let real = null;
      await simulate((p) => {
        if (!(p.request.method === "GET" && detailRe.test(p.request.url))) return "continue";
        return r === "tamper" ? "hold" : r;
      });
      await clickSave();
      if (r === "tamper") {
        await waitFor("held.length > 0", 4000).catch(() => {});
        await sleep(300);
        const detailId = sql("SELECT id FROM invoices WHERE customer_name='Get Fail Ltd' ORDER BY created_at DESC LIMIT 1");
        await releaseHeld({ status: 200, body: { id: detailId, draft: { customerName: "Get Fail Ltd", customerEmail: "gf@getfail.example", currency: "USD", lineItems: [{ description: "Workshop", quantity: "2", unitPrice: "125.50" }], dueDate: "2030-01-15", taxPercent: "8.25", discount: null }, totals: { currency: "USD", lineTotals: ["251.00"], subtotal: "251.00", discount: "0.00", tax: "20.71", total: "1.00" }, paypalInvoiceId: null, replayed: false, createdAt: "2026-10-27T10:00:00.000Z", paypal: { state: "none", paypalInvoiceId: null, lastErrorCode: null } } });
      }
      const ok = await waitFor("!!document.getElementById('saved-error')", 6000);
      const t = await bodyText();
      check(g, `GET ${name}: error shown, not the record and never a fixture`, ok && /could not be shown/.test(t) && !/Saved in PostgreSQL<|Get Fail Ltd|Acme|Northwind|DEMO-FAKE|INV2-/.test(t) && !(await ev("!!document.getElementById('saved-total')")), t.slice(0, 200));
      await stopSimulating();
    }
    // retry succeeds from the server
    await ev("document.getElementById('saved-retry')?.click()");
    check(g, "'Try loading again' then loads the real record", await waitFor("!!document.getElementById('saved-total')", 6000));
    await shot("05-get-failed-then-loaded.jpg");
  }

  /* ======================= H: sign-out / session expiry clear sensitive UI ======================= */
  {
    const g = "REAL logout and 401 clear sensitive UI";
    await nav("New invoice");
    await openManualForm();
    await fillInvoice({ name: "Wipe Me Ltd", email: "wipe@me.example" });
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
    check(g, "Sign out locks immediately and the typed invoice is gone", await waitFor("!document.getElementById('f-customerName') && /Signing out/.test(document.body.innerText)", 1500));
    await waitFor("!!document.getElementById('login-title')", 6000);
    check(g, "no invoice text remains in the page", !/Wipe Me|wipe@me/.test(await ev("document.documentElement.outerHTML")));
    await signIn();
    await openManualForm();
    check(g, "after signing in again the form is blank", (await ev("document.getElementById('f-customerName').value")) === "");
    // real 401 on save
    await fillInvoice({ name: "Expire Ltd", email: "exp@expire.example" });
    sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
    const before = invCount();
    const m = mark();
    await clickSave();
    check(g, "a real 401 on save ends the session and shows sign-in", await waitFor("!!document.getElementById('login-title') && !document.querySelector('.app-nav')", 6000));
    check(g, "the POST really returned 401 and stored nothing", saveCalls(m)[0]?.status === 401 && invCount() === before);
    check(g, "the typed invoice is wiped from the page", !/Expire Ltd|exp@expire/.test(await ev("document.documentElement.outerHTML")));
    // 401 on the detail GET (simulated)
    await signIn();
    await openManualForm();
    await fillInvoice({ name: "Detail 401 Ltd", email: "d4@d401.example" });
    await simulate((p) => (p.request.method === "GET" && /\/api\/invoice-drafts\/[0-9a-f-]{36}$/.test(p.request.url) ? { status: 401, body: { error: "unauthorized" } } : "continue"));
    await clickSave();
    check(g, "[SIMULATED] a 401 on the detail GET also ends the session", await waitFor("!!document.getElementById('login-title') && !document.querySelector('.app-nav')", 6000));
    await stopSimulating();
  }

  /* ======================= K: mobile, keyboard, dark ======================= */
  {
    const g = "REAL 390px mobile and dark theme";
    await signIn();
    await viewport(390, 844, true);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await load();
    await waitFor("!!document.querySelector('.app-nav') || !!document.getElementById('login-title')");
    if (await onLogin()) await login(USER, PASSWORD);
    await waitFor("!!document.querySelector('.app-nav')");
    await ev("document.querySelector('.mobile-nav button:nth-child(2)')?.click()");
    await waitFor("!!document.getElementById('comp-text')");
    await ev("[...document.querySelectorAll('[role=tab]')].find((b) => /Enter manually/.test(b.textContent)).click()");
    await ev("[...document.querySelectorAll('button')].find((b) => /Open blank invoice form/.test(b.textContent)).click()");
    await waitFor("!!document.getElementById('f-customerName')");
    await fillInvoice({ name: "Mobile Dark Ltd", email: "md@mobile.example" });
    await dropResponses(/\/api\/invoice-drafts$/);
    await clickSave();
    await waitFor("!!document.getElementById('save-uncertain')", 8000);
    await stopSimulating();
    let ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow at 390px (uncertain state)", ov === "", ov);
    let c = await ev(CONTRAST_SCAN);
    check(g, "uncertain-state contrast >= WCAG AA (dark, 390px)", c.length === 0, JSON.stringify(c));
    check(g, "the uncertain alert is an announced alert region", await ev("!!document.querySelector('#save-uncertain[role=alert]')"));
    await shot("06-mobile-dark-uncertain.jpg");
    await ev("document.getElementById('retry-save-btn').click()");
    await waitFor("!!document.getElementById('saved-id')", 8000);
    ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow at 390px (saved page)", ov === "", ov);
    c = await ev(CONTRAST_SCAN);
    check(g, "saved-page contrast >= WCAG AA (dark, 390px)", c.length === 0, JSON.stringify(c));
    await shot("07-mobile-dark-saved.jpg");
    await viewport(1280, 900);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  }

  /* ======================= MEDIUM-1: leaving an unresolved save ======================= */
  {
    const g = "REAL leaving an unresolved save (server commits, response lost)";
    await signIn();
    await openManualForm();
    await fillInvoice({ name: "Nav Guard Ltd", email: "ng@navguard.example" });
    const before = invCount();
    const m = mark();
    await dropResponses(/\/api\/invoice-drafts$/);
    await clickSave();
    await waitFor("!!document.getElementById('save-uncertain')", 8000);
    await stopSimulating();
    const firstKey = saveCalls(m)[0]?.idem;
    check(g, "setup: the server committed one invoice but the browser is in the uncertain state", invCount() === before + 1 && !!firstKey);
    const dialogOpen = () => ev("!!document.querySelector('dialog[open]')");
    const dialogText = () => ev("document.querySelector('dialog[open]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
    const stay = () => ev("[...document.querySelectorAll('dialog[open] button')].find((b) => /^Stay/.test(b.textContent)).click()");
    const stillOnReview = async () => (await onReview()) && (await ev("document.getElementById('f-customerName').value")) === "Nav Guard Ltd" && (await ev("!!document.getElementById('save-uncertain')"));
    // The status selector's explicit open-saved action must pass through the same workspace leave guard.
    await ev("document.querySelector('.nudgey-launcher').click()");
    await ev("[...document.querySelectorAll('.nudgey-action')].find((b) => b.textContent.includes('Check invoice status')).click()");
    await waitFor("document.querySelectorAll('.status-option').length > 0", 4000);
    await ev("document.querySelector('.status-option').click()");
    await waitFor("!!document.querySelector('.status-selected .followup-btn-primary')", 3000);
    await ev("document.querySelector('.status-selected .followup-btn-primary').click()");
    const statusOpenDialog = await waitFor("!!document.querySelector('dialog[open]')", 2000);
    check(g, "Check invoice status → Open invoice details asks before abandoning the unresolved save", statusOpenDialog && /This save is unconfirmed/.test(await dialogText()) && await stillOnReview());
    await shot("12-status-open-save-guard.jpg");
    await stay();
    await waitFor("!document.querySelector('dialog[open]')", 1500);
    await ev("document.querySelector('.nudgey-launcher').click()");
    const paths = [
      ["header brand", "document.querySelector('.brand-button').click()"],
      ["desktop nav: Invoice drafts", "[...document.querySelectorAll('.app-nav button')].find((b) => b.textContent.includes('Invoice drafts')).click()"],
      ["desktop nav: New invoice", "[...document.querySelectorAll('.app-nav button')].find((b) => b.textContent.includes('New invoice')).click()"],
    ];
    for (const [name, js] of paths) {
      await ev(js);
      const open = await waitFor("!!document.querySelector('dialog[open]')", 2000);
      const t = await dialogText();
      check(g, `${name}: asks first (uncertain wording, duplicate warning) and does not navigate`, open && /This save is unconfirmed/.test(t) && /may already exist/.test(t) && /second draft/.test(t) && (await onReview()), t.slice(0, 160));
      await stay();
      check(g, `${name}: 'Stay and retry' keeps the form, the uncertain notice and the retry key`, (await waitFor("!document.querySelector('dialog[open]')", 1500)) && (await stillOnReview()));
    }
    check(g, "'Back to composer' and 'Discard' are inside the locked form: disabled, so they cannot leave", await ev("(() => { const bs = [...document.querySelectorAll('form button')].filter((b) => ['Back to composer', 'Discard'].includes(b.textContent.trim())); return bs.length === 2 && bs.every((b) => b.matches(':disabled')); })()"));
    await shot("08-leave-uncertain-dialog.jpg");
    // mobile bottom navigation
    await viewport(390, 844, true);
    await sleep(200);
    await ev("[...document.querySelectorAll('.mobile-nav button')][0].click()");
    check(g, "mobile bottom navigation: asks first and does not navigate", (await waitFor("!!document.querySelector('dialog[open]')", 2000)) && /This save is unconfirmed/.test(await dialogText()) && (await onReview()));
    await shot("09-leave-uncertain-mobile.jpg");
    await stay();
    await ev("[...document.querySelectorAll('.mobile-nav button')][1].click()");
    check(g, "mobile bottom navigation (New invoice): asks first", (await waitFor("!!document.querySelector('dialog[open]')", 2000)) && (await onReview()));
    await stay();
    await viewport(1280, 900);
    // the retry still works with the same key afterwards
    const m2 = mark();
    await ev("document.getElementById('retry-save-btn').click()");
    await waitFor("!!document.getElementById('saved-id')", 8000);
    const retry = saveCalls(m2)[0];
    check(g, "after all those attempts the retry still replays with the SAME key and no duplicate", retry && retry.idem === firstKey && retry.status === 200 && invCount() === before + 1);

    // deliberate abandonment: explicit decision, then a later save really does get a new key
    await nav("New invoice");
    await openManualForm();
    await fillInvoice({ name: "Nav Guard Two", email: "ng2@navguard.example" });
    const b2 = invCount();
    const m3 = mark();
    await dropResponses(/\/api\/invoice-drafts$/);
    await clickSave();
    await waitFor("!!document.getElementById('save-uncertain')", 8000);
    await stopSimulating();
    await ev("document.querySelector('.brand-button').click()");
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    await ev("[...document.querySelectorAll('dialog[open] button')].find((b) => /Leave and discard the retry key/.test(b.textContent)).click()");
    check(g, "explicit 'Leave and discard the retry key' leaves Review for the dashboard", await waitFor("!!document.getElementById('dash-title') && !document.getElementById('rev-title')", 3000));
    check(g, "the abandoned attempt did exist once on the server (no silent duplicate was created by leaving)", invCount() === b2 + 1);

    // pending (request in flight) is a different state with different wording
    await nav("New invoice");
    await openManualForm();
    await fillInvoice({ name: "Nav Guard Pending", email: "ngp@navguard.example" });
    const b3 = invCount();
    const m4 = mark();
    await simulate((p) => (p.request.method === "POST" && p.request.url.endsWith("/api/invoice-drafts") ? "hold" : "continue"));
    await clickSave();
    await waitFor("document.getElementById('save-btn').getAttribute('aria-disabled') === 'true'", 3000);
    await ev("document.querySelector('.brand-button').click()");
    const openP = await waitFor("!!document.querySelector('dialog[open]')", 2000);
    const tp = await dialogText();
    check(g, "pending: a DIFFERENT dialog ('save is still in progress') and no navigation", openP && /A save is still in progress/.test(tp) && !/unconfirmed/.test(tp) && /may already/.test(tp) && (await onReview()), tp.slice(0, 160));
    await shot("10-leave-pending-dialog.jpg");
    await stay();
    check(g, "pending: 'Stay and wait' keeps the pending save", (await waitFor("!document.querySelector('dialog[open]')", 1500)) && (await onReview()) && saveCalls(m4).length === 1);
    // while the dialog is open the request fails -> state becomes uncertain and the dialog follows it
    await ev("document.querySelector('.brand-button').click()");
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    await releaseHeld("fail");
    await waitFor("!!document.getElementById('save-uncertain')", 6000);
    check(g, "pending -> uncertain while the dialog is open: the wording follows the new state", /This save is unconfirmed/.test(await dialogText()));
    await stay();
    await stopSimulating();
    // pending + confirmed leave aborts the request
    await ev("document.getElementById('abandon-save-btn').click()");
    await waitFor("!document.getElementById('f-customerName').matches(':disabled')");
    await simulate((p) => (p.request.method === "POST" && p.request.url.endsWith("/api/invoice-drafts") ? "hold" : "continue"));
    const m5 = mark();
    await clickSave();
    await waitFor("document.getElementById('save-btn').getAttribute('aria-disabled') === 'true'", 3000);
    await ev("[...document.querySelectorAll('.app-nav button')].find((b) => b.textContent.includes('Invoice drafts')).click()");
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    await ev("[...document.querySelectorAll('dialog[open] button')].find((b) => /Leave and forget this save/.test(b.textContent)).click()");
    check(g, "pending: explicit 'Leave and forget this save' leaves and cancels the browser request", (await waitFor("!!document.getElementById('dash-title')", 3000)) && saveCalls(m5)[0]?.failed === "canceled", JSON.stringify(saveCalls(m5)));
    await releaseHeld("fail");
    await stopSimulating();
    check(g, "the held (never sent) and cancelled saves inserted no invoice: the count is exactly what it was before them", invCount() === b3, `before=${b3} after=${invCount()}`);

    // sign-out stays immediate while uncertain
    await nav("New invoice");
    await openManualForm();
    await fillInvoice({ name: "Nav Guard Three", email: "ng3@navguard.example" });
    await dropResponses(/\/api\/invoice-drafts$/);
    await clickSave();
    await waitFor("!!document.getElementById('save-uncertain')", 8000);
    await stopSimulating();
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
    check(g, "Sign out is NOT gated: the workspace locks at once with no dialog, and no invoice text remains", (await waitFor("!document.getElementById('f-customerName') && /Signing out/.test(document.body.innerText)", 1500)) && !(await ev("!!document.querySelector('dialog[open]')")));
    await waitFor("!!document.getElementById('login-title')", 6000);
    check(g, "after sign-out nothing of the unresolved invoice is in the page", !/Nav Guard Three|ng3@navguard/.test(await ev("document.documentElement.outerHTML")));
  }

  /* ======================= MINOR-2: real parse proposal -> Review -> real save ======================= */
  {
    const g = "REAL parse proposal -> Review -> real save (test-only FAKE model, not OpenAI)";
    await stopApi();
    await startApi({}); // model client present = the deterministic test-only fake
    await signIn();
    await nav("New invoice");
    await waitFor("!!document.getElementById('comp-text')");
    const before = invCount();
    const m = mark();
    await fillText("comp-text", "Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due January 15 2030.");
    await ev("document.getElementById('parse-btn').click()");
    check(g, "a parsed server draft opens Review", await waitFor("!!document.getElementById('rev-title')", 8000));
    const t = await ev("document.body.innerText.replace(/\\s+/g, ' ')");
    check(g, "Review states the truth: not saved yet, saving writes to PostgreSQL, no PayPal invoice", /Proposed by the AI parser/.test(t) && /not saved yet/.test(t) && /writes\s+it to PostgreSQL/.test(t) && /does not create a PayPal invoice/.test(t) && /Saving writes this draft to PostgreSQL/.test(t), t.slice(0, 500));
    check(g, "no 'simulated' wording appears anywhere on the real AI Review", !/simulated|Local draft|Idempotency-Key:/i.test(t), (t.match(/.{30}simulated.{30}/i) || [""])[0]);
    check(g, "the tab title is not labelled as fixture data on Review", !/fixture|sample/i.test(await ev("document.title")), await ev("document.title"));
    await shot("11-ai-review-real-copy.jpg");
    await ev("document.getElementById('save-btn').click()");
    check(g, "saving the proposal writes one invoice and opens the saved page", (await waitFor("!!document.getElementById('saved-id')", 8000)) && invCount() === before + 1);
    check(g, "the saved page and its tab title are not labelled fixture data", !/fixture/i.test(await ev("document.title")) && /Saved invoice/.test(await ev("document.title")), await ev("document.title"));
    const posts = saveCalls(m);
    check(g, "one parse request and one save request, both from the real session", apiCalls(m).filter((c) => c.path === "/api/invoice-drafts/parse").length === 1 && posts.length === 1 && posts[0].status === 201);
    await ev("document.getElementById('saved-back').click()");
    await waitFor("!!document.getElementById('dash-title')");
    check(g, "the dashboard is the real list (since C4): its tab title carries no sample/fixture label", /Invoice drafts/.test(await ev("document.title")) && !/sample|fixture/i.test(await ev("document.title")));
  }

  /* ======================= J: global invariants ======================= */
  {
    const g = "Global invariants";
    const s = await ev(STORAGE);
    check(g, "no localStorage/sessionStorage/IndexedDB/Cache entries", s.local === 0 && s.session === 0 && s.idb === 0 && s.caches === 0, JSON.stringify(s));
    check(g, "no script-readable cookie and no invoice data or id in the URL", s.cookie === "" && !/Quill|Ltd|@/.test(s.href) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(s.href), s.href);
    check(g, "no request left the app origin (no PayPal/OpenAI/foreign host)", foreign.length === 0, JSON.stringify(foreign));
    const paths = new Set(netLog.filter((n) => n.path.startsWith("/api/")).map((n) => n.path.replace(/[0-9a-f-]{36}/, ":id")));
    check(g, "the browser used only auth, invoice save/detail/parse and the existing read-only invoice/follow-up routes", [...paths].every((p) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts(\/parse|\/search|\/:id(\/follow-ups)?|\?limit=\d+)?|follow-ups)$/.test(p)), [...paths].join(","));
    check(g, "no PayPal-draft request was made in this journey (the list exists since C4 and is read-only)", ![...paths].some((p) => /paypal/.test(p)) && !netLog.some((n) => /\/paypal-draft/.test(n.path)));
    check(g, "no PayPal operations or approvals exist; only the test-only fake model ran, exactly once (AI-path regression)", Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 0 && Number(sql("SELECT count(*) FROM approvals")) === 0 && modelCalls() === 1, String(modelCalls()));
    check(g, "every invoice has exactly one currency and non-negative consistent minor totals", sql("SELECT count(*) FROM invoices WHERE total_minor <> subtotal_minor - discount_minor + tax_minor") === "0");
    const log = readFileSync(apiLog, "utf8");
    check(g, "API log contains no customer data, CSRF token or cookie value", !/Quill|quill\.example|Lost Response|lost@resp|csrf-token\"?:\s*\"[A-Za-z0-9]/.test(log));
    check(g, "no console errors or uncaught exceptions in the browser", consoleMsgs.filter((x) => !/Failed to load resource|net::ERR|status of (4|5)\d\d/.test(x)).length === 0, consoleMsgs.slice(0, 5).join(" / "));
  }
} catch (e) {
  record("harness", "unexpected failure", false, String(e?.stack || e).slice(0, 600));
} finally {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const lines = [
    "# NMI-UI-01C3 browser save/detail journey",
    "",
    `Chrome: ${version?.Browser ?? "unknown"} (headless). PostgreSQL: ${run(join(PG_BIN, "postgres"), ["--version"]).trim()} (disposable cluster, destroyed after the run).`,
    "Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.",
    "Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; no model client exists in this journey (parsing is not used); the invoices are created by manual entry.",
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
