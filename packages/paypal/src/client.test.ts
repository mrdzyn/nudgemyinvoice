import { describe, expect, it } from "vitest";
import {
  ForbiddenPayPalOperation,
  PayPalOutcomeUnknownError,
  PayPalRejectedError,
  PayPalSandboxClient,
  TransportError,
  verifyRemoteDraft,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
  type PayPalInvoiceRequest,
} from "./index.js";

const BASE = "https://api-m.sandbox.paypal.com";
const SECRET = "client-secret-value-xyz";
const ID = "client-id-value-abc";
const TOKEN = "access-token-value-0123456789";

const ok = (body: unknown, status = 200): HttpResponse => ({
  status,
  headers: {},
  body: JSON.stringify(body),
});
const tokenOk = ok({ access_token: TOKEN, token_type: "Bearer", expires_in: 3600 });
const reqBody = {
  detail: {
    currency_code: "USD",
    invoice_number: "NMI-00000000000000000001",
    reference: "ref",
    invoice_date: "2026-10-25",
    payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: "2026-11-30" },
  },
  primary_recipients: [],
  items: [],
  configuration: { tax_calculated_after_discount: true, tax_inclusive: false, allow_tip: false },
} as unknown as PayPalInvoiceRequest;

/** Fake transport: routes by "METHOD path", records everything, never touches the network. */
function fake(routes: Record<string, (r: HttpRequest) => HttpResponse | Promise<HttpResponse>>) {
  const calls: HttpRequest[] = [];
  const transport: HttpTransport = async (req) => {
    calls.push(req);
    const path = new URL(req.url).pathname;
    const h = routes[`${req.method} ${path}`] ?? routes[`${req.method} *`];
    if (!h) throw new Error(`unexpected request ${req.method} ${path}`);
    return h(req);
  };
  return { calls, transport };
}
const client = (transport: HttpTransport, now?: () => number) =>
  new PayPalSandboxClient({
    baseUrl: BASE,
    clientId: ID,
    clientSecret: SECRET,
    transport,
    ...(now ? { now } : {}),
  });

describe("construction", () => {
  it("refuses live or foreign base URLs and missing credentials", () => {
    const t = fake({}).transport;
    for (const baseUrl of [
      "https://api-m.paypal.com",
      "http://api-m.sandbox.paypal.com",
      "https://evil.example",
    ]) {
      expect(
        () =>
          new PayPalSandboxClient({ baseUrl, clientId: ID, clientSecret: SECRET, transport: t }),
      ).toThrow();
    }
    expect(
      () =>
        new PayPalSandboxClient({
          baseUrl: BASE,
          clientId: "",
          clientSecret: SECRET,
          transport: t,
        }),
    ).toThrow();
    expect(
      () =>
        new PayPalSandboxClient({ baseUrl: BASE, clientId: ID, clientSecret: "", transport: t }),
    ).toThrow();
  });
  it("exposes no send, remind, cancel, payment, refund, update or delete method", () => {
    const methods = Object.getOwnPropertyNames(PayPalSandboxClient.prototype).filter(
      (m) => m !== "constructor",
    );
    expect(methods.filter((m) => !m.startsWith("_")).sort()).toEqual(
      [
        "accessToken",
        "call",
        "createDraftInvoice",
        "fetchToken",
        "findInvoiceIdsByNumber",
        "getInvoice",
      ].sort(),
    );
    for (const m of methods)
      expect(m).not.toMatch(/send|remind|cancel|pay|refund|update|delete|capture/i);
  });
});

