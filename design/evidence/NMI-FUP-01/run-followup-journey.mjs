/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-FUP-01 browser check of local follow-up scheduling: genuine Chrome (time zone emulated as
// Asia/Manila) -> Vite preview of the production build (strict CSP) -> the real API -> a disposable
// PostgreSQL 16. Providers are NOT configured: no OpenAI key, PAYPAL_DRAFTS_ENABLED=false, no PayPal
// credentials. The check proves the browser makes no provider request and no PayPal operation exists.
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-FUP-01/run-followup-journey.mjs
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const ORIGIN = "http://localhost:4151";
const API_PORT = 3151;
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54351;
const DEBUG_PORT = 9351;
const DB = "nmi_test_fup01_journey";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-fup";
const PASSWORD = randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const results = [];
const check = (group, name, cond, detail = "") => {
  results.push({ group, name, pass: Boolean(cond), detail: cond ? "" : String(detail) });
  console.log(`${cond ? "PASS" : "FAIL"}  [${group}] ${name}${cond ? "" : " - " + detail}`);
};
if (!existsSync(join(root, "apps/web/dist/index.html"))) throw new Error("Run `pnpm --filter @nmi/web build` first");

const work = mkdtempSync(join(tmpdir(), "nmi-fup-"));
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
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_fup", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_fup", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_fup@127.0.0.1:${PG_PORT}/${DB}`;
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
const preview = spawn("pnpm", ["--filter", "@nmi/web", "exec", "vite", "preview", "--host", "localhost", "--port", "4151", "--strictPort"], { cwd: root, stdio: "ignore", env: { ...process.env, NMI_API_ORIGIN: API }, detached: true });
children.push(preview);
await startApi();
for (let i = 0; i < 100; i++) { try { if ((await fetch(ORIGIN + "/")).ok) break; } catch {} await sleep(150); }
check("setup", "disposable PostgreSQL 16 migrated through the journal (incl. 0007) and the API is healthy behind the proxy with no provider configured", (await (await fetch(ORIGIN + "/health")).json()).aiConfigured === false && Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_name='invoice_follow_ups'")) === 1);

// ---- seed two synthetic invoices through the real API (same operator the browser will use)
async function seed(name, email, currency, unit, due, n) {
  const login = await fetch(API + "/api/auth/login", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ username: USER, password: PASSWORD }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const csrf = (await login.json()).csrfToken;
  const r = await fetch(API + "/api/invoice-drafts", { method: "POST", headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json", "idempotency-key": `fup-seed-key-${n}-0000000` }, body: JSON.stringify({ customerName: name, customerEmail: email, currency, lineItems: [{ description: "Logo concepts", quantity: "2", unitPrice: unit }], dueDate: due, taxPercent: "8", discount: null }) });
  return (await r.json()).id;
}
const INV1 = await seed("Northwind Studio", "ap@northwind.example", "USD", "250.00", "2030-01-15", 1);
const INV2 = await seed("Vienna Cafe", "cafe@vienna.example", "EUR", "199.99", "2030-03-01", 2);
check("setup", "two synthetic invoices saved by the operator", Boolean(INV1 && INV2));

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-fup-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
children.push(chrome);
let version;
for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {} await sleep(150); }
if (!version) throw new Error("Chrome did not start");
const targetInfo = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1;
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
check("auth", "operator signs in through the browser", await signIn());
await waitFor("!!document.querySelector('.nudgey-launcher')");
await openNudgey();
await waitFor("document.querySelector('.followup-summary')?.innerText.includes('Due')");
check("nudgey", "Nudgey offers 'Schedule a follow-up' and shows real counts: 0 Due, 0 Upcoming", (await bodyText()).includes("Schedule a follow-up") && /0 Due/.test(await summary()) && /0 Upcoming/.test(await summary()), await summary());

await clickText(".nudgey-action", "Schedule a follow-up");
await waitFor("!!document.querySelector('.followup-form')");
await waitFor("document.querySelectorAll('.followup-form select option').length > 2");
check("form", "the form lists the operator's saved invoices and states the browser time zone", (await ev("[...document.querySelectorAll('.followup-form select option')].map((o) => o.textContent).join('|')")).includes("Northwind Studio · USD 540.00") && (await bodyText()).includes("Asia/Manila (GMT+8)"));
await setField("Saved invoice", INV1);
await sleep(100);
const msg1 = await getField("Follow-up message");
check("form", "choosing an invoice generates a polite local message (no provider call)", msg1.includes("Hi Northwind Studio,") && msg1.includes("USD 540.00") && msg1.includes("January 15, 2030") && !/unpaid|overdue/i.test(msg1), msg1);
const tmr = partsInZone(new Date(Date.now() + 24 * 3600e3), ZONE);
const tmrDate = `${tmr.year}-${tmr.month}-${tmr.day}`;
await setField("Date", tmrDate);
await setField("Time", "09:30");
await setField("Note", "Ask about the PO number");
await setField("Follow-up message", msg1 + "\n(edited by the operator)");
await shot("01-schedule-form.jpg");
const before = mark();
await clickText(".followup-form button", "Save follow-up");
await waitFor("!!document.querySelector('.followup-item')");
if (process.env.FUP_DEBUG) console.log("DEBUG console:", consoleMsgs.join(" | "), "busy-buttons:", await ev("[...document.querySelectorAll('.followup-form button')].map((b) => b.textContent + ':' + b.disabled).join(',')"));
const posts = netLog.slice(before).filter((n) => n.path === "/api/follow-ups" && n.method === "POST");
check("schedule", "exactly one POST /api/follow-ups (201) and the list now shows 1 Upcoming", posts.length === 1 && posts[0].status === 201 && /0 Due/.test(await summary()) && /1 Upcoming/.test(await summary()), JSON.stringify(posts.map((p) => p.status)) + " summary=" + (await summary()) + " panel=" + (await ev("document.querySelector('.nudgey-panel')?.innerText.replace(/\\s+/g,' ').slice(0,400) ?? 'NO PANEL'")));
const row = sql("SELECT to_char(due_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI') || '|' || timezone || '|' || status || '|' || note || '|' || (message LIKE '%edited by the operator%') FROM invoice_follow_ups");
const expectUtc = new Date(`${tmrDate}T09:30:00+08:00`).toISOString().slice(0, 16);
check("persist", "the database stores the real UTC instant, the IANA zone, the note and the edited message", row === `${expectUtc}|Asia/Manila|active|Ask about the PO number|true`, row);
check("persist", "the request body carries the UTC instant and zone, never a local wall time or the customer's text in the URL", /"dueAt":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z"/.test(posts[0]?.body ?? "") && (posts[0]?.body ?? "").includes('"timezone":"Asia/Manila"') && netLog.every((n) => !/Northwind|Ask%20about|Ask about/.test(n.path)));
check("nudgey", "the item displays its time with the zone", (await bodyText()).includes("9:30 AM GMT+8") && (await bodyText()).includes("Northwind Studio"));
await shot("02-nudgey-followups.jpg");

// duplicate schedule for the same invoice is refused in the UI
await clickText(".nudgey-action", "Schedule a follow-up");
await waitFor("!!document.querySelector('.followup-form')");
await waitFor("document.querySelectorAll('.followup-form select option').length > 2");
await setField("Saved invoice", INV1);
await sleep(100);
await setField("Date", tmrDate);
await setField("Time", "10:00");
await clickText(".followup-form button", "Save follow-up");
await waitFor("(document.querySelector('.followup-form [role=alert]')?.textContent ?? '').length > 0");
check("duplicate", "a second active follow-up for the same invoice is refused with a clear message and nothing is added", (await bodyText()).includes("already has an active follow-up") && Number(sql("SELECT count(*) FROM invoice_follow_ups")) === 1);
await clickText(".followup-form button", "Back");
await waitFor("!!document.querySelector('.followup-item')");

// invoice detail shows the saved follow-up
await clickText(".followup-btn", "Open invoice");
await waitFor("!!document.getElementById('followup-card') && document.getElementById('followup-card').innerText.includes('Follow-up scheduled')");
const card = await ev("document.getElementById('followup-card').innerText.replace(/\\s+/g,' ')");
check("detail", "the invoice page shows the scheduled follow-up with zone, note, message and the 'not sent' statement", card.includes("9:30 AM GMT+8") && card.includes("Ask about the PO number") && card.includes("edited by the operator") && card.includes("Nothing is sent to the customer"), card);
await shot("03-invoice-detail.jpg");

// reschedule to 'now' (inside the 5-minute grace) -> the SERVER reports it as Due
await openNudgey();
await waitFor("!!document.querySelector('.followup-item')");
await clickText(".followup-btn", "Reschedule");
await waitFor("!!document.querySelector('.followup-form')");
const nowZ = partsInZone(new Date(), ZONE);
await setField("Date", `${nowZ.year}-${nowZ.month}-${nowZ.day}`);
await setField("Time", `${nowZ.hour}:${nowZ.minute}`);
await clickText(".followup-form button", "Save new time");
await waitFor("/1 Due/.test(document.querySelector('.followup-summary')?.innerText ?? '')");
check("due", "rescheduling to the current minute makes the server report it Due (1 Due, 0 Upcoming) and the launcher shows a badge", /1 Due/.test(await summary()) && /0 Upcoming/.test(await summary()) && (await ev("document.querySelector('.nudgey-launcher').getAttribute('aria-label')")).includes("1 follow-up due") && (await ev("document.querySelector('.nudgey-badge')?.textContent")) === "1");

// complete
const beforeDone = mark();
await clickText(".followup-btn", "Mark complete");
await waitFor("/0 Due/.test(document.querySelector('.followup-summary')?.innerText ?? '') && !document.querySelector('.followup-item')");
check("complete", "marking complete removes it from the list, counts return to 0/0, and the row is 'completed' with a timestamp", /0 Due/.test(await summary()) && /0 Upcoming/.test(await summary()) && sql("SELECT status || '|' || (completed_at IS NOT NULL) FROM invoice_follow_ups") === "completed|true" && netLog.slice(beforeDone).some((n) => n.path.endsWith("/complete") && n.status === 200));

// a new schedule is allowed after completion, then cancel it
await clickText(".nudgey-action", "Schedule a follow-up");
await waitFor("!!document.querySelector('.followup-form')");
await waitFor("document.querySelectorAll('.followup-form select option').length > 2");
await setField("Saved invoice", INV2);
await sleep(100);
await setField("Date", tmrDate);
await setField("Time", "14:00");
await clickText(".followup-form button", "Save follow-up");
await waitFor("!!document.querySelector('.followup-item')");
check("schedule", "a second invoice can be scheduled (Vienna Cafe, EUR) and counts come from the database", /1 Upcoming/.test(await summary()) && Number(sql("SELECT count(*) FROM invoice_follow_ups WHERE status='active'")) === 1);
await clickText(".followup-btn", "Cancel");
await waitFor("!document.querySelector('.followup-item')");
check("cancel", "canceling removes it; the row is 'canceled' with a timestamp", sql("SELECT status || '|' || (canceled_at IS NOT NULL) FROM invoice_follow_ups WHERE invoice_id='" + INV2 + "'") === "canceled|true");

// persistence across an API restart and a page reload
await clickText(".nudgey-action", "Schedule a follow-up");
await waitFor("!!document.querySelector('.followup-form')");
await waitFor("document.querySelectorAll('.followup-form select option').length > 2");
await setField("Saved invoice", INV1);
await sleep(100);
await setField("Date", tmrDate);
await setField("Time", "11:15");
await clickText(".followup-form button", "Save follow-up");
await waitFor("!!document.querySelector('.followup-item')");
await stopApi();
await startApi();
check("restart", "the API process was restarted and the follow-up row is still in PostgreSQL", sql("SELECT count(*) FROM invoice_follow_ups WHERE status='active'") === "1");
await signIn();
await waitFor("!!document.querySelector('.nudgey-launcher')");
await openNudgey();
await waitFor("/1 Upcoming/.test(document.querySelector('.followup-summary')?.innerText ?? '')");
check("restart", "after restart and reload Nudgey shows the saved follow-up again (1 Upcoming, 11:15 AM GMT+8)", /1 Upcoming/.test(await summary()) && (await bodyText()).includes("11:15 AM GMT+8"), await summary());

// boundaries
const apiPaths = netLog.filter((n) => n.path.startsWith("/api/"));
check("boundaries", "the browser only used auth, invoice-list/detail and follow-up routes: never a parse, PayPal-draft or send route", apiPaths.every((n) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts\/search|invoice-drafts\/[0-9a-f-]{36}(\/follow-ups)?|follow-ups(\/[0-9a-f-]{36}\/(reschedule|complete|cancel))?)$/.test(n.path)), [...new Set(apiPaths.map((n) => n.path))].join(","));
check("boundaries", "no request left the page origin (no PayPal, OpenAI, analytics)", foreign.length === 0, foreign.join(","));
check("boundaries", "no PayPal operation exists, no invoice has a PayPal id, no approval or webhook row", sql("SELECT (SELECT count(*) FROM paypal_draft_operations) || ',' || (SELECT count(*) FROM invoices WHERE paypal_invoice_id IS NOT NULL) || ',' || (SELECT count(*) FROM approvals) || ',' || (SELECT count(*) FROM paypal_webhook_events)") === "0,0,0,0");
check("boundaries", "browser storage holds no follow-up data and no console errors or uncaught exceptions occurred", (await ev("localStorage.length + sessionStorage.length")) === 0 && consoleMsgs.filter((m) => !/status of 401 .*\/api\/auth\/session|status of 409 .*\/api\/follow-ups/.test(m)).length === 0, consoleMsgs.join(" | "));
check("boundaries", "the audit log has the follow-up events with no customer text", Number(sql("SELECT count(*) FROM audit_log WHERE action LIKE 'followup.%'")) >= 6 && !/Northwind|Vienna|PO number/.test(sql("SELECT string_agg(detail::text, ' ') FROM audit_log")));

const failed = results.filter((r) => !r.pass).length;
writeFileSync(join(here, "qa-results.json"), JSON.stringify({ task: "NMI-FUP-01", timezoneEmulated: ZONE, providersConfigured: false, passed: results.length - failed, total: results.length, results }, null, 2) + "\n");
console.log(`\n${results.length - failed}/${results.length} passed`);
await cleanup();
process.exit(failed ? 1 : 0);
