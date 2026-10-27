import { describe, expect, it } from "vitest";
import { createInvoiceApi, saveBody } from "./api.js";
import { IDEMPOTENCY_KEY, newIdempotencyKey } from "./idempotency.js";
import type { InvoiceDraft } from "../domain/types.js";

/**
 * Objective: the browser sends exactly the strict draft with a valid per-attempt key and CSRF token,
 * and trusts nothing it receives. 201/200/409/400/422/401/403/5xx/network each map to one typed
 * result; an uncertain outcome is never reported as a failure; malformed success bodies fail closed.
 * All server replies below are SIMULATED.
 */
const draft: InvoiceDraft = {
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concepts", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2030-01-15",
  taxPercent: "8",
  discount: null,
};
const totals = {
  currency: "USD",
  lineTotals: ["500.00"],
  subtotal: "500.00",
  discount: "0.00",
  tax: "40.00",
  total: "540.00",
};
const ID = "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11";
const record = (over: Record<string, unknown> = {}) => ({
  id: ID,
  draft,
  totals,
  paypalInvoiceId: null,
  replayed: false,
  createdAt: "2026-10-27T10:00:00.000Z",
  ...over,
});
const detail = (over: Record<string, unknown> = {}) =>
  record({ paypal: { state: "none", paypalInvoiceId: null, lastErrorCode: null }, ...over });
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const KEY = "key_ABCDEFGH12345678";
const sig = () => new AbortController().signal;
const save = (res: () => Response | Promise<Response>, signal = sig()) =>
  createInvoiceApi(async () => res()).save(draft, KEY, "csrf", signal);
const get = (res: () => Response | Promise<Response>, id = ID, signal = sig()) =>
  createInvoiceApi(async () => res()).get(id, signal);

describe("idempotency keys", () => {
  it("are CSPRNG base64url strings matching the server contract and never repeat", () => {
    const keys = new Set(Array.from({ length: 500 }, newIdempotencyKey));
    expect(keys.size).toBe(500);
    for (const k of keys) expect(k).toMatch(IDEMPOTENCY_KEY);
  });
});

describe("createdAt must be a real UTC instant", () => {
  const BAD = [
    "2026-02-31T10:00:00.000Z",
    "2027-02-29T10:00:00.000Z", // not a leap year
    "2100-02-29T10:00:00.000Z", // century, not a leap year
    "2026-13-01T10:00:00.000Z",
    "2026-00-10T10:00:00.000Z",
    "2026-04-31T10:00:00.000Z",
    "2026-10-27T24:00:00.000Z", // Date.parse normalises this to the next day
    "2026-10-27T23:60:00.000Z",
    "2026-10-27T23:59:60.000Z",
    "2026-10-27T10:00:00.1234Z", // more than millisecond precision
    "2026-10-27T10:00:00+00:00", // not UTC "Z"
    "2026-10-27 10:00:00.000Z",
    "2026-10-27T10:00:00.000z",
    "2026-10-27",
    "",
  ];
  const GOOD = [
    "2026-10-27T10:00:00.000Z",
    "2028-02-29T00:00:00.000Z", // leap year
    "2000-02-29T23:59:59.999Z", // 400-year leap
    "2026-10-27T10:00:00Z", // no fraction
    "2026-10-27T10:00:00.1Z",
    "2026-12-31T23:59:59.999Z",
  ];
  it.each(BAD)("rejects %j in a 201 save response (uncertain/malformed)", async (t) => {
    expect(await save(() => reply(201, record({ createdAt: t })))).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
  });
  it.each(BAD)("rejects %j in a GET detail response (malformed)", async (t) => {
    expect(await get(() => reply(200, detail({ createdAt: t })))).toEqual({ kind: "malformed" });
  });
  it.each(GOOD)("accepts %j in both responses", async (t) => {
    expect((await save(() => reply(201, record({ createdAt: t })))).kind).toBe("saved");
    expect((await get(() => reply(200, detail({ createdAt: t })))).kind).toBe("ok");
  });
  it("rejects a non-string createdAt", async () => {
    expect(await save(() => reply(201, record({ createdAt: 1730000000000 })))).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
  });
});

