/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-P6-FIX2 browser journey: verifies that clicking "Open in queue" or "Open existing in queue" inside Nudgey while
// NudgeQueueScreen is ALREADY MOUNTED closes `.nudgey-panel`, leaves review actions unoccluded (elementFromPoint),
// switches tab/selection, moves focus to `#nq-title`, and allows consecutive same-screen "Draft a nudge" flows without
// page reload across desktop (1280x900) and phone (390x844) in light and dark themes (SIMULATED fake model, synthetic
// data only, disposable local PostgreSQL 16). Writes ONLY under design/evidence/NMI-P6-FIX2/.
//
//   pnpm build && node design/evidence/NMI-P6-FIX2/run-p6-fix2-journey.mjs
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makePgCtl, shutdownAndRemove } from "../NMI-P7/pg-cleanup.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const dist = join(root, "apps/web/dist");
const API_PORT = 3164;
const ORIGIN = `http://localhost:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54364;
const DEBUG_PORT = 9364;
const DB = "nmi_test_p6_fix2_nudges";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots");
const USER = "p6fix2-operator";
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
const info = {
  startedAt: new Date().toISOString(),
  synthetic: true,
  model: "DETERMINISTIC FAKE (not OpenAI)",
  sourceSha: gitOut("rev-parse", "HEAD"),
  sourceTreeDirtyAtRun: gitOut("status", "--porcelain", "--", ".", ":!design/evidence/NMI-P6-FIX2").split("\n").filter(Boolean),
  browser: "headless Chrome (CDP), emulated desktop 1280x900 and phone 390x844, light + dark",
};
if (!existsSync(join(dist, "index.html"))) throw new Error("Run `pnpm build` (default community web build) first");

/* ------------------------------------------------ disposable PostgreSQL 16: owner + least-privilege runtime role */
const work = mkdtempSync(join(tmpdir(), "nmi-p6fix2-"));
const children = [];
let cleanedUp = null;
const cleanup = () => {
  if (cleanedUp) return cleanedUp;
  for (const c of children) try { process.kill(-c.pid, "SIGTERM"); } catch { try { c.kill("SIGTERM"); } catch {} }
  cleanedUp = shutdownAndRemove({ dataDir: join(work, "pg"), removePaths: [work], pgCtl: makePgCtl(PG_BIN, env0) });
  if (!cleanedUp.confirmed) {
    console.error("PostgreSQL shutdown NOT confirmed; the disposable cluster was preserved at:", work);
    process.exitCode = 1;
  }
  return cleanedUp;
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
run("pnpm", ["--filter", "@nmi/api", "provision-operator"], {
  cwd: root,
  env: { ...env0, DATABASE_URL: OWNER_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: PASSWORD },
});
const OP = sql(`SELECT id FROM operators WHERE username='${USER}'`);
info.migrations = journal.entries.map((e) => e.tag);

/* ------------------------------------------------ the test-only launcher (real app, fake nudge model) */
const SCRIPT = join(work, "model-script");
const MODEL_LOG = join(work, "model-inputs.log");
const apiLog = join(work, "api.log");
writeFileSync(SCRIPT, "ok");
writeFileSync(MODEL_LOG, "");
const api = spawn("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(here, "../NMI-P6/test-api-server.ts")], {
  cwd: root,
  detached: true,
  stdio: ["ignore", openSync(apiLog, "a"), openSync(apiLog, "a")],
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LC_ALL: "en_US.UTF-8",
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(API_PORT),
    WEB_ORIGIN: ORIGIN,
    WEB_DIST_DIR: dist,
    DATABASE_URL: RUNTIME_URL,
    SESSION_SECRET: SECRET,
    PAYPAL_ENV: "sandbox",
    PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
    PAYPAL_DRAFTS_ENABLED: "false",
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "",
    NMI_P6_SIMULATED: "1",
    NMI_P6_MODEL_SCRIPT: SCRIPT,
    NMI_P6_MODEL_LOG: MODEL_LOG,
    NMI_P6_BUDGET: "40",
  },
});
children.push(api);
for (let i = 0; i < 300; i++) {
  let up = false;
  try { up = (await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok; } catch {}
  if (up) break;
  if (i === 299) throw new Error("test API did not start: " + readFileSync(apiLog, "utf8").slice(-800));
  await sleep(150);
}

/* ------------------------------------------------ HTTP helper (seeding synthetic invoices + nudges) */
async function http(method, path, { cookie, csrf, body, headers = {} } = {}) {
  const r = await fetch(`http://127.0.0.1:${API_PORT}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, headers: r.headers };
}
const L = await http("POST", "/api/auth/login", { body: { username: USER, password: PASSWORD } });
const side = { cookie: L.headers.get("set-cookie").split(";")[0], csrf: L.json.csrfToken };

