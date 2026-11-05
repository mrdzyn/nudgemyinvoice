import { describe, expect, it, vi } from "vitest";
import { createNudgeApi, parseNudge } from "./api.js";

/**
 * Objective (NMI-P6): the nudge transport talks only to the P6 queue routes, sends the in-memory CSRF token on
 * every mutation, maps each server refusal to a distinct outcome, and refuses (as malformed) any answer that is
 * not exactly what the server contract promises — including any nudge not marked `sentToCustomer: false`.
 */
const ID = "00000000-0000-4000-8000-0000000000a1";
const INV = "10000000-0000-4000-8000-000000000001";
const nudge = (over: Record<string, unknown> = {}) => ({
  id: ID,
  invoiceId: INV,
  tone: "professional",
  status: "pending_review",
  message: "Hi Synthetic Co,\n\nInvoice 10000000 for USD 1,200.00 was due on October 30, 2026.",
  aiMessage: "Hi Synthetic Co,\n\nInvoice 10000000 for USD 1,200.00 was due on October 30, 2026.",
  rationale: "Courteous and concise.",
  facts: {
    currency: "USD",
    amount: "USD 1,200.00",
    dueDate: "2026-10-30",
    daysPastDue: 6,
    asOfDate: "2026-11-05",
    timeZone: "Asia/Manila",
    invoiceRef: "10000000",
  },
  model: "fake-model",
  promptVersion: "p6-nudge-v2",
  edited: false,
  version: 1,
  createdAt: "2026-11-05T04:00:00.000Z",
  updatedAt: "2026-11-05T04:00:00.000Z",
  approvedAt: null,
  rejectedAt: null,
  supersededAt: null,
  sentToCustomer: false,
  ...over,
});
const withInvoice = (over: Record<string, unknown> = {}) => ({
  ...nudge(over),
  invoice: {
    customerName: "Synthetic Co",
    currency: "USD",
    total: "1200.00",
    dueDate: "2026-10-30",
  },
});

function server(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return { api: createNudgeApi(f), calls, f };
}
const sig = () => new AbortController().signal;

describe("parseNudge", () => {
  it("accepts a contract-exact nudge", () => {
    expect(parseNudge(nudge(), false)).toMatchObject({
      id: ID,
      tone: "professional",
      invoice: null,
    });
  });
  it.each([
    ["sentToCustomer true", { sentToCustomer: true }],
    ["sentToCustomer missing", { sentToCustomer: undefined }],
    ["unknown tone", { tone: "angry" }],
    ["unknown status", { status: "sent" }],
    ["approved without approvedAt", { status: "approved" }],
    ["approvedAt on a pending draft", { approvedAt: "2026-11-05T04:00:00.000Z" }],
    ["control characters", { message: "hi\u0007" }],
    ["over-long message", { message: "x".repeat(2001) }],
    ["version 0", { version: 0 }],
    ["bad invoice ref", { facts: { ...nudge().facts, invoiceRef: "ZZZ" } }],
    ["amount not prefixed by its currency", { facts: { ...nudge().facts, amount: "EUR 5.00" } }],
  ])("refuses %s", (_n, over) => {
    expect(parseNudge(nudge(over), false)).toBeNull();
  });
  it("requires the invoice context on list items", () => {
    expect(parseNudge(nudge(), true)).toBeNull();
    expect(parseNudge(withInvoice(), true)?.invoice?.customerName).toBe("Synthetic Co");
  });
});

describe("summary and list", () => {
  it("reads real counts and refuses an inconsistent total", async () => {
    const counts = { pending: 2, approved: 1, rejected: 1, superseded: 0, total: 4 };
    expect(await server(200, { counts, aiAvailable: true }).api.summary(sig())).toEqual({
      kind: "ok",
      counts,
      aiAvailable: true,
    });
    expect(
      (await server(200, { counts: { ...counts, total: 9 }, aiAvailable: true }).api.summary(sig()))
        .kind,
    ).toBe("malformed");
    expect((await server(401, {}).api.summary(sig())).kind).toBe("unauthorized");
  });
  it("lists one view and refuses items from another view or another invoice", async () => {
    const ok = server(200, { view: "pending", items: [withInvoice()] });
    expect(await ok.api.list("pending", INV, sig())).toMatchObject({ kind: "ok" });
    expect(ok.calls[0]?.url).toBe(`/api/nudges?view=pending&invoiceId=${INV}`);
    expect(ok.calls[0]?.init.method).toBe("GET");
    const wrongView = server(200, {
      view: "approved",
      items: [withInvoice()],
    });
    expect((await wrongView.api.list("approved", null, sig())).kind).toBe("malformed");
    const other = server(200, { view: "pending", items: [withInvoice({ invoiceId: ID })] });
    expect((await other.api.list("pending", INV, sig())).kind).toBe("malformed");
  });
});

