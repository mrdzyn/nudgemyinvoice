import { describe, expect, it } from "vitest";
import {
  ApprovalError,
  payloadDigest,
  requireApproval,
  verifyApproval,
  type ApprovalGrant,
  type ApprovalStore,
} from "./approval.js";

const now = new Date("2026-10-24T12:00:00Z");
const payload = { invoiceId: "INV2-1", total: "500.00", currency: "USD" };
const grant = (over: Partial<ApprovalGrant> = {}): ApprovalGrant => ({
  id: "g1",
  action: "sendInvoice",
  resourceId: "INV2-1",
  payloadDigest: payloadDigest(payload),
  approverId: "human-1",
  expiresAt: new Date(now.getTime() + 60_000),
  consumedAt: null,
  ...over,
});
const req = { action: "sendInvoice" as const, resourceId: "INV2-1", payload };

function memStore(g: ApprovalGrant): ApprovalStore {
  let consumed = false;
  return {
    get: async () => g,
    consume: async () => (consumed ? false : ((consumed = true), true)),
  };
}

describe("approval verification", () => {
  it("accepts an exact, fresh, unconsumed grant", () =>
    expect(verifyApproval(grant(), req, now)).toEqual({ ok: true }));
  it.each([
    ["no grant", null, "no_approval"],
    ["expired", grant({ expiresAt: now }), "expired"],
    ["consumed", grant({ consumedAt: now }), "already_consumed"],
    ["wrong action", grant({ action: "cancelInvoice" }), "action_mismatch"],
    ["wrong resource", grant({ resourceId: "INV2-2" }), "resource_mismatch"],
  ])("rejects %s", (_n, g, reason) =>
    expect(verifyApproval(g, req, now)).toEqual({ ok: false, reason }),
  );
  it("rejects a changed payload (amount or currency)", () => {
    expect(
      verifyApproval(grant(), { ...req, payload: { ...payload, total: "5000.00" } }, now),
    ).toEqual({ ok: false, reason: "payload_changed" });
    expect(
      verifyApproval(grant(), { ...req, payload: { ...payload, currency: "EUR" } }, now),
    ).toEqual({ ok: false, reason: "payload_changed" });
  });
  it("digest is independent of key order", () => {
    expect(payloadDigest({ a: 1, b: 2 })).toBe(payloadDigest({ b: 2, a: 1 }));
  });
});

describe("requireApproval gate", () => {
  it("refuses with no approval id", async () => {
    await expect(requireApproval(memStore(grant()), undefined, req, now)).rejects.toBeInstanceOf(
      ApprovalError,
    );
  });
  it("allows once and blocks replay / double click", async () => {
    const store = memStore(grant());
    await expect(requireApproval(store, "g1", req, now)).resolves.toBeUndefined();
    await expect(requireApproval(store, "g1", req, now)).rejects.toMatchObject({
      reason: "already_consumed",
    });
  });
});
