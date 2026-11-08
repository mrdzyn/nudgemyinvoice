import { describe, expect, it } from "vitest";
import { ForbiddenPayPalOperation, guardRequest } from "./http.js";

const H = "https://api-m.sandbox.paypal.com";

describe("PayPal request guard (allowlist)", () => {
  it.each([
    ["POST", "/v1/oauth2/token"],
    ["POST", "/v2/invoicing/invoices"],
    ["GET", "/v2/invoicing/invoices/INV2-ABCD-1234"],
    ["GET", "/v2/invoicing/invoices?page=1&page_size=20&total_required=true"],
    ["GET", "/v2/invoicing/invoices?page=3&page_size=5&total_required=true"],
    ["POST", "/v2/invoicing/search-invoices?page=1&page_size=20&total_required=true"],
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

  it.each([
    "",
    "?page=1&page_size=20",
    "?page=1&page_size=20&total_required=false",
    "?page=2&page_size=20&total_required=true",
    "?page=1&page_size=21&total_required=true",
    "?page=1&page_size=20&total_required=true&page=1",
    "?page=1&page_size=20&total_required=true&invoice_number=controlled",
    "?page=1%ZZ&page_size=20&total_required=true",
    "?page_size=20&page=1&total_required=true",
    "?page=1&page_size=20&total_required=true ",
  ])("refuses noncanonical search query %j", (query) => {
    expect(() => guardRequest("POST", `${H}/v2/invoicing/search-invoices${query}`)).toThrow(
      ForbiddenPayPalOperation,
    );
  });

  it.each([
    "",
    "?page=0&page_size=20&total_required=true",
    "?page=1&page_size=0&total_required=true",
    "?page=1&page_size=21&total_required=true",
    "?page=1&page_size=20&total_required=false",
    "?page=1&page_size=20",
    "?page_size=20&page=1&total_required=true",
    "?page=1&page_size=20&total_required=true&invoice_number=x",
    "?page=1&page_size=20&total_required=true&page=1",
  ])("refuses noncanonical list query %j", (query) => {
    expect(() => guardRequest("GET", `${H}/v2/invoicing/invoices${query}`)).toThrow(
      ForbiddenPayPalOperation,
    );
  });

  it("refuses money-moving paths even with a valid list query shape", () => {
    for (const p of [
      "/v2/invoicing/invoices/INV2-1/send?page=1&page_size=20&total_required=true",
      "/v2/invoicing/invoices/INV2-1/payments?page=1&page_size=20&total_required=true",
    ]) {
      expect(() => guardRequest("GET", H + p)).toThrow(ForbiddenPayPalOperation);
      expect(() => guardRequest("POST", H + p)).toThrow(ForbiddenPayPalOperation);
    }
  });
});
