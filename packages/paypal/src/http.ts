import { PAYPAL_SANDBOX_HOST } from "./sandbox.js";

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
/** Injectable so every test can use a deterministic fake and no test can reach the network. */
export type HttpTransport = (req: HttpRequest) => Promise<HttpResponse>;

export class TransportError extends Error {
  constructor(public readonly kind: "timeout" | "network" | "too_large") {
    super(`transport ${kind}`);
    this.name = "TransportError";
  }
}

export class ForbiddenPayPalOperation extends Error {
  constructor(what: string) {
    super(`PayPal operation not allowed: ${what}`);
    this.name = "ForbiddenPayPalOperation";
  }
}

/** Exact fixed pagination query required by the invoicing v2 search operation. */
export const PAYPAL_INVOICE_SEARCH_QUERY = "page=1&page_size=20&total_required=true";

/**
 * Bounded pagination for the read-only invoice list used by draft sync.
 * Page starts at 1; page size is capped at 20 so one sync step stays small.
 */
export const PAYPAL_SYNC_MAX_PAGE_SIZE = 20;
export const PAYPAL_SYNC_MAX_PAGE = 999;

export function paypalListQuery(page: number, pageSize: number): string {
  if (!Number.isInteger(page) || page < 1 || page > PAYPAL_SYNC_MAX_PAGE)
    throw new ForbiddenPayPalOperation("list page out of range");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAYPAL_SYNC_MAX_PAGE_SIZE)
    throw new ForbiddenPayPalOperation("list page size out of range");
  return `page=${page}&page_size=${pageSize}&total_required=true`;
}

/**
 * The ONLY PayPal calls this project may make. Anything else (send, remind, cancel, payments,
 * refunds, update, delete, live hosts, redirects off the sandbox host) is refused before any
 * network I/O, whatever the caller, model text or configuration says.
 */
const ALLOWED: ReadonlyArray<{ method: "GET" | "POST"; path: RegExp; label: string }> = [
  { method: "POST", path: /^\/v1\/oauth2\/token$/, label: "oauth token" },
  { method: "POST", path: /^\/v2\/invoicing\/invoices$/, label: "create draft invoice" },
  { method: "GET", path: /^\/v2\/invoicing\/invoices\/[A-Za-z0-9-]{1,64}$/, label: "show invoice" },
  { method: "GET", path: /^\/v2\/invoicing\/invoices$/, label: "list invoices" },
  { method: "POST", path: /^\/v2\/invoicing\/search-invoices$/, label: "search invoices" },
];

export function guardRequest(method: string, rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ForbiddenPayPalOperation("invalid url");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== PAYPAL_SANDBOX_HOST ||
    url.href !== rawUrl ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new ForbiddenPayPalOperation("host or url shape");
  }
  const ok = ALLOWED.some((a) => a.method === method && a.path.test(url.pathname));
  if (!ok) throw new ForbiddenPayPalOperation(`${method} ${url.pathname}`);

  const isSearch = method === "POST" && url.pathname === "/v2/invoicing/search-invoices";
  const isList = method === "GET" && url.pathname === "/v2/invoicing/invoices";
  if (isSearch) {
    // Exact byte spelling/order avoids duplicate keys, encoding tricks, user-provided filters,
    // malformed values, and ambiguity around pagination. No other operation accepts a query.
    if (url.search !== `?${PAYPAL_INVOICE_SEARCH_QUERY}`) {
      throw new ForbiddenPayPalOperation("search query shape");
    }
  } else if (isList) {
    // Bounded read-only pagination only: page, page_size and total_required, nothing else.
    // Values are range-checked so a caller cannot request an unbounded export.
    const m = /^\?page=(\d{1,3})&page_size=(\d{1,2})&total_required=true$/.exec(url.search);
    if (!m) throw new ForbiddenPayPalOperation("list query shape");
    const page = Number(m[1]);
    const pageSize = Number(m[2]);
    if (
      page < 1 ||
      page > PAYPAL_SYNC_MAX_PAGE ||
      pageSize < 1 ||
      pageSize > PAYPAL_SYNC_MAX_PAGE_SIZE
    ) {
      throw new ForbiddenPayPalOperation("list query range");
    }
  } else if (url.search) {
    throw new ForbiddenPayPalOperation("query not allowed");
  }
}

const MAX_RESPONSE_BYTES = 1_000_000;

/** Production transport: no redirects followed, bounded time and size. Never logs headers or bodies. */
export const fetchTransport: HttpTransport = async (req) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.body === undefined ? {} : { body: req.body }),
      redirect: "manual",
      signal: controller.signal,
    });
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new TransportError("too_large");
        }
        chunks.push(value);
      }
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    return { status: res.status, headers, body: Buffer.concat(chunks).toString("utf8") };
  } catch (e) {
    if (e instanceof TransportError) throw e;
    if (controller.signal.aborted) throw new TransportError("timeout");
    throw new TransportError("network");
  } finally {
    clearTimeout(timer);
  }
};
