/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-PROTOTYPE-10D-A4 local judge-demo rehearsal (SIMULATED providers; synthetic data only).
//
// Run from a clean clone after `pnpm install --frozen-lockfile` and `pnpm --filter @nmi/web build`:
//   node design/evidence/NMI-PROTOTYPE-10D-A4/run-a4-rehearsal.mjs
//
// What it builds (all disposable, all local):
//   * a private PostgreSQL 16 cluster in a temp directory + a NEW nmi_test_* database, the journal
//     migrations applied exactly once, one synthetic operator provisioned by the real CLI;
//   * the REAL Fastify API through the test-only SIMULATED launcher (NMI-DEMO-R0/simulated-eval-server.ts:
//     fake parser, fake PayPal client; no real client is ever constructed), run inside a macOS
//     `sandbox-exec` profile that DENIES all non-loopback network, with the sandbox itself probed;
//   * the production web build served by `vite preview` (strict CSP) on the same origin as /api;
//   * headless Chrome (CDP), time zone emulated as Asia/Manila.
// It then compares the analytics API and the dashboard KPI cards with INDEPENDENT SQL over every matched
// owner-scoped row, and exercises auth/CSRF/privacy, the invoice journey, filters, error/timeout/
// cancellation/late-401 states, logout revocation and a 390px viewport.
// Nothing here is real-provider evidence. No owner database, credential or provider is touched.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const WEB_PORT = 4164;
const ORIGIN = `http://localhost:${WEB_PORT}`;
const API_PORT = 3164;
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54364;
const DEBUG_PORT = 9364;
const DB = "nmi_test_a4_20261103";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots");
const SANDBOX = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))';
const USER = "a4-operator";
const PASSWORD = randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (group, name, cond, detail = "") => {
  results.push({ group, name, result: cond ? "PASS" : "FAIL", detail: cond ? "" : String(detail).slice(0, 700) });
  console.log(`${cond ? "PASS" : "FAIL"}  [${group}] ${name}${cond ? "" : " - " + String(detail).slice(0, 400)}`);
};
const info = {};
const startedAt = new Date();
if (!existsSync(join(root, "apps/web/dist/index.html"))) throw new Error("Run `pnpm --filter @nmi/web build` first");

const work = mkdtempSync(join(tmpdir(), "nmi-a4-"));
const children = [];
const extraDirs = [];
const groupAlive = (pid) => { try { process.kill(-pid, 0); return true; } catch { return false; } };
const killGroup = (c, sig) => { try { process.kill(-c.pid, sig); } catch { try { c.kill(sig); } catch {} } };
/* Single-flight: every path (normal end, exception, rejection, SIGINT/SIGTERM) shares ONE cleanup run.
   Order matters: stop every child (own process group) first, stop PostgreSQL second, delete data last. */
let cleanupRun = null;
const cleanup = () => (cleanupRun ??= (async () => {
  for (const c of children) killGroup(c, "SIGTERM");
  for (let i = 0; i < 50 && children.some((c) => groupAlive(c.pid)); i++) await sleep(100);
  for (const c of children) if (groupAlive(c.pid)) killGroup(c, "SIGKILL");
  const pidFile = join(work, "pg", "postmaster.pid");
  if (existsSync(pidFile)) {
    spawnSync(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    if (existsSync(pidFile)) {
      const pgPid = Number(readFileSync(pidFile, "utf8").split("\n")[0]);
      if (Number.isInteger(pgPid) && pgPid > 1) { try { process.kill(pgPid, "SIGKILL"); } catch {} }
      await sleep(300);
    }
  }
  for (const d of [work, ...extraDirs]) rmSync(d, { recursive: true, force: true });
})());
/* Abnormal ends: print the reason, clean up once, then exit nonzero (130/143 for SIGINT/SIGTERM). */
let exiting = false;
const abort = (why, code) => {
  if (exiting) return;
  exiting = true;
  console.error(`\nA4 rehearsal aborted: ${why}`);
  const hard = setTimeout(() => process.exit(code), 30000);
  hard.unref();
  cleanup().catch((e) => console.error("cleanup failed:", e)).finally(() => process.exit(code));
};
process.on("uncaughtException", (e) => abort(e?.stack ?? String(e), 1));
process.on("unhandledRejection", (e) => abort(e?.stack ?? String(e), 1));
process.on("SIGINT", () => abort("SIGINT", 130));
process.on("SIGTERM", () => abort("SIGTERM", 143));
/* Last-resort synchronous fallback (e.g. process.exit elsewhere): never delete data under a live server. */
process.on("exit", () => {
  for (const c of children) killGroup(c, "SIGKILL");
  if (existsSync(join(work, "pg", "postmaster.pid"))) spawnSync(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
  try { for (const d of [work, ...extraDirs]) rmSync(d, { recursive: true, force: true }); } catch {}
});

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts, env: { LC_ALL: "en_US.UTF-8", ...(opts.env ?? process.env) } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || "").slice(0, 300)}`);
  return r.stdout;
};
const verOf = (cmd, args) => (spawnSync(cmd, args, { encoding: "utf8" }).stdout || "").trim().split("\n")[0];

/* ---------------------------------------------------------------- environment record */
info.node = process.version;
info.pnpm = verOf("pnpm", ["-v"]);
info.postgres = verOf(join(PG_BIN, "postgres"), ["--version"]);
info.chrome = verOf(CHROME, ["--version"]);
info.os = `${verOf("uname", ["-sr"])} ${verOf("uname", ["-m"])}`;
info.sourceSha = verOf("git", ["-C", root, "rev-parse", "HEAD"]);
info.dirty = verOf("git", ["-C", root, "status", "--porcelain", "--", ".", ":!design/evidence/NMI-PROTOTYPE-10D-A4"]) === "" ? "clean working tree" : "DIRTY working tree";
info.startedAt = startedAt.toISOString();
check("clean clone", "exact source SHA recorded and the working tree is clean", /^[0-9a-f]{40}$/.test(info.sourceSha) && info.dirty === "clean working tree", `${info.sourceSha} ${info.dirty}`);

/* ---------------------------------------------------------------- disposable PostgreSQL 16 */
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_a4", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_a4", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_a4@127.0.0.1:${PG_PORT}/${DB}`;
info.database = `${DB} on 127.0.0.1:${PG_PORT} (private cluster in a temp directory)`;
info.migrations = journal.entries.length;
check("database", `a NEW disposable PostgreSQL 16 database (${DB}) was created in a private temp cluster and all ${journal.entries.length} journal migrations were applied once`, Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")) >= 9 && /^nmi_test/.test(DB));
run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: PASSWORD } });
const OP = sql(`SELECT id FROM operators WHERE username='${USER}'`);
check("database", "one synthetic operator was provisioned with the real CLI (random password, never printed)", /^[0-9a-f-]{36}$/.test(OP));

/* ---------------------------------------------------------------- network sandbox proof + servers */
writeFileSync(join(work, "probe.mjs"), `import net from "node:net"; const s = net.connect({ host: "192.0.2.1", port: 443, timeout: 2000 }); s.on("connect", () => { console.log("CONNECTED"); process.exit(0); }); s.on("error", (e) => { console.log(e.code); process.exit(0); }); s.on("timeout", () => { console.log("TIMEOUT"); process.exit(0); });`);
const probeIn = spawnSync("sandbox-exec", ["-p", SANDBOX, process.execPath, join(work, "probe.mjs")], { encoding: "utf8" }).stdout.trim();
check("isolation", "the network sandbox the API runs in denies non-loopback egress (connect to the reserved documentation address 192.0.2.1 is refused with EPERM before any packet exists)", probeIn === "EPERM", probeIn);
const loopOk = await new Promise((res) => { const srv = spawn("sandbox-exec", ["-p", SANDBOX, process.execPath, "-e", `import("node:net").then(({default:n})=>{const s=n.createServer().listen(0,"127.0.0.1",()=>{const p=s.address().port;const c=n.connect(p,"127.0.0.1",()=>{console.log("LOOP_OK");process.exit(0)});c.on("error",e=>{console.log(e.code);process.exit(0)})})})`], { stdio: ["ignore", "pipe", "ignore"] }); let o = ""; srv.stdout.on("data", (d) => (o += d)); srv.on("close", () => res(o.trim())); });
check("isolation", "loopback still works inside the same sandbox", loopOk === "LOOP_OK", loopOk);

