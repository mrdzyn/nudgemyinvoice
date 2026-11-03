/* eslint-disable -- design-only Node tooling (not production code): uses Node globals by design. */
// NMI-PROTOTYPE-10D-A5-D design-only mockup generator.
//
//   node design/evidence/NMI-PROTOTYPE-10D-A5D/build-mockup.mjs
//
// Writes design/mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html: ONE static file that inlines the REAL
// app stylesheets (apps/web/src/styles/tokens.css + app.css) so the preview uses the existing NudgeMyInvoice
// design system verbatim, plus a small review-only stylesheet for the proposed "Studio analytics" panel.
//
// SYNTHETIC DATA ONLY (seeded generator, example.test addresses). AG Studio is NOT installed, no licence key
// is used, nothing is fetched, and the chart/status visuals are inline SVG/HTML that illustrate the DESIGN INTENT
// for a view-only Studio region. They are NOT renderings of AG Studio, whose real chrome is unverified until A5-I1.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const OUT = join(root, "design/mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html");
const tokensCss = readFileSync(join(root, "apps/web/src/styles/tokens.css"), "utf8");
const appCss = readFileSync(join(root, "apps/web/src/styles/app.css"), "utf8");

/* ------------------------------------------------------------------ synthetic data (seeded, deterministic) */
let seed = 20261104;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ZONE = "Asia/Manila";
const CURRENCIES = ["USD", "EUR", "JPY"];
const EXP = { USD: 2, EUR: 2, JPY: 0 };
const days = [];
for (let i = 0; i < 30; i++) {
  const d = new Date(Date.UTC(2026, 9, 5 + i));
  days.push({ iso: d.toISOString().slice(0, 10), dow: d.getUTCDay() });
}
const AVG_MINOR = { USD: 21500, EUR: 18200, JPY: 31000 };
const PER_DAY = { USD: 5.2, EUR: 2.4, JPY: 1.1 };
const data = {};
for (const c of CURRENCIES) {
  data[c] = days.map((d) => {
    const weekend = d.dow === 0 || d.dow === 6;
    const n = Math.max(0, Math.round(PER_DAY[c] * (weekend ? 0.35 : 1) * (0.4 + rnd() * 1.3) - (rnd() < 0.12 ? 2 : 0)));
    let total = 0;
    for (let k = 0; k < n; k++) total += Math.round(AVG_MINOR[c] * (0.25 + rnd() * 1.6));
    if (c === "JPY") total = Math.round(total / 100) * 100;
    return { day: d.iso, count: n, minor: total };
  });
}
const sum = (c) => data[c].reduce((a, d) => ({ count: a.count + d.count, minor: a.minor + d.minor }), { count: 0, minor: 0 });
const totals = Object.fromEntries(CURRENCIES.map((c) => [c, sum(c)]));
// PayPal Sandbox draft-state counts per currency; each row sums exactly to that currency's invoice count.
const split = (n, w) => {
  const raw = w.map((x) => Math.floor(n * x));
  raw[0] += n - raw.reduce((a, b) => a + b, 0);
  return { none: raw[0], progress: raw[1], created: raw[2], attention: raw[3] };
};
const states = { USD: split(totals.USD.count, [0.0, 0.03, 0.06, 0.02]), EUR: split(totals.EUR.count, [0.0, 0.0, 0.1, 0.04]), JPY: split(totals.JPY.count, [0.0, 0.0, 0.0, 0.05]) };
for (const c of CURRENCIES) states[c].none = totals[c].count - states[c].progress - states[c].created - states[c].attention;

