/* eslint-disable -- design-only Node tooling (not production code): uses Node globals by design. */
// NMI-P6 AI Nudge Queue — DESIGN PREVIEW for owner visual approval (no app code, no provider, no network).
//
//   node design/evidence/NMI-P6/build-and-capture-preview.mjs
//
// 1. Writes design/mockups/NMI-P6-ai-nudge-queue.html: ONE static file that inlines the REAL app stylesheets
//    (apps/web/src/styles/tokens.css + app.css) plus a small review-only stylesheet for the proposed queue, so the
//    preview uses the existing NudgeMyInvoice design system verbatim.
// 2. Opens it in headless Chrome (file://, network disabled by CSP) and captures every frame at 1280px desktop and
//    the 390px mobile viewport into previews/*.png, plus design-checks.json (objective checks: no horizontal
//    overflow, touch-target sizes, required copy present, no fictional claims).
// SYNTHETIC DATA ONLY (example.test addresses, invented company names). Nothing here is product behaviour proof.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const OUT_HTML = join(root, "design/mockups/NMI-P6-ai-nudge-queue.html");
const OUT = join(here, "previews");
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9381;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokensCss = readFileSync(join(root, "apps/web/src/styles/tokens.css"), "utf8");
const appCss = readFileSync(join(root, "apps/web/src/styles/app.css"), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ synthetic data */
const NUDGES = [
  { id: "a1", customer: "Zorblax Industries", amount: "USD 1,200.00", due: "Oct 30, 2026", status: "6 days after the due date", sev: "warn", tone: "Professional", age: "12 min ago", ref: "c615eb2b" },
  { id: "a2", customer: "Northwind Studio", amount: "EUR 860.00", due: "Nov 3, 2026", status: "2 days after the due date", sev: "warn", tone: "Friendly", age: "1 h ago", ref: "9ab76d16" },
  { id: "a3", customer: "Bluebird Bakery", amount: "JPY 188,837", due: "Nov 12, 2026", status: "Due in 7 days", sev: "neutral", tone: "Friendly", age: "Yesterday", ref: "438b0420" },
];
const APPROVED = [
  { customer: "Lumen Labs", amount: "USD 2,450.00", due: "Oct 12, 2026", tone: "Firm", when: "Nov 4, 2026, 3:12 PM", edited: true },
  { customer: "Quill & Co", amount: "GBP 540.00", due: "Oct 28, 2026", tone: "Professional", when: "Nov 3, 2026, 10:05 AM", edited: false },
];
const HISTORY = [
  { customer: "Zorblax Industries", amount: "USD 1,200.00", tone: "Firm", state: "Replaced by a newer draft", badge: "neutral", when: "Nov 5, 2026, 11:58 AM" },
  { customer: "Harbor Coffee", amount: "AUD 310.00", tone: "Friendly", state: "Rejected", badge: "err", when: "Nov 2, 2026, 9:40 AM" },
];
const MESSAGE = `Hi Zorblax Industries,

A quick reminder that invoice c615eb2b for USD 1,200.00 was due on October 30, 2026. Could you let me know when payment is on its way, or whether anything is holding it up?

Thank you for your help.

Kind regards,`;
const RATIONALE = "A professional, concise reminder: the due date passed recently and this is the first follow-up, so it names the invoice and asks for an update without pressure.";

/* ------------------------------------------------------------------ building blocks */
const shell = (body, { nav = "dash", nudgey = "" } = {}) => `
<div class="sandbox-banner" role="note"><span><strong>PayPal Sandbox only.</strong> Nothing here moves real money. Creating a PayPal draft does not email the customer.</span><span class="mono">sandbox · draft-only</span></div>
<header class="app-header"><div class="brand"><span class="brand-mark" aria-hidden="true">N</span><span>NudgeMyInvoice</span></div>
<div class="header-controls"><span class="sandbox-pill">PayPal Sandbox</span><span class="cell-sub">Signed in as operator</span><button type="button" class="btn btn-secondary btn-sm">Sign out</button></div></header>
<nav class="app-nav" aria-label="Main">
  <a class="nav-link" ${nav === "dash" ? 'aria-current="page"' : ""} href="#">Invoice drafts</a>
  <a class="nav-link" ${nav === "queue" ? 'aria-current="page"' : ""} href="#">Nudge queue <span class="p6-count" aria-label="3 pending review">3</span></a>
  <a class="nav-link" href="#">New invoice</a>
</nav>
<main>${body}</main>${nudgey}`;

const badge = (kind, text) => `<span class="badge badge-${kind}">${esc(text)}</span>`;
const toneBadge = (t) => badge(t === "Firm" ? "warn" : t === "Friendly" ? "ok" : "info", t);
const notSent = `<span class="p6-notsent">Not sent · for your manual use</span>`;

const counters = (p = 3, a = 5, h = 4) => `
<dl class="p6-counters">
  <div><dt>Pending review</dt><dd class="num">${p}</dd></div>
  <div><dt>Approved for manual use</dt><dd class="num">${a}</dd></div>
  <div><dt>History</dt><dd class="num">${h}</dd></div>
</dl>`;

const queueSummaryCard = `
<section class="card p6-summary" aria-labelledby="p6-sum-title">
  <div class="p6-summary-head">
    <div><h2 class="card-title" id="p6-sum-title">AI Nudge Queue</h2>
    <p class="hint p6-tight">AI-drafted payment follow-ups waiting for your review. <strong>Nothing is ever sent</strong> — approved messages are yours to copy and send yourself.</p></div>
    <div class="p6-summary-actions"><button type="button" class="btn btn-secondary btn-sm">Draft a nudge</button><button type="button" class="btn btn-primary btn-sm">Open queue</button></div>
  </div>
  ${counters()}
  <ul class="p6-mini" aria-label="Pending review">
    ${NUDGES.map((n) => `<li><div class="p6-mini-main"><strong>${esc(n.customer)}</strong> <span class="num">${esc(n.amount)}</span> ${badge(n.sev, n.status)} ${toneBadge(n.tone)}</div><div class="p6-mini-side"><span class="cell-sub">${esc(n.age)}</span><button type="button" class="btn btn-secondary btn-sm">Review</button></div></li>`).join("")}
  </ul>
</section>`;

const p5Placeholder = (label) => `<div class="p6-p5"><span>${esc(label)}</span><span class="cell-sub">P5 — unchanged</span></div>`;

const dashboard = shell(`
<div class="page-head"><div><h1 class="screen-title">Invoice drafts</h1><p class="subtitle">Saved invoices and their PayPal Sandbox draft status</p></div><button type="button" class="btn btn-primary">New invoice</button></div>
${queueSummaryCard}
${p5Placeholder("Currency · date · search · PayPal status filters")}
${p5Placeholder("Activity analytics (licensed AG Studio charts)")}
${p5Placeholder("Per-currency totals cards")}
${p5Placeholder("AG Grid invoice table")}`);

const tabs = (active) => `
<div class="tablist p6-tabs" role="tablist" aria-label="Nudge queue">
  ${[["pending", "Pending review", 3], ["approved", "Approved", 5], ["history", "History", 4]].map(([k, l, c]) => `<button type="button" role="tab" class="tab" aria-selected="${k === active}">${l} <span class="p6-count">${c}</span></button>`).join("")}
</div>`;

const listRow = (n, sel) => `<li><button type="button" class="p6-row" ${sel ? 'aria-current="true"' : ""}><span class="p6-row-top"><strong>${esc(n.customer)}</strong><span class="num">${esc(n.amount)}</span></span><span class="p6-row-meta">${badge(n.sev, n.status)} ${toneBadge(n.tone)} <span class="cell-sub">${esc(n.age)}</span></span></button></li>`;

const facts = `
<dl class="p6-facts">
  <div><dt>Amount</dt><dd class="num">USD 1,200.00</dd></div>
  <div><dt>Due date</dt><dd>October 30, 2026</dd></div>
  <div><dt>As of November 5, 2026</dt><dd>6 days after the due date</dd></div>
  <div><dt>Invoice</dt><dd class="mono">c615eb2b</dd></div>
</dl>`;

const reviewPanel = `
<section class="card p6-review" aria-labelledby="p6-rev-title">
  <div class="p6-review-head"><div><h2 class="card-title" id="p6-rev-title">Zorblax Industries</h2><p class="cell-sub">Drafted 12 min ago · ${toneBadge("Professional")} ${badge("info", "Pending review")}</p></div></div>
  <div class="notice notice-ai notice-compact" role="note"><strong>AI draft — review before use.</strong> Amount, date and reference were filled in from your saved invoice; the AI never saw them. Nothing is sent.</div>
  <h3 class="h3 p6-h3">Verified facts used</h3>
  ${facts}
  <label class="label-strong" for="p6-msg">Message</label>
  <textarea id="p6-msg" class="textarea p6-text" rows="9">${esc(MESSAGE)}</textarea>
  <p class="cell-sub p6-tight">${MESSAGE.length} / 2000 characters · Unsaved edits are kept until you save or leave.</p>
  <details class="p6-why" open><summary>Why this wording (AI rationale)</summary><p>${esc(RATIONALE)}</p></details>
  <div class="p6-actions">
    <button type="button" class="btn btn-primary">Approve for manual use</button>
    <button type="button" class="btn btn-secondary">Save edits</button>
    <div class="p6-regen"><label class="sr-only" for="p6-tone">Tone for a new draft</label><select id="p6-tone" class="select"><option>Friendly</option><option selected>Professional</option><option>Firm</option></select><button type="button" class="btn btn-secondary">Regenerate</button></div>
    <button type="button" class="btn btn-secondary p6-reject">Reject</button>
  </div>
  <p class="hint p6-tight">Copy becomes available after approval. Approving does not send anything.</p>
</section>`;

const queuePending = shell(`
<div class="page-head"><div><h1 class="screen-title">Nudge queue</h1><p class="subtitle">AI-drafted payment follow-ups for your review — never sent automatically</p></div><button type="button" class="btn btn-primary">Draft a nudge</button></div>
${counters()}
${tabs("pending")}
<div class="p6-split"><ul class="p6-list" aria-label="Pending review">${NUDGES.map((n, i) => listRow(n, i === 0)).join("")}</ul>${reviewPanel}</div>`, { nav: "queue" });

const approvedPanel = `
<section class="card p6-review" aria-labelledby="p6-ap-title">
  <div class="p6-review-head"><div><h2 class="card-title" id="p6-ap-title">Lumen Labs</h2><p class="cell-sub">${toneBadge("Firm")} ${badge("ok", "Approved")} ${badge("neutral", "Edited by you")}</p></div></div>
  <div class="notice notice-ok notice-compact" role="status"><strong>Approved for manual use on Nov 4, 2026, 3:12 PM.</strong> Not sent — copy it into your own email or messaging app.</div>
  <pre class="p6-final">Hi Lumen Labs,

Invoice 4e63810d for USD 2,450.00 was due on October 12, 2026. Please reply this week with the date payment will be made, or let me know if anything needs to be resolved first.

Kind regards,</pre>
  <div class="p6-actions"><button type="button" class="btn btn-primary">Copy message</button><span class="p6-copied" role="status">✓ Copied to clipboard</span></div>
  <details class="p6-why"><summary>Original AI draft and rationale</summary><p class="cell-sub">Kept unchanged for your records.</p></details>
</section>`;
const queueApproved = shell(`
<div class="page-head"><div><h1 class="screen-title">Nudge queue</h1><p class="subtitle">AI-drafted payment follow-ups for your review — never sent automatically</p></div><button type="button" class="btn btn-primary">Draft a nudge</button></div>
${counters()}
${tabs("approved")}
<div class="p6-split"><ul class="p6-list" aria-label="Approved">${APPROVED.map((a, i) => `<li><button type="button" class="p6-row" ${i === 0 ? 'aria-current="true"' : ""}><span class="p6-row-top"><strong>${esc(a.customer)}</strong><span class="num">${esc(a.amount)}</span></span><span class="p6-row-meta">${badge("ok", "Approved")} ${toneBadge(a.tone)} ${a.edited ? badge("neutral", "Edited") : ""}</span><span class="cell-sub">${esc(a.when)} · ${notSent}</span></button></li>`).join("")}</ul>${approvedPanel}</div>`, { nav: "queue" });

const queueHistory = shell(`
<div class="page-head"><div><h1 class="screen-title">Nudge queue</h1><p class="subtitle">AI-drafted payment follow-ups for your review — never sent automatically</p></div></div>
${counters()}
${tabs("history")}
<div class="table-card"><table class="data"><caption class="sr-only">Closed nudges</caption><thead><tr><th scope="col">Customer</th><th scope="col">Amount</th><th scope="col">Tone</th><th scope="col">Outcome</th><th scope="col">When</th></tr></thead>
<tbody>${HISTORY.map((h) => `<tr><td>${esc(h.customer)}</td><td class="num">${esc(h.amount)}</td><td>${toneBadge(h.tone)}</td><td>${badge(h.badge, h.state)}</td><td class="cell-sub">${esc(h.when)}</td></tr>`).join("")}</tbody></table></div>
<p class="hint">History keeps rejected drafts and drafts replaced by a newer one. Nothing in history was sent.</p>`, { nav: "queue" });

const draftCard = (state) => `
<section class="card p6-draft" aria-labelledby="p6-d-title">
  <h2 class="card-title" id="p6-d-title">AI payment nudge</h2>
  <p class="hint p6-tight">Draft a follow-up for this invoice. You review and approve it; nothing is sent.</p>
  <fieldset class="plain-fieldset p6-tones"><legend class="label-strong">Tone</legend>
    ${[["Friendly", "Warm and relaxed — good before or just after the due date."], ["Professional", "Courteous and concise — a safe default."], ["Firm", "Direct about asking for a payment update, still polite. Never threatening."]].map(([t, d], i) => `<label class="p6-tone"><input type="radio" name="tone" ${i === 1 ? "checked" : ""}> <span><strong>${t}</strong><span class="cell-sub">${d}</span></span></label>`).join("")}
  </fieldset>
  <div class="notice notice-info notice-compact" role="note"><strong>Privacy:</strong> the AI receives only the tone, the currency code and where today falls relative to the due date — not the customer's name, e-mail, items, amount or dates. Those are filled in from your saved invoice afterwards.</div>
  ${state === "busy" ? `<p role="status" class="p6-busy"><span class="spinner" aria-hidden="true"></span> Drafting a professional nudge… this usually takes a few seconds.</p><button type="button" class="btn btn-primary" disabled>Drafting…</button>` : `<button type="button" class="btn btn-primary">Draft nudge</button>`}
</section>`;
const draftScreen = shell(`
<div class="page-head"><div><h1 class="screen-title">Zorblax Industries</h1><p class="subtitle">Saved invoice c615eb2b · USD 1,200.00 · due October 30, 2026</p></div></div>
${p5Placeholder("Saved invoice details, PayPal draft panel, follow-up reminders")}
<div class="grid-2 p6-grid2">${draftCard("idle")}${draftCard("busy")}</div>`);

const stateCard = (title, body, kind = "info", action = "") => `<section class="card p6-state"><h3 class="h3">${esc(title)}</h3>${kind === "skeleton" ? body : `<div class="notice notice-${kind} notice-compact" role="${kind === "err" ? "alert" : "status"}">${body}</div>`}${action}</section>`;
const states = shell(`
<div class="page-head"><div><h1 class="screen-title">Required states</h1><p class="subtitle">Loading, empty, error and refusal states for the queue and drafting. In every state, nothing is sent.</p></div></div>
<div class="p6-states">
${stateCard("Loading", `<div aria-busy="true"><div class="skeleton sk-h18 sk-w40"></div><div class="skeleton sk-h30 sk-w70 mt-8"></div><div class="skeleton sk-h14 sk-w55 mt-8"></div></div>`, "skeleton")}
${stateCard("Empty queue", "<strong>No nudges waiting for review.</strong> Draft one from a saved invoice or ask Nudgey: “draft a friendly nudge for Northwind”.", "info", `<button type="button" class="btn btn-primary btn-sm mt-12">Draft a nudge</button>`)}
${stateCard("Queue could not load", "<strong>Could not load your nudges.</strong> Your invoices are unaffected.", "err", `<button type="button" class="btn btn-secondary btn-sm mt-12">Retry</button>`)}
${stateCard("AI drafting is off", "<strong>AI drafting isn't available on this server.</strong> You can still review, approve and copy existing drafts.", "warn")}
${stateCard("Draft limit reached", "<strong>You've reached the drafting limit for now.</strong> Try again in about 8 minutes. This keeps AI cost bounded.", "warn")}
${stateCard("Draft refused", "<strong>The AI's draft didn't pass our checks</strong> (for example it invented a number, a link or a payment-status claim), so nothing was saved. Try again or choose another tone.", "warn", `<button type="button" class="btn btn-secondary btn-sm mt-12">Try again</button>`)}
${stateCard("Changed elsewhere", "<strong>This draft changed in another tab.</strong> Reload it to see the latest text before approving.", "warn", `<button type="button" class="btn btn-secondary btn-sm mt-12">Reload draft</button>`)}
${stateCard("A draft is already pending", "<strong>This invoice already has a draft waiting for review.</strong> Regenerating replaces it (the old one moves to History).", "info", `<div class="p6-actions mt-12"><button type="button" class="btn btn-primary btn-sm">Replace with a new draft</button><button type="button" class="btn btn-secondary btn-sm">Review existing</button></div>`)}
</div>`);

const chat = shell(`
<div class="page-head"><div><h1 class="screen-title">Invoice drafts</h1><p class="subtitle">Nudgey connects to the same drafting workflow</p></div></div>
${p5Placeholder("Dashboard (unchanged) behind the Nudgey panel")}`, {
  nudgey: `
<aside class="p6-nudgey card" aria-label="Nudgey">
  <div class="nudgey-heading"><div><h2 class="nudgey-title">Nudgey</h2><p class="nudgey-kicker">Your invoice companion</p></div><button type="button" class="nudgey-close" aria-label="Close Nudgey">×</button></div>
  <div class="chat-log p6-chatlog">
    <div class="chat-msg chat-user">draft a firm nudge for zorblax</div>
    <div class="chat-msg chat-bot"><p class="chat-title">I found 1 matching invoice</p>
      <ul class="chat-cards"><li class="chat-card"><div class="chat-card-head"><strong>Zorblax Industries</strong><span class="chat-amount">USD 1,200.00</span></div><div class="chat-card-meta">Invoice due October 30, 2026</div></li></ul>
      <p class="chat-hint">Draft a <strong>firm</strong> nudge for this invoice? It goes to your queue for review — nothing is sent.</p>
      <div class="chat-chips"><button type="button" class="btn btn-primary btn-sm">Draft firm nudge</button><button type="button" class="chat-chip">Change tone</button><button type="button" class="chat-chip">Cancel</button></div></div>
    <div class="chat-msg chat-bot"><p class="chat-title">Draft ready for review</p>
      <blockquote class="p6-quote">Hi Zorblax Industries, invoice c615eb2b for USD 1,200.00 which was due on October 30, 2026. Please reply this week with the date payment will be made…</blockquote>
      <p class="chat-hint">${badge("info", "Pending review")} in your Nudge queue. Approve it there; copying is up to you.</p>
      <div class="chat-chips"><button type="button" class="btn btn-secondary btn-sm">Open in queue</button></div></div>
  </div>
  <form class="chat-form p6-chatform" onsubmit="return false"><label class="sr-only" for="p6-ask">Ask Nudgey</label><input id="p6-ask" class="input" placeholder="e.g. draft a friendly nudge for Northwind"><button type="button" class="btn btn-secondary btn-sm" aria-label="Speak (on-device)">🎤</button><button type="button" class="btn btn-primary btn-sm">Ask</button></form>
  <p class="nudgey-footnote">You're in control. Nothing is sent automatically. Voice stays on this device.</p>
</aside>`,
});

const FRAMES = [
  ["01-dashboard-queue-summary", "Dashboard: AI Nudge Queue above the unchanged P5 filters and charts", dashboard],
  ["02-queue-pending-review", "Nudge queue — Pending review with the review/edit panel", queuePending],
  ["03-queue-approved-copy", "Nudge queue — Approved for manual use, Copy", queueApproved],
  ["04-queue-history", "Nudge queue — History (rejected and replaced)", queueHistory],
  ["05-draft-from-invoice", "Draft a nudge from a saved invoice (tone choice, privacy note, drafting state)", draftScreen],
  ["06-required-states", "Required loading / empty / error / refusal states", states],
  ["07-nudgey-chat-draft", "Nudgey chat connected to the drafting workflow (voice reuses on-device input)", chat],
];

const previewCss = `
.p6-count{display:inline-block;min-width:20px;padding:0 6px;margin-left:4px;border-radius:999px;background:var(--info-bg);color:var(--info-text);font-size:12px;font-weight:700;text-align:center}
.p6-summary{margin-top:16px}.p6-summary-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start}
.p6-summary-actions,.p6-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.p6-tight{margin:4px 0 0}
.p6-counters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
.p6-counters div{background:var(--surface-sunken);border-radius:var(--radius);padding:10px 12px}.p6-counters dt{font-size:12px;color:var(--text-muted)}.p6-counters dd{margin:2px 0 0;font-size:22px;font-weight:700;color:var(--text)}
.p6-mini{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}.p6-mini li{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap}
.p6-mini-main,.p6-mini-side{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.p6-p5{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:14px 16px;border:1px dashed var(--border-input);border-radius:var(--radius-lg);color:var(--text-2);background:var(--surface)}
.p6-tabs{margin:14px 0}.p6-split{display:grid;grid-template-columns:minmax(260px,1fr) minmax(0,2fr);gap:16px;align-items:start}
.p6-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.p6-row{width:100%;text-align:left;display:grid;gap:6px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface);color:var(--text);font:inherit;cursor:pointer;min-height:44px}
.p6-row[aria-current=true]{border-color:var(--action-bg);box-shadow:0 0 0 2px var(--info-bg)}.p6-row-top{display:flex;justify-content:space-between;gap:8px}.p6-row-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.p6-review{display:grid;gap:10px}.p6-h3{margin-top:4px}.p6-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}.p6-facts div{background:var(--surface-sunken);border-radius:var(--radius);padding:8px 10px}.p6-facts dt{font-size:12px;color:var(--text-muted)}.p6-facts dd{margin:2px 0 0;font-weight:700;font-size:14px}
.p6-text{width:100%;min-height:190px;font:inherit;line-height:1.5}.p6-why summary{cursor:pointer;color:var(--link);font-weight:600;min-height:44px;display:flex;align-items:center}.p6-why p{margin:6px 0 0;color:var(--text-2)}
.p6-regen{display:flex;gap:6px}.p6-reject{color:var(--err-text)}.p6-final{white-space:pre-wrap;font:inherit;line-height:1.5;margin:0;padding:12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-sunken);color:var(--text)}
.p6-copied{color:var(--ok-text);font-weight:600}.p6-notsent{font-size:12px;color:var(--text-muted)}
.p6-grid2{margin-top:16px;gap:16px}.p6-tones{display:grid;gap:8px;margin:10px 0}.p6-tone{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--border);border-radius:var(--radius);min-height:44px}.p6-tone span{display:grid}
.p6-draft{display:grid;gap:10px}.p6-busy{display:flex;gap:8px;align-items:center;margin:0}
.p6-states{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:12px}.p6-state{display:grid;gap:8px}
.p6-nudgey{position:fixed;right:16px;bottom:16px;width:min(400px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;z-index:20;display:grid;gap:10px}
.p6-chatlog{display:grid;gap:10px}.p6-quote{margin:6px 0;padding:8px 10px;border-left:3px solid var(--ai-text);background:var(--ai-bg);color:var(--text);font-size:13px}
.p6-chatform{display:flex;gap:6px}.p6-chatform .input{flex:1;min-width:0}
.h3{font-size:14px;font-weight:700;margin:0;color:var(--text-2)}
@media (max-width:767px){.p6-split{grid-template-columns:1fr}.p6-counters dd{font-size:18px}.p6-facts{grid-template-columns:1fr 1fr}.p6-actions .btn{flex:1 1 auto;min-height:44px}.p6-regen{flex:1 1 100%}.p6-regen .select{flex:1;min-width:10.5rem}.p6-p5{flex-direction:column;align-items:flex-start;gap:4px}.p6-nudgey{position:static;width:auto;margin-top:12px}}
`;

const html = `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>NMI P6 AI Nudge Queue design</title>
<style>/* ===== real tokens.css (verbatim) ===== */
${tokensCss}
/* ===== real app.css (verbatim) ===== */
${appCss}
/* ===== P6 review-only preview styles ===== */
${previewCss}</style></head>
<body>
${FRAMES.map(([id, label, body]) => `<section class="p6-frame" id="${id}" data-label="${esc(label)}" hidden>${body}</section>`).join("\n")}
<script>
const show = () => { const id = location.hash.slice(1) || "${FRAMES[0][0]}"; document.querySelectorAll('.p6-frame').forEach((f) => (f.hidden = f.id !== id)); };
addEventListener('hashchange', show); show();
</script>
</body></html>`;
mkdirSync(dirname(OUT_HTML), { recursive: true });
writeFileSync(OUT_HTML, html);

/* ------------------------------------------------------------------ capture */
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "nmi-p6-preview-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGTERM"); } catch {} try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {} });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {} await sleep(150); }
const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((ok, bad) => { const i = ++id; pending.set(i, (d) => (d.error ? bad(new Error(method + ": " + d.error.message)) : ok(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
await send("Page.enable");
const VIEWS = { desktop: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, mobile: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } };
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, result: ok ? "PASS" : "FAIL", detail: ok ? "" : String(detail).slice(0, 300) }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " - " + detail}`); };
for (const [vname, v] of Object.entries(VIEWS)) {
  await send("Emulation.setDeviceMetricsOverride", v);
  for (const [fid] of FRAMES) {
    await send("Page.navigate", { url: `file://${OUT_HTML}#${fid}` });
    await sleep(350);
    const over = await ev("document.scrollingElement.scrollWidth - innerWidth");
    check(`${vname} ${fid}: no horizontal page overflow`, over <= 0, String(over));
    if (vname === "mobile") {
      const small = await ev(`[...document.querySelectorAll('.p6-frame:not([hidden]) button, .p6-frame:not([hidden]) [role=tab], .p6-frame:not([hidden]) select')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height < 44; }).length`);
      check(`${vname} ${fid}: interactive controls are at least 44px tall (owner refinement 3)`, small === 0, String(small));
    }
    const h = await ev("Math.ceil(document.documentElement.scrollHeight)");
    await send("Emulation.setDeviceMetricsOverride", { ...v, height: Math.min(h, 4000) });
    await sleep(250);
    const s = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `${fid}-${vname}.png`), Buffer.from(s.data, "base64"));
    await send("Emulation.setDeviceMetricsOverride", v);
  }
}
const all = FRAMES.map(([, , b]) => b).join("\n");
const SAYS_NOT_SENT = /[Nn]othing (is|in history was) (ever )?sent|[Nn]ot sent|[Nn]othing is sent|never sent|[Nn]othing is sent automatically/;
check("every screen states that nothing is sent automatically", FRAMES.every(([, , b]) => SAYS_NOT_SENT.test(b)), FRAMES.filter(([, , b]) => !SAYS_NOT_SENT.test(b)).map(([f]) => f).join(","));
check("approval is labelled 'for manual use', never 'send'", /Approve for manual use/.test(all) && !/>\s*Send( nudge| now| reminder)?\s*</i.test(all.replace(/aria-label="Speak[^"]*"/g, "")));
check("no unsupported payment-status claims (owner refinement 1: a due date does not establish payment status)", !/unpaid|overdue|outstanding|remains? (unpaid|due)|past due|not been paid/i.test(all));
check("no fictional recovered cash, delivery, payment confirmation or risk prediction", !/recovered|delivered|opened|read receipt|paid via|likely to pay|risk score|probability/i.test(all));
writeFileSync(join(here, "design-checks.json"), JSON.stringify({ task: "NMI-P6", generatedBy: "design/evidence/NMI-P6/build-and-capture-preview.mjs", synthetic: true, checks }, null, 2) + "\n");
const fails = checks.filter((c) => c.result === "FAIL").length;
console.log(`\n${checks.length - fails}/${checks.length} design checks passed`);
ws.close();
process.exit(fails ? 1 : 0);
