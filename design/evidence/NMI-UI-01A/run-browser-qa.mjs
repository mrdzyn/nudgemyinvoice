/* eslint-disable -- design-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-UI-01A browser QA for design/preview/index.html.
//
// Drives a real (headless) Google Chrome over the DevTools Protocol with real keyboard input,
// captures screenshots and runs scripted accessibility/responsive checks. Zero dependencies.
// Local only: the page is loaded from file:// under a CSP that forbids network access, and this
// script fails if any http(s) request is observed. No PayPal or OpenAI call is possible.
//
//   node design/evidence/NMI-UI-01A/run-browser-qa.mjs
//
// Writes screenshots to ./screenshots and results to ./QA-RESULTS.md and ./qa-results.json.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const PAGE = pathToFileURL(join(root, "design/preview/index.html")).href;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const SHOTS = join(here, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const record = (group, name, pass, detail = "") => {
  results.push({ group, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${group}] ${name}${detail ? " — " + detail : ""}`);
};

/* ----------------------------------------------------------------- chrome + CDP */
const profile = mkdtempSync(join(tmpdir(), "nmi-qa-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "about:blank",
  ],
  { stdio: "ignore" },
);
async function waitForChrome() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome did not start");
}
const version = await waitForChrome();
const targetInfo = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let nextId = 1;
const pending = new Map();
const consoleErrors = [];
const httpRequests = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  } else if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push("exception: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push("console.error: " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    consoleErrors.push("log: " + msg.params.entry.text + " " + (msg.params.entry.url || ""));
  } else if (msg.method === "Network.requestWillBeSent") {
    const u = msg.params.request.url;
    if (/^https?:/i.test(u)) httpRequests.push(u);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");

const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + "\n" + expression.slice(0, 200));
  return r.result.value;
};
async function viewport(w, h, mobile = false, dpr = 1) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
}
async function load(hash = "") {
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: PAGE + hash });
  for (let i = 0; i < 60; i++) {
    if ((await ev("document.readyState")) === "complete" && (await ev("!!window.__NMI_PREVIEW__"))) break;
    await sleep(50);
  }
  await sleep(120);
}
const KEYS = {
  Tab: { code: "Tab", vk: 9 },
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Escape: { code: "Escape", vk: 27 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  Home: { code: "Home", vk: 36 },
  " ": { code: "Space", vk: 32, text: " " },
};
async function press(key, shift = false) {
  const k = KEYS[key];
  const modifiers = shift ? 8 : 0;
  await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers, text: k.text });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers });
  await sleep(40);
}
const type = async (text) => {
  await send("Input.insertText", { text });
  await sleep(40);
};
const active = () =>
  ev(`(() => { const e = document.activeElement; if (!e) return null; const n = e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent.trim()) || e.textContent.trim().slice(0, 40) || e.placeholder || ''; return { tag: e.tagName.toLowerCase(), id: e.id, name: n.replace(/\\s+/g, ' ').slice(0, 60) }; })()`);
const matches = (sel) => ev(`!!(document.activeElement && document.activeElement.matches(${JSON.stringify(sel)}))`);
/** Press Tab until the focused element matches `sel`; returns the number of presses, or -1. */
async function tabTo(sel, max = 80) {
  for (let i = 1; i <= max; i++) {
    await press("Tab");
    if (await matches(sel)) return i;
  }
  return -1;
}
async function waitFor(expr, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ev(expr)) return true;
    await sleep(60);
  }
  return false;
}
async function shot(rel, h = null) {
  const file = join(SHOTS, rel);
  mkdirSync(dirname(file), { recursive: true });
  const height = h ?? (await ev("Math.ceil(Math.max(document.documentElement.scrollHeight, 400))"));
  const width = await ev("window.innerWidth");
  const mobile = width < 768;
  await viewport(width, Math.min(height, 7000), mobile);
  await sleep(120);
  const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
  writeFileSync(file, Buffer.from(data, "base64"));
}