/* ------------------------------------------------------------------ formatting (mockup only; production must use exact minor-unit/BigInt formatting) */
const money = (minor, c, compact = false) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c, minimumFractionDigits: compact ? 0 : EXP[c], maximumFractionDigits: compact ? 0 : EXP[c], ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}) }).format(minor / 10 ** EXP[c]);
const dayLabel = (iso) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/* ------------------------------------------------------------------ chart (inline SVG, two layouts so text stays readable at 390px) */
function niceStep(peakMinor, c) {
  const unit = 10 ** EXP[c];
  const raw = peakMinor / unit / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow * unit;
  return 10 * pow * unit;
}
function chart(c, variant) {
  const mobile = variant === "m";
  const W = mobile ? 340 : 640;
  const H = mobile ? 230 : 280;
  const m = { l: mobile ? 46 : 64, r: 8, t: 12, b: 28 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const rows = data[c];
  const peakMinor = Math.max(...rows.map((r) => r.minor));
  const step = niceStep(peakMinor, c);
  const intervals = Math.ceil(peakMinor / step);
  const max = step * intervals;
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => step * i);
  const bw = pw / rows.length;
  const hi = rows.reduce((b, r, i) => (r.minor > rows[b].minor ? i : b), 0);
  let s = `<svg class="chart-svg chart-${variant}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-${c}-${variant}-t chart-${c}-${variant}-d" focusable="false">`;
  s += `<title id="chart-${c}-${variant}-t">Daily ${c} invoice value</title>`;
  s += `<desc id="chart-${c}-${variant}-d">Bar chart of ${c} invoice totals by local creation day, ${dayLabel(rows[0].day)} to ${dayLabel(rows[rows.length - 1].day)}. Peak ${money(rows[hi].minor, c)} on ${dayLabel(rows[hi].day)}. The same values are in the table below the chart.</desc>`;
  for (const t of ticks) {
    const y = m.t + ph - (t / max) * ph;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" class="grid${t === 0 ? " base" : ""}"/>`;
    s += `<text x="${m.l - 6}" y="${y + 4}" text-anchor="end" class="axis">${esc(money(t, c, true))}</text>`;
  }
  rows.forEach((r, i) => {
    const h = (r.minor / max) * ph;
    const x = m.l + i * bw + bw * 0.14;
    s += `<rect x="${x.toFixed(1)}" y="${(m.t + ph - h).toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${Math.max(h, r.minor ? 1 : 0).toFixed(1)}" rx="2" class="bar${i === hi ? " hot" : ""}"/>`;
  });
  const every = mobile ? 7 : 5;
  rows.forEach((r, i) => {
    if ((i % every === 0 && rows.length - 1 - i >= 3) || i === rows.length - 1) s += `<text x="${(m.l + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="${i === rows.length - 1 && mobile ? "end" : "middle"}" class="axis">${dayLabel(r.day)}</text>`;
  });
  // Illustrative hover/tap tooltip on the peak day (static in the preview).
  const tx = m.l + hi * bw + bw / 2;
  const tw = mobile ? 168 : 170;
  const barTop = m.t + ph - (rows[hi].minor / max) * ph;
  const above = barTop - 54 >= m.t - 2;
  // If the peak bar reaches the top, put the tooltip beside the bar instead of over it.
  const tl = above ? Math.min(Math.max(tx - tw / 2, m.l), W - m.r - tw) : tx + bw * 0.8 + tw > W - m.r ? tx - bw * 0.8 - tw : tx + bw * 0.8;
  const ty = above ? barTop - 54 : m.t;
  s += `<g class="tip"><rect x="${tl}" y="${ty}" width="${tw}" height="46" rx="6"/><text x="${tl + 8}" y="${ty + 16}" class="t1">${dayLabel(rows[hi].day)}, ${rows[hi].day.slice(0, 4)}</text><text x="${tl + 8}" y="${ty + 32}" class="t2">${esc(money(rows[hi].minor, c))} · ${rows[hi].count} invoice${rows[hi].count === 1 ? "" : "s"}</text></g>`;
  return s + `</svg>`;
}
const peak = (c) => data[c].reduce((b, r) => (r.minor > b.minor ? r : b));
const tableFor = (c) =>
  `<table class="data tight"><caption class="sr-only">${c} invoices by local creation day (${ZONE})</caption><thead><tr><th scope="col">Day</th><th scope="col" class="r">Invoices</th><th scope="col" class="r">Total (${c})</th></tr></thead><tbody>${data[c]
    .filter((r) => r.count)
    .map((r) => `<tr><th scope="row">${dayLabel(r.day)}</th><td class="r num">${r.count}</td><td class="r num">${esc(money(r.minor, c))}</td></tr>`)
    .join("")}</tbody></table>`;

