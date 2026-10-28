/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// SIMULATED EVALUATION MODE launcher (test-only; NOT the production server).
//
// It starts the REAL Fastify application (real authentication, CSRF/Origin, owner scoping, the real
// strict parser/validation pipeline, the real PayPal draft service and its durable state machine, real
// PostgreSQL) but injects two DETERMINISTIC FAKES so the whole workflow can be evaluated WITHOUT any
// provider credentials or provider request:
//   * a regex "parser" instead of OpenAI  (NOT OpenAI; understands only simple English like
//     "Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due 2030-01-15");
//   * a fake PayPal client instead of the PayPal Sandbox (NOT PayPal; "creates" drafts in memory).
// Everything it shows about OpenAI/PayPal is SIMULATED. It is not evidence of real provider behaviour.
//
// Safety: it refuses to run unless NMI_SIMULATED_EVAL=1 is set explicitly, refuses NODE_ENV=production,
// refuses any PAYPAL_API_BASE_URL that is not the PayPal Sandbox host, and never constructs the real
// OpenAI or PayPal clients. apps/api/src/server.ts (the production entrypoint) has no such switch and
// never imports this file.
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.NMI_SIMULATED_EVAL !== "1") {
  console.error("Refusing to start: set NMI_SIMULATED_EVAL=1 to run the SIMULATED evaluation server.");
  process.exit(2);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to start in NODE_ENV=production.");
  process.exit(2);
}
const base = process.env.PAYPAL_API_BASE_URL ?? "https://api-m.sandbox.paypal.com";
if (new URL(base).host !== "api-m.sandbox.paypal.com") {
  console.error("Refusing to start: PAYPAL_API_BASE_URL must be the PayPal Sandbox host.");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(root, "apps/api/package.json"));
const pg = require("pg");
const { buildApp } = await import(resolve(root, "apps/api/src/app.ts"));
const { loadConfig } = await import(resolve(root, "apps/api/src/config.ts"));
const { createDb } = await import(resolve(root, "packages/db/src/index.ts"));
const { fakePayPal } = await import(resolve(root, "apps/api/src/test-paypal.ts"));

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "customer";

/** SIMULATED parser: regexes over simple English. Missing facts stay null so the real pipeline asks. */
const simulatedParser = {
  async generate({ input }: { instructions: string; input: string }): Promise<unknown> {
    if (process.env.NMI_FAKE_MODEL_LOG) appendFileSync(process.env.NMI_FAKE_MODEL_LOG, `${input.length}\n`); // length only
    const text = input;
    const currency = CURRENCIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text)) ?? null;
    const name = /\bInvoice\s+(.+?)\s+for\b/i.exec(text)?.[1]?.trim() ?? null;
    const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(text)?.[0] ?? (name ? `billing@${slug(name)}.example` : null);
    const item = /\bfor\s+(\d+(?:\.\d+)?)\s+(.+?)\s+at\s+(\d+(?:\.\d+)?)\s*(?:[A-Z]{3})?\s*(?:each)?/i.exec(text);
    const tax = /(\d+(?:\.\d+)?)\s*%\s*tax/i.exec(text)?.[1] ?? null;
    const due = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1] ?? null;
    return {
      customerName: name,
      customerEmail: email,
      currency,
      lineItems: item ? [{ description: item[2] as string, quantity: item[1] as string, unitPrice: item[3] as string }] : [],
      dueDate: due,
      taxPercent: tax,
      discount: null,
    };
  },
};

const fake = fakePayPal(); // honest in-memory drafts: create -> DRAFT with identical currency/total/due date
const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
// Optional call counter for QA: one line per fake provider call, never any content.
const note = (what: string) => process.env.NMI_FAKE_PAYPAL_LOG && appendFileSync(process.env.NMI_FAKE_PAYPAL_LOG, what + "\n");
const client = {
  createDraftInvoice: (i: unknown) => (note("create"), fake.client.createDraftInvoice(i as never)),
  getInvoice: (i: string) => (note("get"), fake.client.getInvoice(i)),
  findInvoiceIdsByNumber: (n: string) => (note("find"), fake.client.findInvoiceIdsByNumber(n)),
};
const app = buildApp(config, { db: createDb(pool), modelClient: simulatedParser, paypal: client });
app.addHook("onClose", async () => { await pool.end(); });
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log("==============================================================================");
console.log(" SIMULATED EVALUATION MODE - OpenAI is a regex stand-in, PayPal is an in-memory fake.");
console.log(" NO provider credentials are used and NO provider request is made.");
console.log(` API on http://127.0.0.1:${config.port}  (PayPal drafting ${config.paypalDraftsEnabled ? "ENABLED for the fake" : "DISABLED"})`);
console.log("==============================================================================");