const apiLog = join(work, "api.log");
const modelLog = join(work, "model-calls.log");
const ppLog = join(work, "fake-paypal-calls.log");
writeFileSync(modelLog, ""); writeFileSync(ppLog, "");
const apiEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, DATABASE_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", OPENAI_API_KEY: "", OPENAI_MODEL: "", NMI_SIMULATED_EVAL: "1", NMI_FAKE_MODEL_LOG: modelLog, NMI_FAKE_PAYPAL_LOG: ppLog, PAYPAL_DRAFTS_ENABLED: "true", PAYPAL_CLIENT_ID: "cid-" + randomBytes(6).toString("hex"), PAYPAL_CLIENT_SECRET: "csec-" + randomBytes(10).toString("hex") };
let api = null;
async function startApi() {
  const out = openSync(apiLog, "a");
  api = spawn("sandbox-exec", ["-p", SANDBOX, "pnpm", "--filter", "@nmi/api", "exec", "tsx", join(root, "design/evidence/NMI-DEMO-R0/simulated-eval-server.ts")], { cwd: root, stdio: ["ignore", out, out], env: apiEnv, detached: true });
  children.push(api);
  for (let i = 0; i < 300; i++) { try { if ((await fetch(API + "/health")).ok) return; } catch {} await sleep(150); }
  throw new Error("API did not start");
}
async function stopApi() {
  try { process.kill(-api.pid, "SIGTERM"); } catch {}
  for (let i = 0; i < 80; i++) { try { await fetch(API + "/health"); await sleep(100); } catch { break; } }
}
const preview = spawn("pnpm", ["--filter", "@nmi/web", "exec", "vite", "preview", "--host", "localhost", "--port", String(WEB_PORT), "--strictPort"], { cwd: root, stdio: "ignore", env: { ...process.env, NMI_API_ORIGIN: API }, detached: true });
children.push(preview);
await startApi();
for (let i = 0; i < 100; i++) { try { if ((await fetch(ORIGIN + "/")).ok) break; } catch {} await sleep(150); }
const health = await (await fetch(ORIGIN + "/health")).json();
check("simulated mode", "the SIMULATED launcher (fake parser + fake PayPal client) is up behind the web proxy; /health says aiConfigured=false; no real OpenAI/PayPal credential exists in its environment", health.status === "ok" && health.aiConfigured === false && apiEnv.OPENAI_API_KEY === "" && /^cid-/.test(apiEnv.PAYPAL_CLIENT_ID));
check("simulated mode", "the production server entry has no simulation switch (unit-tested) and the launcher refuses to run without NMI_SIMULATED_EVAL=1", (() => { const r = spawnSync("pnpm", ["--filter", "@nmi/api", "exec", "tsx", join(root, "design/evidence/NMI-DEMO-R0/simulated-eval-server.ts")], { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME } }); return r.status !== 0 && /Refusing to start: set NMI_SIMULATED_EVAL=1/.test(r.stderr); })());