/* ------------------------------------------------------------------ status breakdown */
const STATE_META = [
  ["none", "No PayPal draft", "neutral", "○"],
  ["progress", "In progress", "info", "◔"],
  ["created", "PayPal draft created", "ok", "✓"],
  ["attention", "Needs attention", "warn", "!"],
];
const statusRow = (c) => {
  const t = totals[c].count;
  const st = states[c];
  const segs = STATE_META.filter(([k]) => st[k] > 0)
    .map(([k, l]) => `<span class="seg seg-${k}" style="flex:${st[k]}" title="${l}: ${st[k]}"></span>`)
    .join("");
  const list = STATE_META.map(([k, l, kind, ic]) => `<li><span class="badge badge-${kind}"><span aria-hidden="true">${ic}</span>${l}</span><span class="num cnt">${st[k]}</span></li>`).join("");
  return `<div class="status-row" data-cur="${c}"><div class="status-head"><strong>${c}</strong><span class="muted">${t} invoice${t === 1 ? "" : "s"}</span></div><div class="stack" role="img" aria-label="${c} PayPal Sandbox draft status: ${STATE_META.map(([k, l]) => `${l} ${st[k]}`).join(", ")}">${segs}</div><ul class="state-list">${list}</ul></div>`;
};

/* ------------------------------------------------------------------ regions */
const kpiCards = CURRENCIES.map(
  (c) => `<div class="currency-card" data-cur="${c}"><div class="top"><span>${c}</span><span class="badge badge-neutral">${totals[c].count} invoices</span></div><div class="amount num">${esc(money(totals[c].minor, c))}</div><div class="meta">Full matching operator-owned ${c} total · PayPal Sandbox drafts created: ${states[c].created}</div></div>`,
).join("");
const skCard = `<div class="currency-card"><div class="skeleton sk-h18 sk-w40"></div><div class="skeleton sk-h30 sk-w70"></div><div class="skeleton sk-h14 sk-w55"></div></div>`;

const filterBar = `<div class="table-card"><div class="filters">
  <div class="pills" role="group" aria-label="Filter by currency"><button class="pill" type="button" aria-pressed="true">All currencies</button>${["USD", "EUR", "GBP", "CAD", "AUD", "JPY"].map((c) => `<button class="pill" type="button" aria-pressed="false">${c}</button>`).join("")}</div>
  <div class="filter-controls">
    <fieldset class="date-range-filter"><legend>Created date range</legend><div class="date-range-fields"><label><span>From</span><input class="input date-range-input" type="date" value="2026-10-05" aria-label="From date"></label><label><span>Through</span><input class="input date-range-input" type="date" value="2026-11-03" aria-label="Through date"></label></div></fieldset>
    <div><label class="sr-only" for="dash-search">Search invoices</label><input class="input search-input" id="dash-search" type="search" placeholder="Search invoices" autocomplete="off"></div>
    <div><label class="sr-only" for="dash-status">PayPal Sandbox status</label><select class="select" id="dash-status"><option>All PayPal statuses</option><option>No PayPal draft</option><option>In progress</option><option>PayPal draft created</option><option>Needs attention</option></select></div>
  </div></div></div>`;
const coverage = `<p class="hint" id="dash-coverage">Matching invoices owned by this operator, created Oct 5, 2026 through Nov 3, 2026 inclusive (${ZONE}).</p>`;
const cardsNote = `<p class="hint">Totals cover the full matching invoice population, not only rows loaded below. Each card uses one currency; currencies are never added together or converted.</p>`;

const curTabs = (active) =>
  `<div class="cur-tabs" role="tablist" aria-label="Chart currency (view only; does not change the filters)">${CURRENCIES.map((c) => `<button type="button" role="tab" class="cur-tab" aria-selected="${c === active}" tabindex="${c === active ? 0 : -1}">${c}</button>`).join("")}</div>`;