describe("OAuth", () => {
  it("requests a client-credentials token with Basic auth, then reuses it until near expiry", async () => {
    let t = 1_000_000;
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "GET /v2/invoicing/invoices/INV2-1": () => ok({ id: "INV2-1" }, 404),
    });
    const c = client(f.transport, () => t);
    await c.getInvoice("INV2-1");
    await c.getInvoice("INV2-1");
    const tokenCalls = f.calls.filter((r) => r.url.endsWith("/v1/oauth2/token"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]).toMatchObject({
      method: "POST",
      url: `${BASE}/v1/oauth2/token`,
      body: "grant_type=client_credentials",
    });
    expect(tokenCalls[0]?.headers["authorization"]).toBe(
      `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`,
    );
    expect(tokenCalls[0]?.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    t += 3600_000 - 30_000; // inside the 60 s safety margin
    await c.getInvoice("INV2-1");
    expect(f.calls.filter((r) => r.url.endsWith("/v1/oauth2/token"))).toHaveLength(2);
  });

  it("20 concurrent first calls share ONE token request (single flight)", async () => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "GET /v2/invoicing/invoices/INV2-1": () => ok({}, 404),
    });
    const c = client(f.transport);
    await Promise.all(Array.from({ length: 20 }, () => c.getInvoice("INV2-1")));
    expect(f.calls.filter((r) => r.url.endsWith("/v1/oauth2/token"))).toHaveLength(1);
  });

  it("a 401 refreshes the token once and resends; a second 401 is a rejection", async () => {
    let seen = 0;
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "GET /v2/invoicing/invoices/INV2-1": () => (seen++ === 0 ? ok({}, 401) : ok({}, 404)),
    });
    expect(await client(f.transport).getInvoice("INV2-1")).toBeNull();
    expect(f.calls.filter((r) => r.url.endsWith("/token"))).toHaveLength(2);

    const always401 = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/invoices": () => ok({}, 401),
    });
    await expect(
      client(always401.transport).createDraftInvoice({ body: reqBody, requestId: "r" }),
    ).rejects.toMatchObject({ code: "http_401" });
    expect(always401.calls.filter((r) => r.url.endsWith("/invoices"))).toHaveLength(2); // exactly one resend
  });

  it("OAuth failure is a rejection and NO create request is ever sent", async () => {
    for (const tokenRoute of [
      () => ok({ error: "invalid_client" }, 401),
      () => ok({ nope: 1 }),
      () => ok({}, 500),
    ]) {
      const f = fake({ "POST /v1/oauth2/token": tokenRoute });
      await expect(
        client(f.transport).createDraftInvoice({ body: reqBody, requestId: "r" }),
      ).rejects.toBeInstanceOf(PayPalRejectedError);
      expect(f.calls.every((r) => r.url.endsWith("/token"))).toBe(true);
    }
    const net = client(async () => {
      throw new TransportError("network");
    });
    await expect(net.createDraftInvoice({ body: reqBody, requestId: "r" })).rejects.toMatchObject({
      code: "oauth_network",
    });
  });
});

describe("create draft invoice", () => {
  it("POSTs the exact body to the sandbox invoices endpoint with a stable request id", async () => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/invoices": () => ok({ id: "INV2-NEW-1" }, 201),
    });
    const res = await client(f.transport).createDraftInvoice({
      body: reqBody,
      requestId: "11111111-1111-4111-8111-111111111111",
    });
    expect(res).toEqual({ paypalInvoiceId: "INV2-NEW-1" });
    const create = f.calls.find((r) => r.url.endsWith("/v2/invoicing/invoices")) as HttpRequest;
    expect(create).toMatchObject({ method: "POST", url: `${BASE}/v2/invoicing/invoices` });
    expect(JSON.parse(create.body as string)).toEqual(reqBody);
    expect(create.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "paypal-request-id": "11111111-1111-4111-8111-111111111111",
      "content-type": "application/json",
    });
  });

  it("accepts the documented link-only 201 body (id taken from the href)", async () => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/invoices": () =>
        ok({ rel: "self", href: `${BASE}/v2/invoicing/invoices/INV2-LINK-9`, method: "GET" }, 201),
    });
    expect(await client(f.transport).createDraftInvoice({ body: reqBody, requestId: "r" })).toEqual(
      { paypalInvoiceId: "INV2-LINK-9" },
    );
  });

  it.each([
    ["201 with no usable id", () => ok({ hello: "world" }, 201)],
    ["201 with an off-pattern id", () => ok({ id: "../../etc" }, 201)],
    ["201 with a body that is not JSON", () => ({ status: 201, headers: {}, body: "<html>" })],
    ["500", () => ok({}, 500)],
    ["502", () => ok({}, 502)],
    ["503", () => ok({}, 503)],
    [
      "a redirect",
      () => ({ status: 302, headers: { location: "https://evil.example" }, body: "" }),
    ],
    ["an unexpected 204", () => ({ status: 204, headers: {}, body: "" })],
  ])("treats %s as OUTCOME UNKNOWN, never as success or definite failure", async (_n, route) => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/invoices": route,
    });
    await expect(
      client(f.transport).createDraftInvoice({ body: reqBody, requestId: "r" }),
    ).rejects.toBeInstanceOf(PayPalOutcomeUnknownError);
  });

  it.each([
    ["timeout", new TransportError("timeout")],
    ["network", new TransportError("network")],
    ["oversize reply", new TransportError("too_large")],
    ["generic error", new Error("socket hang up")],
  ])("treats a transport %s after the request left as OUTCOME UNKNOWN", async (_n, err) => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/invoices": () => {
        throw err;
      },
    });
    await expect(
      client(f.transport).createDraftInvoice({ body: reqBody, requestId: "r" }),
    ).rejects.toBeInstanceOf(PayPalOutcomeUnknownError);
  });

  it.each([400, 403, 404, 409, 422, 429])(
    "treats HTTP %i as a definite rejection",
    async (status) => {
      const f = fake({
        "POST /v1/oauth2/token": () => tokenOk,
        "POST /v2/invoicing/invoices": () =>
          ok({ name: "INVALID_REQUEST", message: "do not echo me" }, status),
      });
      const err = await client(f.transport)
        .createDraftInvoice({ body: reqBody, requestId: "r" })
        .catch((e) => e);
      expect(err).toBeInstanceOf(PayPalRejectedError);
      expect(err.code).toBe(`http_${status}:invalid_request`);
      expect(String(err.message)).not.toContain("do not echo me");
    },
  );
});

