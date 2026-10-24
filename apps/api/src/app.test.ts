import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const env = {
  NODE_ENV: "test",
  PAYPAL_ENV: "sandbox",
  PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
  OPENAI_API_KEY: "sk-test-secret-value",
  OPENAI_MODEL: "m",
};

describe("api", () => {
  it("GET /health reports sandbox and never leaks secrets", async () => {
    const app = buildApp(loadConfig(env));
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", paypalEnvironment: "sandbox", aiConfigured: true });
    expect(res.body).not.toContain("sk-test-secret-value");
    await app.close();
  });
  it("refuses to start against a live PayPal host or missing sandbox config", () => {
    expect(() => loadConfig({ ...env, PAYPAL_API_BASE_URL: "https://api-m.paypal.com" })).toThrow();
    expect(() => loadConfig({ NODE_ENV: "test" })).toThrow();
  });
  it("reports AI as unconfigured without a key", () => {
    expect(loadConfig({ ...env, OPENAI_API_KEY: "" }).aiConfigured).toBe(false);
  });
});