function studioPanel(active) {
  const p = peak(active);
  return `<section class="card studio" id="studio-panel" aria-labelledby="studio-title" data-region="new">
  <span class="rtag rtag-new" aria-hidden="true">NEW · AG Studio view-only region</span>
  <div class="studio-head">
    <div><h2 class="card-title" id="studio-title">Activity analytics</h2>
    <p class="hint hint-tight">Same filters and the same full-population server totals as the cards above. Values are invoice totals by creation day (${ZONE}), not payments.</p></div>
    <div class="studio-actions"><span class="badge badge-info">Studio · view only</span><button type="button" class="btn btn-secondary btn-sm" aria-expanded="true" aria-controls="studio-body">Hide charts</button></div>
  </div>
  <div id="studio-body" class="studio-body">
    <div class="studio-grid">
      <div class="studio-chart" aria-labelledby="chart-h">
        <div class="chart-bar"><h3 id="chart-h" class="h3">Daily invoice value · <span class="cur-now">${active}</span></h3>${curTabs(active)}</div>
        <div class="chart-wrap">${chart(active, "d")}${chart(active, "m")}</div>
        <p class="hint hint-tight">Peak day: ${dayLabel(p.day)} · ${esc(money(p.minor, active))} · ${p.count} invoices. One currency per chart; axes are never shared across currencies.</p>
        <details class="data-alt"><summary>View ${active} data as a table</summary>${tableFor(active)}</details>
      </div>
      <div class="studio-status" aria-labelledby="status-h">
        <h3 id="status-h" class="h3">PayPal Sandbox draft status</h3>
        ${CURRENCIES.map(statusRow).join("")}
        <p class="hint hint-tight"><strong>PayPal draft created</strong> means a Sandbox DRAFT exists. It is not sent, not paid and not overdue.</p>
      </div>
    </div>
    <div class="vendor-slot" aria-hidden="true">Reserved strip: vendor attribution or evaluation watermark, if AG Studio shows one (unverified until A5-I1)</div>
  </div>
</section>`;
}
const studioSkeleton = `<section class="card studio" aria-busy="true" aria-labelledby="studio-title" data-region="new"><span class="rtag rtag-new" aria-hidden="true">NEW · loading</span>
  <p class="sr-only" role="status">Loading analytics</p>
  <div class="studio-head"><div><h2 class="card-title" id="studio-title">Activity analytics</h2></div></div>
  <div class="studio-grid"><div><div class="skeleton sk-h18 sk-w40"></div><div class="skeleton" style="height:230px;margin-top:14px"></div></div>
  <div><div class="skeleton sk-h18 sk-w55"></div>${[1, 2, 3].map(() => `<div class="skeleton sk-h14" style="margin-top:18px;height:22px"></div><div class="skeleton sk-h14 sk-w70"></div>`).join("")}</div></div></section>`;
const studioUnavailable = `<section class="card studio" data-region="new" aria-labelledby="studio-title"><span class="rtag rtag-new" aria-hidden="true">NEW · fallback</span>
  <div class="studio-head"><div><h2 class="card-title" id="studio-title">Activity analytics</h2></div></div>
  <div class="notice notice-info" role="status"><span class="notice-icon" aria-hidden="true">ℹ</span><div><strong>Charts are unavailable right now.</strong> The totals above and the invoice table below are not affected.
  <div class="mt-12"><button type="button" class="btn btn-secondary btn-sm">Try loading charts again</button></div></div></div></section>`;

const rowsGrid = [
  ["ff895600", "Oct 27, 2026", "Synthetic Client 41", "synthetic-41@example.test", "Jan 15, 2030", money(1234, "USD"), "USD", "neutral", "○", "No PayPal draft"],
  ["fb820a49", "Oct 27, 2026", "Synthetic Client 23", "synthetic-23@example.test", "Jan 15, 2030", money(59997, "EUR"), "EUR", "ok", "✓", "PayPal draft created"],
  ["fb410e3c", "Oct 26, 2026", "Synthetic Client 17", "synthetic-17@example.test", "Mar 01, 2030", money(180000, "JPY"), "JPY", "warn", "!", "Needs attention"],
  ["f9c0172d", "Oct 26, 2026", "Synthetic Client 08", "synthetic-08@example.test", "Jan 15, 2030", money(54000, "USD"), "USD", "info", "◔", "Creation in progress"],
];
const gridCard = (loading) => `<div class="table-card ag-mock" data-region="existing"><span class="rtag rtag-old" aria-hidden="true">EXISTING · AG Grid Community 36.2 · unchanged</span>
  <p class="sr-only" role="status" data-testid="result-count">Showing 20 invoices</p>
  <p class="hint grid-note">Sorting reorders only the 20 rows loaded so far. The totals above cover all matching invoices. Search, date, currency and PayPal status filters apply on the server.</p>
  <div class="ag-scroll"><table class="ag-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th class="r">Total</th><th>PayPal Sandbox</th><th>Actions</th></tr></thead><tbody>${
    loading
      ? [1, 2, 3, 4].map(() => `<tr>${[1, 2, 3, 4, 5, 6].map(() => `<td><div class="skeleton sk-h14" style="margin:0"></div></td>`).join("")}</tr>`).join("")
      : rowsGrid.map((r) => `<tr><td><span class="mono">${r[0]}</span><div class="cell-sub">Saved ${r[1]}</div></td><td>${r[2]}<div class="cell-sub">${r[3]}</div></td><td>${r[4]}</td><td class="r"><strong class="num">${esc(r[5])}</strong> <span class="cell-sub">${r[6]}</span></td><td><span class="badge badge-${r[7]}"><span aria-hidden="true">${r[8]}</span>${r[9]}</span></td><td><button type="button" class="btn btn-secondary btn-sm">View</button></td></tr>`).join("")
  }</tbody></table></div>
  <div class="grid-footer"><span class="muted">20 loaded · more available</span><button type="button" class="btn btn-secondary">Load more invoices</button></div></div>`;