describe("read operations", () => {
  const invoice = (over: Record<string, unknown> = {}) => ({
    id: "INV2-OK-1",
    status: "DRAFT",
    detail: {
      currency_code: "USD",
      invoice_number: "NMI-00000000000000000001",
      reference: "ref-1",
      payment_term: { due_date: "2026-11-30" },
    },
    amount: { currency_code: "USD", value: "500.00" },
    ...over,
  });

  it("parses a draft invoice", async () => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "GET /v2/invoicing/invoices/INV2-OK-1": () => ok(invoice()),
    });
    expect(await client(f.transport).getInvoice("INV2-OK-1")).toEqual({
      paypalInvoiceId: "INV2-OK-1",
      status: "DRAFT",
      currency: "USD",
      total: "500.00",
      dueDate: "2026-11-30",
      invoiceNumber: "NMI-00000000000000000001",
      reference: "ref-1",
    });
  });

  it("maps unknown statuses to UNKNOWN and refuses unsupported currencies as unreadable", async () => {
    const odd = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "GET /v2/invoicing/invoices/INV2-OK-1": () => ok(invoice({ status: "WEIRD" })),
    });
    expect((await client(odd.transport).getInvoice("INV2-OK-1"))?.status).toBe("UNKNOWN");
    const cur = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "GET /v2/invoicing/invoices/INV2-OK-1": () =>
        ok(invoice({ amount: { currency_code: "TND", value: "1.000" } })),
    });
    await expect(client(cur.transport).getInvoice("INV2-OK-1")).rejects.toBeInstanceOf(
      PayPalOutcomeUnknownError,
    );
  });

  it("returns null on 404, and refuses a malformed id without sending anything", async () => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "GET /v2/invoicing/invoices/INV2-GONE": () => ok({}, 404),
    });
    const c = client(f.transport);
    expect(await c.getInvoice("INV2-GONE")).toBeNull();
    const before = f.calls.length;
    await expect(c.getInvoice("INV2-1/send")).rejects.toBeInstanceOf(PayPalRejectedError);
    await expect(c.getInvoice("../x")).rejects.toBeInstanceOf(PayPalRejectedError);
    expect(f.calls.length).toBe(before);
  });

  it("searches by invoice number", async () => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/search-invoices": (r) => {
        expect(JSON.parse(r.body as string)).toEqual({
          invoice_number: "NMI-00000000000000000001",
        });
        return ok({ items: [{ id: "INV2-A" }, { id: "INV2-B" }] });
      },
    });
    expect(await client(f.transport).findInvoiceIdsByNumber("NMI-00000000000000000001")).toEqual([
      "INV2-A",
      "INV2-B",
    ]);
    const empty = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/search-invoices": () => ok({}),
    });
    expect(await client(empty.transport).findInvoiceIdsByNumber("NMI-x")).toEqual([]);
    const bad = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/search-invoices": () => ok({}, 500),
    });
    await expect(client(bad.transport).findInvoiceIdsByNumber("NMI-x")).rejects.toBeInstanceOf(
      PayPalOutcomeUnknownError,
    );
  });
});