const CUSTOMERS = [
  ["Zorblax Industries", "USD", "1200.00", "2026-10-30"],
  ["Zorblax Logistics", "EUR", "860.00", "2026-11-03"],
  ["Northwind Studio", "EUR", "640.00", "2026-11-03"],
  ["Bluebird Bakery", "JPY", "188837", "2026-11-12"],
];
const INV = {};
for (const [i, [name, currency, unit, due]] of CUSTOMERS.entries()) {
  const r = await http("POST", "/api/invoice-drafts", {
    ...side,
    headers: { "idempotency-key": `p6fix2-seed-${String(i).padStart(4, "0")}-key-xxxx` },
    body: {
      customerName: name,
      customerEmail: `billing${i}@example.test`,
      currency,
      lineItems: [{ description: `Synthetic project ${i}`, quantity: "1", unitPrice: unit }],
      dueDate: due,
      taxPercent: null,
      discount: null,
    },
  });
  if (r.status !== 201) throw new Error(`seed ${name}: ${r.status} ${JSON.stringify(r.json)}`);
  INV[name] = r.json.id;
}
check("seed", `${CUSTOMERS.length} synthetic invoices saved through the real route`, Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${OP}'`)) === CUSTOMERS.length);
const gen = (name, tone) => http("POST", `/api/invoice-drafts/${INV[name]}/nudges`, { ...side, body: { tone, timeZone: ZONE } });

/* ------------------------------------------------ headless Chrome over CDP */
const profile = mkdtempSync(join(tmpdir(), "nmi-p6fix2-chrome-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"],
  { stdio: "ignore", detached: true },
);
children.push(chrome);
process.on("exit", () => rmSync(profile, { recursive: true, force: true, maxRetries: 3 }));
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break; } catch {}
  await sleep(150);
}
const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
let msgId = 0;
const pending = new Map();
const consoleMsgs = [];
const net = [];
const foreign = [];
ws.onmessage = async (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, bad } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? bad(new Error(msg.error.message)) : ok(msg.result);
    return;
  }
  const p = msg.params;
  if (msg.method === "Runtime.exceptionThrown") consoleMsgs.push("exception: " + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  else if (msg.method === "Runtime.consoleAPICalled") consoleMsgs.push(`console.${p.type}: ` + p.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Log.entryAdded") consoleMsgs.push(`log.${p.entry.level}: ${p.entry.text}`);
  else if (msg.method === "Network.requestWillBeSent") {
    const u = p.request.url;
    if (u.startsWith(ORIGIN + "/")) net.push({ id: p.requestId, method: p.request.method, path: u.slice(ORIGIN.length) });
    else if (!/^(about:|data:|blob:)/.test(u)) foreign.push(u);
  } else if (msg.method === "Network.responseReceived") {
    const e = net.find((x) => x.id === p.requestId);
    if (e) e.status = p.response.status;
  }
};
const send = (method, params = {}) => new Promise((ok, bad) => { const id = ++msgId; pending.set(id, { ok, bad }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + expression.slice(0, 100) + " :: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 20000, what = expr) => {
  const t = Date.now();
  for (;;) {
    let v = false;
    try { v = await ev(expr); } catch {}
    if (v) return v;
    if (Date.now() - t > ms) throw new Error("timed out waiting for: " + what.slice(0, 160));
    await sleep(120);
  }
};
const q = JSON.stringify;
const waitText = (t, ms) => waitFor(`document.body.innerText.includes(${q(t)})`, ms, t);
const clickBy = (sel, text = null) => ev(`(() => { const els = [...document.querySelectorAll(${q(sel)})].filter((e) => e.getClientRects().length && (${q(text)} === null || (e.textContent || '').trim().startsWith(${q(text)}))); if (!els[0]) throw new Error('nothing to click: ' + ${q(sel)} + ' ' + ${q(text)}); els[0].click(); return true; })()`);
const setValue = (sel, v, proto = "HTMLInputElement") => ev(`(() => { const e = document.querySelector(${q(sel)}); const set = Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set; set.call(e, ${q(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);

for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Emulation.setTimezoneOverride", { timezoneId: ZONE });
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
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

const SCOPE = ".nq-summary, section[aria-labelledby=nq-title], .nq-draft, .nq-chat, .nudgey-panel, .mobile-nav, dialog[open]";
async function pageChecks(label) {
  const g = `${viewport.mobile ? "mobile" : "desktop"}-${theme}`;
  const over = await ev("document.scrollingElement.scrollWidth - innerWidth");
  check(g, `${label}: no horizontal page overflow`, over <= 0, String(over));
  if (viewport.mobile) {
    const small = await ev(`[...document.querySelectorAll(${q(SCOPE)})].flatMap((s) => [...s.querySelectorAll('button, [role=tab], select, summary, a[href], textarea, input:not([type=radio]):not([type=checkbox]), label.nq-tone, label.schedule-candidate-option')]).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; }).map((e) => (e.tagName + '.' + e.className + ':' + (e.textContent || '').trim().slice(0, 24) + '=' + Math.round(e.getBoundingClientRect().height)))`);
    check(g, `${label}: every interactive P6 target is at least 44px tall on a phone`, small.length === 0, small.join(" | "));
  }
  const clipped = await ev(`[...document.querySelectorAll('select.nq-tone-select')].filter((s) => s.getClientRects().length).map((s) => { const cs = getComputedStyle(s); const span = document.createElement('span'); span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + cs.font; span.textContent = 'Professional'; document.body.appendChild(span); const need = span.getBoundingClientRect().width; span.remove(); const avail = s.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); return avail >= need ? null : 'need ' + need.toFixed(1) + ' have ' + avail.toFixed(1); }).filter(Boolean)`);
  const selects = await ev(`document.querySelectorAll('select.nq-tone-select').length`);
  if (selects) check(g, `${label}: the tone select shows "Professional" in full`, clipped.length === 0, clipped.join(","));
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
const goQueue = async () => {
  await clickBy(viewport.mobile ? ".mobile-nav button" : ".app-nav .nav-link", viewport.mobile ? "Nudges" : "Nudge queue");
  await waitFor("Boolean(document.querySelector('#nq-title'))");
  await waitFor("!document.querySelector('[aria-label=\"Loading nudges\"]')");
};
const tab = async (label) => {
  await clickBy("[role=tab]", label);
  await waitFor("!document.querySelector('[aria-label=\"Loading nudges\"]')");
  await sleep(150);
};
const tabSelected = (v) => ev(`document.querySelector('#nq-tab-${v}')?.getAttribute('aria-selected') === 'true'`);
const ask = async (text) => {
  await setValue(".chat-form input", text);
  await clickBy(".chat-form button[type=submit]");
};
const reviewActionsUnoccluded = () =>
  ev(`(() => {
    const btns = [...document.querySelectorAll('.nq-review .nq-actions button')].filter((b) => b.getClientRects().length);
    if (btns.length < 3) return 'expected >=3 review action buttons, got ' + btns.length;
    for (const b of btns) {
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || (!b.contains(hit) && hit !== b)) return b.textContent.trim() + ' occluded by ' + (hit ? hit.tagName + '.' + hit.className : 'null');
    }
    return 'ok';
  })()`);

try {
  await setView(DESKTOP);
  await setTheme("light");

  // Seed two initial pending drafts so the queue starts with real rows.
  const rN = await gen("Northwind Studio", "professional");
  const rB = await gen("Bluebird Bakery", "firm");
  if (rN.status !== 201 || rB.status !== 201) throw new Error("seed drafts failed " + rN.status + "/" + rB.status);

  await login();
  await goQueue();
  await waitFor("document.querySelector('[data-testid=count-pending]')?.textContent === '2'");

  /* ===== S1: Desktop light — "Draft a nudge" on mounted queue -> draft -> "Open in queue" ===== */
  {
    const g = "desktop-open-in-queue";
    await tab("History");
    check(g, "operator starts on the mounted queue's History tab", await tabSelected("history"));
    await clickBy("section[aria-labelledby=nq-title] .page-head button", "Draft a nudge");
    await waitFor("Boolean(document.querySelector('.nudgey-panel .chat-form input'))");
    check(g, "'Draft a nudge' on the queue opens Nudgey chat with the editable prefill", (await ev("document.querySelector('.chat-form input').value")) === "draft a professional nudge for ");

    await ask("draft a friendly nudge for zorblax industries");
    await waitText("I found 1 matching invoice");
    await clickBy(".nq-chat button", "Draft friendly nudge");
    await waitText("Draft ready for review", 15000);

    await clickBy(".nq-chat button", "Open in queue");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Zorblax Industries'", 15000, "queue re-targeted to Zorblax Industries");
    check(g, "clicking 'Open in queue' CLOSED the Nudgey popover (.nudgey-panel is absent)", !(await ev("Boolean(document.querySelector('.nudgey-panel'))")));
    check(g, "keyboard focus moved to the queue heading (#nq-title)", (await ev("document.activeElement?.id")) === "nq-title");
    check(g, "the mounted queue switched from History to Pending review and selected Zorblax Industries", (await tabSelected("pending")) && !(await tabSelected("history")));
    const unoccluded1 = await reviewActionsUnoccluded();
    check(g, "Approve, Save edits, Regenerate and Reject buttons are completely unoccluded", unoccluded1 === "ok", unoccluded1);
    await pageChecks("desktop light queue after Open in queue");
    await shot("fix2-01-after-open-in-queue");
  }

  /* ===== S2: Consecutive same-screen flow WITHOUT page reload -> pending-exists -> "Open existing in queue" ===== */
  {
    const g = "desktop-open-existing";
    await tab("Approved");
    check(g, "operator switches to Approved manually without reloading the page", await tabSelected("approved"));
    await clickBy("section[aria-labelledby=nq-title] .page-head button", "Draft a nudge");
    await waitFor("Boolean(document.querySelector('.nudgey-panel .chat-form input'))");
    check(g, "reopening Nudgey on the same mounted screen starts a clean chat (previous messages cleared on close)", !(await ev("document.querySelector('.nudgey-panel').innerText.includes('Draft ready for review')")));

    await ask("draft a firm nudge for northwind studio");
    await waitText("I found 1 matching invoice");
    await clickBy(".nq-chat button", "Draft firm nudge");
    await waitText("already has a draft waiting for review", 15000);

    await clickBy(".nq-chat button", "Open existing in queue");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Northwind Studio'", 15000, "queue re-targeted to Northwind Studio");
    check(g, "clicking 'Open existing in queue' CLOSED the Nudgey popover (.nudgey-panel is absent)", !(await ev("Boolean(document.querySelector('.nudgey-panel'))")));
    check(g, "keyboard focus moved to #nq-title again", (await ev("document.activeElement?.id")) === "nq-title");
    check(g, "the mounted queue switched from Approved to Pending review and selected Northwind Studio", await tabSelected("pending"));
    const unoccluded2 = await reviewActionsUnoccluded();
    check(g, "review action buttons remain unoccluded", unoccluded2 === "ok", unoccluded2);
    await shot("fix2-02-after-open-existing");
  }

  /* ===== S3: Desktop dark theme checks ===== */
  {
    await setTheme("dark");
    await ev("document.documentElement.dataset.theme = 'dark'");
    await sleep(150);
    await pageChecks("desktop dark queue");
    await shot("fix2-03-queue");
    await setTheme("light");
    await ev("document.documentElement.dataset.theme = 'light'");
  }

  /* ===== S4: Mobile (390x844) light + dark — "Open in queue" on mounted queue closes full-width Nudgey panel ===== */
  {
    const g = "mobile-open-in-queue";
    await setView(MOBILE);
    await login();
    await goQueue();
    await tab("History");
    check(g, "mobile operator starts on the mounted queue's History tab", await tabSelected("history"));
    await clickBy("section[aria-labelledby=nq-title] .page-head button", "Draft a nudge");
    await waitFor("Boolean(document.querySelector('.nudgey-panel .chat-form input'))");
    await ask("draft a professional nudge for zorblax logistics");
    await waitText("I found 1 matching invoice");
    await clickBy(".nq-chat button", "Draft professional nudge");
    await waitText("Draft ready for review", 15000);

    await clickBy(".nq-chat button", "Open in queue");
    await waitFor("document.querySelector('#nq-review-title')?.textContent === 'Zorblax Logistics'", 15000, "mobile queue re-targeted to Zorblax Logistics");
    check(g, "on 390px mobile, 'Open in queue' CLOSED .nudgey-panel so the queue is visible", !(await ev("Boolean(document.querySelector('.nudgey-panel'))")));
    check(g, "on 390px mobile, keyboard focus moved to #nq-title", (await ev("document.activeElement?.id")) === "nq-title");
    const unoccludedM = await reviewActionsUnoccluded();
    check(g, "on 390px mobile, review action buttons are unoccluded", unoccludedM === "ok", unoccludedM);
    await pageChecks("mobile light queue after Open in queue");
    await shot("fix2-04-after-open-in-queue");

    await setTheme("dark");
    await ev("document.documentElement.dataset.theme = 'dark'");
    await sleep(150);
    await pageChecks("mobile dark queue");
    await shot("fix2-05-queue");
    await setTheme("light");
    await ev("document.documentElement.dataset.theme = 'light'");
    await setView(DESKTOP);
  }

  /* ===== boundaries ===== */
  {
    const g = "boundaries";
    check(g, "no request to any foreign host", foreign.length === 0, foreign.join(","));
    const paths = [...new Set(net.filter((n) => n.path.startsWith("/api/")).map((n) => n.method + " " + n.path.replace(/[0-9a-f-]{36}/g, ":id").split("?")[0]))];
    check(g, "the browser used only read/draft routes: no send, schedule, dispatch, approve, reject or copy call was made", !paths.some((p) => /send|schedul|dispatch|approve|reject|copy/i.test(p)), paths.join(" ; "));
    check(g, "no draft was approved, rejected or edited by navigation (all 4 seeded/drafted rows stay pending_review)", sql("SELECT count(*) FILTER (WHERE status='pending_review') || '/' || count(*) FILTER (WHERE status<>'pending_review') FROM invoice_nudges") === "4/0");
    check(g, "every model input was customer-free", readFileSync(MODEL_LOG, "utf8").split("\n").filter(Boolean).every((l) => !/\d|zorblax|northwind|bluebird|example\.test/i.test(l)));
    const errs = consoleMsgs.filter((m) => !/Failed to load resource: the server responded with a status of (4\d\d|500)/.test(m));
    check(g, "no uncaught exceptions or console errors", errs.length === 0, errs.slice(0, 5).join(" | "));
  }
} catch (e) {
  check("run", "journey completed", false, (e && e.stack) || String(e));
  try { await shot("zz-failure"); } catch {}
}

const cleanedUpResult = cleanup();
check("cleanup", "PostgreSQL shutdown confirmed (pg_ctl status exit 3) before the disposable cluster directory was deleted", cleanedUpResult.confirmed && cleanedUpResult.removed, JSON.stringify(cleanedUpResult));
info.cleanup = cleanedUpResult.trail;
info.finishedAt = new Date().toISOString();
info.screenshots = shots;
const fails = results.filter((r) => r.result === "FAIL").length;
writeFileSync(
  join(here, "qa-results.json"),
  JSON.stringify(
    {
      task: "NMI-P6-FIX2",
      generatedBy: "design/evidence/NMI-P6-FIX2/run-p6-fix2-journey.mjs",
      info,
      summary: { total: results.length, passed: results.length - fails, failed: fails },
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\n${results.length - fails}/${results.length} checks passed; ${shots.length} screenshots`);
ws.close();
process.exit(fails ? 1 : 0);
