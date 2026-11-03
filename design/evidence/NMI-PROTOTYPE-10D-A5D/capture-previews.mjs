/* eslint-disable -- design-only Node tooling (not production code): uses Node globals by design. */
// NMI-PROTOTYPE-10D-A5-D: renders the static A5-D mockup to PNG previews with headless Chrome (CDP).
//
//   node design/evidence/NMI-PROTOTYPE-10D-A5D/build-mockup.mjs
//   node design/evidence/NMI-PROTOTYPE-10D-A5D/capture-previews.mjs
//
// Opens only the local file:// mockup (no network, no app, no provider). Desktop 1280px, tablet 820px and the
// 390px mobile viewport (emulated, device scale 2). Headless/emulated evidence is NOT physical-device QA.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const SHOTS = [
  ["01-desktop-default", D, "state=default&cur=USD"],
  ["02-desktop-default-clean", D, "state=default&cur=USD&clean=1"],
  ["03-desktop-jpy-tab", D, "state=default&cur=JPY"],
  ["04-desktop-dark", D, "state=default&cur=USD&theme=dark"],
  ["05-desktop-loading", D, "state=loading"],
  ["06-desktop-empty", D, "state=empty"],
  ["07-desktop-error", D, "state=error"],
  ["08-desktop-studio-unavailable", D, "state=unavailable"],
  ["09-desktop-session-expired", D, "state=session-expired"],
  ["10-tablet-820-default", T, "state=default&cur=USD"],
  ["11-mobile-390-default", M, "state=default&cur=USD"],
  ["12-mobile-390-default-clean", M, "state=default&cur=USD&clean=1"],
  ["13-mobile-390-eur-tab", M, "state=default&cur=EUR&clean=1"],
  ["14-mobile-390-dark", M, "state=default&cur=USD&theme=dark&clean=1"],
  ["15-mobile-390-loading", M, "state=loading"],
  ["16-mobile-390-empty", M, "state=empty"],
  ["17-mobile-390-error", M, "state=error"],
  ["18-mobile-390-studio-unavailable", M, "state=unavailable"],
  ["19-mobile-390-session-expired", M, "state=session-expired"],
];

mkdirSync(OUT, { recursive: true });
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
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (d) => (d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");

let n = 0;
for (const [name, vp, hash] of SHOTS) {
  await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.dsf, mobile: vp.mobile });
  await send("Page.navigate", { url: `${PAGE}?v=${++n}#${hash}` });
  await sleep(500);
  const m = await send("Page.getLayoutMetrics");
  const height = Math.ceil(m.cssContentSize.height);
  // Let fixed elements (Nudgey button, mobile nav) sit at the bottom of the full page.
  await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height, deviceScaleFactor: vp.dsf, mobile: vp.mobile });
  await sleep(250);
  const horizontal = (await send("Runtime.evaluate", { expression: "document.documentElement.scrollWidth - document.documentElement.clientWidth", returnByValue: true })).result.value;
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`${name}.png  ${vp.w}x${height} @${vp.dsf}x  horizontal overflow: ${horizontal}px`);
}
ws.close();
cleanup();