describe("no forbidden PayPal call can be made, and secrets never leak", () => {
  it("every request made across a full scenario is one of the four allowed operations on the sandbox host", async () => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/invoices": () => ok({ id: "INV2-S-1" }, 201),
      "GET /v2/invoicing/invoices/INV2-S-1": () => ok({}, 404),
      "POST /v2/invoicing/search-invoices": () => ok({}),
    });
    const c = client(f.transport);
    await c.createDraftInvoice({ body: reqBody, requestId: "r" });
    await c.getInvoice("INV2-S-1");
    await c.findInvoiceIdsByNumber("NMI-x");
    const seen = new Set(
      f.calls.map(
        (r) =>
          `${r.method} ${new URL(r.url).host}${new URL(r.url).pathname.replace(/INV2-S-1/, "{id}")}`,
      ),
    );
    expect([...seen].sort()).toEqual(
      [
        "GET api-m.sandbox.paypal.com/v2/invoicing/invoices/{id}",
        "POST api-m.sandbox.paypal.com/v1/oauth2/token",
        "POST api-m.sandbox.paypal.com/v2/invoicing/invoices",
        "POST api-m.sandbox.paypal.com/v2/invoicing/search-invoices",
      ].sort(),
    );
    for (const r of f.calls) expect(r.url).not.toMatch(/send|remind|cancel|payments|refunds/);
  });

  it("the guard blocks a forbidden path before the transport is ever invoked", async () => {
    const f = fake({ "POST *": () => ok({}) });
    const c = client(f.transport) as unknown as {
      call: (m: string, p: string, b: unknown) => Promise<unknown>;
    };
    for (const path of [
      "/v2/invoicing/invoices/INV2-1/send",
      "/v2/invoicing/invoices/INV2-1/remind",
      "/v2/invoicing/invoices/INV2-1/cancel",
      "/v2/invoicing/invoices/INV2-1/payments",
      "/v2/invoicing/invoices/INV2-1/refunds",
    ]) {
      await expect(c.call("POST", path, {})).rejects.toBeInstanceOf(ForbiddenPayPalOperation);
    }
    expect(f.calls).toHaveLength(0);
  });

  it("errors never contain the client secret, client id, token or request body", async () => {
    const f = fake({
      "POST /v1/oauth2/token": () => tokenOk,
      "POST /v2/invoicing/invoices": () =>
        ok({ name: "X", message: `leak ${SECRET} ${TOKEN}` }, 422),
    });
    const err = (await client(f.transport)
      .createDraftInvoice({ body: reqBody, requestId: "r" })
      .catch((e) => e)) as Error;
    for (const s of [SECRET, ID, TOKEN, "NMI-00000000000000000001"]) {
      expect(`${err.message} ${err.stack ?? ""} ${JSON.stringify(err)}`).not.toContain(s);
    }
  });
});

describe("verifyRemoteDraft", () => {
  const remote = {
    paypalInvoiceId: "INV2-1",
    status: "DRAFT" as const,
    currency: "USD" as const,
    total: "500",
    dueDate: "2026-11-30",
    invoiceNumber: "NMI-1",
    reference: "L1",
  };
  const expected = {
    currency: "USD" as const,
    total: "500.00",
    dueDate: "2026-11-30",
    invoiceNumber: "NMI-1",
    localInvoiceId: "L1",
  };
  it("accepts numerically equal totals and requires every field to match", () => {
    expect(verifyRemoteDraft(remote, expected)).toEqual({ ok: true });
    expect(verifyRemoteDraft({ ...remote, total: "500.0" }, expected)).toEqual({ ok: true });
    expect(verifyRemoteDraft({ ...remote, status: "SENT" }, expected)).toEqual({
      ok: false,
      code: "status_not_draft",
    });
    expect(verifyRemoteDraft({ ...remote, currency: "EUR" }, expected)).toEqual({
      ok: false,
      code: "currency_differs",
    });
    expect(verifyRemoteDraft({ ...remote, total: "500.01" }, expected)).toEqual({
      ok: false,
      code: "total_differs",
    });
    expect(verifyRemoteDraft({ ...remote, total: "abc" }, expected)).toEqual({
      ok: false,
      code: "total_unparseable",
    });
    expect(verifyRemoteDraft({ ...remote, total: "500.001" }, expected)).toEqual({
      ok: false,
      code: "total_unparseable",
    });
    expect(verifyRemoteDraft({ ...remote, dueDate: "2026-12-01" }, expected)).toEqual({
      ok: false,
      code: "due_date_differs",
    });
    expect(verifyRemoteDraft({ ...remote, invoiceNumber: "NMI-2" }, expected)).toEqual({
      ok: false,
      code: "invoice_number_differs",
    });
    expect(verifyRemoteDraft({ ...remote, reference: "L2" }, expected)).toEqual({
      ok: false,
      code: "reference_differs",
    });
  });
});
