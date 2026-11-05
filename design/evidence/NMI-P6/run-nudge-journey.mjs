/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-P6 AI Nudge Queue — browser journey QA (SIMULATED model, synthetic data only, everything local and disposable).
//
//   pnpm build && node design/evidence/NMI-P6/run-nudge-journey.mjs
//
// Shape under test: headless Chrome -> the REAL Fastify app (test-api-server.ts: real auth, CSRF/Origin, rate limits,
// nudge routes, output validation and audit; a DETERMINISTIC FAKE nudge model instead of OpenAI) serving the built
// SPA from apps/web/dist on one origin -> disposable PostgreSQL 16 as the least-privilege runtime role.
// No provider is reachable: OPENAI_API_KEY is empty, PayPal drafting is disabled, and every browser request to a
// foreign host is recorded and must be zero. Synthetic customers use example.test addresses.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const dist = join(root, "apps/web/dist");
const API_PORT = 3161;
const ORIGIN = `http://localhost:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54361;
const DEBUG_PORT = 9361;
const DB = "nmi_test_p6_nudges";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots");
const USER = "p6-operator";
const PASSWORD = randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env0 = { ...process.env, LC_ALL: "en_US.UTF-8" };

const results = [];
const check = (group, name, cond, detail = "") => {
  results.push({ group, name, result: cond ? "PASS" : "FAIL", detail: cond ? "" : String(detail).slice(0, 700) });
  console.log(`${cond ? "PASS" : "FAIL"}  [${group}] ${name}${cond ? "" : " - " + String(detail).slice(0, 400)}`);
};
const info = { startedAt: new Date().toISOString(), synthetic: true, model: "DETERMINISTIC FAKE (not OpenAI)" };
if (!existsSync(join(dist, "index.html"))) throw new Error("Run `pnpm build` (default community web build) first");

/* ------------------------------------------------ disposable PostgreSQL 16: owner + least-privilege runtime role */
const work = mkdtempSync(join(tmpdir(), "nmi-p6-"));
const children = [];
const cleanup = () => {
  for (const c of children) try { process.kill(-c.pid, "SIGTERM"); } catch { try { c.kill("SIGTERM"); } catch {} }
  spawnSync(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "immediate", "stop"], { stdio: "ignore", env: env0 });
  rmSync(work, { recursive: true, force: true });
};
process.on("exit", cleanup);
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: env0, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || "").slice(0, 300)}`);
  return r.stdout;
};
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_owner", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psql = (db, args) => run(join(PG_BIN, "psql"), ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_owner", "-d", db, "-X", "-v", "ON_ERROR_STOP=1", ...args]);
const sql = (s) => psql(DB, ["-tA", "-c", s]).trim();
psql("postgres", ["-c", `CREATE DATABASE ${DB}`]);
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) psql(DB, ["-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
psql(DB, ["-q", "-c", "CREATE ROLE nmi_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"]);
psql(DB, ["-q", "-f", join(root, "packages/db/ops/runtime-role.sql")]);
const OWNER_URL = `postgres://nmi_owner@127.0.0.1:${PG_PORT}/${DB}`;
const RUNTIME_URL = `postgres://nmi_runtime@127.0.0.1:${PG_PORT}/${DB}`;
run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...env0, DATABASE_URL: OWNER_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: PASSWORD } });
const OP = sql(`SELECT id FROM operators WHERE username='${USER}'`);
info.migrations = journal.entries.map((e) => e.tag);

/* ------------------------------------------------ the test-only launcher (real app, fake nudge model) */
const SCRIPT = join(work, "model-script");
const MODEL_LOG = join(work, "model-inputs.log");
const apiLog = join(work, "api.log");
writeFileSync(SCRIPT, "ok");
writeFileSync(MODEL_LOG, "");
const setModel = (mode) => writeFileSync(SCRIPT, mode);
let api = null;
async function startApi(extra = {}) {
  api = spawn("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(here, "test-api-server.ts")], {
    cwd: root, detached: true, stdio: ["ignore", openSync(apiLog, "a"), openSync(apiLog, "a")],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: "en_US.UTF-8", NODE_ENV: "development", HOST: "127.0.0.1", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, WEB_DIST_DIR: dist, DATABASE_URL: RUNTIME_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", PAYPAL_DRAFTS_ENABLED: "false", OPENAI_API_KEY: "", OPENAI_MODEL: "", NMI_P6_SIMULATED: "1", NMI_P6_MODEL_SCRIPT: SCRIPT, NMI_P6_MODEL_LOG: MODEL_LOG, NMI_P6_BUDGET: "40", ...extra },
  });
  children.push(api);
  for (let i = 0; i < 300; i++) { try { if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) return; } catch {} await sleep(150); }
  throw new Error("test API did not start: " + readFileSync(apiLog, "utf8").slice(-800));
}
async function stopApi() {
  try { process.kill(-api.pid, "SIGTERM"); } catch {}
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${API_PORT}/health`); } catch { return; } await sleep(100); }
}
await startApi();

/* ------------------------------------------------ the launcher fails closed (opt-in + never production) */
{
  const tsx = (env) => spawnSync("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(here, "test-api-server.ts")], { cwd: root, encoding: "utf8", env: { ...env0, ...env }, timeout: 60000 });
  const noOptIn = tsx({ NMI_P6_SIMULATED: "" });
  const prod = tsx({ NMI_P6_SIMULATED: "1", NODE_ENV: "production" });
  check("launcher", "the simulated launcher refuses to start without NMI_P6_SIMULATED=1 and refuses NODE_ENV=production (exit 2)", noOptIn.status !== 0 && /refusing to start/.test(noOptIn.stderr + noOptIn.stdout) && prod.status !== 0 && /refusing to start/.test(prod.stderr + prod.stdout), `${noOptIn.status} ${prod.status}`);
}

/* ------------------------------------------------ HTTP helper (a SECOND session of the same operator, for seeding) */
async function http(method, path, { cookie, csrf, body, headers = {} } = {}) {
  const r = await fetch(`http://127.0.0.1:${API_PORT}${path}`, { method, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, headers: r.headers };
}
const L = await http("POST", "/api/auth/login", { body: { username: USER, password: PASSWORD } });
const side = { cookie: L.headers.get("set-cookie").split(";")[0], csrf: L.json.csrfToken };