/* ---------------------------------------------------------------- API session helpers (node side) */
async function nodeLogin(password = PASSWORD, user = USER, origin = ORIGIN) {
  const r = await fetch(API + "/api/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ username: user, password }) });
  const body = await r.json().catch(() => ({}));
  const sc = r.headers.getSetCookie();
  return { status: r.status, body, csrf: body.csrfToken, cookie: sc.map((c) => c.split(";")[0]).join("; "), setCookie: sc.join(" | ") };
}
const authed = (s, extra = {}) => ({ origin: ORIGIN, cookie: s.cookie, "x-csrf-token": s.csrf, "content-type": "application/json", ...extra });
const post = async (s, path, body, extra = {}) => { const r = await fetch(API + path, { method: "POST", headers: authed(s, extra), body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const getJson = async (s, path) => { const r = await fetch(API + path, { headers: { cookie: s.cookie } }); return { status: r.status, body: await r.json().catch(() => null) }; };

/* ---------------------------------------------------------------- synthetic population (through the REAL save route) */
const S = await nodeLogin();
const mkInvoice = (i) => {
  const jpy = i % 11 === 5;
  const eur = !jpy && i % 3 === 1;
  const currency = jpy ? "JPY" : eur ? "EUR" : "USD";
  const unit = jpy ? String(1000 + i * 13) : `${10 + i}.${String((i * 7) % 100).padStart(2, "0")}`;
  return {
    customerName: i < 3 ? "Northwind Studio" : `A4 Client ${String(i).padStart(2, "0")}`,
    customerEmail: i < 3 ? `ap${i}@northwind.example` : `client${i}@a4.example`,
    currency,
    lineItems: [{ description: `Synthetic work ${i}`, quantity: String(1 + (i % 3)), unitPrice: unit }],
    dueDate: "2030-01-15",
    taxPercent: i % 4 === 0 ? "8" : null,
    discount: i % 5 === 0 && !jpy ? { kind: "percent", value: "10" } : null,
  };
};
const N_API = 66;
const ids = [];
for (let i = 0; i < N_API; i++) {
  const r = await post(S, "/api/invoice-drafts", mkInvoice(i), { "idempotency-key": `a4-seed-${String(i).padStart(4, "0")}-key-xxxxxxxx` });
  if (r.status !== 201) throw new Error(`seed ${i} failed: ${r.status} ${JSON.stringify(r.body)}`);
  ids.push(r.body.id);
}
check("seed", `${N_API} synthetic invoices (USD / EUR / JPY, more than three 20-row pages) were saved through the real POST /api/invoice-drafts route`, ids.length === N_API && Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${OP}'`)) === N_API);
// Spread created_at over the last 25 days (SQL on the disposable DB only) and pin boundary instants.
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const pinned = {
  B1: [ids[60], "2026-10-10T16:00:00.000Z"], // Asia/Manila 2026-10-11 00:00:00.000: inclusive start
  B2: [ids[61], "2026-10-10T15:59:59.999Z"], // 1 ms before: excluded
  B3: [ids[62], "2026-10-12T15:59:59.999Z"], // last ms before the exclusive end: included
  B4: [ids[63], "2026-10-12T16:00:00.000Z"], // exactly the exclusive end: excluded
  D1: [ids[64], "2026-11-01T05:30:00.000Z"], // New York 01:30 EDT (first 01:30)
  D2: [ids[65], "2026-11-01T06:30:00.000Z"], // New York 01:30 EST (second 01:30)
  D3: [ids[59], "2026-11-02T04:59:59.999Z"], // New York 23:59:59.999 EST on Nov 1
  D4: [ids[58], "2026-11-02T05:00:00.000Z"], // New York 00:00 EST on Nov 2
};
const pinnedIds = new Set(Object.values(pinned).map((v) => v[0]));
const upd = ids.map((id, i) => [id, pinnedIds.has(id) ? Object.values(pinned).find((v) => v[0] === id)[1] : iso(now - (i % 25) * 86_400_000 - i * 7 * 60_000 - 3_600_000)]);
sql(`UPDATE invoices SET created_at = v.t::timestamptz FROM (VALUES ${upd.map(([id, t]) => `('${id}','${t}')`).join(",")}) AS v(id, t) WHERE invoices.id = v.id::uuid`);
// Negative controls: an ownerless row and another operator's row (the disposable DB drops the single-operator index).
sql("DROP INDEX operators_single_row_uq");
sql("INSERT INTO operators (username, password_hash) VALUES ('a4-other', 'scrypt$1024$8$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')");
const OTHER = sql("SELECT id FROM operators WHERE username='a4-other'");
const negRow = (owner, name) => `INSERT INTO invoices (customer_name, customer_email, currency, subtotal_minor, total_minor, due_date, created_by, created_at) VALUES ('${name}', 'x@neg.example', 'USD', 99999900, 99999900, '2030-01-01', ${owner}, now() - interval '1 day')`;
sql(negRow("NULL", "A4 Ownerless Negative"));
sql(negRow(`'${OTHER}'`, "A4 Other Operator Negative"));
const otherInvoiceId = sql("SELECT id FROM invoices WHERE customer_name='A4 Other Operator Negative'");
// PayPal-state rows (SIMULATED: inserted directly, labelled as such; no provider exists in this run).
const opRow = (id, state, extra) => sql(`INSERT INTO paypal_draft_operations (invoice_id, state, invoice_number, payload_digest, attempts, invoice_date${extra.cols}) VALUES ('${id}', '${state}', 'NMI-${id.replaceAll("-", "").slice(0, 20)}', repeat('a', 64), ${extra.attempts}, '2026-11-03'${extra.vals})`);
const simulatedCreated = ids.slice(0, 3);
for (const [k, id] of simulatedCreated.entries()) opRow(id, "created", { attempts: 1, cols: ", paypal_invoice_id, completed_at", vals: `, 'INV2-SIMULATED-000${k}', now()` });
for (const id of ids.slice(3, 5)) opRow(id, "creating", { attempts: 1, cols: ", claimed_at, create_attempted_at", vals: ", now(), now()" });
opRow(ids[5], "rejected", { attempts: 1, cols: ", last_error_code, completed_at", vals: ", 'oauth_http_401', now()" });
const stateTally = sql("SELECT string_agg(state || ':' || n, ',' ORDER BY state) FROM (SELECT state, count(*) n FROM paypal_draft_operations GROUP BY state) t");
check("seed", "SIMULATED operation rows give every status group a population (created x3, progress x2, attention x1, the rest none); ownerless and other-operator rows exist as negative controls", stateTally === "created:3,creating:2,rejected:1" && Number(sql("SELECT count(*) FROM invoices WHERE created_by IS NULL OR created_by <> '" + OP + "'")) === 2, stateTally);

/* ---------------------------------------------------------------- independent SQL vs the analytics API */
const EXP = { USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, JPY: 0 };
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;
function baseSql(b) {
  const w = [`i.created_by = '${OP}'`, `i.created_at >= ${lit(b.fromInclusive)}::timestamptz`, `i.created_at < ${lit(b.toExclusive)}::timestamptz`];
  if (b.currency) w.push(`i.currency = ${lit(b.currency)}`);
  if (b.q) { const e = b.q.trim().replace(/[\\%_]/g, (c) => "\\" + c); w.push(`(i.customer_name ILIKE ${lit("%" + e + "%")} ESCAPE '\\' OR i.customer_email ILIKE ${lit("%" + e + "%")} ESCAPE '\\' OR i.id::text ILIKE ${lit(e + "%")} ESCAPE '\\')`); }
  const st = `(CASE WHEN o.id IS NULL THEN 'none' WHEN o.state IN ('pending','creating') THEN 'progress' WHEN o.state = 'created' THEN 'created' ELSE 'attention' END)`;
  if (b.status) w.push(`${st} = ${lit(b.status)}`);
  return `SELECT i.currency, i.total_minor, i.created_at, ${st} AS st FROM invoices i LEFT JOIN paypal_draft_operations o ON o.invoice_id = i.id WHERE ${w.join(" AND ")}`;
}
function expected(b) {
  const base = baseSql(b);
  const cur = JSON.parse(sql(`SELECT coalesce(json_agg(r ORDER BY currency), '[]') FROM (SELECT currency, count(*)::int AS "invoiceCount", sum(total_minor)::text AS "totalMinor", count(*) FILTER (WHERE st='none')::int AS "none", count(*) FILTER (WHERE st='progress')::int AS "progress", count(*) FILTER (WHERE st='created')::int AS "created", count(*) FILTER (WHERE st='attention')::int AS "attention" FROM (${base}) b GROUP BY currency) r`));
  const days = JSON.parse(sql(`SELECT coalesce(json_agg(r ORDER BY day, currency), '[]') FROM (SELECT to_char(timezone(${lit(b.timeZone)}, created_at), 'YYYY-MM-DD') AS day, currency, count(*)::int AS "invoiceCount", sum(total_minor)::text AS "totalMinor" FROM (${base}) b GROUP BY 1, 2) r`));
  return {
    currencies: cur.map((c) => ({ currency: c.currency, exponent: EXP[c.currency], invoiceCount: c.invoiceCount, totalMinor: c.totalMinor, stateCounts: { none: c.none, progress: c.progress, created: c.created, attention: c.attention } })),
    days: days.map((d) => ({ day: d.day, currency: d.currency, exponent: EXP[d.currency], invoiceCount: d.invoiceCount, totalMinor: d.totalMinor })),
  };
}
const norm = (s) => JSON.stringify({ currencies: [...s.currencies].sort((a, b) => a.currency.localeCompare(b.currency)), days: [...s.days].sort((a, b) => (a.day + a.currency).localeCompare(b.day + b.currency)) });
const W = { fromInclusive: "2026-09-01T00:00:00.000Z", toExclusive: "2026-12-01T00:00:00.000Z", timeZone: ZONE };
const idPrefix = ids[7].slice(0, 8);
const matrix = [
  ["whole window, Asia/Manila", { ...W }],
  ["whole window, America/New_York", { ...W, timeZone: "America/New_York" }],
  ["currency USD", { ...W, currency: "USD" }],
  ["currency EUR", { ...W, currency: "EUR" }],
  ["currency JPY (zero-decimal)", { ...W, currency: "JPY" }],
  ["status none", { ...W, status: "none" }],
  ["status created", { ...W, status: "created" }],
  ["status progress", { ...W, status: "progress" }],
  ["status attention", { ...W, status: "attention" }],
  ["search Northwind", { ...W, q: "Northwind" }],
  ["search 'a4 client 1' (case-insensitive substring)", { ...W, q: "a4 client 1" }],
  ["search by invoice-id prefix", { ...W, q: idPrefix }],
  ["search '%' (literal, not a wildcard)", { ...W, q: "%" }],
  ["search '_' (literal, not a wildcard)", { ...W, q: "_" }],
  ["no match", { ...W, q: "zzz-no-such-customer" }],
  ["currency + status + search", { ...W, currency: "USD", status: "none", q: "A4" }],
  ["Manila boundary window [B1 inclusive, B4 exclusive)", { fromInclusive: "2026-10-10T16:00:00.000Z", toExclusive: "2026-10-12T16:00:00.000Z", timeZone: ZONE }],
  ["New York DST fall-back window (Nov 1 00:00 EDT to Nov 3 00:00 EST)", { fromInclusive: "2026-11-01T04:00:00.000Z", toExclusive: "2026-11-03T05:00:00.000Z", timeZone: "America/New_York" }],
];
let parityOk = 0;
for (const [name, body] of matrix) {
  const r = await post(S, "/api/analytics/summary", body);
  const exp = expected(body);
  const got = { currencies: r.body?.currencies ?? [], days: r.body?.days ?? [] };
  const same = r.status === 200 && norm(got) === norm(exp);
  if (same) parityOk++;
  check("analytics parity", `API equals independent SQL over every matched row: ${name}`, same, `status ${r.status}; api=${norm(got).slice(0, 300)} sql=${norm(exp).slice(0, 300)}`);
}
// Negative control: the comparison must be able to FAIL. The API's EUR answer is compared with the SQL answer for USD.
{
  const eurApi = (await post(S, "/api/analytics/summary", { ...W, currency: "EUR" })).body;
  const usdSql = expected({ ...W, currency: "USD" });
  check("analytics parity", "negative control: comparing the API's EUR totals with the independent SQL for USD is detected as a MISMATCH (the parity check can fail)", norm({ currencies: eurApi.currencies, days: eurApi.days }) !== norm(usdSql));
}
const fullExp = expected(matrix[0][1]);
const popUsd = fullExp.currencies.find((c) => c.currency === "USD");
check("analytics parity", "the full population exceeds one page and two units of currency stay separate: USD, EUR and JPY each have their own count and exact minor-unit total, with no combined figure", fullExp.currencies.length === 3 && fullExp.currencies.reduce((n, c) => n + c.invoiceCount, 0) === N_API && fullExp.currencies.every((c) => /^\d+$/.test(c.totalMinor)) && N_API > 20 * 3, JSON.stringify(fullExp.currencies));
check("analytics parity", "JPY is zero-decimal (exponent 0) and USD/EUR are two-decimal (exponent 2) in the response", fullExp.currencies.find((c) => c.currency === "JPY").exponent === 0 && popUsd.exponent === 2);
const apiFull = (await post(S, "/api/analytics/summary", matrix[0][1])).body;
check("analytics parity", "the ownerless row and the other operator's row are excluded (the SQL population WITHOUT the owner filter would be larger)", Number(sql("SELECT count(*) FROM invoices")) === N_API + 2 && apiFull.currencies.reduce((n, c) => n + c.invoiceCount, 0) === N_API && !apiFull.currencies.some((c) => c.currency === "USD" && BigInt(c.totalMinor) >= 99999900n * 1n && c.invoiceCount === 1));
// Date semantics asserted directly from SQL membership (not only API == SQL).
const member = (id, from, to) => sql(`SELECT (created_at >= '${from}'::timestamptz AND created_at < '${to}'::timestamptz) FROM invoices WHERE id='${id}'`) === "t";
const mw = ["2026-10-10T16:00:00.000Z", "2026-10-12T16:00:00.000Z"];
check("date bounds", "inclusive start / exclusive end: the row AT the start and the row 1 ms before the end are in; the row 1 ms before the start and the row AT the end are out", member(pinned.B1[0], ...mw) && !member(pinned.B2[0], ...mw) && member(pinned.B3[0], ...mw) && !member(pinned.B4[0], ...mw));
const localDay = (id, tz) => sql(`SELECT to_char(timezone('${tz}', created_at), 'YYYY-MM-DD') FROM invoices WHERE id='${id}'`);
check("date bounds", "DST fall-back (America/New_York 2026-11-01): both 01:30 instants (EDT then EST) and 23:59:59.999 EST fall on local day Nov 1; 00:00:00 EST on Nov 2 starts the next local day (independent SQL, per row)", [pinned.D1, pinned.D2, pinned.D3].every((d) => localDay(d[0], "America/New_York") === "2026-11-01") && localDay(pinned.D4[0], "America/New_York") === "2026-11-02");
check("date bounds", "Manila (no DST): the inclusive-start row is local Oct 11, the last-ms row is Oct 12; the row 1 ms before the start is Oct 10 and the row AT the exclusive end is Oct 13 (both outside the window)", localDay(pinned.B1[0], ZONE) === "2026-10-11" && localDay(pinned.B3[0], ZONE) === "2026-10-12" && localDay(pinned.B2[0], ZONE) === "2026-10-10" && localDay(pinned.B4[0], ZONE) === "2026-10-13");
const nyDays = (await post(S, "/api/analytics/summary", matrix[17][1])).body.days;
check("date bounds", "the API's New York day buckets for the DST window equal the independent SQL buckets (no duplicated or missing local day across the repeated hour)", norm({ currencies: [], days: nyDays }) === norm({ currencies: [], days: expected(matrix[17][1]).days }) && nyDays.some((d) => d.day === "2026-11-01") && nyDays.some((d) => d.day === "2026-11-02"));
// Invalid requests fail closed with no data.
const bad = async (name, body, expectStatus = 400) => { const r = await post(S, "/api/analytics/summary", body); check("analytics errors", name, r.status === expectStatus && !r.body?.currencies, `${r.status} ${JSON.stringify(r.body).slice(0, 150)}`); };
await bad("a missing time zone is refused (400, no data)", { fromInclusive: W.fromInclusive, toExclusive: W.toExclusive });
await bad("an unknown time zone is refused", { ...W, timeZone: "Mars/Olympus" });
await bad("a missing end bound is refused", { fromInclusive: W.fromInclusive, timeZone: ZONE });
await bad("a reversed range is refused", { ...W, fromInclusive: W.toExclusive, toExclusive: W.fromInclusive });
await bad("a range over 366 days is refused", { ...W, fromInclusive: "2025-01-01T00:00:00.000Z", toExclusive: "2026-06-01T00:00:00.000Z" });
await bad("an unknown extra key (e.g. a client-chosen operator) is refused", { ...W, operatorId: OTHER });
await bad("an offset instead of UTC is refused", { ...W, fromInclusive: "2026-09-01T00:00:00+08:00" });

// Grid population parity: page the owner-scoped list through every page and compare with the same SQL.
async function pageAll(filter) {
  const out = [];
  let cursor;
  for (let p = 0; p < 10; p++) {
    const r = await post(S, "/api/invoice-drafts/search", { limit: 50, ...filter, ...(cursor ? { cursor } : {}) });
    if (r.status !== 200) throw new Error("list failed " + r.status);
    out.push(...r.body.items);
    cursor = r.body.nextCursor;
    if (!cursor) break;
  }
  return out;
}
const rowsAll = await pageAll({ fromInclusive: W.fromInclusive, toExclusive: W.toExclusive });
const gridByCur = {};
for (const it of rowsAll) { gridByCur[it.currency] ??= { n: 0, minor: 0n }; gridByCur[it.currency].n++; gridByCur[it.currency].minor += BigInt(it.total.replace(".", "")); }
check("grid parity", "paging the grid's list API to the end returns the same rows (count and exact per-currency sum) as the analytics API and the independent SQL", rowsAll.length === N_API && fullExp.currencies.every((c) => gridByCur[c.currency]?.n === c.invoiceCount && String(gridByCur[c.currency].minor) === c.totalMinor), JSON.stringify(Object.fromEntries(Object.entries(gridByCur).map(([k, v]) => [k, { n: v.n, minor: String(v.minor) }]))));
const eurGrid = await pageAll({ fromInclusive: W.fromInclusive, toExclusive: W.toExclusive, currency: "EUR", status: "none" });
const eurExp = expected({ ...W, currency: "EUR", status: "none" });
check("grid parity", "a currency + status filter returns the same population in the grid as in analytics (EUR / no PayPal draft)", eurGrid.length === (eurExp.currencies[0]?.invoiceCount ?? 0));

/* ---------------------------------------------------------------- auth / CSRF / privacy (API level) */
const s2 = await nodeLogin();
check("auth", "login succeeds; the session cookie is HttpOnly, SameSite=Lax and scoped to /", s2.status === 200 && /nmi_session=/.test(s2.setCookie) && /HttpOnly/i.test(s2.setCookie) && /SameSite=Lax/i.test(s2.setCookie) && /Path=\//.test(s2.setCookie), s2.setCookie.replace(/nmi_session=[^;]+/, "nmi_session=<redacted>"));
const wrong = await nodeLogin("definitely-wrong-password-1");
check("auth", "a wrong password is refused with 401 and no session cookie", wrong.status === 401 && !/nmi_session=[^;]+/.test(wrong.setCookie) && !wrong.csrf);
const refresh = await getJson(s2, "/api/auth/session");
check("auth", "session refresh (GET /api/auth/session) returns the operator and a fresh CSRF token", refresh.status === 200 && refresh.body?.operator?.username === USER && typeof refresh.body?.csrfToken === "string");
for (const [name, headers, want] of [
  ["a mutation without the CSRF token is refused (403)", { ...authed(s2), "x-csrf-token": "" }, 403],
  ["a mutation with a wrong CSRF token is refused (403)", { ...authed(s2), "x-csrf-token": "x".repeat(43) }, 403],
  ["a mutation from a foreign Origin is refused (403)", { ...authed(s2), origin: "http://evil.example" }, 403],
  ["a mutation with no Origin is refused (403)", (() => { const h = authed(s2); delete h.origin; return h; })(), 403],
]) {
  const r = await fetch(API + "/api/analytics/summary", { method: "POST", headers, body: JSON.stringify(W) });
  check("auth", name, r.status === want, `got ${r.status}`);
}
const anon = await fetch(API + "/api/analytics/summary", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(W) });
const anonList = await fetch(API + "/api/invoice-drafts/search", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" });
check("auth", "anonymous callers get 401 on analytics and the invoice list, with no data", anon.status === 401 && anonList.status === 401 && !/customer|total/i.test(await anon.text()));
const foreignDetail = await getJson(s2, `/api/invoice-drafts/${otherInvoiceId}`);
check("auth", "owner scoping: another operator's invoice is a plain 404 (and an unknown id is identical)", foreignDetail.status === 404 && (await getJson(s2, "/api/invoice-drafts/00000000-0000-4000-8000-000000000000")).status === 404 && JSON.stringify(foreignDetail.body) === JSON.stringify((await getJson(s2, "/api/invoice-drafts/00000000-0000-4000-8000-000000000000")).body));
const searchHit = await post(s2, "/api/invoice-drafts/search", { q: "Other Operator Negative" });
check("auth", "owner scoping: searching for the other operator's / ownerless customer names finds nothing", searchHit.status === 200 && searchHit.body.items.length === 0 && (await post(s2, "/api/invoice-drafts/search", { q: "Ownerless Negative" })).body.items.length === 0);
// Logout revocation and late 401.
const out = await post(s2, "/api/auth/logout", {});
const late = await fetch(API + "/api/analytics/summary", { method: "POST", headers: authed(s2), body: JSON.stringify(W) });
const lateGet = await fetch(API + "/api/auth/session", { headers: { cookie: s2.cookie } });
check("auth", "logout revokes the server session: the SAME cookie is rejected afterwards (401 on analytics and on the session check)", out.status === 204 && late.status === 401 && lateGet.status === 401, `${out.status} ${late.status} ${lateGet.status}`);

/* ---------------------------------------------------------------- browser (CDP) */
const profile = mkdtempSync(join(tmpdir(), "nmi-qa-a4-"));
extraDirs.push(profile);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore", detached: true });
children.push(chrome);
let version;
for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {} await sleep(150); }
if (!version) throw new Error("Chrome did not start");
/* Test-only failure injection (see test-cleanup-injection.mjs): fires once every resource exists. Inert unless set. */
if (process.env.A4_INJECT_FAILURE) {
  const mode = process.env.A4_INJECT_FAILURE;
  if (mode === "throw") throw new Error("injected failure (throw)");
  if (mode === "reject") { Promise.reject(new Error("injected failure (rejection)")); await sleep(60000); }
  if (mode === "sigint") { process.kill(process.pid, "SIGINT"); await sleep(60000); }
  if (mode === "sigterm") { process.kill(process.pid, "SIGTERM"); await sleep(60000); }
}
const targetInfo = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1;
const pending = new Map();
const consoleMsgs = [];
const foreign = [];
const netLog = [];
let rule = null; // Fetch interception: returns "continue" | "fail" | "hold"
const held = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
  else if (msg.method === "Runtime.exceptionThrown") consoleMsgs.push("exception: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  else if (msg.method === "Runtime.consoleAPICalled") consoleMsgs.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Log.entryAdded") consoleMsgs.push(`log.${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
  else if (msg.method === "Network.requestWillBeSent") {
    const u = msg.params.request.url;
    if (u.startsWith(ORIGIN + "/")) netLog.push({ method: msg.params.request.method, path: u.slice(ORIGIN.length), id: msg.params.requestId, body: msg.params.request.postData ?? null, hasCsrf: Object.keys(msg.params.request.headers).some((h) => h.toLowerCase() === "x-csrf-token"), t: Date.now() });
    else if (!/^(about:|data:|blob:)/.test(u)) foreign.push(u);
  } else if (msg.method === "Network.responseReceived") { const e = netLog.find((n) => n.id === msg.params.requestId); if (e) e.status = msg.params.response.status; }
  else if (msg.method === "Network.loadingFailed") { const e = netLog.find((n) => n.id === msg.params.requestId); if (e) e.failed = msg.params.canceled ? "canceled" : msg.params.errorText; }
  else if (msg.method === "Fetch.requestPaused") {
    const id = msg.params.requestId;
    const act = rule ? rule(msg.params) : "continue";
    if (act === "fail") send("Fetch.failRequest", { requestId: id, errorReason: "InternetDisconnected" }).catch(() => {});
    else if (act === "hold") held.push(id);
    else send("Fetch.continueRequest", { requestId: id }).catch(() => {});
  }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Emulation.setTimezoneOverride", { timezoneId: ZONE });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
const viewport = (w, h, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
await viewport(1280, 900);
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + "\n" + expression.slice(0, 200));
  return r.result.value;
};
async function waitFor(expr, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(60); } return false; }
const typeText = async (t) => { await send("Input.insertText", { text: t }); await sleep(40); };
const focusId = (id) => ev(`document.getElementById(${JSON.stringify(id)}).focus()`);
const bodyText = () => ev("document.body.innerText.replace(/\\s+/g, ' ')");
const click = (sel) => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true; })()`);
const clickText = (sel, text) => ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(text)} || x.textContent.includes(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`);
const fill = (sel, v, evt = "input") => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; const set = Object.getOwnPropertyDescriptor(n.constructor.prototype, 'value').set; set.call(n, ${JSON.stringify(v)}); n.dispatchEvent(new Event(${JSON.stringify(evt)}, { bubbles: true })); return true; })()`);
async function shot(name) { mkdirSync(SHOTS, { recursive: true }); const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 60 }); writeFileSync(join(SHOTS, name), Buffer.from(data, "base64")); }
async function load() {
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: ORIGIN + "/" });
  await waitFor("document.readyState === 'complete' && !!document.getElementById('main-content')");
}
const onLogin = () => ev("!!document.getElementById('login-username')");
async function loginUi(user = USER, pass = PASSWORD) {
  await focusId("login-username"); await ev("document.getElementById('login-username').select()"); await typeText(user);
  await focusId("login-password"); await ev("document.getElementById('login-password').select()"); await typeText(pass);
  await ev("document.querySelector('form').requestSubmit()");
}
async function signIn() {
  await load();
  await waitFor("!!document.getElementById('login-username') || !!document.querySelector('.app-nav')");
  if (await onLogin()) await loginUi();
  return waitFor("!!document.querySelector('.app-nav')");
}
const analyticsCalls = (since = 0) => netLog.slice(since).filter((n) => n.path === "/api/analytics/summary" && n.method === "POST");
const bodyJson = (n) => { try { return JSON.parse(n.body ?? "{}"); } catch { return {}; } };
const mark = () => netLog.length;
// KPI cards as {currency: {count, minor}} parsed from the visible text, compared with SQL for the window the UI actually requested.
const readCards = () => ev(`[...document.querySelectorAll('#dash-cards .currency-card')].map((c) => ({ cur: c.querySelector('.top span').textContent.trim(), badge: c.querySelector('.top .badge').textContent.trim(), amount: c.querySelector('.amount').textContent.trim(), meta: c.querySelector('.meta').textContent.trim() }))`);
const minorOf = (amount, cur) => { const digits = amount.replace(/[^0-9.]/g, ""); const [i, f = ""] = digits.split("."); return String(BigInt(i + f.padEnd(EXP[cur], "0").slice(0, EXP[cur]))); };
async function cardsMatchSql(label, since) {
  const call = analyticsCalls(since).at(-1);
  const body = bodyJson(call);
  const exp = expected(body);
  await waitFor("!!document.querySelector('#dash-cards') || !!document.querySelector('#dash-empty-range')", 8000);
  await sleep(250);
  const cards = await readCards();
  const empty = await ev("!!document.querySelector('#dash-empty-range')");
  const same = exp.currencies.length === 0 ? empty && cards.length === 0 : cards.length === exp.currencies.length && exp.currencies.every((c) => { const card = cards.find((x) => x.cur === c.currency); return card && card.badge === `${c.invoiceCount} invoice${c.invoiceCount === 1 ? "" : "s"}` && minorOf(card.amount, c.currency) === c.totalMinor && card.meta.includes(`drafts created: ${c.stateCounts.created}`); });
  check("browser analytics parity", `dashboard KPI cards equal independent SQL for the window/filters the page requested: ${label}`, same, JSON.stringify({ body, cards, sql: exp.currencies }));
  return { body, exp, cards };
}
const bodyHasNoCustomer = () => bodyText().then((t) => !/A4 Client|Northwind|@a4\.example/.test(t));

