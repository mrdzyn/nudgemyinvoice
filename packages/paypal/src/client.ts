import { z } from "zod";
import { isSupportedCurrency, parseMoney, type CurrencyCode } from "@nmi/shared";
import {
  guardRequest,
  fetchTransport,
  TransportError,
  type HttpResponse,
  type HttpTransport,
} from "./http.js";
import { assertSandboxConfig } from "./sandbox.js";
import type { PayPalInvoiceRequest } from "./mapping.js";

export type RemoteInvoiceStatus =
  "DRAFT" | "SENT" | "PAID" | "PARTIALLY_PAID" | "CANCELLED" | "REFUNDED" | "UNKNOWN";

export interface RemoteInvoice {
  paypalInvoiceId: string;
  status: RemoteInvoiceStatus;
  currency: CurrencyCode;
  /** Decimal string exactly as PayPal reports it. */
  total: string;
  dueDate: string | null;
  invoiceNumber: string | null;
  reference: string | null;
}

/** Definite refusal by PayPal (or by our own auth): nothing was created. Safe to retry later. */
export class PayPalRejectedError extends Error {
  constructor(public readonly code: string) {
    super(`PayPal rejected the request: ${code}`);
    this.name = "PayPalRejectedError";
  }
}
/** The request may or may not have taken effect. NEVER treat as failure OR success; reconcile first. */
export class PayPalOutcomeUnknownError extends Error {
  constructor(public readonly code: string) {
    super(`PayPal outcome unknown: ${code}`);
    this.name = "PayPalOutcomeUnknownError";
  }
}
export class PayPalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalConfigError";
  }
}

export interface PayPalSandboxClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  transport?: HttpTransport;
  now?: () => number;
  oauthTimeoutMs?: number;
  requestTimeoutMs?: number;
}

const tokenResponse = z.object({
  access_token: z.string().min(10).max(4096),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive(),
});
const money = z.object({ currency_code: z.string().optional(), value: z.string() });
const invoiceResponse = z.object({
  id: z.string().min(1).max(64),
  status: z.string().optional(),
  detail: z
    .object({
      currency_code: z.string().optional(),
      invoice_number: z.string().optional(),
      reference: z.string().optional(),
      payment_term: z.object({ due_date: z.string().optional() }).optional(),
    })
    .optional(),
  amount: money.optional(),
});
const linkResponse = z.object({ href: z.string().max(2000) });
const REMOTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const STATUSES: ReadonlySet<string> = new Set([
  "DRAFT",
  "SENT",
  "PAID",
  "PARTIALLY_PAID",
  "CANCELLED",
  "REFUNDED",
  "UNKNOWN",
]);

const searchItem = z.object({
  id: z.string().regex(REMOTE_ID),
  detail: z
    .object({
      invoice_number: z.string().optional(),
    })
    .optional(),
});
const searchResponse = z
  .object({
    total_items: z.number().int().nonnegative().optional(),
    total_pages: z.number().int().nonnegative().optional(),
    items: z.array(searchItem).optional(),
    links: z.array(z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    // Both items and total_items missing => unrecognized / malformed payload (e.g. {} or error object)
    if (data.items === undefined && data.total_items === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Search response must include items array or total_items",
      });
      return;
    }
    // If total_items > 0, items array must be present and non-empty
    if (
      data.total_items !== undefined &&
      data.total_items > 0 &&
      (!data.items || data.items.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "total_items > 0 but items array is missing or empty",
      });
    }
    // If total_items === 0 and items is present, items must be empty
    if (data.total_items === 0 && data.items && data.items.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "total_items is 0 but items array is not empty",
      });
    }
    // If total_pages === 0 and items is present, items must be empty
    if (data.total_pages === 0 && data.items && data.items.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "total_pages is 0 but items array is not empty",
      });
    }
    // If total_items is 0 but total_pages > 0
    if (data.total_items === 0 && data.total_pages !== undefined && data.total_pages > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "total_items is 0 but total_pages > 0",
      });
    }
  });

/**
 * PayPal REST SANDBOX client for exactly four operations: OAuth token, create DRAFT invoice, show
 * invoice, search invoices by number. There is no method for send, remind, cancel, payments,
 * refunds, update or delete, and `guardRequest` would refuse those paths even if one were added.
 * Credentials and tokens are never logged or included in error messages.
 */
export class PayPalSandboxClient {
  private readonly base: string;
  private readonly transport: HttpTransport;
  private readonly now: () => number;
  private token: { value: string; expiresAt: number } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(private readonly opts: PayPalSandboxClientOptions) {
    if (!opts.clientId || !opts.clientSecret)
      throw new PayPalConfigError("PayPal credentials are required");
    this.base = assertSandboxConfig({
      PAYPAL_ENV: "sandbox",
      PAYPAL_API_BASE_URL: opts.baseUrl,
    }).origin;
    this.transport = opts.transport ?? fetchTransport;
    this.now = opts.now ?? Date.now;
  }

