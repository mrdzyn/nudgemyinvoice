/* eslint-disable -- design-only Node tooling (not production code): uses Node globals by design. */
// NMI-PROTOTYPE-10D-A5-D (rev 2): renders the static A5-D mockup to PNG previews with headless Chrome (CDP),
// drives the interactions (panel toggle, hover, keyboard focus, tap) and records objective design checks.
//
//   node design/evidence/NMI-PROTOTYPE-10D-A5D/build-mockup.mjs
//   node design/evidence/NMI-PROTOTYPE-10D-A5D/capture-previews.mjs
//
// Opens only the local file:// mockup (no network, no app, no provider). Desktop 1280px, tablet 820px and the
// 390px mobile viewport (emulated, device scale 2). Headless/emulated evidence is NOT physical-device QA.
// Writes previews/*.png and design-checks.json; exits nonzero if any check fails.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const PAGE = "file://" + join(root, "design/mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html");
const OUT = join(here, "previews");
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9371;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const D = { w: 1280, h: 900, dsf: 1, mobile: false };
const T = { w: 820, h: 1000, dsf: 1, mobile: false };
const M = { w: 390, h: 844, dsf: 2, mobile: true };

/* ---- in-page expressions (all evaluated in the mockup) ---- */
const P = `document.querySelector('.state-page:not([hidden])')`;
const PANEL = `${P}.querySelector('.studio')`;
const TOGGLE = `${P}.querySelector('.studio-toggle')`;
const BODY = `${P}.querySelector('.studio-body')`;
const tipsVisible = `[...document.querySelectorAll('.chart-tip')].filter(e => !e.hidden && e.offsetParent !== null).length`;
const studioBadge = `[...${P}.querySelectorAll('.studio-title .badge')].filter(e => e.offsetParent !== null && e.textContent.includes('Studio')).length`;
const vendorSlot = `[...${P}.querySelectorAll('.vendor-slot')].filter(e => e.offsetParent !== null).length`;
const barsVisible = (variant) => `${P}.querySelectorAll('.chart-${variant} .bar').length`;
// Exactness: plotted bars, the daily table and the currency card all agree in integer minor units and counts.
const exact = (cur) => String.raw`(() => { const P = ${P}; const m = (s) => BigInt(s.replace(/\D/g, ''));
  const card = [...P.querySelectorAll('.currency-card')].find((c) => c.querySelector('.top span').textContent === '${cur}');
  const total = m(card.querySelector('.amount').textContent); const count = +card.querySelector('.badge').textContent.split(' ')[0];
  const bars = [...P.querySelectorAll('.chart-d .bar')];
  const bs = bars.reduce((a, b) => a + m(b.dataset.v), 0n); const bc = bars.reduce((a, b) => a + +b.dataset.n, 0);
  const rows = [...P.querySelectorAll('.data-alt tbody tr')];
  const ts = rows.reduce((a, r) => a + m(r.children[2].textContent), 0n); const tc = rows.reduce((a, r) => a + +r.children[1].textContent, 0);
  return bs === total && bc === count && ts === total && tc === count; })()`;
const noTabStopsInBody = `[...${BODY}.querySelectorAll('button,summary,a,input,select,[tabindex]')].every((e) => e.offsetParent === null)`;

const active = (extra = []) => [
  ["Studio-active badge shown", `${studioBadge} === 1`],
  ["vendor-attribution area visible while widgets are visible", `${vendorSlot} === 1`],
  ...extra,
];
const expandedDesktop = [
  ["toggle says Hide charts and aria-expanded=true", `${TOGGLE}.getAttribute('aria-expanded') === 'true' && ${TOGGLE}.textContent === 'Hide charts'`],
  ["panel body visible", `${BODY}.hidden === false && ${BODY}.offsetParent !== null`],
];
const collapsedMobile = [
  ["toggle says Show charts, aria-expanded=false, panel body hidden", `${TOGGLE}.getAttribute('aria-expanded') === 'false' && ${TOGGLE}.textContent === 'Show charts' && ${BODY}.hidden === true`],
  ["heading and Show charts remain visible when collapsed", `${PANEL}.querySelector('h2').offsetParent !== null && ${TOGGLE}.offsetParent !== null`],
  ["no hidden panel control stays in the tab sequence", noTabStopsInBody],
  ["toggle target is at least 44px tall", `${TOGGLE}.getBoundingClientRect().height >= 44`],
  ["Studio-active badge stays in the collapsed header", `${studioBadge} === 1`],
  ["no vendor area drawn while no Studio widget is displayed", `${vendorSlot} === 0`],
];
const expandedMobile = [
  ["toggle says Hide charts and aria-expanded=true", `${TOGGLE}.getAttribute('aria-expanded') === 'true' && ${TOGGLE}.textContent === 'Hide charts'`],
  ["focus stays on the toggle after expanding", `document.activeElement === ${TOGGLE}`],
  ["panel body visible", `${BODY}.hidden === false && ${BODY}.offsetParent !== null`],
  ["mobile chart variant shown", `getComputedStyle(${P}.querySelector('.chart-m')).display === 'block'`],
];
const noTip = ["no tooltip visible without hover, focus or tap", `${tipsVisible} === 0`];
const tipVisible = ["tooltip visible after the interaction with a title and value", `${tipsVisible} === 1 && [...document.querySelectorAll('.chart-tip')].filter((e) => !e.hidden).every((t) => t.querySelector('.t1').textContent.length > 3 && t.querySelector('.t2').textContent.length > 3)`];
const noPanel = ["no analytics panel rendered", `${P}.querySelectorAll('.studio').length === 0`];

