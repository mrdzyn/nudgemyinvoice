import { describe, expect, it } from "vitest";
import { ForbiddenPayPalOperation, guardRequest } from "./http.js";

const H = "https://api-m.sandbox.paypal.com";

describe("PayPal request guard (allowlist)", () => {
  it.each([
    ["POST", "/v1/oauth2/token"],
    ["POST", "/v2/invoicing/invoices"],
    ["GET", "/v2/invoicing/invoices/INV2-ABCD-1234"],
    ["POST", "/v2/invoicing/search-invoices"],
  ])("allows %s %s", (m, p) => expect(() => guardRequest(m, H + p)).not.toThrow());

  it.each([
    ["POST", "/v2/invoicing/invoices/INV2-1/send"],
    ["POST", "/v2/invoicing/invoices/INV2-1/remind"],
    ["POST", "/v2/invoicing/invoices/INV2-1/cancel"],
    ["POST", "/v2/invoicing/invoices/INV2-1/payments"],
    ["POST", "/v2/invoicing/invoices/INV2-1/refunds"],
    ["POST", "/v2/invoicing/invoices/INV2-1/generate-qr-code"],
    ["PUT", "/v2/invoicing/invoices/INV2-1"],
    ["DELETE", "/v2/invoicing/invoices/INV2-1"],
    ["DELETE", "/v2/invoicing/invoices/INV2-1/payments/T1"],
    ["POST", "/v2/invoicing/recurring-invoices"],
    ["POST", "/v2/invoicing/setup-reminders"],
    ["POST", "/v2/invoicing/invoices/INV2-1"],
    ["GET", "/v2/invoicing/invoices"],
    ["GET", "/v2/invoicing/invoices/INV2-1/send"],
    ["GET", "/v2/invoicing/invoices/../../v1/payments/payment"],
    ["GET", "/v2/invoicing/invoices/INV2%2F1/send"],
    ["POST", "/v2/checkout/orders"],
    ["POST", "/v2/payments/captures/X/refund"],
  ])("refuses %s %s", (m, p) =>
    expect(() => guardRequest(m, H + p)).toThrow(ForbiddenPayPalOperation),
  );

  it.each([
    "https://api-m.paypal.com/v2/invoicing/invoices",
    "https://api.sandbox.paypal.com/v2/invoicing/invoices",
    "https://api-m.sandbox.paypal.com.evil.example/v2/invoicing/invoices",
    "http://api-m.sandbox.paypal.com/v2/invoicing/invoices",
    "https://api-m.sandbox.paypal.com:8443/v2/invoicing/invoices",
    "https://user:pw@api-m.sandbox.paypal.com/v2/invoicing/invoices",
    "https://api-m.sandbox.paypal.com/v2/invoicing/invoices?x=1",
    "https://api-m.sandbox.paypal.com/v2/invoicing/invoices#frag",
    "not a url",
    "",
  ])("refuses live, foreign or malformed url %j", (u) =>
    expect(() => guardRequest("POST", u)).toThrow(ForbiddenPayPalOperation),
  );
});
