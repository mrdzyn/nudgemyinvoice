/* eslint-disable -- design-only Node tooling (not production code): uses Node globals by design. */
// NMI-PROTOTYPE-10D-A5-D design-only mockup generator (rev 2: owner-approved refinements, 2026-11-04).
//
//   node design/evidence/NMI-PROTOTYPE-10D-A5D/build-mockup.mjs
//
// Writes design/mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html: ONE static file that inlines the REAL
// app stylesheets (apps/web/src/styles/tokens.css + app.css) so the preview uses the existing NudgeMyInvoice
// design system verbatim, plus a review-only stylesheet/script for the proposed "Activity analytics" panel.
//
// Owner-approved behavior illustrated here:
//   * panel collapsed by default at <= 767px (Show charts), expanded at >= 768px; not persisted;
//   * daily bars for ranges of <= 90 calendar days, weekly (Monday-start, exact BigInt sums) beyond 90 days,
//     the accessible table always keeps every original daily row;
//   * tooltips appear only on hover, keyboard focus or tap (never idle);
//   * the "Studio · view only" badge exists only in the Studio-ACTIVE variant (never loading/fallback/off);
//     the vendor-attribution area is always shown in the active variant and never hidden.
//
// SYNTHETIC DATA ONLY (seeded generator, example.test addresses). AG Studio is NOT installed, no licence key is
// used, nothing is fetched, and the chart/status visuals are inline SVG/HTML that illustrate DESIGN INTENT. They
// are NOT renderings of AG Studio, whose real chrome is unverified until A5-I1.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const OUT = join(root, "design/mockups/NMI-PROTOTYPE-10D-A5D-studio-analytics.html");
const tokensCss = readFileSync(join(root, "apps/web/src/styles/tokens.css"), "utf8");
const appCss = readFileSync(join(root, "apps/web/src/styles/app.css"), "utf8");

const ZONE = "Asia/Manila";
const CURRENCIES = ["USD", "EUR", "JPY"];
const EXP = { USD: 2, EUR: 2, JPY: 0 };
const WEEKLY_AFTER_DAYS = 90; // owner-approved: daily bars for <= 90 local calendar days, weekly beyond
const END_ISO = "2026-11-03";
const RANGES = [30, 90, 120];

/* ------------------------------------------------------------------ date helpers (local calendar dates as YYYY-MM-DD) */
const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const dow = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
const weekStart = (iso) => addDays(iso, -((dow(iso) + 6) % 7)); // Monday start
const dayLabel = (iso) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const dayLabelY = (iso) => `${dayLabel(iso)}, ${iso.slice(0, 4)}`;
const longDate = (iso) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const mdy = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ exact money formatting from integer minor units (BigInt) */
const dec = (minor, c) => {
  const e = EXP[c];
  const s = BigInt(minor).toString().padStart(e + 1, "0");
  return e ? `${s.slice(0, -e)}.${s.slice(-e)}` : s;
};
const money = (minor, c) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, minimumFractionDigits: EXP[c], maximumFractionDigits: EXP[c] }).format(dec(minor, c));
const axisMoney = (minorNumber, c) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(minorNumber / 10 ** EXP[c]);

/* ------------------------------------------------------------------ synthetic datasets (seeded, deterministic) */
function buildDataset(nDays) {
  let seed = 20261104;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const start = addDays(END_ISO, -(nDays - 1));
  const days = Array.from({ length: nDays }, (_, i) => addDays(start, i));
  const AVG = { USD: 21500, EUR: 18200, JPY: 31000 };
  const PER = { USD: 5.2, EUR: 2.4, JPY: 1.1 };
  const data = {};
  for (const c of CURRENCIES) {
    data[c] = days.map((iso) => {
      const weekend = dow(iso) === 0 || dow(iso) === 6;
      const n = Math.max(0, Math.round(PER[c] * (weekend ? 0.35 : 1) * (0.4 + rnd() * 1.3) - (rnd() < 0.12 ? 2 : 0)));
      let total = 0;
      for (let k = 0; k < n; k++) total += Math.round(AVG[c] * (0.25 + rnd() * 1.6));
      if (c === "JPY") total = Math.round(total / 100) * 100;
      return { day: iso, count: n, minor: BigInt(total) };
    });
  }
  const totals = Object.fromEntries(CURRENCIES.map((c) => [c, data[c].reduce((a, d) => ({ count: a.count + d.count, minor: a.minor + d.minor }), { count: 0, minor: 0n })]));
  const w = { USD: [0.03, 0.06, 0.02], EUR: [0, 0.1, 0.04], JPY: [0, 0, 0.05] };
  const states = Object.fromEntries(
    CURRENCIES.map((c) => {
      const n = totals[c].count;
      const [p, cr, at] = w[c].map((x) => Math.floor(n * x));
      return [c, { none: n - p - cr - at, progress: p, created: cr, attention: at }];
    }),
  );
  return { nDays, start, end: END_ISO, data, totals, states, weekly: nDays > WEEKLY_AFTER_DAYS };
}
const DS = Object.fromEntries(RANGES.map((n) => [n, buildDataset(n)]));