/* ---- A. sign-in (wrong password then right), protected deep link */
await load();
check("browser auth", "the sign-in screen is shown first, with no invoice or analytics request", (await waitFor("!!document.getElementById('login-username')")) && netLog.filter((n) => /invoice-drafts|analytics/.test(n.path)).length === 0);
await loginUi(USER, "definitely-wrong-password-1");
await waitFor("[...document.querySelectorAll('[role=alert]')].some((e) => e.textContent.trim().length > 0)");
const wrongText = await ev("[...document.querySelectorAll('[role=alert]')].map((e) => e.textContent).join(' | ')");
check("browser auth", "a wrong password shows an error, keeps the operator signed out, and does not reveal whether the username exists", /could not sign you in|incorrect|invalid/i.test(wrongText) && (await onLogin()) && !/username.*not found|no such user/i.test(wrongText), wrongText);
await ev("document.getElementById('login-password').select()");
await focusId("login-password"); await ev("document.getElementById('login-password').select()"); await typeText(PASSWORD);
await ev("document.querySelector('form').requestSubmit()");
check("browser auth", "the correct synthetic credentials sign in and the real dashboard (with all synthetic invoices) loads", await waitFor("!!document.querySelector('#dash-cards')", 10000));
await shot("01-dashboard-desktop.jpg");

