import pg from "pg";
import { createDb } from "@nmi/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
const app = buildApp(config, { db: createDb(pool) });
app.addHook("onClose", async () => {
  await pool.end();
});
await app.listen({ port: config.port, host: "127.0.0.1" });
