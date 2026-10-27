import { describe, expect, it } from "vitest";
import { createParseApi, validateParseOutcome, type ParseResult } from "./api.js";

/**
 * Objective: the browser trusts nothing in the parse response. Every documented 200 outcome is
 * accepted only in its exact shape; every other status maps to a typed, fail-closed result; and the
 * request is exactly the contract (relative URL, JSON `{text}`, CSRF header, no cookies handled
 * here). All responses below are SIMULATED server replies; no provider is involved.
 */
const draft = {
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concepts", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-12-15",
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
const ok = { status: "draft", draft, totals };
const clone = <T>(v: T): T => structuredClone(v);

describe("validateParseOutcome: accepted shapes", () => {
  it("accepts a draft with totals", () => {
    expect(validateParseOutcome(ok)).toEqual(ok);
  });
  it("accepts a draft with a discount and no tax", () => {
    const d = clone(ok);
    d.draft.taxPercent = null as never;
    (d.draft as { discount: unknown }).discount = { kind: "percent", value: "10" };
    expect(validateParseOutcome(d)?.status).toBe("draft");
  });
  it("accepts clarification, invalid and unavailable", () => {
    const q = {
      status: "needs_clarification",
      questions: [{ field: "dueDate", question: "When?" }],
    };
    const i = { status: "invalid", errors: [{ path: "currency", message: "Unsupported" }] };
    const u = { status: "unavailable", fallback: "manual_entry", reason: "ai_not_configured" };
    expect(validateParseOutcome(q)).toEqual(q);
    expect(validateParseOutcome(i)).toEqual(i);
    expect(validateParseOutcome(u)).toEqual(u);
  });
});

describe("validateParseOutcome: fails closed", () => {
  const mutate = (f: (o: typeof ok) => void) => {
    const o = clone(ok);
    f(o);
    return o;
  };
  it.each<[string, unknown]>([
    ["null", null],
    ["array", []],
    ["unknown status", { status: "approved" }],
    ["extra top-level key", { ...ok, action: "send" }],
    ["missing totals", { status: "draft", draft }],
    ["extra draft key", mutate((o) => ((o.draft as Record<string, unknown>)["total"] = "1"))],
    ["unsupported currency", mutate((o) => ((o.draft as { currency: string }).currency = "XYZ"))],
    [
      "float quantity",
      mutate((o) => ((o.draft.lineItems[0] as { quantity: unknown }).quantity = 2)),
    ],
    ["negative price", mutate((o) => (o.draft.lineItems[0]!.unitPrice = "-5"))],
    ["bad date", mutate((o) => (o.draft.dueDate = "2026-02-30"))],
    ["bad email", mutate((o) => (o.draft.customerEmail = "no-at-sign"))],
    ["empty name", mutate((o) => (o.draft.customerName = ""))],
    ["no line items", mutate((o) => (o.draft.lineItems = []))],
    ["51 line items", mutate((o) => (o.draft.lineItems = Array(51).fill(o.draft.lineItems[0])))],
    [
      "totals in another currency",
      mutate((o) => ((o.totals as { currency: string }).currency = "EUR")),
    ],
    ["lineTotals length mismatch", mutate((o) => (o.totals.lineTotals = ["1", "2"]))],
    ["numeric total", mutate((o) => ((o.totals as { total: unknown }).total = 540))],
    ["control character in name", mutate((o) => (o.draft.customerName = "A\u0000B"))],
    ["empty clarification list", { status: "needs_clarification", questions: [] }],
    [
      "unknown question field",
      { status: "needs_clarification", questions: [{ field: "x", question: "q" }] },
    ],
    [
      "overlong question",
      { status: "needs_clarification", questions: [{ field: "other", question: "q".repeat(301) }] },
    ],
    ["too many errors", { status: "invalid", errors: Array(21).fill({ path: "a", message: "m" }) }],
    ["unavailable with other fallback", { status: "unavailable", fallback: "retry", reason: "x" }],
    [
      "unavailable with odd reason",
      { status: "unavailable", fallback: "manual_entry", reason: "<b>x</b>" },
    ],
  ])("rejects %s", (_n, body) => {
    expect(validateParseOutcome(body)).toBeNull();
  });
});

function reply(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

describe("createParseApi: request contract", () => {
  it("sends exactly the documented request", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const api = createParseApi(async (url, init) => {
      seen = { url, init };
      return reply(200, ok);
    });
    const r = await api.parse("Invoice Acme", "csrf-123", new AbortController().signal);
    expect(r.kind).toBe("outcome");
    expect(seen?.url).toBe("/api/invoice-drafts/parse");
    const i = seen?.init as RequestInit & { headers: Record<string, string> };
    expect(i.method).toBe("POST");
    expect(i.credentials).toBe("same-origin");
    expect(i.cache).toBe("no-store");
    expect(i.redirect).toBe("error");
    expect(i.headers).toEqual({ "content-type": "application/json", "x-csrf-token": "csrf-123" });
    expect(JSON.parse(i.body as string)).toEqual({ text: "Invoice Acme" });
  });
});

describe("createParseApi: results", () => {
  const run = (res: () => Response | Promise<Response>, signal = new AbortController().signal) =>
    createParseApi(async () => res()).parse("t", "c", signal);

  it("maps each HTTP status", async () => {
    expect(await run(() => reply(401, { error: "unauthorized" }))).toEqual({
      kind: "unauthorized",
    });
    expect(await run(() => reply(403, { error: "csrf_invalid", detail: "secret" }))).toEqual({
      kind: "forbidden",
    });
    expect(await run(() => reply(503))).toEqual({ kind: "unavailable" });
    expect(await run(() => reply(500))).toEqual({ kind: "unavailable" });
  });
  it("reports Retry-After only when it is a plain integer", async () => {
    expect(await run(() => reply(429, {}, { "retry-after": "120" }))).toEqual({
      kind: "throttled",
      retryAfterSeconds: 120,
    });
    expect(await run(() => reply(429, {}, { "retry-after": "Wed, 21 Oct" }))).toEqual({
      kind: "throttled",
      retryAfterSeconds: null,
    });
    expect(await run(() => reply(429))).toEqual({ kind: "throttled", retryAfterSeconds: null });
  });
  it("keeps only short printable 400 messages", async () => {
    const r = await run(() =>
      reply(400, {
        error: "invalid_request",
        issues: [{ path: "text", message: "Too big" }, { path: "x", message: 5 }, "junk"],
      }),
    );
    expect(r).toEqual({ kind: "rejected", messages: ["Too big"] });
    expect(await run(() => new Response("not json", { status: 400 }))).toEqual({
      kind: "rejected",
      messages: [],
    });
  });
  it("treats a 200 that is not a documented outcome, or not JSON, as malformed", async () => {
    expect(await run(() => reply(200, { status: "approved" }))).toEqual({ kind: "malformed" });
    expect(await run(() => new Response("<html>", { status: 200 }))).toEqual({ kind: "malformed" });
    expect(await run(() => reply(201, ok))).toEqual({ kind: "unavailable" });
  });
  it("reports a network failure as offline and an aborted request as aborted", async () => {
    expect(
      await createParseApi(() => Promise.reject(new TypeError("x"))).parse(
        "t",
        "c",
        new AbortController().signal,
      ),
    ).toEqual({ kind: "offline" });
    const ac = new AbortController();
    ac.abort();
    const r: ParseResult = await createParseApi(() =>
      Promise.reject(new DOMException("a", "AbortError")),
    ).parse("t", "c", ac.signal);
    expect(r).toEqual({ kind: "aborted" });
  });
});