const empty = `<div class="empty" id="dash-empty-range"><h2>No invoices match these filters</h2><p>Try a wider date range or clear your filters, or create a new invoice draft.</p><button type="button" class="btn btn-primary">Create an invoice</button></div>`;
const analyticsError = `<div class="notice notice-err" role="alert" id="dash-analytics-error"><span class="notice-icon" aria-hidden="true">!</span><div><strong>Could not load full-population totals.</strong> Could not reach the server. No loaded-row estimate is substituted.<div class="mt-12"><button type="button" class="btn btn-secondary btn-sm">Retry</button></div></div></div>`;

const shellTop = (authed) => `<div class="sandbox-banner" role="note" aria-label="PayPal Sandbox notice"><span><strong>PayPal Sandbox only.</strong> Nothing here moves real money. Creating a PayPal draft does not email the customer.</span><span class="mono">sandbox · draft-only</span></div>
<header class="app-header"><div class="brand"><span class="brand-mark" aria-hidden="true">N</span><span>NudgeMyInvoice</span></div><div class="header-controls"><span class="sandbox-pill">PayPal Sandbox</span>${authed ? `<span class="cell-sub">Signed in as a5-design-owner</span><button type="button" class="btn btn-secondary btn-sm">Sign out</button>` : ""}</div></header>
${authed ? `<nav class="app-nav" aria-label="Main"><button class="nav-link" aria-current="page">Invoice drafts</button><button class="nav-link">New invoice</button></nav>` : ""}`;
const signedNotice = `<div class="notice notice-info notice-compact" role="note"><span class="notice-icon" aria-hidden="true">ℹ</span><div><strong>You are signed in to the server.</strong> Parsing, saving, the invoice list and the saved-invoice pages use the server and PostgreSQL. Saving never creates a PayPal invoice. A PayPal Sandbox DRAFT is created only when you explicitly confirm it on a saved invoice, and only if the server has drafting enabled; the customer is never emailed and no payment is collected.</div></div>`;
const pageHead = `<div class="page-head"><div><h1 class="screen-title">Invoice drafts</h1><p class="subtitle">Saved invoices and their PayPal Sandbox draft status</p></div><button type="button" class="btn btn-primary">New invoice</button></div>`;
const mobileNav = `<nav class="mobile-nav" aria-label="Main (mobile)"><button aria-current="page">Drafts</button><button>New invoice</button><button>Sign out</button></nav>`;
const fab = `<button type="button" class="nudgey-fab-mock">✦ Nudgey</button>`;
const tag = (kind, text) => `<span class="rtag rtag-${kind}" aria-hidden="true">${text}</span>`;

const login = `<section aria-labelledby="login-title"><div class="login-wrap"><div class="card login-card"><div class="login-head"><div class="brand-mark" aria-hidden="true">N</div><h1 class="screen-title" id="login-title">Operator sign in</h1><p class="subtitle">Single-operator console for the PayPal Sandbox demo</p></div>
<div class="notice notice-warn" role="status"><span class="notice-icon" aria-hidden="true">!</span><div><strong>Your session has expired.</strong> Sign in again to continue. Unsaved edits are not kept by the server.</div></div>
<form onsubmit="return false"><div class="field"><label for="u">Username <span class="req" aria-hidden="true">*</span></label><input class="input" id="u" autocomplete="username"></div><div class="field"><label for="p">Password <span class="req" aria-hidden="true">*</span></label><input class="input" id="p" type="password" autocomplete="current-password"></div><button class="btn btn-primary" type="submit">Sign in</button></form>
</div></div></section>`;

