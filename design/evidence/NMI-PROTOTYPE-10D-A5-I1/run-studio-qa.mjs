/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-PROTOTYPE-10D-A5-I1 local AG Studio integration QA (SIMULATED providers; synthetic data only).
//
// Run from the repo root after `pnpm install --frozen-lockfile`, with the untracked `.env.local` holding the owner's
// AG_STUDIO_LICENSE_KEY (the value is read in memory only to prove it never leaks; it is never printed or written):
//   node design/evidence/NMI-PROTOTYPE-10D-A5-I1/run-studio-qa.mjs
//
// It builds, all disposable and local:
//   * a private PostgreSQL 16 cluster + a NEW nmi_test_* database with the journal migrations, one synthetic operator;
//   * the REAL Fastify API through the test-only SIMULATED launcher (fake parser, fake PayPal) inside a macOS
//     `sandbox-exec` profile that denies all non-loopback network;
//   * the REAL web app on the Vite DEV server with VITE_NMI_STUDIO_LOCAL=1 (the only place AG Studio can run);
//   * headless Chrome (CDP) with Asia/Manila emulated.
// The authenticated dashboard's AG Studio panel is compared with INDEPENDENT SQL (including PostgreSQL's own
// date_trunc('week') grouping) for every plotted bar, using the real chart's keyboard navigation and tooltips.
// LICENSED observations are recorded as text only. Screenshots are taken ONLY in an UNLICENSED (key withheld)
// session, so no licensed render is committed. Nothing here is real-provider evidence; no owner DB is touched.
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const WEB_PORT = 5188;
const ORIGIN = `http://localhost:${WEB_PORT}`;
const API_PORT = 3188;
const API = `http://127.0.0.1:${API_PORT}`;
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PG_BIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PG_PORT = 54388;
const DEBUG_PORT = 9388;
const DB = "nmi_test_a5i1_20261104";
const ZONE = "Asia/Manila";
const SHOTS = join(here, "screenshots");
const SANDBOX = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))';
const USER = "a5i1-operator";
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