  // ---------------------------------------------------------------- OAuth
  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    // single flight: concurrent callers share one token request
    this.inflight ??= this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString("base64");
    const url = `${this.base}/v1/oauth2/token`;
    guardRequest("POST", url);
    let res;
    try {
      res = await this.transport({
        method: "POST",
        url,
        headers: {
          authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: "grant_type=client_credentials",
        timeoutMs: this.opts.oauthTimeoutMs ?? 10_000,
      });
    } catch (e) {
      // Obtaining a token creates nothing, so any failure here is safely a rejection.
      throw new PayPalRejectedError(
        e instanceof TransportError ? `oauth_${e.kind}` : "oauth_failed",
      );
    }
    if (res.status !== 200) throw new PayPalRejectedError(`oauth_http_${res.status}`);
    const parsed = tokenResponse.safeParse(safeJson(res.body));
    if (!parsed.success) throw new PayPalRejectedError("oauth_response_invalid");
    this.token = {
      value: parsed.data.access_token,
      expiresAt: this.now() + parsed.data.expires_in * 1000,
    };
    return parsed.data.access_token;
  }

  // ------------------------------------------------------------- plumbing
  /**
   * One authenticated request. `effect` has NO default on purpose: only a `"read"` request may be
   * resent after an HTTP 401 (one token refresh, one resend). A `"create"` request is sent at most
   * once per call, whatever the answer, so a mutating POST can never be resent by accident.
   */
  private async call(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    effect: "read" | "create",
    extraHeaders: Record<string, string> = {},
    alreadyRefreshed = false,
  ): Promise<HttpResponse> {
    const url = `${this.base}${path}`;
    guardRequest(method, url); // refuses anything outside the four allowed operations
    const token = await this.accessToken();
    const res = await this.transport({
      method,
      url,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      timeoutMs: this.opts.requestTimeoutMs ?? 15_000,
    });
    if (res.status === 401 && effect === "read" && !alreadyRefreshed) {
      // Read-only request (show, or the search which is a POST with no effect): the token was
      // refused, so refresh once and resend. Never done for a create.
      this.token = null;
      await this.accessToken(true);
      return this.call(method, path, body, effect, extraHeaders, true);
    }
    return res;
  }

  // ---------------------------------------------------------- operations
  /**
   * Creates a DRAFT invoice. Resolves with the new invoice id; throws PayPalRejectedError when
   * PayPal definitely refused it, PayPalOutcomeUnknownError when the result cannot be known.
   * The result is NOT yet verified: callers must compare it with {@link getInvoice}.
   */
  async createDraftInvoice(input: {
    body: PayPalInvoiceRequest;
    requestId: string;
  }): Promise<{ paypalInvoiceId: string }> {
    let res;
    try {
      res = await this.call("POST", "/v2/invoicing/invoices", input.body, "create", {
        "paypal-request-id": input.requestId, // sent for retries; NOT relied on (documented only for other endpoints)
        prefer: "return=representation",
      });
    } catch (e) {
      if (e instanceof PayPalRejectedError) throw e; // OAuth failure: nothing was sent
      throw new PayPalOutcomeUnknownError(e instanceof TransportError ? e.kind : "request_failed");
    }
    if (res.status === 201 || res.status === 200) {
      const id = extractId(res.body);
      if (!id) throw new PayPalOutcomeUnknownError("response_unparseable");
      return { paypalInvoiceId: id };
    }
    // A 401 after the create POST was sent is NOT treated as "definitely not created": it is never
    // resent, and it is recorded as unknown so that every later request reconciles read-only
    // instead of re-entering the create path (a rejected operation may be claimed for create again).
    if (res.status === 401) throw new PayPalOutcomeUnknownError("http_401");
    if ([400, 403, 404, 409, 422, 429].includes(res.status)) {
      throw new PayPalRejectedError(`http_${res.status}${issueToken(res.body)}`);
    }
    throw new PayPalOutcomeUnknownError(`http_${res.status}`);
  }

  /** Reads one invoice. Returns null on 404. Throws PayPalOutcomeUnknownError on any other failure. */
  async getInvoice(paypalInvoiceId: string): Promise<RemoteInvoice | null> {
    if (!REMOTE_ID.test(paypalInvoiceId)) throw new PayPalRejectedError("invalid_invoice_id");
    let res;
    try {
      res = await this.call("GET", `/v2/invoicing/invoices/${paypalInvoiceId}`, undefined, "read");
    } catch (e) {
      throw new PayPalOutcomeUnknownError(e instanceof TransportError ? e.kind : "request_failed");
    }
    if (res.status === 404) return null;
    if (res.status !== 200) throw new PayPalOutcomeUnknownError(`http_${res.status}`);
    const remote = toRemote(res.body);
    if (!remote) throw new PayPalOutcomeUnknownError("response_unparseable");
    return remote;
  }

