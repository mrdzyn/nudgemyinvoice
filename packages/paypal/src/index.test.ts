import { describe, expect, it } from "vitest";
import { assertSandboxConfig, SandboxConfigError } from "./index.js";

describe("sandbox-only configuration", () => {
  it("accepts the sandbox host", () => {
    expect(
      assertSandboxConfig({
        PAYPAL_ENV: "sandbox",
        PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
      }).hostname,
    ).toBe("api-m.sandbox.paypal.com");
  });
  it.each([
    [{ PAYPAL_ENV: "live", PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com" }],
    [{ PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://api-m.paypal.com" }],
    [{ PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "http://api-m.sandbox.paypal.com" }],
    [
      {
        PAYPAL_ENV: "sandbox",
        PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com.evil.example",
      },
    ],
    [{ PAYPAL_ENV: "sandbox", PAYPAL_API_BASE_URL: "https://user:pw@api-m.sandbox.paypal.com" }],
    [{ PAYPAL_ENV: "sandbox" }],
    [{}],
  ])("rejects %j", (env) => expect(() => assertSandboxConfig(env)).toThrow(SandboxConfigError));
});
