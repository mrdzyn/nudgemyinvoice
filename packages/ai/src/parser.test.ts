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

describe("reference date validation", () => {
  const good = {
    customerName: "A",
    customerEmail: "a@example.com",
    currency: "USD",
    lineItems: [{ description: "x", quantity: "1", unitPrice: "1" }],
    dueDate: "2026-02-28",
    taxPercent: null,
    discount: null,
  };

  it.each([
    "",
    "2026-1-1",
    "26-01-01",
    "2026/01/01",
    "2026-01-01T00:00:00Z",
    " 2026-01-01",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "2027-02-29",
    "tomorrow",
    "20260101",
  ])("rejects malformed/impossible today %j without calling the model", async (today) => {
    let called = false;
    const client: InvoiceModelClient = {
      generate: async () => ((called = true), good),
    };
    const r = await parseInvoiceRequest("Invoice x", { client, today });
    expect(r).toEqual({
      status: "invalid",
      errors: [{ path: "today", message: "Reference date must be a valid YYYY-MM-DD date" }],
    });
    expect(called).toBe(false);
  });

  it.each([undefined, null, 20260101, {}])(
    "does not throw on non-string today %j",
    async (today) => {
      const r = await parseInvoiceRequest("Invoice x", {
        client: fake(good),
        today: today as never,
      });
      expect(r.status).toBe("invalid");
    },
  );

  it("accepts valid boundaries (leap day, year end) and treats due date == today as not past", async () => {
    for (const today of ["2028-02-29", "2026-12-31", "2026-02-28", "0001-01-01"]) {
      const r = await parseInvoiceRequest("Invoice x", {
        client: fake({ ...good, dueDate: today === "0001-01-01" ? "0001-01-02" : today }),
        today,
      });
      expect(r.status).toBe("draft");
    }
  });

  it("rejects an impossible due date from the model", async () => {
    const r = await parseInvoiceRequest("Invoice x", {
      client: fake({ ...good, dueDate: "2026-02-30" }),
      today: TODAY,
    });
    expect(r.status).toBe("invalid");
  });
});
