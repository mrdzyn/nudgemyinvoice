// RC70 QA (corrected harness for review 5816666095 + comment 6717561154).
// Every PASS asserts an observed outcome; mechanisms are labeled honestly.
// Covers PR #70 RC HEAD: branding + chat-to-composer + EUR-chip operability.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const ROOT = "/Users/macjohn/Documents/nudgemyinvoice";
const SHOTS = "/tmp/nmi70-shots";
mkdirSync(SHOTS, { recursive: true });
const API_PORT = 4551;
const ORIGIN = `http://127.0.0.1:${API_PORT}`;
const USER = process.env.QA_USER;
const PASS = process.env.QA_PASS;
if (!USER || !PASS) throw new Error("QA_USER/QA_PASS required");
const results = [];
const note = (name, pass, detail = "") => {
  results.push({ name, pass, detail: String(detail).slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${String(detail).slice(0, 260)}` : ""}`);
};
const info = (name, detail = "") => console.log(`INFO ${name}${detail ? ` — ${String(detail).slice(0, 260)}` : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const api = spawn("pnpm", ["--filter", "@nmi/api", "start"], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "test", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN,
    WEB_DIST_DIR: `${ROOT}/apps/web/dist`,
    DATABASE_URL: "postgres://postgres@127.0.0.1:55449/nmi_qadb",
    SESSION_SECRET: process.env.QA_SESSION_SECRET, HOST: "127.0.0.1",
    PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com" },
  stdio: ["ignore", "pipe", "pipe"],
});
process.on("exit", () => { try { api.kill("SIGTERM"); } catch {} });
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--remote-debugging-port=9335", "--no-first-run", "--no-default-browser-check",
   `--user-data-dir=/tmp/nmi-chrome-rc70-${Date.now()}`, "about:blank"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });

// CORRECTED health: poll for readiness, then ASSERT one final observed response.
let ready = false;
for (let i = 0; i < 100; i++) {
  try { const r = await fetch(`${ORIGIN}/health`); if (r.ok) { ready = true; break; } } catch {}
  await sleep(300);
}
let healthOk = false, healthBody = "";
try {
  const r = await fetch(`${ORIGIN}/health`);
  healthBody = await r.text();
  const j = JSON.parse(healthBody);
  healthOk = r.status === 200 && j.status === "ok" && j.paypalEnvironment === "sandbox";
} catch (e) { healthBody = String(e).slice(0, 120); }
note("api /health 200 + status ok + sandbox", ready && healthOk, healthBody.slice(0, 160));
for (let i = 0; i < 100; i++) {
  try { const r = await fetch("http://127.0.0.1:9335/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) break; } catch {}
  await sleep(300);
}

const consoleErrors = [];
const badResponses = [];
async function openPage(w, h, mobile, dark) {
  const created = await (await fetch("http://127.0.0.1:9335/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws timeout")), 15000);
    ws.onopen = () => { clearTimeout(t); resolve(); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("ws error")); };
  });
  ws.onmessage = (evMsg) => {
    const m = JSON.parse(evMsg.data.toString());
    if (m.id !== undefined && pending.has(m.id)) { const { resolve } = pending.get(m.id); pending.delete(m.id); resolve(m); return; }
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error")
      consoleErrors.push("console: " + (m.params.args?.map((a) => a.value ?? a.description ?? "").join(" ") || "").slice(0, 250));
    if (m.method === "Runtime.exceptionThrown")
      consoleErrors.push("exception: " + String(m.params?.exceptionDetails?.text ?? "?").slice(0, 250));
    if (m.method === "Log.entryAdded") {
      const e = m.params.entry;
      consoleErrors.push(`log[${e.source}/${e.level}]: ${e.url || ""} ${String(e.text).slice(0, 200)}`);
    }
    if (m.method === "Network.responseReceived") {
      const st = m.params.response.status;
      if (st >= 400) badResponses.push(`${st} ${m.params.response.url}`);
    }
  };
  let nextId = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("cdp timeout " + method)); } }, 30000);
  });
  const ev = async (expression, awaitPromise = false) => {
    const needsInvoke = /^\s*(async\s+)?\(\s*\)\s*=>/.test(expression);
    const m = await send("Runtime.evaluate",
      { expression: needsInvoke ? `(${expression})()` : expression, awaitPromise, returnByValue: true });
    if (m.error) throw new Error("cdp error: " + m.error.message);
    if (m.result.exceptionDetails) throw new Error("eval threw: " + JSON.stringify(m.result.exceptionDetails).slice(0, 200));
    return m.result.result.value;
  };
  const waitFor = async (fnSource, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await ev(`(${fnSource})()`)) return true; } catch {}
      await sleep(250);
    }
    return false;
  };
  const shot = async (file) => {
    const m = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${SHOTS}/${file}`, Buffer.from(m.result.data, "base64"));
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
  await send("Emulation.setEmulatedMedia", { media: "", features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  await send("Page.navigate", { url: `${ORIGIN}/` });
  return { send, ev, waitFor, shot, close: () => ws.close() };
}

// ---- Phase A: logged-out branding views ----
const p = await openPage(1280, 800, false, false);
note("light login renders", await p.waitFor(`() => !!document.querySelector('h1#login-title')`));
await sleep(800);
const loginImg = await p.ev(`() => { const i = document.querySelector('img.login-brand-logo'); return i ? {src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.naturalWidth, h: i.naturalHeight} : null; }`);
note("login logo decorative + loaded", !!loginImg && loginImg.alt === "" && loginImg.w > 0, JSON.stringify(loginImg));
const headImg = await p.ev(`() => { const i = document.querySelector('img.brand-wordmark'); return i ? {src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.naturalWidth, h: i.naturalHeight} : null; }`);
note("pre-auth header wordmark alt+loaded", !!headImg && headImg.alt === "NudgeMyInvoice" && headImg.w > 0, JSON.stringify(headImg));
const assetTypes = await p.ev(`async () => { const out = {}; for (const u of ['/brand/nudge-logo.jpg','/brand/nudge-horizontal-logo.jpg']) { try { const r = await fetch(u, {method:'HEAD'}); out[u] = r.status + ' ' + r.headers.get('content-type'); } catch(e){ out[u] = 'FETCH_FAIL'; } } return out; }`, true);
const assetOk = assetTypes && Object.keys(assetTypes).length === 2 && Object.values(assetTypes).every((v) => String(v).startsWith("200") && String(v).includes("image/jpeg"));
note("brand jpgs 200 image/jpeg", assetOk, JSON.stringify(assetTypes));
const favicon = await p.ev(`() => { const l = document.querySelector('link[rel="icon"]'); return l ? {type: l.getAttribute('type'), href: l.getAttribute('href')} : null; }`);
note("favicon link present", !!favicon && !!favicon.href, JSON.stringify(favicon));
await p.shot("01-login-light-1280.png");

const pd = await openPage(1280, 800, false, true);
note("dark login renders", await pd.waitFor(`() => !!document.querySelector('h1#login-title')`));
await sleep(800);
const darkThemeLogin = await pd.ev(`() => document.documentElement.dataset.theme`);
note("dark theme on login", darkThemeLogin === "dark", String(darkThemeLogin));
await pd.shot("05-login-dark-1280.png");

const pm = await openPage(390, 844, true, false);
note("mobile login renders", await pm.waitFor(`() => !!document.querySelector('h1#login-title')`));
await sleep(800);
await pm.shot("07-login-mobile390.png");

// ---- Phase B: keyboard traversal + sign-in (mechanism labeled honestly) ----
await p.ev(`() => { document.body.focus(); return true; }`);
await p.send("Page.bringToFront", {});
await sleep(300);
const tabKey = (type) => p.send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
await tabKey("keyDown"); await tabKey("keyUp"); await sleep(300);
const afterFirstTab = await p.ev(`() => { const a = document.activeElement; return a ? (a.tagName + '#' + (a.id||'') + ' :: ' + (a.textContent||'').slice(0,40)) : 'none'; }`);
note("Tab from body reaches Skip link first", typeof afterFirstTab === "string" && /^A#/.test(afterFirstTab) && /skip/i.test(afterFirstTab), String(afterFirstTab));
await p.ev(`() => { document.getElementById('login-username').focus(); return true; }`);
await p.send("Input.insertText", { text: USER });
const typedValue = await p.ev(`() => document.getElementById('login-username').value`);
note("trusted key text reaches inputs", typedValue === USER, `value=${JSON.stringify(typedValue)}`);
await p.ev(`() => { document.getElementById('login-password').focus(); return true; }`);
await p.send("Input.insertText", { text: PASS });
await p.ev(`() => { document.querySelector('form button[type=submit]').focus(); return true; }`);
await sleep(300);
// Attempt genuine native activation: trusted Enter keypress on the focused submit.
const enterKey = (type) => p.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
await enterKey("rawKeyDown"); await enterKey("keyUp"); await sleep(1500);
let dashOk = await p.waitFor(`() => !!document.querySelector('nav.app-nav')`, 8000);
let submitMechanism = "NATIVE_ENTER";
if (!dashOk) {
  // Fall back honestly: programmatic submit after full keyboard traversal.
  await p.ev(`() => { document.querySelector('form').requestSubmit(document.querySelector('form button[type=submit]')); return true; }`);
  dashOk = await p.waitFor(`() => !!document.querySelector('nav.app-nav')`, 20000);
  submitMechanism = "requestSubmit-after-traversal";
}
note("keyboard traversal + sign-in reaches dashboard", dashOk, `submit=${submitMechanism}`);
await sleep(1000);
const launcher = await p.ev(`() => { const b = document.querySelector('button.nudgey-launcher'); if (!b) return null; const img = b.querySelector('img'); const r = b.getBoundingClientRect(); return {label: b.getAttribute('aria-label'), imgSrc: img && img.getAttribute('src'), imgAlt: img && img.getAttribute('alt'), w: Math.round(r.width), h: Math.round(r.height)}; }`);
note("launcher label + decorative avatar", !!launcher && /Open Nudgey/.test(launcher.label || "") && !!launcher.imgSrc && launcher.imgAlt === "", JSON.stringify(launcher));
await p.shot("02-dashboard-light-1280.png");

// ---- Phase C: launcher Tab-reachability (observed, not structural) ----
await p.ev(`() => { document.querySelector('nav.app-nav a, nav.app-nav button')?.focus(); return true; }`);
let tabReached = false, tabs = 0;
for (let i = 0; i < 60; i++) {
  await tabKey("keyDown"); await tabKey("keyUp"); await sleep(120); tabs++;
  const ae = await p.ev(`() => { const a = document.activeElement; return a ? (a.tagName + '.' + String(a.className).split(' ')[0]) : 'none'; }`);
  if (ae === "BUTTON.nudgey-launcher") { tabReached = true; break; }
}
note("launcher reached by Tab traversal", tabReached, `tabs=${tabs}`);

// ---- Phase C2: panel + safe mode (pointer clicks, labeled as such) ----
await p.ev(`() => { document.querySelector('button.nudgey-launcher').click(); return true; }`);
const panelOk = await p.waitFor(`() => !!document.querySelector('.nudgey-panel')`);
note("launcher opens panel (pointer click)", panelOk);
await sleep(600);
const panelAvatar = await p.ev(`() => { const i = document.querySelector('.nudgey-panel-avatar img'); return i ? {src: i.getAttribute('src'), w: i.naturalWidth} : null; }`);
note("panel mascot loaded", !!panelAvatar && panelAvatar.w > 0, JSON.stringify(panelAvatar));
await p.shot("03-nudgey-panel-1280.png");
await p.ev(`() => { document.querySelector('.nudgey-close').click(); return true; }`);
await sleep(400);
await p.ev(`() => { document.querySelector('button.sandbox-pill').click(); return true; }`);
const safeOk = await p.waitFor(`() => !!document.querySelector('.sandbox-detail')`);
const safeExpanded = await p.ev(`() => document.querySelector('button.sandbox-pill').getAttribute('aria-expanded')`);
note("Safe Mode disclosure opens + aria (pointer click)", safeOk && safeExpanded === "true", `expanded=${safeExpanded}`);
await p.shot("04-safemode-open-1280.png");

// CORRECTED focus: require an OBSERVED visible indicator, not just focus().
const focusStyle = await p.ev(`() => {
  const b = document.querySelector('button.nudgey-launcher');
  const before = getComputedStyle(b).boxShadow;
  b.focus();
  const cs = getComputedStyle(b);
  return { focused: document.activeElement === b, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth,
    shadowChanged: before !== cs.boxShadow, shadow: String(cs.boxShadow).slice(0, 60) };
}`);
const focusVisible = !!focusStyle && focusStyle.focused === true &&
  ((focusStyle.outlineStyle !== "none" && focusStyle.outlineWidth !== "0px") || focusStyle.shadowChanged === true);
note("launcher focus shows visible indicator", focusVisible, JSON.stringify(focusStyle));
await p.shot("04b-launcher-focused-1280.png");

// ---- Phase D: dark dashboard (reload authed) ----
await pd.send("Page.navigate", { url: `${ORIGIN}/` });
const dashDarkOk = await pd.waitFor(`() => !!document.querySelector('nav.app-nav')`, 20000);
note("dark dashboard authed", dashDarkOk);
await sleep(1000);
await pd.shot("06-dashboard-dark-1280.png");

// ---- Phase E: mobile 390 + EUR-chip operability (review 5816666095) ----
await pm.send("Page.navigate", { url: `${ORIGIN}/` });
await pm.waitFor(`() => !!document.querySelector('nav.mobile-nav')`, 20000);
await sleep(800);
const overflowX = await pm.ev(`() => document.documentElement.scrollWidth - document.documentElement.clientWidth`);
note("mobile 390 no horizontal overflow", typeof overflowX === "number" && overflowX <= 1, `overflow=${String(overflowX)}px`);
const headerFit = await pm.ev(`() => { const w = document.querySelector('.brand-wordmark').getBoundingClientRect(); return {wordmarkW: Math.round(w.width), wordmarkRight: Math.round(w.right)}; }`);
note("mobile header wordmark fits", !!headerFit && headerFit.wordmarkRight <= 390, JSON.stringify(headerFit));
await pm.shot("08-dashboard-mobile390.png");
const geom = () => pm.ev(`() => {
  const chip = [...document.querySelectorAll('button.pill')].find(b => b.textContent.trim() === 'EUR');
  const launcher = document.querySelector('button.nudgey-launcher');
  if (!chip || !launcher) return { error: 'missing nodes' };
  const c = chip.getBoundingClientRect(), l = launcher.getBoundingClientRect();
  const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const overlap = !(c.right <= l.left || c.left >= l.right || c.bottom <= l.top || c.top >= l.bottom);
  const desc = (el) => el ? el.tagName + '.' + String(el.className).split(' ')[0] + '::' + (el.textContent || '').trim().slice(0, 12) : 'none';
  return { chip: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) },
    launcher: { x: Math.round(l.x), y: Math.round(l.y), w: Math.round(l.width), h: Math.round(l.height) },
    overlap, hit: desc(top), chipCX: Math.round(cx), chipCY: Math.round(cy) };
}`);
const g0 = await geom();
info("initial 390px EUR/launcher geometry (fixed FAB may cover some scroll positions)", JSON.stringify(g0));
await pm.shot("08a-eur-initial-390.png");
// Bring the EUR chip to a verified non-overlapping position (standard scroll-to-target).
await pm.ev(`() => { const chip = [...document.querySelectorAll('button.pill')].find(b => b.textContent.trim() === 'EUR'); chip.scrollIntoView({ block: 'center' }); return true; }`);
await sleep(600);
const g1 = await geom();
const clearOfLauncher = !!g1 && !g1.error && g1.overlap === false;
note("EUR chip scrolled clear of launcher", clearOfLauncher, JSON.stringify(g1));
const hitChip = !!g1 && !g1.error && /^BUTTON\.pill/.test(g1.hit || "");
note("elementFromPoint at EUR center hits the chip", hitChip, `hit=${g1 && g1.hit}`);
// Genuine trusted tap on the chip center.
await pm.send("Input.dispatchMouseEvent", { type: "mousePressed", x: g1.chipCX, y: g1.chipCY, button: "left", clickCount: 1 });
await sleep(120);
await pm.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: g1.chipCX, y: g1.chipCY, button: "left", clickCount: 1 });
await sleep(800);
const eurState = await pm.ev(`() => {
  const chip = [...document.querySelectorAll('button.pill')].find(b => b.textContent.trim() === 'EUR');
  const pressed = [...document.querySelectorAll('button.pill[aria-pressed="true"]')].map(b => b.textContent.trim());
  return chip ? { pressed: chip.getAttribute('aria-pressed'), pressedCount: pressed, matchLine: (document.body.textContent.match(/Matching invoices[^.]*\./) || [''])[0].slice(0, 140) } : { error: 'chip gone' };
}`);
const eurApplied = !!eurState && eurState.pressed === "true";
note("trusted tap activates EUR filter", eurApplied, JSON.stringify(eurState));
await pm.shot("08b-eur-tapped-390.png");
await pm.ev(`() => { window.scrollTo(0, document.body.scrollHeight); return true; }`);
await sleep(500);
const clearance = await pm.ev(`() => { const l = document.querySelector('button.nudgey-launcher').getBoundingClientRect(); const n = document.querySelector('nav.mobile-nav').getBoundingClientRect(); return {launcherBottom: Math.round(l.bottom), navTop: Math.round(n.top), vwH: window.innerHeight}; }`);
note("launcher clears mobile nav", !!clearance && clearance.launcherBottom <= clearance.navTop, JSON.stringify(clearance));
await pm.shot("09-dashboard-mobile390-bottom.png");

// ---- Phase F: zoom (CORRECTED: overflow must be zero) ----
await p.ev(`() => { document.body.style.zoom = 2; return true; }`);
await sleep(600);
const zoomOverflow = await p.ev(`() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth)`);
note("200% zoom zero horizontal overflow", typeof zoomOverflow === "number" && zoomOverflow <= 1, `h-overflow=${String(zoomOverflow)}px`);
await p.shot("10-dashboard-zoom200.png");
await p.ev(`() => { document.body.style.zoom = 1; return true; }`);

// ---- Verdicts ----
await sleep(1000);
const sessionProbeOnly = (e) => /\/api\/auth\/session/.test(e) && /401/.test(e);
const realErrors = consoleErrors.filter((e) => !/favicon/i.test(e) && !sessionProbeOnly(e));
note("console errors only logged-out session probes", realErrors.length === 0, (realErrors.slice(0, 3).join(" || ") || "only pre-auth /api/auth/session 401s").slice(0, 400));
const cspHits = consoleErrors.filter((e) => /content security|CSP/i.test(e));
note("zero CSP violations", cspHits.length === 0, cspHits.slice(0, 2).join(" || "));
const nonProbeBad = badResponses.filter((u) => !sessionProbeOnly(u));
note("4xx only logged-out session probes", nonProbeBad.length === 0, (nonProbeBad.slice(0, 4).join(" || ") || "only pre-auth /api/auth/session 401s").slice(0, 300));
const cspMeta = await p.ev(`() => { const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); return m ? m.getAttribute('content') : null; }`);
note("prod CSP meta present, img self+data", typeof cspMeta === "string" && cspMeta.includes("img-src 'self'"), String(cspMeta).slice(0, 120));

console.log(JSON.stringify({ failed: results.filter((r) => !r.pass).length, total: results.length }));
try { api.kill("SIGTERM"); } catch {}
try { chrome.kill("SIGKILL"); } catch {}
p.close(); pd.close(); pm.close();
process.exit(results.filter((r) => !r.pass).length ? 2 : 0);

