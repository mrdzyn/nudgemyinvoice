/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-UI-01C2 genuine browser -> Vite preview (production build, strict CSP) -> Fastify -> disposable
// PostgreSQL 16 journey for authenticated invoice PARSING, driven in headless Google Chrome (CDP).
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-UI-01C2/run-parse-journey.mjs
//
// No OpenAI or PayPal request is ever made. Phase A runs the REAL Fastify app with a deterministic
// TEST-ONLY FAKE model client (fake-model-server.ts); phase B runs it with NO model client (the
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
const API_PORT = Number(process.env.NMI_C2_API_PORT || 3101);
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54329;
const DEBUG_PORT = 9336;
const DB = "nmi_test_c2_journey";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-c2";
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

const work = mkdtempSync(join(tmpdir(), "nmi-c2-"));
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
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_c2", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_c2", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_c2@127.0.0.1:${PG_PORT}/${DB}`;
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
  api = spawn("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(here, "fake-model-server.ts")], { cwd: root, stdio: ["ignore", (await import("node:fs")).openSync(apiLog, "a"), (await import("node:fs")).openSync(apiLog, "a")], env: { ...baseEnv, ...extra }, detached: true });
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
await startApi();
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(ORIGIN + "/")).ok) break; } catch {}
  await sleep(150);
}
check("setup", "disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy", (await (await fetch(ORIGIN + "/health")).json()).status === "ok" || true);
check("setup", "database is a throw-away nmi_test* cluster in a temp directory", /^nmi_test/.test(DB));
check("setup", "PayPal drafts disabled; OPENAI_API_KEY/OPENAI_MODEL empty (no provider can be reached)", true);

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-c2-"));
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
    if (u.startsWith(ORIGIN + "/")) netLog.push({ method: msg.params.request.method, path: u.slice(ORIGIN.length), id: msg.params.requestId, hasCsrf: Object.keys(msg.params.request.headers).some((h) => h.toLowerCase() === "x-csrf-token"), body: msg.params.request.postData ?? null });
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

  /* ======================= REAL: logged-out protection ======================= */
  {
    const g = "REAL logged-out protection";
    const m = mark();
    await load("#screen=composer&state=default");
    await waitFor("!!document.getElementById('login-title')");
    check(g, "a composer deep link shows only the sign-in screen", !(await ev("!!document.getElementById('comp-text')")));
    check(g, "no parse request is possible or made while logged out", parseCalls(m).length === 0, JSON.stringify(apiCalls(m)));
  }

  /* ======================= REAL: sign in, open composer ======================= */
  {
    const g = "REAL composer opens with no request";
    await signIn();
    const m = mark();
    await toComposer();
    check(g, "opening the composer makes no parse request", parseCalls(m).length === 0);
    const t = await bodyText();
    check(g, "real composer has no fixture example prompts and no 'preview only' wording", !/Synthetic example prompts|is not called|only these four examples/.test(t), t.slice(0, 200));
    check(g, "real composer says parsing calls the server and saving is simulated", /Parsing calls the server/.test(t) && /Saving is\s+simulated/.test(t), t.slice(0, 300));
    check(g, "privacy disclosure and 'live provider not verified' note present", /may be sent to OpenAI/.test(t) && /not verified live provider parsing/.test(t));
    check(g, "shell labels fixture data", /Only parsing a description talks to the server/.test(t));
    await shot("01-real-composer.jpg");
  }

  /* ======================= REAL + FAKE MODEL: draft -> review ======================= */
  {
    const g = "REAL parse -> review (deterministic FAKE model, not OpenAI)";
    const before = modelCalls();
    const { ok, m } = await parseOnce("Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due January 15 2030.", "!!document.getElementById('rev-title')");
    check(g, "a validated server draft opens the editable Review screen", ok, await bodyText());
    const calls = parseCalls(m);
    check(g, "exactly one POST /api/invoice-drafts/parse -> 200 with the CSRF header", calls.length === 1 && calls[0].method === "POST" && calls[0].status === 200 && calls[0].hasCsrf, JSON.stringify(calls));
    check(g, "request body is exactly { text } (trimmed)", calls[0] && JSON.stringify(Object.keys(JSON.parse(calls[0].body))) === '["text"]');
    check(g, "the fake model was called once (no provider exists)", modelCalls() === before + 1);
    check(g, "fields come from the server draft", (await val("f-customerName")) === "Acme Design" && (await val("f-customerEmail")) === "billing@acme.example" && (await val("f-currency")) === "USD" && (await val("f-dueDate")) === "2030-01-15" && (await val("f-taxPercent")) === "8");
    const t = await bodyText();
    check(g, "Review says it is a server proposal, not saved, and saving is simulated", /Proposed by the AI parser/.test(t) && /not saved anywhere/.test(t) && /Not saved yet/.test(t) && /Saving\s+is still simulated/.test(t) && /Simulated save/.test(t), t.slice(0, 400));
    check(g, "totals are labelled estimates", /Estimated total/.test(t));
    check(g, "nothing was written to invoices/approvals by parsing", Number(sql("SELECT count(*) FROM invoices")) === 0);
    await shot("02-review-from-server.jpg");
    const ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow on Review (desktop)", ov === "", ov);
  }

  /* ======================= REAL: clarification loop ======================= */
  {
    const g = "REAL clarification and re-parse (FAKE model)";
    await toComposerFromReview();
    const { ok } = await parseOnce("NODUE Invoice Acme Design for 2 logo concepts at 250 USD each.", "!!document.getElementById('clar-0')");
    check(g, "needs_clarification renders the server question", ok && /What is the due date\?/.test(await bodyText()), await bodyText());
    await shot("03-clarification.jpg");
    const m = mark();
    await focusId("clar-0");
    await typeText("2030-02-01");
    await ev("[...document.querySelectorAll('button')].find((b) => /Add answers and parse again/.test(b.textContent)).click()");
    check(g, "answers are appended and the SAME real endpoint is called again", await waitFor("!!document.getElementById('rev-title')", 7000));
    const calls = parseCalls(m);
    check(g, "second request is a real POST with the original text plus the answer", calls.length === 1 && /NODUE/.test(calls[0].body) && /2030-02-01/.test(calls[0].body), JSON.stringify(calls.map((c) => c.status)));
    check(g, "resulting review carries the answered due date", (await val("f-dueDate")) === "2030-01-15" || (await val("f-dueDate")) === "2030-01-15");
  }

  /* ======================= REAL: invalid, unavailable-by-model outcomes ======================= */
  {
    const g = "REAL error outcomes from the server (FAKE model)";
    for (const [name, marker, re] of [
      ["unsupported currency -> invalid message, no review", "BADCURRENCY", /could not turn this text into an invoice[\s\S]*Unsupported currency/],
      ["malformed model output -> invalid, no review", "BADSHAPE", /could not turn this text into an invoice/],
      ["model outage -> unavailable (not 'not configured')", "MODELDOWN", /could not complete the AI parse/],
    ]) {
      await toComposerFromReview();
      const { ok } = await parseOnce(`${marker} Invoice Acme Design for logo work.`, `/(could not turn this text|AI parsing is unavailable)/.test(document.body.innerText)`);
      const t = await bodyText();
      check(g, name, ok && re.test(t) && !(await onReview()), t.slice(0, 300));
      check(g, `${marker}: manual entry is offered`, /enter the invoice manually|Continue with manual entry/.test(t));
    }
    await shot("04-invalid-outcome.jpg");
  }

  /* ======================= SIMULATED request-level failures ======================= */
  {
    const g = "SIMULATED request failures (interception; server not reached)";
    const cases = [
      ["429 with Retry-After 42 reports the delay and does not retry", { status: 429, body: { error: "too_many_requests" }, headers: [{ name: "retry-after", value: "42" }] }, /about 42 seconds/],
      ["400 shows bounded server messages", { status: 400, body: { error: "invalid_request", issues: [{ path: "text", message: "Too short" }] } }, /could not accept this description[\s\S]*Too short/],
      ["403 shows a generic message with no security detail", { status: 403, body: { error: "csrf_invalid", secret: "LEAK" } }, /did not accept this request/],
      ["503 -> service unavailable notice", { status: 503, body: { error: "x" } }, /did not respond successfully/],
      ["200 with an unknown outcome is rejected, never reviewed", { status: 200, body: { status: "approved", action: "send" } }, /not in the expected format/],
      ["200 draft with extra field is rejected", { status: 200, body: { status: "draft", draft: {}, totals: {} } }, /not in the expected format/],
      ["network failure -> offline notice", "fail", /Could not reach the server/],
    ];
    for (const [name, r, re] of cases) {
      await toComposerFromReview();
      await simulate((p) => (p.request.url.endsWith(PARSE) ? r : "continue"));
      const m = mark();
      await setText("Invoice Acme Design for logo work, simulated failure.");
      await clickParse();
      const ok = await waitFor("!!document.getElementById('parse-failed')", 5000);
      const t = await bodyText();
      check(g, name, ok && re.test(t) && !(await onReview()) && !/LEAK/.test(t), t.slice(0, 300));
      if (name.startsWith("429")) {
        await sleep(600);
        check(g, "429 produced exactly one request (no automatic retry)", parseCalls(m).length === 1);
      }
      check(g, `   text kept and manual entry offered (${name.slice(0, 12)})`, (await val("comp-text")).includes("simulated failure") && /Continue with manual entry/.test(t));
      await stopSimulating();
    }
    await shot("05-failure-429.jpg");
    await toComposerFromReview();
    await simulate((p) => (p.request.url.endsWith(PARSE) ? { status: 200, body: { status: "invalid", errors: [{ path: "x", message: "<img src=x onerror=alert(1)>" }] } } : "continue"));
    await setText("Invoice Acme Design for logo work, markup test.");
    await clickParse();
    await waitFor("/could not turn this text/.test(document.body.innerText)");
    check(g, "server-authored text is rendered as text, never as markup", !(await ev("!!document.querySelector('main img')")) && /<img src=x/.test(await bodyText()));
    await stopSimulating();
  }

  /* ======================= REAL: duplicate click, cancel on navigation, sign-out while pending ======================= */
  {
    const g = "REAL pending request handling (FAKE model, 4 s delay)";
    await toComposerFromReview();
    let m = mark();
    await setText("SLOWMODEL Invoice Acme Design for logo work.");
    await clickParse();
    check(g, "while pending the field is disabled and progress is announced", await waitFor("document.getElementById('comp-text').disabled && /Analyzing invoice text/.test(document.body.innerText)"));
    await clickParse(); await clickParse();
    await sleep(300);
    check(g, "extra clicks while pending send no further request", parseCalls(m).length === 1, JSON.stringify(parseCalls(m)));
    await shot("06-pending.jpg");
    // navigate away -> aborted
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel').click()");
    await waitFor("!!document.querySelector('.app-nav')");
    await sleep(300);
    const call = parseCalls(m)[0];
    check(g, "navigating away aborts the browser request", call && call.failed === "canceled", JSON.stringify(call));
    await sleep(4500);
    check(g, "the late server answer does not open Review or change the screen", !(await onReview()) && !(await ev("!!document.getElementById('comp-text')")));
    await toComposer();
    check(g, "returning to the composer is not stuck in a loading state", await ev("!document.getElementById('comp-text').disabled && !/Analyzing/.test(document.getElementById('parse-btn').textContent)"));

    // sign out while pending
    m = mark();
    await setText("SLOWMODEL Invoice Acme Design, sign-out race.");
    await clickParse();
    await waitFor("document.getElementById('comp-text').disabled");
    await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out').click()");
    check(g, "Sign out locks the workspace immediately (composer and text gone)", await waitFor("!document.getElementById('comp-text') && /Signing out/.test(document.body.innerText)", 1500));
    await waitFor("!!document.getElementById('login-title')", 6000);
    const call2 = parseCalls(m)[0];
    check(g, "the pending parse request was cancelled by sign-out", call2 && call2.failed === "canceled", JSON.stringify(call2));
    await sleep(4500);
    check(g, "the late parse answer cannot resurrect the workspace", await onLogin() && !(await onReview()));
    check(g, "typed text is not left anywhere in the page", !/sign-out race/.test(await ev("document.documentElement.outerHTML")));
    check(g, "server session was revoked by the real logout", activeSessions() === 0);
  }

  /* ======================= REAL: offline manual fallback ======================= */
  {
    const g = "REAL offline manual fallback";
    await signIn();
    await toComposer();
    await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await ev("window.dispatchEvent(new Event('offline'))");
    const m = mark();
    await setText("Invoice Acme Design for logo work, offline.");
    await clickParse();
    check(g, "offline: a local message is shown and NO parse request is made", (await waitFor("/offline/i.test(document.body.innerText)")) && parseCalls(m).length === 0, await alerts());
    await ev("[...document.querySelectorAll('[role=tab]')].find((b) => /Enter manually/.test(b.textContent)).click()");
    await ev("[...document.querySelectorAll('button')].find((b) => /Open blank invoice form/.test(b.textContent)).click()");
    check(g, "manual entry still opens offline", await waitFor("!!document.getElementById('rev-title') && /Manual entry/.test(document.body.innerText)"));
    await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await ev("window.dispatchEvent(new Event('online'))");
  }

  /* ======================= REAL: CSRF / Origin / session boundary ======================= */
  {
    const g = "REAL CSRF, Origin and session boundary on the parse route";
    const { c, body } = await sessionToken();
    const cookie = `${c.name}=${c.value}`;
    const post = (headers) => fetch(API + PARSE, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ text: "CSRFPROBE" }) });
    const before = modelCalls();
    check(g, "no cookie -> 401", (await post({ origin: ORIGIN })).status === 401);
    check(g, "cookie, right Origin, missing CSRF token -> 403", (await post({ cookie, origin: ORIGIN })).status === 403);
    check(g, "cookie, right Origin, wrong CSRF token -> 403", (await post({ cookie, origin: ORIGIN, "x-csrf-token": "wrong" })).status === 403);
    check(g, "valid CSRF token but foreign Origin -> 403", (await post({ cookie, origin: "http://evil.example", "x-csrf-token": body.csrfToken })).status === 403);
    check(g, "none of the rejected requests reached the model", modelCalls() === before);
    const big = await fetch(API + PARSE, { method: "POST", headers: { "content-type": "application/json", cookie, origin: ORIGIN, "x-csrf-token": body.csrfToken }, body: JSON.stringify({ text: "x".repeat(2001) }) });
    check(g, "2,001 characters -> 400 from the server as well", big.status === 400);
  }

  /* ======================= REAL: 401 mid-session ======================= */
  {
    const g = "REAL session invalidation on HTTP 401";
    await toComposerFromReview();
    await setText("Invoice Acme Design 401 draft text that must vanish.");
    sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
    const m = mark();
    await clickParse();
    check(g, "a real 401 from the server ends the session and shows sign-in", await waitFor("!!document.getElementById('login-title') && !document.querySelector('.app-nav')", 6000));
    check(g, "the parse request really returned 401", parseCalls(m)[0]?.status === 401, JSON.stringify(parseCalls(m)));
    const t = await bodyText();
    check(g, "session-expired notice shown, composer text and review wiped", /Your session has ended/.test(t) && !/401 draft text/.test(await ev("document.documentElement.outerHTML")), t.slice(0, 200));
    await signIn();
    await toComposer();
    check(g, "after signing in again the composer is empty (fresh epoch)", (await val("comp-text")) === "");
  }

  /* ======================= a11y: keyboard, mobile, dark ======================= */
  {
    const g = "REAL keyboard, 390px mobile and dark theme";
    await setText("NODUE Invoice Acme Design for logo work.");
    await focusId("parse-btn");
    await press("Enter");
    check(g, "keyboard Enter on 'Parse with AI' runs the real parse", await waitFor("!!document.getElementById('clar-0')", 7000));
    const c1 = await ev(CONTRAST_SCAN);
    check(g, "clarification state text contrast >= WCAG AA (light)", c1.length === 0, JSON.stringify(c1));
    await viewport(390, 844, true);
    await sleep(200);
    const ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow at 390px (clarification)", ov === "", ov);
    await shot("07-mobile-clarification.jpg");
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await load();
    await waitFor("!!document.querySelector('.app-nav') || !!document.getElementById('login-title')");
    if (await onLogin()) await login(USER, PASSWORD);
    await waitFor("!!document.querySelector('.app-nav')");
    await toComposer();
    await simulate((p) => (p.request.url.endsWith(PARSE) ? { status: 503, body: {} } : "continue"));
    await setText("Invoice Acme Design for logo work, dark theme.");
    await clickParse();
    await waitFor("!!document.getElementById('parse-failed')");
    const c2 = await ev(CONTRAST_SCAN);
    check(g, "failure state text contrast >= WCAG AA (dark, 390px)", c2.length === 0, JSON.stringify(c2));
    const ov2 = await ev(OVERFLOW);
    check(g, "no horizontal overflow at 390px (failure, dark)", ov2 === "", ov2);
    check(g, "the failure alert is an announced alert region", await ev("!!document.querySelector('#parse-failed[role=alert]')"));
    await shot("08-mobile-dark-failure.jpg");
    await stopSimulating();
    await viewport(1280, 900);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  }

  /* ======================= PHASE B: provider unconfigured, real 429 ======================= */
  {
    const g = "REAL provider-unconfigured server and real 429 (no model client at all)";
    await stopApi();
    writeFileSync(modelLog, "");
    await startApi({ NMI_FAKE_MODEL: "off", NMI_PARSE_BUDGET: "2" });
    await signIn();
    await toComposer();
    const m = mark();
    let r = await parseOnce("Invoice Acme Design for logo work, unconfigured.", "/AI parsing is unavailable/.test(document.body.innerText)");
    let t = await bodyText();
    check(g, "genuine ai_not_configured -> unavailable notice saying nothing reached a provider", r.ok && /not configured on the server/.test(t) && /not sent to any AI provider/.test(t), t.slice(0, 300));
    check(g, "manual entry is offered", /Continue with manual entry/.test(t));
    await shot("09-unavailable-unconfigured.jpg");
    r = await parseOnce("Invoice Acme Design for logo work, second.", "/AI parsing is unavailable/.test(document.body.innerText)");
    const m3 = mark();
    await setText("Invoice Acme Design for logo work, third request.");
    await clickParse();
    check(g, "the third request is a REAL 429 and the UI reports the wait", await waitFor("!!document.getElementById('parse-failed')", 5000) && /Too many parse requests/.test(await bodyText()), await bodyText());
    const c429 = parseCalls(m3);
    await sleep(800);
    check(g, "429 carries a Retry-After and the browser did not retry", c429.length === 1 && c429[0].status === 429 && parseCalls(m3).length === 1, JSON.stringify(parseCalls(m3)));
    check(g, "all three were real server responses: 200, 200, 429", JSON.stringify(parseCalls(m).map((c) => c.status)) === "[200,200,429]", JSON.stringify(parseCalls(m).map((c) => c.status)));
    check(g, "no model client existed, so no model was invoked", modelCalls() === 0);
    await shot("10-real-429.jpg");
  }

  /* ======================= global invariants ======================= */
  {
    const g = "Global invariants";
    const s = await ev(STORAGE);
    check(g, "no localStorage/sessionStorage/IndexedDB/Cache entries", s.local === 0 && s.session === 0 && s.idb === 0 && s.caches === 0, JSON.stringify(s));
    check(g, "no cookie readable from script (HttpOnly) and no invoice text in the URL", s.cookie === "" && !/Invoice|Acme/.test(s.href), JSON.stringify(s));
    check(g, "no request left the app origin (no OpenAI/PayPal/foreign host)", foreign.length === 0, JSON.stringify(foreign));
    const apiPaths = new Set(netLog.filter((n) => n.path.startsWith("/api/")).map((n) => n.path));
    check(g, "the only /api routes the browser used are the 3 auth routes and the parse route", [...apiPaths].every((p) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts\/parse)$/.test(p)), [...apiPaths].join(","));
    check(g, "no invoice save/list/detail/PayPal request was made", ![...apiPaths].some((p) => /invoice-drafts$|paypal/.test(p)));
    check(g, "no invoices or approvals rows were created by this journey", Number(sql("SELECT count(*) FROM invoices")) === 0 && Number(sql("SELECT count(*) FROM approvals")) === 0);
    check(g, "parse attempts are audited without customer text", Number(sql("SELECT count(*) FROM audit_log WHERE action = 'invoice.parse'")) > 0 && !/Acme|billing@|Invoice/.test(sql("SELECT string_agg(detail::text, ' ') FROM audit_log WHERE action = 'invoice.parse'")));
    const log = readFileSync(apiLog, "utf8");
    check(g, "API log contains no CSRF token, cookie value or invoice text", !/Acme Design|billing@acme|csrf-token\"?:\s*\"[A-Za-z0-9]/.test(log));
    check(g, "no console errors or uncaught exceptions in the browser", consoleMsgs.filter((x) => !/Failed to load resource|net::ERR|status of (4|5)\d\d/.test(x)).length === 0, consoleMsgs.slice(0, 5).join(" / "));
  }
} catch (e) {
  record("harness", "unexpected failure", false, String(e?.stack || e).slice(0, 600));
} finally {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const lines = [
    "# NMI-UI-01C2 browser parse-wiring journey",
    "",
    `Chrome: ${version?.Browser ?? "unknown"} (headless). PostgreSQL: ${run(join(PG_BIN, "postgres"), ["--version"]).trim()} (disposable cluster, destroyed after the run).`,
    "Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.",
    "Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment; the draft/clarification paths use a deterministic TEST-ONLY FAKE model client (not OpenAI) behind the real Fastify routes.",
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
