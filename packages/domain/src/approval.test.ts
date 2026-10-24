import { describe, expect, it } from "vitest";
import {
  ApprovalError,
  asTrustedActor,
  payloadDigest,
  requireApproval,
  verifyApproval,
  type ApprovalGrant,
  type ApprovalStore,
  type PrivilegedRequest,
} from "./approval.js";
import { InMemoryApprovalStore } from "./in-memory-approval-store.js";

const now = new Date("2026-10-24T12:00:00Z");
const payload = { invoiceId: "INV2-1", total: "500.00", currency: "USD" };
const human = asTrustedActor("human-1");
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
const req = (over: Partial<PrivilegedRequest> = {}): PrivilegedRequest => ({
  action: "sendInvoice",
  resourceId: "INV2-1",
  payload,
  actor: human,
  ...over,
});
const seeded = (g = grant()) => {
  const s = new InMemoryApprovalStore();
  s.insert(g);
  return s;
};

describe("verifyApproval", () => {
  it("accepts an exact, fresh, unconsumed grant for the matching trusted actor", () =>
    expect(verifyApproval(grant(), req(), now)).toEqual({ ok: true }));

  it.each([
    ["no grant", null, req(), "no_approval"],
    ["expired", grant({ expiresAt: now }), req(), "expired"],
    ["consumed", grant({ consumedAt: now }), req(), "already_consumed"],
    ["wrong action", grant({ action: "cancelInvoice" }), req(), "action_mismatch"],
    ["wrong resource", grant({ resourceId: "INV2-2" }), req(), "resource_mismatch"],
    ["wrong approver", grant({ approverId: "human-2" }), req(), "approver_mismatch"],
    ["missing actor", grant(), req({ actor: undefined }), "untrusted_actor"],
    [
      "forged actor shape (not human)",
      grant(),
      req({ actor: { kind: "model", id: "human-1" } as never }),
      "untrusted_actor",
    ],
    [
      "empty actor id",
      grant({ approverId: "" }),
      req({ actor: asTrustedActor("") }),
      "untrusted_actor",
    ],
    [
      "changed amount",
      grant(),
      req({ payload: { ...payload, total: "5000.00" } }),
      "payload_changed",
    ],
    [
      "changed currency",
      grant(),
      req({ payload: { ...payload, currency: "EUR" } }),
      "payload_changed",
    ],
  ])("rejects %s", (_n, g, r, reason) =>
    expect(verifyApproval(g, r, now)).toEqual({ ok: false, reason }),
  );

  it("digest is independent of key order", () => {
    expect(payloadDigest({ a: 1, b: 2 })).toBe(payloadDigest({ b: 2, a: 1 }));
  });
});

describe("requireApproval gate", () => {
  it("refuses with no approval id", async () => {
    await expect(requireApproval(seeded(), undefined, req(), now)).rejects.toMatchObject({
      reason: "no_approval",
    });
  });

  it("refuses a missing authenticated approver without touching the store", async () => {
    let touched = false;
    const spy: ApprovalStore = {
      get: async () => ((touched = true), grant()),
      consumeIfMatches: async () => ((touched = true), true),
    };
    await expect(requireApproval(spy, "g1", req({ actor: undefined }), now)).rejects.toMatchObject({
      reason: "untrusted_actor",
    });
    expect(touched).toBe(false);
  });

  it("refuses a different authenticated approver and leaves the grant unconsumed", async () => {
    const store = seeded();
    const intruder = req({ actor: asTrustedActor("human-2") });
    await expect(requireApproval(store, "g1", intruder, now)).rejects.toMatchObject({
      reason: "approver_mismatch",
    });
    await expect(requireApproval(store, "g1", req(), now)).resolves.toBeUndefined();
  });

  it("refuses a changed payload and leaves the grant usable for the approved payload", async () => {
    const store = seeded();
    const tampered = req({ payload: { ...payload, total: "5000.00" } });
    await expect(requireApproval(store, "g1", tampered, now)).rejects.toMatchObject({
      reason: "payload_changed",
    });
    expect((await store.get("g1"))?.consumedAt).toBeNull();
  });

  it("refuses expired and previously consumed grants", async () => {
    await expect(
      requireApproval(seeded(grant({ expiresAt: now })), "g1", req(), now),
    ).rejects.toMatchObject({ reason: "expired" });
    await expect(
      requireApproval(seeded(grant({ consumedAt: now })), "g1", req(), now),
    ).rejects.toMatchObject({ reason: "already_consumed" });
  });

  it("allows once and blocks replay / double click", async () => {
    const store = seeded();
    await expect(requireApproval(store, "g1", req(), now)).resolves.toBeUndefined();
    await expect(requireApproval(store, "g1", req(), now)).rejects.toMatchObject({
      reason: "already_consumed",
    });
  });

  it("rejects when atomic consumption fails", async () => {
    const failing: ApprovalStore = {
      get: async () => grant(),
      consumeIfMatches: async () => false,
    };
    await expect(requireApproval(failing, "g1", req(), now)).rejects.toMatchObject({
      reason: "consume_failed",
    });
  });

  it("two concurrent attempts cannot both succeed", async () => {
    const store = seeded();
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => requireApproval(store, "g1", req(), now)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(24);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ApprovalError);
  });

  it("a grant mutated between read and consume cannot authorize the request", async () => {
    for (const patch of [
      { payloadDigest: payloadDigest({ other: true }) },
      { approverId: "human-9" },
      { resourceId: "INV2-OTHER" },
      { action: "refundPayment" as const },
      { expiresAt: new Date(now.getTime() - 1) },
      { consumedAt: now },
    ]) {
      const store = seeded();
      const racing: ApprovalStore = {
        get: async (id) => {
          const inspected = await store.get(id); // looked fine when inspected
          store.mutate(id, patch); // then another writer changes the row
          return inspected;
        },
        consumeIfMatches: (e) => store.consumeIfMatches(e),
      };
      await expect(requireApproval(racing, "g1", req(), now)).rejects.toMatchObject({
        reason: "consume_failed",
      });
    }
  });

  it("store copies cannot be used to alter stored state", async () => {
    const store = seeded();
    const copy = (await store.get("g1")) as ApprovalGrant;
    copy.payloadDigest = payloadDigest({ attacker: true });
    expect((await store.get("g1"))?.payloadDigest).toBe(payloadDigest(payload));
  });
});
