/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-UI-01B browser QA for the React shell in apps/web.
//
// Builds nothing itself: run `pnpm --filter @nmi/web build` first. It serves apps/web/dist with
// `vite preview` on 127.0.0.1 and drives a real (headless) Google Chrome over the DevTools Protocol
// with real keyboard events. The built page carries a CSP with connect-src 'none'. The run FAILS if
// any request leaves http://127.0.0.1:4173, if any storage/cookie is written, or if the URL ever
// carries invoice content. No PayPal or OpenAI call is possible.
//
//   pnpm --filter @nmi/web build && node design/evidence/NMI-UI-01B/run-browser-qa.mjs
//
// Writes ./screenshots, ./comparison, ./QA-RESULTS.md and ./qa-results.json.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const ORIGIN = "http://127.0.0.1:4173";
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9334;
const SHOTS = join(here, "screenshots");
const COMPARE = join(here, "comparison");
const APPROVED = join(root, "design/evidence/NMI-UI-01A/screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const record = (group, name, pass, detail = "") => {
  results.push({ group, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${group}] ${name}${detail ? " — " + detail : ""}`);
};

if (!existsSync(join(root, "apps/web/dist/index.html"))) throw new Error("Run `pnpm --filter @nmi/web build` first");

/* ----------------------------------------------------------------- servers */
const preview = spawn("pnpm", ["--filter", "@nmi/web", "exec", "vite", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { cwd: root, stdio: "ignore" });
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(ORIGIN + "/")).ok) break;
  } catch {}
  await sleep(150);
}
const profile = mkdtempSync(join(tmpdir(), "nmi-qa-01b-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"],
  { stdio: "ignore" },
);
let version;
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) {
      version = await r.json();
      break;
    }
  } catch {}
  await sleep(150);
}
if (!version) throw new Error("Chrome did not start");
const targetInfo = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let nextId = 1;
const pending = new Map();
const consoleErrors = [];
const foreignRequests = [];
let appRequests = 0;
let phase = "app"; // "tools" while the page is about:blank doing image work
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
    if (u.startsWith(ORIGIN + "/")) appRequests++;
    else if (!/^(about:|data:|blob:)/.test(u)) foreignRequests.push(u);
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
  if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + "\n" + expression.slice(0, 240));
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
  await sleep(150);
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
  await sleep(50);
}
const type = async (text) => {
  await send("Input.insertText", { text });
  await sleep(60);
};
/** Replace a React-controlled input's value the way a paste would (used for very long text only). */
const paste = (sel, value) =>
  ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.focus(); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const select = (sel, value) =>
  ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const clickText = (scope, text) =>
  ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) throw new Error('no button: ' + ${JSON.stringify(text)}); b.click(); })()`);
const active = () =>
  ev(`(() => { const e = document.activeElement; if (!e) return null; const n = e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent.trim()) || e.textContent.trim().slice(0, 40) || e.placeholder || ''; return { tag: e.tagName.toLowerCase(), id: e.id, name: n.replace(/\\s+/g, ' ').slice(0, 60) }; })()`);
const matches = (sel) => ev(`!!(document.activeElement && document.activeElement.matches(${JSON.stringify(sel)}))`);
async function tabTo(sel, max = 90) {
  for (let i = 1; i <= max; i++) {
    await press("Tab");
    if (await matches(sel)) return i;
  }
  return -1;
}
async function waitFor(expr, ms = 3500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ev(expr)) return true;
    await sleep(60);
  }
  return false;
}
const text = (sel) => ev(`(document.querySelector(${JSON.stringify(sel)}) || { textContent: '' }).textContent.replace(/\\s+/g, ' ')`);
const shots = [];
async function shot(rel) {
  const file = join(SHOTS, rel);
  mkdirSync(dirname(file), { recursive: true });
  const height = await ev("Math.ceil(Math.max(document.documentElement.scrollHeight, 400))");
  const width = await ev("window.innerWidth");
  await viewport(width, Math.min(height, 7000), width < 768);
  await sleep(150);
  const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
  writeFileSync(file, Buffer.from(data, "base64"));
  shots.push(rel);
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
const TARGETS = (min) => `(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=tab]')) {
    if (el.closest('.review-controls, [hidden], dialog:not([open])')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (el.classList.contains('skip-link')) continue;
    if (r.height + 0.5 < ${min} || r.width + 0.5 < ${min}) out.push((el.id || el.tagName.toLowerCase()) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return out;
})()`;
const HSCROLL = `({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`;
const STORAGE = `(async () => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie, idb: indexedDB.databases ? (await indexedDB.databases()).length : 0, caches: self.caches ? (await caches.keys()).length : 0, sw: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0 }))()`;

/* ----------------------------------------------------------------- screenshots */
rmSync(SHOTS, { recursive: true, force: true });
rmSync(COMPARE, { recursive: true, force: true });
const SCREENS = ["login", "dashboard", "composer", "review", "detail"];
const STATES = [
  "login-error", "login-throttled", "session-expired", "empty", "loading", "list-error", "offline", "over-limit",
  "ai-clarification", "ai-invalid", "ai-unavailable", "validation-errors", "rounding", "save-replay", "save-conflict",
  "paypal-disabled", "paypal-refused", "paypal-creating", "paypal-reconciling", "paypal-unknown", "paypal-rejected",
  "paypal-mismatch", "paypal-created",
];
const hashFor = (screen, theme) => (screen === "detail" ? `#screen=detail&state=paypal-created&theme=${theme}` : `#screen=${screen}&theme=${theme}`);
for (const [name, w, h, mobile] of [["desktop", 1280, 900, false], ["mobile", 390, 844, true]]) {
  for (const theme of ["light", "dark"]) {
    for (const [i, s] of SCREENS.entries()) {
      await viewport(w, h, mobile);
      await load(hashFor(s, theme));
      await shot(`${name}/${theme}/${i + 1}-${s}.jpg`);
    }
  }
}
await viewport(820, 1100);
for (const [i, s] of SCREENS.entries()) {
  await load(hashFor(s, "light"));
  await shot(`tablet/light/${i + 1}-${s}.jpg`);
}
await viewport(1280, 900);
for (const st of STATES) {
  await load(`#state=${st}&theme=light`);
  await shot(`states/desktop-light/${st}.jpg`);
}
for (const st of ["over-limit", "validation-errors", "paypal-refused", "paypal-disabled", "offline", "ai-clarification", "paypal-unknown"]) {
  await viewport(390, 844, true);
  await load(`#state=${st}&theme=light`);
  await shot(`states/mobile-light/${st}.jpg`);
}
for (const st of ["validation-errors", "paypal-unknown", "ai-clarification", "loading"]) {
  await viewport(1280, 900);
  await load(`#state=${st}&theme=dark`);
  await shot(`states/desktop-dark/${st}.jpg`);
}
record("Evidence", `captured ${shots.length} screenshots from the rendered React app`, shots.length >= 55, "see screenshots/");

/* ----------------------------------------------------------------- compare against approved PR #7 evidence */
{
  await send("Page.navigate", { url: "about:blank" });
  phase = "tools";
  const compareFn = `(async (aB64, bB64, W) => {
    const load = (b64) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/jpeg;base64,' + b64; });
    const [a, b] = await Promise.all([load(aB64), load(bB64)]);
    const draw = (img, w) => { const h = Math.round(img.height * w / img.width); const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); return { c, g, h }; };
    const A = draw(a, W), B = draw(b, W);
    const H = Math.min(A.h, B.h, 1400);
    const da = A.g.getImageData(0, 0, W, H).data, db = B.g.getImageData(0, 0, W, H).data;
    let sum = 0, close = 0;
    for (let i = 0; i < da.length; i += 4) { const ga = 0.299 * da[i] + 0.587 * da[i + 1] + 0.114 * da[i + 2]; const gb = 0.299 * db[i] + 0.587 * db[i + 1] + 0.114 * db[i + 2]; const d = Math.abs(ga - gb); sum += d; if (d < 24) close++; }
    const px = W * H;
    const SW = 640; const SA = draw(a, SW), SB = draw(b, SW); const SH = Math.max(SA.h, SB.h);
    const out = document.createElement('canvas'); out.width = SW * 2 + 12; out.height = SH; const og = out.getContext('2d'); og.fillStyle = '#888'; og.fillRect(0, 0, out.width, out.height); og.drawImage(SA.c, 0, 0); og.drawImage(SB.c, SW + 12, 0);
    return { mad: sum / px, same: close / px, hA: a.height, hB: b.height, wA: a.width, wB: b.width, side: out.toDataURL('image/jpeg', 0.65).split(',')[1] };
  })`;
  const pairs = [];
  const walk = (d, base = "") => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      statSync(p).isDirectory() ? walk(p, base + f + "/") : pairs.push(base + f);
    }
  };
  walk(SHOTS);
  const rows = [];
  for (const rel of pairs.sort()) {
    const approved = join(APPROVED, rel);
    if (!existsSync(approved)) continue;
    const a = readFileSync(approved).toString("base64");
    const b = readFileSync(join(SHOTS, rel)).toString("base64");
    const r = await ev(`(${compareFn})(${JSON.stringify(a)}, ${JSON.stringify(b)}, 320)`);
    rows.push({ rel, mad: Math.round(r.mad * 10) / 10, same: Math.round(r.same * 1000) / 10, hA: r.hA, hB: r.hB, wA: r.wA, wB: r.wB });
    if (/^(desktop|mobile)\/light\//.test(rel) || /^states\/desktop-light\/(validation-errors|paypal-refused|paypal-unknown)\./.test(rel)) {
      const out = join(COMPARE, rel);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(r.side, "base64"));
    }
  }
  const widened = rows.filter((r) => r.wA !== r.wB);
  const widthOk = widened.every((r) => r.wA > r.wB); // only allowed difference: the approved capture was WIDER than the viewport
  record(
    "Design comparison",
    `${rows.length} rendered screenshots compared against the approved PR #7 evidence`,
    rows.length >= 50 && widthOk,
    widened.length
      ? `${rows.length - widened.length} captures have identical widths. DEVIATION (defect fix): ${widened.length} approved mobile captures are ${widened[0].wA}px wide in a ${widened[0].wB}px viewport, i.e. the approved preview's mobile line-item table overflowed horizontally; the React shell fits (${widened.map((r) => r.rel).join(", ")})`
      : "all capture widths identical",
  );
  const avgMad = rows.reduce((a, r) => a + r.mad, 0) / rows.length;
  const avgSame = rows.reduce((a, r) => a + r.same, 0) / rows.length;
  const worst = [...rows].sort((a, b) => b.mad - a.mad).slice(0, 6).map((r) => `${r.rel} (MAD ${r.mad})`);
  record("Design comparison", "mean grey-level difference of the top 1,400px stays small", avgMad < 14, `mean abs diff ${avgMad.toFixed(1)}/255; ${avgSame.toFixed(1)}% of pixels within 24 grey levels; largest: ${worst.join(", ")}`);
  const heightRatio = rows.map((r) => r.hB / r.hA);
  const ratioOk = heightRatio.filter((x) => x < 0.7 || x > 1.4).length;
  record("Design comparison", "page heights stay within 0.7×–1.4× of the approved design (layout parity)", ratioOk <= 4, `${ratioOk} of ${rows.length} outside; see comparison/ side-by-sides (left approved, right React)`);
  writeFileSync(join(here, "comparison-metrics.json"), JSON.stringify(rows, null, 2) + "\n");
  phase = "app";
}

