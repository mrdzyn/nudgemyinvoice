/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-NDG-03 browser check of Nudgey's 'Check invoice status' selector: genuine Chrome (time zone emulated as
// Asia/Manila) -> Vite preview of the production build (strict CSP) -> the real API -> a disposable
// PostgreSQL 16. Providers are NOT configured: no OpenAI key, PAYPAL_DRAFTS_ENABLED=false, no PayPal
// credentials. The check proves the browser makes no provider request and no PayPal operation exists.
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-NDG-03/run-status-journey.mjs
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const ORIGIN = "http://localhost:4153";
const API_PORT = 3153;
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54353;
const DEBUG_PORT = 9353;
const DB = "nmi_test_ndg03_journey";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-ndg3";
const PASSWORD = randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const results = [];
const check = (group, name, cond, detail = "") => {
  results.push({ group, name, pass: Boolean(cond), detail: cond ? "" : String(detail) });
  console.log(`${cond ? "PASS" : "FAIL"}  [${group}] ${name}${cond ? "" : " - " + detail}`);
};
if (!existsSync(join(root, "apps/web/dist/index.html"))) throw new Error("Run `pnpm --filter @nmi/web build` first");

const work = mkdtempSync(join(tmpdir(), "nmi-ndg3-"));
const children = [];
const cleanup = async () => {
  for (const c of children) try { process.kill(-c.pid, "SIGTERM"); } catch { try { c.kill("SIGTERM"); } catch {} }
  spawnSync(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "immediate", "stop"], { stdio: "ignore" });
  await sleep(300);
  rmSync(work, { recursive: true, force: true });
};
process.on("exit", () => { try { rmSync(work, { recursive: true, force: true }); } catch {} });

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts, env: { LC_ALL: "en_US.UTF-8", ...(opts.env ?? process.env) } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || "").slice(0, 300)}`);
  return r.stdout;
};
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_ndg3", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_ndg3", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_ndg3@127.0.0.1:${PG_PORT}/${DB}`;
run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: PASSWORD } });