/** Plot buckets: one per local day (<= 90 days) or one per Monday-start local week (> 90 days), exact BigInt sums. */
function buckets(ds, c) {
  const rows = ds.data[c];
  if (!ds.weekly) return rows.map((r) => ({ key: r.day, axis: dayLabel(r.day), title: dayLabelY(r.day), count: r.count, minor: r.minor }));
  const map = new Map();
  for (const r of rows) {
    const k = weekStart(r.day);
    const b = map.get(k) ?? { key: k, first: r.day, last: r.day, count: 0, minor: 0n };
    b.count += r.count;
    b.minor += r.minor;
    b.last = r.day;
    map.set(k, b);
  }
  return [...map.values()].map((b) => {
    const partial = b.first !== b.key || b.last !== addDays(b.key, 6);
    return { key: b.key, axis: dayLabel(b.key), title: `${dayLabel(b.first)} – ${dayLabelY(b.last)}${partial ? " (partial week)" : ""}`, count: b.count, minor: b.minor, weekOf: `Week of ${dayLabel(b.key)}` };
  });
}
// Build-time invariants: plotted buckets sum exactly to the card totals and to the daily rows.
for (const n of RANGES) for (const c of CURRENCIES) {
  const ds = DS[n];
  const b = buckets(ds, c);
  const sumMinor = b.reduce((a, x) => a + x.minor, 0n);
  const sumCount = b.reduce((a, x) => a + x.count, 0);
  if (sumMinor !== ds.totals[c].minor || sumCount !== ds.totals[c].count) throw new Error(`bucket sums differ from totals for ${c} ${n}d`);
  if (ds.weekly !== b.length < n) throw new Error("weekly grouping mismatch");
  const st = ds.states[c];
  if (st.none + st.progress + st.created + st.attention !== ds.totals[c].count) throw new Error("state counts do not sum");
}

/* ------------------------------------------------------------------ chart (inline SVG; two layouts so text stays readable at 390px) */
function niceStep(peakMinor, c) {
  const unit = 10 ** EXP[c];
  const raw = peakMinor / unit / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow * unit;
  return 10 * pow * unit;
}
function chart(ds, c, variant, uid) {
  const mobile = variant === "m";
  const W = mobile ? 340 : 640;
  const H = mobile ? 230 : 280;
  const m = { l: mobile ? 46 : 64, r: 8, t: 12, b: 28 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const rows = buckets(ds, c);
  const peakMinor = rows.reduce((a, r) => (r.minor > a ? r.minor : a), 0n);
  const step = niceStep(Number(peakMinor), c);
  const intervals = Math.max(1, Math.ceil(Number(peakMinor) / step));
  const max = step * intervals;
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => step * i);
  const bw = pw / rows.length;
  const frac = bw < 6 ? 0.8 : 0.72;
  const kind = ds.weekly ? "weekly" : "daily";
  let s = `<svg class="chart-svg chart-${variant}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">`;
  for (const t of ticks) {
    const y = m.t + ph - (t / max) * ph;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" class="grid${t === 0 ? " base" : ""}"/>`;
    s += `<text x="${m.l - 6}" y="${y + 4}" text-anchor="end" class="axis">${esc(axisMoney(t, c))}</text>`;
  }
  rows.forEach((r, i) => {
    const h = (Number(r.minor) / max) * ph;
    const x = m.l + i * bw + bw * ((1 - frac) / 2);
    s += `<rect class="bar" data-i="${i}" data-k="${kind}" data-t="${esc(r.title)}" data-v="${esc(money(r.minor, c))}" data-n="${r.count}" x="${x.toFixed(1)}" y="${(m.t + ph - h).toFixed(1)}" width="${(bw * frac).toFixed(1)}" height="${Math.max(h, r.minor ? 1 : 0).toFixed(1)}" rx="${bw < 6 ? 1 : 2}"/>`;
  });
  const want = mobile ? 5 : 8;
  const every = Math.max(1, Math.ceil(rows.length / want));
  rows.forEach((r, i) => {
    const last = i === rows.length - 1;
    if ((i % every === 0 && rows.length - 1 - i >= Math.ceil(every * 0.6)) || last) s += `<text x="${(m.l + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="${last && mobile ? "end" : "middle"}" class="axis">${r.axis}</text>`;
  });
  return s + `</svg>`;
}
const peakBucket = (ds, c) => buckets(ds, c).reduce((b, r) => (r.minor > b.minor ? r : b));
const tableFor = (ds, c) =>
  `<div class="table-scroll"><table class="data tight"><caption class="sr-only">${c} invoices by local creation day (${ZONE}); every day with invoices, exact values</caption><thead><tr><th scope="col">Day</th><th scope="col" class="r">Invoices</th><th scope="col" class="r">Total (${c})</th></tr></thead><tbody>${ds.data[c]
    .filter((r) => r.count)
    .map((r) => `<tr><th scope="row">${dayLabelY(r.day)}</th><td class="r num">${r.count}</td><td class="r num">${esc(money(r.minor, c))}</td></tr>`)
    .join("")}</tbody></table></div>`;