const SHOTS = [
  // ---- desktop 1280
  { name: "01-desktop-default", vp: D, hash: "state=default&cur=USD", checks: [...active([...expandedDesktop, noTip, ["daily chart: 30 bars", `${barsVisible("d")} === 30`], ["no weekly note", `${P}.querySelectorAll('.mode-note').length === 0`], ["bars, daily table and card agree exactly", exact("USD")]])] },
  { name: "02-desktop-default-clean", vp: D, hash: "state=default&cur=USD&clean=1", checks: [...active([noTip, ["review tags hidden", `[...document.querySelectorAll('.rtag')].every((e) => e.offsetParent === null)`]])] },
  { name: "03-desktop-tooltip-hover", vp: D, hash: "state=default&cur=USD", post: [{ hover: ".chart-d .bar[data-i='23']" }], checks: [tipVisible] },
  { name: "04-desktop-tooltip-keyboard", vp: D, hash: "state=default&cur=USD", post: [{ focus: ".chart-wrap" }, { key: "ArrowRight", times: 3 }], checks: [tipVisible, ["chart wrap shows keyboard focus", `document.activeElement.classList.contains('chart-wrap')`], ["live region announces the bar", `${P}.querySelector('[data-live]').textContent.length > 10`]] },
  { name: "05-desktop-jpy-tab", vp: D, hash: "state=default&cur=JPY", checks: [...active([noTip, ["JPY bars, table and card agree exactly (zero-decimal)", exact("JPY")]])] },
  { name: "06-desktop-range-90-daily", vp: D, hash: "state=default&cur=USD&range=90", checks: [...active([noTip, ["90 calendar days stay DAILY: 90 bars, no weekly note", `${barsVisible("d")} === 90 && ${P}.querySelectorAll('.mode-note').length === 0`], ["bars, daily table and card agree exactly", exact("USD")]])] },
  { name: "07-desktop-range-120-weekly", vp: D, hash: "state=default&cur=USD&range=120", checks: [...active([noTip, ["over 90 days is WEEKLY: 17-19 bars and the weekly note", `${barsVisible("d")} >= 17 && ${barsVisible("d")} <= 19 && ${P}.querySelectorAll('.mode-note').length === 1`], ["weekly bars, daily table and card agree exactly", exact("USD")], ["daily table keeps one row per day with invoices (more rows than bars)", `${P}.querySelectorAll('.data-alt tbody tr').length > ${barsVisible("d")}`]])] },
  { name: "08-desktop-weekly-tooltip-hover", vp: D, hash: "state=default&cur=USD&range=120", post: [{ hover: ".chart-d .bar[data-i='10']" }], checks: [tipVisible, ["weekly tooltip names a week range", `document.querySelector('.chart-tip:not([hidden]) .t1').textContent.includes('–')`]] },
  { name: "09-desktop-weekly-table-open", vp: D, hash: "state=default&cur=USD&range=120", pre: [{ eval: `${P}.querySelector('.data-alt').open = true` }], checks: [["daily table disclosure open", `${P}.querySelector('.data-alt').open === true`], ["exact agreement", exact("USD")]] },
  { name: "10-desktop-dark", vp: D, hash: "state=default&cur=USD&theme=dark", checks: [...active([noTip])] },
  { name: "11-desktop-dark-error", vp: D, hash: "state=error&theme=dark", checks: [noPanel, ["error alert shown with Retry", `${P}.querySelector('[role=alert] button').textContent === 'Retry'`]] },
  { name: "12-desktop-loading", vp: D, hash: "state=loading", checks: [["loading panel has NO Studio badge", `${studioBadge} === 0`], ["panel busy", `${PANEL}.getAttribute('aria-busy') === 'true'`], ["no vendor area while loading", `${vendorSlot} === 0`], noTip] },
  { name: "13-desktop-empty", vp: D, hash: "state=empty", checks: [noPanel, ["existing empty state", `${P}.querySelector('#dash-empty-range h2').textContent === 'No invoices match these filters'`]] },
  { name: "14-desktop-error", vp: D, hash: "state=error", checks: [noPanel, ["error alert shown with Retry", `${P}.querySelector('[role=alert] button').textContent === 'Retry'`]] },
  { name: "15-desktop-studio-unavailable", vp: D, hash: "state=unavailable", checks: [["fallback has NO Studio badge, NO vendor area, NO toggle", `${studioBadge} === 0 && ${vendorSlot} === 0 && ${P}.querySelectorAll('.studio-toggle').length === 0`], ["truthful wording 'Charts unavailable'", `${P}.querySelector('.studio .notice').textContent.includes('Charts unavailable')`]] },
  { name: "16-desktop-studio-unavailable-dark", vp: D, hash: "state=unavailable&theme=dark", checks: [["fallback has NO Studio badge", `${studioBadge} === 0`]] },
  { name: "17-desktop-studio-off", vp: D, hash: "state=off", checks: [noPanel] },
  { name: "18-desktop-session-expired", vp: D, hash: "state=session-expired", checks: [["authenticated content removed from view", `document.getElementById('app-authed').hidden === true && !document.querySelector('.studio:not([hidden])') || document.getElementById('app-authed').hidden === true`], ["session-expired notice", `document.body.textContent.includes('Your session has expired.')`]] },
  { name: "19-tablet-820-default", vp: T, hash: "state=default&cur=USD", checks: [...active([...expandedDesktop, noTip])] },
  // ---- mobile 390 (emulated)
  { name: "20-mobile-390-collapsed-default", vp: M, hash: "state=default&cur=USD", checks: [...collapsedMobile, noTip] },
  { name: "21-mobile-390-collapsed-clean", vp: M, hash: "state=default&cur=USD&clean=1", checks: [...collapsedMobile] },
  { name: "22-mobile-390-expanded-keyboard", vp: M, hash: "state=default&cur=USD", pre: [{ focus: ".studio-toggle" }, { key: "Enter", times: 1 }], checks: [...expandedMobile, ...active([noTip])] },
  { name: "23-mobile-390-expanded-tooltip-tap", vp: M, hash: "state=default&cur=USD", pre: [{ tap: ".studio-toggle" }], post: [{ tap: ".chart-m .bar[data-i='20']" }], checks: [tipVisible] },
  { name: "24-mobile-390-weekly-expanded", vp: M, hash: "state=default&cur=USD&range=120&panel=open", checks: [...active([noTip, ["weekly: 17-19 bars and the weekly note", `${P}.querySelectorAll('.chart-m .bar').length >= 17 && ${P}.querySelectorAll('.chart-m .bar').length <= 19 && ${P}.querySelectorAll('.mode-note').length === 1`], ["exact agreement", exact("USD")]])] },
  { name: "25-mobile-390-range-90-daily-expanded", vp: M, hash: "state=default&cur=USD&range=90&panel=open", checks: [...active([noTip, ["90 days daily on mobile", `${P}.querySelectorAll('.chart-m .bar').length === 90`]])] },
  { name: "26-mobile-390-eur-expanded", vp: M, hash: "state=default&cur=EUR&panel=open", checks: [...active([noTip, ["EUR exact agreement", exact("EUR")]])] },
  { name: "27-mobile-390-dark-collapsed", vp: M, hash: "state=default&cur=USD&theme=dark", checks: [...collapsedMobile] },
  { name: "28-mobile-390-dark-expanded", vp: M, hash: "state=default&cur=USD&theme=dark&panel=open", checks: [...active([noTip])] },
  { name: "29-mobile-390-loading", vp: M, hash: "state=loading", checks: [["loading has NO Studio badge", `${studioBadge} === 0`], ["collapsed by default on mobile", `${TOGGLE}.getAttribute('aria-expanded') === 'false'`]] },
  { name: "30-mobile-390-empty", vp: M, hash: "state=empty", checks: [noPanel] },
  { name: "31-mobile-390-error", vp: M, hash: "state=error", checks: [noPanel] },
  { name: "32-mobile-390-error-dark", vp: M, hash: "state=error&theme=dark", checks: [noPanel] },
  { name: "33-mobile-390-studio-unavailable", vp: M, hash: "state=unavailable", checks: [["fallback has NO Studio badge and NO toggle", `${studioBadge} === 0 && ${P}.querySelectorAll('.studio-toggle').length === 0`]] },
  { name: "34-mobile-390-session-expired", vp: M, hash: "state=session-expired", checks: [["session-expired notice", `document.body.textContent.includes('Your session has expired.')`]] },
];

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".png")) rmSync(join(OUT, f));
const profile = mkdtempSync(join(tmpdir(), "nmi-a5d-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore", detached: true });
let done = false;
const cleanup = () => {
  if (done) return;
  done = true;
  try { process.kill(-chrome.pid, "SIGKILL"); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => (cleanup(), process.exit(1)));
process.on("uncaughtException", (e) => (console.error(e), cleanup(), process.exit(1)));
process.on("unhandledRejection", (e) => (console.error(e), cleanup(), process.exit(1)));

let version;
for (let i = 0; i < 100 && !version; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) version = await r.json(); } catch {} await sleep(150); }
if (!version) throw new Error("Chrome did not start");
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
let pageErrors = 0;
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown" || (d.method === "Log.entryAdded" && d.params.entry.level === "error")) pageErrors++;
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (d) => (d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true }); if (r.exceptionDetails) throw new Error(`eval failed: ${expression.slice(0, 90)} :: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`); return r.result.value; };
await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");