  /** Ids of invoices whose invoice_number equals `invoiceNumber` (used to reconcile unclear outcomes). */
  async findInvoiceIdsByNumber(invoiceNumber: string): Promise<string[]> {
    let res;
    try {
      res = await this.call(
        "POST",
        "/v2/invoicing/search-invoices",
        {
          invoice_number: invoiceNumber,
          page: 1,
          page_size: 20,
          total_required: true,
        },
        "read",
      );
    } catch (e) {
      throw new PayPalOutcomeUnknownError(e instanceof TransportError ? e.kind : "request_failed");
    }
    if (res.status !== 200) throw new PayPalOutcomeUnknownError(`http_${res.status}`);
    const parsed = searchResponse.safeParse(safeJson(res.body));
    if (!parsed.success) throw new PayPalOutcomeUnknownError("response_unparseable");

    const totalPages = parsed.data.total_pages;
    const totalItems = parsed.data.total_items;
    const items = parsed.data.items ?? [];

    // Any incomplete or multi-page search fails closed as search_incomplete.
    // NEVER return pseudo-identifiers or synthetic strings in the invoice ID list.
    if (totalPages !== undefined && totalPages > 1) {
      throw new PayPalOutcomeUnknownError("search_incomplete");
    }
    if (totalItems !== undefined && totalItems > items.length) {
      throw new PayPalOutcomeUnknownError("search_incomplete");
    }

    const matchingIds = items
      .filter((i) => !i.detail?.invoice_number || i.detail.invoice_number === invoiceNumber)
      .map((i) => i.id);

    return matchingIds;
  }
}

// ------------------------------------------------------------------ helpers
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractId(body: string): string | null {
  const json = safeJson(body);
  const full = invoiceResponse.safeParse(json);
  if (full.success && REMOTE_ID.test(full.data.id)) return full.data.id;
  const link = linkResponse.safeParse(json);
  if (link.success) {
    const m = /\/v2\/invoicing\/invoices\/([A-Za-z0-9-]{1,64})$/.exec(link.data.href);
    if (m) return m[1] as string;
  }
  return null;
}

function toRemote(body: string): RemoteInvoice | null {
  const p = invoiceResponse.safeParse(safeJson(body));
  if (!p.success || !p.data.amount) return null;
  const currency = p.data.amount.currency_code ?? p.data.detail?.currency_code ?? "";
  if (!isSupportedCurrency(currency)) return null;
  const status = p.data.status ?? "";
  return {
    paypalInvoiceId: p.data.id,
    status: (STATUSES.has(status) ? status : "UNKNOWN") as RemoteInvoiceStatus,
    currency,
    total: p.data.amount.value,
    dueDate: p.data.detail?.payment_term?.due_date ?? null,
    invoiceNumber: p.data.detail?.invoice_number ?? null,
    reference: p.data.detail?.reference ?? null,
  };
}

/** Appends a sanitized PayPal error name (e.g. ":invalid_parameter_value") if the body has one. */
function issueToken(body: string): string {
  const json = safeJson(body) as { name?: unknown } | undefined;
  const name = typeof json?.name === "string" ? json.name.toLowerCase() : "";
  return /^[a-z0-9_]{1,40}$/.test(name) ? `:${name}` : "";
}

// -------------------------------------------------------- verification
export interface ExpectedRemote {
  currency: CurrencyCode;
  total: string;
  dueDate: string;
  invoiceNumber: string;
  localInvoiceId: string;
}

/** A created draft counts as success ONLY if every one of these matches exactly. */
export function verifyRemoteDraft(
  remote: RemoteInvoice,
  expected: ExpectedRemote,
): { ok: true } | { ok: false; code: string } {
  if (remote.status !== "DRAFT") return { ok: false, code: "status_not_draft" };
  if (remote.currency !== expected.currency) return { ok: false, code: "currency_differs" };
  try {
    if (
      parseMoney(remote.total, expected.currency) !== parseMoney(expected.total, expected.currency)
    ) {
      return { ok: false, code: "total_differs" };
    }
  } catch {
    return { ok: false, code: "total_unparseable" };
  }
  if (remote.dueDate !== expected.dueDate) return { ok: false, code: "due_date_differs" };
  if (remote.invoiceNumber !== expected.invoiceNumber)
    return { ok: false, code: "invoice_number_differs" };
  if (remote.reference !== expected.localInvoiceId) return { ok: false, code: "reference_differs" };
  return { ok: true };
}