/* ------------------------------------------------------------------ status breakdown */
const STATE_META = [
  ["none", "No PayPal draft", "neutral", "○"],
  ["progress", "In progress", "info", "◔"],
  ["created", "PayPal draft created", "ok", "✓"],
  ["attention", "Needs attention", "warn", "!"],
];
const statusRow = (ds, c) => {
  const t = ds.totals[c].count;
  const st = ds.states[c];
  const segs = STATE_META.filter(([k]) => st[k] > 0).map(([k, l]) => `<span class="seg seg-${k}" style="flex:${st[k]}"></span>`).join("");
  const list = STATE_META.map(([k, l, kind, ic]) => `<li><span class="badge badge-${kind}"><span aria-hidden="true">${ic}</span>${l}</span><span class="num cnt">${st[k]}</span></li>`).join("");
  return `<div class="status-row"><div class="status-head"><strong>${c}</strong><span class="muted">${t} invoice${t === 1 ? "" : "s"}</span></div><div class="stack" role="img" aria-label="${c} PayPal Sandbox draft status: ${STATE_META.map(([k, l]) => `${l} ${st[k]}`).join(", ")}">${segs}</div><ul class="state-list">${list}</ul></div>`;
};

/* ------------------------------------------------------------------ regions */
const tag = (kind, text) => `<span class="rtag rtag-${kind}" aria-hidden="true">${text}</span>`;
let uidN = 0;
const uid = () => `u${++uidN}`;
const kpiCards = (ds) => CURRENCIES.map((c) => `<div class="currency-card"><div class="top"><span>${c}</span><span class="badge badge-neutral">${ds.totals[c].count} invoices</span></div><div class="amount num">${esc(money(ds.totals[c].minor, c))}</div><div class="meta">Full matching operator-owned ${c} total · PayPal Sandbox drafts created: ${ds.states[c].created}</div></div>`).join("");
const skCard = `<div class="currency-card"><div class="skeleton sk-h18 sk-w40"></div><div class="skeleton sk-h30 sk-w70"></div><div class="skeleton sk-h14 sk-w55"></div></div>`;
const filterBar = (ds) => `<div class="table-card"><div class="filters">
  <div class="pills" role="group" aria-label="Filter by currency"><button class="pill" type="button" aria-pressed="true">All currencies</button>${["USD", "EUR", "GBP", "CAD", "AUD", "JPY"].map((c) => `<button class="pill" type="button" aria-pressed="false">${c}</button>`).join("")}</div>
  <div class="filter-controls">
    <fieldset class="date-range-filter"><legend>Created date range</legend><div class="date-range-fields"><label><span>From</span><input class="input date-range-input" type="date" value="${ds.start}" aria-label="From date"></label><label><span>Through</span><input class="input date-range-input" type="date" value="${ds.end}" aria-label="Through date"></label></div></fieldset>
    <div><label class="sr-only" for="dash-search">Search invoices</label><input class="input search-input" id="dash-search" type="search" placeholder="Search invoices" autocomplete="off"></div>
    <div><label class="sr-only" for="dash-status">PayPal Sandbox status</label><select class="select" id="dash-status"><option>All PayPal statuses</option><option>No PayPal draft</option><option>In progress</option><option>PayPal draft created</option><option>Needs attention</option></select></div>
  </div></div></div>`;