describe("save request contract", () => {
  it("sends exactly the strict draft with credentials, no-store, key and CSRF header", async () => {
    let seen: { url: string; init: RequestInit & { headers: Record<string, string> } } | undefined;
    const api = createInvoiceApi(async (url, init) => {
      seen = { url, init: init as never };
      return reply(201, record());
    });
    const r = await api.save(draft, KEY, "csrf-1", sig());
    expect(r.kind).toBe("saved");
    expect(seen?.url).toBe("/api/invoice-drafts");
    const i = seen!.init;
    expect(i.method).toBe("POST");
    expect([i.credentials, i.cache, i.redirect]).toEqual(["same-origin", "no-store", "error"]);
    expect(i.headers).toEqual({
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-csrf-token": "csrf-1",
      "idempotency-key": KEY,
    });
    expect(Object.keys(JSON.parse(i.body as string)).sort()).toEqual(
      [
        "currency",
        "customerEmail",
        "customerName",
        "discount",
        "dueDate",
        "lineItems",
        "taxPercent",
      ].sort(),
    );
  });
  it("strips anything that is not part of the draft schema (totals, ids, fixture flags)", () => {
    const polluted = {
      ...draft,
      totals,
      id: ID,
      simulated: true,
      paypal: {},
      lineItems: [{ ...draft.lineItems[0]!, lineTotal: "1" }],
    };
    const body = saveBody(polluted as never);
    expect(JSON.stringify(body)).not.toMatch(/totals|simulated|paypal|lineTotal|"id"/);
  });
  it("refuses to send a malformed key and makes no request", async () => {
    let called = false;
    const r = await createInvoiceApi(async () => ((called = true), reply(201))).save(
      draft,
      "short",
      "c",
      sig(),
    );
    expect(r).toEqual({ kind: "rejected", messages: [] });
    expect(called).toBe(false);
  });
});

describe("save results", () => {
  it("201 created and 200 replayed carry the validated server record", async () => {
    const c = await save(() => reply(201, record()));
    expect(c).toMatchObject({
      kind: "saved",
      replayed: false,
      invoice: { id: ID, totals: { total: "540.00" } },
    });
    const p = await save(() => reply(200, record({ replayed: true })));
    expect(p).toMatchObject({ kind: "saved", replayed: true });
  });
  it("a 201 claiming replayed, or a 200 claiming creation, is uncertain/malformed", async () => {
    expect(await save(() => reply(201, record({ replayed: true })))).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
    expect(await save(() => reply(200, record({ replayed: false })))).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
  });
  const withoutTotals = (() => {
    const r = record() as Record<string, unknown>;
    delete r["totals"];
    return r;
  })();
  it.each<[string, unknown]>([
    ["extra key", record({ status: "approved" })],
    ["missing totals", withoutTotals],
    ["inconsistent total", record({ totals: { ...totals, total: "9999.99" } })],
    ["bad uuid", record({ id: "not-a-uuid" })],
    ["bad createdAt", record({ createdAt: "yesterday" })],
    ["non-boolean replayed", record({ replayed: "no" })],
    ["paypal object on a save response", detail()],
    ["unsupported currency", record({ draft: { ...draft, currency: "XYZ" } })],
    [
      "fractional JPY",
      record({
        draft: {
          ...draft,
          currency: "JPY",
          lineItems: [{ description: "x", quantity: "1", unitPrice: "1.5" }],
        },
        totals: { ...totals, currency: "JPY" },
      }),
    ],
  ])("rejects a success body with %s as uncertain/malformed", async (_n, body) => {
    expect(await save(() => reply(201, body))).toEqual({ kind: "uncertain", cause: "malformed" });
  });
  it("non-JSON success body is uncertain", async () => {
    expect(await save(() => new Response("<html>", { status: 201 }))).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
  });
  it("maps the documented errors", async () => {
    expect(await save(() => reply(409, { error: "idempotency_conflict" }))).toEqual({
      kind: "conflict",
    });
    expect(
      await save(() =>
        reply(400, {
          error: "invalid_request",
          issues: [{ path: "dueDate", message: "Bad date" }, { message: 5 }],
        }),
      ),
    ).toEqual({ kind: "rejected", messages: ["Bad date"] });
    expect(
      await save(() =>
        reply(422, { error: "invalid_draft", message: "Discount exceeds subtotal" }),
      ),
    ).toEqual({ kind: "invalid-draft", message: "Discount exceeds subtotal" });
    expect(await save(() => reply(401, {}))).toEqual({ kind: "unauthorized" });
    expect(await save(() => reply(403, { error: "csrf_invalid", secret: "LEAK" }))).toEqual({
      kind: "forbidden",
    });
  });
  it("a 5xx or a lost connection is UNCERTAIN, not a failure", async () => {
    expect(await save(() => reply(500))).toEqual({ kind: "uncertain", cause: "server" });
    expect(await save(() => reply(503))).toEqual({ kind: "uncertain", cause: "server" });
    expect(
      await createInvoiceApi(() => Promise.reject(new TypeError("x"))).save(draft, KEY, "c", sig()),
    ).toEqual({ kind: "uncertain", cause: "network" });
  });
  it("a caller abort is aborted, not uncertain", async () => {
    const ac = new AbortController();
    ac.abort();
    expect(
      await createInvoiceApi(() => Promise.reject(new DOMException("a", "AbortError"))).save(
        draft,
        KEY,
        "c",
        ac.signal,
      ),
    ).toEqual({ kind: "aborted" });
  });
});

