/* eslint-disable -- design/QA-only Node tooling (not production code): uses Node globals and console output by design. */
// TEST-ONLY launcher for the NMI-P6 AI nudge browser journey. It starts the REAL Fastify app (real auth, CSRF/Origin,
// rate limits, the real nudge routes and validation, the least-privilege runtime role on PostgreSQL, and the built SPA
// from apps/web/dist) but injects a DETERMINISTIC FAKE `NudgeModelClient` instead of OpenAI. The fake is NOT OpenAI
// and proves nothing about live inference. It is never imported by production code; server.ts has no such switch.
//
// Fails closed: refuses to start unless NMI_P6_SIMULATED=1, refuses NODE_ENV=production.
//   NMI_P6_MODEL=off          -> no model client at all (the genuine AI-unavailable path)
//   NMI_P6_MODEL_SCRIPT=path  -> one word per call, read fresh each call: ok | unpaid | down | slow
//   NMI_P6_MODEL_LOG=path     -> appends the model INPUT (it carries no customer data by design) for privacy checks
//   NMI_P6_BUDGET=n           -> lowers the existing per-operator drafting budget seam so a REAL 429 is reachable
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.NMI_P6_SIMULATED !== "1") {
  console.error("refusing to start: NMI_P6_SIMULATED=1 is required (test-only launcher)");
  process.exit(2);
}
if (process.env.NODE_ENV === "production") {
  console.error("refusing to start: the simulated launcher never runs with NODE_ENV=production");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(root, "apps/api/package.json"));
const pg = require("pg");
const { buildApp } = await import(resolve(root, "apps/api/src/app.ts"));
const { loadConfig } = await import(resolve(root, "apps/api/src/config.ts"));
const { createDb } = await import(resolve(root, "packages/db/src/index.ts"));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BODY: Record<string, string> = {
  friendly:
    "Hi {{customer_name}},\n\nI hope your week is going well! Just a quick note about invoice {{invoice_ref}} for {{amount}}, which was due on {{due_date}}. Could you let me know when payment is planned, or if you have any questions?\n\nThanks so much,",
  professional:
    "Hi {{customer_name}},\n\nA quick reminder that invoice {{invoice_ref}} for {{amount}} was due on {{due_date}}. Could you let me know when payment is planned, or whether anything is holding it up?\n\nThank you for your help.\n\nKind regards,",
  firm:
    "Hello {{customer_name}},\n\nI am following up on invoice {{invoice_ref}} for {{amount}}, which was due on {{due_date}}. Please reply this week with the date payment will be made, or let me know if you have any questions first.\n\nKind regards,",
};
const RATIONALE: Record<string, string> = {
  friendly: "A warm, relaxed note that names the invoice and asks for an update without any pressure.",
  professional: "A courteous, concise reminder that names the invoice and asks for an update on timing.",
  firm: "A direct but polite follow-up that asks for a specific payment date, with no threats or claims.",
};

const nudgeClient = {
  model: "fake-nudge-model (SIMULATED)",
  async generate({ input }: { instructions: string; input: string }): Promise<unknown> {
    const log = process.env.NMI_P6_MODEL_LOG;
    if (log) appendFileSync(log, `${input}\n`);
    const script = process.env.NMI_P6_MODEL_SCRIPT;
    const mode = script && existsSync(script) ? readFileSync(script, "utf8").trim() : "ok";
    const parsed = JSON.parse(input) as { tone: string; due_status: string };
    const tone = parsed.tone;
    // Date-aware tense, like a real model given "the due date is still ahead" / "is today".
    const ahead = /still ahead|is today/.test(parsed.due_status);
    const body = (t: string) => (ahead ? BODY[t]!.replace(/was due on|which was due on/g, (m) => m.replace("was due", "is due")) : BODY[t]!);
    if (mode === "down") throw new Error("fake provider outage");
    if (mode === "slow") await wait(2500);
    if (mode === "unpaid")
      // An UNSUPPORTED payment-status claim: the server's output guard must refuse it (422) and store nothing.
      return { message: body(tone).replace("Could you", "The invoice is still unpaid. Could you").replace("Please reply", "It is still unpaid. Please reply"), rationale: RATIONALE[tone] };
    return { message: body(tone), rationale: RATIONALE[tone] };
  },
};

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const budget = process.env.NMI_P6_BUDGET ? Number(process.env.NMI_P6_BUDGET) : undefined;
const app = buildApp(config, {
  db: createDb(pool),
  ...(process.env.NMI_P6_MODEL === "off" ? {} : { nudgeClient }),
  ...(budget ? { nudgeSeams: { generateBudgetMax: budget } } : {}),
});
app.addHook("onClose", async () => {
  await pool.end();
});
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(
  `SIMULATED TEST-ONLY API on ${config.port}; nudge model=${process.env.NMI_P6_MODEL === "off" ? "NONE" : "DETERMINISTIC FAKE"}`,
);