const coverage = (ds) => `<p class="hint" id="dash-coverage">Matching invoices owned by this operator, created ${longDate(ds.start)} through ${longDate(ds.end)} inclusive (${ZONE}).</p>`;
const cardsNote = `<p class="hint">Totals cover the full matching invoice population, not only rows loaded below. Each card uses one currency; currencies are never added together or converted.</p>`;

const curTabs = (active) => `<div class="cur-tabs" role="tablist" aria-label="Chart currency (view only; does not change the filters)">${CURRENCIES.map((c) => `<button type="button" role="tab" class="cur-tab" aria-selected="${c === active}" tabindex="${c === active ? 0 : -1}">${c}</button>`).join("")}</div>`;

const panelHead = (id, badge, toggle) => `<div class="studio-head"><div class="studio-title"><h2 class="card-title" id="${id}-t">Activity analytics</h2>${badge ? `<span class="badge badge-neutral">Studio · view only</span>` : ""}</div>${toggle ? `<button type="button" class="btn btn-secondary btn-sm studio-toggle" aria-expanded="true" aria-controls="${id}-b">Hide charts</button>` : ""}</div>`;
const vendorSlot = `<div class="vendor-slot"><strong>Vendor attribution area.</strong> Shown by AG Studio if it requires one; its content comes from Studio and is never hidden or covered (unverified until A5-I1).</div>`;

function studioPanel(ds, active) {
  const id = uid();
  const p = peakBucket(ds, active);
  const weekly = ds.weekly;
  const rows = buckets(ds, active);
  const desc = `${weekly ? "Weekly" : "Daily"} ${active} invoice totals, ${dayLabelY(ds.start)} to ${dayLabelY(ds.end)}. Peak ${weekly ? "week" : "day"} ${p.title}: ${money(p.minor, active)}. Use the left and right arrow keys to read each bar; the full daily table follows.`;
  return `<section class="card studio" id="${id}" aria-labelledby="${id}-t" data-studio="active" data-open="1">
  ${tag("new", "NEW · AG Studio view-only region (illustrative mock, not a Studio render)")}
  ${panelHead(id, true, true)}
  <div class="studio-body" id="${id}-b">
    <p class="hint hint-tight">Same filters and the same full-population server totals as the cards above. Values are invoice totals by creation day (${ZONE}), not payments.</p>
    <div class="studio-grid">
      <div class="studio-chart">
        <div class="chart-bar"><h3 class="h3">${weekly ? "Weekly" : "Daily"} invoice value · <span class="cur-now">${active}</span></h3>${curTabs(active)}</div>
        ${weekly ? `<p class="mode-note"><span class="badge badge-info">Weekly view</span> Range is longer than ${WEEKLY_AFTER_DAYS} days, so bars group each local week (starts Monday). The table keeps every day.</p>` : ""}
        <div class="chart-wrap" tabindex="0" role="group" aria-roledescription="chart" aria-label="${esc(desc)}" data-count="${rows.length}" data-peak="${rows.indexOf(p)}">
          ${chart(ds, active, "d")}${chart(ds, active, "m")}
          <div class="chart-tip" role="presentation" hidden><div class="t1"></div><div class="t2"></div></div>
          <p class="sr-only" role="status" aria-live="polite" data-live></p>
        </div>
        <p class="hint hint-tight">Peak ${weekly ? "week" : "day"}: ${esc(p.title)} · ${esc(money(p.minor, active))} · ${p.count} invoices. One currency per chart; axes are never shared across currencies.</p>
        <details class="data-alt"><summary>View ${active} daily data as a table</summary>${tableFor(ds, active)}</details>
      </div>
      <div class="studio-status">
        <h3 class="h3">PayPal Sandbox draft status</h3>
        ${CURRENCIES.map((c) => statusRow(ds, c)).join("")}
        <p class="hint hint-tight"><strong>PayPal draft created</strong> means a Sandbox DRAFT exists. It is not sent, not paid and not overdue.</p>
      </div>
    </div>
    ${vendorSlot}
  </div>
</section>`;
}
const studioSkeleton = () => {
  const id = uid();
  return `<section class="card studio" id="${id}" aria-labelledby="${id}-t" aria-busy="true" data-studio="pending" data-open="1">${tag("new", "NEW · loading (Studio not active yet: no badge)")}
  ${panelHead(id, false, true)}
  <div class="studio-body" id="${id}-b"><p class="sr-only" role="status">Loading analytics</p>
  <div class="studio-grid"><div><div class="skeleton sk-h18 sk-w40"></div><div class="skeleton" style="height:230px;margin-top:14px"></div></div>
  <div><div class="skeleton sk-h18 sk-w55"></div>${[1, 2, 3].map(() => `<div class="skeleton" style="margin-top:18px;height:22px"></div><div class="skeleton sk-h14 sk-w70"></div>`).join("")}</div></div></div></section>`;
};
const studioUnavailable = () => {
  const id = uid();
  return `<section class="card studio" id="${id}" aria-labelledby="${id}-t" data-studio="fallback">${tag("new", "NEW · fallback (no Studio badge, no attribution area)")}
  ${panelHead(id, false, false)}
  <div class="notice notice-info" role="status"><span aria-hidden="true">ℹ</span><div><strong>Charts unavailable.</strong> The totals above and the invoice table below are not affected.
  <div class="mt-12"><button type="button" class="btn btn-secondary btn-sm">Try loading charts again</button></div></div></div></section>`;
};