/* ------------------------------------------------------------------ pages per state (all pre-rendered; a tiny script picks one from the hash) */
const defaultPage = (cur) => `${pageHead}${tag("old", "EXISTING · filters · single source of truth")}${filterBar}${coverage}${tag("old", "EXISTING · currency cards · full population · unchanged")}<div class="currency-grid" data-region="existing">${kpiCards}</div>${cardsNote}${studioPanel(cur)}${gridCard(false)}`;
const pages = {
  default: (cur) => defaultPage(cur),
  loading: () => `${pageHead}${filterBar}${coverage}<div class="currency-grid" aria-busy="true" aria-label="Loading full-population totals">${skCard}${skCard}${skCard}</div>${studioSkeleton}${gridCard(true)}`,
  empty: () => `${pageHead}${filterBar}${coverage}${empty}`,
  error: () => `${pageHead}${filterBar}${coverage}${analyticsError}${tag("old", "Studio panel is not rendered while totals are unavailable")}${gridCard(false)}`,
  unavailable: () => `${pageHead}${filterBar}${coverage}<div class="currency-grid">${kpiCards}</div>${cardsNote}${studioUnavailable}${gridCard(false)}`,
};

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>NMI A5-D Studio analytics design</title>
<style>
/* ===== real tokens.css (verbatim) ===== */
${tokensCss}
/* ===== real app.css (verbatim) ===== */
${appCss}
/* ===== A5-D review-only additions: the proposed Studio region, annotations and the representative grid ===== */
.studio{position:relative;margin-top:16px}
.studio-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.studio-head .card-title{margin-bottom:4px}
.studio-actions{display:flex;align-items:center;gap:10px}
.hint-tight{margin:6px 0 0}
.h3{font-size:14px;font-weight:700;margin:0;color:var(--text-2)}
.studio-grid{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(280px,1fr);gap:24px}
.chart-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.cur-tabs{display:inline-flex;border:1px solid var(--border-input);border-radius:999px;overflow:hidden}
.cur-tab{background:var(--surface);border:0;padding:6px 16px;min-height:36px;font:inherit;font-size:13px;color:var(--text-2);cursor:pointer}
.cur-tab+.cur-tab{border-left:1px solid var(--border-input)}
.cur-tab[aria-selected="true"]{background:var(--info-bg);color:var(--info-text);font-weight:700}
.chart-wrap .chart-m{display:none}
.chart-svg{width:100%;height:auto;display:block}
.chart-svg .grid{stroke:var(--border);stroke-width:1}
.chart-svg .grid.base{stroke:var(--border-input)}
.chart-svg .axis{fill:var(--text-muted);font-size:11px;font-family:var(--font-sans)}
.chart-svg .bar{fill:var(--action-bg);opacity:.88}
.chart-svg .bar.hot{opacity:1;stroke:var(--text);stroke-width:1.5}
.chart-svg .tip rect{fill:var(--bar-bg);stroke:var(--bar-control)}
.chart-svg .tip .t1{fill:var(--bar-text);font-size:11px;font-family:var(--font-sans)}
.chart-svg .tip .t2{fill:#fff;font-size:12px;font-weight:700;font-family:var(--font-sans)}
.data-alt{margin-top:10px;font-size:13px}
.data-alt summary{cursor:pointer;min-height:32px;padding:4px 0;color:var(--link);font-weight:600}
.data-alt table{margin-top:8px}
table.tight th,table.tight td{padding:4px 8px}
.r{text-align:right}
.status-row{padding:12px 0;border-bottom:1px solid var(--border)}
.status-row:first-of-type{padding-top:8px}
.status-head{display:flex;justify-content:space-between;margin-bottom:6px}
.stack{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--surface-sunken);border:1px solid var(--border)}
.seg{display:block;min-width:4px}
.seg+.seg{border-left:2px solid var(--surface)}
.seg-none{background:var(--border-input)}
.seg-progress{background:var(--info-text)}
.seg-created{background:var(--ok-border)}
.seg-attention{background:var(--warn-border)}
.state-list{list-style:none;margin:8px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:4px 14px}
.state-list li{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px}
.state-list .cnt{font-weight:700}
.vendor-slot{margin-top:14px;border:1px dashed var(--border-input);border-radius:var(--radius);padding:6px 10px;font-size:12px;color:var(--text-muted);text-align:center}
.muted{color:var(--text-muted)}
.ag-mock{padding:0}
.ag-scroll{overflow-x:auto}
.ag-table{width:100%;border-collapse:collapse;font-size:14px;min-width:760px}
.ag-table th{background:var(--surface-sunken);text-transform:uppercase;letter-spacing:.06em;font-size:12px;color:var(--text-2);text-align:left;padding:14px 16px;border-bottom:1px solid var(--border)}
.ag-table td{padding:12px 16px;border-bottom:1px solid var(--border);vertical-align:middle}
.ag-table th.r,.ag-table td.r{text-align:right}
.ag-mock .grid-note{padding:12px 16px 0;margin:0}
.nudgey-fab-mock{position:fixed;right:16px;bottom:84px;background:var(--action-bg);color:#fff;border:0;border-radius:999px;padding:12px 20px;font-weight:700;box-shadow:0 4px 12px rgba(15,23,42,.3)}
@media (min-width:768px){.nudgey-fab-mock{bottom:20px}}
/* review annotations (hidden with #clean) */
.rtag{display:inline-block;font:700 11px/1 var(--font-sans);letter-spacing:.04em;padding:4px 8px;border-radius:4px;margin:10px 0 6px}
.rtag-old{background:var(--neutral-bg);color:var(--neutral-text);border:1px solid var(--neutral-border)}
.rtag-new{background:var(--ai-bg);color:var(--ai-text);border:1px solid var(--ai-border);position:absolute;top:-12px;left:14px;margin:0}
.studio{outline:2px dashed var(--ai-border);outline-offset:4px}
.ag-mock .rtag{margin:10px 16px 0}
body.clean .rtag,body.clean .vendor-slot{display:none}
body.clean .studio{outline:0}
.state-page[hidden]{display:none}
@media (max-width:1023px){.studio-grid{grid-template-columns:1fr}}
@media (max-width:767px){
  .chart-wrap .chart-d{display:none}.chart-wrap .chart-m{display:block}
  .state-list{grid-template-columns:1fr}
  .studio-actions{width:100%;justify-content:space-between}
  .cur-tabs{width:100%}.cur-tab{flex:1;min-height:44px}
  .nudgey-fab-mock{bottom:80px}
}
@media (prefers-reduced-motion:reduce){.skeleton{animation:none}}
</style>
</head>
<body>
<div id="root">
<div id="app-authed">${shellTop(true)}<main id="main-content" tabindex="-1">${signedNotice}
${["USD", "EUR", "JPY"].map((c) => `<div class="state-page" data-state="default" data-cur="${c}" hidden>${pages.default(c)}</div>`).join("")}
<div class="state-page" data-state="loading" hidden>${pages.loading()}</div>
<div class="state-page" data-state="empty" hidden>${pages.empty()}</div>
<div class="state-page" data-state="error" hidden>${pages.error()}</div>
<div class="state-page" data-state="unavailable" hidden>${pages.unavailable()}</div>
</main>${fab}${mobileNav}</div>
<div id="app-login" hidden>${shellTop(false)}<main id="main-content-login" tabindex="-1">${login}</main></div>
</div>
<script>
/* Review harness only: #state=default|loading|empty|error|unavailable|session-expired  #cur=USD|EUR|JPY  #theme=dark  #clean=1 */
(function(){
  var h={};location.hash.replace(/^#/,'').split('&').forEach(function(p){var kv=p.split('=');if(kv[0])h[kv[0]]=kv[1]||'1'});
  var st=h.state||'default',cur=h.cur||'USD';
  if(h.theme==='dark')document.documentElement.setAttribute('data-theme','dark');
  if(h.clean)document.body.classList.add('clean');
  var login=st==='session-expired';
  document.getElementById('app-authed').hidden=login;
  document.getElementById('app-login').hidden=!login;
  if(!login){document.querySelectorAll('.state-page').forEach(function(el){
    var ok=el.getAttribute('data-state')===st&&(st!=='default'||el.getAttribute('data-cur')===cur);
    el.hidden=!ok;});}
})();
</script>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);
console.log(JSON.stringify({ totals, states }));
