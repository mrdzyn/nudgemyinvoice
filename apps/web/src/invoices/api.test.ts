import { describe, expect, it } from "vitest";
import { createInvoiceApi, saveBody, type ListQuery } from "./api.js";
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
  it("accepts the sanitized operation error codes the backend really stores, including colons", async () => {
    for (const code of [
      "http_422:invalid_parameter_value",
      "timeout",
      "payload_digest_mismatch",
      "created_not_visible",
    ]) {
      const r = await get(() =>
        reply(
          200,
          detail({ paypal: { state: "rejected", paypalInvoiceId: null, lastErrorCode: code } }),
        ),
      );
      expect(r, code).toMatchObject({
        kind: "ok",
        invoice: { paypal: { state: "rejected", lastErrorCode: code } },
      });
    }
    for (const bad of ["<b>x</b>", "has space", "a".repeat(81), ""]) {
      expect(
        await get(() =>
          reply(
            200,
            detail({ paypal: { state: "rejected", paypalInvoiceId: null, lastErrorCode: bad } }),
          ),
        ),
      ).toEqual({ kind: "malformed" });
    }
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

describe("list request and results", () => {
  const row = (n: number, over: Record<string, unknown> = {}) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    customerName: `Customer ${n}`,
    customerEmail: `c${n}@example.test`,
    currency: "USD",
    dueDate: "2030-01-15",
    total: "500.00",
    createdAt: `2026-10-27T10:00:0${9 - n}.000Z`,
    paypal: { state: "none" },
    ...over,
  });
  const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
  const q: ListQuery = { limit: 3, cursor: null, currency: null, status: null, q: null };
  const CSRF = "csrf-token-for-tests";
  const list = (res: () => Response | Promise<Response>, query = q, signal = sig()) =>
    createInvoiceApi(async () => res()).list(query, CSRF, signal);

  it("is a credentialed, no-store, CSRF-protected POST whose URL is fixed and whose body carries the whole query", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const r = await createInvoiceApi(
      async (url, init) => ((seen = { url, init }), reply(200, page([row(1)]))),
    ).list(
      { limit: 20, cursor: "abc_DEF-1", currency: "EUR", status: "created", q: "Zeta & Co/100%" },
      CSRF,
      sig(),
    );
    expect(r.kind).toBe("ok");
    // privacy: the URL is the fixed path with no query string, so no request-URL log can hold the term
    expect(seen?.url).toBe("/api/invoice-drafts/search");
    expect(seen?.url).not.toMatch(/[?=&]|Zeta|Co/);
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      limit: 20,
      cursor: "abc_DEF-1",
      currency: "EUR",
      status: "created",
      q: "Zeta & Co/100%",
    });
    expect([
      seen?.init.method,
      seen?.init.credentials,
      seen?.init.cache,
      seen?.init.redirect,
    ]).toEqual(["POST", "same-origin", "no-store", "error"]);
    expect(seen?.init.headers).toEqual({
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-csrf-token": CSRF,
    });
  });
  it("omits fields that are not set from the body", async () => {
    let body = "";
    await createInvoiceApi(
      async (_u, init) => ((body = String(init.body)), reply(200, page([]))),
    ).list(q, CSRF, sig());
    expect(JSON.parse(body)).toEqual({ limit: 3 });
  });
  it("returns the validated page, newest first, and a cursor only after a full page", async () => {
    const r = await list(() => reply(200, page([row(1), row(2), row(3)], "next_cursor_1")));
    expect(r).toMatchObject({ kind: "ok", page: { nextCursor: "next_cursor_1" } });
    if (r.kind === "ok")
      expect(r.page.items.map((i) => i.customerName)).toEqual([
        "Customer 1",
        "Customer 2",
        "Customer 3",
      ]);
    expect(await list(() => reply(200, page([])))).toMatchObject({
      kind: "ok",
      page: { items: [], nextCursor: null },
    });
  });
  it("accepts JPY without decimals and equal millisecond timestamps", async () => {
    const r = await list(() =>
      reply(
        200,
        page([
          row(1, { currency: "JPY", total: "2200" }),
          row(2, { currency: "JPY", total: "0", createdAt: "2026-10-27T10:00:08.000Z" }),
        ]),
      ),
    );
    expect(r.kind).toBe("ok");
  });
  it("maps the documented statuses", async () => {
    expect(await list(() => reply(401))).toEqual({ kind: "unauthorized" });
    expect(await list(() => reply(403, { secret: "LEAK" }))).toEqual({ kind: "forbidden" });
    expect(await list(() => reply(400, { error: "invalid_query" }))).toEqual({ kind: "rejected" });
    expect(await list(() => reply(500))).toEqual({ kind: "unavailable" });
    expect(await list(() => reply(503))).toEqual({ kind: "unavailable" });
    expect(
      await createInvoiceApi(() => Promise.reject(new TypeError("x"))).list(q, CSRF, sig()),
    ).toEqual({ kind: "offline" });
    const ac = new AbortController();
    ac.abort();
    expect(
      await createInvoiceApi(() => Promise.reject(new DOMException("a", "AbortError"))).list(
        q,
        CSRF,
        ac.signal,
      ),
    ).toEqual({ kind: "aborted" });
  });
  const dup = row(1);
  it.each<[string, unknown]>([
    ["extra top-level key", { ...page([row(1)]), total: 5 }],
    ["missing nextCursor", { items: [row(1)] }],
    ["items not an array", { items: {}, nextCursor: null }],
    ["more items than requested", page([row(1), row(2), row(3), row(4)])],
    ["extra item key (digest)", page([{ ...row(1), draftDigest: "x" }])],
    [
      "missing item key",
      page([
        (() => {
          const r = row(1) as Record<string, unknown>;
          delete r["dueDate"];
          return r;
        })(),
      ]),
    ],
    ["bad uuid", page([row(1, { id: "nope" })])],
    ["empty customer name", page([row(1, { customerName: "" })])],
    ["bad email", page([row(1, { customerEmail: "nope" })])],
    ["unsupported currency", page([row(1, { currency: "XYZ" })])],
    ["impossible due date", page([row(1, { dueDate: "2030-02-31" })])],
    ["USD total with 3 decimals", page([row(1, { total: "1.005" })])],
    ["USD total without decimals", page([row(1, { total: "500" })])],
    ["JPY total with decimals", page([row(1, { currency: "JPY", total: "500.00" })])],
    ["leading zeros", page([row(1, { total: "05.00" })])],
    ["numeric total", page([row(1, { total: 500 })])],
    ["negative total", page([row(1, { total: "-5.00" })])],
    ["impossible createdAt", page([row(1, { createdAt: "2026-02-31T10:00:00.000Z" })])],
    ["24:00 createdAt", page([row(1, { createdAt: "2026-10-27T24:00:00.000Z" })])],
    ["unknown PayPal state", page([row(1, { paypal: { state: "sent" } })])],
    [
      "PayPal object with extra key",
      page([row(1, { paypal: { state: "none", paypalInvoiceId: "INV2-X" } })]),
    ],
    ["duplicate id in a page", page([dup, { ...dup }])],
    [
      "not newest first",
      page([
        row(8, { createdAt: "2026-10-27T10:00:01.000Z" }),
        row(9, { createdAt: "2026-10-27T10:00:05.000Z" }),
      ]),
    ],
    ["cursor on a short page", page([row(1)], "next_cursor_1")],
    ["cursor with illegal characters", page([row(1), row(2), row(3)], "bad cursor!")],
    ["oversized cursor", page([row(1), row(2), row(3)], "A".repeat(121))],
    ["non-string cursor", page([row(1), row(2), row(3)], 7 as never)],
  ])("fails closed on %s", async (_n, body) => {
    expect(await list(() => reply(200, body))).toEqual({ kind: "malformed" });
  });
  it("rejects a cursor that does not move (would loop on the same page)", async () => {
    expect(
      await list(() => reply(200, page([row(1), row(2), row(3)], "same_cursor")), {
        ...q,
        cursor: "same_cursor",
      }),
    ).toEqual({ kind: "malformed" });
  });
  it("non-JSON 200 is malformed", async () => {
    expect(await list(() => new Response("<html>", { status: 200 }))).toEqual({
      kind: "malformed",
    });
  });
});