/* ----------------------------------------------------------------- in-page scans */
const CONTRAST_SCAN = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base); return base; };
  const out = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode; const txt = n.textContent.trim(); if (!txt) continue;
    const el = n.parentElement; if (!el || el.closest('.sr-only, script, style, [hidden], dialog:not([open])')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (el.closest('#review-controls')) continue;
    const fg0 = parse(cs.color); const bg = bgOf(el); if (!fg0 || !bg) continue;
    const fg = blend(fg0, bg);
    const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio + 0.005 < need) { const key = el.tagName + '|' + txt.slice(0, 30); if (!seen.has(key)) { seen.add(key); out.push({ el: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''), text: txt.slice(0, 40), ratio: Math.round(ratio * 100) / 100, need }); } }
  }
  return out;
})()`;
const TARGETS = (min) => `(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=tab]')) {
    if (el.closest('#review-controls, [hidden], dialog:not([open])')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (el.classList.contains('skip-link')) continue;
    if (r.height + 0.5 < ${min} || r.width + 0.5 < ${min}) out.push((el.id || el.tagName.toLowerCase()) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return out;
})()`;
const ORPHAN_ACTIONS = `(() => { const have = Object.keys(window.__NMI_PREVIEW__.actions); const used = new Set([...document.querySelectorAll('[data-action]')].map((e) => e.dataset.action)); return [...used].filter((a) => !have.includes(a)); })()`;
const HSCROLL = `({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`;

/* ----------------------------------------------------------------- screenshots */
rmSync(SHOTS, { recursive: true, force: true });
const SCREENS = ["login", "dashboard", "composer", "review", "detail"];
const THEMES = ["light", "dark"];
const VIEWPORTS = [
  { name: "desktop", w: 1280, h: 900, mobile: false },
  { name: "mobile", w: 390, h: 844, mobile: true },
];
const screenshotList = [];
for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const [i, screen] of SCREENS.entries()) {
      await viewport(vp.w, vp.h, vp.mobile);
      const hash = screen === "detail" ? `#screen=detail&state=paypal-created&theme=${theme}` : `#screen=${screen}&theme=${theme}`;
      await load(hash);
      const rel = `${vp.name}/${theme}/${i + 1}-${screen}.jpg`;
      await shot(rel);
      screenshotList.push(rel);
    }
  }
}
await viewport(820, 1100, false);
for (const [i, screen] of SCREENS.entries()) {
  await load(screen === "detail" ? "#screen=detail&state=paypal-created&theme=light" : `#screen=${screen}&theme=light`);
  const rel = `tablet/light/${i + 1}-${screen}.jpg`;
  await shot(rel);
  screenshotList.push(rel);
}
const STATES = [
  "login-error", "login-throttled", "session-expired", "empty", "loading", "list-error", "offline",
  "over-limit", "ai-clarification", "ai-invalid", "ai-unavailable", "validation-errors", "rounding",
  "save-replay", "save-conflict", "paypal-disabled", "paypal-refused", "paypal-creating",
  "paypal-reconciling", "paypal-unknown", "paypal-rejected", "paypal-mismatch", "paypal-created",
];
await viewport(1280, 900, false);
for (const st of STATES) {
  await load(`#state=${st}&theme=light`);
  const rel = `states/desktop-light/${st}.jpg`;
  await shot(rel);
  screenshotList.push(rel);
}
for (const st of ["over-limit", "validation-errors", "paypal-refused", "paypal-disabled", "offline", "ai-clarification", "paypal-unknown"]) {
  await viewport(390, 844, true);
  await load(`#state=${st}&theme=light`);
  const rel = `states/mobile-light/${st}.jpg`;
  await shot(rel);
  screenshotList.push(rel);
}
for (const st of ["validation-errors", "paypal-unknown", "ai-clarification", "loading"]) {
  await viewport(1280, 900, false);
  await load(`#state=${st}&theme=dark`);
  const rel = `states/desktop-dark/${st}.jpg`;
  await shot(rel);
  screenshotList.push(rel);
}
record("Evidence", `captured ${screenshotList.length} screenshots`, screenshotList.length > 0, "see screenshots/");

/* ----------------------------------------------------------------- scans across every screen, state and theme */
await send("Network.enable");
for (const theme of THEMES) {
  const offenders = [];
  const orphans = new Set();
  for (const st of ["default", ...STATES]) {
    for (const screen of st === "default" ? SCREENS : [null]) {
      await viewport(1280, 900, false);
      await load(`#${screen ? `screen=${screen}&` : ""}${st === "default" ? "" : `state=${st}&`}theme=${theme}`);
      if (screen === "detail") await load(`#screen=detail&state=paypal-created&theme=${theme}`);
      for (const o of await ev(CONTRAST_SCAN)) offenders.push(`${screen || st}: ${o.el} "${o.text}" ${o.ratio}:1 (needs ${o.need})`);
      for (const a of await ev(ORPHAN_ACTIONS)) orphans.add(a);
    }
  }
  record("Contrast", `${theme} theme: text contrast across 5 screens and ${STATES.length} states`, offenders.length === 0, offenders.length ? offenders.slice(0, 12).join("; ") : "no text below WCAG AA (4.5:1, or 3:1 for large text)");
  record("Handlers", `${theme} theme: every rendered data-action has a handler`, orphans.size === 0, orphans.size ? [...orphans].join(",") : "none missing");
}

