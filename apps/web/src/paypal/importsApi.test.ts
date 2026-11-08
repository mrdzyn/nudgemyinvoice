import { describe, expect, it } from "vitest";
import { createImportsApi, parseImportsResponse, parseSyncResponse } from "./importsApi.js";

const CSRF = "c".repeat(43);
const sig = () => new AbortController().signal;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Call = { url: string; init: RequestInit };
const fake = (respond: (c: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const api = createImportsApi(async (url, init) => {
    calls.push({ url, init });
    return respond({ url, init });
  }, 5_000);
  return { api, calls };
};

const counts = { created: 2, updated: 1, unchanged: 3, skipped: 1, failed: 0 };
const item = {
  remoteInvoiceId: "INV2-DRAFT-1",
  invoiceNumber: "0001",
  currency: "USD",
  total: "5.00",
  dueDate: "2026-12-01",
  linkedInvoiceId: null,
  lastSyncedAt: "2026-11-08T12:00:00.000Z",
};

describe("parseSyncResponse", () => {
  it("accepts exact counts with consistent partial and truncated flags", () => {
    expect(
      parseSyncResponse({
        counts,
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: false,
        truncated: false,
      }),
    ).toEqual({ counts, partialFailure: false, truncated: false });
    expect(
      parseSyncResponse({
        counts,
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: true,
        truncated: true,
      }),
    ).toEqual({ counts, partialFailure: true, truncated: true });
  });
  it("rejects inconsistent flags, extra keys and negative counts", () => {
    expect(
      parseSyncResponse({
        counts,
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: true,
        truncated: false,
      }),
    ).toBeNull();
    // Truncation without the partial flag is a silent incomplete import.
    expect(
      parseSyncResponse({
        counts,
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: false,
        truncated: true,
      }),
    ).toBeNull();
    expect(
      parseSyncResponse({
        counts: { ...counts, failed: 2 },
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: false,
        truncated: false,
      }),
    ).toBeNull();
    // The old three-key envelope is no longer exact: truncation must be explicit.
    expect(
      parseSyncResponse({ counts, syncedAt: "2026-11-08T12:00:00.000Z", partialFailure: false }),
    ).toBeNull();
    expect(
      parseSyncResponse({
        counts: { ...counts, extra: 1 },
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: false,
        truncated: false,
      }),
    ).toBeNull();
    expect(
      parseSyncResponse({
        counts: { ...counts, created: -1 },
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: false,
        truncated: false,
      }),
    ).toBeNull();
  });
});

describe("parseImportsResponse", () => {
  it("accepts an exact items envelope with linked and unlinked rows", () => {
    expect(
      parseImportsResponse({
        items: [
          item,
          {
            ...item,
            remoteInvoiceId: "INV2-DRAFT-2",
            linkedInvoiceId: "11111111-1111-4111-8111-111111111111",
          },
        ],
      }),
    ).toHaveLength(2);
  });
  it("rejects unknown keys, bad ids, bad money and impossible dates", () => {
    expect(parseImportsResponse({ items: [{ ...item, extra: 1 }] })).toBeNull();
    expect(parseImportsResponse({ items: [{ ...item, remoteInvoiceId: "INV2/1" }] })).toBeNull();
    expect(parseImportsResponse({ items: [{ ...item, currency: "XXX" }] })).toBeNull();
    expect(parseImportsResponse({ items: [{ ...item, total: "5.000" }] })).toBeNull();
    expect(parseImportsResponse({ items: [{ ...item, total: "abc" }] })).toBeNull();
    expect(parseImportsResponse({ items: [{ ...item, dueDate: "2026-13-01" }] })).toBeNull();
    expect(
      parseImportsResponse({ items: [{ ...item, linkedInvoiceId: "not-a-uuid" }] }),
    ).toBeNull();
    expect(parseImportsResponse({ items: new Array(101).fill(item) })).toBeNull();
  });
});

describe("imports transport", () => {
  it("sync posts with CSRF and parses an exact ok answer", async () => {
    const { api, calls } = fake(() =>
      json(200, {
        counts,
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: false,
        truncated: false,
      }),
    );
    const r = await api.sync(CSRF, sig());
    expect(r).toEqual({ kind: "ok", counts, partialFailure: false, truncated: false });
    expect(calls[0]?.url).toBe("/api/paypal/imports/sync");
    expect(calls[0]?.init.method).toBe("POST");
    expect((calls[0]?.init.headers as Record<string, string>)["x-csrf-token"]).toBe(CSRF);
  });

  it("parses a truncated ok answer without treating it as clean", async () => {
    const { api } = fake(() =>
      json(200, {
        counts,
        syncedAt: "2026-11-08T12:00:00.000Z",
        partialFailure: true,
        truncated: true,
      }),
    );
    expect(await api.sync(CSRF, sig())).toEqual({
      kind: "ok",
      counts,
      partialFailure: true,
      truncated: true,
    });
  });

  it("maps audit_failed explicitly with its counts", async () => {
    const { api } = fake(() =>
      json(500, {
        error: "audit_failed",
        counts,
        syncedAt: "2026-11-08T12:00:00.000Z",
        truncated: false,
        partialFailure: true,
      }),
    );
    expect(await api.sync(CSRF, sig())).toEqual({ kind: "audit-failed", counts });
    const badCounts = fake(() =>
      json(500, { error: "audit_failed", counts: { ...counts, created: "many" } }),
    );
    expect(await badCounts.api.sync(CSRF, sig())).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
  });

  it("maps disabled, rate-limited, busy and uncertain answers", async () => {
    const { api } = fake(() => json(503, { error: "sync_disabled" }));
    expect(await api.sync(CSRF, sig())).toEqual({ kind: "disabled" });
    const limited = fake(() => json(429, { error: "too_many_requests" }));
    expect(await limited.api.sync(CSRF, sig())).toEqual({ kind: "rate-limited" });
    const busy = fake(() => json(429, { error: "busy" }));
    expect(await busy.api.sync(CSRF, sig())).toEqual({ kind: "busy" });
    const broken = fake(() => json(500, { error: "x" }));
    expect(await broken.api.sync(CSRF, sig())).toEqual({ kind: "uncertain", cause: "server" });
    const malformed = fake(() =>
      json(200, { counts, syncedAt: "2026-11-08T12:00:00.000Z", partialFailure: true }),
    );
    expect(await malformed.api.sync(CSRF, sig())).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
  });

  it("lists with a plain GET and validates rows", async () => {
    const { api, calls } = fake(() => json(200, { items: [item] }));
    const r = await api.list(sig());
    expect(r).toEqual({ kind: "ok", items: [item] });
    expect(calls[0]?.url).toBe("/api/paypal/imports");
    expect(calls[0]?.init.method).toBe("GET");
    const bad = fake(() => json(200, { items: [{ ...item, total: "oops" }] }));
    expect(await bad.api.list(sig())).toEqual({ kind: "malformed" });
    const off = fake(() => json(503, { error: "sync_disabled" }));
    expect(await off.api.list(sig())).toEqual({ kind: "disabled" });
  });

  it("never calls a money-moving PayPal path", async () => {
    const seen: string[] = [];
    const api = createImportsApi(async (url, init) => {
      seen.push(`${init.method} ${url}`);
      return json(200, { items: [] });
    });
    await api.list(sig());
    await api.sync(CSRF, sig()).catch(() => undefined);
    expect(seen.join(" ")).not.toMatch(/send|remind|cancel|refund|payment/i);
    expect(
      seen.every(
        (s) => s.startsWith("GET /api/paypal/imports") || s.startsWith("POST /api/paypal/imports"),
      ),
    ).toBe(true);
  });
});