/* ----------------------------------------------------------------- scans across every screen/state/theme */
for (const theme of ["light", "dark"]) {
  const offenders = [];
  for (const st of ["default", ...STATES]) {
    for (const screen of st === "default" ? SCREENS : [null]) {
      await viewport(1280, 900);
      await load(st === "default" ? hashFor(screen, theme) : `#state=${st}&theme=${theme}`);
      for (const o of await ev(CONTRAST_SCAN)) offenders.push(`${screen || st}: ${o.el} "${o.text}" ${o.ratio}:1 (needs ${o.need})`);
    }
  }
  record("Contrast", `${theme} theme: text contrast across 5 screens and ${STATES.length} states`, offenders.length === 0, offenders.length ? offenders.slice(0, 12).join("; ") : "no text below WCAG AA (4.5:1, or 3:1 for large text)");
}

/* ----------------------------------------------------------------- responsive */
for (const [w, label] of [[390, "390px"], [320, "320px (WCAG 1.4.10 reflow)"], [768, "768px"], [1280, "1280px"]]) {
  const bad = [];
  for (const s of SCREENS) {
    await viewport(w, 800, false); // desktop-mode emulation: mobile emulation would widen the layout viewport and hide overflow
    await load(hashFor(s, "light"));
    const m = await ev(HSCROLL);
    if (m.sw > m.iw + 1) bad.push(`${s} scrollWidth ${m.sw} > ${m.iw}`);
  }
  for (const st of ["validation-errors", "ai-clarification", "paypal-refused", "over-limit", "paypal-unknown", "rounding", "list-error"]) {
    await viewport(w, 800, false);
    await load(`#state=${st}`);
    const m = await ev(HSCROLL);
    if (m.sw > m.iw + 1) bad.push(`${st} scrollWidth ${m.sw} > ${m.iw}`);
  }
  record("Responsive", `no horizontal page overflow at ${label}`, bad.length === 0, bad.join("; ") || "all screens and sampled states fit");
}
{
  const small = [];
  for (const s of SCREENS) {
    await viewport(390, 844, true);
    await load(hashFor(s, "light"));
    for (const t of await ev(TARGETS(44))) small.push(`${s}:${t}`);
  }
  record("Responsive", "mobile (390px) interactive targets are at least 44×44 CSS px", small.length === 0, small.slice(0, 10).join("; ") || "all targets ≥ 44px");
  const small24 = [];
  for (const s of SCREENS) {
    await viewport(1280, 900);
    await load(hashFor(s, "light"));
    for (const t of await ev(TARGETS(24))) small24.push(`${s}:${t}`);
  }
  record("Responsive", "desktop targets meet WCAG 2.2 AA 2.5.8 minimum (24×24 CSS px)", small24.length === 0, small24.slice(0, 10).join("; ") || "all targets ≥ 24px");
  await viewport(1280, 900);
  await load("#screen=dashboard");
  const d = await ev(`({ nav: getComputedStyle(document.querySelector('.app-nav')).display, mob: getComputedStyle(document.querySelector('.mobile-nav')).display })`);
  await viewport(390, 844, true);
  await load("#screen=dashboard");
  const m = await ev(`({ nav: getComputedStyle(document.querySelector('.app-nav')).display, mob: getComputedStyle(document.querySelector('.mobile-nav')).display, head: getComputedStyle(document.querySelector('table.data thead')).position })`);
  record("Responsive", "desktop shows top navigation; mobile shows bottom bar and stacks table rows as cards", d.nav !== "none" && d.mob === "none" && m.nav === "none" && m.mob === "flex" && m.head === "absolute", JSON.stringify({ d, m }));
}

