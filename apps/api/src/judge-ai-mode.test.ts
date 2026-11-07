import { describe, expect, it } from "vitest";
import {
  JUDGE_AI_CONCURRENCY,
  JUDGE_AI_REQUESTS_PER_WINDOW,
  JUDGE_AI_WINDOW_MS,
  isJudgeAiMode,
  loadConfig,
  parserMaxRetries,
} from "./config.js";
import { checkReleaseEnv } from "./release-preflight.js";

const base = {
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  PORT: "10000",
  WEB_ORIGIN: "https://nudgemyinvoice-judges.onrender.com",
  TRUST_PROXY: "1",
  DATABASE_URL: "postgres://nmi_runtime:synthetic@internal/nmi",
  SESSION_SECRET: "q7Hs2LmN9xV4bC8dF1gJ5kP0rT3wY6zA-extra",
  PAYPAL_ENV: "sandbox",
  PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
  PAYPAL_DRAFTS_ENABLED: "false",
};

describe("limited judge AI mode fails closed without a provider call", () => {
  it("stays provider-disabled by default and does not construct OpenAI config", () => {
    const config = loadConfig(base);
    expect(config.judgeAiMode).toBe("off");
    expect(config.openai).toBeNull();
    expect(config.nudgeDrafting).toBeNull();
    expect(parserMaxRetries(config.judgeAiMode)).toBe(1);
    expect(config.paypalDraftsEnabled).toBe(false);
  });

  it("rejects incomplete limited configuration before any client exists", () => {
    for (const patch of [
      {},
      { OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret" },
      {
        OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret",
        OPENAI_MODEL: "gpt-6-luna",
      },
      {
        OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret",
        OPENAI_MODEL: "other-model",
        OPENAI_MAX_OUTPUT_TOKENS: "4096",
        NUDGE_AI_DRAFTING_ENABLED: "true",
      },
      {
        OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret",
        OPENAI_MODEL: "gpt-6-luna",
        OPENAI_MAX_OUTPUT_TOKENS: "4096",
        NUDGE_AI_DRAFTING_ENABLED: "true",
        PAYPAL_CLIENT_ID: "synthetic",
      },
    ]) {
      expect(() => loadConfig({ ...base, NMI_JUDGE_AI_MODE: "limited", ...patch })).toThrow();
    }
  });

  it("accepts the reviewed pair of AI features and keeps PayPal disabled", () => {
    const config = loadConfig({
      ...base,
      NMI_JUDGE_AI_MODE: "limited",
      OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret",
      OPENAI_MODEL: "gpt-6-luna",
      OPENAI_MAX_OUTPUT_TOKENS: "4096",
      NUDGE_AI_DRAFTING_ENABLED: "true",
    });
    expect(config.judgeAiMode).toBe("limited");
    expect(config.openai?.model).toBe("gpt-6-luna");
    expect(config.nudgeDrafting?.model).toBe("gpt-6-luna");
    expect(parserMaxRetries("limited")).toBe(0);
    expect(JUDGE_AI_REQUESTS_PER_WINDOW).toBe(3);
    expect(JUDGE_AI_WINDOW_MS).toBe(600_000);
    expect(JUDGE_AI_CONCURRENCY).toBe(1);
    expect(config.paypalCredentials).toBeNull();
  });

  it("SEC-01: refuses OpenAI credentials when the mode is absent in production", () => {
    // Absent NMI_JUDGE_AI_MODE defaults to "off": production must fail closed, not build a client.
    expect(() =>
      loadConfig({
        ...base,
        OPENAI_API_KEY: "[REDACTED]",
        OPENAI_MODEL: "gpt-6-luna",
      }),
    ).toThrow(/forbids OpenAI credentials/);
    expect(() => loadConfig({ ...base, OPENAI_MODEL: "gpt-6-luna" })).toThrow(
      /forbids OpenAI credentials/,
    );
    expect(() =>
      loadConfig({
        ...base,
        OPENAI_API_KEY: "[REDACTED]",
        OPENAI_MODEL: "gpt-6-luna",
        NUDGE_AI_DRAFTING_ENABLED: "true",
      }),
    ).toThrow(/forbids OpenAI credentials/);
  });

  it("SEC-01: rejects a malformed judge mode value before any client exists", () => {
    expect(() => loadConfig({ ...base, NMI_JUDGE_AI_MODE: "LIMITED" })).toThrow();
    expect(() => loadConfig({ ...base, NMI_JUDGE_AI_MODE: "true" })).toThrow();
  });

  it("SEC-01: local development harnesses without the mode keep their existing behavior", () => {
    const dev = loadConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://nmi_runtime:synthetic@internal/nmi",
      SESSION_SECRET: "q7Hs2LmN9xV4bC8dF1gJ5kP0rT3wY6zA-extra",
      PAYPAL_ENV: "sandbox",
      PAYPAL_API_BASE_URL: "https://api-m.sandbox.paypal.com",
      OPENAI_API_KEY: "[REDACTED]",
      OPENAI_MODEL: "gpt-6-luna",
    });
    expect(dev.judgeAiMode).toBe("off");
    expect(dev.openai?.model).toBe("gpt-6-luna");
    expect(dev.nudgeDrafting).toBeNull();
  });

  it("combined mode accepts the full OpenAI + PayPal Sandbox matrix", () => {
    const config = loadConfig({
      ...base,
      NMI_JUDGE_AI_MODE: "combined",
      OPENAI_API_KEY: "sk-test-only-combined-synthetic-not-a-real-secret",
      OPENAI_MODEL: "gpt-6-luna",
      OPENAI_MAX_OUTPUT_TOKENS: "4096",
      NUDGE_AI_DRAFTING_ENABLED: "true",
      PAYPAL_DRAFTS_ENABLED: "true",
      PAYPAL_CLIENT_ID: "synthetic-combined-client-id",
      PAYPAL_CLIENT_SECRET: "synthetic-combined-client-secret",
    });
    expect(config.judgeAiMode).toBe("combined");
    expect(config.openai?.model).toBe("gpt-6-luna");
    expect(config.nudgeDrafting?.model).toBe("gpt-6-luna");
    expect(config.paypalDraftsEnabled).toBe(true);
    expect(config.paypalCredentials).toEqual({
      clientId: "synthetic-combined-client-id",
      clientSecret: "synthetic-combined-client-secret",
    });
    expect(config.paypalBaseUrl).toBe("https://api-m.sandbox.paypal.com");
    expect(parserMaxRetries("combined")).toBe(0);
    expect(isJudgeAiMode("combined")).toBe(true);
    expect(isJudgeAiMode("limited")).toBe(true);
    expect(isJudgeAiMode("off")).toBe(false);
  });

  it("emergency shutdown env restores the provider-disabled shape", () => {
    // Documented kill-switch end-state: mode absent (defaults off), every provider key/flag removed.
    const shutdown = loadConfig({
      ...base,
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: undefined,
      OPENAI_MAX_OUTPUT_TOKENS: undefined,
      NUDGE_AI_DRAFTING_ENABLED: "false",
      PAYPAL_DRAFTS_ENABLED: "false",
      PAYPAL_CLIENT_ID: undefined,
      PAYPAL_CLIENT_SECRET: undefined,
    });
    expect(shutdown.judgeAiMode).toBe("off");
    expect(shutdown.openai).toBeNull();
    expect(shutdown.nudgeDrafting).toBeNull();
    expect(shutdown.paypalDraftsEnabled).toBe(false);
    expect(shutdown.paypalCredentials).toBeNull();
    expect(parserMaxRetries(shutdown.judgeAiMode)).toBe(1);
  });

  it("combined mode fails closed on each missing piece and on live PayPal", () => {
    const full = {
      NMI_JUDGE_AI_MODE: "combined",
      OPENAI_API_KEY: "sk-test-only-combined-synthetic-not-a-real-secret",
      OPENAI_MODEL: "gpt-6-luna",
      OPENAI_MAX_OUTPUT_TOKENS: "4096",
      NUDGE_AI_DRAFTING_ENABLED: "true",
      PAYPAL_DRAFTS_ENABLED: "true",
      PAYPAL_CLIENT_ID: "synthetic-combined-client-id",
      PAYPAL_CLIENT_SECRET: "synthetic-combined-client-secret",
    };
    const cases: Array<[string, Record<string, string | undefined>]> = [
      ["missing OpenAI key", { OPENAI_API_KEY: undefined }],
      ["wrong model", { OPENAI_MODEL: "other-model" }],
      ["wrong token cap", { OPENAI_MAX_OUTPUT_TOKENS: "1024" }],
      ["nudge opt-in off", { NUDGE_AI_DRAFTING_ENABLED: "false" }],
      ["drafts disabled", { PAYPAL_DRAFTS_ENABLED: "false" }],
      ["missing client secret", { PAYPAL_CLIENT_SECRET: undefined }],
      ["live PayPal env", { PAYPAL_ENV: "live" }],
      ["live PayPal host", { PAYPAL_API_BASE_URL: "https://api-m.paypal.com" }],
    ];
    for (const [name, patch] of cases) {
      expect(() => loadConfig({ ...base, ...full, ...patch }), name).toThrow();
    }
  });

  it("does not let an explicit off release keep a provider key", () => {
    expect(() =>
      loadConfig({
        ...base,
        NMI_JUDGE_AI_MODE: "off",
        OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret",
        OPENAI_MODEL: "gpt-6-luna",
      }),
    ).toThrow(/forbids OpenAI credentials/);
    const findings = checkReleaseEnv({
      ...base,
      NMI_WEB_STUDIO: "licensed",
      AG_STUDIO_LICENSE_KEY: "Synthetic licence 0123456789abcdef",
      OPENAI_API_KEY: "sk-test-only-synthetic-not-a-real-secret",
    })
      .filter((f) => !f.ok)
      .map((f) => f.id);
    expect(findings).toContain("env.forbidden-absent");
  });
});