describe("detail request and results", () => {
  it("is a credentialed, no-store GET of the opaque id only", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const r = await createInvoiceApi(
      async (url, init) => ((seen = { url, init }), reply(200, detail())),
    ).get(ID, sig());
    expect(r).toMatchObject({ kind: "ok", invoice: { id: ID, paypal: { state: "none" } } });
    expect(seen?.url).toBe(`/api/invoice-drafts/${ID}`);
    expect([
      seen?.init.method,
      seen?.init.credentials,
      seen?.init.cache,
      seen?.init.redirect,
    ]).toEqual(["GET", "same-origin", "no-store", "error"]);
    expect(seen?.init.body).toBeUndefined();
  });
  it("never requests a non-uuid id", async () => {
    let called = false;
    const r = await createInvoiceApi(async () => ((called = true), reply(200))).get(
      "../../auth/logout",
      sig(),
    );
    expect(r).toEqual({ kind: "not-found" });
    expect(called).toBe(false);
  });
  it("maps errors", async () => {
    expect(await get(() => reply(404, { error: "not_found" }))).toEqual({ kind: "not-found" });
    expect(await get(() => reply(401))).toEqual({ kind: "unauthorized" });
    expect(await get(() => reply(403))).toEqual({ kind: "forbidden" });
    expect(await get(() => reply(500))).toEqual({ kind: "unavailable" });
    expect(await createInvoiceApi(() => Promise.reject(new TypeError("x"))).get(ID, sig())).toEqual(
      { kind: "offline" },
    );
  });
  it.each<[string, unknown]>([
    ["no paypal object", record()],
    [
      "unknown paypal state",
      detail({ paypal: { state: "sent", paypalInvoiceId: null, lastErrorCode: null } }),
    ],
    [
      "paypal object with extra key",
      detail({ paypal: { state: "none", paypalInvoiceId: null, lastErrorCode: null, x: 1 } }),
    ],
    [
      "bad paypal invoice id",
      detail({ paypal: { state: "created", paypalInvoiceId: "<script>", lastErrorCode: null } }),
    ],
    ["inconsistent totals", detail({ totals: { ...totals, tax: "41.00" } })],
    ["a different record than requested", detail({ id: "11111111-1111-4111-8111-111111111111" })],
  ])("treats %s as malformed", async (_n, body) => {
    expect(await get(() => reply(200, body))).toEqual({ kind: "malformed" });
  });
  it("accepts a created PayPal state with a server-provided id", async () => {
    const r = await get(() =>
      reply(
        200,
        detail({
          paypalInvoiceId: "INV2-AAAA-BBBB",
          paypal: { state: "created", paypalInvoiceId: "INV2-AAAA-BBBB", lastErrorCode: null },
        }),
      ),
    );
    expect(r).toMatchObject({
      kind: "ok",
      invoice: { paypal: { state: "created", paypalInvoiceId: "INV2-AAAA-BBBB" } },
    });
  });
});