describe("PayPal Sandbox draft transport (POST /api/invoice-drafts/:id/paypal-draft)", () => {
  const PID = "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11";
  const ok = { paypalInvoiceId: "INV2-ABCD-1234", status: "DRAFT", replayed: false };
  const post = (res: () => Response | Promise<Response>, signal = sig()) =>
    createInvoiceApi(async () => res()).createPayPalDraft(PID, "csrf-9", signal);

  it("is a credentialed, no-store POST of the opaque id with the CSRF header and no body", async () => {
    let seen: { url: string; init: RequestInit & { headers: Record<string, string> } } | undefined;
    const r = await createInvoiceApi(async (url, init) => {
      seen = { url, init: init as never };
      return reply(201, ok);
    }).createPayPalDraft(PID, "csrf-9", sig());
    expect(r).toEqual({ kind: "created", paypalInvoiceId: "INV2-ABCD-1234", replayed: false });
    expect(seen?.url).toBe(`/api/invoice-drafts/${PID}/paypal-draft`);
    const i = seen!.init;
    expect([i.method, i.credentials, i.cache, i.redirect]).toEqual([
      "POST",
      "same-origin",
      "no-store",
      "error",
    ]);
    expect(i.headers).toEqual({ "cache-control": "no-store", "x-csrf-token": "csrf-9" });
    expect(i.body).toBeUndefined();
  });
  it("never requests a non-uuid id (no request at all)", async () => {
    let called = false;
    const r = await createInvoiceApi(
      async () => ((called = true), reply(201, ok)),
    ).createPayPalDraft("../../auth/logout", "c", sig());
    expect(r).toEqual({ kind: "not-found" });
    expect(called).toBe(false);
  });
  it("201 is created now and 200 is an existing draft (replayed)", async () => {
    expect(await post(() => reply(201, ok))).toMatchObject({ kind: "created", replayed: false });
    expect(await post(() => reply(200, { ...ok, replayed: true }))).toMatchObject({
      kind: "created",
      replayed: true,
    });
  });
  it.each<[string, number, unknown]>([
    ["201 claiming replayed", 201, { ...ok, replayed: true }],
    ["200 claiming it was just created", 200, { ...ok, replayed: false }],
    ["extra key", 201, { ...ok, sent: true }],
    ["missing replayed", 201, { paypalInvoiceId: "INV2-ABCD-1234", status: "DRAFT" }],
    ["status SENT", 201, { ...ok, status: "SENT" }],
    ["status lowercase", 201, { ...ok, status: "draft" }],
    ["empty invoice id", 201, { ...ok, paypalInvoiceId: "" }],
    ["markup in the invoice id", 201, { ...ok, paypalInvoiceId: "<img src=x>" }],
    ["numeric invoice id", 201, { ...ok, paypalInvoiceId: 5 }],
    ["overlong invoice id", 201, { ...ok, paypalInvoiceId: "A".repeat(65) }],
    ["non-boolean replayed", 201, { ...ok, replayed: "no" }],
    ["array body", 201, []],
    ["empty object (an arbitrary 200)", 200, {}],
    ["the C3 save record shape", 200, { id: PID, replayed: true }],
  ])("a success status with %s is UNCERTAIN, never a created draft", async (_n, status, body) => {
    expect(await post(() => reply(status, body))).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
  });
  it("a non-JSON success body is uncertain", async () => {
    expect(await post(() => new Response("<html>", { status: 201 }))).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
    expect(await post(() => new Response(null, { status: 200 }))).toEqual({
      kind: "uncertain",
      cause: "malformed",
    });
  });
  it("maps every documented error status and body", async () => {
    expect(await post(() => reply(409, { error: "in_progress" }))).toEqual({ kind: "in-progress" });
    expect(await post(() => reply(409, { error: "reconciliation_pending" }))).toEqual({
      kind: "reconciliation-pending",
    });
    expect(
      await post(() => reply(422, { error: "mapping_refused", reason: "rounding_required_tax" })),
    ).toEqual({
      kind: "mapping-refused",
      reason: "rounding_required_tax",
    });
    expect(
      await post(() => reply(502, { error: "paypal_mismatch", code: "payload_digest_mismatch" })),
    ).toEqual({
      kind: "paypal-mismatch",
      code: "payload_digest_mismatch",
    });
    expect(
      await post(() => reply(502, { error: "paypal_rejected", code: "paypal_validation_error" })),
    ).toEqual({
      kind: "paypal-rejected",
      code: "paypal_validation_error",
    });
    expect(
      await post(() => reply(502, { error: "paypal_outcome_unknown", code: "timeout" })),
    ).toEqual({
      kind: "paypal-unknown",
      code: "timeout",
    });
    expect(await post(() => reply(503, { error: "paypal_disabled" }))).toEqual({
      kind: "disabled",
    });
    expect(await post(() => reply(503, { error: "unavailable" }))).toEqual({ kind: "unavailable" });
    expect(await post(() => reply(404, { error: "not_found" }))).toEqual({ kind: "not-found" });
    expect(await post(() => reply(401, { error: "unauthorized" }))).toEqual({
      kind: "unauthorized",
    });
    expect(await post(() => reply(403, { error: "csrf_invalid", secret: "LEAK" }))).toEqual({
      kind: "forbidden",
    });
    expect(await post(() => reply(400, { error: "invalid_request" }))).toEqual({
      kind: "bad-request",
    });
  });
  it("every refusal reason the backend can send is understood; an unknown reason fails closed", async () => {
    for (const reason of [
      "rounding_required_line",
      "rounding_required_tax",
      "rounding_required_discount",
      "tax_with_discount_multiline",
      "due_date_past",
      "invalid_invoice_date",
    ])
      expect(await post(() => reply(422, { error: "mapping_refused", reason }))).toEqual({
        kind: "mapping-refused",
        reason,
      });
    expect(await post(() => reply(422, { error: "mapping_refused", reason: "<script>" }))).toEqual({
      kind: "bad-request",
    });
    expect(await post(() => reply(422, { error: "other" }))).toEqual({ kind: "bad-request" });
  });
  it("diagnostic codes are kept only when short and safe", async () => {
    expect(await post(() => reply(502, { error: "paypal_rejected", code: "<b>x</b>" }))).toEqual({
      kind: "paypal-rejected",
      code: null,
    });
    expect(await post(() => reply(502, { error: "paypal_outcome_unknown" }))).toEqual({
      kind: "paypal-unknown",
      code: null,
    });
    expect(
      await post(() => reply(502, { error: "paypal_mismatch", code: "A".repeat(65) })),
    ).toEqual({
      kind: "paypal-mismatch",
      code: null,
    });
  });
  it("unexpected status/body combinations never become a success", async () => {
    expect(await post(() => reply(409, { error: "something_else" }))).toEqual({
      kind: "bad-request",
    });
    expect(await post(() => reply(409, {}))).toEqual({ kind: "bad-request" });
    expect(await post(() => reply(502, { error: "weird" }))).toEqual({
      kind: "uncertain",
      cause: "server",
    });
    expect(await post(() => reply(503, { error: "weird" }))).toEqual({
      kind: "uncertain",
      cause: "server",
    });
    expect(await post(() => reply(500))).toEqual({ kind: "uncertain", cause: "server" });
    expect(await post(() => reply(504))).toEqual({ kind: "uncertain", cause: "server" });
    expect(await post(() => reply(418))).toEqual({ kind: "bad-request" });
    expect(await post(() => reply(202, ok))).toEqual({ kind: "bad-request" });
  });
  it("a lost connection is UNCERTAIN; a caller abort is aborted", async () => {
    expect(
      await createInvoiceApi(() => Promise.reject(new TypeError("x"))).createPayPalDraft(
        PID,
        "c",
        sig(),
      ),
    ).toEqual({ kind: "uncertain", cause: "network" });
    const ac = new AbortController();
    ac.abort();
    expect(
      await createInvoiceApi(() =>
        Promise.reject(new DOMException("a", "AbortError")),
      ).createPayPalDraft(PID, "c", ac.signal),
    ).toEqual({ kind: "aborted" });
  });
});