const apiLog = join(work, "api.log");
const apiEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, DATABASE_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", PAYPAL_DRAFTS_ENABLED: "false" };
let api = null;
async function startApi() {
  const out = openSync(apiLog, "a");
  api = spawn("pnpm", ["--filter", "@nmi/api", "exec", "tsx", "src/server.ts"], { cwd: root, stdio: ["ignore", out, out], env: apiEnv, detached: true });
  children.push(api);
  for (let i = 0; i < 300; i++) { try { if ((await fetch(API + "/health")).ok) return; } catch {} await sleep(150); }
  throw new Error("API did not start");
}
async function stopApi() {
  try { process.kill(-api.pid, "SIGINT"); } catch {}
  for (let i = 0; i < 80; i++) { try { await fetch(API + "/health"); await sleep(100); } catch { break; } }
}
const preview = spawn("pnpm", ["--filter", "@nmi/web", "exec", "vite", "preview", "--host", "localhost", "--port", "4153", "--strictPort"], { cwd: root, stdio: "ignore", env: { ...process.env, NMI_API_ORIGIN: API }, detached: true });
children.push(preview);
await startApi();
for (let i = 0; i < 100; i++) { try { if ((await fetch(ORIGIN + "/")).ok) break; } catch {} await sleep(150); }
check("setup", "disposable PostgreSQL 16 migrated through the journal (incl. 0007) and the API is healthy behind the proxy with no provider configured", (await (await fetch(ORIGIN + "/health")).json()).aiConfigured === false && Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_name='invoice_follow_ups'")) === 1);

// ---- seed two synthetic invoices through the real API (same operator the browser will use)
async function seed(name, email, currency, unit, due, n) {
  const login = await fetch(API + "/api/auth/login", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ username: USER, password: PASSWORD }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const csrf = (await login.json()).csrfToken;
  const r = await fetch(API + "/api/invoice-drafts", { method: "POST", headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json", "idempotency-key": `ndg3-seed-key-${n}-0000000` }, body: JSON.stringify({ customerName: name, customerEmail: email, currency, lineItems: [{ description: "Logo concepts", quantity: "2", unitPrice: unit }], dueDate: due, taxPercent: "8", discount: null }) });
  return (await r.json()).id;
}
const INV1 = await seed("Northwind Studio", "ap@northwind.example", "USD", "250.00", "2030-01-15", 1);
const INV2 = await seed("Vienna Cafe", "cafe@vienna.example", "EUR", "199.99", "2030-03-01", 2);
check("setup", "two synthetic invoices saved by the operator", Boolean(INV1 && INV2));
// SIMULATED: one invoice gets a 'created' operation row inserted straight into the disposable database so the
// 'PayPal draft created' label can be shown. No PayPal request exists anywhere in this run.
sql(`INSERT INTO paypal_draft_operations (invoice_id, state, invoice_number, payload_digest, paypal_invoice_id, attempts, invoice_date, completed_at) VALUES ('${INV1}', 'created', 'NMI-${INV1.replaceAll("-", "").slice(0, 20)}', repeat('a', 64), 'INV2-SIMULATED-0000', 1, '2026-10-31', now())`);
check("setup", "one invoice has a SIMULATED 'created' operation row, the other has none", sql("SELECT count(*) FROM paypal_draft_operations") === "1");

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-ndg3-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
children.push(chrome);
let version;
for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {} await sleep(150); }
if (!version) throw new Error("Chrome did not start");
const targetInfo = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1;
let failRule = null;
const pending = new Map();
const consoleMsgs = [];
const foreign = [];
const netLog = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
  else if (msg.method === "Runtime.exceptionThrown") consoleMsgs.push("exception: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  else if (msg.method === "Runtime.consoleAPICalled") consoleMsgs.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Log.entryAdded" && msg.params.entry.level !== "info") consoleMsgs.push(`log.${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
  else if (msg.method === "Network.requestWillBeSent") {
    const u = msg.params.request.url;
    if (u.startsWith(ORIGIN + "/")) netLog.push({ method: msg.params.request.method, path: u.slice(ORIGIN.length), id: msg.params.requestId, body: msg.params.request.postData ?? null });
    else if (!/^(about:|data:|blob:)/.test(u)) foreign.push(u);
  } else if (msg.method === "Fetch.requestPaused") {
    const id = msg.params.requestId;
    if (failRule && failRule(msg.params)) send("Fetch.failRequest", { requestId: id, errorReason: "InternetDisconnected" }).catch(() => {});
    else send("Fetch.continueRequest", { requestId: id }).catch(() => {});
  } else if (msg.method === "Network.responseReceived") { const e = netLog.find((n) => n.id === msg.params.requestId); if (e) e.status = msg.params.response.status; }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Emulation.setTimezoneOverride", { timezoneId: ZONE });
await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + "\n" + expression.slice(0, 200));
  return r.result.value;
};
async function waitFor(expr, ms = 5000) { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(60); } return false; }
const typeText = async (t) => { await send("Input.insertText", { text: t }); await sleep(40); };
const focusId = (id) => ev(`document.getElementById(${JSON.stringify(id)}).focus()`);
const bodyText = () => ev("document.body.innerText.replace(/\\s+/g, ' ')");
async function shot(name) { mkdirSync(SHOTS, { recursive: true }); const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 60 }); writeFileSync(join(SHOTS, name), Buffer.from(data, "base64")); }
async function load() {
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: ORIGIN + "/" });
  await waitFor("document.readyState === 'complete' && !!document.getElementById('main-content')");
}
async function signIn() {
  await load();
  await waitFor("!!document.getElementById('login-username') || !!document.querySelector('.app-nav')");
  if (await ev("!!document.getElementById('login-username')")) {
    await focusId("login-username"); await typeText(USER);
    await focusId("login-password"); await typeText(PASSWORD);
    await ev("document.querySelector('form').requestSubmit()");
  }
  return waitFor("!!document.querySelector('.app-nav')");
}
const setField = (label, v) => ev(`(() => {
  const l = [...document.querySelectorAll('.followup-form label')].find((x) => x.textContent.startsWith(${JSON.stringify(label)}));
  const e = document.getElementById(l.htmlFor);
  const proto = e.tagName === 'SELECT' ? HTMLSelectElement.prototype : e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(v)});
  e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
})()`);
const getField = (label) => ev(`(() => { const l = [...document.querySelectorAll('.followup-form label')].find((x) => x.textContent.startsWith(${JSON.stringify(label)})); return document.getElementById(l.htmlFor).value; })()`);
const clickText = (sel, text) => ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`);
const openNudgey = async () => { if (!(await ev("!!document.querySelector('.nudgey-panel')"))) await ev("document.querySelector('.nudgey-launcher').click()"); await waitFor("!!document.querySelector('.nudgey-panel')"); };
const summary = () => ev("document.querySelector('.followup-summary')?.innerText.replace(/\\s+/g,' ') ?? ''");
const partsInZone = (d, tz) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
const mark = () => netLog.length;

