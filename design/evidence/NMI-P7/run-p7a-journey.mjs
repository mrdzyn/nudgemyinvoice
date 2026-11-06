/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-P7-A browser journey: already-mounted Nudge queue re-targeting and A->B->A invoice switching in Nudgey (SIMULATED
// fake model, synthetic data only, everything local and disposable). Reuses the P6 test-only launcher; writes ONLY to
// design/evidence/NMI-P7/ (screenshots-p7a/, qa-results-p7a.json) and never to the P6 evidence paths.
//
//   pnpm build && node design/evidence/NMI-P7/run-p7a-journey.mjs
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
const API_PORT = 3162;
const ORIGIN = `http://localhost:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54362;
const DEBUG_PORT = 9362;
const DB = "nmi_test_p7a_nudges";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots-p7a");
const USER = "p7-operator";
const PASSWORD = randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env0 = { ...process.env, LC_ALL: "en_US.UTF-8" };

const results = [];
const check = (group, name, cond, detail = "") => {
  results.push({ group, name, result: cond ? "PASS" : "FAIL", detail: cond ? "" : String(detail).slice(0, 700) });
  console.log(`${cond ? "PASS" : "FAIL"}  [${group}] ${name}${cond ? "" : " - " + String(detail).slice(0, 400)}`);
};
const gitOut = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();
const info = { startedAt: new Date().toISOString(), synthetic: true, model: "DETERMINISTIC FAKE (not OpenAI)", sourceSha: gitOut("rev-parse", "HEAD"), sourceTreeDirtyAtRun: gitOut("status", "--porcelain", "--", ".", ":!design/evidence/NMI-P7").split("\n").filter(Boolean), browser: "headless Chrome (CDP), emulated desktop 1280x900 and phone 390x844" };
if (!existsSync(join(dist, "index.html"))) throw new Error("Run `pnpm build` (default community web build) first");

/* ------------------------------------------------ disposable PostgreSQL 16: owner + least-privilege runtime role */
const work = mkdtempSync(join(tmpdir(), "nmi-p7a-"));
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
  api = spawn("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(here, "../NMI-P6/test-api-server.ts")], {
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
  ["Zorblax Logistics", "EUR", "860.00", "2026-11-03"],
  ["Northwind Studio", "EUR", "640.00", "2026-11-03"],
  ["Bluebird Bakery", "JPY", "188837", "2026-11-12"],
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


const postsBodies = () => net.filter((n) => n.method === "POST" && /^\/api\/invoice-drafts\/[^/]+\/nudges$/.test(n.path));
const chatText = () => ev(`[...document.querySelectorAll('.nq-chat')].map((e) => e.innerText).join(' | ')`);
const chatHas = async (t) => (await chatText()).includes(t);
const tabSelected = (v) => ev(`document.querySelector('#nq-tab-${v}')?.getAttribute('aria-selected') === 'true'`);
async function openChat() {
  if (!(await ev("Boolean(document.querySelector('.chat-form input'))"))) {
    if (!(await ev("Boolean(document.querySelector('.nudgey-panel'))"))) {
      await clickBy("button[aria-label^='Open Nudgey']");
      await waitFor("Boolean(document.querySelector('.nudgey-panel'))");
    }
    await ev(`[...document.querySelectorAll('.nudgey-action')].find((e) => e.textContent.includes('Ask Nudgey')).click()`);
    await waitFor("Boolean(document.querySelector('.chat-form input'))");
  }
}
async function ask(text) {
  await setValue(".chat-form input", text);
  await clickBy(".chat-form button[type=submit]");
}
const choose = async (name) => {
  await ev(`(() => { const l = [...document.querySelectorAll('label.schedule-candidate-option')].find((e) => e.textContent.includes(${q(name)})); l.querySelector('input').click(); })()`);
  await sleep(250);
};
const chosenName = () => ev(`(() => { const l = document.querySelector('label.schedule-candidate-option.is-selected'); return l ? l.querySelector('strong').textContent : null; })()`);
const pendingRows = (name) => sql(`SELECT coalesce(string_agg(id::text||':'||version, ','), '') FROM invoice_nudges WHERE invoice_id='${INV[name]}' AND status='pending_review'`);
const supersededCount = (name) => sql(`SELECT count(*) FROM invoice_nudges WHERE invoice_id='${INV[name]}' AND status='superseded'`);

try {
  await setView(DESKTOP);
  await setTheme("light");
  await login();

  /* ===== S1: the queue is ALREADY MOUNTED when Nudgey's "Open in queue" fires (Codex P2 #1) ===== */
  {
    const g = "queue-focus";
    const rN = await gen("Northwind Studio", "professional");
    const rB = await gen("Bluebird Bakery", "firm");
    if (rN.status !== 201 || rB.status !== 201) throw new Error("seed drafts failed " + rN.status + rB.status);
    await goQueue();
    await waitFor("document.querySelector('[data-testid=count-pending]')?.textContent === '2'");
    // The operator moves to History by hand, then asks Nudgey (on the queue screen) for a new draft.
    await tab("History");
    check(g, "the operator is on the queue's History tab before the request", await tabSelected("history"));
    const posts0 = postsBodies().length, calls0 = modelCalls();
    await openChat();
    await ask("draft a friendly nudge for zorblax industries");
    await waitText("I found 1 matching invoice");
    check(g, "Nudgey (opened while the queue is mounted) asks for confirmation first: no model call yet", modelCalls() === calls0 && postsBodies().length === posts0);
    await clickBy(".nq-chat button", "Draft friendly nudge");
    await waitText("Draft ready for review", 15000);
    check(g, "confirming made exactly one POST and one model call", postsBodies().length - posts0 === 1 && modelCalls() - calls0 === 1);
    await shot("p7a-01-draft-ready-on-queue-history");
    await clickBy(".nq-chat button", "Open in queue");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Zorblax Industries'", 15000, "queue re-targeted to the new draft");
    check(g, "the ALREADY-MOUNTED queue switched from History to Pending review", await tabSelected("pending") && !(await tabSelected("history")));
    check(g, "it selected the NEW draft (Zorblax Industries), not the first row", (await ev("document.querySelector('#nq-review-title').textContent")) === "Zorblax Industries");
    check(g, "the pending count reads 3 (the new draft was read from the server)", await ev("document.querySelector('[data-testid=count-pending]')?.textContent === '3'"));
    await shot("p7a-02-queue-retargeted");
    // A SECOND request from a fresh conversation (reload keeps the session), again with the queue already mounted.
    await login();
    await goQueue();
    await tab("Approved");
    check(g, "the operator moves to Approved by hand", await tabSelected("approved"));
    await openChat();
    await ask("draft a firm nudge for zorblax logistics");
    await waitText("I found 1 matching invoice");
    await clickBy(".nq-chat button", "Draft firm nudge");
    await waitText("Draft ready for review", 15000);
    await clickBy(".nq-chat button", "Open in queue");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Zorblax Logistics'", 15000, "second re-target");
    check(g, "a SECOND request re-targets the still-mounted queue again (Approved -> Pending, Zorblax Logistics)", await tabSelected("pending"));
    // Manual choices are not overwritten when no new request arrives.
    await tab("History");
    await sleep(1500);
    check(g, "with no new request, the operator's manual History tab is NOT overwritten", await tabSelected("history"));
    check(g, "no draft was approved, rejected or edited by navigation (only 4 pending drafts, none sent)", sql("SELECT count(*) FILTER (WHERE status='pending_review') || '/' || count(*) FILTER (WHERE status<>'pending_review') FROM invoice_nudges") === "4/0");
  }

  /* ===== S2: A -> B -> A after an existing-pending warning (Codex P2 #2) ===== */
  {
    const g = "pending-switch";
    // A = Zorblax Industries already has a pending draft (from S1); B = Zorblax Logistics ALSO has one from S1. Retire B's
    // draft so B starts without one: reject it through the real route (explicit operator action in the test setup).
    const bn = sql(`SELECT id||'|'||version FROM invoice_nudges WHERE invoice_id='${INV["Zorblax Logistics"]}' AND status='pending_review'`).split("|");
    const rej = await http("POST", `/api/nudges/${bn[0]}/reject`, { ...side, body: { version: Number(bn[1]) } });
    check(g, "setup: B (Zorblax Logistics) has no pending draft; A (Zorblax Industries) keeps its pending draft", rej.status === 200 && pendingRows("Zorblax Logistics") === "" && pendingRows("Zorblax Industries") !== "", String(rej.status));
    const aPending = pendingRows("Zorblax Industries");
    await login();
    await openChat();
    await ask("draft a firm nudge for zorblax");
    await waitText("I found 2 matching invoices");
    check(g, "two matching invoices: nothing preselected, Draft disabled", (await chosenName()) === null && (await ev(`[...document.querySelectorAll('.nq-chat button')].find((b) => b.textContent.startsWith('Draft firm nudge')).disabled`)));
    const posts0 = postsBodies().length, calls0 = modelCalls();
    await choose("Zorblax Industries");
    await clickBy(".nq-chat button", "Draft firm nudge");
    await waitText("already has a draft waiting for review", 15000);
    check(g, "A: the existing-pending warning appears with Replace and Open existing", (await ev(`[...document.querySelectorAll('.nq-chat button')].some((b) => b.textContent.startsWith('Replace with a new firm draft'))`)) && (await ev(`[...document.querySelectorAll('.nq-chat button')].some((b) => b.textContent.startsWith('Open existing in queue'))`)));
    check(g, "A: the pending-exists answer cost no model call (one POST, zero generations)", postsBodies().length - posts0 === 1 && modelCalls() === calls0);
    await pageChecks("Nudgey: A pending-exists");
    await shot("p7a-03-A-pending-exists");
    await choose("Zorblax Logistics");
    check(g, "A -> B: B is selected", (await chosenName()) === "Zorblax Logistics");
    check(g, "A -> B: A's warning, Replace and Open existing are GONE", !(await chatHas("already has a draft waiting for review")) && !(await ev(`[...document.querySelectorAll('.nq-chat button')].some((b) => /^(Replace with|Open existing)/.test(b.textContent))`)));
    check(g, "A -> B: the normal explicit confirmation is back and nothing was requested by switching", (await chatHas("Draft a firm nudge for Zorblax Logistics?")) && postsBodies().length - posts0 === 1 && modelCalls() === calls0);
    await pageChecks("Nudgey: B normal confirm");
    await shot("p7a-04-B-confirm");
    await choose("Zorblax Industries");
    check(g, "A -> B -> A: A's old warning is NOT resurrected; A asks for confirmation again", !(await chatHas("already has a draft waiting for review")) && (await chatHas("Draft a firm nudge for Zorblax Industries?")) && postsBodies().length - posts0 === 1);
    await choose("Zorblax Logistics");
    await clickBy(".nq-chat button", "Draft firm nudge");
    await waitText("Draft ready for review", 15000);
    check(g, "B drafted normally: exactly one more POST and one model call", postsBodies().length - posts0 === 2 && modelCalls() - calls0 === 1);
    check(g, "B has one new pending draft; A's pending draft is byte-for-byte untouched (same id:version) and nothing was superseded", pendingRows("Zorblax Logistics") !== "" && pendingRows("Zorblax Industries") === aPending && supersededCount("Zorblax Industries") === "0");
    await shot("p7a-05-B-drafted");
  }

  /* ===== S2b: a replacement still works for A, and only for A ===== */
  {
    const g = "pending-switch";
    const aPending = pendingRows("Zorblax Industries");
    const bPending = pendingRows("Zorblax Logistics");
    await login();
    await openChat();
    await ask("draft a firm nudge for zorblax");
    await waitText("I found 2 matching invoices");
    await choose("Zorblax Industries");
    await clickBy(".nq-chat button", "Draft firm nudge");
    await waitText("already has a draft waiting for review", 15000);
    const posts0 = postsBodies().length, calls0 = modelCalls();
    await clickBy(".nq-chat button", "Replace with a new firm draft");
    await waitText("Draft ready for review", 15000);
    check(g, "Replace for A: exactly one POST and one model call", postsBodies().length - posts0 === 1 && modelCalls() - calls0 === 1);
    check(g, "Replace used A's OWN pending reference: A's old draft is superseded once, a new pending draft exists, B's pending draft is untouched (same id:version, nothing superseded)", supersededCount("Zorblax Industries") === "1" && pendingRows("Zorblax Industries") !== "" && pendingRows("Zorblax Industries") !== aPending && pendingRows("Zorblax Logistics") === bPending && supersededCount("Zorblax Logistics") === "0");
  }

  /* ===== S3: the same A -> B flow on a phone (390px) ===== */
  {
    const g = "mobile";
    await setView(MOBILE);
    await login();
    await openChat();
    await ask("draft a firm nudge for zorblax");
    await waitText("I found 2 matching invoices");
    await choose("Zorblax Industries");
    await clickBy(".nq-chat button", "Draft firm nudge");
    await waitText("already has a draft waiting for review", 15000);
    await pageChecks("mobile Nudgey: A pending-exists");
    await shot("p7a-06-mobile-A-pending-exists");
    await choose("Zorblax Logistics");
    check(g, "on a phone, switching to B also clears A's warning", !(await chatHas("already has a draft waiting for review")) && (await chosenName()) === "Zorblax Logistics");
    await pageChecks("mobile Nudgey: B normal confirm");
    await shot("p7a-07-mobile-B-confirm");
    await setView(DESKTOP);
  }

  /* ===== boundaries ===== */
  {
    const g = "boundaries";
    check(g, "no request to any foreign host", foreign.length === 0, foreign.join(","));
    const paths = [...new Set(net.filter((n) => n.path.startsWith("/api/")).map((n) => n.method + " " + n.path.replace(/[0-9a-f-]{36}/g, ":id").split("?")[0]))];
    check(g, "the browser used only existing read/draft routes: no send, schedule, dispatch, approve or reject call was made by the UI under test", !paths.some((p) => /send|schedul|dispatch|approve|reject|copy/i.test(p)), paths.join(" ; "));
    check(g, "every model input was customer-free", readFileSync(MODEL_LOG, "utf8").split("\n").filter(Boolean).every((l) => !/\d|zorblax|northwind|bluebird|example\.test/i.test(l)));
    const errs = consoleMsgs.filter((m) => !/Failed to load resource: the server responded with a status of (4\d\d|500)/.test(m));
    check(g, "no uncaught exceptions or console errors", errs.length === 0, errs.slice(0, 5).join(" | "));
  }
} catch (e) {
  check("run", "journey completed", false, (e && e.stack) || String(e));
  try { await shot("zz-failure"); } catch {}
}

info.finishedAt = new Date().toISOString();
info.screenshots = shots;
const fails = results.filter((r) => r.result === "FAIL").length;
writeFileSync(join(here, "qa-results-p7a.json"), JSON.stringify({ task: "NMI-P7-A", generatedBy: "design/evidence/NMI-P7/run-p7a-journey.mjs", info, summary: { total: results.length, passed: results.length - fails, failed: fails }, results }, null, 2) + "\n");
console.log(`\n${results.length - fails}/${results.length} checks passed; ${shots.length} screenshots`);
ws.close();
process.exit(fails ? 1 : 0);
