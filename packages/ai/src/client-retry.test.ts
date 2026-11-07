import { describe, expect, it } from "vitest";
import { createOpenAIInvoiceClient } from "./client.js";
import { createOpenAINudgeClient } from "./nudge.js";

function failingFetch() {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ error: { message: "synthetic upstream", type: "server_error" } }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  };
  return { fetchImpl, calls: () => calls };
}

describe("judge-mode provider retries", () => {
  it("makes one wire attempt when parser retries are disabled", async () => {
    const seen = failingFetch();
    const client = createOpenAIInvoiceClient({
      apiKey: "sk-test-only-synthetic-not-a-real-secret",
      model: "gpt-6-luna",
      maxRetries: 0,
      timeoutMs: 1000,
      fetch: seen.fetchImpl,
    });
    await expect(client.generate({ instructions: "parse", input: "synthetic" })).rejects.toThrow();
    expect(seen.calls()).toBe(1);
  });

  it("makes one wire attempt for a nudge draft", async () => {
    const seen = failingFetch();
    const client = createOpenAINudgeClient({
      apiKey: "sk-test-only-synthetic-not-a-real-secret",
      model: "gpt-6-luna",
      timeoutMs: 1000,
      fetch: seen.fetchImpl,
    });
    await expect(
      client.generate({ instructions: "draft", input: '{"tone":"friendly"}' }),
    ).rejects.toThrow();
    expect(seen.calls()).toBe(1);
  });
});