const center = async (sel) => ev(`(() => { const e = document.querySelector('.state-page:not([hidden]) ${sel.replace(/'/g, "\\'")}') || document.querySelector('${sel.replace(/'/g, "\\'")}'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const KEYS = { ArrowRight: [39, "ArrowRight"], ArrowLeft: [37, "ArrowLeft"], Enter: [13, "Enter"] };
async function act(a) {
  if (a.eval) return ev(a.eval);
  if (a.focus) { await ev(`(document.querySelector('.state-page:not([hidden]) ${a.focus}')).focus()`); return; }
  if (a.hover) { const p = await center(a.hover); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y }); return; }
  if (a.tap) { const p = await center(a.tap); await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] }); await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); return; }
  if (a.key) {
    const [vk, code] = KEYS[a.key];
    for (let i = 0; i < (a.times ?? 1); i++) {
      await send("Input.dispatchKeyEvent", a.key === "Enter" ? { type: "keyDown", key: "Enter", code, windowsVirtualKeyCode: vk, text: "\r" } : { type: "rawKeyDown", key: a.key, code, windowsVirtualKeyCode: vk });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: a.key, code, windowsVirtualKeyCode: vk });
    }
  }
}

const report = [];
let failures = 0;
let n = 0;
for (const shot of SHOTS) {
  const vp = shot.vp;
  pageErrors = 0;
  await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.dsf, mobile: vp.mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile });
  await send("Page.navigate", { url: `${PAGE}?v=${++n}#${shot.hash}` });
  await sleep(500);
  for (const a of shot.pre ?? []) { await act(a); await sleep(150); }
  const m = await send("Page.getLayoutMetrics");
  const height = Math.ceil(m.cssContentSize.height);
  await ev("window.scrollTo(0, 0)");
  // Let fixed elements (Nudgey button, mobile nav) sit at the bottom of the full page.
  await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height, deviceScaleFactor: vp.dsf, mobile: vp.mobile });
  await sleep(250);
  for (const a of shot.post ?? []) { await act(a); await sleep(150); }
  await sleep(100);
  const overflow = await ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");
  const results = [["no page-level horizontal overflow", overflow <= 0, `${overflow}px`], ["no page errors", pageErrors === 0, `${pageErrors}`]];
  for (const [name, expr] of shot.checks ?? []) {
    let ok = false, detail = "";
    try { ok = (await ev(expr)) === true; } catch (e) { detail = String(e.message).slice(0, 160); }
    results.push([name, ok, detail]);
  }
  const bad = results.filter((r) => !r[1]);
  failures += bad.length;
  const shotData = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${shot.name}.png`), Buffer.from(shotData.data, "base64"));
  report.push({ shot: shot.name, viewport: `${vp.w}x${height}@${vp.dsf}x`, checks: results.map(([name, ok, detail]) => ({ name, result: ok ? "PASS" : "FAIL", ...(detail ? { detail } : {}) })) });
  console.log(`${bad.length ? "FAIL" : "PASS"}  ${shot.name}  ${vp.w}x${height} @${vp.dsf}x  ${results.length - bad.length}/${results.length}${bad.length ? "  <- " + bad.map((b) => b[0] + " " + b[2]).join("; ") : ""}`);
}
const total = report.reduce((a, r) => a + r.checks.length, 0);
writeFileSync(join(here, "design-checks.json"), JSON.stringify({ task: "NMI-PROTOTYPE-10D-A5-D", note: "Headless Chrome (CDP), emulated viewports, synthetic static mockup. Not physical-device, Safari/Firefox or assistive-technology QA.", chrome: version.Browser, total, failed: failures, shots: report }, null, 2) + "\n");
console.log(`\n${total - failures}/${total} design checks passed across ${SHOTS.length} previews`);
ws.close();
cleanup();
process.exit(failures ? 1 : 0);
