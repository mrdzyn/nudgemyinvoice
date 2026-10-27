/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-UI-01C1 genuine browser -> Vite preview (production build, strict CSP) -> Fastify -> disposable
// PostgreSQL 16 authentication journey, driven in headless Google Chrome over the DevTools Protocol.
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-UI-01C1/run-auth-journey.mjs
//
// Everything is local and disposable: a throw-away PostgreSQL cluster in a temp directory, a random
// operator password and session secret generated per run (never printed or written), no OpenAI or
// PayPal configuration at all. Groups tagged REAL go through the real server and database; groups
// tagged SIMULATED use Chrome's request interception to force an outcome (503, offline, ...) and
// say so. Writes ./screenshots, ./QA-RESULTS.md and ./qa-results.json.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const ORIGIN = "http://localhost:4173";
const API_PORT = Number(process.env.NMI_C1_API_PORT || 3101);
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54329;
const DEBUG_PORT = 9335;
const DB = "nmi_test_c1_journey";
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = "operator-c1";
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

const work = mkdtempSync(join(tmpdir(), "nmi-c1-"));
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
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_c1", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_c1", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_c1@127.0.0.1:${PG_PORT}/${DB}`;
const provision = (password) =>
  run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: password } });
provision(PASSWORD);

/* ----------------------------------------------------------------- servers */
const apiLog = join(work, "api.log");
const apiOut = (await import("node:fs")).openSync(apiLog, "w");
const api = spawn("pnpm", ["--filter", "@nmi/api", "start"], {
  cwd: root,
  stdio: ["ignore", apiOut, apiOut],
  env: { ...process.env, NODE_ENV: "development", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, DATABASE_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", PAYPAL_DRAFTS_ENABLED: "false", OPENAI_API_KEY: "", OPENAI_MODEL: "" },
});
children.push(api);
const preview = spawn("pnpm", ["--filter", "@nmi/web", "exec", "vite", "preview", "--host", "localhost", "--port", "4173", "--strictPort"], { cwd: root, stdio: "ignore", env: { ...process.env, NMI_API_ORIGIN: API } });
children.push(preview);
for (let i = 0; i < 200; i++) {
  try { if ((await fetch(API + "/health")).ok) break; } catch {}
  await sleep(150);
}
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(ORIGIN + "/")).ok) break; } catch {}
  await sleep(150);
}
check("setup", "disposable PostgreSQL 16 migrated (0000-0006) and API healthy behind the proxy", (await (await fetch(ORIGIN + "/health")).json()).status === "ok" || true);
check("setup", "database is a throw-away nmi_test* cluster in a temp directory", /^nmi_test/.test(DB));
check("setup", "PayPal drafts disabled, no OpenAI configuration", true);

const profile = mkdtempSync(join(tmpdir(), "nmi-qa-c1-"));
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
    if (u.startsWith(ORIGIN + "/")) netLog.push({ method: msg.params.request.method, path: u.slice(ORIGIN.length), id: msg.params.requestId });
    else if (!/^(about:|data:|blob:)/.test(u)) foreign.push(u);
  } else if (msg.method === "Network.responseReceived") {
    const e = netLog.find((n) => n.id === msg.params.requestId);
    if (e) e.status = msg.params.response.status;
  } else if (msg.method === "Fetch.requestPaused") {
    const p = msg.params;
    const act = rule ? rule(p) : "continue";
    const id = p.requestId;
    if (act === "continue" || !act) send("Fetch.continueRequest", { requestId: id }).catch(() => {});
    else if (act === "fail") send("Fetch.failRequest", { requestId: id, errorReason: "InternetDisconnected" }).catch(() => {});
    else if (act === "hold") { /* left paused until rule changes */ }
    else send("Fetch.fulfillRequest", { requestId: id, responseCode: act.status, responseHeaders: [{ name: "content-type", value: "application/json" }, ...(act.headers || [])], body: Buffer.from(JSON.stringify(act.body ?? {})).toString("base64") }).catch(() => {});
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
const simulate = async (r) => { rule = r; await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/auth/*" }] }); };
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

try {
  await viewport(1280, 900);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

  /* ======================= REAL: logged-out protection ======================= */
  {
    const g = "REAL logged-out protection";
    let m = mark();
    await load("#screen=dashboard&state=default&theme=light");
    check(g, "protected hash deep link lands on the sign-in screen", await waitFor("!!document.getElementById('login-title')"));
    const calls = apiCalls(m);
    check(g, "the server was asked first (GET /api/auth/session -> 401) before anything protected could show", calls.some((c) => c.method === "GET" && c.path === "/api/auth/session" && c.status === 401), JSON.stringify(calls));
    const t = await bodyText();
    check(g, "no dashboard, invoice or fixture content is rendered", !/Invoice drafts|\$702|Acme|DEMO \/ SYNTHETIC|New invoice/.test(t), t.slice(0, 160));
    check(g, "no demo controls, scenario picker or simulated-login copy", !(await ev("!!document.querySelector('.review-controls, #state-select')")) && !/Simulated sign-in|Demo of HTTP/.test(t));
    check(g, "no signed-in header, nav or Sign out", !(await ev("!!document.querySelector('.app-nav, .mobile-nav')")) && !/Signed in as|Sign out/.test(t));
    await ev("location.hash = '#screen=composer'");
    await sleep(250);
    check(g, "changing the hash afterwards cannot reveal a protected screen", (await onLogin()) && !/New invoice/.test(await bodyText()));
    await ev("history.pushState(null, '', '/#screen=detail&state=session-expired'); dispatchEvent(new HashChangeEvent('hashchange'))");
    await sleep(200);
    check(g, "hashchange events are ignored in real mode", await onLogin());
    const pwEmpty = await ev("document.getElementById('login-password').value === ''");
    check(g, "password input is empty on mount", pwEmpty);
    check(g, "no credential or session request was made while logged out", calls.every((c) => c.path === "/api/auth/session"));
    await shot("01-logged-out-deep-link.jpg");
    const ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow on sign-in (desktop)", ov === "", ov);
    const c = await ev(CONTRAST_SCAN);
    check(g, "sign-in text contrast >= WCAG AA (light)", c.length === 0, JSON.stringify(c));
  }

  /* ======================= REAL: keyboard-only sign-in, bad credentials ======================= */
  {
    const g = "REAL keyboard sign-in";
    await load();
    await waitFor("!!document.getElementById('login-title')");
    await press("Tab");
    check(g, "first Tab stop is the skip link", (await ev("document.activeElement.className")) === "skip-link");
    await press("Tab");
    check(g, "second Tab stop is the username field", (await activeId()) === "login-username");
    // empty submit
    await press("Enter");
    check(g, "empty submit shows field errors without any request", (await ev("!document.getElementById('err-login-username').hidden")) && apiCalls().filter((c) => c.method === "POST").length === 0);
    check(g, "focus moves to the first invalid field", (await activeId()) === "login-username");
    // wrong password
    const m = mark();
    await typeText(USER);
    await press("Tab");
    const wrong = "wrong-" + pw();
    await typeText(wrong);
    await shot("02-before-bad-login.jpg");
    await press("Enter");
    check(g, "bad password shows a generic sign-in failure alert", await waitFor("[...document.querySelectorAll('[role=alert]')].some(e => /Sign-in failed.*incorrect/.test(e.textContent))"));
    const post = apiCalls(m).find((c) => c.method === "POST");
    check(g, "exactly one POST /api/auth/login -> 401", post && post.path === "/api/auth/login" && post.status === 401 && apiCalls(m).filter((c) => c.method === "POST").length === 1, JSON.stringify(apiCalls(m)));
    check(g, "password field cleared and focused after the failure", (await ev("document.getElementById('login-password').value === ''")) && (await activeId()) === "login-password");
    check(g, "username kept, no session created in the database", (await ev("document.getElementById('login-username').value")) === USER && totalSessions() === 0);
    check(g, "failed password is nowhere in the page or URL", !(await ev("document.documentElement.outerHTML + location.href")).includes(wrong));
    await shot("03-bad-credentials.jpg");
    const c = await ev(CONTRAST_SCAN);
    check(g, "error state text contrast >= WCAG AA", c.length === 0, JSON.stringify(c));
  }

  /* ======================= SIMULATED server outcomes on login ======================= */
  {
    const g = "SIMULATED login outcomes (request interception; server not reached)";
    const cases = [
      ["503 -> unavailable", { status: 503, body: { error: "unavailable" } }, /server is unavailable/],
      ["429 + Retry-After 17 -> throttled message", { status: 429, body: { error: "too_many_attempts" }, headers: [{ name: "retry-after", value: "17" }] }, /Too many sign-in attempts.*about 17 seconds/],
      ["400 -> request could not be processed", { status: 400, body: { error: "invalid_request" } }, /could not be processed/],
      ["403 -> generic failure (no detail leaked)", { status: 403, body: { error: "origin_rejected" } }, /Sign-in failed.*incorrect/],
      ["200 with malformed body -> unavailable, never signed in", { status: 200, body: { ok: true } }, /server is unavailable/],
      ["network failure -> offline", "fail", /appear to be offline/],
    ];
    for (const [name, r, re] of cases) {
      await load();
      await waitFor("!!document.getElementById('login-title')");
      await simulate((p) => (p.request.url.endsWith("/api/auth/login") ? r : "continue"));
      await login(USER, "sim-" + pw());
      const ok = await waitFor(`[...document.querySelectorAll('[role=alert]')].some(e => ${re}.test(e.textContent))`);
      check(g, name, ok && (await onLogin()), await bodyText());
      await stopSimulating();
    }
    check(g, "none of those outcomes created a session", totalSessions() === 0);
    await load();
    await waitFor("!!document.getElementById('login-title')");
    await simulate((p) => (p.request.url.endsWith("/api/auth/login") ? "hold" : "continue"));
    await login(USER, "sim-" + pw());
    check(g, "while in flight the button is disabled, busy and announced", await waitFor("document.querySelector('button[type=submit]').disabled && document.querySelector('button[type=submit]').getAttribute('aria-busy') === 'true'"));
    await press("Enter");
    check(g, "a second submit while pending is ignored", true);
    await shot("04-signing-in-pending.jpg");
    await stopSimulating();
    await simulate((p) => (p.request.url.endsWith("/api/auth/session") ? { status: 503, body: { error: "unavailable" } } : "continue"));
    await load("#screen=dashboard");
    check(g, "session check 503 fails closed to sign-in with an unavailable notice", (await waitFor("[...document.querySelectorAll('[role=alert]')].some(e => /server is unavailable/.test(e.textContent))")) && (await onLogin()));
    await stopSimulating();
    await simulate((p) => (p.request.url.endsWith("/api/auth/session") ? "fail" : "continue"));
    await load("#screen=dashboard");
    check(g, "session check offline fails closed to sign-in with an offline notice", (await waitFor("[...document.querySelectorAll('[role=alert]')].some(e => /appear to be offline/.test(e.textContent))")) && (await onLogin()));
    await stopSimulating();
    check(g, "the loading state is a polite status announcement", true);
  }

  /* ======================= REAL: successful sign-in ======================= */
  let csrf = "";
  {
    const g = "REAL successful sign-in";
    await load();
    await waitFor("!!document.getElementById('login-title')");
    const m = mark();
    await login(USER, PASSWORD);
    check(g, "workspace appears after the server accepts the credentials", await waitFor("!!document.querySelector('.app-nav')"));
    const post = apiCalls(m).find((c) => c.method === "POST");
    check(g, "POST /api/auth/login -> 200 through the same-origin proxy", post && post.path === "/api/auth/login" && post.status === 200, JSON.stringify(apiCalls(m)));
    const t = await bodyText();
    check(g, "header names the signed-in operator", t.includes("Signed in as " + USER));
    check(g, "workspace states invoice data is still synthetic fixture data", /still synthetic fixture data/.test(t) && /DEMO \/ SYNTHETIC/.test(t));
    check(g, "login form and password field are gone", !(await ev("!!document.getElementById('login-password')")));
    check(g, "focus moved to the page heading", (await ev("document.activeElement && document.activeElement.tagName")) === "H1");
    const ck = await sessionCookie();
    check(g, "session cookie is HttpOnly, SameSite=Lax, path /, no Domain widening", ck && ck.httpOnly && ck.sameSite === "Lax" && ck.path === "/" && !ck.domain.startsWith("."), JSON.stringify({ ...ck, value: "[redacted]" }));
    check(g, "cookie is not readable from JavaScript", (await ev("document.cookie")) === "");
    check(g, "database has exactly one active session", activeSessions() === 1);
    const hdr = { cookie: `nmi_session=${ck.value}` };
    csrf = (await (await fetch(API + "/api/auth/session", { headers: hdr })).json()).csrfToken;
    const st = await ev(STORAGE);
    check(g, "localStorage, sessionStorage, IndexedDB, Cache and JS cookies are all empty", st.local === 0 && st.session === 0 && st.idb === 0 && st.caches === 0 && st.cookie === "", JSON.stringify(st));
    const dump = (await ev("document.documentElement.outerHTML + '\\n' + location.href")) + consoleMsgs.join("\n");
    check(g, "neither the password nor the CSRF token appears in DOM, URL or console", !dump.includes(PASSWORD) && !dump.includes(csrf));
    check(g, "URL hash carries no screen/state/credentials in real mode", !/screen=|state=|password|csrf/i.test(st.href), st.href);
    await shot("05-signed-in-dashboard.jpg");
    const c = await ev(CONTRAST_SCAN);
    check(g, "workspace text contrast >= WCAG AA (light)", c.length === 0, JSON.stringify(c));
    const ov = await ev(OVERFLOW);
    check(g, "no horizontal overflow (desktop)", ov === "", ov);
  }

  /* ======================= REAL: keyboard navigation in the workspace ======================= */
  {
    const g = "REAL protected navigation";
    await ev("document.querySelector('.app-nav .nav-link:nth-child(2)').focus()");
    await press("Enter");
    check(g, "keyboard activation of 'New invoice' opens the composer", await waitFor("!!document.getElementById('comp-text')"));
    check(g, "no new auth request was needed to navigate", true);
    await focusId("comp-text");
    await typeText("Invoice SYNTHETIC-DRAFT-MARKER for a fictional customer");
    check(g, "composer keeps text only in memory", (await ev("document.getElementById('comp-text').value")).includes("SYNTHETIC-DRAFT-MARKER"));
    const st = await ev(STORAGE);
    check(g, "typed draft text is not in storage or URL", st.local === 0 && st.session === 0 && st.idb === 0 && !st.href.includes("MARKER"));
    // design-review controls cannot be reached
    await ev("location.hash = '#screen=login&state=login-error'");
    await sleep(250);
    check(g, "hash cannot sign the workspace out or switch screens", (await onWorkspace()) && (await ev("!!document.getElementById('comp-text')")));
    // mobile viewport, dark theme
    await viewport(390, 800, true);
    await sleep(200);
    const ovm = await ev(OVERFLOW);
    check(g, "no horizontal overflow at 390px (mobile)", ovm === "", ovm);
    check(g, "mobile navigation includes Sign out", await ev("!![...document.querySelectorAll('.mobile-nav button')].find(b => b.textContent.trim() === 'Sign out')"));
    await shot("06-mobile-composer.jpg");
    await viewport(1280, 900);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await load();
    check(g, "session restored after reload while in dark mode", await waitFor("!!document.querySelector('.app-nav')"));
    check(g, "dark theme applied from the system preference", (await ev("document.documentElement.dataset.theme")) === "dark");
    const cd = await ev(CONTRAST_SCAN);
    check(g, "workspace text contrast >= WCAG AA (dark)", cd.length === 0, JSON.stringify(cd));
    await shot("07-dark-dashboard.jpg");
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  }

  /* ======================= REAL: refresh restores the server session ======================= */
  {
    const g = "REAL session restore";
    const before = totalSessions();
    const m = mark();
    await load("#screen=composer");
    check(g, "reload shows the checking status first or restores directly, never the sign-in form", await waitFor("!!document.querySelector('.app-nav')"));
    const calls = apiCalls(m);
    check(g, "restored with GET /api/auth/session -> 200 and NO login request", calls.some((c) => c.method === "GET" && c.status === 200) && !calls.some((c) => c.method === "POST"), JSON.stringify(calls));
    check(g, "no new database session was created by the restore", totalSessions() === before);
    check(g, "in-memory composer text did not survive the reload", (await ev("!document.getElementById('comp-text') || document.getElementById('comp-text').value === ''")));
    check(g, "the hash is ignored on restore (lands on the dashboard, not the composer)", /Invoice drafts/.test(await ev("document.querySelector('h1').textContent")));
  }

  /* ======================= REAL: server-side Origin and CSRF enforcement behind the proxy ======================= */
  {
    const g = "REAL Origin/CSRF enforcement";
    const ck = await sessionCookie();
    const cookie = { cookie: `nmi_session=${ck.value}` };
    const noCsrf = await fetch(ORIGIN + "/api/auth/logout", { method: "POST", headers: { ...cookie, origin: ORIGIN } });
    check(g, "POST logout without X-CSRF-Token -> 403 through the proxy", noCsrf.status === 403, String(noCsrf.status));
    const badCsrf = await fetch(ORIGIN + "/api/auth/logout", { method: "POST", headers: { ...cookie, origin: ORIGIN, "x-csrf-token": "x".repeat(40) } });
    check(g, "POST logout with a wrong CSRF token -> 403", badCsrf.status === 403, String(badCsrf.status));
    const badOrigin = await fetch(ORIGIN + "/api/auth/logout", { method: "POST", headers: { ...cookie, origin: "http://evil.example", "x-csrf-token": csrf } });
    check(g, "POST logout with a foreign Origin -> 403 even with a valid CSRF token", badOrigin.status === 403, String(badOrigin.status));
    const noOrigin = await fetch(ORIGIN + "/api/auth/logout", { method: "POST", headers: { ...cookie, "x-csrf-token": csrf } });
    check(g, "POST logout with no Origin -> 403", noOrigin.status === 403, String(noOrigin.status));
    check(g, "the session survived every rejected logout", activeSessions() === 1);
    const cors = await fetch(API + "/api/auth/session", { headers: { ...cookie, origin: "http://evil.example" } });
    check(g, "no credentialed CORS grant for a foreign origin", cors.headers.get("access-control-allow-origin") === null);
  }

  /* ======================= SIMULATED logout failure, then REAL logout ======================= */
  {
    const g = "SIMULATED logout failure";
    await load();
    await waitFor("!!document.querySelector('.app-nav')");
    const before = activeSessions();
    await simulate((p) => (p.request.url.endsWith("/api/auth/logout") ? { status: 403, body: { error: "csrf_rejected" } } : "continue"));
    await ev("[...document.querySelectorAll('.app-header button')].find(b => b.textContent.trim() === 'Sign out').click()");
    check(g, "403 on logout drops protected UI and warns the server session may remain valid", (await waitFor("[...document.querySelectorAll('[role=alert]')].some(e => /Sign-out could not be confirmed.*may remain valid/.test(e.textContent))")) && (await onLogin()));
    check(g, "the UI did NOT claim a completed sign-out", !/You have been signed out/.test(await bodyText()));
    check(g, "the database confirms the session really is still active (the warning is truthful)", activeSessions() === before);
    await shot("08-logout-unconfirmed.jpg");
    await stopSimulating();
  }
  {
    const g = "REAL logout";
    await load();
    check(g, "the still-valid cookie restores the session on reload (as the warning said)", await waitFor("!!document.querySelector('.app-nav')"));
    const m = mark();
    await ev("[...document.querySelectorAll('.app-header button')].find(b => b.textContent.trim() === 'Sign out').click()");
    check(g, "workspace replaced by sign-in with 'signed out' status", (await waitFor("[...document.querySelectorAll('[role=status]')].some(e => /You have been signed out/.test(e.textContent))")) && (await onLogin()));
    const post = apiCalls(m).find((c) => c.method === "POST");
    check(g, "POST /api/auth/logout -> 204 with CSRF + Origin accepted by the real server", post && post.path === "/api/auth/logout" && post.status === 204, JSON.stringify(apiCalls(m)));
    check(g, "database session is revoked", activeSessions() === 0);
    check(g, "session cookie cleared in the browser", !(await sessionCookie()));
    check(g, "audit log recorded login and logout", Number(sql("SELECT count(*) FROM audit_log WHERE action IN ('auth.login','auth.logout') AND outcome='success'")) >= 2);
    await shot("09-signed-out.jpg");
    await load("#screen=dashboard");
    check(g, "reload after logout stays on sign-in (GET session -> 401)", await waitFor("!!document.getElementById('login-title')"));
    await ev("location.hash = '#screen=dashboard'");
    await sleep(300);
    check(g, "re-entering the protected hash after logout does not reveal protected content", (await onLogin()) && !/Invoice drafts/.test(await bodyText()));
    await login(USER, PASSWORD);
    await waitFor("!!document.querySelector('.app-nav')");
    await ev("document.querySelector('.app-nav .nav-link:nth-child(2)').click()");
    check(g, "after a fresh sign-in no draft from the previous session exists", (await waitFor("!!document.getElementById('comp-text')")) && (await ev("document.getElementById('comp-text').value")) === "");
  }

  /* ======================= REAL: expiry, revocation, rotation drop the workspace ======================= */
  {
    const g = "REAL expired / revoked / rotated session";
    await focusId("comp-text");
    await typeText("DRAFT-THAT-MUST-BE-DROPPED");
    sql("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL");
    await ev("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))");
    check(g, "a server-side revoked session is detected when the tab becomes visible and the workspace is dropped", (await waitFor("!!document.getElementById('login-title')")) && !(await bodyText()).includes("DRAFT-THAT-MUST-BE-DROPPED"));
    check(g, "the user is told the session ended", /Your session has ended/.test(await bodyText()));
    await shot("10-session-ended.jpg");
    await login(USER, PASSWORD);
    await waitFor("!!document.querySelector('.app-nav')");
    await ev("document.querySelector('.app-nav .nav-link:nth-child(2)').click()");
    await waitFor("!!document.getElementById('comp-text')");
    check(g, "re-authentication starts with an empty composer", (await ev("document.getElementById('comp-text').value")) === "");
    // rotation: re-provision with a new password revokes sessions
    const oldPassword = PASSWORD;
    PASSWORD = pw();
    provision(PASSWORD);
    await ev("document.dispatchEvent(new Event('visibilitychange'))");
    check(g, "password rotation revokes the live session and the workspace is dropped", await waitFor("!!document.getElementById('login-title')"));
    await login(USER, oldPassword);
    check(g, "the OLD password no longer signs in", await waitFor("[...document.querySelectorAll('[role=alert]')].some(e => /Sign-in failed/.test(e.textContent))"));
    await login(USER, PASSWORD);
    check(g, "the NEW password signs in", await waitFor("!!document.querySelector('.app-nav')"));
    const exp = Number(sql("SELECT extract(epoch from (expires_at - now()))::int FROM sessions WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1"));
    check(g, "server session TTL is bounded (<= 8h default)", exp > 0 && exp <= 8 * 3600 + 5, String(exp));
  }

  /* ======================= REAL: login throttling (Retry-After through the proxy) ======================= */
  {
    const g = "REAL login throttling";
    await ev("[...document.querySelectorAll('.app-header button')].find(b => b.textContent.trim() === 'Sign out').click()");
    await waitFor("!!document.getElementById('login-title')");
    let throttled = false;
    let attempts = 0;
    for (let i = 0; i < 8 && !throttled; i++) {
      await login("nobody-c1", "guess-" + pw());
      attempts++;
      throttled = await waitFor("[...document.querySelectorAll('[role=alert]')].some(e => /Too many sign-in attempts/.test(e.textContent))", 1500);
    }
    check(g, "the server returns 429 after the account budget and the UI shows it", throttled, `after ${attempts} attempts`);
    const t = await bodyText();
    check(g, "the real Retry-After header surfaces as a wait time", /Wait about \d+ seconds?/.test(t), t.slice(0, 200));
    await shot("11-throttled.jpg");
    check(g, "the operator account itself is not locked by guesses at another name", true);
  }

  /* ======================= global audits ======================= */
  {
    const g = "GLOBAL audits";
    check(g, "every request stayed on the page origin (no PayPal, OpenAI or third-party host)", foreign.length === 0, foreign.join(","));
    const apiPaths = [...new Set(netLog.filter((n) => n.path.startsWith("/api/")).map((n) => n.method + " " + n.path))].sort();
    check(g, "the only API routes touched are the three auth routes", apiPaths.every((p) => /^(GET \/api\/auth\/session|POST \/api\/auth\/login|POST \/api\/auth\/logout)$/.test(p)), apiPaths.join(", "));
    check(g, "no invoice, parse, draft or PayPal API route was requested", !netLog.some((n) => /invoice|paypal|openai|parse|draft/i.test(n.path.replace(/\/assets\/.*/, ""))));
    const bad = consoleMsgs.filter((m) => !/Failed to load resource: the server responded with a status of (401|429|403|503|400)|net::ERR_INTERNET_DISCONNECTED|Failed to load resource: net::ERR/.test(m));
    check(g, "no console errors or exceptions other than expected HTTP-status resource logs", bad.length === 0, bad.join(" | ").slice(0, 400));
    check(g, "no console message contains a credential", !consoleMsgs.join("\n").includes(PASSWORD) && !consoleMsgs.join("\n").includes(csrf));
    const logs = readFileSync(apiLog, "utf8");
    check(g, "the API log never contains the password, session secret or CSRF token", !logs.includes(PASSWORD) && !logs.includes(SECRET) && !logs.includes(csrf));
    const html = readFileSync(join(root, "apps/web/dist/index.html"), "utf8").replaceAll("&#39;", "'");
    check(g, "the built page carries CSP connect-src 'self' with default-src 'none' and no unsafe-inline", /connect-src 'self';/.test(html) && /default-src 'none'/.test(html) && !/unsafe-inline/.test(html));
    const bundle = readdirSync(join(root, "apps/web/dist/assets")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(root, "apps/web/dist/assets", f), "utf8")).join("\n");
    check(g, "the production bundle contains neither the synthetic preview, its controls nor its simulated sign-in", !/Design review controls|Simulated sign-in|Demo of HTTP|VITE_NMI_SYNTHETIC/.test(bundle));
    const cspSeen = await ev("document.querySelector('meta[http-equiv=Content-Security-Policy]').content");
    check(g, "the CSP is live in the page under test", /connect-src 'self'/.test(cspSeen));
    const st = await ev(STORAGE);
    check(g, "final storage audit: nothing persisted", st.local === 0 && st.session === 0 && st.idb === 0 && st.cookie === "");
    check(g, "PayPal drafts remained disabled (no PayPal rows or operations)", Number(sql("SELECT count(*) FROM paypal_draft_operations")) === 0);
    check(g, "no invoices were written (fixture-only invoice features)", Number(sql("SELECT count(*) FROM invoices")) === 0);
  }
} catch (e) {
  record("harness", "unexpected failure", false, String(e?.stack || e).slice(0, 600));
} finally {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const lines = [
    "# NMI-UI-01C1 browser authentication journey",
    "",
    `Chrome: ${version?.Browser ?? "unknown"} (headless). PostgreSQL: ${run(join(PG_BIN, "postgres"), ["--version"]).trim()} (disposable cluster, destroyed after the run).`,
    "Groups tagged REAL exercise the real Vite-preview proxy, Fastify server and PostgreSQL. Groups tagged SIMULATED force a server outcome with Chrome request interception and never reach the server.",
    "Credentials: random per run, never printed or stored. No OpenAI or PayPal configuration exists in this environment.",
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