/* ----------------------------------------------------------------- responsive: reflow and target size */
for (const [w, label] of [[390, "390px"], [320, "320px (WCAG 1.4.10 reflow)"]]) {
  const bad = [];
  for (const screen of SCREENS) {
    await viewport(w, 800, true);
    await load(screen === "detail" ? "#screen=detail&state=paypal-created" : `#screen=${screen}`);
    const m = await ev(HSCROLL);
    if (m.sw > m.iw + 1) bad.push(`${screen} scrollWidth ${m.sw} > ${m.iw}`);
  }
  for (const st of ["validation-errors", "ai-clarification", "paypal-refused", "over-limit", "paypal-unknown"]) {
    await viewport(w, 800, true);
    await load(`#state=${st}`);
    const m = await ev(HSCROLL);
    if (m.sw > m.iw + 1) bad.push(`${st} scrollWidth ${m.sw} > ${m.iw}`);
  }
  record("Responsive", `no horizontal page scroll at ${label}`, bad.length === 0, bad.join("; ") || "all screens and sampled states fit");
}
{
  const small = [];
  for (const screen of SCREENS) {
    await viewport(390, 844, true);
    await load(screen === "detail" ? "#screen=detail&state=paypal-created" : `#screen=${screen}`);
    for (const t of await ev(TARGETS(44))) small.push(`${screen}:${t}`);
  }
  record("Responsive", "mobile (390px) interactive targets are at least 44×44 CSS px", small.length === 0, small.slice(0, 10).join("; ") || "all targets ≥ 44px");
  const small24 = [];
  for (const screen of SCREENS) {
    await viewport(1280, 900, false);
    await load(screen === "detail" ? "#screen=detail&state=paypal-created" : `#screen=${screen}`);
    for (const t of await ev(TARGETS(24))) small24.push(`${screen}:${t}`);
  }
  record("Responsive", "desktop targets meet WCAG 2.2 AA 2.5.8 minimum (24×24 CSS px)", small24.length === 0, small24.slice(0, 10).join("; ") || "all targets ≥ 24px");
}
{
  await viewport(1280, 900, false);
  await load("#screen=dashboard");
  const vis = await ev(`(() => ({ nav: !document.getElementById('app-nav').hidden && getComputedStyle(document.getElementById('app-nav')).display !== 'none', mob: getComputedStyle(document.getElementById('mobile-nav')).display }))()`);
  record("Responsive", "desktop shows top navigation and hides the mobile bottom bar", vis.nav && vis.mob === "none");
  await viewport(390, 844, true);
  await load("#screen=dashboard");
  const vis2 = await ev(`(() => ({ nav: getComputedStyle(document.getElementById('app-nav')).display, mob: getComputedStyle(document.getElementById('mobile-nav')).display, tableHead: getComputedStyle(document.querySelector('table.data thead')).position }))()`);
  record("Responsive", "mobile hides top navigation, shows bottom bar and stacks table rows as cards", vis2.nav === "none" && vis2.mob === "flex" && vis2.tableHead === "absolute", JSON.stringify(vis2));
}