describe("generate", () => {
  it("POSTs only tone, time zone and the named replacement, with the CSRF token", async () => {
    const s = server(201, nudge());
    const r = await s.api.generate(
      INV,
      { tone: "firm", timeZone: "Asia/Manila", replace: { id: ID, version: 3 } },
      "csrf-1",
      sig(),
    );
    expect(r.kind).toBe("ok");
    expect(s.calls[0]?.url).toBe(`/api/invoice-drafts/${INV}/nudges`);
    expect(s.calls[0]?.init.method).toBe("POST");
    expect((s.calls[0]?.init.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-1");
    expect(JSON.parse(String(s.calls[0]?.init.body))).toEqual({
      tone: "firm",
      timeZone: "Asia/Manila",
      replace: { id: ID, version: 3 },
    });
  });
  it.each([
    [
      409,
      { error: "pending_exists", pending: { id: ID, version: 2 } },
      { kind: "pending-exists", pending: { id: ID, version: 2 } },
    ],
    [
      409,
      { error: "version_conflict", pending: null },
      { kind: "version-conflict", pending: null },
    ],
    [422, { error: "ai_output_rejected" }, { kind: "ai-rejected" }],
    [
      429,
      { error: "rate_limited", retryAfterSeconds: 480 },
      { kind: "rate-limited", retryAfterSeconds: 480 },
    ],
    [429, { error: "busy" }, { kind: "busy" }],
    [503, { error: "ai_unavailable" }, { kind: "ai-unavailable" }],
    [404, { error: "not_found" }, { kind: "not-found" }],
    [403, { error: "csrf" }, { kind: "forbidden" }],
    [401, {}, { kind: "unauthorized" }],
  ])("maps HTTP %i %j", async (status, body, outcome) => {
    expect(
      await server(status, body).api.generate(
        INV,
        { tone: "friendly", timeZone: "UTC", replace: null },
        "t",
        sig(),
      ),
    ).toEqual(outcome);
  });
  it("refuses a 201 that is not a pending draft for the requested invoice", async () => {
    expect(
      (
        await server(201, nudge({ invoiceId: ID })).api.generate(
          INV,
          { tone: "friendly", timeZone: "UTC", replace: null },
          "t",
          sig(),
        )
      ).kind,
    ).toBe("malformed");
  });
  it("is offline (not a crash) when the network fails, and never calls for a non-uuid invoice", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("network");
    });
    const api = createNudgeApi(f);
    expect(
      (await api.generate(INV, { tone: "firm", timeZone: "UTC", replace: null }, "t", sig())).kind,
    ).toBe("offline");
    expect(
      (await api.generate("../x", { tone: "firm", timeZone: "UTC", replace: null }, "t", sig()))
        .kind,
    ).toBe("not-found");
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("version-bound transitions", () => {
  it("sends the reviewed version (and the edited text) with the CSRF token", async () => {
    const s = server(200, nudge({ version: 2, edited: true }));
    expect((await s.api.edit(ID, 1, "New text", "c", sig())).kind).toBe("ok");
    expect(JSON.parse(String(s.calls[0]?.init.body))).toEqual({ version: 1, message: "New text" });
    expect(s.calls[0]?.url).toBe(`/api/nudges/${ID}/edit`);
    const a = server(200, nudge({ status: "approved", approvedAt: "2026-11-05T05:00:00.000Z" }));
    expect((await a.api.approve(ID, 2, "c", sig())).kind).toBe("ok");
    expect(JSON.parse(String(a.calls[0]?.init.body))).toEqual({ version: 2 });
    expect((a.calls[0]?.init.headers as Record<string, string>)["x-csrf-token"]).toBe("c");
  });
  it("distinguishes a version conflict from a draft that is no longer pending", async () => {
    expect(
      (await server(409, { error: "version_conflict" }).api.approve(ID, 1, "c", sig())).kind,
    ).toBe("version-conflict");
    expect((await server(409, { error: "not_pending" }).api.reject(ID, 1, "c", sig())).kind).toBe(
      "not-pending",
    );
  });
});
