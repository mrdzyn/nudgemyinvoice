/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// TEST-ONLY launcher for the NMI-UI-01C2 browser journey. It starts the REAL Fastify app (real
// auth, real CSRF/Origin checks, real parse route, real PostgreSQL) but injects a DETERMINISTIC FAKE
// `InvoiceModelClient` instead of the OpenAI client, so draft and clarification paths can be
// exercised with no provider call. The fake is NOT OpenAI and proves nothing about live inference.
// It is never imported by production code and the production server.ts has no such switch.
//
// NMI_FAKE_MODEL=off  -> no model client at all (the genuine provider-unconfigured `unavailable`).
// NMI_PARSE_BUDGET=n  -> lowers the existing per-operator parse budget seam so a REAL 429 is reachable.
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

const callLog = process.env.NMI_FAKE_MODEL_LOG;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fullOutput = {
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concepts", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2030-01-15",
  taxPercent: "8",
  discount: null,
};

/** Deterministic: behaviour is selected only by marker words in the (synthetic) input text. */
const fakeModel = {
  async generate({ input }: { instructions: string; input: string }): Promise<unknown> {
    if (callLog) appendFileSync(callLog, `${input.length}\n`); // length only: never the text
    if (input.includes("SLOWMODEL")) await wait(4000);
    if (input.includes("MODELDOWN")) throw new Error("fake provider outage");
    if (input.includes("BADSHAPE")) return { oops: true };
    if (input.includes("BADCURRENCY")) return { ...fullOutput, currency: "XYZ" };
    if (input.includes("NODUE") && !input.includes("2030-02-01")) return { ...fullOutput, dueDate: null };
    if (input.includes("EUR")) return { ...fullOutput, currency: "EUR", lineItems: [{ description: "Brand audit", quantity: "1.5", unitPrice: "199.99" }] };
    return fullOutput;
  },
};

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const budget = process.env.NMI_PARSE_BUDGET ? Number(process.env.NMI_PARSE_BUDGET) : undefined;
const app = buildApp(config, {
  db: createDb(pool),
  ...(process.env.NMI_FAKE_MODEL === "off" ? {} : { modelClient: fakeModel }),
  ...(budget ? { invoiceSeams: { parseBudgetMax: budget } } : {}),
});
app.addHook("onClose", async () => { await pool.end(); });
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(`TEST-ONLY API on ${config.port}; model=${process.env.NMI_FAKE_MODEL === "off" ? "NONE" : "DETERMINISTIC FAKE"}`);