/* ----------------------------------------------------------------- journey */
const clickAction = (label) => ev(`(() => { const b = [...document.querySelectorAll('.nudgey-action')].find((x) => x.textContent.includes(${JSON.stringify(label)})); if (!b) return false; b.click(); return true; })()`);
const setSearch = (v) => ev(`(() => { const e = document.querySelector('.status-picker input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const picker = () => ev("document.querySelector('.status-picker')?.innerText.replace(/\\s+/g, ' ') ?? ''");
const searchCalls = (since) => netLog.slice(since).filter((n) => n.path === "/api/invoice-drafts/search" && n.method === "POST");
const bodyOf = (n) => { try { return JSON.parse(n.body ?? "{}"); } catch { return {}; } };

check("auth", "operator signs in through the browser and lands on the dashboard", (await signIn()) && (await bodyText()).includes("Invoice drafts"));
await waitFor("!!document.querySelector('.nudgey-launcher')");
await openNudgey();

// 1 the defect: on the dashboard, 'Check invoice status' must visibly do something
let m = netLog.length;
await clickAction("Check invoice status");
await waitFor("!!document.querySelector('.status-picker')");
await waitFor("document.querySelectorAll('.status-option').length === 2");
const first = await picker();
check("defect", "on the dashboard, Check invoice status opens the status selector inside Nudgey (the panel stays open and the page did not change)", first.includes("Check invoice status") && first.includes("Search your invoices") && (await ev("!!document.querySelector('.nudgey-panel')")) && (await bodyText()).includes("Invoice drafts"), first);
check("defect", "the search box has focus and the initial load is one bounded POST (limit 20, no term) to the existing search route", (await ev("document.activeElement === document.querySelector('.status-picker input')")) && searchCalls(m).length === 1 && bodyOf(searchCalls(m)[0]).limit === 20 && (bodyOf(searchCalls(m)[0]).q === undefined || bodyOf(searchCalls(m)[0]).q === null), JSON.stringify(searchCalls(m).map(bodyOf)));
check("states", "both saved invoices are listed with their own currency and total, and the SIMULATED draft row shows as 'PayPal draft created' while the other shows 'No PayPal draft'", first.includes("Northwind Studio") && first.includes("USD 540.00") && first.includes("Vienna Cafe") && first.includes("EUR 431.98") && first.includes("PayPal draft created") && first.includes("No PayPal draft"), first);
check("states", "the draft-only disclaimer is shown and nothing claims paid, unpaid, overdue or settled", first.includes("does not show whether an invoice has been sent, paid, unpaid, overdue or settled") && !/\b(is|are|was|marked as) (unpaid|overdue|paid|settled)\b/i.test(first.replace(/does not show whether an invoice has been sent, paid, unpaid, overdue or settled/g, "")), first);
await shot("01-status-selector.jpg");

// 2 search (term only in the POST body), select, see state
m = netLog.length;
await setSearch("Vienna");
await waitFor("document.querySelectorAll('.status-option').length === 1");
const calls2 = searchCalls(m);
check("search", "typing a customer name sends ONE debounced POST whose body carries q; no URL contains the name", calls2.length === 1 && bodyOf(calls2[0]).q === "Vienna" && !netLog.some((n) => /Vienna/i.test(n.path) || n.path.includes("?")), JSON.stringify(calls2.map(bodyOf)));
await ev("document.querySelector('.status-option').click()");
await waitFor("!!document.querySelector('.status-selected')");
const sel = await ev("document.querySelector('.status-selected').innerText.replace(/\\s+/g, ' ')");
check("select", "selecting an invoice shows its customer, amount and draft state, with Open invoice details", sel.includes("Vienna Cafe") && sel.includes("EUR 431.98") && sel.includes("No PayPal draft") && sel.includes("Open invoice details"), sel);
await shot("02-selected.jpg");
await setSearch("Zzz Nobody");
await waitFor("(document.querySelector('.status-results')?.innerText ?? '').includes('No saved invoices match')");
check("empty", "a search with no match says so plainly and clears the selection", (await picker()).includes("No saved invoices match “Zzz Nobody”") && !(await ev("!!document.querySelector('.status-selected')")));

// 3 failure then retry
failRule = (p) => p.request.url.includes("/api/invoice-drafts/search");
await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/invoice-drafts/search" }] });
await setSearch("Northwind");
await waitFor("!!document.querySelector('.status-results [role=alert]')");
const errText = await picker();
check("error", "when the server cannot be reached the selector shows an honest offline error with Try again, never an empty-account message", errText.includes("couldn't reach the server") && errText.includes("Try again") && !errText.includes("You have no saved invoices yet"), errText);
failRule = null;
await send("Fetch.disable");
await ev("[...document.querySelectorAll('.status-results button')].find((b) => b.textContent.includes('Try again')).click()");
await waitFor("document.querySelectorAll('.status-option').length === 1");
check("error", "Try again repeats the same search and shows the matching invoice", (await picker()).includes("Northwind Studio") && (await picker()).includes("matching “Northwind”"));

// 4 open details through real navigation
await ev("document.querySelector('.status-option').click()");
await waitFor("!!document.querySelector('.status-selected')");
await ev("document.querySelector('.status-selected .followup-btn-primary').click()");
await waitFor("!!document.getElementById('saved-id')");
check("navigate", "Open invoice details opens the existing saved-invoice page for that invoice and closes Nudgey", (await ev("document.getElementById('saved-id')?.textContent")) === INV1 && !(await ev("!!document.querySelector('.nudgey-panel')")) && (await bodyText()).includes("PayPal Sandbox draft"));

// 5 the dashboard shortcut is unchanged
await openNudgey();
await clickAction("View my invoices");
await waitFor("(document.body.innerText).includes('Invoice drafts') && !document.querySelector('.nudgey-panel')");
check("unchanged", "View my invoices still navigates straight to the dashboard and closes the panel", (await bodyText()).includes("Invoice drafts") && !(await ev("!!document.querySelector('.nudgey-panel')")) && !(await ev("!!document.querySelector('.status-picker')")));

// 6 closing and reopening forgets the selector; Back returns home
await openNudgey();
await clickAction("Check invoice status");
await waitFor("document.querySelectorAll('.status-option').length === 2");
await ev("document.querySelector('.status-option').click()");
await ev("[...document.querySelectorAll('.status-picker .followup-btn')].find((b) => b.textContent.trim() === 'Back').click()");
await waitFor("!!document.querySelector('.nudgey-action')");
check("back", "Back returns to the Nudgey home actions", (await ev("[...document.querySelectorAll('.nudgey-action strong')].map((e) => e.textContent).join('|')")).startsWith("Create an invoice|View my invoices|Check invoice status"));
await clickAction("Check invoice status");
await waitFor("document.querySelectorAll('.status-option').length === 2");
check("back", "reopening the selector starts clean: nothing is selected and the search box is empty", !(await ev("!!document.querySelector('.status-selected')")) && (await ev("document.querySelector('.status-picker input').value")) === "");

// 7 narrow viewport
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
await sleep(200);
const geo = await ev("(() => { const p = document.querySelector('.nudgey-panel').getBoundingClientRect(); const nav = document.querySelector('.mobile-nav')?.getBoundingClientRect(); const de = document.documentElement; return { left: p.left, right: p.right, top: p.top, bottom: p.bottom, vw: innerWidth, navTop: nav ? nav.top : null, overflowX: de.scrollWidth - de.clientWidth }; })()");
check("narrow", "at 390px the selector panel is inside the viewport, above the mobile navigation, with no horizontal overflow", geo.left >= 0 && geo.right <= geo.vw && geo.top >= 0 && (geo.navTop === null || geo.bottom <= geo.navTop + 1) && geo.overflowX <= 1, JSON.stringify(geo));
await shot("03-narrow.jpg");
await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });

// 8 keyboard: Escape closes the panel and returns focus to the launcher
await ev("document.querySelector('.status-picker input').focus()");
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(150);
check("keyboard", "Escape closes Nudgey and focus returns to the launcher", !(await ev("!!document.querySelector('.nudgey-panel')")) && (await ev("document.activeElement === document.querySelector('.nudgey-launcher')")));

// 9 sign-out clears
await openNudgey();
await clickAction("Check invoice status");
await waitFor("document.querySelectorAll('.status-option').length === 2");
await ev("[...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Sign out'))?.click()");
await waitFor("!!document.getElementById('login-username')");
check("privacy", "signing out removes the workspace, the selector and every invoice name from the page", !(await ev("!!document.querySelector('.nudgey') || !!document.querySelector('.status-picker')")) && !(await bodyText()).includes("Northwind"));

// boundaries
const apiPaths = netLog.filter((n) => n.path.startsWith("/api/"));
check("boundaries", "only auth, invoice search (POST), the invoice detail read, its follow-up read and the follow-up list were used: never parse, PayPal-draft, a follow-up write or a send", apiPaths.every((n) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts\/search|invoice-drafts\/[0-9a-f-]{36}(\/follow-ups)?|follow-ups)$/.test(n.path)) && apiPaths.filter((n) => n.method !== "GET").every((n) => n.path === "/api/invoice-drafts/search" || n.path.startsWith("/api/auth/")), [...new Set(apiPaths.map((n) => n.method + " " + n.path))].join(","));
check("boundaries", "no request left the page origin and no URL carries customer text", foreign.length === 0 && !netLog.some((n) => /Northwind|Vienna|Zzz/i.test(n.path)), foreign.join(","));
check("boundaries", "the only PayPal row is the SIMULATED one inserted for the label test; nothing was created, no approvals or webhooks, no follow-up written", sql("SELECT (SELECT count(*) FROM paypal_draft_operations) || ',' || (SELECT count(*) FROM approvals) || ',' || (SELECT count(*) FROM paypal_webhook_events) || ',' || (SELECT count(*) FROM invoice_follow_ups)") === "1,0,0,0");
check("boundaries", "browser storage is empty and the only console errors are the pre-sign-in 401 probe and the deliberately blocked search", (await ev("localStorage.length + sessionStorage.length")) === 0 && consoleMsgs.filter((x) => !/status of 401 .*\/api\/auth\/session|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(x)).length === 0, consoleMsgs.join(" | "));

const failed = results.filter((r) => !r.pass).length;
writeFileSync(join(here, "qa-results.json"), JSON.stringify({ task: "NMI-NDG-03", timezoneEmulated: ZONE, providersConfigured: false, simulatedDraftRow: true, passed: results.length - failed, total: results.length, results }, null, 2) + "\n");
console.log(`\n${results.length - failed}/${results.length} passed`);
await cleanup();
process.exit(failed ? 1 : 0);