/* ---- B. dashboard analytics: KPI cards vs independent SQL under every filter */
let m = mark();
await cardsMatchSql("default window (last 30 days, Asia/Manila)", 0);
const cov = await ev("document.getElementById('dash-coverage')?.innerText ?? ''");
check("browser analytics parity", "the page states the window it covers, inclusive of both dates, with its time zone", /inclusive \(Asia\/Manila\)/.test(cov), cov);
const note = await ev("document.getElementById('dash-card-note')?.innerText ?? ''");
check("browser currency", "the page says every card is one currency and that currencies are never added together or converted; no grand total is shown", /never added together or converted/.test(note) && !/grand total|all currencies total/i.test(await bodyText()));
const cards0 = await readCards();
check("browser currency", "USD, EUR and JPY appear as three separate cards (JPY with no decimals)", cards0.map((c) => c.cur).sort().join(",") === "EUR,JPY,USD" && /^¥[\d,]+$/.test(cards0.find((c) => c.cur === "JPY").amount) && /^\$[\d,]+\.\d{2}$/.test(cards0.find((c) => c.cur === "USD").amount) && /^€[\d,]+\.\d{2}$/.test(cards0.find((c) => c.cur === "EUR").amount), JSON.stringify(cards0));
// pagination: more than one page, KPI unchanged
const win0 = bodyJson(analyticsCalls(0).at(-1));
const sqlCount0 = expected(win0).currencies.reduce((n, c) => n + c.invoiceCount, 0);
let pages = 0;
const mPage = mark();
const loaded = async () => { const t = await ev("document.querySelector('[data-testid=result-count]')?.textContent ?? ''"); const n = /(\d+) matching invoice/.exec(t); return { n: n ? Number(n[1]) : -1, more: /more available/.test(t), text: t }; };
const first = await loaded();
const seenCounts = [first.n];
while ((await loaded()).more && pages < 12) { const before = (await loaded()).n; await click("#dash-more"); await waitFor(`(() => { const t = document.querySelector('[data-testid=result-count]')?.textContent ?? ''; const n = /(\\d+) matching invoice/.exec(t); return n && Number(n[1]) > ${before}; })()`); seenCounts.push((await loaded()).n); pages++; }
const endState = await loaded();
check("browser pagination", `the grid loads the window page by page (${seenCounts.join(" -> ")} rows) and ends with 'All matching invoices are loaded' equal to the SQL count (${sqlCount0})`, first.n === 20 && endState.n === sqlCount0 && !endState.more && (await ev("!!document.querySelector('#dash-end')")) && seenCounts.every((n, i) => i === 0 || n > seenCounts[i - 1]), JSON.stringify({ seenCounts, endState, sqlCount0 }));
check("browser pagination", "loading more pages did not re-request the full-population analytics", analyticsCalls(mPage).length === 0, String(analyticsCalls(mPage).length));
await cardsMatchSql("after paging to the end (cards unchanged)", 0);
// filters
m = mark(); await clickText(".pill", "EUR"); await waitFor("true"); await sleep(400); await cardsMatchSql("currency pill EUR", m);
check("browser filters", "the EUR pill sends currency=EUR in BOTH the list and the analytics request bodies", netLog.slice(m).some((n) => n.path === "/api/invoice-drafts/search" && bodyJson(n).currency === "EUR") && analyticsCalls(m).some((n) => bodyJson(n).currency === "EUR"));
m = mark(); await clickText(".pill", "All currencies"); await sleep(400);
m = mark(); await ev("(() => { const s = document.getElementById('dash-status'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'created'); s.dispatchEvent(new Event('change', { bubbles: true })); })()"); await sleep(500); await cardsMatchSql("PayPal draft status = created", m);
m = mark(); await ev("(() => { const s = document.getElementById('dash-status'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'none'); s.dispatchEvent(new Event('change', { bubbles: true })); })()"); await sleep(500); await cardsMatchSql("PayPal draft status = none", m);
m = mark(); await ev("(() => { const s = document.getElementById('dash-status'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'attention'); s.dispatchEvent(new Event('change', { bubbles: true })); })()"); await sleep(500); await cardsMatchSql("PayPal draft status = needs attention", m);
await clickText("button", "Clear filters"); await sleep(400);
m = mark(); await fill("#dash-search", "Northwind"); await sleep(900); const searchState = await cardsMatchSql("customer search 'Northwind'", m);
check("browser filters", "the search term travels only in POST bodies (list and analytics) and never in a URL, and the grid shows exactly the SQL-matching rows", netLog.slice(m).filter((n) => /search|analytics/.test(n.path)).every((n) => bodyJson(n).q === "Northwind") && netLog.every((n) => !n.path.includes("Northwind") && !n.path.includes("?")) && (await ev("!location.href.includes('Northwind') && location.search === '' && location.hash === ''")) && (await loaded()).n === searchState.exp.currencies.reduce((n, c) => n + c.invoiceCount, 0));
await shot("02-filtered-search.jpg");
await fill("#dash-search", ""); await sleep(700);
m = mark(); await fill("#dash-date-start", "2026-10-11", "input"); await fill("#dash-date-end", "2026-10-12", "input"); await sleep(900);
const dated = await cardsMatchSql("date range Oct 11 to Oct 12 (Manila local days)", m);
const lastBody = dated.body;
check("browser date bounds", "the page sends paired UTC instants for the local days: start = Oct 11 00:00 Manila (2026-10-10T16:00:00.000Z) inclusive, end = Oct 13 00:00 Manila (exclusive), with the IANA zone", lastBody.fromInclusive === "2026-10-10T16:00:00.000Z" && lastBody.toExclusive === "2026-10-12T16:00:00.000Z" && lastBody.timeZone === ZONE, JSON.stringify(lastBody));
await shot("03-date-range.jpg");
await clickText("button", "Clear filters"); await sleep(500);
await fill("#dash-date-start", "2026-10-12", "input"); await sleep(700);
m = mark(); await fill("#dash-date-end", "2026-10-11", "input"); await sleep(700);
const rangeErr = await ev("document.getElementById('dash-range-error')?.textContent ?? ''");
check("browser date bounds", "a reversed range shows an inline error and sends no analytics request", rangeErr.length > 0 && analyticsCalls(m).length === 0, JSON.stringify({ rangeErr, calls: analyticsCalls(m).map(bodyJson), start: await ev("document.querySelector('#dash-date-start').value"), end: await ev("document.querySelector('#dash-date-end').value"), alerts: await ev("[...document.querySelectorAll('[role=alert]')].map((e) => e.textContent).join(' | ')") }));
await clickText("button", "Clear filters"); await sleep(600);
await ev("window.scrollTo(0,0)");