/* ----------------------------------------------------------------- journey 1+8: keyboard-only end-to-end (desktop) */
await viewport(1280, 900);
await load("");
{
  const G = "Keyboard journey";
  await press("Tab");
  const first = await active();
  record(G, "first Tab stop is the 'Skip to main content' link", first?.name === "Skip to main content", JSON.stringify(first));
  await press("Enter");
  record(G, "activating the skip link moves focus to <main>", await matches("#main-content"));
  record(G, "Tab reaches Username", (await tabTo("#login-username")) > 0);
  await press("Tab");
  record(G, "Username is followed by an EMPTY Password; no remember-me control exists", (await matches("#login-password")) && (await ev("document.getElementById('login-password').value === '' && !document.querySelector('#login-username').form.querySelector('input[type=checkbox]')")));
  record(G, "login discloses simulated authentication", /Simulated sign-in/.test(await text("main")));
  await press("Enter");
  record(G, "empty submit marks fields invalid, shows messages and focuses the first", (await ev("document.getElementById('login-username').getAttribute('aria-invalid') === 'true' && !document.getElementById('err-login-username').hidden")) && (await matches("#login-username")));
  await type("operator");
  await press("Tab");
  await type("preview-only-password");
  await press("Enter");
  record(G, "valid username + password continue to the dashboard (simulated)", await waitFor(`!!document.getElementById('dash-title')`));
  record(G, "focus lands on the dashboard heading after navigation", await matches("#dash-title"));
  record(G, "password is not kept in the DOM after submit", await ev("document.getElementById('login-password') === null"));
  record(G, "Tab reaches 'New invoice' in the page header", (await tabTo("#dash-title ~ button, .page-head > button")) > 0);
  await press("Enter");
  record(G, "Enter opens the composer", await waitFor(`!!document.getElementById('comp-title')`));
  const t = await tabTo("[role=tab][aria-selected=true]");
  await press("ArrowRight");
  record(G, "ArrowRight on the tablist selects Manual and swaps panels", t > 0 && (await ev("document.getElementById('tab-manual').getAttribute('aria-selected') === 'true' && !document.getElementById('panel-manual').hidden && document.getElementById('panel-ai').hidden")));
  await press("Home");
  record(G, "Home returns to the AI tab", await ev("document.getElementById('tab-ai').getAttribute('aria-selected') === 'true'"));
  record(G, "Tab reaches the first synthetic example prompt", (await tabTo(".chip")) > 0);
  await press(" ");
  record(G, "Space loads the example into the textarea and the counter updates", (await ev("document.getElementById('comp-text').value.startsWith('Invoice Acme Design')")) && /^\d+ \/ 2,000$/.test(await text(".counter")), await text(".counter"));
  record(G, "Tab reaches 'Parse with AI'", (await tabTo("#parse-btn")) > 0);
  await press("Enter");
  record(G, "parsing shows a loading state (aria-busy textarea, progress label)", await waitFor(`document.getElementById('comp-text').getAttribute('aria-busy') === 'true' && /Analyzing/.test(document.getElementById('parse-btn').textContent)`, 800));
  record(G, "parse opens review with focus on its heading", (await waitFor(`!!document.getElementById('rev-title')`)) && (await matches("#rev-title")));
  record(G, "review is filled from the fixture and labelled an AI proposal", (await ev("document.getElementById('f-customerName').value === 'Acme Design LLC' && document.getElementById('f-customerEmail').value === 'billing@acme.example'")) && /Proposed by the AI parser/.test(await text("main")));
  const tot0 = await text("[data-testid=totals-body]");
  record(G, "totals are labelled 'Estimated' and never 'verified'", /Estimated total \(USD\)\$702\.00/.test(tot0) && !/verified/i.test(await text("main")), tot0);
  record(G, "Tab reaches the first line's unit price", (await tabTo("#f-line-0-unitPrice")) > 0);
  await ev("document.activeElement.select()");
  await type("300.00");
  record(G, "editing a price recalculates the estimate live ($810.00)", await waitFor(`/\\$810\\.00/.test(document.querySelector('[data-testid=totals-body]').textContent)`, 1000), await text("[data-testid=totals-body]"));
  record(G, "Tab reaches 'Save local draft'", (await tabTo("#save-btn")) > 0);
  await press("Enter");
  await press("Enter"); // a second activation while saving must be ignored (journey 6)
  record(G, "save shows a busy state and disables the inputs", await waitFor(`document.getElementById('save-btn').getAttribute('aria-disabled') === 'true' && /Saving/.test(document.getElementById('save-btn').textContent) && document.getElementById('f-customerName').matches(':disabled')`, 600));
  record(G, "after save the detail screen opens with focus on the customer heading", (await waitFor(`!!document.getElementById('create-pp-btn')`)) && (await matches("#det-title")));
  record(G, "detail says the save was simulated and nothing was sent to PayPal", /Local draft saved \(simulated\)[\s\S]*Nothing has been sent to PayPal/.test(await text("main")) && /Not created in PayPal Sandbox/.test(await text("#pp-body")));
  record(G, "detail totals are labelled server-computed (simulated) and recomputed ($810.00)", /Server-computed/.test(await text("main")) && /Simulated server response/.test(await text("main")) && /\$810\.00/.test(await text("main")));
  record(G, "duplicate-save prevention: two rapid activations created exactly one draft", await (async () => { await click(".nav-link"); await waitFor(`!!document.getElementById('dash-title')`); return (await ev("document.querySelectorAll('table.data tbody tr').length")) === 5; })());
  // open the new draft from the table
  await ev("document.querySelector('table.data tbody tr button').click()");
  await waitFor(`!!document.getElementById('create-pp-btn')`);
  // dialog journey 7+8
  record(G, "Tab reaches 'Create PayPal Sandbox draft…'", (await tabTo("#create-pp-btn")) > 0);
  await press("Enter");
  record(G, "confirmation dialog opens modally with initial focus on Cancel", (await waitFor(`!!document.querySelector('dialog[open]')`, 800)) && (await ev("document.activeElement.textContent.trim() === 'Cancel' && !!document.activeElement.closest('dialog')")));
  const trapped = [];
  for (let i = 0; i < 5; i++) {
    await press("Tab");
    trapped.push(await ev("!!document.activeElement.closest('dialog[open]')"));
  }
  record(G, "focus is trapped inside the dialog over 5 Tab presses", trapped.every(Boolean));
  await press("Tab", true);
  record(G, "Shift+Tab also stays inside the dialog", await ev("!!document.activeElement.closest('dialog[open]')"));
  await press("Escape");
  record(G, "Escape closes the dialog and restores focus to the opener", (await ev("!document.querySelector('dialog[open]')")) && (await matches("#create-pp-btn")));
  await press("Enter");
  await waitFor(`!!document.querySelector('dialog[open]')`, 800);
  await press("Tab");
  record(G, "Tab moves from Cancel to the confirm button", await ev("document.activeElement.textContent.trim() === 'Create draft'"));
  await press("Enter");
  record(G, "confirming shows an in-progress state", await waitFor(`/Creating the PayPal Sandbox draft/.test(document.getElementById('pp-body').textContent)`, 800));
  record(G, "result is labelled simulated, with a fabricated id and a 'customer not emailed' notice", (await waitFor(`/PayPal draft created/.test(document.getElementById('pp-body').textContent)`)) && (await ev("/INV2-DEMO-FAKE-\\d{4}-\\d{4}/.test(document.getElementById('pp-body').textContent) && /not a provider response/.test(document.getElementById('pp-body').textContent) && /has not been emailed/.test(document.getElementById('pp-body').textContent) && /fabricated demo id/.test(document.getElementById('pp-body').textContent)")));
  record(G, "no send, pay, remind or refund control exists anywhere on the detail screen", await ev("[...document.querySelectorAll('main button, main a')].every((b) => !/^(send|pay|remind|refund|cancel invoice|mark paid|capture)/i.test(b.textContent.trim()))"));
  record(G, "focus returns to the screen heading after the simulated create", await matches("#det-title"));
  const stor = await ev(STORAGE);
  record("Privacy", "after the full journey: localStorage, sessionStorage, cookies, IndexedDB, caches and service workers are all empty", stor.ls === 0 && stor.ss === 0 && stor.cookie === "" && stor.idb === 0 && stor.caches === 0 && stor.sw === 0, JSON.stringify(stor));
  const url = await ev("location.href");
  record("Privacy", "URL contains only screen, demo state and theme (no invoice content typed during the journey)", /^http:\/\/127\.0\.0\.1:4173\/#screen=\w+(&state=[\w-]+)?&theme=(light|dark)$/.test(url) && !/Acme|operator|billing|300|810/i.test(url), url);
}

/* ----------------------------------------------------------------- journeys 2-7: manual entry, clarification, validation, totals, currency */
{
  const G = "Interactions";
  await load("#screen=composer");
  await paste("#comp-text", "x".repeat(2100));
  record(G, "over-limit: counter shows 2,100 / 2,000 and the overage", /2,100 \/ 2,000 · 100 over the limit/.test(await text(".counter")), await text(".counter"));
  record(G, "over-limit: textarea aria-invalid, visible alert, Parse aria-disabled", await ev("document.getElementById('comp-text').getAttribute('aria-invalid') === 'true' && !document.getElementById('comp-error').hidden && document.getElementById('comp-error').getAttribute('role') === 'alert' && document.getElementById('parse-btn').getAttribute('aria-disabled') === 'true'"));
  await click("#parse-btn");
  await sleep(150);
  record(G, "over-limit: activating Parse does not start parsing", await ev("document.getElementById('comp-text').getAttribute('aria-busy') !== 'true'"));
  await paste("#comp-text", "x".repeat(2000));
  record(G, "exactly 2,000 characters is accepted", (await text(".counter")) === "2,000 / 2,000" && (await ev("document.getElementById('comp-error').hidden && document.getElementById('parse-btn').getAttribute('aria-disabled') !== 'true'")));
  await paste("#comp-text", "");
  await click("#parse-btn");
  await sleep(100);
  record(G, "empty text: Parse shows a required message and focuses the textarea", await ev("!document.getElementById('comp-error').hidden && document.activeElement.id === 'comp-text'"));
  await paste("#comp-text", "something else");
  await click("#parse-btn");
  record(G, "unrecognised text returns the 'could not read' outcome with a manual-entry escape", (await waitFor(`/could not turn this text into an invoice/.test(document.querySelector('main').textContent)`, 2500)) && /enter the invoice manually/.test(await text("main")));
  // clarification
  await load("#screen=composer");
  await clickText(".chip", "EUR");
  await click("#parse-btn");
  record(G, "ambiguous request shows two clarification questions", await waitFor(`document.querySelectorAll('#clar-box input').length === 2 || document.querySelectorAll('[role=region] input').length === 2`, 2500));
  await clickText("button", "Add answers and parse again");
  record(G, "blank clarification answers show an alert and flag the first field", await ev("!document.getElementById('clar-err').hidden && document.getElementById('clar-0').getAttribute('aria-invalid') === 'true'"));
  await ev("document.getElementById('clar-0').focus()");
  await type("rechnung@beispiel.example");
  await press("Tab");
  await type("2026-11-30");
  await clickText("button", "Add answers and parse again");
  record(G, "answered clarification re-parses into review with the rounding warning and PayPal refusal preview", (await waitFor(`!!document.getElementById('rev-title')`, 3500)) && /Rounding applied/.test(await text("[data-testid=totals-body]")) && /would be refused/.test(await text("#paypal-hint")), await text("[data-testid=totals-body]"));
  record(G, "EUR rounding example totals match the server calculation (€1,805.53)", /€1,805\.53/.test(await text("[data-testid=totals-body]")) && /€288\.28/.test(await text("[data-testid=totals-body]")));
  // manual entry + validation
  await load("#screen=composer");
  await click("#tab-manual");
  await clickText("button", "Open blank invoice form");
  await waitFor(`!!document.getElementById('rev-title')`, 1000);
  record(G, "manual entry opens a blank form with only schema-backed fields (required email present)", await ev("document.getElementById('f-customerEmail').required && document.getElementById('f-customerName').value === '' && ['f-customerName','f-customerEmail','f-currency','f-dueDate','f-taxPercent','f-discountKind','f-discountValue'].every((i) => document.getElementById(i)) && !/Invoice number|Issue date|PO reference/.test(document.querySelector('main').textContent)"));
  await click("#save-btn");
  await sleep(200);
  record(G, "saving a blank form lists errors, focuses the summary and flags fields", await ev("!document.getElementById('err-summary').hidden && document.activeElement.id === 'err-summary' && document.getElementById('f-customerName').getAttribute('aria-invalid') === 'true' && document.getElementById('f-customerEmail').getAttribute('aria-invalid') === 'true'"), (await ev("document.querySelectorAll('#err-summary li').length")) + " errors");
  record(G, "error text is associated with its field (aria-describedby → visible message)", await ev("(() => { const i = document.getElementById('f-customerName'); return i.getAttribute('aria-describedby').split(' ').some((id) => { const e = document.getElementById(id); return e && !e.hidden && e.textContent.length > 0; }); })()"));
  await ev("document.querySelector('#err-summary a').click()");
  record(G, "an error-summary link moves focus to its field", await matches("#f-customerName"));
  await type("Test Customer");
  record(G, "fixing a field clears its error live", await ev("document.getElementById('err-customerName').hidden && document.getElementById('f-customerName').getAttribute('aria-invalid') !== 'true'"));
  await select("#f-currency", "JPY");
  record(G, "JPY: unit-price placeholder has no decimals", await ev("document.getElementById('f-line-0-unitPrice').placeholder === '0'"));
  await ev("document.getElementById('f-line-0-unitPrice').focus()");
  await type("85.50");
  record(G, "JPY amount with decimals is rejected live with an explanation", await waitFor(`/JPY amounts have no decimal places/.test(document.getElementById('err-line-0-unitPrice').textContent)`, 800));
  await paste("#f-line-0-unitPrice", "12500");
  await paste("#f-line-0-description", "Advisory");
  await paste("#f-line-0-quantity", "4");
  record(G, "JPY totals format with no decimals and a yen symbol (¥50,000)", await waitFor(`/¥50,000/.test(document.querySelector('[data-testid=totals-body]').textContent)`, 800), await text("[data-testid=totals-body]"));
  await select("#f-currency", "GBP");
  await paste("#f-line-0-unitPrice", "19.99");
  record(G, "GBP uses £ with two decimals (£79.96)", await waitFor(`/£79\\.96/.test(document.querySelector('[data-testid=totals-body]').textContent)`, 800), await text("[data-testid=totals-body]"));
  await select("#f-currency", "USD");
  await click("#add-line-btn");
  record(G, "Add line item adds a row and moves focus to its description", (await ev("document.querySelectorAll('.line-row').length === 2")) && (await matches("#f-line-1-description")));
  await ev("document.querySelector('[aria-label=\"Remove line 2\"]').click()");
  record(G, "Remove line deletes the row; the last remaining row cannot be removed", (await ev("document.querySelectorAll('.line-row').length === 1")) && (await ev("document.querySelector('[aria-label^=\"Remove line\"]').disabled")));
  await select("#f-discountKind", "percent");
  await paste("#f-discountValue", "150");
  record(G, "percent discount above 100 is rejected", await waitFor(`/between 0 and 100/.test(document.getElementById('err-discountValue').textContent)`, 800));
  await paste("#f-taxPercent", "8.255");
  record(G, "tax with more than 2 decimals is rejected; fixed tax amount is not offered", (await waitFor(`/at most 2 decimal places/.test(document.getElementById('err-taxPercent').textContent)`, 800)) && /fixed tax amount is not supported/.test(await text("main")));
  await clickText("button", "Discard");
  record(G, "Discard opens a confirmation dialog; Escape keeps the form", (await waitFor(`!!document.querySelector('dialog[open]')`, 800)) && (await (async () => { await press("Escape"); return ev("!document.querySelector('dialog[open]') && !!document.getElementById('rev-title')"); })()));
  // save replay / conflict (journey 6)
  await load("#state=save-replay");
  await click("#save-btn");
  record(G, "duplicate save (replayed): the existing draft is shown with a simulated-replay notice", (await waitFor(`!!document.getElementById('create-pp-btn')`)) && /Duplicate save detected \(simulated\)/.test(await text("main")) && /replayed: true/.test(await text("main")));
  await load("#state=save-conflict");
  await click("#save-btn");
  record(G, "idempotency conflict (409): alert with 'use a new key'; retrying then succeeds", (await waitFor(`!!document.querySelector('.totals [role=alert]')`)) && (await (async () => { await clickText("button", "Use a new key"); await click("#save-btn"); return waitFor(`!!document.getElementById('create-pp-btn')`); })()));
  // dashboard
  await load("#screen=dashboard");
  record(G, "dashboard: one card per currency, no mixed total, labelled DEMO / SYNTHETIC with the missing list endpoint named", await ev("(() => { const cards = [...document.querySelectorAll('.currency-card')]; const t = document.querySelector('main').textContent; return cards.length === 4 && cards.every((c) => /^(USD|EUR|GBP|JPY)/.test(c.textContent.trim())) && /never added together or converted/.test(t) && /DEMO \\/ SYNTHETIC/.test(t) && /is not implemented/.test(t); })()"));
  record(G, "dashboard: AG Studio described as unconfirmed / not enabled; no Delete or Updated-at", await ev("(() => { const t = document.querySelector('main').textContent; return /not enabled/.test(t) && /unconfirmed/.test(t) && !/active trial|through Dec/i.test(t) && !/Delete|Updated/i.test(document.querySelector('table.data').textContent); })()"));
  await clickText(".pill", "JPY");
  record(G, "currency filter narrows the table to JPY", await ev("document.querySelectorAll('table.data tbody tr').length === 1 && /Sakura/.test(document.querySelector('table.data').textContent)"));
  await paste("#dash-search", "zzz");
  record(G, "no-match search shows a recoverable empty message", (await text("main")).includes("No drafts match") && (await ev("[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Clear filters')")));
  await clickText("button", "Clear filters");
  record(G, "Clear filters restores all four drafts", await ev("document.querySelectorAll('table.data tbody tr').length === 4"));
  await select("#dash-status", "created");
  record(G, "status filter shows only PayPal-created drafts", await ev("document.querySelectorAll('table.data tbody tr').length === 1"));
  // PayPal states (journey 7)
  await load("#state=paypal-disabled");
  record(G, "PayPal disabled (503): create button disabled and described by the explanation", await ev("(() => { const b = document.getElementById('create-pp-btn'); return b.disabled && b.getAttribute('aria-describedby') === 'pp-disabled' && /paypal_disabled/.test(document.getElementById('pp-disabled').textContent); })()"));
  await load("#state=paypal-refused");
  record(G, "mapping refusal (422) explains the rule, says PayPal was not contacted, offers a way forward", /mapping_refused/.test(await text("#pp-body")) && /Refused before contacting PayPal/.test(await text("#pp-body")) && /Start a new invoice/.test(await text("#pp-body")));
  await load("#screen=detail&state=paypal-refused");
  await load("#screen=dashboard");
  await ev("[...document.querySelectorAll('table.data tbody tr')].find((r) => /Northwind/.test(r.textContent)).querySelector('button').click()");
  await waitFor(`!!document.getElementById('create-pp-btn')`);
  record(G, "an ineligible draft warns in advance ('Expected to be refused'), and a real attempt then refuses without creating", /Expected to be refused/.test(await text("#pp-body")) && (await (async () => { await click("#create-pp-btn"); await waitFor(`!!document.querySelector('dialog[open]')`, 800); await clickText("dialog[open] button", "Create draft"); return waitFor(`/mapping_refused/.test(document.getElementById('pp-body').textContent) && !/INV2-DEMO/.test(document.getElementById('pp-body').textContent)`, 3500); })()));
  await load("#state=paypal-unknown");
  record(G, "unknown outcome (502): retry reconciles first; never claims a draft exists", /checks PayPal first/.test(await text("#pp-body")) && /may or may not exist/.test(await text("#pp-body")));
  await load("#state=paypal-reconciling");
  record(G, "reconciliation (409) explains no blind recreate", /will not create a second draft blindly/.test(await text("#pp-body")));
  await load("#state=paypal-creating");
  record(G, "in progress (409) offers only 'Check status'", (await ev("[...document.querySelectorAll('#pp-body button')].map((b) => b.textContent.trim()).join('|')")) === "Check status");
  await load("#state=paypal-rejected");
  record(G, "rejected (502) offers Try again; mismatch offers no retry", /Try again/.test(await text("#pp-body")) && (await (async () => { await load("#state=paypal-mismatch"); return ev("!document.querySelector('#pp-body button')"); })()));
  // offline, login states, privacy copy
  await load("#state=offline");
  record(G, "offline: alert banner shown and creating actions are unavailable", (await ev("!!document.querySelector('.banner-offline[role=alert]')")) && (await (async () => { await load("#screen=composer&state=offline"); return ev("document.getElementById('parse-btn').getAttribute('aria-disabled') === 'true'"); })()));
  await load("#screen=composer");
  record(G, "privacy note: text may be sent to OpenAI; review required; real provider parsing NOT TESTED; no 'secure' claim", await ev("(() => { const t = document.getElementById('privacy-note').textContent; return /may be sent to OpenAI/.test(t) && /review every field/.test(t) && /NOT TESTED/.test(t) && !/securely|Safe Processing/i.test(t); })()"));
  record(G, "persistent PayPal Sandbox banner present on all 5 screens", await (async () => { for (const s of SCREENS) { await load(hashFor(s, "light")); if (!(await ev("(() => { const b = document.querySelector('.sandbox-banner'); return !!b && /PayPal Sandbox only/.test(b.textContent) && /does not email/.test(b.textContent); })()"))) return false; } return true; })());
  await load("#state=login-error");
  record(G, "login failure (401) shows a generic alert; throttle (429) and expiry states present", (await ev("(() => { const n = document.querySelector('main [role=alert]'); return !!n && /incorrect/.test(n.textContent) && /same message/.test(n.textContent); })()")) && (await (async () => { await load("#state=login-throttled"); const a = /Too many sign-in attempts/.test(await text("main")); await load("#state=session-expired"); return a && /session has expired/.test(await text("main")); })()));
  await load("#state=login-error");
  await ev("document.getElementById('login-username').focus()");
  await type("someone");
  await press("Tab");
  await type("wrong");
  await press("Enter");
  record(G, "login 401 demo: submit shows the error again and returns focus to the password", (await waitFor(`!!document.querySelector('main [role=alert]') && document.activeElement.id === 'login-password'`, 2500)));
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await load("#state=loading");
  record(G, "prefers-reduced-motion removes the skeleton animation", (await ev("getComputedStyle(document.querySelector('.skeleton')).animationName")) === "none");
  await send("Emulation.setEmulatedMedia", { features: [] });
  await load("#screen=dashboard&theme=light");
  await clickText("button", "Dark theme");
  record(G, "theme toggle switches to dark, updates aria-pressed and the URL hash", (await ev("document.documentElement.dataset.theme === 'dark' && document.querySelector('.rc-btn[aria-pressed=true]') !== null")) && /theme=dark/.test(await ev("location.hash")));
  await load("#screen=dashboard");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await load("");
  record(G, "with no explicit theme the system dark preference is honoured", (await ev("document.documentElement.dataset.theme")) === "dark");
  await send("Emulation.setEmulatedMedia", { features: [] });
}

/* ----------------------------------------------------------------- focus visibility */
for (const theme of ["light", "dark"]) {
  for (const screen of ["dashboard", "review"]) {
    await viewport(1280, 900);
    await load(hashFor(screen, theme));
    const bad = [];
    let n = 0;
    for (let i = 0; i < 40; i++) {
      await press("Tab");
      const r = await ev(`(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { id: e.id || e.tagName.toLowerCase(), style: cs.outlineStyle, w: parseFloat(cs.outlineWidth) }; })()`);
      if (!r) continue;
      n++;
      if (r.style === "none" || r.w < 2) bad.push(r.id);
    }
    record("Focus visibility", `${theme} ${screen}: every sampled Tab stop shows a ≥2px focus outline`, bad.length === 0, `${n} stops checked${bad.length ? "; missing on " + bad.slice(0, 6).join(",") : ""}`);
  }
}

/* ----------------------------------------------------------------- network + console + storage */
record("Safety", `no request left ${ORIGIN} (only the app's own ${appRequests} same-origin asset/page loads occurred)`, foreignRequests.length === 0, foreignRequests.length ? foreignRequests.slice(0, 3).join(", ") : "0 foreign requests");
record("Safety", "no JavaScript exceptions, CSP violations or console errors during the run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "0 errors");
{
  const csp = await (async () => { const r = await fetch(ORIGIN + "/"); const h = await r.text(); return ((/Content-Security-Policy" content="([^"]+)"/.exec(h) || [])[1] || "").replaceAll("&#39;", "'"); })();
  record("Safety", "served page carries a CSP with connect-src 'none' and no inline-style or inline-script allowance", /connect-src 'none'/.test(csp) && !/unsafe-inline|unsafe-eval/.test(csp), csp);
}

/* ----------------------------------------------------------------- report */
const pass = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
const dirKB = (d) => {
  let total = 0;
  const walk = (p) => {
    for (const f of readdirSync(p)) {
      const q = join(p, f);
      statSync(q).isDirectory() ? walk(q) : (total += statSync(q).size);
    }
  };
  walk(d);
  return Math.round(total / 1024);
};
const groups = [...new Set(results.map((r) => r.group))];
let md = `# NMI-UI-01B browser QA results\n\n`;
md += `- **App under test:** the built React shell (\`apps/web/dist\`) served by \`vite preview\` at ${ORIGIN}, with its production CSP.\n`;
md += `- **Browser:** ${version.Browser} (headless), driven over the DevTools Protocol by \`run-browser-qa.mjs\` with real keyboard events.\n`;
md += `- **Result:** ${pass} of ${results.length} checks passed${failed.length ? `, **${failed.length} failed**` : ""}.\n`;
md += `- **Screenshots:** ${shots.length} JPEG files (${dirKB(SHOTS)} KB) in \`screenshots/\`; side-by-side comparisons against the approved PR #7 evidence in \`comparison/\` (left = approved design preview, right = React shell); metrics in \`comparison-metrics.json\`.\n`;
md += `- **Not covered:** screen-reader testing (VoiceOver/NVDA), real touch hardware, Safari/Firefox, 400% browser zoom (320px reflow is checked instead). Full WCAG 2.2 AA conformance is **not** claimed.\n\n`;
for (const g of groups) {
  md += `## ${g}\n\n| Result | Check | Detail |\n| --- | --- | --- |\n`;
  for (const r of results.filter((x) => x.group === g)) md += `| ${r.pass ? "PASS" : "**FAIL**"} | ${r.name.replace(/\|/g, "\\|")} | ${String(r.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")} |\n`;
  md += "\n";
}
md += `## Screenshot index\n\n`;
for (const dir of ["desktop/light", "desktop/dark", "mobile/light", "mobile/dark", "tablet/light", "states/desktop-light", "states/mobile-light", "states/desktop-dark"]) {
  md += `**${dir}**: ${shots.filter((s) => s.startsWith(dir + "/")).map((s) => `[${s.split("/").pop().replace(".jpg", "")}](screenshots/${s})`).join(" · ")}\n\n`;
}
writeFileSync(join(here, "QA-RESULTS.md"), md);
writeFileSync(join(here, "qa-results.json"), JSON.stringify({ browser: version.Browser, results }, null, 2) + "\n");

ws.close();
chrome.kill();
preview.kill();
await sleep(400);
rmSync(profile, { recursive: true, force: true });
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
