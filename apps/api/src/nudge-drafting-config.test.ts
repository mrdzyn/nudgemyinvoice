import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { baseEnv } from "./test-support.js";

/**
 * Objective (P6-AUD-02): live NMI-P6 nudge drafting has its OWN explicit, default-OFF opt-in. OpenAI parser
 * credentials alone never enable it; enabling it without a configured model refuses to start; and the production
 * entrypoint constructs the nudge client only from that gated config.
 */
const creds = { OPENAI_API_KEY: "sk-test-not-real", OPENAI_MODEL: "test-model" };

describe("NUDGE_AI_DRAFTING_ENABLED", () => {
  it("is off by default, even with the parser's OpenAI credentials configured", () => {
    const c = loadConfig({ ...baseEnv, ...creds });
    expect(c.openai).not.toBeNull(); // existing parsing keeps working
    expect(c.aiConfigured).toBe(true);
    expect(c.nudgeDrafting).toBeNull(); // P6 drafting stays unavailable (503)
    expect(
      loadConfig({ ...baseEnv, ...creds, NUDGE_AI_DRAFTING_ENABLED: "false" }).nudgeDrafting,
    ).toBeNull();
  });
  it("enables live drafting only on the explicit opt-in, reusing the configured model with the 600-token cap", () => {
    const c = loadConfig({ ...baseEnv, ...creds, NUDGE_AI_DRAFTING_ENABLED: "true" });
    expect(c.nudgeDrafting).toEqual({
      apiKey: "sk-test-not-real",
      model: "test-model",
      maxOutputTokens: 600,
    });
  });
  it("refuses to start when enabled without a configured model", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        OPENAI_API_KEY: "",
        OPENAI_MODEL: "",
        NUDGE_AI_DRAFTING_ENABLED: "true",
      }),
    ).toThrow(/NUDGE_AI_DRAFTING_ENABLED=true requires OPENAI_API_KEY and OPENAI_MODEL/);
    expect(() =>
      loadConfig({
        ...baseEnv,
        OPENAI_API_KEY: "",
        OPENAI_MODEL: "m",
        NUDGE_AI_DRAFTING_ENABLED: "true",
      }),
    ).toThrow(/requires OPENAI_API_KEY/);
  });
  it("accepts only the literal values true/false (fails closed on anything else)", () => {
    for (const v of ["yes", "1", "TRUE", "on"])
      expect(() => loadConfig({ ...baseEnv, ...creds, NUDGE_AI_DRAFTING_ENABLED: v })).toThrow();
  });
  it("disabling P6 does not change the parser configuration", () => {
    const off = loadConfig({ ...baseEnv, ...creds });
    const on = loadConfig({ ...baseEnv, ...creds, NUDGE_AI_DRAFTING_ENABLED: "true" });
    expect(off.openai).toEqual(on.openai);
  });
  it("the production entrypoint builds the nudge client ONLY from the gated config", () => {
    const server = readFileSync(join(import.meta.dirname, "server.ts"), "utf8");
    const parserBranch = server.slice(
      server.indexOf("config.openai"),
      server.indexOf("config.nudgeDrafting"),
    );
    expect(parserBranch).toContain("createOpenAIInvoiceClient");
    expect(parserBranch).not.toContain("createOpenAINudgeClient");
    expect(server.match(/createOpenAINudgeClient\(/g)).toHaveLength(1);
    expect(server).toMatch(
      /\.\.\.\(config\.nudgeDrafting\s*\?\s*\{\s*nudgeClient: createOpenAINudgeClient\(\{\s*apiKey: config\.nudgeDrafting\.apiKey/,
    );
  });
});