/* ---- C. loading / error / timeout / cancellation / late-401 states */
await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/analytics/summary" }] });
rule = (p) => (p.request.url.includes("/api/analytics/summary") ? "fail" : "continue");
m = mark(); await clickText(".pill", "USD");
await waitFor("!!document.getElementById('dash-analytics-error')");
const errTxt = await ev("document.getElementById('dash-analytics-error')?.innerText.replace(/\\s+/g,' ') ?? ''");
check("browser error states", "when analytics fails the page shows an alert 'Could not load full-population totals', says no loaded-row estimate is substituted, and shows NO KPI cards", /Could not load full-population totals/.test(errTxt) && /No loaded-row estimate is substituted/.test(errTxt) && !(await ev("!!document.querySelector('#dash-cards')")), errTxt);
rule = null;
m = mark(); await click("#dash-analytics-retry"); await waitFor("!!document.querySelector('#dash-cards')");
await cardsMatchSql("after 'Retry totals' (currency USD)", m);
// timeout: hold the analytics request longer than the client's timeout
rule = (p) => (p.request.url.includes("/api/analytics/summary") ? "hold" : "continue");
const tStart = Date.now();
m = mark(); await clickText(".pill", "EUR");
check("browser loading state", "while analytics is in flight the cards area shows a busy skeleton labelled 'Loading full-population totals' (no stale or estimated numbers)", await waitFor("!!document.querySelector('[aria-label=\"Loading full-population totals\"]')", 3000) && !(await ev("!!document.querySelector('#dash-cards')")));
const timedOut = await waitFor("!!document.getElementById('dash-analytics-error')", 22000);
const tookS = Math.round((Date.now() - tStart) / 1000);
const timeoutTxt = await ev("document.getElementById('dash-analytics-error')?.innerText.replace(/\\s+/g,' ') ?? ''");
check("browser error states", `a request that never answers ends with an honest error after the client timeout (${tookS}s), not an endless spinner or a guess`, timedOut && tookS >= 10 && tookS <= 22 && /took too long|timed out/i.test(timeoutTxt), `${tookS}s ${timeoutTxt}`);
for (const id of held.splice(0)) await send("Fetch.failRequest", { requestId: id, errorReason: "Aborted" }).catch(() => {});
// cancellation: hold the first request, change the filter again, then release the old request with an
// obviously wrong answer: it must never be rendered.
let heldOnce = false;
rule = (p) => (p.request.url.includes("/api/analytics/summary") ? (!heldOnce ? ((heldOnce = true), "hold") : "continue") : "continue");
m = mark();
await clickText(".pill", "JPY");
await sleep(400);
await clickText(".pill", "EUR");
await waitFor("!!document.querySelector('#dash-cards')");
rule = null;
for (const id of held.splice(0)) await send("Fetch.fulfillRequest", { requestId: id, responseCode: 200, responseHeaders: [{ name: "content-type", value: "application/json" }], body: Buffer.from(JSON.stringify({ version: 1, fromInclusive: "2026-09-01T00:00:00.000Z", toExclusive: "2026-12-01T00:00:00.000Z", timeZone: ZONE, currencies: [{ currency: "JPY", exponent: 0, invoiceCount: 1, totalMinor: "1", stateCounts: { none: 1, progress: 0, created: 0, attention: 0 } }], days: [] })).toString("base64") }).catch(() => {});
await sleep(800);
await send("Fetch.disable");
const finalCards = await readCards();
const firstReq = analyticsCalls(m)[0];
check("browser cancellation", "a superseded analytics request (JPY) is cancelled/ignored: after its late wrong answer is injected the page still shows the LATEST filter's (EUR) totals, never the stale ¥1", finalCards.length === 1 && finalCards[0].cur === "EUR" && !finalCards.some((c) => c.amount === "¥1") && analyticsCalls(m).length >= 2, JSON.stringify({ finalCards, first: firstReq?.failed ?? firstReq?.status ?? "pending" }));
await cardsMatchSql("latest filter after cancellation (EUR)", m);
await clickText("button", "Clear filters"); await sleep(500);