const rowsGrid = [
  ["ff895600", "Oct 27, 2026", "Synthetic Client 41", "synthetic-41@example.test", "Jan 15, 2030", money(1234n, "USD"), "USD", "neutral", "○", "No PayPal draft"],
  ["fb820a49", "Oct 27, 2026", "Synthetic Client 23", "synthetic-23@example.test", "Jan 15, 2030", money(59997n, "EUR"), "EUR", "ok", "✓", "PayPal draft created"],
  ["fb410e3c", "Oct 26, 2026", "Synthetic Client 17", "synthetic-17@example.test", "Mar 01, 2030", money(180000n, "JPY"), "JPY", "warn", "!", "Needs attention"],
  ["f9c0172d", "Oct 26, 2026", "Synthetic Client 08", "synthetic-08@example.test", "Jan 15, 2030", money(54000n, "USD"), "USD", "info", "◔", "Creation in progress"],
];
const gridCard = (loading) => `<div class="table-card ag-mock"><span class="rtag rtag-old" aria-hidden="true">EXISTING · AG Grid Community 36.2 · unchanged</span>
  <p class="sr-only" role="status" data-testid="result-count">Showing 20 invoices</p>
  <p class="hint grid-note">Sorting reorders only the 20 rows loaded so far. The totals above cover all matching invoices. Search, date, currency and PayPal status filters apply on the server.</p>
  <div class="ag-scroll"><table class="ag-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th class="r">Total</th><th>PayPal Sandbox</th><th>Actions</th></tr></thead><tbody>${
    loading
      ? [1, 2, 3, 4].map(() => `<tr>${[1, 2, 3, 4, 5, 6].map(() => `<td><div class="skeleton sk-h14" style="margin:0"></div></td>`).join("")}</tr>`).join("")
      : rowsGrid.map((r) => `<tr><td><span class="mono">${r[0]}</span><div class="cell-sub">Saved ${r[1]}</div></td><td>${r[2]}<div class="cell-sub">${r[3]}</div></td><td>${r[4]}</td><td class="r"><strong class="num">${esc(r[5])}</strong> <span class="cell-sub">${r[6]}</span></td><td><span class="badge badge-${r[7]}"><span aria-hidden="true">${r[8]}</span>${r[9]}</span></td><td><button type="button" class="btn btn-secondary btn-sm">View</button></td></tr>`).join("")
  }</tbody></table></div>
  <div class="grid-footer"><span class="muted">20 loaded · more available</span><button type="button" class="btn btn-secondary">Load more invoices</button></div></div>`;

const empty = `<div class="empty" id="dash-empty-range"><h2>No invoices match these filters</h2><p>Try a wider date range or clear your filters, or create a new invoice draft.</p><button type="button" class="btn btn-primary">Create an invoice</button></div>`;
const analyticsError = `<div class="notice notice-err" role="alert" id="dash-analytics-error"><span aria-hidden="true">!</span><div><strong>Could not load full-population totals.</strong> Could not reach the server. No loaded-row estimate is substituted.<div class="mt-12"><button type="button" class="btn btn-secondary btn-sm">Retry</button></div></div></div>`;

