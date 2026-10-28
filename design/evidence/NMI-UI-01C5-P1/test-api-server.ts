/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// TEST-ONLY launcher for the NMI-UI-01C5-P1 browser journey. It starts the REAL Fastify app (real
// auth, CSRF/Origin, owner scoping, the real PayPal draft service and state machine, real PostgreSQL)
// but injects a DETERMINISTIC FAKE PayPal client, so the draft-creation path can be exercised with
// NO PayPal request at all. The real PayPal Sandbox client is never constructed here, and there is
// no model client. The fake is NOT PayPal: results prove the UI and the local state machine, not
// provider behaviour. It is never imported by production code and server.ts has no such switch.
//
// Behaviour is chosen ONLY by marker words in the (synthetic) line-item description:
//   SIM-UNKNOWN   first create throws "outcome unknown" (the draft was not created); a retry only reconciles
//   SIM-REJECT    first create is rejected by the fake; an explicit later retry succeeds
//   SIM-MISMATCH  the fake "creates" a draft whose total differs (the service must flag a mismatch)
//   SIM-SLOW      the create takes 4 s (in-flight state, double clicks)
//   (none)        an honest draft
// NMI_FAKE_PAYPAL_LOG=<file> appends one line per fake provider call ("create" | "get" | "find").
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(root, "apps/api/package.json"));
const pg = require("pg");
const { buildApp } = await import(resolve(root, "apps/api/src/app.ts"));
const { loadConfig } = await import(resolve(root, "apps/api/src/config.ts"));
const { createDb } = await import(resolve(root, "packages/db/src/index.ts"));
const { fakePayPal } = await import(resolve(root, "apps/api/src/test-paypal.ts"));
const { PayPalOutcomeUnknownError, PayPalRejectedError } = await import(resolve(root, "packages/paypal/src/index.ts"));

const log = process.env.NMI_FAKE_PAYPAL_LOG;
const note = (what: string) => log && appendFileSync(log, what + "\n");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fake = fakePayPal();
const failedOnce = new Set<string>();
fake.on.create = async ({ body }: any) => {
  const marker = String(body.items?.[0]?.name ?? "");
  const number = String(body.detail.invoice_number);
  if (marker.includes("SIM-SLOW")) await wait(4000);
  if (marker.includes("SIM-UNKNOWN") && !failedOnce.has(number)) {
    failedOnce.add(number);
    throw new PayPalOutcomeUnknownError("timeout");
  }
  if (marker.includes("SIM-REJECT") && !failedOnce.has(number)) {
    failedOnce.add(number);
    throw new PayPalRejectedError("http_422:invalid_parameter_value");
  }
  if (marker.includes("SIM-MISMATCH")) return { paypalInvoiceId: fake.materialize(body, { total: "1.00" }) };
  return { paypalInvoiceId: fake.materialize(body) };
};
// Count every call the service makes to the (fake) provider.
const client = {
  createDraftInvoice: (i: unknown) => (note("create"), fake.client.createDraftInvoice(i)),
  getInvoice: (i: string) => (note("get"), fake.client.getInvoice(i)),
  findInvoiceIdsByNumber: (n: string) => (note("find"), fake.client.findInvoiceIdsByNumber(n)),
};

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const app = buildApp(config, { db: createDb(pool), paypal: client });
app.addHook("onClose", async () => { await pool.end(); });
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(`TEST-ONLY API on ${config.port}; PayPal=DETERMINISTIC FAKE (drafts ${config.paypalDraftsEnabled ? "ENABLED" : "disabled"}); model=NONE`);