/* ----------------------------------------------------------------- keyboard-only end-to-end flow (desktop) */
await viewport(1280, 900, false);
await load("");
{
  const G = "Keyboard flow";
  const first = [];
  await press("Tab");
  first.push(await active());
  record(G, "first Tab stop is the 'Skip to main content' link", first[0]?.name === "Skip to main content", JSON.stringify(first[0]));
  await press("Enter");
  record(G, "activating skip link moves focus to <main>", await matches("#main-content"));
  // login form by keyboard
  record(G, "Tab reaches Username field", (await tabTo("#login-username")) > 0);
  await press("Tab");
  record(G, "Username is followed by Password (empty, no 'remember me' control)", (await matches("#login-password")) && (await ev("document.getElementById('login-password').value === '' && !document.querySelector('#screen-login input[type=checkbox]')")));
  await press("Enter"); // submit empty
  record(G, "submitting an empty form shows labelled errors and focuses the first invalid field", (await ev("document.getElementById('login-username').getAttribute('aria-invalid') === 'true' && !document.getElementById('err-login-username').hidden")) && (await matches("#login-username")));
  await type("operator");
  await press("Tab");
  await type("preview-only-password");
  await press("Enter");
  record(G, "valid username + password continue to the dashboard", await waitFor(`!document.getElementById('screen-dashboard').hidden`));
  record(G, "focus lands on the dashboard heading after navigation", await matches("#dash-title"));
  // dashboard -> composer
  record(G, "Tab reaches 'New invoice' button in page header", (await tabTo("#screen-dashboard [data-screen=composer]")) > 0);
  await press("Enter");
  record(G, "Enter opens the composer", await waitFor(`!document.getElementById('screen-composer').hidden`));
  const tabs = await tabTo("[role=tab][aria-selected=true]");
  await press("ArrowRight");
  record(G, "ArrowRight on tablist switches to the Manual tab and shows its panel", (await ev("document.getElementById('tab-manual').getAttribute('aria-selected') === 'true' && !document.getElementById('panel-manual').hidden && document.getElementById('panel-ai').hidden")) && tabs > 0);
  await press("Home");
  record(G, "Home on tablist returns to the AI tab", await ev("document.getElementById('tab-ai').getAttribute('aria-selected') === 'true'"));
  record(G, "Tab reaches the first synthetic example prompt", (await tabTo("[data-action=chip][data-id=usd-draft]")) > 0);
  await press(" ");
  record(G, "Space activates the example prompt and fills the textarea", await ev("document.getElementById('comp-text').value.startsWith('Invoice Acme Design')"));
  record(G, "character counter reflects the text (n / 2,000)", await ev("/^\\d+ \\/ 2,000$/.test(document.getElementById('comp-counter').textContent)"), await ev("document.getElementById('comp-counter').textContent"));
  record(G, "Tab reaches 'Parse with AI'", (await tabTo("#parse-btn")) > 0);
  await press("Enter");
  record(G, "parsing shows a loading state (textarea aria-busy, button announces progress)", await waitFor(`document.getElementById('comp-text').getAttribute('aria-busy') === 'true' && /Analyzing/.test(document.getElementById('parse-btn').textContent)`, 800));
  record(G, "parse result opens the review screen with focus on its heading", (await waitFor(`!document.getElementById('screen-review').hidden`, 3000)) && (await matches("#rev-title")));
  record(G, "review form is filled from the fixture proposal", await ev("document.getElementById('f-customerName').value === 'Acme Design LLC' && document.getElementById('f-customerEmail').value === 'billing@acme.example'"));
  record(G, "estimated total shown and labelled as an estimate (not 'verified')", await ev("/\\$702\\.00/.test(document.getElementById('totals-body').textContent) && /Estimated total/.test(document.getElementById('totals-body').textContent) && !/verified/i.test(document.getElementById('screen-review').textContent)"));
  // edit a unit price by keyboard
  record(G, "Tab reaches first line's unit price", (await tabTo("#f-line-0-unitPrice")) > 0);
  await ev("document.activeElement.select()");
  await type("300.00");
  record(G, "editing unit price recalculates the estimate live ($810.00)", await waitFor(`/\\$810\\.00/.test(document.getElementById('totals-body').textContent)`, 1000), await ev("document.getElementById('totals-body').textContent.replace(/\\s+/g,' ')"));
  // save by keyboard
  record(G, "Tab reaches 'Save local draft'", (await tabTo("#save-btn")) > 0);
  await press("Enter");
  record(G, "save shows a busy state, disables inputs and announces progress", await waitFor(`document.getElementById('save-btn').getAttribute('aria-disabled') === 'true' && /Saving/.test(document.getElementById('save-btn').textContent) && document.getElementById('f-customerName').disabled`, 600));
  record(G, "after save the detail screen opens with focus on the customer heading", (await waitFor(`!document.getElementById('screen-detail').hidden && !!document.getElementById('create-pp-btn')`, 3000)) && (await matches("#det-title")));
  record(G, "detail shows 'Local draft saved … Nothing has been sent to PayPal' and PayPal 'Not created'", await ev("/Nothing has been sent to PayPal/.test(document.getElementById('det-body').textContent) && /Not created in PayPal Sandbox/.test(document.getElementById('pp-body').textContent)"));
  record(G, "detail totals are labelled server-computed and recomputed ($810.00)", await ev("/Server-computed/.test(document.getElementById('det-body').textContent) && /\\$810\\.00/.test(document.getElementById('det-body').textContent)"));
  // PayPal dialog
  record(G, "Tab reaches 'Create PayPal Sandbox draft…'", (await tabTo("#create-pp-btn")) > 0);
  await press("Enter");
  record(G, "confirmation dialog opens modally with initial focus on Cancel", (await waitFor(`document.getElementById('dlg').open`, 800)) && (await matches("#dlg-cancel")));
  const trapped = [];
  for (let i = 0; i < 4; i++) {
    await press("Tab");
    trapped.push(await ev("document.getElementById('dlg').contains(document.activeElement)"));
  }
  record(G, "focus is trapped inside the dialog over 4 Tab presses", trapped.every(Boolean));
  await press("Escape");
  record(G, "Escape closes the dialog and returns focus to the opener", (await ev("!document.getElementById('dlg').open")) && (await matches("#create-pp-btn")));
  await press("Enter");
  await waitFor(`document.getElementById('dlg').open`, 800);
  await press("Tab"); // Cancel -> Create draft
  record(G, "Tab moves from Cancel to the confirm button", await matches("#dlg-ok"));
  await press("Enter");
  record(G, "confirming shows an in-progress state", await waitFor(`/Creating the PayPal Sandbox draft/.test(document.getElementById('pp-body').textContent)`, 800));
  record(G, "PayPal draft created with a clearly fabricated id and a 'customer not emailed' notice", (await waitFor(`/PayPal draft created/.test(document.getElementById('pp-body').textContent)`, 3000)) && (await ev("/INV2-DEMO-FAKE-\\d{4}-\\d{4}/.test(document.getElementById('pp-body').textContent) && /has not been emailed/.test(document.getElementById('pp-body').textContent)")));
  record(G, "flow ended with no page-level keyboard trap (Shift+Tab moves backwards)", await (async () => { const a = await active(); await press("Tab", true); const b = await active(); return JSON.stringify(a) !== JSON.stringify(b); })());
}

