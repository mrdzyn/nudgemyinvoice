import { describe, expect, it } from "vitest";
import { sanitizeAuditDetail } from "./audit.js";

describe("sanitizeAuditDetail", () => {
  it("keeps only closed-set keys with safe values", () => {
    expect(
      sanitizeAuditDetail({
        reason: "bad_credentials",
        usernameKnown: true,
        approvalId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        privilegedAction: "sendInvoice",
        invoiceId: "33333333-3333-4333-8333-333333333333",
        state: "created",
      }),
    ).toEqual({
      invoiceId: "33333333-3333-4333-8333-333333333333",
      state: "created",
      reason: "bad_credentials",
      usernameKnown: true,
      approvalId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      privilegedAction: "sendInvoice",
    });
  });

  it("drops credentials, tokens, emails, cookies, prompts and any unknown key", () => {
    const out = sanitizeAuditDetail({
      password: "hunter2",
      token: "abc",
      csrf: "def",
      cookie: "nmi_session=x",
      customerEmail: "a@b.example",
      prompt: "Invoice Acme",
      invoice: { total: "5" },
    } as never);
    expect(out).toEqual({});
  });

  it("rejects unsafe values for allowed keys instead of storing them", () => {
    expect(sanitizeAuditDetail({ reason: "a@b.example" })).toEqual({});
    expect(sanitizeAuditDetail({ reason: "x".repeat(65) })).toEqual({});
    expect(sanitizeAuditDetail({ reason: "has space" })).toEqual({});
    expect(sanitizeAuditDetail({ approvalId: "not-a-uuid" })).toEqual({});
    expect(sanitizeAuditDetail({ privilegedAction: "autoApprove" })).toEqual({});
    expect(sanitizeAuditDetail({ usernameKnown: "yes" as never })).toEqual({});
    expect(sanitizeAuditDetail({ invoiceId: "INV2-REMOTE" })).toEqual({});
    expect(sanitizeAuditDetail({ state: "billing@acme.example" })).toEqual({});
    expect(sanitizeAuditDetail({ state: "has space" })).toEqual({});
    expect(sanitizeAuditDetail(undefined)).toEqual({});
  });
});
