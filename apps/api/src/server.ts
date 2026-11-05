import pg from "pg";
import { createDb } from "@nmi/db";
import { createOpenAIInvoiceClient, createOpenAINudgeClient } from "@nmi/ai";
import { PayPalSandboxClient } from "@nmi/paypal";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
const app = buildApp(config, {
  db: createDb(pool),
  // Without OPENAI_API_KEY + OPENAI_MODEL parsing returns the manual-entry fallback.
  ...(config.openai
    ? {
        modelClient: createOpenAIInvoiceClient({
          apiKey: config.openai.apiKey,
          model: config.openai.model,
          maxOutputTokens: config.openai.maxOutputTokens,
        }),
        // NMI-P6 nudge drafting uses the same configured model; without it drafting answers 503.
        nudgeClient: createOpenAINudgeClient({
          apiKey: config.openai.apiKey,
          model: config.openai.model,
          maxOutputTokens: Math.min(config.openai.maxOutputTokens, 600),
        }),
      }
    : {}),
  // Real PayPal sandbox calls only when PAYPAL_DRAFTS_ENABLED=true (credentials then mandatory).
  ...(config.paypalCredentials
    ? {
        paypal: new PayPalSandboxClient({
          baseUrl: config.paypalBaseUrl,
          clientId: config.paypalCredentials.clientId,
          clientSecret: config.paypalCredentials.clientSecret,
        }),
      }
    : {}),
});
app.addHook("onClose", async () => {
  await pool.end();
});
await app.listen({ port: config.port, host: config.host });
