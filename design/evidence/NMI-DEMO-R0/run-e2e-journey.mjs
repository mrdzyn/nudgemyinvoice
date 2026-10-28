/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-DEMO-R0 final end-to-end check of the merged application: genuine browser -> Vite preview
// (production build, strict CSP) -> real Fastify -> disposable PostgreSQL 16, with DETERMINISTIC FAKES
// for both providers (see simulated-eval-server.ts). NO real OpenAI request and NO real PayPal request
// is made; the parser is a regex stand-in and the PayPal client an in-memory fake. Nothing here is
// real-provider evidence.
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-DEMO-R0/run-e2e-journey.mjs
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const ORIGIN = "http://localhost:4173";
const API_PORT = Number(process.env.NMI_R0_API_PORT || 3101);
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54329;
const DEBUG_PORT = 9340;
const DB = "nmi_test_r0_journey";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-r0";
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

const work = mkdtempSync(join(tmpdir(), "nmi-r0-"));
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
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_r0", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_r0", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_r0@127.0.0.1:${PG_PORT}/${DB}`;
const provision = (password) =>
  run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: password } });
provision(PASSWORD);

/* ----------------------------------------------------------------- servers */
const apiLog = join(work, "api.log");
const modelLog = join(work, "model-calls.log");
writeFileSync(modelLog, "");
const ppLog = join(work, "fake-paypal-calls.log");
writeFileSync(ppLog, "");
const baseEnv = { ...process.env, NODE_ENV: "development", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, DATABASE_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", OPENAI_API_KEY: "", OPENAI_MODEL: "", NMI_SIMULATED_EVAL: "1", NMI_FAKE_MODEL_LOG: modelLog, NMI_FAKE_PAYPAL_LOG: ppLog, PAYPAL_DRAFTS_ENABLED: "true", PAYPAL_CLIENT_ID: "cid-" + randomBytes(6).toString("hex"), PAYPAL_CLIENT_SECRET: "csec-" + randomBytes(10).toString("hex") };
let api = null;
async function startApi(extra = {}) {
  api = spawn("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(here, "simulated-eval-server.ts")], { cwd: root, stdio: ["ignore", (await import("node:fs")).openSync(apiLog, "a"), (await import("node:fs")).openSync(apiLog, "a")], env: { ...baseEnv, ...extra }, detached: true });
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

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-r0-"));
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
  const calls = (re, method) => (since = 0) => apiCalls(since).filter((c) => c.method === method && re.test(c.path));
  const PARSE = calls(/^\/api\/invoice-drafts\/parse$/, "POST");
  const SAVE = calls(/^\/api\/invoice-drafts$/, "POST");
  const PPPOST = calls(/\/paypal-draft$/, "POST");
  const LIST = calls(/^\/api\/invoice-drafts\?/, "GET");
  const DETAIL = calls(/^\/api\/invoice-drafts\/[0-9a-f-]{36}$/, "GET");
  const op = (id) => sql(`SELECT state||'|'||coalesce(paypal_invoice_id,'')||'|'||attempts FROM paypal_draft_operations WHERE invoice_id='${id}'`);
  const fillText = async (id, v) => { await focusId(id); await ev(`document.getElementById(${JSON.stringify(id)}).select()`); await typeText(v); };
  const val = (id) => ev(`document.getElementById(${JSON.stringify(id)})?.value ?? null`);
  const nav = async (label) => {
    await ev(`[...document.querySelectorAll('.app-nav button')].find((b) => b.textContent.includes(${JSON.stringify(label)})).click()`);
    if (await waitFor("!!document.querySelector('dialog[open]')", 300)) await ev("document.querySelector('dialog[open] .btn-danger').click()");
  };
  const dialogText = () => ev("document.querySelector('dialog[open]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  const panelText = () => ev("document.getElementById('pp-body').innerText.replace(/\\s+/g, ' ') + ' ' + (document.getElementById('pp-outcome')?.innerText.replace(/\\s+/g, ' ') ?? '')");

  /** composer -> natural language -> (real strict pipeline) -> Review */
  async function parseText(text, waitExpr) {
    await nav("New invoice");
    await waitFor("!!document.getElementById('comp-text')");
    await fillText("comp-text", text);
    await ev("document.getElementById('parse-btn').click()");
    return waitFor(waitExpr, 8000);
  }
  const reviewOpen = "!!document.getElementById('rev-title') && !!document.getElementById('f-customerName')";
  async function saveAndOpen() {
    await ev("document.getElementById('save-btn').click()");
    return waitFor("!!document.getElementById('saved-id') && !!document.getElementById('pp-body')", 10000);
  }
  async function confirmSandboxDraft() {
    await ev("(() => { const b = document.getElementById('create-pp-btn'); b.focus(); b.click(); })()");
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    await ev("[...document.querySelectorAll('dialog[open] button')].find((b) => /^Create PayPal Sandbox draft$/.test(b.textContent.trim())).click()");
    return waitFor("!!document.getElementById('pp-id')", 10000);
  }

  /* ======================= login ======================= */
  {
    const g = "REAL login (disposable operator, random password)";
    await load("#screen=composer");
    check(g, "a protected deep link shows only the sign-in screen and no invoice route is requested", await waitFor("!!document.getElementById('login-title')") && PARSE().length === 0 && SAVE().length === 0);
    await login(USER, PASSWORD);
    check(g, "the real server signs the operator in and the real dashboard loads (empty account, no fixtures)", await waitFor("!!document.getElementById('dash-empty')", 8000) && !/DEMO \/ SYNTHETIC|Acme|Northwind/.test(await bodyText()));
    await shot("01-dashboard-empty.jpg");
  }

  /* ======================= USD: natural language -> review -> save -> saved page -> Sandbox draft ======================= */
  let usdId;
  {
    const g = "REAL end-to-end: natural-language proposal -> review -> save -> dashboard -> saved invoice -> Sandbox DRAFT -> durable refresh";
    const m = mark();
    const ok = await parseText("Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15", reviewOpen);
    check(g, "the composer sends the text to the REAL parse route and the SIMULATED parser's proposal opens the editable Review", ok && PARSE(m).length === 1 && PARSE(m)[0].status === 200 && PARSE(m)[0].hasCsrf);
    check(g, "Review is filled from the validated server proposal (customer, e-mail, USD, due date, 8% tax, 2 x 250)", (await val("f-customerName")) === "Acme Design" && (await val("f-currency")) === "USD" && (await val("f-dueDate")) === "2030-01-15" && (await val("f-taxPercent")) === "8" && (await val("f-line-0-quantity")) === "2" && Number(await val("f-line-0-unitPrice")) === 250, JSON.stringify([await val("f-line-0-quantity"), await val("f-line-0-unitPrice"), await val("f-taxPercent")]));
    const t = await bodyText();
    check(g, "Review tells the operator it is a proposal to verify, not saved yet, and that saving writes to PostgreSQL (no PayPal)", /Proposed by the AI parser/.test(t) && /not saved yet/.test(t) && /writes\s+it to PostgreSQL/.test(t) && /Estimated total/.test(t) && !/simulated/i.test(t.replace(/Simulated/g, "x")), t.slice(0, 200));
    check(g, "human review: nothing is saved until the operator saves (zero invoices so far)", Number(sql("SELECT count(*) FROM invoices")) === 0 && SAVE(m).length === 0);
    await shot("02-review.jpg");
    check(g, "the operator edits one field during review (due date) and saves", await (async () => { await ev("(() => { const e = document.getElementById('f-dueDate'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '2030-02-01'); e.dispatchEvent(new Event('input', { bubbles: true })); })()"); return true; })() && (await saveAndOpen()));
    const posts = SAVE(m);
    usdId = await ev("document.getElementById('saved-id').textContent");
    check(g, "exactly one real POST /api/invoice-drafts -> 201; one durable row in PostgreSQL with the OPERATOR'S edit (2030-02-01)", posts.length === 1 && posts[0].status === 201 && sql(`SELECT due_date::text FROM invoices WHERE id='${usdId}'`) === "2030-02-01" && Number(sql("SELECT count(*) FROM invoices")) === 1);
    check(g, "the saved page shows the real id and the server-computed total $540.00 (2 x 250.00 + 8% tax), saved in PostgreSQL only", /\$540\.00/.test(await ev("document.getElementById('saved-total').textContent")) && sql(`SELECT total_minor FROM invoices WHERE id='${usdId}'`) === "54000" && /Not created in PayPal Sandbox/.test(await panelText()));
    await ev("document.getElementById('saved-back').click()");
    await waitFor("!!document.querySelector('tbody tr')", 8000);
    check(g, "the real dashboard lists the saved invoice from PostgreSQL with 'No PayPal draft' and a USD card", (await ev("[...document.querySelectorAll('tbody tr')].some((r) => /Acme Design/.test(r.textContent) && /No PayPal draft/.test(r.textContent))")) && /USD/.test(await ev("document.getElementById('dash-cards').innerText")) && LIST(m).length >= 1);
    await shot("03-dashboard.jpg");
    await ev("document.querySelector('tbody tr [aria-label^=\"View invoice\"]').click()");
    await waitFor("!!document.getElementById('saved-id') && !!document.getElementById('pp-body')", 8000);
    const m2 = mark();
    await ev("(() => { const b = document.getElementById('create-pp-btn'); b.focus(); b.click(); })()");
    await waitFor("!!document.querySelector('dialog[open]')", 2000);
    const dt = await dialogText();
    check(g, "the confirmation dialog names the invoice, customer, $540.00 USD and says no email, no payment, nothing sent", dt.includes(usdId) && /Acme Design/.test(dt) && /\$540\.00\s*USD/.test(dt) && /customer will not be emailed/i.test(dt) && /No payment will be collected/.test(dt) && /does not send an invoice/.test(dt));
    await shot("04-confirm-dialog.jpg");
    await ev("[...document.querySelectorAll('dialog[open] button')].find((b) => /^Create PayPal Sandbox draft$/.test(b.textContent.trim())).click()");
    check(g, "the SIMULATED provider's DRAFT is verified by the real service and the page shows its id, DRAFT and 'not emailed'", await waitFor("!!document.getElementById('pp-id')", 10000) && /DRAFT/.test(await panelText()) && /customer has not been emailed/i.test(await panelText()));
    const row = (await op(usdId)).split("|");
    check(g, "durable truth agrees: one POST (201), operation 'created', one attempt, id linked on the invoice, ONE fake provider create", PPPOST(m2).length === 1 && PPPOST(m2)[0].status === 201 && row[0] === "created" && row[2] === "1" && sql(`SELECT paypal_invoice_id FROM invoices WHERE id='${usdId}'`) === row[1] && ppCount("create") === 1);
    check(g, "the page re-read the durable state with GET after the POST and shows the same id", DETAIL(m2).length >= 1 && (await ev("document.getElementById('pp-id').textContent")) === row[1]);
    await shot("05-created.jpg");
    await ev("document.getElementById('saved-back').click()");
    await waitFor("!!document.querySelector('tbody tr')", 8000);
    check(g, "back on the dashboard the same invoice now reads 'PayPal draft created' (state from the server)", await ev("[...document.querySelectorAll('tbody tr')].some((r) => /Acme Design/.test(r.textContent) && /PayPal draft created/.test(r.textContent))"));
  }

  /* ======================= EUR via clarification: a second currency, never mixed ======================= */
  {
    const g = "REAL second currency (EUR) through the clarification loop";
    const m = mark();
    const ok = await parseText("Invoice Vienna Cafe for 3 brand audits at 199.99 EUR each", "!!document.getElementById('clar-0')");
    check(g, "a request with no due date makes the REAL pipeline ask a clarification question (no guess)", ok && /due date/i.test(await bodyText()));
    await shot("06-clarification.jpg");
    await focusId("clar-0");
    await typeText("2030-03-01");
    await ev("[...document.querySelectorAll('button')].find((b) => /Add answers and parse again/.test(b.textContent)).click()");
    check(g, "the answer is appended, the same endpoint is called again and Review opens with EUR", await waitFor(reviewOpen, 8000) && PARSE(m).length === 2 && (await val("f-currency")) === "EUR" && (await val("f-dueDate")) === "2030-03-01");
    check(g, "saving stores a EUR invoice with the exact server total 599.97 (3 x 199.99)", (await saveAndOpen()) && sql("SELECT total_minor FROM invoices WHERE customer_name='Vienna Cafe'") === "59997" && /€599\.97/.test(await ev("document.getElementById('saved-total').textContent")));
    await ev("document.getElementById('saved-back').click()");
    await waitFor("document.querySelectorAll('tbody tr').length === 2", 8000);
    const cards = await ev("[...document.querySelectorAll('.currency-card')].map((c) => c.querySelector('.top span').textContent + ' ' + c.querySelector('.amount').textContent)");
    check(g, "the dashboard keeps USD and EUR in separate cards with no combined total", cards.length === 2 && cards.some((c) => /^USD \$540\.00/.test(c)) && cards.some((c) => /^EUR €599\.97/.test(c)) && !/Grand total/i.test(await bodyText()), JSON.stringify(cards));
    await shot("07-two-currencies.jpg");
  }

  /* ======================= human-control and provider boundaries ======================= */
  {
    const g = "Boundaries";
    check(g, "only the explicit confirmation created a draft: exactly one fake provider create for two saved invoices", ppCount("create") === 1 && Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 1);
    check(g, "the SIMULATED parser handled exactly the 3 parse requests (no real OpenAI client exists in this run)", modelCalls() === 3, String(modelCalls()));
    check(g, "no browser request left the app origin (no OpenAI, PayPal or other host)", foreign.length === 0, JSON.stringify(foreign));
    check(g, "no send, remind, cancel, refund, payment or webhook route was requested", !netLog.some((n) => /send|remind|cancel|refund|payment|webhook|capture/i.test(n.path)));
    const paths = new Set(netLog.filter((n) => n.path.startsWith("/api/")).map((n) => n.path.replace(/[0-9a-f-]{36}/, ":id").replace(/\?.*$/, "")));
    check(g, "the browser used only the auth, parse, save/list/detail and PayPal-draft routes", [...paths].every((p) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts(\/parse|\/:id(\/paypal-draft)?)?)$/.test(p)), [...paths].join(","));
    const s = await ev(STORAGE);
    check(g, "no customer data in localStorage/sessionStorage/IndexedDB/Cache and none in the navigation URL", s.local === 0 && s.session === 0 && s.idb === 0 && s.caches === 0 && !/Acme|Vienna|@|[0-9a-f]{8}-[0-9a-f]{4}-/.test(s.href), JSON.stringify(s));
    check(g, "the API log holds no customer name/e-mail, CSRF token or cookie value", !/Acme Design|Vienna Cafe|billing@|csrf-token\"?:\s*\"[A-Za-z0-9]/.test(readFileSync(apiLog, "utf8")));
    check(g, "no console errors or uncaught exceptions in the browser", consoleMsgs.filter((x) => !/Failed to load resource|net::ERR|status of (4|5)\d\d/.test(x)).length === 0, consoleMsgs.slice(0, 5).join(" / "));
  }

  /* ======================= logout ======================= */
  {
    const g = "REAL logout";
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
    check(g, "Sign out locks the workspace at once and the server session is revoked", await waitFor("!!document.getElementById('login-title') && !document.querySelector('tbody tr')", 6000) && activeSessions() === 0);
    check(g, "no customer data remains in the page after sign-out", !/Acme Design|Vienna Cafe/.test(await ev("document.documentElement.outerHTML")));
  }
} catch (e) {
  record("harness", "unexpected failure", false, String(e?.stack || e).slice(0, 600));
} finally {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const lines = [
    "# NMI-DEMO-R0 final end-to-end journey (SIMULATED providers)",
    "",
    `Chrome: ${version?.Browser ?? "unknown"} (headless). PostgreSQL: ${run(join(PG_BIN, "postgres"), ["--version"]).trim()} (disposable cluster, destroyed after the run).`,
    "Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.",
    "Privacy scope of the checks below: they prove the browser NAVIGATION URL and browser storage hold no customer data and that the Fastify request log has query strings stripped. They do NOT claim the HTTP GET request URL is free of customer data (the search term travels in `q`), and no reverse proxy, ingress, CDN or access log was exercised (untested). Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; Both providers are DETERMINISTIC FAKES injected behind the real routes and services (`simulated-eval-server.ts`): a regex stand-in for OpenAI and an in-memory PayPal fake. These results prove the UI, transport, validation pipeline and local state machine, NOT real OpenAI or PayPal behaviour.",
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