const shellTop = (authed) => `<div class="sandbox-banner" role="note" aria-label="PayPal Sandbox notice"><span><strong>PayPal Sandbox only.</strong> Nothing here moves real money. Creating a PayPal draft does not email the customer.</span><span class="mono">sandbox · draft-only</span></div>
<header class="app-header"><div class="brand"><span class="brand-mark" aria-hidden="true">N</span><span>NudgeMyInvoice</span></div><div class="header-controls"><span class="sandbox-pill">PayPal Sandbox</span>${authed ? `<span class="cell-sub">Signed in as a5-design-owner</span><button type="button" class="btn btn-secondary btn-sm">Sign out</button>` : ""}</div></header>
${authed ? `<nav class="app-nav" aria-label="Main"><button class="nav-link" aria-current="page">Invoice drafts</button><button class="nav-link">New invoice</button></nav>` : ""}`;
const signedNotice = `<div class="notice notice-info notice-compact" role="note"><span aria-hidden="true">ℹ</span><div><strong>You are signed in to the server.</strong> Parsing, saving, the invoice list and the saved-invoice pages use the server and PostgreSQL. Saving never creates a PayPal invoice. A PayPal Sandbox DRAFT is created only when you explicitly confirm it on a saved invoice, and only if the server has drafting enabled; the customer is never emailed and no payment is collected.</div></div>`;
const pageHead = `<div class="page-head"><div><h1 class="screen-title">Invoice drafts</h1><p class="subtitle">Saved invoices and their PayPal Sandbox draft status</p></div><button type="button" class="btn btn-primary">New invoice</button></div>`;
const mobileNav = `<nav class="mobile-nav" aria-label="Main (mobile)"><button aria-current="page">Drafts</button><button>New invoice</button><button>Sign out</button></nav>`;
const fab = `<button type="button" class="nudgey-fab-mock">✦ Nudgey</button>`;

const login = `<section aria-labelledby="login-title"><div class="login-wrap"><div class="card login-card"><div class="login-head"><div class="brand-mark" aria-hidden="true">N</div><h1 class="screen-title" id="login-title">Operator sign in</h1><p class="subtitle">Single-operator console for the PayPal Sandbox demo</p></div>
<div class="notice notice-warn" role="status"><span aria-hidden="true">!</span><div><strong>Your session has expired.</strong> Sign in again to continue. Unsaved edits are not kept by the server.</div></div>
<form onsubmit="return false"><div class="field"><label for="u">Username <span class="req" aria-hidden="true">*</span></label><input class="input" id="u" autocomplete="username"></div><div class="field"><label for="p">Password <span class="req" aria-hidden="true">*</span></label><input class="input" id="p" type="password" autocomplete="current-password"></div><button class="btn btn-primary" type="submit">Sign in</button></form></div></div></section>`;