/* ------------------------------------------------ synthetic invoices through the REAL save route */
const CUSTOMERS = [
  ["Zorblax Industries", "USD", "1200.00", "2026-10-30"],
  ["Northwind Studio", "EUR", "860.00", "2026-11-03"],
  ["Bluebird Bakery", "JPY", "188837", "2026-11-12"],
  ["Lumen Labs", "USD", "2450.00", "2026-10-12"],
  ["Quill & Co", "GBP", "540.00", "2026-10-28"],
  ["Harbor Coffee", "AUD", "310.00", "2026-11-05"],
  ["Cobalt Ceramics", "CAD", "1975.50", "2026-11-20"],
];
const INV = {};
for (const [i, [name, currency, unit, due]] of CUSTOMERS.entries()) {
  const r = await http("POST", "/api/invoice-drafts", { ...side, headers: { "idempotency-key": `p6-seed-${String(i).padStart(4, "0")}-key-xxxxxxxx` }, body: { customerName: name, customerEmail: `billing${i}@example.test`, currency, lineItems: [{ description: `Synthetic project ${i}`, quantity: "1", unitPrice: unit }], dueDate: due, taxPercent: null, discount: null } });
  if (r.status !== 201) throw new Error(`seed ${name}: ${r.status} ${JSON.stringify(r.json)}`);
  INV[name] = r.json.id;
}
check("seed", `${CUSTOMERS.length} synthetic invoices (USD/EUR/JPY/GBP/AUD/CAD) saved through the real route`, Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${OP}'`)) === CUSTOMERS.length);
const gen = (name, tone, replace = null) => http("POST", `/api/invoice-drafts/${INV[name]}/nudges`, { ...side, body: { tone, timeZone: ZONE, ...(replace ? { replace } : {}) } });

/* ------------------------------------------------ headless Chrome over CDP */
const profile = mkdtempSync(join(tmpdir(), "nmi-p6-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore", detached: true });
children.push(chrome);
process.on("exit", () => rmSync(profile, { recursive: true, force: true, maxRetries: 3 }));
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break; } catch {} await sleep(150); }
const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
let msgId = 0;
const pending = new Map();
const consoleMsgs = [];
const net = [];
const foreign = [];
const intercept = { nudgesFail: false, nudgesDelayMs: 0 };
ws.onmessage = async (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { ok, bad } = pending.get(msg.id); pending.delete(msg.id); msg.error ? bad(new Error(msg.error.message)) : ok(msg.result); return; }
  const p = msg.params;
  if (msg.method === "Runtime.exceptionThrown") consoleMsgs.push("exception: " + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  else if (msg.method === "Runtime.consoleAPICalled") consoleMsgs.push(`console.${p.type}: ` + p.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Log.entryAdded") consoleMsgs.push(`log.${p.entry.level}: ${p.entry.text}`);
  else if (msg.method === "Network.requestWillBeSent") { const u = p.request.url; if (u.startsWith(ORIGIN + "/")) net.push({ id: p.requestId, method: p.request.method, path: u.slice(ORIGIN.length) }); else if (!/^(about:|data:|blob:)/.test(u)) foreign.push(u); }
  else if (msg.method === "Network.responseReceived") { const e = net.find((x) => x.id === p.requestId); if (e) e.status = p.response.status; }
  else if (msg.method === "Fetch.requestPaused") {
    const path = p.request.url.slice(ORIGIN.length);
    if (/^\/api\/nudges(\?|$)/.test(path) && intercept.nudgesDelayMs) await sleep(intercept.nudgesDelayMs);
    if (/^\/api\/nudges(\?|$)/.test(path) && intercept.nudgesFail) { await send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 500, responseHeaders: [{ name: "content-type", value: "application/json" }], body: Buffer.from('{"error":"internal"}').toString("base64") }).catch(() => {}); return; }
    // A request cancelled by navigation while held is gone: ignore "Invalid InterceptionId".
    await send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
  }
};
const send = (method, params = {}) => new Promise((ok, bad) => { const id = ++msgId; pending.set(id, { ok, bad }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error("eval failed: " + expression.slice(0, 100) + " :: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 20000, what = expr) => { const t = Date.now(); for (;;) { let v = false; try { v = await ev(expr); } catch {} if (v) return v; if (Date.now() - t > ms) throw new Error("timed out waiting for: " + what.slice(0, 160)); await sleep(120); } };
const q = JSON.stringify;
const hasText = (t) => ev(`document.body.innerText.includes(${q(t)})`);
const waitText = (t, ms) => waitFor(`document.body.innerText.includes(${q(t)})`, ms, t);
// Click the first VISIBLE element matching `sel` whose trimmed text starts with `text` (or the first match when no text).
const clickBy = (sel, text = null) => ev(`(() => { const els = [...document.querySelectorAll(${q(sel)})].filter((e) => e.getClientRects().length && (${q(text)} === null || (e.textContent || '').trim().startsWith(${q(text)}))); if (!els[0]) throw new Error('nothing to click: ' + ${q(sel)} + ' ' + ${q(text)}); els[0].click(); return true; })()`);
const setValue = (sel, v, proto = "HTMLInputElement") => ev(`(() => { const e = document.querySelector(${q(sel)}); const set = Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set; set.call(e, ${q(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const VK = { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35, Enter: 13, Tab: 9 };
const key = async (k) => { await send("Input.dispatchKeyEvent", { type: k === "Enter" ? "keyDown" : "rawKeyDown", key: k, code: k, windowsVirtualKeyCode: VK[k], ...(k === "Enter" ? { text: "\r" } : {}) }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: VK[k] }); await sleep(150); };
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Fetch.enable", { patterns: [{ urlPattern: `${ORIGIN}/api/nudges*` }] });
await send("Emulation.setTimezoneOverride", { timezoneId: ZONE });
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
let viewport = DESKTOP;
let theme = "light";
const setView = async (v) => { viewport = v; await send("Emulation.setDeviceMetricsOverride", v); await send("Emulation.setTouchEmulationEnabled", { enabled: v.mobile }); };
const setTheme = async (t) => { theme = t; await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: t }] }); };
mkdirSync(SHOTS, { recursive: true });
const shots = [];
async function shot(name) {
  await sleep(250);
  const h = await ev("Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))");
  await send("Emulation.setDeviceMetricsOverride", { ...viewport, height: Math.min(Math.max(h, viewport.height), 5000) });
  await sleep(300);
  const s = await send("Page.captureScreenshot", { format: "png" });
  const file = `${name}-${viewport.mobile ? "mobile" : "desktop"}-${theme}.png`;
  writeFileSync(join(SHOTS, file), Buffer.from(s.data, "base64"));
  shots.push(file);
  await send("Emulation.setDeviceMetricsOverride", viewport);
}

/* ------------------------------------------------ objective page checks (overflow, ≥44px targets, clipping, contrast) */
const SCOPE = ".nq-summary, section[aria-labelledby=nq-title], .nq-draft, .nq-chat, .nudgey-panel, .mobile-nav, dialog[open]";
async function pageChecks(label) {
  const g = `${viewport.mobile ? "mobile" : "desktop"}-${theme}`;
  const over = await ev("document.scrollingElement.scrollWidth - innerWidth");
  check(g, `${label}: no horizontal page overflow`, over <= 0, String(over));
  if (viewport.mobile) {
    const small = await ev(`[...document.querySelectorAll(${q(SCOPE)})].flatMap((s) => [...s.querySelectorAll('button, [role=tab], select, summary, a[href], textarea, input:not([type=radio]):not([type=checkbox]), label.nq-tone, label.schedule-candidate-option')]).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; }).map((e) => (e.tagName + '.' + e.className + ':' + (e.textContent || '').trim().slice(0, 24) + '=' + Math.round(e.getBoundingClientRect().height)))`);
    check(g, `${label}: every interactive P6 target is at least 44px tall on a phone (owner refinement 3)`, small.length === 0, small.join(" | "));
  }
  const clipped = await ev(`[...document.querySelectorAll('select.nq-tone-select')].filter((s) => s.getClientRects().length).map((s) => { const cs = getComputedStyle(s); const span = document.createElement('span'); span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + cs.font; span.textContent = 'Professional'; document.body.appendChild(span); const need = span.getBoundingClientRect().width; span.remove(); const avail = s.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); return avail >= need ? null : 'need ' + need.toFixed(1) + ' have ' + avail.toFixed(1); }).filter(Boolean)`);
  const selects = await ev(`document.querySelectorAll('select.nq-tone-select').length`);
  if (selects) check(g, `${label}: the tone select shows "Professional" in full (owner refinement 2)`, clipped.length === 0, clipped.join(","));
  const lowContrast = await ev(`(() => {
    const rgb = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
    const out = [];
    for (const s of document.querySelectorAll(${q(SCOPE)})) for (const el of s.querySelectorAll('*')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!el.getClientRects().length || el.closest('[disabled], .sr-only, [aria-hidden=true]')) continue;
      const cs = getComputedStyle(el); const fg = rgb(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
      const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) out.push(el.tagName + ':' + el.textContent.trim().slice(0, 30) + '=' + ratio.toFixed(2));
    }
    return out;
  })()`);
  check(g, `${label}: text in the P6 surfaces meets WCAG AA contrast (computed)`, lowContrast.length === 0, lowContrast.slice(0, 8).join(" | "));
  const unnamed = await ev(`[...document.querySelectorAll(${q(SCOPE)})].flatMap((s) => [...s.querySelectorAll('button, select, textarea, [role=tab]')]).filter((e) => e.getClientRects().length && !(e.getAttribute('aria-label') || (e.textContent || '').trim() || (e.id && document.querySelector('label[for=\"' + e.id + '\"]')) || e.closest('label'))).length`);
  check(g, `${label}: every control in the P6 surfaces has an accessible name`, unnamed === 0, String(unnamed));
}

/* ------------------------------------------------ app navigation helpers */
async function login() {
  await send("Page.navigate", { url: ORIGIN + "/" });
  await waitFor("Boolean(document.querySelector('#login-username') || document.querySelector('#dash-title'))");
  if (await ev("Boolean(document.querySelector('#login-username'))")) {
    await setValue("#login-username", USER);
    await setValue("#login-password", PASSWORD);
    await clickBy("form button[type=submit]");
  }
  await waitFor("Boolean(document.querySelector('#dash-title'))");
}
const goDashboard = async () => { await clickBy(viewport.mobile ? ".mobile-nav button" : ".app-nav .nav-link", viewport.mobile ? "Drafts" : "Invoice drafts"); await waitFor("Boolean(document.querySelector('#dash-title'))"); await waitFor("Boolean(document.querySelector('.nq-summary'))"); };
// Re-entering from the dashboard remounts the queue, which re-reads the server (the app never polls).
const goQueue = async () => { if (await ev("Boolean(document.querySelector('#nq-title'))")) await goDashboard(); await clickBy(viewport.mobile ? ".mobile-nav button" : ".app-nav .nav-link", viewport.mobile ? "Nudges" : "Nudge queue"); await waitFor("Boolean(document.querySelector('#nq-title'))"); await waitFor("!document.querySelector('[aria-label=\"Loading nudges\"]')"); };
const tab = async (label) => { await clickBy("[role=tab]", label); await waitFor("!document.querySelector('[aria-label=\"Loading nudges\"]')"); await sleep(200); };
async function openSaved(name) {
  await goDashboard();
  await waitFor(`Boolean(document.querySelector('button[aria-label$=${q("for " + name)}]'))`, 20000, "grid row " + name);
  await ev(`document.querySelector('button[aria-label$=${q("for " + name)}]').click()`);
  await waitFor(`document.querySelector('#saved-title')?.textContent === ${q(name)}`);
  await waitFor("Boolean(document.querySelector('.nq-draft'))");
  await waitFor("Boolean(!document.querySelector('.nq-draft .btn-primary[disabled]') || document.querySelector('#nq-draft-pending') || document.querySelector('#nq-draft-ai-off'))", 10000, "draft card ready");
}
const nudgesFor = (name) => sql(`SELECT count(*) FROM invoice_nudges WHERE invoice_id='${INV[name]}'`);
const generatePosts = () => net.filter((n) => n.method === "POST" && /^\/api\/invoice-drafts\/[^/]+\/nudges$/.test(n.path)).length;
const modelCalls = () => readFileSync(MODEL_LOG, "utf8").split("\n").filter(Boolean).length;

try {
  /* ================================================ DESKTOP, LIGHT: the full journey */
  await setView(DESKTOP);
  await setTheme("light");
  await login();
  {
    const g = "dashboard";
    await waitFor("Boolean(document.querySelector('.nq-summary')) && Boolean(document.querySelector('.filters'))");
    const order = await ev(`(() => { const head = document.querySelector('.page-head'); const card = document.querySelector('.nq-summary'); const filters = document.querySelector('.filters'); return { cardAfterHead: head.nextElementSibling === card, cardBeforeFilters: Boolean(filters) && Boolean(card.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()`);
    check(g, "the AI Nudge Queue card sits directly under the page heading and ABOVE the unchanged P5 filters (D1)", order.cardAfterHead && order.cardBeforeFilters, JSON.stringify(order));
    await waitFor("document.querySelector('[data-testid=count-pending]')?.textContent === '0'");
    check(g, "an empty queue shows real zero counts and the empty hint (no fictional numbers)", await hasText("No drafts waiting for review."));
    check(g, "the nav has a 'Nudge queue' tab", await ev(`[...document.querySelectorAll('.app-nav .nav-link')].some((b) => b.textContent.startsWith('Nudge queue'))`));
    await pageChecks("dashboard (empty queue)");
  }

  /* --- draft from a saved invoice (frame 05) --- */
  {
    const g = "draft-card";
    await openSaved("Zorblax Industries");
    check(g, "the saved invoice shows the AI payment nudge card with three tones and the privacy note", await ev(`document.querySelectorAll('.nq-draft input[type=radio]').length === 3`) && (await hasText("the AI receives only the tone, the currency code")));
    await pageChecks("saved invoice: AI payment nudge card");
    await shot("05-draft-card-idle");
    const before = generatePosts();
    setModel("slow");
    await clickBy(".nq-draft button.btn-primary", "Draft nudge");
    await waitText("Drafting a professional nudge");
    await shot("05-draft-card-drafting");
    await waitText("Draft ready for review.", 15000);
    setModel("ok");
    check(g, "Draft nudge made exactly ONE POST and ONE model call", generatePosts() - before === 1 && modelCalls() === 1, `${generatePosts() - before} ${modelCalls()}`);
    const row = sql(`SELECT status||'|'||tone||'|'||(message LIKE '%USD 1,200.00%')||'|'||(message LIKE '%October 30, 2026%')||'|'||(message LIKE '%Zorblax Industries%')||'|'||(message = ai_message) FROM invoice_nudges WHERE invoice_id='${INV["Zorblax Industries"]}'`);
    check(g, "the stored draft is pending, professional, and carries the VERIFIED amount, due date and customer from the saved invoice", row === "pending_review|professional|true|true|true|true", row);
    const inputs = readFileSync(MODEL_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    check(g, "the model input carried ONLY tone, currency, a date-only due status and the repeat flag: no name, e-mail, amount, date or id", inputs.every((i) => Object.keys(i).sort().join(",") === "currency,due_status,earlier_reminder_approved,tone" && !/\d/.test(JSON.stringify(i)) && !/zorblax|example\.test|unpaid|overdue/i.test(JSON.stringify(i))), JSON.stringify(inputs));
    await shot("05-draft-card-created");
    await clickBy("#nq-draft-created button", "Open in queue");
    await waitFor("Boolean(document.querySelector('#nq-title'))");
    await waitFor("Boolean(document.querySelector('.nq-review textarea'))");
    check(g, "Open in queue lands on Pending review with that draft open", (await ev("document.querySelector('#nq-review-title').textContent")) === "Zorblax Industries");
  }

  /* --- Nudgey chat drafting (frame 07) --- */
  {
    const g = "nudgey";
    await goDashboard();
    await clickBy("button[aria-label^='Open Nudgey']");
    await waitFor("Boolean(document.querySelector('.nudgey-panel'))");
    await ev(`[...document.querySelectorAll('.nudgey-action')].find((e) => e.textContent.includes('Ask Nudgey')).click()`);
    await waitFor("Boolean(document.querySelector('.chat-form input'))");
    await setValue(".chat-form input", "send it");
    await clickBy(".chat-form button[type=submit]");
    await waitText("never contacts your customers");
    check(g, "'send it' is refused clearly and nothing is drafted", generatePosts() === 1);
    await setValue(".chat-form input", "draft a friendly nudge for northwind");
    await clickBy(".chat-form button[type=submit]");
    await waitText("I found 1 matching invoice");
    check(g, "the draft request found the operator's matching invoice and asks for confirmation before the costed call", (await hasText("This makes one AI call.")) && generatePosts() === 1);
    await pageChecks("Nudgey: draft proposal");
    await shot("07-nudgey-confirm");
    await clickBy(".nq-chat button", "Draft friendly nudge");
    await waitText("Draft ready for review", 15000);
    check(g, "confirming drafted exactly one friendly nudge for Northwind Studio", generatePosts() === 2 && sql(`SELECT tone FROM invoice_nudges WHERE invoice_id='${INV["Northwind Studio"]}'`) === "friendly");
    await shot("07-nudgey-draft-ready");
    await clickBy(".nq-chat button", "Open in queue");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Northwind Studio'");
    check(g, "Open in queue opens the queue on the new draft", true);
  }

  /* --- more drafts through the real route (a second session of the same operator) --- */
  for (const [name, tone] of [["Bluebird Bakery", "firm"], ["Lumen Labs", "professional"], ["Quill & Co", "firm"]]) {
    const r = await gen(name, tone);
    if (r.status !== 201) throw new Error(`gen ${name}: ${r.status}`);
  }

  /* --- review: edit -> save -> approve (version-bound), copy only after approval (frames 02, 03) --- */
  {
    const g = "review";
    await goQueue();
    await waitFor("document.querySelector('[data-testid=count-pending]')?.textContent === '5'");
    check(g, "counts are the real server counts (5 pending, 0 approved, 0 history)", (await ev("[...document.querySelectorAll('.nq-counters dd')].map((d) => d.textContent).join(',')")) === "5,0,0");
    check(g, "the nav badge shows the real pending count", (await ev("document.querySelector('[data-testid=nav-nudge-count]')?.textContent")).startsWith("5"));
    await clickBy(".nq-row", "Zorblax Industries");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Zorblax Industries'");
    check(g, "pending drafts cannot be copied (D2) and there is no Send button anywhere", !(await ev("[...document.querySelectorAll('button')].some((b) => /^(copy|send)/i.test(b.textContent.trim()))")));
    check(g, "the review panel shows verified facts with date-only wording (no payment-status claim)", (await hasText("days after the due date")) && !(await ev("/unpaid|overdue|outstanding/i.test(document.querySelector('.nq-review').innerText)")));
    await pageChecks("queue: pending review");
    await shot("02-queue-pending-review");
    const edited = "Hi Zorblax Industries,\n\nJust checking in on invoice " + INV["Zorblax Industries"].slice(0, 8) + " for USD 1,200.00, which was due on October 30, 2026. Could you share an update on timing?\n\nKind regards,";
    await setValue(".nq-review textarea", edited, "HTMLTextAreaElement");
    check(g, "with unsaved edits, Approve is disabled and says to save first", (await ev("[...document.querySelectorAll('.nq-review button')].find((b) => b.textContent.startsWith('Approve')).disabled")) && (await hasText("save them before approving")));
    await clickBy(".nq-review button", "Save edits");
    await waitText("Edits saved.");
    const afterEdit = sql(`SELECT version||'|'||edited||'|'||(message <> ai_message) FROM invoice_nudges WHERE invoice_id='${INV["Zorblax Industries"]}' AND status='pending_review'`);
    check(g, "saving edits bumps the version, marks it edited and keeps the AI original unchanged", afterEdit === "2|true|true", afterEdit);
    await clickBy(".nq-review button", "Approve for manual use");
    await waitText("Nothing was sent");
    const appr = sql(`SELECT status||'|'||version||'|'||(approved_at IS NOT NULL) FROM invoice_nudges WHERE invoice_id='${INV["Zorblax Industries"]}' AND status='approved'`);
    check(g, "approval applied to the reviewed version (v2 -> approved v3)", appr === "approved|3|true", appr);
    await clickBy("#nq-flash button", "Open Approved");
    await waitFor("document.querySelector('[role=tab][aria-selected=true]')?.textContent.startsWith('Approved')");
    await waitFor("Boolean(document.querySelector('#nq-approved-title'))");
    check(g, "Approved shows the locked text, 'Not sent', and a Copy button", (await hasText("Not sent — copy it")) && !(await ev("Boolean(document.querySelector('.nq-review textarea'))")));
    await clickBy(".nq-review button", "Copy message");
    await waitText("Copied to clipboard");
    const clip = await ev("navigator.clipboard.readText()");
    check(g, "Copy put exactly the approved message on the clipboard", clip === sql(`SELECT message FROM invoice_nudges WHERE invoice_id='${INV["Zorblax Industries"]}' AND status='approved'`), clip.slice(0, 80));
    await pageChecks("queue: approved");
    await shot("03-queue-approved-copy");
  }

  /* --- reject (with confirmation) and regenerate (replace) -> History (frame 04) --- */
  {
    const g = "history";
    await tab("Pending review");
    await clickBy(".nq-row", "Quill & Co");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Quill & Co'");
    await clickBy(".nq-review button", "Reject");
    await waitFor("Boolean(document.querySelector('dialog[open]'))");
    check(g, "Reject asks for confirmation first (nothing rejected yet)", sql(`SELECT status FROM invoice_nudges WHERE invoice_id='${INV["Quill & Co"]}'`) === "pending_review");
    await pageChecks("reject confirmation dialog");
    await clickBy("dialog[open] button", "Reject draft");
    await waitText("moved to History");
    check(g, "the rejected draft is stored as rejected", sql(`SELECT status FROM invoice_nudges WHERE invoice_id='${INV["Quill & Co"]}'`) === "rejected");
    await clickBy(".nq-row", "Lumen Labs");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Lumen Labs'");
    await setValue(".nq-regen select", "firm", "HTMLSelectElement");
    const posts = generatePosts();
    await clickBy(".nq-review button", "Regenerate");
    await waitFor("Boolean(document.querySelector('dialog[open]'))");
    check(g, "Regenerate confirms the costed call before making it", generatePosts() === posts && (await hasText("This makes one AI call.")));
    await clickBy("dialog[open] button", "Draft new version");
    await waitText("New firm draft ready for review.", 15000);
    const lumen = sql(`SELECT string_agg(status||':'||tone, ',' ORDER BY created_at) FROM invoice_nudges WHERE invoice_id='${INV["Lumen Labs"]}'`);
    check(g, "regenerate replaced the pending draft: the old one is superseded, the new firm one pending", lumen === "superseded:professional,pending_review:firm", lumen);
    await tab("History");
    await waitFor("document.querySelectorAll('.nq-history tbody tr').length === 2");
    check(g, "History lists the rejected and the replaced drafts and says nothing in it was sent", (await hasText("Rejected")) && (await hasText("Replaced by a newer draft")) && (await hasText("Nothing in history was sent.")));
    await pageChecks("queue: history");
    await shot("04-queue-history");
    // Keyboard: the tablist follows the ARIA pattern (arrow keys move and select).
    await ev("document.querySelector('[role=tab][aria-selected=true]').focus()");
    await key("ArrowLeft");
    const sel = await ev("document.activeElement.getAttribute('role') + ':' + document.activeElement.textContent + ':' + document.activeElement.getAttribute('aria-selected')");
    check("a11y", "ArrowLeft on the History tab moves focus to and selects 'Approved' (ARIA tablist)", /^tab:Approved.*:true$/.test(sel), sel);
  }

  /* --- version conflict: changed in another session while open here --- */
  {
    const g = "conflict";
    await tab("Pending review");
    await clickBy(".nq-row", "Bluebird Bakery");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Bluebird Bakery'");
    const nd = JSON.parse(sql(`SELECT json_build_object('id', id, 'version', version) FROM invoice_nudges WHERE invoice_id='${INV["Bluebird Bakery"]}' AND status='pending_review'`));
    const other = await http("POST", `/api/nudges/${nd.id}/edit`, { ...side, body: { version: nd.version, message: "Hi Bluebird Bakery, a quick note about the invoice due on November 12, 2026. Kind regards," } });
    check(g, "another session edited the same draft (v1 -> v2)", other.status === 200 && other.json.version === 2, String(other.status));
    await clickBy(".nq-review button", "Approve for manual use");
    await waitText("This draft changed in another tab.");
    check(g, "approving the stale version is refused with a clear message, and nothing was approved", sql(`SELECT status FROM invoice_nudges WHERE id='${nd.id}'`) === "pending_review");
    await shot("06-state-version-conflict");
    await clickBy("#nq-panel-notice button", "Reload draft");
    await waitFor("document.querySelector('.nq-review textarea')?.value.startsWith('Hi Bluebird Bakery, a quick note')");
    check(g, "Reload shows the latest text, which can then be approved", true);
  }

  /* --- refusal: an unsupported payment-status claim from the model is rejected and nothing is stored --- */
  {
    const g = "refusal";
    await openSaved("Harbor Coffee");
    setModel("unpaid");
    const before = nudgesFor("Harbor Coffee");
    await clickBy(".nq-draft button.btn-primary", "Draft nudge");
    await waitText("didn't pass our checks", 15000);
    setModel("ok");
    check(g, "a 'still unpaid' draft is refused (422) and nothing is stored", nudgesFor("Harbor Coffee") === before && before === "0" && net.some((n) => n.method === "POST" && n.status === 422), before);
    const audit = sql(`SELECT detail->>'reason' FROM audit_log WHERE action='nudge.generate' AND outcome='failure' ORDER BY at DESC LIMIT 1`);
    check(g, "the refusal is audited with a content-free reason (payment_status_claim)", audit === "payment_status_claim", audit);
    await pageChecks("draft card: refused");
    await shot("06-state-refused");
  }

  /* --- pending exists: shown up front on the saved invoice, with Replace / Review existing --- */
  {
    const g = "pending-exists";
    await openSaved("Northwind Studio");
    await waitFor("Boolean(document.querySelector('#nq-draft-pending'))");
    check(g, "an invoice with a waiting draft says so up front and offers Replace or Review existing (no costed call yet)", (await hasText("already has a draft waiting for review")) && (await ev("[...document.querySelectorAll('#nq-draft-pending button')].map((b) => b.textContent).join('|')")).includes("Review existing"));
    await shot("06-state-pending-exists");
  }

  /* --- loading and error states (intercepted reads only) --- */
  {
    const g = "states";
    intercept.nudgesDelayMs = 2500;
    await goDashboard();
    await clickBy(".app-nav .nav-link", "Nudge queue");
    await waitFor("Boolean(document.querySelector('[aria-label=\"Loading nudges\"]'))");
    check(g, "the queue shows a loading skeleton while reading", true);
    await shot("06-state-loading");
    intercept.nudgesDelayMs = 0;
    await waitFor("!document.querySelector('[aria-label=\"Loading nudges\"]')");
    intercept.nudgesFail = true;
    await tab("History");
    await waitText("Could not load your nudges.");
    check(g, "a failed read shows an error with Retry and says the invoices are unaffected", await hasText("Your invoices are unaffected."));
    await shot("06-state-error");
    intercept.nudgesFail = false;
    await clickBy("#nq-error button", "Retry");
    await waitFor("document.querySelectorAll('.nq-history tbody tr').length === 2");
    check(g, "Retry recovers and shows the real History (the rejected and the replaced draft)", true);
  }

  /* ================================================ rate limit (budget seam = 1 after a restart) */
  {
    const g = "rate-limit";
    await stopApi();
    await startApi({ NMI_P6_BUDGET: "1" });
    await openSaved("Cobalt Ceramics");
    await clickBy(".nq-draft button.btn-primary", "Draft nudge");
    await waitText("Draft ready for review.", 15000);
    await openSaved("Harbor Coffee");
    const calls = modelCalls();
    await clickBy(".nq-draft button.btn-primary", "Draft nudge");
    await waitText("You've reached the drafting limit for now.");
    check(g, "past the per-operator budget a REAL 429 is shown with the wait time, no model call is made and nothing is stored", modelCalls() === calls && nudgesFor("Harbor Coffee") === "0" && (await hasText("Try again in about")));
    await shot("06-state-rate-limited");
  }

  /* ================================================ AI off (no model configured) */
  {
    const g = "ai-off";
    await stopApi();
    await startApi({ NMI_P6_MODEL: "off" });
    await openSaved("Harbor Coffee");
    check(g, "the saved-invoice card says AI drafting isn't available and disables Draft nudge", (await hasText("AI drafting isn't available on this server.")) && (await ev("document.querySelector('.nq-draft .btn-primary').disabled")));
    await shot("06-state-ai-off-draft-card");
    await goQueue();
    await waitFor("Boolean(document.querySelector('#nq-ai-off'))");
    check(g, "the queue explains AI is off; Regenerate is disabled but approval still works", await ev("[...document.querySelectorAll('.nq-review button')].find((b) => b.textContent === 'Regenerate')?.disabled === true"));
    await clickBy(".nq-row", "Bluebird Bakery");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Bluebird Bakery'");
    await clickBy(".nq-review button", "Approve for manual use");
    await waitText("Nothing was sent");
    check(g, "a pending draft can still be approved for manual use with AI off", sql(`SELECT status FROM invoice_nudges WHERE invoice_id='${INV["Bluebird Bakery"]}' AND status='approved'`) === "approved");
    await shot("06-state-ai-off-queue");
    await stopApi();
    await startApi();
  }

  /* ================================================ every surface on mobile (light + dark) and desktop dark */
  for (const [v, t] of [[MOBILE, "light"], [MOBILE, "dark"], [DESKTOP, "dark"]]) {
    await setView(v);
    await setTheme(t);
    await send("Page.reload");
    await waitFor("Boolean(document.querySelector('#dash-title'))");
    check(`${v.mobile ? "mobile" : "desktop"}-${t}`, `the app renders in ${t} theme`, (await ev("document.documentElement.dataset.theme")) === t);
    await waitFor("Boolean(document.querySelector('.nq-summary .nq-mini, .nq-summary .hint'))");
    await pageChecks("dashboard summary card");
    await shot("01-dashboard-queue-summary");
    await goQueue();
    await waitFor("Boolean(document.querySelector('.nq-review textarea'))");
    await pageChecks("queue: pending review");
    await shot("02-queue-pending-review");
    await tab("Approved");
    await waitFor("Boolean(document.querySelector('#nq-approved-title'))");
    await pageChecks("queue: approved");
    await shot("03-queue-approved-copy");
    await tab("History");
    await waitFor("document.querySelectorAll('.nq-history tbody tr').length > 0");
    await pageChecks("queue: history");
    await shot("04-queue-history");
    await openSaved("Harbor Coffee");
    await pageChecks("saved invoice: AI payment nudge card");
    await shot("05-draft-card-idle");
    await goDashboard();
    await clickBy("button[aria-label^='Open Nudgey']");
    await waitFor("Boolean(document.querySelector('.nudgey-panel'))");
    await ev(`[...document.querySelectorAll('.nudgey-action')].find((e) => e.textContent.includes('Ask Nudgey')).click()`);
    await setValue(".chat-form input", "draft a firm nudge for cobalt");
    await clickBy(".chat-form button[type=submit]");
    await waitText("I found 1 matching invoice");
    await pageChecks("Nudgey: draft proposal");
    await shot("07-nudgey-confirm");
    await clickBy(".nudgey-close");
  }
  // Desktop light dashboard with real counts, for the record.
  await setView(DESKTOP);
  await setTheme("light");
  await send("Page.reload");
  await waitFor("Boolean(document.querySelector('.nq-summary .nq-mini'))");
  await shot("01-dashboard-queue-summary");

  /* ================================================ boundaries over the whole run */
  {
    const g = "boundaries";
    check(g, "the browser contacted no foreign host (no OpenAI, PayPal, CDN or analytics)", foreign.length === 0, foreign.slice(0, 5).join(","));
    const nudgePaths = [...new Set(net.filter((n) => /nudge/.test(n.path)).map((n) => `${n.method} ${n.path.replace(/[0-9a-f-]{36}/g, ":id").replace(/\?.*$/, "?…")}`))].sort();
    info.nudgeRoutesUsed = nudgePaths;
    check(g, "the browser used only the P6 queue routes; nothing that sends, schedules or dispatches", nudgePaths.every((p) => /^(GET \/api\/nudges(\/summary|\?…)|POST \/api\/invoice-drafts\/:id\/nudges|POST \/api\/nudges\/:id\/(edit|approve|reject))$/.test(p)), nudgePaths.join(", "));
    const audit = sql(`SELECT coalesce(string_agg(detail::text, ' '), '') FROM audit_log WHERE action LIKE 'nudge.%'`);
    check(g, "nudge audit records are content-free (no message text or customer names)", audit.length > 0 && !/Hi |Kind regards|Zorblax|Northwind|Bluebird|Lumen|Quill|Harbor|Cobalt|example\.test/.test(audit), audit.slice(0, 200));
    const inputs = readFileSync(MODEL_LOG, "utf8").split("\n").filter(Boolean);
    info.modelCalls = inputs.length;
    check(g, `every one of the ${inputs.length} model inputs is customer-free (no names, e-mails, digits)`, inputs.every((l) => !/\d|zorblax|northwind|bluebird|lumen|quill|harbor|cobalt|example\.test/i.test(l)));
    check(g, "every stored nudge says nothing was sent: no sent/dispatch column or state exists", sql(`SELECT count(*) FROM information_schema.columns WHERE table_name='invoice_nudges' AND column_name ~ '(sent|dispatch|deliver|schedul)'`) === "0");
    const errs = consoleMsgs.filter((m) => !/Failed to load resource: the server responded with a status of (4\d\d|500)/.test(m));
    check(g, "no uncaught exceptions or console errors (expected 4xx/5xx resource logs excluded)", errs.length === 0, errs.slice(0, 5).join(" | "));
  }
} catch (e) {
  check("run", "journey completed", false, (e && e.stack) || String(e));
  try { await shot("zz-failure"); } catch {}
}

info.finishedAt = new Date().toISOString();
info.screenshots = shots;
const fails = results.filter((r) => r.result === "FAIL").length;
writeFileSync(join(here, "qa-results.json"), JSON.stringify({ task: "NMI-P6", generatedBy: "design/evidence/NMI-P6/run-nudge-journey.mjs", info, summary: { total: results.length, passed: results.length - fails, failed: fails }, results }, null, 2) + "\n");
console.log(`\n${results.length - fails}/${results.length} checks passed; ${shots.length} screenshots`);
ws.close();
process.exit(fails ? 1 : 0);
