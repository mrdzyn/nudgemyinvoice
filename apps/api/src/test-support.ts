import { randomBytes } from "node:crypto";

/** Test-only configuration shared by API test files (not a test file itself). */
export const baseEnv = {
  NODE_ENV: "test",
  PAYPAL_ENV: "sandbox",
  PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
  OPENAI_API_KEY: "sk-test-secret-value",
  OPENAI_MODEL: "m",
  DATABASE_URL: "postgres://nobody@127.0.0.1:1/nmi_test_unused",
  // Random per run: no secret-looking literal lives in the repository.
  SESSION_SECRET: randomBytes(32).toString("hex"),
  WEB_ORIGIN: "http://localhost:5173",
};
