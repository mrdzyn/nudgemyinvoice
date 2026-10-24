import { describe, expect, it } from "vitest";
import { parseFixtures, TODAY } from "@nmi/test-fixtures";
import { parseInvoiceRequest, MAX_INPUT_CHARS } from "./parser.js";
import type { InvoiceModelClient } from "./client.js";

const fake = (out: unknown): InvoiceModelClient => ({ generate: async () => out });

describe("invoice parser fixtures (fake model; no network, no API key)", () => {
  for (const f of parseFixtures) {
    it(f.name, async () => {
      const r = await parseInvoiceRequest(f.input, { client: fake(f.modelOutput), today: TODAY });
      expect(r.status).toBe(f.expectStatus);
      if (r.status === "draft") {
        if (f.expectTotal) expect(r.totals.total).toBe(f.expectTotal);
        if (f.expectCurrency) expect(r.draft.currency).toBe(f.expectCurrency);
        expect(JSON.stringify(r)).not.toContain("\u0000");
      }
      if (r.status === "needs_clarification" && f.expectQuestionFields) {
        expect(r.questions.map((q) => q.field).sort()).toEqual([...f.expectQuestionFields].sort());
      }
    });
  }
});

describe("parser safeguards", () => {
  it("falls back to manual entry when the model is unavailable, without leaking the error", async () => {
    const client: InvoiceModelClient = {
      generate: async () => {
        throw new Error("401 sk-secret-key");
      },
    };
    const r = await parseInvoiceRequest("Invoice x", { client, today: TODAY });
    expect(r).toEqual({
      status: "unavailable",
      fallback: "manual_entry",
      reason: "model_unavailable",
    });
    expect(JSON.stringify(r)).not.toContain("sk-secret");
  });
  it("rejects non-object / malformed model output", async () => {
    for (const bad of [null, "text", 42, {}]) {
      const r = await parseInvoiceRequest("Invoice x", { client: fake(bad), today: TODAY });
      expect(r.status).toBe("invalid");
    }
  });
  it("rejects empty and oversized input before calling the model", async () => {
    let called = false;
    const client: InvoiceModelClient = {
      generate: async () => {
        called = true;
        return {};
      },
    };
    expect((await parseInvoiceRequest("   ", { client, today: TODAY })).status).toBe("invalid");
    expect(
      (await parseInvoiceRequest("x".repeat(MAX_INPUT_CHARS + 1), { client, today: TODAY })).status,
    ).toBe("invalid");
    expect(called).toBe(false);
  });
  it("asks for clarification on a past due date", async () => {
    const out = {
      customerName: "A",
      customerEmail: "a@example.com",
      currency: "USD",
      lineItems: [{ description: "x", quantity: "1", unitPrice: "1" }],
      dueDate: "2026-01-01",
      taxPercent: null,
      discount: null,
    };
    const r = await parseInvoiceRequest("Invoice", { client: fake(out), today: TODAY });
    expect(r.status).toBe("needs_clarification");
  });
});
