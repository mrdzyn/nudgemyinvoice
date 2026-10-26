import pg from "pg";
import { createDb } from "@nmi/db";
import { createOpenAIInvoiceClient } from "@nmi/ai";
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
await app.listen({ port: config.port, host: "127.0.0.1" });