/* ---- D. invoice journey: simulated parse -> clarification -> review -> human Save -> saved page -> fake PayPal DRAFT */
const ppCount = (k) => readFileSync(ppLog, "utf8").split("\n").filter((x) => x === k).length;
const modelCalls = () => readFileSync(modelLog, "utf8").split("\n").filter(Boolean).length;
await clickText(".app-nav button", "New invoice");
await waitFor("!!document.getElementById('comp-text')");
await focusId("comp-text"); await ev("document.getElementById('comp-text').select()"); await typeText("Invoice A4 Journey Co for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15");
const before = Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${OP}'`));
m = mark(); await click("#parse-btn");
const reviewOpened = await waitFor("!!document.getElementById('rev-title') && !!document.getElementById('f-customerName')", 9000);
check("invoice journey", "the SIMULATED parser's proposal opens the editable Review; nothing is saved yet", reviewOpened && Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${OP}'`)) === before && /not saved yet/.test(await bodyText()));
await shot("04-review.jpg");
await click("#save-btn");
check("invoice journey", "the human Save writes exactly one verified draft to PostgreSQL (server total $540.00) and opens the saved page", (await waitFor("!!document.getElementById('saved-id') && !!document.getElementById('pp-body')", 10000)) && Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${OP}'`)) === before + 1 && /\$540\.00/.test(await ev("document.getElementById('saved-total').textContent")) && sql(`SELECT total_minor FROM invoices WHERE customer_name='A4 Journey Co'`) === "54000");
const journeyId = await ev("document.getElementById('saved-id').textContent");
check("invoice journey", "no PayPal draft exists after parse and save (no create during parse/save/list/refresh)", sql(`SELECT count(*) FROM paypal_draft_operations WHERE invoice_id='${journeyId}'`) === "0" && ppCount("create") === 0 && /Not created in PayPal Sandbox/.test(await bodyText()));
m = mark();
await ev("(() => { const b = document.getElementById('create-pp-btn'); b.focus(); b.click(); })()");
await waitFor("!!document.querySelector('dialog[open]')", 2500);
const dlg = await ev("document.querySelector('dialog[open]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
check("invoice journey", "the confirmation dialog names the invoice, customer and amount and says nothing is emailed, sent or collected", dlg.includes(journeyId) && /A4 Journey Co/.test(dlg) && /\$540\.00\s*USD/.test(dlg) && /not be emailed/i.test(dlg) && /No payment will be collected/.test(dlg), dlg);
await shot("05-confirm-dialog.jpg");
await ev("[...document.querySelectorAll('dialog[open] button')].find((b) => /^Create PayPal Sandbox draft$/.test(b.textContent.trim())).click()");
check("invoice journey", "the SIMULATED DRAFT is verified by the real service: DRAFT shown, 'customer has not been emailed', one POST, one fake create, operation 'created' with attempts=1", (await waitFor("!!document.getElementById('pp-id')", 10000)) && ppCount("create") === 1 && netLog.slice(m).filter((n) => /\/paypal-draft$/.test(n.path) && n.method === "POST").length === 1 && sql(`SELECT state || '|' || attempts FROM paypal_draft_operations WHERE invoice_id='${journeyId}'`) === "created|1" && /customer has not been emailed/i.test(await bodyText()));
await shot("06-draft-created.jpg");
const S3 = await nodeLogin();
const replay = await post(S3, `/api/invoice-drafts/${journeyId}/paypal-draft`, {});
check("invoice journey", "A3-FIX1 safeguard: repeating the confirmation is a replay (HTTP 200, same id), NOT a second create: still exactly one fake provider create and one operation row", replay.status === 200 && replay.body?.replayed === true && ppCount("create") === 1 && sql(`SELECT count(*) FROM paypal_draft_operations WHERE invoice_id='${journeyId}'`) === "1", JSON.stringify(replay.body));
check("invoice journey", "the page re-read the durable state (GET) and shows the same PayPal id as PostgreSQL", (await ev("document.getElementById('pp-id')?.textContent")) === sql(`SELECT paypal_invoice_id FROM paypal_draft_operations WHERE invoice_id='${journeyId}'`));
await click("#saved-back");
await waitFor("!!document.querySelector('#dash-cards')");
await sleep(500);
m = mark(); await load(); await waitFor("!!document.querySelector('#dash-cards')"); await cardsMatchSql("after the journey (new invoice included)", 0);
check("invoice journey", "only the explicit confirmation made a fake provider call (one create for the whole run); simulated parse calls were counted locally and no browser request left the origin", ppCount("create") === 1 && modelCalls() >= 1 && foreign.length === 0, `pp=${ppCount("create")} model=${modelCalls()} foreign=${foreign.join(",")}`);

/* ---- E. late 401: the server revokes the session while the page is open */
sql(`UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL AND operator_id='${OP}'`);
m = mark(); await clickText(".pill", "USD");
const bounced = await waitFor("!!document.getElementById('login-username')", 8000);
check("browser auth", "late 401: after the session is revoked server-side, the next dashboard request returns the page to the sign-in screen", bounced && netLog.slice(m).some((n) => n.status === 401));
check("browser privacy", "after the late 401 no customer name, e-mail or total remains on the page", await bodyHasNoCustomer() && !/\$\d/.test(await bodyText()));

/* ---- F. fresh sign-in, logout, then reuse of the old cookie */
check("browser auth", "signing in again works", await signIn());
await waitFor("!!document.querySelector('#dash-cards')");
const ck = (await send("Network.getCookies", { urls: [ORIGIN] })).cookies.find((c) => c.name === "nmi_session");
check("browser auth", "the browser holds the session cookie as HttpOnly (invisible to page scripts) and document.cookie shows nothing", Boolean(ck?.httpOnly) && (await ev("document.cookie")) === "", JSON.stringify({ httpOnly: ck?.httpOnly, sameSite: ck?.sameSite }));
await clickText("button", "Sign out");
check("browser auth", "Sign out returns to the sign-in screen and removes every invoice from the page", (await waitFor("!!document.getElementById('login-username')")) && (await bodyHasNoCustomer()));
const stale = await fetch(API + "/api/auth/session", { headers: { cookie: `nmi_session=${ck.value}` } });
check("browser auth", "the cookie the browser used before logout is rejected by the server afterwards (revocation, 401)", stale.status === 401);

/* ---- G. 390px viewport, keyboard, focus */
await viewport(390, 844, true);
await signIn();
await waitFor("!!document.querySelector('#dash-cards')");
await sleep(400);
const geo = () => ev("(() => { const de = document.documentElement; return { vw: innerWidth, docW: de.scrollWidth, overflowX: de.scrollWidth - de.clientWidth }; })()");
const g1 = await geo();
check("390px", "the dashboard at 390px has no page-level horizontal overflow and keeps the KPI cards and date range reachable", g1.vw === 390 && g1.overflowX <= 1 && (await ev("!!document.querySelector('#dash-cards') && !!document.querySelector('#dash-date-start')")), JSON.stringify(g1));
await shot("07-dashboard-390.jpg");
check("390px", "the date inputs can be scrolled into view and tapped (hit-tested)", await ev(`(() => { const i = document.querySelector('#dash-date-end'); i.scrollIntoView({ block: 'center' }); const b = i.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.top >= 0 && b.bottom <= innerHeight && (hit === i || i.contains(hit)); })()`));
await clickText(".mobile-nav button", "New invoice"); await waitFor("!!document.getElementById('comp-text')");
const g2 = await geo();
check("390px", "the composer at 390px has no page-level horizontal overflow", g2.overflowX <= 1, JSON.stringify(g2));
await clickText(".mobile-nav button", "Drafts"); await waitFor("!!document.querySelector('#dash-cards')");
await ev("document.querySelector('.nudgey-launcher').click()"); await waitFor("!!document.querySelector('.nudgey-panel')");
const g3 = await ev("(() => { const p = document.querySelector('.nudgey-panel').getBoundingClientRect(); const nav = document.querySelector('.mobile-nav')?.getBoundingClientRect(); return { left: p.left, right: p.right, top: p.top, bottom: p.bottom, vw: innerWidth, navTop: nav ? nav.top : null, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()");
check("390px", "the Nudgey panel at 390px stays inside the viewport and above the mobile navigation", g3.left >= 0 && g3.right <= g3.vw && g3.top >= 0 && (g3.navTop === null || g3.bottom <= g3.navTop + 1) && g3.overflowX <= 1, JSON.stringify(g3));
await shot("08-nudgey-390.jpg");
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(200);
await viewport(1280, 900);
await sleep(300);
// keyboard traversal with visible focus indicator (start at the first date input; the last Tab stops are browser chrome)
await ev("window.scrollTo(0, 0); document.querySelector('#dash-date-start').focus(); true");
const seen = [{ id: "dash-date-start", ring: await ev("(() => { const cs = getComputedStyle(document.activeElement); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'); })()") }];
for (let i = 0; i < 20; i++) {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await sleep(60);
  seen.push(await ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return null; const cs = getComputedStyle(a); const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'); return { id: a.id || String(a.className).split(' ')[0] || a.tagName, ring }; })()`));
}
const visited = seen.filter(Boolean).map((x) => x.id);
check("keyboard", "Tab reaches the date range, search and status filters in order and every focused control shows a visible focus indicator", ["dash-date-start", "dash-date-end", "dash-search", "dash-status"].every((id) => visited.includes(id)) && visited.indexOf("dash-date-end") < visited.indexOf("dash-search") && visited.indexOf("dash-search") < visited.indexOf("dash-status") && seen.filter(Boolean).every((x) => x.ring), JSON.stringify(seen));

/* ---- H. cross-cutting privacy / boundaries */
const apiPaths = [...new Set(netLog.filter((n) => n.path.startsWith("/api/")).map((n) => n.method + " " + n.path.replace(/[0-9a-f-]{36}/g, ":id")))];
check("boundaries", "the browser used only auth, invoice save/list/detail/search, PayPal-draft confirm, analytics and follow-up reads", apiPaths.every((p) => /^(GET|POST) \/api\/(auth\/(session|login|logout)|invoice-drafts(\/search|\/parse|\/:id(\/paypal-draft|\/follow-ups)?)?|analytics\/summary|follow-ups)$/.test(p)), apiPaths.join(", "));
check("boundaries", "no send, remind, cancel, refund, payment, webhook, SMTP or OpenAI route was requested", !netLog.some((n) => /send|remind|cancel|refund|payment|webhook|capture|smtp|mail|openai/i.test(n.path)));
check("boundaries", "no browser request left the local origin", foreign.length === 0, foreign.join(","));
const stor = await ev(`(async () => ({ local: localStorage.length, session: sessionStorage.length, idb: (indexedDB.databases ? (await indexedDB.databases()).length : 0), caches: (self.caches ? (await caches.keys()).length : 0), href: location.href }))()`);
check("boundaries", "no browser persistent storage (localStorage, sessionStorage, IndexedDB, Cache) and no customer data or query in the page URL", stor.local === 0 && stor.session === 0 && stor.idb === 0 && stor.caches === 0 && !/A4|Northwind|@|\?/.test(stor.href), JSON.stringify(stor));
const logText = readFileSync(apiLog, "utf8");
check("boundaries", "the API log holds no customer name/e-mail, password, session cookie value or CSRF token", !/A4 Client|A4 Journey|Northwind|@a4\.example|@northwind|csrf-token":\s*"[A-Za-z0-9_-]{20}/.test(logText) && !logText.includes(PASSWORD) && !logText.includes(ck.value));
check("boundaries", "zero external provider activity: exactly one fake PayPal create in the whole run, and the sandboxed API process had no way to reach another host", ppCount("create") === 1);
const jsErr = consoleMsgs.filter((x) => !/Failed to load resource|net::ERR|status of (4|5)\d\d|ERR_INTERNET_DISCONNECTED/.test(x));
check("boundaries", "no uncaught exception or unexpected console error in the browser (expected 4xx/blocked-request log lines excluded)", jsErr.length === 0, jsErr.slice(0, 4).join(" | "));
const dbLeak = sql("SELECT count(*) FROM audit_log WHERE detail::text ~* '(A4 Client|Northwind|A4 Journey|@a4\\.example)'");
check("boundaries", "the audit log carries no customer name or e-mail", dbLeak === "0");

/* ---- I. rate limit last (it locks the operator out of this API process; restart clears the in-memory throttle) */
let tries = 0, firstLimited = 0, retryAfter = null;
for (let i = 0; i < 40 && !firstLimited; i++) { const r = await fetch(API + "/api/auth/login", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ username: USER, password: "wrong-" + i }) }); tries++; if (r.status === 429) { firstLimited = tries; retryAfter = r.headers.get("retry-after"); } }
check("auth", `repeated wrong passwords are rate limited (HTTP 429 with Retry-After) after ${firstLimited || "no"} attempts`, firstLimited > 0 && firstLimited <= 30 && retryAfter !== null, `tries=${tries} retry-after=${retryAfter}`);
const lockedGood = await nodeLogin();
check("auth", "while limited, even the correct password is refused (429); restarting the API process clears the in-memory throttle (documented operational limit)", lockedGood.status === 429);
await stopApi(); await startApi();
check("auth", "after an API restart the operator can sign in again", (await nodeLogin()).status === 200);

/* ---------------------------------------------------------------- finish */
const failed = results.filter((r) => r.result === "FAIL").length;
info.finishedAt = new Date().toISOString();
info.passed = results.length - failed;
info.total = results.length;
info.failed = failed;
info.stack = "real Fastify (SIMULATED launcher: fake parser, fake PayPal) in a sandbox-exec no-egress profile + vite preview production build + headless Chrome (CDP, Asia/Manila emulated) + private PostgreSQL 16";
writeFileSync(join(here, "qa-results.json"), JSON.stringify({ task: "NMI-PROTOTYPE-10D-A4", environment: info, simulated: true, results }, null, 2) + "\n");
console.log(`\n${results.length - failed}/${results.length} passed`);
try { if (ws.readyState === WebSocket.OPEN) ws.close(); } catch {}
await cleanup();
info.cleanup = !existsSync(work);
process.exit(failed ? 1 : 0);