/* ---------------------------------------------------------------- the licence key: read ONLY the one line, in memory */
function readKey() {
  for (const f of [join(root, "apps/web/.env.local"), join(root, ".env.local")]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?AG_STUDIO_LICENSE_KEY\s*=\s*(.*?)\s*$/.exec(line);
      if (m) return (m[1] ?? "").replace(/^(["'])(.*)\1$/, "$2") || null;
    }
  }
  return null;
}
const KEY = readKey();
info.licenceKeyPresent = KEY !== null;
const leaks = (text) => KEY !== null && String(text).includes(KEY);

/* ---------------------------------------------------------------- process + data-directory safety (as in the A4 harness) */
const work = mkdtempSync(join(tmpdir(), "nmi-a5i1-"));
const children = [];
const extraDirs = [];
const groupAlive = (pid) => { try { process.kill(-pid, 0); return true; } catch { return false; } };
const killGroup = (c, sig) => { try { process.kill(-c.pid, sig); } catch { try { c.kill(sig); } catch {} } };
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
let pgConfirmedStopped = false;
const stopPostgresConfirmed = () => {
  if (pgConfirmedStopped) return true;
  const pidFile = join(work, "pg", "postmaster.pid");
  if (!existsSync(pidFile)) return (pgConfirmedStopped = true);
  const pgPid = Number(readFileSync(pidFile, "utf8").split("\n")[0]);
  if (!Number.isInteger(pgPid) || pgPid <= 1) return false;
  const waitDead = (ms) => { for (let t = 0; t < ms && pidAlive(pgPid); t += 100) sleepSync(100); return !pidAlive(pgPid); };
  const r = spawnSync(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-m", "immediate", "-w", "stop"], { stdio: "ignore", timeout: 30000 });
  if (r.status !== 0 && pidAlive(pgPid)) { try { process.kill(pgPid, "SIGKILL"); } catch {} }
  return (pgConfirmedStopped = waitDead(10000));
};
let pgPreservedDir = null;
const removeDirs = () => {
  const dirs = [...extraDirs];
  if (stopPostgresConfirmed()) dirs.push(work);
  else {
    if (!pgPreservedDir) console.error(`\nWARNING: PostgreSQL shutdown could NOT be confirmed. Preserving ${work} for diagnosis (stop it by hand: pg_ctl -D ${join(work, "pg")} -m immediate stop).`);
    pgPreservedDir = work;
  }
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
};
let cleanupRun = null;
const cleanup = () => (cleanupRun ??= (async () => {
  for (const c of children) killGroup(c, "SIGTERM");
  for (let i = 0; i < 50 && children.some((c) => groupAlive(c.pid)); i++) await sleep(100);
  for (const c of children) if (groupAlive(c.pid)) killGroup(c, "SIGKILL");
  removeDirs();
})());
let exiting = false;
const abort = (why, code) => {
  if (exiting) return;
  exiting = true;
  console.error(`\nA5-I1 QA aborted: ${String(why).replace(KEY ?? "\u0000", "[redacted]")}`);
  const hard = setTimeout(() => process.exit(code), 30000);
  hard.unref();
  cleanup().catch((e) => console.error("cleanup failed:", e)).finally(() => process.exit(code));
};
process.on("uncaughtException", (e) => abort(e?.stack ?? String(e), 1));
process.on("unhandledRejection", (e) => abort(e?.stack ?? String(e), 1));
process.on("SIGINT", () => abort("SIGINT", 130));
process.on("SIGTERM", () => abort("SIGTERM", 143));
process.on("exit", () => {
  for (const c of children) killGroup(c, "SIGKILL");
  try { removeDirs(); } catch {}
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
info.studioPackages = JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8")).dependencies;
info.startedAt = startedAt.toISOString();
check("environment", "AG Studio 3.0.0 packages are installed with exact pins and the lockfile resolves matching AG Grid 36.2.0 and AG Charts 14.2.0", info.studioPackages["ag-studio"] === "3.0.0" && info.studioPackages["ag-studio-react"] === "3.0.0" && /ag-grid-enterprise: 36\.2\.0/.test(readFileSync(join(root, "pnpm-lock.yaml"), "utf8")) && /ag-charts-enterprise: 14\.2\.0/.test(readFileSync(join(root, "pnpm-lock.yaml"), "utf8")));
check("environment", "the licence variable was found in the untracked .env.local (value never read into any output)", KEY !== null && spawnSync("git", ["-C", root, "check-ignore", "-q", ".env.local"]).status === 0);

/* ---------------------------------------------------------------- disposable PostgreSQL 16 */
run(join(PG_BIN, "initdb"), ["-D", join(work, "pg"), "-U", "nmi_a5", "--auth=trust", "-E", "UTF8"]);
run(join(PG_BIN, "pg_ctl"), ["-D", join(work, "pg"), "-o", `-p ${PG_PORT} -c unix_socket_directories='' -c listen_addresses=127.0.0.1`, "-l", join(work, "pg.log"), "-w", "start"]);
const psqlArgs = (db) => ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "nmi_a5", "-d", db, "-X", "-v", "ON_ERROR_STOP=1"];
run(join(PG_BIN, "psql"), [...psqlArgs("postgres"), "-c", `CREATE DATABASE ${DB}`]);
const sql = (q) => run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-tAc", q]).trim();
const sqlRows = (q) => sql(q).split("\n").filter(Boolean).map((l) => l.split("|"));
const journal = JSON.parse(readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"));
for (const e of journal.entries) run(join(PG_BIN, "psql"), [...psqlArgs(DB), "-q", "-f", join(root, "packages/db/migrations", `${e.tag}.sql`)]);
const DATABASE_URL = `postgres://nmi_a5@127.0.0.1:${PG_PORT}/${DB}`;
info.database = `${DB} on 127.0.0.1:${PG_PORT} (private cluster in a temp directory)`;
check("database", `a NEW disposable PostgreSQL 16 database (${DB}) was created in a private temp cluster and all ${journal.entries.length} journal migrations were applied once`, Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")) >= 9 && /^nmi_test/.test(DB));
run("pnpm", ["--filter", "@nmi/api", "provision-operator"], { cwd: root, env: { ...process.env, DATABASE_URL, NMI_OPERATOR_USERNAME: USER, NMI_OPERATOR_PASSWORD: PASSWORD } });
const OP = sql(`SELECT id FROM operators WHERE username='${USER}'`);
check("database", "one synthetic operator was provisioned with the real CLI (random password, never printed)", /^[0-9a-f-]{36}$/.test(OP));

/* ---------------------------------------------------------------- network sandbox proof + API + dev server */
writeFileSync(join(work, "probe.mjs"), `import net from "node:net"; const s = net.connect({ host: "192.0.2.1", port: 443, timeout: 2000 }); s.on("connect", () => { console.log("CONNECTED"); process.exit(0); }); s.on("error", (e) => { console.log(e.code); process.exit(0); }); s.on("timeout", () => { console.log("TIMEOUT"); process.exit(0); });`);
const probeIn = spawnSync("sandbox-exec", ["-p", SANDBOX, process.execPath, join(work, "probe.mjs")], { encoding: "utf8" }).stdout.trim();
check("isolation", "the network sandbox the API runs in denies non-loopback egress (192.0.2.1 is refused with EPERM)", probeIn === "EPERM", probeIn);

const apiLog = join(work, "api.log");
const viteLog = join(work, "vite.log");
const apiEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", PORT: String(API_PORT), WEB_ORIGIN: ORIGIN, DATABASE_URL, SESSION_SECRET: SECRET, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com", OPENAI_API_KEY: "", OPENAI_MODEL: "", NMI_SIMULATED_EVAL: "1", NMI_FAKE_MODEL_LOG: join(work, "model.log"), NMI_FAKE_PAYPAL_LOG: join(work, "paypal.log"), PAYPAL_DRAFTS_ENABLED: "true", PAYPAL_CLIENT_ID: "cid-" + randomBytes(6).toString("hex"), PAYPAL_CLIENT_SECRET: "csec-" + randomBytes(10).toString("hex") };
writeFileSync(apiEnv.NMI_FAKE_MODEL_LOG, ""); writeFileSync(apiEnv.NMI_FAKE_PAYPAL_LOG, "");
const out = openSync(apiLog, "a");
const api = spawn("sandbox-exec", ["-p", SANDBOX, "pnpm", "--filter", "@nmi/api", "exec", "tsx", join(root, "design/evidence/NMI-DEMO-R0/simulated-eval-server.ts")], { cwd: root, stdio: ["ignore", out, out], env: apiEnv, detached: true });
children.push(api);
for (let i = 0; i < 300; i++) { try { if ((await fetch(API + "/health")).ok) break; } catch {} await sleep(150); }

let vite = null;
async function startVite(flagOn) {
  // The web child gets NO licence variable: the dev bridge reads the one line itself from .env.local.
  const env = { ...process.env, NMI_API_ORIGIN: API };
  delete env.AG_STUDIO_LICENSE_KEY;
  if (flagOn) env.VITE_NMI_STUDIO_LOCAL = "1"; else delete env.VITE_NMI_STUDIO_LOCAL;
  vite = spawn("pnpm", ["--filter", "@nmi/web", "exec", "vite", "--port", String(WEB_PORT), "--strictPort"], { cwd: root, stdio: ["ignore", openSync(viteLog, "a"), openSync(viteLog, "a")], env, detached: true });
  children.push(vite);
  for (let i = 0; i < 200; i++) { try { if ((await fetch(ORIGIN + "/")).ok) return; } catch {} await sleep(150); }
  throw new Error("vite dev server did not start");
}
async function stopVite() {
  killGroup(vite, "SIGTERM");
  for (let i = 0; i < 60; i++) { try { await fetch(ORIGIN + "/"); await sleep(100); } catch { return; } }
}
await startVite(true);
const health = await (await fetch(ORIGIN + "/health")).json();
check("simulated mode", "the SIMULATED API (fake parser + fake PayPal) is up behind the web dev server; /health says aiConfigured=false; no real provider credential exists in its environment", health.status === "ok" && health.aiConfigured === false && apiEnv.OPENAI_API_KEY === "" && /^cid-/.test(apiEnv.PAYPAL_CLIENT_ID));

/* ---------------------------------------------------------------- bridge security over real HTTP */
// fetch() cannot override Host, so the DNS-rebinding shape is sent with a raw http request.
const rawGet = (headers) => new Promise((res, rej) => { const r = http.request({ host: "localhost", port: WEB_PORT, path: "/__nmi_dev/studio-licence", method: "GET", headers }, (resp) => { let b = ""; resp.on("data", (c) => (b += c)); resp.on("end", () => res({ status: resp.statusCode, text: async () => b })); }); r.on("error", rej); r.end(); });
{
  const url = ORIGIN + "/__nmi_dev/studio-licence";
  const ok = await fetch(url, { headers: { "x-nmi-dev-studio": "1" } });
  const okBody = await ok.json().catch(() => ({}));
  check("licence bridge", "the dev bridge answers a same-origin flagged GET with 200, no-store and a key present (value not shown)", ok.status === 200 && ok.headers.get("cache-control") === "no-store" && typeof okBody.licenseKey === "string" && okBody.licenseKey.length > 0 && okBody.licenseKey === KEY);
  const denied = [
    ["no custom header", await fetch(url)],
    ["foreign Host header", await rawGet({ "x-nmi-dev-studio": "1", host: "attacker.example:5188" })],
    ["cross-site fetch metadata", await fetch(url, { headers: { "x-nmi-dev-studio": "1", "sec-fetch-site": "cross-site" } })],
    ["POST", await fetch(url, { method: "POST", headers: { "x-nmi-dev-studio": "1" } })],
  ];
  check("licence bridge", "every disallowed request shape (no header, foreign Host, cross-site, POST) is 403 and carries no key", (await Promise.all(denied.map(async ([, r]) => r.status === 403 && !leaks(await (r.text?.() ?? ""))))).every(Boolean), denied.map(([n, r]) => `${n}:${r.status}`).join(","));
  const envFile = await fetch(`${ORIGIN}/@fs${root}/.env.local`);
  check("licence bridge", "the untracked .env.local (which also holds provider secrets) is not servable by the dev server", envFile.status === 403 || envFile.status === 404, envFile.status);
}

/* ---------------------------------------------------------------- synthetic population through the REAL save route */
async function nodeLogin() {
  const r = await fetch(API + "/api/auth/login", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ username: USER, password: PASSWORD }) });
  const body = await r.json().catch(() => ({}));
  const sc = r.headers.getSetCookie();
  return { csrf: body.csrfToken, cookie: sc.map((c) => c.split(";")[0]).join("; ") };
}
const S = await nodeLogin();
const post = async (path, body, extra = {}) => { const r = await fetch(API + path, { method: "POST", headers: { origin: ORIGIN, cookie: S.cookie, "x-csrf-token": S.csrf, "content-type": "application/json", ...extra }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
let seedSeed = 20261104;
const rnd = () => ((seedSeed = (seedSeed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const N = 170;
const kinds = Array.from({ length: N }, (_, i) => (i % 8 === 5 ? "JPY" : i % 3 === 1 ? "EUR" : "USD"));
const mk = (i) => {
  const currency = kinds[i];
  const unit = currency === "JPY" ? String(1000 + i * 17) : `${12 + (i % 40)}.${String((i * 7) % 100).padStart(2, "0")}`;
  return { customerName: i < 12 ? "Northwind Studio" : `A5 Client ${String(i).padStart(3, "0")}`, customerEmail: `client${i}@a5.example`, currency, lineItems: [{ description: `Synthetic work ${i}`, quantity: String(1 + (i % 3)), unitPrice: unit }], dueDate: "2030-01-15", taxPercent: i % 4 === 0 ? "8" : null, discount: null };
};
const ids = [];
for (let i = 0; i < N; i++) {
  const r = await post("/api/invoice-drafts", mk(i), { "idempotency-key": `a5i1-seed-${String(i).padStart(4, "0")}-key-xxxxxxxx` });
  if (r.status !== 201) throw new Error(`seed ${i} failed: ${r.status}`);
  ids.push(r.body.id);
}
// Spread created_at over the last 118 days (SQL on the disposable DB only): sparse enough that zero-invoice days exist.
const now = Date.now();
const upd = ids.map((id, i) => [id, new Date(now - Math.floor(rnd() * 118) * 86_400_000 - Math.floor(rnd() * 20) * 3_600_000 - 600_000).toISOString()]);
sql(`UPDATE invoices SET created_at = v.t::timestamptz FROM (VALUES ${upd.map(([id, t]) => `('${id}','${t}')`).join(",")}) AS v(id, t) WHERE invoices.id = v.id::uuid`);
// Negative controls: an ownerless row and another operator's row must never reach any chart or table.
sql("DROP INDEX operators_single_row_uq");
sql("INSERT INTO operators (username, password_hash) VALUES ('a5-other', 'scrypt$1024$8$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')");
const OTHER = sql("SELECT id FROM operators WHERE username='a5-other'");
const neg = (owner, n) => `INSERT INTO invoices (customer_name, customer_email, currency, subtotal_minor, total_minor, due_date, created_by, created_at) VALUES ('${n}', 'x@neg.example', 'USD', 99999900, 99999900, '2030-01-15', ${owner}, now() - interval '2 days')`;
sql(neg("NULL", "A5 Ownerless Negative"));
sql(neg(`'${OTHER}'`, "A5 Other Operator Negative"));
// SIMULATED PayPal-state rows (inserted directly; no provider exists in this run) so every status group has a population.
const opRow = (id, state, cols = "", vals = "") => sql(`INSERT INTO paypal_draft_operations (invoice_id, state, invoice_number, payload_digest, attempts, invoice_date${cols}) VALUES ('${id}', '${state}', 'NMI-${id.replaceAll("-", "").slice(0, 20)}', '${"a".repeat(64)}', 1, '2026-11-04'${vals})`);
ids.slice(0, 10).forEach((id, k) => opRow(id, "created", ", paypal_invoice_id, completed_at", `, 'INV2-SIMULATED-${k}', now()`));
ids.slice(10, 14).forEach((id) => opRow(id, "creating", ", claimed_at, create_attempted_at", ", now(), now()"));
ids.slice(14, 17).forEach((id) => opRow(id, "rejected", ", last_error_code, completed_at", ", 'oauth_http_401', now()"));
check("seed", `${N} synthetic invoices (USD/EUR/JPY) were saved through the real POST route; created_at spread over 118 days; ownerless and other-operator rows exist as negative controls; SIMULATED status rows cover every group`, Number(sql(`SELECT count(*) FROM invoices WHERE created_by='${OP}'`)) === N && Number(sql("SELECT count(*) FROM invoices")) === N + 2 && sql("SELECT string_agg(state || ':' || n, ',' ORDER BY state) FROM (SELECT state, count(*) n FROM paypal_draft_operations GROUP BY state) t") === "created:10,creating:4,rejected:3");

/* ---------------------------------------------------------------- independent SQL */
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;
const STATUS_SQL = { none: "o.id IS NULL", progress: "o.state IN ('pending','creating')", created: "o.state = 'created'", attention: "o.state IN ('unknown','rejected','mismatch')" };
function filterSql({ from, to, currency, status, q }) {
  const w = [`i.created_by = '${OP}'`, `i.created_at >= (${lit(from)}::timestamp AT TIME ZONE ${lit(ZONE)})`, `i.created_at < ((${lit(to)}::date + 1)::timestamp AT TIME ZONE ${lit(ZONE)})`];
  if (currency && currency !== "ALL") w.push(`i.currency = ${lit(currency)}`);
  if (status && status !== "ALL") w.push(STATUS_SQL[status]);
  if (q) w.push(`(i.customer_name ILIKE ${lit(`%${q}%`)} OR i.customer_email ILIKE ${lit(`%${q}%`)} OR i.id::text ILIKE ${lit(`${q}%`)})`);
  return w.join(" AND ");
}
/** Per local calendar day (zero-filled by generate_series): [day, count, minor] */
const dailySql = (f, cur) => sqlRows(`WITH d AS (SELECT to_char(x, 'YYYY-MM-DD') AS day FROM generate_series(${lit(f.from)}::date, ${lit(f.to)}::date, '1 day') x), a AS (SELECT to_char(timezone(${lit(ZONE)}, i.created_at), 'YYYY-MM-DD') AS day, count(*) AS n, sum(i.total_minor) AS s FROM invoices i LEFT JOIN paypal_draft_operations o ON o.invoice_id = i.id WHERE ${filterSql(f)} AND i.currency = ${lit(cur)} GROUP BY 1) SELECT d.day, coalesce(a.n, 0), coalesce(a.s, 0) FROM d LEFT JOIN a USING (day) ORDER BY 1`);
/** Per Monday-start local week using PostgreSQL's own date_trunc('week'): [weekStart, count, minor] */
const weeklySql = (f, cur) => sqlRows(`WITH d AS (SELECT x::date AS day FROM generate_series(${lit(f.from)}::date, ${lit(f.to)}::date, '1 day') x), a AS (SELECT (timezone(${lit(ZONE)}, i.created_at))::date AS day, count(*) AS n, sum(i.total_minor) AS s FROM invoices i LEFT JOIN paypal_draft_operations o ON o.invoice_id = i.id WHERE ${filterSql(f)} AND i.currency = ${lit(cur)} GROUP BY 1) SELECT to_char(date_trunc('week', d.day::timestamp), 'YYYY-MM-DD'), sum(coalesce(a.n, 0)), sum(coalesce(a.s, 0)) FROM d LEFT JOIN a USING (day) GROUP BY 1 ORDER BY 1`);
const totalsSql = (f) => Object.fromEntries(sqlRows(`SELECT i.currency, count(*), sum(i.total_minor) FROM invoices i LEFT JOIN paypal_draft_operations o ON o.invoice_id = i.id WHERE ${filterSql(f)} GROUP BY 1 ORDER BY 1`).map(([c, n, s]) => [c, { n: Number(n), s }]));
const statesSql = (f) => Object.fromEntries(sqlRows(`SELECT i.currency, count(*) FILTER (WHERE o.id IS NULL), count(*) FILTER (WHERE o.state IN ('pending','creating')), count(*) FILTER (WHERE o.state = 'created'), count(*) FILTER (WHERE o.state IN ('unknown','rejected','mismatch')) FROM invoices i LEFT JOIN paypal_draft_operations o ON o.invoice_id = i.id WHERE ${filterSql(f)} GROUP BY 1 ORDER BY 1`).map(([c, a, b, d, e]) => [c, [Number(a), Number(b), Number(d), Number(e)]]));

/* ---------------------------------------------------------------- browser (CDP) */
const profile = mkdtempSync(join(tmpdir(), "nmi-qa-a5i1-"));
extraDirs.push(profile);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore", detached: true });
children.push(chrome);
let version;
for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {} await sleep(150); }
if (!version) throw new Error("Chrome did not start");
const targetInfo = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
const net = [];
const consoleLog = [];
const rules = [];
const held = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === "Fetch.requestPaused") {
    const { requestId, request } = d.params;
    net.push({ url: request.url, method: request.method });
    const rule = rules.find((r) => r.test(request.url, request.method));
    if (rule?.action === "fail") send("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" }).catch(() => {});
    else if (rule?.action === "hold") held.push({ requestId, url: request.url });
    else if (rule?.action === "403") send("Fetch.fulfillRequest", { requestId, responseCode: 403, responseHeaders: [{ name: "cache-control", value: "no-store" }], body: "" }).catch(() => {});
    else send("Fetch.continueRequest", { requestId }).catch(() => {});
  } else if (d.method === "Runtime.consoleAPICalled") consoleLog.push(d.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  else if (d.method === "Runtime.exceptionThrown") consoleLog.push("EXC " + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++msgId; pending.set(i, (d) => (d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(`eval failed: ${expression.slice(0, 100)} :: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`); return r.result.value; };
const waitFor = async (expr, ms = 20000, what = expr) => { const t = Date.now(); for (;;) { let v = false; try { v = await ev(expr); } catch {} if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out waiting for: ${what.slice(0, 120)}`); await sleep(150); } };
const q = (s) => JSON.stringify(s);
const click = (sel) => ev(`document.querySelector(${q(sel)}).click()`);
const setInput = (sel, v) => ev(`(() => { const e = document.querySelector(${q(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ${q(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const press = async (key, times = 1, vk = 39) => { for (let i = 0; i < times; i++) { await send("Input.dispatchKeyEvent", { type: key === "Enter" ? "keyDown" : "rawKeyDown", key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : vk, ...(key === "Enter" ? { text: "\r" } : {}) }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : vk }); await sleep(110); } };
const VK = { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 };
const key = (k, n = 1) => press(k, n, VK[k] ?? 0);
const mark = () => net.length;
const analyticsSince = (m) => net.slice(m).filter((r) => r.method === "POST" && r.url.endsWith("/api/analytics/summary")).length;
const hosts = () => [...new Set(net.map((r) => { try { return new URL(r.url).origin; } catch { return "?"; } }))];

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
await send("Emulation.setTimezoneOverride", { timezoneId: ZONE });
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
let viewport = DESKTOP;
const setViewport = async (v) => { viewport = v; await send("Emulation.setDeviceMetricsOverride", v); await send("Emulation.setTouchEmulationEnabled", { enabled: v.mobile }); };
await setViewport(DESKTOP);
const goto = async (path = "/") => { await send("Page.navigate", { url: ORIGIN + path }); await sleep(400); };
const signIn = async () => {
  await goto("/");
  await waitFor("!!document.querySelector('#login-username')", 30000, "login form");
  await setInput("#login-username", USER);
  await setInput("#login-password", PASSWORD);
  await click("form button[type=submit]");
  await waitFor("!!document.querySelector('#dash-title')", 30000, "dashboard");
};
const settle = () => waitFor("document.querySelector('#dash-cards') !== null && !document.querySelector('[aria-busy=true]#dash-loading') && !document.querySelector('.state-skeleton')", 30000, "cards loaded");
const panelState = () => ev("document.querySelector('#studio-panel')?.dataset.studio ?? 'none'");
const waitActive = (ms = 120000) => waitFor("document.querySelector('#studio-panel')?.dataset.studio === 'active'", ms, "Studio active");
const fullShot = async (name) => {
  if (KEY !== null && !shotsAllowed) throw new Error("screenshots are only allowed in the unlicensed session");
  mkdirSync(SHOTS, { recursive: true });
  const m = await send("Page.getLayoutMetrics");
  const h = Math.ceil(m.cssContentSize.height);
  await send("Emulation.setDeviceMetricsOverride", { ...viewport, height: h });
  await sleep(500);
  const s = await send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
  writeFileSync(join(SHOTS, `${name}.jpg`), Buffer.from(s.data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", viewport);
};
let shotsAllowed = false;

// Tooltip reading through the REAL chart's keyboard navigation.
const readTip = () => ev(`[...document.querySelectorAll('.ag-charts-tooltip-row')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim())`);
const digits = (s) => String(s).replace(/\D/g, "");
// Exact integer minor units from a formatted amount ("$0.00" -> "0", "$1,234.50" -> "123450", "¥31,000" -> "31000").
const minorOf = (s) => String(BigInt(digits(s) || "0"));
async function walkChart(testid, n) {
  await waitFor(`!!document.querySelector('[data-testid=${testid}] div[role=img]')`, 30000, `${testid} chart element`);
  await sleep(700);
  await ev(`document.querySelector('[data-testid=${testid}] div[role=img]').focus()`);
  await sleep(500);
  const tips = [];
  for (let i = 0; i < n; i++) {
    tips.push(await readTip());
    if (i < n - 1) await key("ArrowRight");
  }
  return tips;
}
const parseTrendTip = (rows) => {
  const find = (re) => rows.map((r) => re.exec(r)).find(Boolean);
  const v = find(/^Invoice value \((\w+)\) \(sum\)\s+(.+)$/);
  const n = find(/^Invoices \(sum\)\s+(\d+)$/);
  const label = find(/^(?:Day|Week starting)\s+(.+)$/);
  return { label: label?.[1], minor: v ? minorOf(v[2]) : null, count: n ? Number(n[1]) : null };
};
const mdLabel = (iso) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const tableRows = (cur) => ev(`(() => { const t = document.querySelector('[data-testid=studio-daily-table]'); return [...t.querySelectorAll('tbody tr')].map((r) => [r.children[0].textContent, r.children[1].textContent, r.children[2].textContent]); })()`);
const isoOf = (label) => new Date(Date.parse(`${label} UTC`)).toISOString().slice(0, 10);

/* ====================================================================== PHASE L: licensed functional QA (text only) */
await signIn();
check("sign-in", "the real sign-in reaches the real dashboard on the Vite DEV server with the Studio flag on", (await ev("!!document.querySelector('#dash-title')")) === true);
await settle();
const f0 = await ev("({ from: document.querySelector('#dash-date-start').value, to: document.querySelector('#dash-date-end').value })");
const F = { from: f0.from, to: f0.to, currency: "ALL", status: "ALL", q: "" };
await waitActive();
check("studio render", "real AG Studio rendered inside the authenticated dashboard (panel state 'active', Studio badge shown)", (await panelState()) === "active" && (await ev("[...document.querySelectorAll('#studio-panel .studio-title .badge')].some((b) => b.textContent === 'Studio · view only')")) === true);
// Updated for NMI-UI-ANALYTICS-FIRST-01 / P5 (owner-directed order; P5 status counts are a table, read by row/cell): the panel now sits directly under the shared
// currency filters, BEFORE the currency cards; the original A5-I1 run asserted the earlier cards -> panel -> grid order.
check("studio render", "the panel sits under the shared currency filters and before the authoritative currency cards and the AG Grid Community table, and nothing else moved (filters, cards and grid markup are the existing ones)", await ev(`(() => { const p = document.querySelector('#studio-panel'); const filters = document.querySelector('[aria-label="Filter by currency"]'); const cards = document.querySelector('#dash-cards'); const note = document.querySelector('#dash-card-note'); const grid = document.querySelector('.ag-root-wrapper')?.closest('.table-card'); const pos = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); return !!(p && filters && cards && note && grid) && pos(filters, p) && pos(p, cards) && pos(cards, note) && pos(note, grid) && document.querySelectorAll('#dash-cards .currency-card').length >= 2; })()`));
check("studio render", "Studio is in VIEW mode and offers no export/edit chrome: no widget toolbar buttons, no filter panel, no AI panel, no menus", await ev(`(() => { const r = document.querySelector('#studio-panel'); return r.querySelectorAll('[class*=toolbar] button, [class*=toolbar] [role=button]').length === 0 && !r.querySelector('.ag-studio-root-panel-container:not([class*=hidden]) [class*=panel-header]') && !r.querySelector('[class*=ai-panel]'); })()`));
const WM_EXPR = "[...document.querySelectorAll('#studio-panel .ag-studio-watermark')].map((w) => ({ hiddenByStudio: w.classList.contains('ag-hidden'), visible: w.offsetParent !== null && w.getBoundingClientRect().width > 0 }))";
const wmL = await ev(WM_EXPR);
info.watermarkLicensedSession = wmL.length ? (wmL.some((w) => w.visible) ? "visible" : "hidden by Studio (ag-hidden)") : "no element";
check("studio render", "the licensed session: any Studio watermark element is either hidden by Studio itself or visible; the NMI page never hides a watermark Studio shows (observed: " + info.watermarkLicensedSession + ")", wmL.every((w) => w.hiddenByStudio || w.visible));
const licenceMsgsL = consoleLog.filter((l) => /licen[cs]e/i.test(l));
info.licenceConsoleMessagesLicensedSession = licenceMsgsL.length;
check("studio render", "the licensed session logged no AG Studio licence warning or error to the browser console (the key is accepted; entitlement itself is not observable by this QA)", licenceMsgsL.length === 0, licenceMsgsL.map((l) => l.replace(KEY ?? "\u0000", "[redacted]")).slice(0, 2).join(" | "));

// ---- exactness: cards, table, plotted bars and status vs INDEPENDENT SQL
const cardsDom = await ev(`[...document.querySelectorAll('#dash-cards .currency-card')].map((c) => [c.querySelector('.top span').textContent, c.querySelector('.amount').textContent, c.querySelector('.badge').textContent])`);
const sqlTotals = totalsSql(F);
check("exactness", "the existing full-population currency cards equal independent SQL (A2 baseline carried into A5)", cardsDom.length === Object.keys(sqlTotals).length && cardsDom.every(([c, amt, badge]) => minorOf(amt) === minorOf(sqlTotals[c]?.s) && Number(badge.split(" ")[0]) === sqlTotals[c]?.n), JSON.stringify({ cardsDom, sqlTotals }));
const curs = cardsDom.map((c) => c[0]);
const tabs = () => ev(`[...document.querySelectorAll('#studio-panel [role=tab]')].map((t) => [t.textContent, t.getAttribute('aria-selected'), t.tabIndex])`);
const t0 = await tabs();
check("exactness", "the chart-currency selector is a view-only roving tablist (busiest currency first, one tab per currency, no filter change)", t0.length === curs.length && t0.filter((t) => t[1] === "true").length === 1 && t0.filter((t) => t[2] === 0).length === 1, JSON.stringify(t0));

async function verifyCurrency(cur, f, label) {
  const days = dailySql(f, cur);
  const weekly = days.length > 90;
  const rowsDom = await tableRows(cur);
  const tableOk = rowsDom.length === days.length && rowsDom.every((r, i) => isoOf(r[0]) === days[i][0] && Number(r[1]) === Number(days[i][1]) && minorOf(r[2]) === minorOf(days[i][2]));
  check("exactness", `${label}: the accessible table has exactly ${days.length} rows = every calendar day, zero-invoice days included, each equal to independent SQL (count and exact minor units)`, tableOk, `rows=${rowsDom.length} sql=${days.length}`);
  check("exactness", `${label}: zero-invoice days appear as real rows with the exact zero`, days.filter((d) => Number(d[1]) === 0).length === rowsDom.filter((r) => Number(r[1]) === 0).length && rowsDom.filter((r) => Number(r[1]) === 0).every((r) => /^[$€¥]0(\.00)?$/.test(r[2].trim())), `zero rows ${rowsDom.filter((r) => Number(r[1]) === 0).length}`);
  const buckets = weekly ? weeklySql(f, cur) : days;
  const mode = await ev("document.querySelector('#studio-panel .mode-note') ? 'weekly' : 'daily'");
  check("exactness", `${label}: ${weekly ? `a ${days.length}-day range is plotted WEEKLY (Monday start) with the Weekly view note` : `a ${days.length}-day range is plotted DAILY`}`, mode === (weekly ? "weekly" : "daily"), mode);
  const tips = await walkChart("studio-trend", buckets.length);
  const parsed = tips.map(parseTrendTip);
  // Studio draws no tooltip target for a zero-height bar (a zero-invoice day), so tips are matched to the expected
  // buckets BY LABEL: every non-zero bucket must be present with the exact value and count, nothing unexpected may be
  // present, and zero-invoice days (verified exactly in the table above) must not appear with a non-zero value.
  const bad = [];
  const byLabel = new Map();
  for (const p of parsed) if (p.label) byLabel.set(p.label, p);
  let zeroBuckets = 0;
  for (const bk of buckets) {
    const want = { label: mdLabel(bk[0]), minor: minorOf(bk[2]), count: Number(bk[1]) };
    const got = byLabel.get(want.label);
    if (want.count === 0 && want.minor === "0") {
      zeroBuckets++;
      if (got && (got.minor !== "0" || got.count !== 0)) bad.push(`zero day ${want.label} plotted as ${JSON.stringify(got)}`);
    } else if (!got || got.minor !== want.minor || got.count !== want.count) bad.push(`${want.label}: ${JSON.stringify(got)} vs ${bk.join(",")}`);
  }
  for (const l of byLabel.keys()) if (!buckets.some((bk) => mdLabel(bk[0]) === l)) bad.push(`unexpected bar ${l}`);
  info.zeroBucketsSeen = (info.zeroBucketsSeen ?? 0) + zeroBuckets;
  check("exactness", `${label}: every NON-ZERO bar PLOTTED BY STUDIO (read through the chart's own keyboard navigation and tooltip) equals independent SQL ${weekly ? "date_trunc('week') buckets" : "local-day buckets"}: label, exact value and invoice count; ${zeroBuckets} zero-invoice bucket(s) have no plotted height and never a non-zero value`, bad.length === 0, bad.slice(0, 3).join(" ; "));
  const sumPlotted = parsed.reduce((a, p) => a + BigInt(p.minor ?? "0"), 0n);
  check("exactness", `${label}: the plotted bars add up to the card total (${cur} only, never mixed with another currency)`, String(sumPlotted) === minorOf(totalsSql(f)[cur]?.s ?? "0"));
}
const first = t0.find((t) => t[1] === "true")[0];
await verifyCurrency(first, F, `${first} (default 30-day range)`);
for (const c of curs.filter((c) => c !== first)) {
  await ev(`[...document.querySelectorAll('#studio-panel [role=tab]')].find((t) => t.textContent === ${q(c)}).click()`);
  await waitFor(`document.querySelector('#studio-panel .cur-now')?.textContent === ${q(c)}`, 20000, `tab ${c}`);
  await sleep(1200);
  await verifyCurrency(c, F, `${c} (default 30-day range)`);
}
{
  // Keyboard model of the tablist: arrow keys move + select, roving tabindex.
  await ev(`document.querySelector('#studio-panel [role=tab][aria-selected=true]').focus()`);
  await key("ArrowRight");
  await sleep(500);
  const t = await tabs();
  check("keyboard", "the currency tablist moves and selects with the arrow keys (roving tabindex) and announces aria-selected", t.filter((x) => x[1] === "true").length === 1 && (await ev("document.activeElement.getAttribute('role')")) === "tab");
}
const st = statesSql(F);
const statusDom = await ev(`[...document.querySelectorAll('[data-testid=studio-status-list] tbody tr')].map((r) => [r.querySelector('th').textContent, ...[...r.querySelectorAll('td')].slice(0, 4).map((c) => Number(c.textContent))])`);
check("exactness", "the draft-status breakdown counts per currency equal independent SQL for none / in progress / draft created / needs attention, and 'created' is described as a Sandbox DRAFT (not sent, not paid)", statusDom.every((r) => JSON.stringify(r.slice(1)) === JSON.stringify(st[r[0]])) && /Sandbox DRAFT exists\. It is not sent, not paid and not overdue/.test(await ev("document.querySelector('#studio-panel .studio-status').textContent")), JSON.stringify({ statusDom, st }));
{
  const tipsStatus = await walkChart("studio-status", 1);
  const nums = (tipsStatus[0] ?? []).join(" ");
  check("exactness", "the Studio status chart is a real stacked chart keyed by currency (its keyboard tooltip names a currency and a SQL-matching count)", /(USD|EUR|JPY)/.test(nums) && /\d/.test(nums) && Object.values(st).flat().some((n) => new RegExp(`\\b${n}\\b`).test(nums)), nums.slice(0, 160));
}

// ---- filters drive the panel from the SAME single analytics request
const countDrive = async (name, action, fn) => {
  const m0 = mark();
  await action();
  for (let i = 0; i < 100 && analyticsSince(m0) < 1; i++) await sleep(150);
  await sleep(1500);
  await settle().catch(() => {});
  await waitActive(60000).catch(() => {});
  const calls = analyticsSince(m0);
  check("filters", `${name}: exactly ONE analytics request was made (the panel adds no fetch of its own)`, calls === 1, `calls=${calls}`);
  await fn();
};
const resetFilters = async () => {
  const has = await ev("[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Clear filters')");
  if (!has) return;
  await ev("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Clear filters').click()");
  await sleep(1500);
  await settle().catch(() => {});
  await waitActive(60000).catch(() => {});
};
const pill = (c) => click(`.pills button[aria-pressed]:nth-child(${["ALL", "USD", "EUR", "GBP", "CAD", "AUD", "JPY"].indexOf(c) + 1})`);
await countDrive("currency pill EUR", () => pill("EUR"), async () => {
  const f = { ...F, currency: "EUR" };
  const tabsNow = await tabs();
  check("filters", "currency pill EUR: the chart-currency selector is not rendered and the panel shows EUR only, equal to SQL", tabsNow.length === 0 && (await ev("document.querySelector('#studio-panel .cur-now')?.textContent")) === "EUR" && (await ev("document.querySelectorAll('[data-testid=studio-status-list] tbody tr').length")) === 1);
  await verifyCurrency("EUR", f, "EUR pill");
});
await resetFilters();
await countDrive("status filter = PayPal draft created", async () => { await ev("(() => { const s = document.querySelector('#dash-status'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'created'); s.dispatchEvent(new Event('change', { bubbles: true })); })()"); }, async () => {
  const f = { ...F, status: "created" };
  const cardsNow = await ev(`[...document.querySelectorAll('#dash-cards .currency-card')].map((c) => [c.querySelector('.top span').textContent, c.querySelector('.amount').textContent])`);
  const sqlNow = totalsSql(f);
  check("filters", "status filter 'PayPal draft created': cards and panel show only matching invoices (status counts equal SQL, every other group is zero)", cardsNow.every(([c, a]) => minorOf(a) === minorOf(sqlNow[c]?.s)) && JSON.stringify(await ev(`[...document.querySelectorAll('[data-testid=studio-status-list] tbody tr')].map((r) => [r.querySelector('th').textContent, ...[...r.querySelectorAll('td')].slice(0, 4).map((c) => Number(c.textContent))])`)).length > 0 && (await ev(`[...document.querySelectorAll('[data-testid=studio-status-list] tbody tr')].every((r) => { const n = [...r.querySelectorAll('td')].slice(0, 4).map((c) => Number(c.textContent)); return n[0] === 0 && n[1] === 0 && n[3] === 0 && n[2] > 0; })`)));
});
await resetFilters();
await countDrive("search 'Client 0'", async () => { await setInput("#dash-search", "Client 0"); }, async () => {
  const f = { ...F, q: "Client 0" };
  const sqlNow = totalsSql(f);
  const names = Object.keys(sqlNow);
  check("filters", "search text: cards and panel equal independent SQL (the search term itself is never sent to Studio)", names.length > 0 && (await ev(`[...document.querySelectorAll('#dash-cards .currency-card')].map((c) => [c.querySelector('.top span').textContent, c.querySelector('.amount').textContent])`)).every(([c, a]) => minorOf(a) === minorOf(sqlNow[c]?.s)));
  check("privacy", "no customer name, e-mail or search term appears in any element of the Studio panel (and the panel is present)", (await ev("!!document.querySelector('#studio-panel')")) && !/Client 0|a5\.example|Northwind/.test(await ev("(document.querySelector('#studio-panel')?.innerText ?? '') + (document.querySelector('#studio-panel')?.innerHTML ?? '')")));
});
// long range -> weekly
await resetFilters();
await setInput("#dash-search", "");
await sleep(900);
const longFrom = await ev("(() => { const e = document.querySelector('#dash-date-end').value; const d = new Date(e + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 119); return d.toISOString().slice(0, 10); })()");
const m1 = mark();
await setInput("#dash-date-start", longFrom);
await waitFor("document.querySelector('#studio-panel')?.dataset.studio === 'pending' || document.querySelector('#studio-panel') === null", 20000).catch(() => {});
await settle().catch(() => {});
await waitActive(60000);
check("filters", "date range: one analytics request for the 120-day range", analyticsSince(m1) === 1, `calls=${analyticsSince(m1)}`);
const FL = { ...F, from: longFrom };
const longCurs = await ev(`[...document.querySelectorAll('#dash-cards .currency-card .top > span:first-child')].map((s) => s.textContent)`);
for (const c of longCurs) {
  if ((await ev("document.querySelector('#studio-panel .cur-now')?.textContent")) !== c) {
    await ev(`[...document.querySelectorAll('#studio-panel [role=tab]')].find((t) => t.textContent === ${q(c)}).click()`);
    await waitFor(`document.querySelector('#studio-panel .cur-now')?.textContent === ${q(c)}`, 20000);
    await sleep(1200);
  }
  await verifyCurrency(c, FL, `${c} (120-day range)`);
}
// exactly 90 days stays daily; 91 becomes weekly
for (const [days, expectWeekly] of [[90, false], [91, true]]) {
  const from = await ev(`(() => { const e = document.querySelector('#dash-date-end').value; const d = new Date(e + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ${days - 1}); return d.toISOString().slice(0, 10); })()`);
  await setInput("#dash-date-start", from);
  await sleep(600);
  await settle().catch(() => {});
  await waitActive(60000);
  check("filters", `a ${days}-day range is plotted ${expectWeekly ? "weekly" : "daily"} (owner rule: daily up to 90 days, weekly beyond)`, (await ev("!!document.querySelector('#studio-panel .mode-note')")) === expectWeekly);
}
// stale answer must never survive a filter change
await setInput("#dash-date-start", f0.from);
await settle().catch(() => {});
await waitActive(60000);
rules.length = 0;
rules.push({ test: (u, m) => m === "POST" && u.endsWith("/api/analytics/summary"), action: "hold" });
held.length = 0;
await pill("JPY");
await sleep(1500);
const staleHeld = held.splice(0);
rules.length = 0;
await pill("EUR");
await settle().catch(() => {});
await waitActive(60000);
for (const h of staleHeld) await send("Fetch.continueRequest", { requestId: h.requestId }).catch(() => {});
await sleep(2500);
check("stale answers", "a late answer for a superseded filter (held, then released after the newer filter) never replaces the current panel: it still shows EUR and equals SQL", (await ev("document.querySelector('#studio-panel .cur-now')?.textContent")) === "EUR" && (await ev("document.querySelectorAll('[data-testid=studio-status-list] tbody tr').length")) === 1 && staleHeld.length >= 1, `held=${staleHeld.length}`);

// ---- failure states
{
  await resetFilters();
  await waitActive(60000);
  rules.push({ test: (u, m) => m === "POST" && u.endsWith("/api/analytics/summary"), action: "fail" });
  await pill("USD");
  await waitFor("!!document.querySelector('#dash-analytics-error')", 30000, "analytics error");
  check("failure", "analytics failure: the existing error + Retry appears, NO Studio panel is rendered, no loaded-row estimate is substituted", (await ev("!document.querySelector('#studio-panel') && !!document.querySelector('#dash-analytics-retry')")) === true && /No loaded-row estimate is substituted/.test(await ev("document.querySelector('#dash-analytics-error').textContent")));
  rules.length = 0;
  await click("#dash-analytics-retry");
  await settle().catch(() => {});
  await waitActive(60000);
  check("failure", "after Retry the panel returns with the new answer", (await panelState()) === "active");
}
{
  // Studio chunk cannot load (e.g. broken module): cards and grid stay correct, fallback wording, then recovery.
  // Rule BEFORE navigation (P5 fix): registering it after goto() raced the page's own chunk request.
  rules.push({ test: (u) => /StudioCharts|\/node_modules\/\.vite\/deps\/ag-studio/.test(u), action: "fail" });
  await goto("/");
  await waitFor("!!document.querySelector('#dash-cards')", 30000);
  await waitFor("document.querySelector('#studio-panel')?.dataset.studio === 'fallback'", 30000, "fallback");
  check("failure", "Studio module load failure: 'Charts unavailable' fallback with Retry, no Studio badge, and the currency cards and the AG Grid Community table are untouched", (await ev(`(() => { const p = document.querySelector('#studio-panel'); return !!p.querySelector('#studio-unavailable') && !p.querySelector('.studio-title .badge') && document.querySelectorAll('#dash-cards .currency-card').length >= 2 && !!document.querySelector('.ag-root-wrapper') && /Charts unavailable/.test(p.textContent); })()`)) === true);
  check("failure", "fallback keeps the exact accessible daily table available", (await ev("document.querySelectorAll('[data-testid=studio-daily-table] tbody tr').length")) >= 30);
  rules.length = 0;
  await ev("[...document.querySelectorAll('#studio-panel button')].find((b) => /Try loading charts again/.test(b.textContent)).click()");
  await waitActive(120000);
  check("failure", "after the module can load again, 'Try loading charts again' recovers real Studio", (await panelState()) === "active");
}
{
  // Licence unavailable: Studio runs unlicensed (evaluation watermark visible and not hidden), the data is still exact.
  await goto("/");
  rules.push({ test: (u) => u.includes("/__nmi_dev/studio-licence"), action: "403" });
  await waitFor("!!document.querySelector('#dash-cards')", 30000);
  await waitActive(120000);
  const wmU = await ev(WM_EXPR);
  info.watermarkUnlicensedSession = wmU.length ? (wmU.some((w) => w.visible) ? "visible" : "hidden by Studio (ag-hidden)") : "no element";
  check("failure", "licence request blocked (no key): Studio still renders real charts, any Studio watermark is not hidden by the NMI page (observed: " + info.watermarkUnlicensedSession + "), and the dashboard stays correct", wmU.every((w) => w.hiddenByStudio || w.visible) && (await panelState()) === "active");
  rules.length = 0;
}

// ---- privacy / network / leakage
const origins = hosts();
check("network", "the browser talked only to its own origin during the whole Studio session (no third-party, telemetry, CDN or provider request)", origins.every((o) => o === ORIGIN), origins.join(","));
check("network", "no request to any AG Grid / AG Studio host (licence validation is offline in the browser)", !net.some((r) => /ag-grid\.com|ag-studio|ag-charts/.test(new URL(r.url).host)));
const storage = await ev("(async () => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]) + String(typeof indexedDB.databases === 'function' ? JSON.stringify(await indexedDB.databases()) : ''))()");
check("privacy", "no browser storage holds anything (the licence key, report state and customer data are never persisted)", storage === "[[],[]][]" || storage === "[[],[]]", storage.slice(0, 200));
check("privacy", "the licence key value is not in the page URL, DOM, storage or console output", !leaks(await ev("location.href + document.documentElement.outerHTML + " + q(storage))) && !leaks(consoleLog.join("\n")));
check("privacy", "the licence key value is not in the API log, the Vite dev-server log or the runner's own output", !leaks(readFileSync(apiLog, "utf8")) && !leaks(readFileSync(viteLog, "utf8")));
check("privacy", "the Studio panel carries no personal data from the invoice list: no customer names/e-mails and no invoice ids in its DOM", !/@a5\.example|Northwind|A5 Client|[0-9a-f]{8}-[0-9a-f]{4}-/.test(await ev("document.querySelector('#studio-panel').innerHTML")));
check("boundaries", "the browser never requested a send, remind, cancel, refund, payment or webhook route", !net.some((r) => /\/(send|remind|reminder|cancel|refund|capture|payments?|webhooks?)(\/|$|\?)/i.test(new URL(r.url).pathname)));
check("boundaries", "no provider call was made: the fake PayPal and fake model logs are empty", readFileSync(apiEnv.NMI_FAKE_MODEL_LOG, "utf8") === "" && readFileSync(apiEnv.NMI_FAKE_PAYPAL_LOG, "utf8") === "");

/* ====================================================================== mobile 390 (licensed, functional) */
await setViewport(MOBILE);
await goto("/");
await waitFor("!!document.querySelector('#dash-cards')", 30000);
await sleep(1500);
const chunkRequestsBefore = net.filter((r) => /StudioCharts|ag-studio/.test(r.url)).length;
const m2 = mark();
await sleep(1000);
check("mobile 390", "<=767px: the panel is COLLAPSED by default (Show charts, aria-expanded=false, body hidden) with the heading visible, and Studio is NOT loaded while collapsed", (await ev(`(() => { const p = document.querySelector('#studio-panel'); const b = p.querySelector('.studio-toggle'); return b.getAttribute('aria-expanded') === 'false' && b.textContent === 'Show charts' && p.querySelector('.studio-body').hidden === true && p.querySelector('h2').offsetParent !== null; })()`)) === true && net.slice(m2).filter((r) => /StudioCharts|ag-studio/.test(r.url)).length === 0);
check("mobile 390", "collapsed controls are out of the tab order (no focusable element inside the hidden body)", await ev(`[...document.querySelectorAll('#studio-panel .studio-body button, #studio-panel .studio-body summary, #studio-panel .studio-body [tabindex]')].every((e) => e.offsetParent === null)`));
check("mobile 390", "no page-level horizontal overflow while collapsed", (await ev("document.documentElement.scrollWidth - document.documentElement.clientWidth")) <= 0);
await ev("document.querySelector('#studio-panel .studio-toggle').focus()");
await key("Enter");
await waitActive(120000);
check("mobile 390", "keyboard Enter on Show charts expands the panel, aria-expanded=true, focus stays on the button, Studio loads on demand and shows its badge", (await ev(`(() => { const b = document.querySelector('#studio-panel .studio-toggle'); return b.getAttribute('aria-expanded') === 'true' && document.activeElement === b && b.textContent === 'Hide charts'; })()`)) === true && (await ev("document.querySelectorAll('#studio-panel .studio-title .badge').length")) === 1);
check("mobile 390", "expanded at 390px: no page-level horizontal overflow, the currency selector targets are >= 44px, and the Studio canvas fits the card", (await ev("document.documentElement.scrollWidth - document.documentElement.clientWidth")) <= 0 && (await ev("[...document.querySelectorAll('#studio-panel [role=tab]')].every((t) => t.getBoundingClientRect().height >= 44)")) && (await ev("(() => { const c = document.querySelector('[data-testid=studio-trend]').getBoundingClientRect(); const p = document.querySelector('#studio-panel').getBoundingClientRect(); return c.width > 200 && c.right <= p.right + 1; })()")));
{
  const days = dailySql(F, first);
  await sleep(800);
  const tips = await walkChart("studio-trend", Math.min(days.length, 10));
  const parsed = tips.map(parseTrendTip);
  const seen = parsed.filter((p) => p.label);
  check("mobile 390", "on mobile the Studio chart reads the same exact values as SQL (the bars reached through keyboard tooltips are matched by label)", seen.length > 0 && seen.every((p) => { const d = days.find((x) => mdLabel(x[0]) === p.label); return d && p.minor === minorOf(d[2]) && p.count === Number(d[1]); }), JSON.stringify(parsed.slice(0, 2)));
  await ev("document.querySelector('#studio-panel .studio-toggle').click()");
  await sleep(300);
  check("mobile 390", "Hide charts collapses it again", (await ev("document.querySelector('#studio-panel .studio-body').hidden")) === true);
}

/* ====================================================================== PHASE U: UNLICENSED evidence (screenshots allowed only here) */
shotsAllowed = true;
rules.push({ test: (u) => u.includes("/__nmi_dev/studio-licence"), action: "403" });
await setViewport(DESKTOP);
await goto("/");
await waitFor("!!document.querySelector('#dash-cards')", 30000);
await waitActive(120000);
await sleep(1500);
check("evidence", "UNLICENSED evidence session (licence request blocked): real Studio renders; this is the only session whose screenshots are saved (watermark observed: " + info.watermarkUnlicensedSession + ")", (await panelState()) === "active");
await fullShot("01-desktop-studio-daily-unlicensed");
await ev(`[...document.querySelectorAll('#studio-panel [role=tab]')].find((t) => t.textContent === 'JPY')?.click()`);
await sleep(1800);
await fullShot("02-desktop-studio-jpy-unlicensed");
// hover/keyboard tooltip
await ev(`document.querySelector('[data-testid=studio-trend] div[role=img]').focus()`);
await key("ArrowRight", 4);
await sleep(600);
check("evidence", "a Studio tooltip appears only after keyboard focus/arrow (hover and tap are the pointer equivalents), never idle", (await ev("document.querySelectorAll('.ag-charts-tooltip-row').length")) > 0);
await fullShot("03-desktop-studio-tooltip-unlicensed");
await ev("document.activeElement.blur()");
await setInput("#dash-date-start", longFrom);
await waitFor("document.querySelector('#studio-panel')?.dataset.studio === 'pending'", 20000).catch(() => {});
await settle().catch(() => {});
await waitActive(60000);
await sleep(1800);
await fullShot("04-desktop-studio-weekly-unlicensed");
await ev("document.documentElement.setAttribute('data-theme', 'dark')");
await sleep(1800);
await fullShot("05-desktop-studio-weekly-dark-unlicensed");
await ev("document.documentElement.removeAttribute('data-theme')");
await setInput("#dash-date-start", f0.from);
await settle().catch(() => {});
await waitActive(60000);
// mobile evidence
await setViewport(MOBILE);
await goto("/");
await waitFor("!!document.querySelector('#dash-cards')", 30000);
await sleep(1200);
await fullShot("06-mobile-390-studio-collapsed");
await click("#studio-panel .studio-toggle");
await waitActive(120000);
await sleep(1800);
await fullShot("07-mobile-390-studio-expanded-unlicensed");
await ev("document.documentElement.setAttribute('data-theme', 'dark')");
await sleep(1500);
await fullShot("08-mobile-390-studio-dark-unlicensed");
await ev("document.documentElement.removeAttribute('data-theme')");
// failure evidence: chunk failure (fallback) and analytics failure
rules.length = 0;
rules.push({ test: (u) => u.includes("/__nmi_dev/studio-licence"), action: "403" });
rules.push({ test: (u) => /StudioCharts|\/node_modules\/\.vite\/deps\/ag-studio/.test(u), action: "fail" });
await setViewport(DESKTOP);
await goto("/");
await waitFor("document.querySelector('#studio-panel')?.dataset.studio === 'fallback'", 30000);
await fullShot("09-desktop-studio-unavailable-fallback");
rules.length = 0;
rules.push({ test: (u, m) => m === "POST" && u.endsWith("/api/analytics/summary"), action: "fail" });
await goto("/");
await waitFor("!!document.querySelector('#dash-analytics-error')", 30000);
await fullShot("10-desktop-analytics-error-no-panel");
rules.length = 0;
shotsAllowed = false;

/* ====================================================================== 401: late session expiry removes everything */
await setViewport(DESKTOP);
await goto("/");
await waitFor("!!document.querySelector('#dash-cards')", 30000);
await waitActive(120000);
sql(`UPDATE sessions SET revoked_at = now() WHERE operator_id = '${OP}'`);
await pill("USD");
await waitFor("!!document.querySelector('#login-username') || /session has expired/i.test(document.body.innerText)", 30000, "login after 401");
await waitFor("/session has expired/i.test(document.body.innerText)", 8000, "expiry notice").catch(() => {});
const gone = await ev("({ panel: document.querySelector('#studio-panel') === null, cards: document.querySelectorAll('.currency-card').length, grid: !!document.querySelector('.ag-root-wrapper'), notice: /session has expired/i.test(document.body.innerText), login: !!document.querySelector('#login-username') })");
check("401", "a revoked server session (late 401 on the next analytics refresh) removes the workspace at once: the sign-in screen shows (the existing notice wording is recorded, not required), and no Studio panel, chart or customer total remains in the DOM", gone.panel && gone.cards === 0 && !gone.grid && gone.login, JSON.stringify(gone));
info.sessionExpiredNoticeShownAfter401 = gone.notice;

/* ====================================================================== flag OFF: the Community dashboard is untouched */
await stopVite();
await startVite(false);
const bridgeOff = await fetch(ORIGIN + "/__nmi_dev/studio-licence", { headers: { "x-nmi-dev-studio": "1" } });
const bridgeOffText = await bridgeOff.text();
check("default off", "without VITE_NMI_STUDIO_LOCAL=1 the dev server has no licence bridge: the route returns no key (the SPA shell, not JSON)", !bridgeOffText.includes('"licenseKey"') && !leaks(bridgeOffText));
rules.length = 0;
const m3 = mark();
await signIn();
await settle();
await sleep(2500);
check("default off", "flag off: the dashboard is the Community dashboard: no Activity analytics panel, cards and the AG Grid Community table present", (await ev("document.querySelector('#studio-panel') === null && document.querySelectorAll('#dash-cards .currency-card').length >= 2 && !!document.querySelector('.ag-root-wrapper')")) === true);
check("default off", "flag off: no Studio module, licensed package, chart chunk or licence request was loaded by the browser", !net.slice(m3).some((r) => /StudioCharts|StudioPanel|studioLicence|studioLoader|ag-studio|ag-charts-enterprise|__nmi_dev/.test(r.url)));

/* ---------------------------------------------------------------- shut down */
const consoleErrors = consoleLog.filter((l) => /^EXC /.test(l));
check("boundaries", "no uncaught browser exception during the whole run", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
check("screenshots", "screenshots were saved only from the UNLICENSED session (none from the licensed session)", readdirSync(SHOTS).length >= 10 && readdirSync(SHOTS).every((f) => /unlicensed|collapsed|fallback|no-panel/.test(f)));
const failed = results.filter((r) => r.result === "FAIL").length;
info.finishedAt = new Date().toISOString();
info.passed = results.length - failed;
info.total = results.length;
info.failed = failed;
info.stack = "real Fastify (SIMULATED launcher: fake parser, fake PayPal) in a sandbox-exec no-egress profile + the real web app on the Vite DEV server (VITE_NMI_STUDIO_LOCAL=1) + real AG Studio 3.0.0 + headless Chrome (CDP, Asia/Manila emulated) + private PostgreSQL 16";
writeFileSync(join(here, "qa-results.json"), JSON.stringify({ task: "NMI-PROTOTYPE-10D-A5-I1", environment: info, simulated: true, results }, null, 2) + "\n");
console.log(`\n${results.length - failed}/${results.length} passed`);
try { ws.close(); } catch {}
await cleanup();
info.cleanup = !existsSync(work);
process.exit(failed || pgPreservedDir ? 1 : 0);
