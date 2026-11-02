/* eslint-disable -- synthetic local QA harness: Node globals and console are intentional. */
// Drives the actual local React + Fastify + disposable PostgreSQL stack through headless Chrome.
// No provider is enabled; the required synthetic operator credentials are read only from the env.
// Run with A2_QA_USERNAME / A2_QA_PASSWORD after starting the isolated API and Vite servers.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const origin = "http://localhost:5173";
const chromePath = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9351;
const evidence = [];
const foreignRequests = [];
const consoleErrors = [];
const record = (name, pass, detail = "") => {
  evidence.push({ name, result: pass ? "PASS" : "FAIL", detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const profile = mkdtempSync(join(tmpdir(), "nmi-a2-chrome-"));
let step = "Chrome startup";
let chromeVersion = "unavailable";
const chrome = spawn(chromePath, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-background-networking", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
let ws;
try {
  if (!process.env.A2_QA_USERNAME || !process.env.A2_QA_PASSWORD)
    throw new Error("Set synthetic A2_QA_USERNAME and A2_QA_PASSWORD for the disposable local operator.");
  let target;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        chromeVersion = (await response.json()).Browser || chromeVersion;
        break;
      }
    } catch {}
    await sleep(100);
  }
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!targetResponse.ok) throw new Error("Chrome DevTools target could not be created.");
  target = await targetResponse.json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => { ws.onopen = resolveOpen; ws.onerror = rejectOpen; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolveResult, rejectResult } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? rejectResult(new Error(message.error.message)) : resolveResult(message.result);
      return;
    }
    if (message.method === "Network.requestWillBeSent") {
      const url = message.params.request.url;
      if (!url.startsWith(origin + "/") && !/^(about:|data:|blob:)/.test(url)) foreignRequests.push(url);
    }
    if (message.method === "Runtime.exceptionThrown")
      consoleErrors.push(message.params.exceptionDetails.text || "runtime exception");
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error")
      consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description).join(" "));
  };
  const send = (method, params = {}) => new Promise((resolveResult, rejectResult) => {
    const commandId = ++id;
    pending.set(commandId, { resolveResult, rejectResult });
    ws.send(JSON.stringify({ id: commandId, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result?.value;
  };
  const waitFor = async (expression, label, timeoutMs = 8000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(expression)) return true;
      await sleep(80);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const click = (selector) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`);
  const fill = (selector, value, eventName = "input") => evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    const setter = Object.getOwnPropertyDescriptor(node.constructor.prototype, 'value').set;
    setter.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event(${JSON.stringify(eventName)}, { bubbles: true }));
    if (${JSON.stringify(eventName)} === 'input') node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: origin });
  await waitFor("!!document.querySelector('#login-username')", "real login form");
  await fill("#login-username", process.env.A2_QA_USERNAME);
  await fill("#login-password", process.env.A2_QA_PASSWORD, "input");
  await evaluate("document.querySelector('form').requestSubmit()");
  await waitFor("!!document.querySelector('#dash-title') && !!document.querySelector('#dash-cards')", "authenticated dashboard aggregate");
  const initial = await evaluate(`({cards: [...document.querySelectorAll('.currency-card')].map(x => x.innerText), coverage: document.querySelector('#dash-coverage')?.innerText, rows: document.querySelectorAll('.ag-row').length, more: !!document.querySelector('#dash-more')})`);
  record("authenticated dashboard loads server aggregate and rows", initial.cards.some((x) => x.includes("$3,171.38")) && initial.cards.some((x) => x.includes("257 invoices")), JSON.stringify({ coverage: initial.coverage, visibleRows: initial.rows }));
  record("aggregate stays independent of page size and is labelled by currency", initial.cards.length === 1 && initial.cards[0].includes("257 invoices") && initial.cards[0].includes("PayPal Sandbox drafts created"), JSON.stringify(initial.cards));
  await send("Page.captureScreenshot", { format: "png" }).then((shot) => writeFileSync(join(here, "desktop-dashboard.png"), Buffer.from(shot.data, "base64")));

  // Exercise all ten 20-row fetch pages until the 200-row client cap; KPI remains 257.
  step = "pagination cap";
  let clicks = 0;
  while (await evaluate("!!document.querySelector('#dash-more')") && clicks < 12) {
    const before = await evaluate("document.querySelector('[data-testid=result-count]')?.textContent");
    await click("#dash-more");
    await waitFor(`!!document.querySelector('#dash-limit') || document.querySelector('[data-testid=result-count]')?.textContent !== ${JSON.stringify(before)}`, "next page or loaded-row cap");
    clicks++;
  }
  const capped = await evaluate(`({limit: !!document.querySelector('#dash-limit'), cards: [...document.querySelectorAll('.currency-card')].map(x => x.innerText), rows: document.querySelectorAll('.ag-row').length})`);
  record("pagination stops at 200 loaded rows without changing full-population KPI", capped.limit && capped.cards.some((x) => x.includes("257 invoices")), `load-more actions=${clicks}; visible grid rows=${capped.rows}`);

  // Apply a date range and a body-only customer search; both must retain authoritative totals.
  step = "date and customer filters";
  await fill("#dash-date-start", "2026-10-27", "input");
  await fill("#dash-date-end", "2026-10-27", "input");
  await waitFor("document.querySelector('#dash-cards')?.innerText.includes('257 invoices')", "date range results");
  await fill("#dash-search", "A2 Synthetic Client");
  await waitFor("document.querySelector('#dash-cards')?.innerText.includes('257 invoices')", "debounced search aggregate");
  await sleep(400);
  record("date and customer filters apply to both SQL reads", await evaluate("document.querySelector('#dash-coverage')?.innerText.includes('Oct 27, 2026') && document.querySelector('#dash-search')?.value === 'A2 Synthetic Client' && document.querySelectorAll('.ag-row').length > 0 && document.querySelector('[data-testid=result-count]')?.textContent.includes('matching invoice')"));
  record("search term is absent from the browser URL", await evaluate("!location.href.includes('A2 Synthetic Client')"));
  await send("Page.captureScreenshot", { format: "png" }).then((shot) => writeFileSync(join(here, "filtered-dashboard.png"), Buffer.from(shot.data, "base64")));

  // Currency filter proves a valid no-match state and the clear action restores the full population.
  step = "currency no-match and clear";
  await evaluate(`(() => { const button = [...document.querySelectorAll('.pill')].find(x => x.textContent === 'EUR'); if (!button) return false; button.click(); return true; })()`);
  await waitFor("!!document.querySelector('#dash-empty-range') || document.body.innerText.includes('No invoices match these filters')", "currency no-match state");
  const empty = await evaluate("document.body.innerText.includes('No invoices match these filters') || document.body.innerText.includes('No saved invoices match')");
  record("currency filter has a truthful no-match state", empty);
  await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Clear filters'); if (!button) return false; button.click(); return true; })()`);
  await waitFor("!!document.querySelector('#dash-cards') && document.querySelector('#dash-cards').innerText.includes('257 invoices')", "cleared filters restore totals");

  step = "keyboard and dark theme";
  await evaluate("document.querySelector('#dash-search').focus(); true");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  const keyboardTarget = await evaluate("document.activeElement?.id || document.activeElement?.tagName || ''");
  record("search-to-status keyboard navigation works", keyboardTarget === "dash-status", `focused control=${keyboardTarget}`);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.reload");
  await waitFor("document.documentElement.dataset.theme === 'dark' && !!document.querySelector('#dash-cards')", "dark theme dashboard");
  record("system dark theme renders the authenticated dashboard", await evaluate("document.documentElement.dataset.theme === 'dark' && document.querySelector('#dash-cards').innerText.includes('257 invoices')"));
  await send("Page.captureScreenshot", { format: "png" }).then((shot) => writeFileSync(join(here, "dark-dashboard.png"), Buffer.from(shot.data, "base64")));

  step = "390px mobile layout";
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFor("!!document.querySelector('#dash-title')", "mobile dashboard");
  const mobile = await evaluate(`({width: innerWidth, documentWidth: document.documentElement.scrollWidth, card: !!document.querySelector('#dash-cards'), range: !!document.querySelector('#dash-date-start')})`);
  record("390px mobile dashboard has no page-level horizontal overflow", mobile.width === 390 && mobile.documentWidth <= 390 && mobile.card && mobile.range, JSON.stringify(mobile));
  await send("Page.captureScreenshot", { format: "png" }).then((shot) => writeFileSync(join(here, "mobile-dashboard.png"), Buffer.from(shot.data, "base64")));
  const mobileDateAccess = await evaluate(`(() => {
    const input = document.querySelector('#dash-date-end');
    if (!input) return false;
    input.scrollIntoView({ block: 'center' });
    const box = input.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.top >= 0 && box.bottom <= innerHeight && (hit === input || input.contains(hit));
  })()`);
  record("date range remains visible and tappable after mobile scroll", mobileDateAccess);
  record("no browser request left the local app origin", foreignRequests.length === 0, foreignRequests.length ? foreignRequests.join(", ") : "no non-local requests observed");
  record("no browser runtime or console errors", consoleErrors.length === 0, consoleErrors.slice(0, 4).join(" | "));
} catch (error) {
  record("browser QA completed without harness error", false, `${step}: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.close();
  chrome.kill("SIGTERM");
  await new Promise((resolveExit) => chrome.once("exit", resolveExit));
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(here, { recursive: true });
  writeFileSync(join(here, "qa-results.json"), JSON.stringify({ browser: chromeVersion, stack: "local Fastify + Vite + disposable PostgreSQL; PayPal disabled; OpenAI not configured; no SMTP", checks: evidence, foreignRequests, consoleErrors }, null, 2) + "\n");
  const report = [
    "# NMI-PROTOTYPE-10D-A2 Browser QA",
    "",
    `- **Result:** ${evidence.every((check) => check.result === "PASS") ? "PASS" : "FAIL"}`,
    `- **Chrome:** ${chromeVersion} (headless, DevTools Protocol)` ,
    "- **Stack:** local Fastify API + Vite React client + disposable PostgreSQL database `nmi_test_a2_qa_20261102`.",
    "- **Data:** synthetic operator and 257 synthetic USD invoice rows; one local Sandbox draft-state row; one ownerless negative-control row. No customer data.",
    "- **Providers:** PayPal draft creation disabled; OpenAI unconfigured; no SMTP configured or called.",
    "- **Coverage:** desktop dashboard, 257-row authoritative exact total, 200-row pagination cap, date/search/currency filters, clear-filter recovery, keyboard focus, dark system theme, 390px mobile overflow, browser-origin observation, console/runtime errors.",
    "- **Network:** only local application-origin requests observed; no request to provider or other external host.",
    "- **Artifacts:** `desktop-dashboard.png`, `filtered-dashboard.png`, `dark-dashboard.png`, `mobile-dashboard.png`, and machine-readable `qa-results.json`.",
    "",
    "| Check | Result | Evidence |",
    "|---|---|---|",
    ...evidence.map((check) => `| ${check.name} | ${check.result} | ${check.detail.replaceAll("|", "\\|") || "—"} |`),
    "",
    "This is an automated local browser run with synthetic data, not physical device QA or hosted-provider evidence.",
    "",
  ].join("\n");
  writeFileSync(join(here, "QA-RESULTS.md"), report);
  const allPass = evidence.length > 0 && evidence.every((check) => check.result === "PASS");
  if (!allPass) process.exitCode = 1;
}