/* ------------------------------------------------------------------ pages */
const core = (ds, cur, withPanel) => `${pageHead}${tag("old", "EXISTING · filters · single source of truth")}${filterBar(ds)}${coverage(ds)}${tag("old", "EXISTING · currency cards · full population · unchanged")}<div class="currency-grid">${kpiCards(ds)}</div>${cardsNote}${withPanel ? studioPanel(ds, cur) : tag("old", "Studio flag OFF or not installed: the page is today's dashboard, nothing added")}${gridCard(false)}`;
const D30 = DS[30];
const statePages = [];
for (const r of RANGES) for (const c of CURRENCIES) statePages.push(`<div class="state-page" data-state="default" data-cur="${c}" data-range="${r}" hidden>${core(DS[r], c, true)}</div>`);
statePages.push(`<div class="state-page" data-state="off" hidden>${core(D30, "USD", false)}</div>`);
statePages.push(`<div class="state-page" data-state="loading" hidden>${pageHead}${filterBar(D30)}${coverage(D30)}<div class="currency-grid" aria-busy="true" aria-label="Loading full-population totals">${skCard}${skCard}${skCard}</div>${studioSkeleton()}${gridCard(true)}</div>`);
statePages.push(`<div class="state-page" data-state="empty" hidden>${pageHead}${filterBar(D30)}${coverage(D30)}${empty}</div>`);
statePages.push(`<div class="state-page" data-state="error" hidden>${pageHead}${filterBar(D30)}${coverage(D30)}${analyticsError}${tag("old", "Panel is not rendered while totals are unavailable")}${gridCard(false)}</div>`);
statePages.push(`<div class="state-page" data-state="unavailable" hidden>${pageHead}${filterBar(D30)}${coverage(D30)}<div class="currency-grid">${kpiCards(D30)}</div>${cardsNote}${studioUnavailable()}${gridCard(false)}</div>`);

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
/* ===== A5-D review-only additions: the proposed analytics region, annotations and the representative grid ===== */
.studio{position:relative;margin-top:16px}
.studio-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.studio-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.studio-title .card-title{margin:0}
.studio[data-open="0"] .studio-head{margin-bottom:0}
.studio-body[hidden]{display:none}
.hint-tight{margin:6px 0 0}
.h3{font-size:14px;font-weight:700;margin:0;color:var(--text-2)}
.studio-grid{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(280px,1fr);gap:24px;margin-top:10px}
.chart-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.mode-note{margin:0 0 8px;font-size:13px;color:var(--text-2);display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}
.cur-tabs{display:inline-flex;border:1px solid var(--border-input);border-radius:999px;overflow:hidden}
.cur-tab{background:var(--surface);border:0;padding:6px 16px;min-height:36px;font:inherit;font-size:13px;color:var(--text-2);cursor:pointer}
.cur-tab+.cur-tab{border-left:1px solid var(--border-input)}
.cur-tab[aria-selected="true"]{background:var(--info-bg);color:var(--info-text);font-weight:700}
.chart-wrap{position:relative;border-radius:var(--radius)}
.chart-wrap:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.chart-wrap .chart-m{display:none}
.chart-svg{width:100%;height:auto;display:block}
.chart-svg .grid{stroke:var(--border);stroke-width:1}
.chart-svg .grid.base{stroke:var(--border-input)}
.chart-svg .axis{fill:var(--text-muted);font-size:11px;font-family:var(--font-sans)}
.chart-svg .bar{fill:var(--action-bg);opacity:.88;cursor:pointer}
.chart-svg .bar.active{opacity:1;stroke:var(--text);stroke-width:1.5}
.chart-tip{position:absolute;z-index:3;pointer-events:none;background:var(--bar-bg);color:#fff;border:1px solid var(--bar-control);border-radius:6px;padding:6px 10px;white-space:nowrap;box-shadow:0 4px 12px rgba(15,23,42,.3)}
.chart-tip[hidden]{display:none}
.chart-tip .t1{font-size:11px;color:var(--bar-text)}
.chart-tip .t2{font-size:12px;font-weight:700}
.data-alt{margin-top:10px;font-size:13px}
.data-alt summary{cursor:pointer;min-height:32px;padding:4px 0;color:var(--link);font-weight:600}
.table-scroll{max-height:280px;overflow:auto;margin-top:8px;border:1px solid var(--border);border-radius:var(--radius)}
table.tight th,table.tight td{padding:4px 8px}
.r{text-align:right}
.status-row{padding:12px 0;border-bottom:1px solid var(--border)}
.studio-status .status-row:first-of-type{padding-top:8px}
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
.vendor-slot{margin-top:14px;border:1px dashed var(--border-input);border-radius:var(--radius);padding:8px 12px;font-size:12px;color:var(--text-2);background:var(--surface-sunken)}
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
.rtag{display:inline-block;font:700 11px/1 var(--font-sans);letter-spacing:.04em;padding:4px 8px;border-radius:4px;margin:10px 0 6px}
.rtag-old{background:var(--neutral-bg);color:var(--neutral-text);border:1px solid var(--neutral-border)}
.rtag-new{background:var(--ai-bg);color:var(--ai-text);border:1px solid var(--ai-border);position:absolute;top:-12px;left:14px;margin:0;max-width:calc(100% - 28px);white-space:normal;line-height:1.25}
.studio{outline:2px dashed var(--ai-border);outline-offset:4px}
.ag-mock .rtag{margin:10px 16px 0}
body.clean .rtag{display:none}
body.clean .studio{outline:0}
.state-page[hidden]{display:none}
@media (max-width:1023px){.studio-grid{grid-template-columns:1fr}}
@media (max-width:767px){
  .chart-wrap .chart-d{display:none}.chart-wrap .chart-m{display:block}
  .state-list{grid-template-columns:1fr}
  .studio-toggle{width:100%;min-height:44px}
  .cur-tabs{width:100%}.cur-tab{flex:1;min-height:44px}
  .nudgey-fab-mock{bottom:80px}
  .rtag-new{position:static;display:block;margin:0 0 10px;max-width:none}
}
@media (prefers-reduced-motion:reduce){.skeleton{animation:none}}
</style>
</head>
<body>
<div id="root">
<div id="app-authed">${shellTop(true)}<main id="main-content" tabindex="-1">${signedNotice}
${statePages.join("\n")}
</main>${fab}${mobileNav}</div>
<div id="app-login" hidden>${shellTop(false)}<main id="main-content-login" tabindex="-1">${login}</main></div>
</div>
<script>
/* Review harness only. #state=default|off|loading|empty|error|unavailable|session-expired  #cur=USD|EUR|JPY  #range=30|90|120
   #theme=dark  #clean=1  #panel=open|closed (override the viewport default). Nothing is fetched or stored. */
(function(){
  var h={};location.hash.replace(/^#/,'').split('&').forEach(function(p){var kv=p.split('=');if(kv[0])h[kv[0]]=kv[1]||'1'});
  var st=h.state||'default',cur=h.cur||'USD',range=h.range||'30';
  if(h.theme==='dark')document.documentElement.setAttribute('data-theme','dark');
  if(h.clean)document.body.classList.add('clean');
  var login=st==='session-expired';
  document.getElementById('app-authed').hidden=login;
  document.getElementById('app-login').hidden=!login;
  var page=null;
  if(!login){document.querySelectorAll('.state-page').forEach(function(el){
    var ok=el.getAttribute('data-state')===st&&(st!=='default'||(el.getAttribute('data-cur')===cur&&el.getAttribute('data-range')===range));
    el.hidden=!ok;if(ok)page=el;});}
  if(!page)return;
  var mq=window.matchMedia('(max-width:767px)');
  /* Panel: collapsed by default at <=767px, expanded at >=768px; not persisted; collapsed body leaves the tab order. */
  page.querySelectorAll('.studio[data-open]').forEach(function(panel){
    var btn=panel.querySelector('.studio-toggle'),body=panel.querySelector('.studio-body');
    if(!btn||!body)return;
    function set(open){panel.setAttribute('data-open',open?'1':'0');body.hidden=!open;btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'Hide charts':'Show charts';}
    set(h.panel?h.panel==='open':!mq.matches);
    btn.addEventListener('click',function(){set(body.hidden);});
  });
  /* Tooltips: ONLY on pointer hover, keyboard focus (arrow keys) or tap; never shown idle. */
  page.querySelectorAll('.chart-wrap').forEach(function(wrap){
    var tip=wrap.querySelector('.chart-tip'),live=wrap.querySelector('[data-live]'),n=+wrap.getAttribute('data-count'),idx=-1;
    function bars(){var v=wrap.querySelector(mq.matches?'.chart-m':'.chart-d');return v?v.querySelectorAll('.bar'):[];}
    function hide(){tip.hidden=true;wrap.querySelectorAll('.bar.active').forEach(function(b){b.classList.remove('active')});}
    function show(i,announce){
      var bs=bars(),b=bs[i];if(!b)return;idx=i;hide();b.classList.add('active');
      tip.querySelector('.t1').textContent=b.getAttribute('data-t');
      tip.querySelector('.t2').textContent=b.getAttribute('data-v')+' · '+b.getAttribute('data-n')+' invoice'+(b.getAttribute('data-n')==='1'?'':'s');
      tip.hidden=false;
      var w=wrap.getBoundingClientRect(),r=b.getBoundingClientRect(),tw=tip.offsetWidth,th=tip.offsetHeight;
      var left=r.left-w.left+r.width/2-tw/2;left=Math.max(0,Math.min(left,w.width-tw));
      var top=r.top-w.top-th-8;
      if(top<0){top=Math.max(0,r.top-w.top);left=r.left-w.left+r.width+8;if(left+tw>w.width)left=r.left-w.left-tw-8;left=Math.max(0,left);}
      tip.style.left=left+'px';tip.style.top=top+'px';
      if(announce)live.textContent=b.getAttribute('data-t')+', '+b.getAttribute('data-v')+', '+b.getAttribute('data-n')+' invoices';
    }
    wrap.addEventListener('mouseover',function(e){var t=e.target;if(t.classList&&t.classList.contains('bar'))show(+t.getAttribute('data-i'),false);});
    wrap.addEventListener('mouseleave',function(){if(document.activeElement!==wrap)hide();});
    wrap.addEventListener('click',function(e){var t=e.target;if(t.classList&&t.classList.contains('bar'))show(+t.getAttribute('data-i'),true);else hide();});
    wrap.addEventListener('focus',function(){if(wrap.matches(':focus-visible'))show(idx<0?+wrap.getAttribute('data-peak'):idx,true);});
    wrap.addEventListener('blur',hide);
    wrap.addEventListener('keydown',function(e){
      var i=idx<0?+wrap.getAttribute('data-peak'):idx,k=e.key;
      if(k==='ArrowRight')i=Math.min(n-1,i+1);else if(k==='ArrowLeft')i=Math.max(0,i-1);else if(k==='Home')i=0;else if(k==='End')i=n-1;
      else if(k==='Escape'){hide();return;}else return;
      e.preventDefault();show(i,true);
    });
  });
})();
</script>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);
console.log(JSON.stringify(Object.fromEntries(RANGES.map((r) => [r, { weekly: DS[r].weekly, totals: Object.fromEntries(CURRENCIES.map((c) => [c, [DS[r].totals[c].count, money(DS[r].totals[c].minor, c)]])) }]))));