/* ----------------------------------------------------------------- validation, limits and interactions */
{
  const G = "Interactions";
  await load("#screen=composer");
  // 2,000 limit
  await ev("document.getElementById('comp-text').focus()");
  await type("x".repeat(2100));
  record(G, "over-limit text: counter shows 2,100 / 2,000 and the overage", await ev("document.getElementById('comp-counter').textContent.includes('2,100 / 2,000') && document.getElementById('comp-counter').textContent.includes('100 over')"), await ev("document.getElementById('comp-counter').textContent"));
  record(G, "over-limit text: textarea is aria-invalid with a visible alert message", await ev("document.getElementById('comp-text').getAttribute('aria-invalid') === 'true' && !document.getElementById('comp-error').hidden && document.getElementById('comp-error').getAttribute('role') === 'alert'"));
  record(G, "over-limit text: Parse is aria-disabled", await ev("document.getElementById('parse-btn').getAttribute('aria-disabled') === 'true'"));
  await ev("document.getElementById('parse-btn').click()");
  await sleep(150);
  record(G, "over-limit text: activating Parse does not start parsing", await ev("document.getElementById('comp-text').getAttribute('aria-busy') !== 'true'"));
  await ev("(() => { const t = document.getElementById('comp-text'); t.value = 'x'.repeat(2000); t.dispatchEvent(new Event('input', { bubbles: true })); })()");
  record(G, "exactly 2,000 characters is accepted (no error, Parse enabled)", await ev("document.getElementById('comp-error').hidden && document.getElementById('parse-btn').getAttribute('aria-disabled') !== 'true' && document.getElementById('comp-counter').textContent === '2,000 / 2,000'"));
  await ev("(() => { const t = document.getElementById('comp-text'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await ev("document.getElementById('parse-btn').click()");
  await sleep(100);
  record(G, "empty text: Parse shows a required-field message and focuses the textarea", await ev("!document.getElementById('comp-error').hidden && document.activeElement.id === 'comp-text' && /Enter a description/.test(document.getElementById('comp-error').textContent)"));
  // unrecognised text -> invalid outcome
  await ev("(() => { const t = document.getElementById('comp-text'); t.value = 'something else'; t.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await ev("document.getElementById('parse-btn').click()");
  record(G, "unrecognised text returns the 'could not read' outcome with manual-entry escape", (await waitFor(`/could not turn this text into an invoice/.test(document.getElementById('comp-banner').textContent)`, 2500)) && (await ev("!!document.querySelector('#comp-banner [data-action=manual-form]')")));
  // clarification
  await load("#screen=composer");
  await ev("document.querySelector('[data-action=chip][data-id=eur-clarify]').click()");
  await ev("document.getElementById('parse-btn').click()");
  record(G, "ambiguous request shows clarification questions", await waitFor(`!!document.getElementById('clar-box') && document.querySelectorAll('#clar-box input').length === 2`, 2500));
  await ev("document.querySelector('[data-action=clar-submit]').click()");
  record(G, "submitting blank clarification answers shows an alert and flags the field", await ev("!document.getElementById('clar-err').hidden && document.getElementById('clar-0').getAttribute('aria-invalid') === 'true'"));
  await ev("document.getElementById('clar-0').focus()");
  await type("rechnung@beispiel.example");
  await press("Tab");
  await type("2026-11-30");
  await ev("document.querySelector('[data-action=clar-submit]').click()");
  record(G, "answered clarification re-parses into a review with the rounding notice", (await waitFor(`!document.getElementById('screen-review').hidden`, 3000)) && (await ev("/Rounding applied/.test(document.getElementById('totals-body').textContent) && /would be refused/.test(document.getElementById('paypal-hint').textContent)")), await ev("document.getElementById('totals-body').textContent.replace(/\\s+/g,' ').slice(0,160)"));
  // manual form + validation + currency + lines
  await load("#screen=composer");
  await ev("document.getElementById('tab-manual').click()");
  await ev("document.querySelector('[data-action=manual-form]').click()");
  await waitFor(`!document.getElementById('screen-review').hidden`, 1000);
  record(G, "manual entry opens a blank review form (customer email field present and required)", await ev("document.getElementById('f-customerEmail').required && document.getElementById('f-customerName').value === '' && !document.getElementById('f-invoiceNumber') && !document.getElementById('f-issueDate') && !document.getElementById('f-reference')"));
  record(G, "form exposes only schema-backed fields (no invoice number, issue date or PO reference)", await ev("['f-customerName','f-customerEmail','f-currency','f-dueDate','f-taxPercent','f-discountKind','f-discountValue'].every((i) => document.getElementById(i)) && !/Invoice number|Issue date|\\bPO\\b|PO reference/.test(document.getElementById('screen-review').textContent)"));
  await ev("document.getElementById('save-btn').click()");
  await sleep(150);
  record(G, "saving a blank form lists errors, focuses the summary and marks fields invalid", await ev("!document.getElementById('err-summary').hidden && document.activeElement.id === 'err-summary' && document.getElementById('f-customerName').getAttribute('aria-invalid') === 'true' && document.getElementById('f-customerEmail').getAttribute('aria-invalid') === 'true'"), await ev("document.getElementById('err-summary').querySelectorAll('li').length + ' errors'"));
  record(G, "error text is programmatically associated (aria-describedby → visible message)", await ev("(() => { const i = document.getElementById('f-customerName'); const id = i.getAttribute('aria-describedby'); return !!id && !document.getElementById(id).hidden && document.getElementById(id).textContent.length > 0; })()"));
  await ev("document.getElementById('f-customerName').focus()");
  await type("Test Customer");
  record(G, "fixing a field clears its error live", await ev("document.getElementById('err-customerName').hidden && document.getElementById('f-customerName').getAttribute('aria-invalid') !== 'true'"));
  await ev("(() => { const s = document.getElementById('f-currency'); s.value = 'JPY'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  record(G, "JPY currency: unit price placeholder has no decimals", await ev("document.getElementById('f-line-0-unitPrice').placeholder === '0'"));
  await ev("document.getElementById('f-line-0-unitPrice').focus()");
  await type("85.50");
  await ev("document.getElementById('save-btn').click()");
  await sleep(100);
  record(G, "JPY amount with decimals is rejected with an explanatory message", await ev("/JPY amounts have no decimal places/.test(document.getElementById('err-line-0-unitPrice').textContent)"));
  await ev("document.getElementById('add-line-btn').click()");
  record(G, "Add line item adds a row and moves focus to its description", (await ev("document.querySelectorAll('#lines .line-row').length === 2")) && (await matches("#f-line-1-description")));
  await ev("document.querySelector('[data-action=remove-line][data-i=\"1\"]').click()");
  record(G, "Remove line deletes the row; the last row cannot be removed", (await ev("document.querySelectorAll('#lines .line-row').length === 1")) && (await ev("document.querySelector('[data-action=remove-line]').disabled")));
  await ev("(() => { const s = document.getElementById('f-discountKind'); s.value = 'percent'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await ev("document.getElementById('f-discountValue').focus()");
  await type("150");
  record(G, "percent discount above 100 is rejected", await ev("/between 0 and 100/.test(document.getElementById('err-discountValue').textContent)"));
  // discard dialog
  await ev("document.querySelector('[data-action=discard]').click()");
  record(G, "Discard asks for confirmation in a modal dialog", await waitFor(`document.getElementById('dlg').open && /Discard this invoice/.test(document.getElementById('dlg-title').textContent)`, 800));
  await press("Escape");
  record(G, "cancelling Discard keeps the form", await ev("!document.getElementById('dlg').open && !document.getElementById('screen-review').hidden"));
  // idempotency states
  await load("#state=save-replay");
  await ev("document.getElementById('save-btn').click()");
  record(G, "duplicate save (replayed) shows the existing draft with an explanatory notice", (await waitFor(`!document.getElementById('screen-detail').hidden && /Duplicate save detected/.test(document.getElementById('det-body').textContent)`, 3000)) && (await ev("/replayed: true/.test(document.getElementById('det-body').textContent)")));
  await load("#state=save-conflict");
  await ev("document.getElementById('save-btn').click()");
  record(G, "idempotency conflict (409) shows an alert and an option to use a new key", (await waitFor(`!!document.querySelector('#save-msg [role=alert]')`, 3000)) && (await ev("!!document.querySelector('#save-msg [data-action=new-key]') && !document.getElementById('screen-review').hidden")));
  // dashboard
  await load("#screen=dashboard");
  record(G, "dashboard shows one total per currency and never a mixed total", await ev("(() => { const cards = [...document.querySelectorAll('.currency-card')]; return cards.length === 4 && cards.every((c) => /^(USD|EUR|GBP|JPY)/.test(c.textContent.trim())) && /never added together or converted/.test(document.getElementById('dash-body').textContent); })()"));
  record(G, "dashboard names the missing list endpoint and labels rows as synthetic fixtures", await ev("/GET \\/api\\/invoice-drafts<\\/code> is not implemented|is not implemented/.test(document.getElementById('screen-dashboard').textContent) && /fabricated/.test(document.getElementById('screen-dashboard').textContent)"));
  record(G, "dashboard has no Delete or Updated-at columns and no invoice-number column", await ev("!/Delete|Updated/i.test(document.getElementById('dash-table').textContent) && !/Invoice #/.test(document.getElementById('dash-table').textContent)"));
  record(G, "AG Studio is described as not enabled / unverified, not as an active trial", await ev("(() => { const t = document.getElementById('screen-dashboard').textContent; return /not enabled/.test(t) && /unconfirmed/.test(t) && !/active trial|through Dec/i.test(t); })()"));
  await ev("document.querySelector('[data-action=filter-cur][data-cur=JPY]').click()");
  record(G, "currency filter narrows the table to JPY", await ev("document.querySelectorAll('#dash-table tbody tr').length === 1 && /Sakura/.test(document.getElementById('dash-table').textContent)"));
  await ev("(() => { const s = document.getElementById('dash-search'); s.value = 'zzz'; s.dispatchEvent(new Event('input', { bubbles: true })); })()");
  record(G, "no-match search shows a recoverable empty message", await ev("/No drafts match/.test(document.getElementById('dash-table').textContent) && !!document.querySelector('[data-action=clear-filters]')"));
  await ev("document.querySelector('[data-action=clear-filters]').click()");
  record(G, "Clear filters restores all drafts", await ev("document.querySelectorAll('#dash-table tbody tr').length === 4"));
  // paypal states
  await load("#state=paypal-disabled");
  record(G, "PayPal disabled (503): create button is disabled and described by the explanation", await ev("(() => { const b = document.getElementById('create-pp-btn'); return b.disabled && b.getAttribute('aria-describedby') === 'pp-disabled' && /paypal_disabled/.test(document.getElementById('pp-disabled').textContent); })()"));
  await load("#state=paypal-refused");
  record(G, "mapping refusal (422) explains the rule and offers a way forward, with no PayPal call implied", await ev("/mapping_refused/.test(document.getElementById('pp-body').textContent) && /Refused before contacting PayPal/.test(document.getElementById('pp-body').textContent)"));
  await load("#state=paypal-unknown");
  record(G, "unknown outcome (502) says retry reconciles first and never claims a draft exists", await ev("/checks PayPal first/.test(document.getElementById('pp-body').textContent) && /may or may not exist/.test(document.getElementById('pp-body').textContent)"));
  await load("#state=paypal-mismatch");
  record(G, "remote mismatch offers no retry control", await ev("!document.querySelector('#pp-body button')"));
  // offline
  await load("#state=offline");
  record(G, "offline state shows an alert banner and disables creating actions", await ev("!document.getElementById('offline-banner').hidden && document.getElementById('offline-banner').getAttribute('role') === 'alert'"));
  // privacy disclosure and sandbox identity
  await load("#screen=composer");
  record(G, "privacy note says text may be sent to OpenAI, results need review, real provider parsing NOT TESTED", await ev("(() => { const t = document.getElementById('privacy-note').textContent; return /may be sent to OpenAI/.test(t) && /review every field/.test(t) && /NOT TESTED/.test(t) && !/securely|Safe Processing/i.test(t); })()"));
  for (const s of SCREENS) {
    await load(s === "detail" ? "#screen=detail" : `#screen=${s}`);
    const ok = await ev("(() => { const b = document.querySelector('.sandbox-banner'); return !!b && getComputedStyle(b).display !== 'none' && /PayPal Sandbox only/.test(b.textContent) && /does not email/.test(b.textContent); })()");
    if (!ok) record(G, `${s}: persistent PayPal Sandbox banner present`, false);
  }
  record(G, "persistent PayPal Sandbox banner present on all 5 screens", !results.some((r) => r.group === G && /persistent PayPal Sandbox banner present$/.test(r.name) && !r.pass));
  // login has no prefilled password, no remember-me
  await load("#screen=login");
  record(G, "login: username + password both required, password empty, autocomplete tokens correct, no 'remember me'", await ev("(() => { const u = document.getElementById('login-username'), p = document.getElementById('login-password'); return u.required && p.required && p.value === '' && u.autocomplete === 'username' && p.autocomplete === 'current-password' && !document.querySelector('#screen-login input[type=checkbox]') && !/remember|maintain active session/i.test(document.getElementById('screen-login').textContent); })()"));
  await load("#state=login-error");
  record(G, "login failure (401) shows a generic alert message", await ev("(() => { const n = document.querySelector('#login-notice [role=alert]'); return !!n && /incorrect/.test(n.textContent) && /same message/.test(n.textContent); })()"));
  // reduced motion
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await load("#state=loading");
  record(G, "prefers-reduced-motion removes the skeleton animation", (await ev("getComputedStyle(document.querySelector('.skeleton')).animationName")) === "none");
  await send("Emulation.setEmulatedMedia", { features: [] });
  // theme toggle
  await load("#screen=dashboard&theme=light");
  await ev("document.getElementById('theme-btn').click()");
  record(G, "theme toggle switches to dark and updates aria-pressed", await ev("document.documentElement.dataset.theme === 'dark' && document.getElementById('theme-btn').getAttribute('aria-pressed') === 'true'"));
}

/* ----------------------------------------------------------------- focus visibility + focus order sample */
{
  const G = "Focus visibility";
  const rows = [];
  for (const theme of THEMES) {
    for (const screen of ["dashboard", "review"]) {
      await viewport(1280, 900, false);
      await load(`#screen=${screen}&theme=${theme}`);
      const bad = [];
      let n = 0;
      for (let i = 0; i < 40; i++) {
        await press("Tab");
        const r = await ev(`(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { id: e.id || e.tagName.toLowerCase(), style: cs.outlineStyle, w: parseFloat(cs.outlineWidth) }; })()`);
        if (!r) continue;
        n++;
        if (r.style === "none" || r.w < 2) bad.push(r.id);
      }
      rows.push(`${theme}/${screen}: ${n} stops, ${bad.length} without ≥2px outline${bad.length ? " (" + bad.slice(0, 5).join(",") + ")" : ""}`);
      record(G, `${theme} ${screen}: every sampled Tab stop shows a ≥2px focus outline`, bad.length === 0, `${n} stops checked${bad.length ? "; missing on " + bad.slice(0, 6).join(",") : ""}`);
    }
  }
}

/* ----------------------------------------------------------------- network + console */
record("Safety", "no http(s) request was made during the entire run (CSP + local file only)", httpRequests.length === 0, httpRequests.length ? httpRequests.slice(0, 3).join(", ") : "0 requests");
record("Safety", "no JavaScript exceptions or console errors during the run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "0 errors");

/* ----------------------------------------------------------------- report */
const pass = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
const sizeKB = (() => {
  let total = 0;
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      statSync(p).isDirectory() ? walk(p) : (total += statSync(p).size);
    }
  };
  walk(SHOTS);
  return Math.round(total / 1024);
})();
const groups = [...new Set(results.map((r) => r.group))];
let md = `# NMI-UI-01A browser QA results\n\n`;
md += `- **Preview:** \`design/preview/index.html\` loaded from \`file://\` (no server, CSP \`default-src 'none'\`).\n`;
md += `- **Browser:** ${version.Browser} (headless), driven over the DevTools Protocol by \`run-browser-qa.mjs\` using real keyboard events.\n`;
md += `- **Result:** ${pass} of ${results.length} checks passed${failed.length ? `, **${failed.length} failed**` : ""}.\n`;
md += `- **Screenshots:** ${screenshotList.length} JPEG files (${sizeKB} KB) under \`design/evidence/NMI-UI-01A/screenshots/\`.\n`;
md += `- **Not covered:** a screen-reader pass (VoiceOver/NVDA), real touch hardware, Safari/Firefox, and 400% browser zoom (320px reflow is checked instead). These remain manual QA for the owner.\n\n`;
for (const g of groups) {
  md += `## ${g}\n\n| Result | Check | Detail |\n| --- | --- | --- |\n`;
  for (const r of results.filter((x) => x.group === g)) md += `| ${r.pass ? "PASS" : "**FAIL**"} | ${r.name.replace(/\|/g, "\\|")} | ${String(r.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")} |\n`;
  md += "\n";
}
md += `## Screenshot index\n\n`;
for (const dir of ["desktop/light", "desktop/dark", "mobile/light", "mobile/dark", "tablet/light", "states/desktop-light", "states/mobile-light", "states/desktop-dark"]) {
  md += `**${dir}**: ${screenshotList.filter((s) => s.startsWith(dir + "/")).map((s) => `[${s.split("/").pop().replace(".jpg", "")}](screenshots/${s})`).join(" · ")}\n\n`;
}
writeFileSync(join(here, "QA-RESULTS.md"), md);
writeFileSync(join(here, "qa-results.json"), JSON.stringify({ browser: version.Browser, results }, null, 2) + "\n");

ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
