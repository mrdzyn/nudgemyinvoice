/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-NDG-02 C1 browser walkthrough of Nudgey's read-only conversational lookup: genuine Chrome (time zone emulated as
// Asia/Manila) -> Vite preview of the production build (strict CSP) -> the real API -> a disposable
// PostgreSQL 16. Providers are NOT configured: no OpenAI key, PAYPAL_DRAFTS_ENABLED=false, no PayPal
// credentials. The check proves the browser makes no provider request and no PayPal operation exists.
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-NDG-02/run-conversational-journey.mjs
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const ORIGIN = "http://localhost:4152";
const API_PORT = 3152;
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54352;
const DEBUG_PORT = 9352;
const DB = "nmi_test_ndg02_journey";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-ndg";
const PASSWORD = randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const results = [];
const check = (group, name, cond, detail = "") => {
  results.push({ group, name, pass: Boolean(cond), detail: cond ? "" : String(detail) });
  console.log(`${cond ? "PASS" : "FAIL"}  [${group}] ${name}${cond ? "" : " - " + detail}`);
};
if (!existsSync(join(root, "apps/web/dist/index.html"))) throw new Error("Run `pnpm --filter @nmi/web build` first");

const work = mkdtempSync(join(tmpdir(), "nmi-ndg-"));
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
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_ndg", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_ndg", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_ndg@127.0.0.1:${PG_PORT}/${DB}`;
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
const preview = spawn("pnpm", ["--filter", "@nmi/web", "exec", "vite", "preview", "--host", "localhost", "--port", "4152", "--strictPort"], { cwd: root, stdio: "ignore", env: { ...process.env, NMI_API_ORIGIN: API }, detached: true });
children.push(preview);
await startApi();
for (let i = 0; i < 100; i++) { try { if ((await fetch(ORIGIN + "/")).ok) break; } catch {} await sleep(150); }
check("setup", "disposable PostgreSQL 16 migrated through the journal (incl. 0007) and the API is healthy behind the proxy with no provider configured", (await (await fetch(ORIGIN + "/health")).json()).aiConfigured === false && Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_name='invoice_follow_ups'")) === 1);

// ---- seed two synthetic invoices through the real API (same operator the browser will use)
async function seed(name, email, currency, unit, due, n) {
  const login = await fetch(API + "/api/auth/login", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ username: USER, password: PASSWORD }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const csrf = (await login.json()).csrfToken;
  const r = await fetch(API + "/api/invoice-drafts", { method: "POST", headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json", "idempotency-key": `ndg-seed-key-${n}-0000000` }, body: JSON.stringify({ customerName: name, customerEmail: email, currency, lineItems: [{ description: "Logo concepts", quantity: "2", unitPrice: unit }], dueDate: due, taxPercent: "8", discount: null }) });
  return (await r.json()).id;
}
const INV1 = await seed("Northwind Studio", "ap@northwind.example", "USD", "250.00", "2030-01-15", 1);
const INV2 = await seed("Vienna Cafe", "cafe@vienna.example", "EUR", "199.99", "2030-03-01", 2);
check("setup", "two synthetic invoices saved by the operator", Boolean(INV1 && INV2));
async function seedFollowUp(invoiceId, whenMs, message) {
  const login = await fetch(API + "/api/auth/login", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ username: USER, password: PASSWORD }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const csrf = (await login.json()).csrfToken;
  const r = await fetch(API + "/api/follow-ups", { method: "POST", headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json" }, body: JSON.stringify({ invoiceId, dueAt: new Date(whenMs).toISOString(), timezone: "Asia/Manila", note: null, message }) });
  return r.status;
}
check("setup", "one follow-up due now (Northwind) and one upcoming (Vienna Cafe) saved through the real API", (await seedFollowUp(INV1, Date.now(), "Friendly reminder")) === 201 && (await seedFollowUp(INV2, Date.now() + 26 * 3600e3, "Friendly reminder")) === 201);

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-ndg-"));
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
let staleGate = null;
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
  else if (msg.method === "Network.loadingFailed") { const e = netLog.find((n) => n.id === msg.params.requestId); if (e) e.failure = msg.params.errorText; }
  else if (msg.method === "Fetch.requestPaused") {
    if (staleGate && msg.params.request.url.includes("/api/invoice-drafts/search")) {
      if (!staleGate.held) {
        staleGate.held = msg.params.requestId;
        staleGate.holdResolve();
      } else {
        const old = staleGate.held;
        staleGate = null;
        send("Fetch.failRequest", { requestId: old, errorReason: "Aborted" }).catch(() => {});
        send("Fetch.continueRequest", { requestId: msg.params.requestId }).catch(() => {});
      }
    } else send("Fetch.continueRequest", { requestId: msg.params.requestId }).catch(() => {});
  }
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
const lastBot = () => ev("(() => { const b = [...document.querySelectorAll('.chat-bot')]; return b.length ? b[b.length - 1].innerText.replace(/\\s+/g, ' ') : ''; })()");
const userBubbles = () => ev("[...document.querySelectorAll('.chat-user')].map((e) => e.innerText.replace(/^You:\\s*/, '').trim())");
const chatInput = () => ev("(() => { const i = document.querySelector('.chat-form input'); return i ? i.id : null; })()");
async function ask(text) {
  const id = await chatInput();
  await focusId(id);
  await ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ${JSON.stringify(text)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev("document.querySelector('.chat-form').requestSubmit()");
}
const waitBotDone = () => waitFor("!document.querySelector('.chat-bot[aria-busy=true]') && document.querySelectorAll('.chat-bot').length > 0", 6000);
const searchCalls = (since) => netLog.slice(since).filter((n) => n.path === "/api/invoice-drafts/search" && n.method === "POST");
const bodyOf = (n) => { try { return JSON.parse(n.body ?? "{}"); } catch { return {}; } };

check("auth", "operator signs in through the browser", await signIn());
await waitFor("!!document.querySelector('.nudgey-launcher')");
await openNudgey();
check("entry", "Nudgey keeps its quick actions and the follow-up scheduler and adds 'Ask Nudgey'", (await ev("[...document.querySelectorAll('.nudgey-action strong')].map((e) => e.textContent).join('|')")) === "Create an invoice|View my invoices|Check invoice status|Ask Nudgey|Schedule a follow-up");
await ev("[...document.querySelectorAll('.nudgey-action')].find((b) => b.textContent.includes('Ask Nudgey')).click()");
await waitFor("!!document.querySelector('.chat-form input')");
check("entry", "the Ask view shows five example chips, a labelled input limited to 200 characters, and focuses the input", (await ev("document.querySelectorAll('.chat-chip').length")) === 6 && (await ev("document.querySelector('.chat-form input').maxLength")) === 200 && (await ev("document.activeElement === document.querySelector('.chat-form input')")));
check("entry", "an empty prompt cannot be submitted (Ask is disabled) and makes no request", (await ev("document.querySelector('.chat-form button[type=submit]').disabled")) === true);

// 1 pending invoices (typed + submitted like Enter)
let m = netLog.length;
await ask("What are my pending invoices?");
await waitBotDone();
const overview = await lastBot();
const calls1 = searchCalls(m);
check("pending", "four bounded POST /api/invoice-drafts/search requests, one per PayPal draft group, each with status and limit 5 in the BODY", calls1.length === 4 && ["none", "progress", "created", "attention"].every((s) => calls1.some((c) => bodyOf(c).status === s && bodyOf(c).limit === 5)) && calls1.every((c) => c.path === "/api/invoice-drafts/search"), JSON.stringify(calls1.map(bodyOf)));
check("pending", "the real invoices appear under 'No PayPal draft' with their own currency and exact total; other groups say None; no payment claim", overview.includes("No PayPal draft (2)") && overview.includes("Northwind Studio") && overview.includes("USD 540.00") && overview.includes("Vienna Cafe") && overview.includes("EUR 431.98") && (overview.match(/None\./g) ?? []).length === 3 && overview.includes("PayPal draft state is not payment status") && !/unpaid|overdue|has been paid/i.test(overview.replace("nothing here says whether an invoice has been paid", "")), overview);
await shot("01-pending-invoices.jpg");

// 2 customer search: the term is only in the POST body
m = netLog.length;
await ask("Find invoices for Northwind Studio");
await waitBotDone();
const s2 = searchCalls(m);
const bot2 = await lastBot();
check("search", "exactly one search POST whose BODY carries q='Northwind Studio'; the URL has no query string and the name appears in no URL", s2.length === 1 && bodyOf(s2[0]).q === "Northwind Studio" && !netLog.some((n) => /Northwind/i.test(n.path) || n.path.includes("?")) , JSON.stringify(s2.map(bodyOf)));
check("search", "only the matching customer is shown", bot2.includes("Northwind Studio") && !bot2.includes("Vienna Cafe") && bot2.includes("USD 540.00"), bot2);

// 3 currency filter
m = netLog.length;
await ask("Show my EUR invoices");
await waitBotDone();
const s3 = searchCalls(m);
const bot3 = await lastBot();
check("currency", "the currency is sent to the server as a filter (EUR) and only EUR records are shown with no cross-currency total", s3.length === 1 && bodyOf(s3[0]).currency === "EUR" && bot3.includes("Vienna Cafe") && bot3.includes("EUR 431.98") && !bot3.includes("USD") && !/total of|combined|971/i.test(bot3), bot3);

// 4 follow-ups due / upcoming (fresh server read)
m = netLog.length;
await ask("Which follow-ups are due?");
await waitBotDone();
const f4 = netLog.slice(m).filter((n) => n.path === "/api/follow-ups" && n.method === "GET");
const bot4 = await lastBot();
check("followups", "a fresh GET /api/follow-ups; the due follow-up (Northwind) is shown with its Manila time and zone, the upcoming one is not", f4.length >= 1 && bot4.includes("Northwind Studio") && /\bDUE\b/.test(bot4) && bot4.includes("Asia/Manila (GMT+8)") && !bot4.includes("Vienna Cafe") && bot4.includes("1 due and 1 upcoming"), bot4);
check("followups", "it says a due follow-up does not mean the invoice is unpaid", bot4.includes("does not mean an invoice is unpaid"));
await ask("What follow-ups are upcoming?");
await waitBotDone();
const bot4b = await lastBot();
check("followups", "upcoming shows only Vienna Cafe", bot4b.includes("Vienna Cafe") && !bot4b.includes("Northwind Studio") && /UPCOMING/.test(bot4b), bot4b);

// 5 unsupported payment question and unknown text: honest, and NO request at all
m = netLog.length;
await ask("Is Northwind Studio paid?");
await waitBotDone();
const bot5 = await lastBot();
check("payment", "payment status is refused truthfully and offers saved/draft details instead", bot5.includes("can't tell you whether an invoice is paid, unpaid or overdue") && bot5.includes("does not receive or reconcile payment") , bot5);
await ask("tell me a joke");
await waitBotDone();
check("payment", "the refusal and an unknown request made zero network requests", netLog.length === m && (await lastBot()).includes("I can look things up read-only"));
await shot("02-conversation.jpg");

// 6 a newer question replaces an unanswered older one. Hold the first HTTP request at the browser
// boundary so the replacement is deterministic even when the local API responds very quickly.
m = netLog.length;
let releaseStaleGate;
const staleHeld = new Promise((resolve) => { releaseStaleGate = resolve; });
staleGate = { held: null, holdResolve: releaseStaleGate };
await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/invoice-drafts/search", requestStage: "Request" }] });
await ev(`(() => { const form = document.querySelector('.chat-form'); const e = form.querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, 'Show my invoices'); e.dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit(); })()`);
await Promise.race([staleHeld, sleep(5000).then(() => { throw new Error("first stale-test request was not held"); })]);
await ask("Show my USD invoices");
await waitBotDone();
await send("Fetch.disable");
const ub = await userBubbles();
const staleBot = await lastBot();
const staleCalls = searchCalls(m);
check("stale", "the first search was held until replacement, then canceled; only the newer question and USD-filtered answer remain", ub.at(-1) === "Show my USD invoices" && !ub.slice(-2).includes("Show my invoices") && staleBot.includes("USD invoices") && !staleBot.includes("Vienna Cafe") && staleCalls.length === 2 && staleCalls.some((n) => n.failure), JSON.stringify({ users: ub.slice(-3), answer: staleBot, requests: staleCalls.map((n) => ({ status: n.status, failure: n.failure, body: n.body })) }));

// 7 open an invoice from a card through the real navigation
await ask("Find invoices for Northwind Studio");
await waitBotDone();
await ev("[...document.querySelectorAll('.chat-bot')].at(-1).querySelector('.followup-btn').click()");
await waitFor("!!document.getElementById('saved-id')");
check("navigate", "Open invoice opens the real saved-invoice page and closes Nudgey", (await ev("document.getElementById('saved-id')?.textContent")) === INV1 && !(await ev("!!document.querySelector('.nudgey-panel')")) && (await bodyText()).includes("Follow-up reminder"));

// 8 the conversation is forgotten when Nudgey closes; sign-out starts clean
await openNudgey();
await ev("[...document.querySelectorAll('.nudgey-action')].find((b) => b.textContent.includes('Ask Nudgey')).click()");
await waitFor("!!document.querySelector('.chat-form input')");
check("privacy", "reopening Nudgey shows an empty conversation (nothing kept after close)", (await ev("document.querySelectorAll('.chat-msg').length")) === 0 && (await bodyText()).includes("Ask a question or pick an example above."));
await ask("Show my invoices");
await waitBotDone();
await ev("[...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Sign out'))?.click()");
await waitFor("!!document.getElementById('login-username')");
check("privacy", "signing out removes the workspace and the whole conversation from the page", !(await ev("!!document.querySelector('.nudgey') || !!document.querySelector('.chat-log')")) && !(await bodyText()).includes("Northwind"));
check("auth", "signing in again works", await signIn());
await waitFor("!!document.querySelector('.nudgey-launcher')");
await openNudgey();
await ev("[...document.querySelectorAll('.nudgey-action')].find((b) => b.textContent.includes('Ask Nudgey')).click()");
await waitFor("!!document.querySelector('.chat-form input')");
check("privacy", "after sign-in the conversation is empty again", (await ev("document.querySelectorAll('.chat-msg').length")) === 0);

// 9 narrow viewport: the panel stays on screen above the mobile navigation
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
await sleep(200);
await ask("What are my pending invoices?");
await waitBotDone();
const geo = await ev("(() => { const p = document.querySelector('.nudgey-panel').getBoundingClientRect(); const nav = document.querySelector('.mobile-nav')?.getBoundingClientRect(); const de = document.documentElement; return { left: p.left, right: p.right, top: p.top, bottom: p.bottom, vw: innerWidth, vh: innerHeight, navTop: nav ? nav.top : null, overflowX: de.scrollWidth - de.clientWidth }; })()");
check("narrow", "at 390px the panel is fully inside the viewport, above the mobile navigation, with no horizontal page overflow", geo.left >= 0 && geo.right <= geo.vw && geo.top >= 0 && (geo.navTop === null || geo.bottom <= geo.navTop + 1) && geo.overflowX <= 1, JSON.stringify(geo));
await shot("03-narrow.jpg");
await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });

// boundaries
const apiPaths = netLog.filter((n) => n.path.startsWith("/api/"));
check("boundaries", "only auth, invoice search/detail and follow-up reads were used: never parse, PayPal-draft, a follow-up write, or any send route", apiPaths.every((n) => /^\/api\/(auth\/(session|login|logout)|invoice-drafts\/search|invoice-drafts\/[0-9a-f-]{36}(\/follow-ups)?|follow-ups)$/.test(n.path)) && apiPaths.filter((n) => n.method !== "GET").every((n) => n.path === "/api/invoice-drafts/search" || n.path.startsWith("/api/auth/")), [...new Set(apiPaths.map((n) => n.method + " " + n.path))].join(","));
check("boundaries", "no request left the page origin and no URL contains customer text", foreign.length === 0 && !netLog.some((n) => /Northwind|Vienna|pending/i.test(n.path)), foreign.join(","));
check("boundaries", "no PayPal operation, no PayPal id, no approval or webhook row; only the two seeded follow-ups exist (the chat wrote nothing)", sql("SELECT (SELECT count(*) FROM paypal_draft_operations) || ',' || (SELECT count(*) FROM invoices WHERE paypal_invoice_id IS NOT NULL) || ',' || (SELECT count(*) FROM approvals) || ',' || (SELECT count(*) FROM paypal_webhook_events) || ',' || (SELECT count(*) FROM invoice_follow_ups) || ',' || (SELECT count(*) FROM invoices)") === "0,0,0,0,2,2");
check("boundaries", "browser storage is empty, the page URL has no query or hash, and the only console errors are the pre-sign-in 401 session probes", (await ev("localStorage.length + sessionStorage.length")) === 0 && (await ev("location.search + location.hash")) === "" && consoleMsgs.filter((x) => !/status of 401 .*\/api\/auth\/session/.test(x)).length === 0, consoleMsgs.join(" | "));
check("boundaries", "the audit log has no free-text question or customer name", !/Northwind|Vienna|pending invoices|joke/i.test(sql("SELECT coalesce(string_agg(detail::text || action, ' '), '') FROM audit_log")));

const failed = results.filter((r) => !r.pass).length;
writeFileSync(join(here, "qa-results.json"), JSON.stringify({ task: "NMI-NDG-02-C1", timezoneEmulated: ZONE, providersConfigured: false, passed: results.length - failed, total: results.length, results }, null, 2) + "\n");
console.log(`\n${results.length - failed}/${results.length} passed`);
await cleanup();
process.exit(failed ? 1 : 0);
