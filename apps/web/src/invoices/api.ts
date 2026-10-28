/**
 * Typed same-origin transport for the two saved-draft routes wired in C3:
 *   POST /api/invoice-drafts        (save, idempotent)
 *   GET  /api/invoice-drafts/:id    (read-only detail)
 * Responses are UNTRUSTED and strictly validated; a persisted record is authoritative and is never
 * reconstructed from a browser estimate or a fixture. The CSRF token is supplied per call from
 * volatile memory. Nothing here talks to PayPal or OpenAI.
 */
import type { FetchLike } from "../auth/api.js";
import {
  exactKeys,
  isRecord,
  isUuid,
  MAX_MESSAGE,
  parseServerInvoice,
  text,
  type ServerInvoice,
} from "../domain/serverInvoice.js";
import { parseListPage, type ListPage } from "../domain/serverList.js";
import type { InvoiceDraft } from "../domain/types.js";
import { IDEMPOTENCY_KEY } from "./idempotency.js";

const MAX_MESSAGES = 20;
const SAFE_CODE = /^[a-z0-9_.:-]{1,64}$/;
const PAYPAL_INVOICE_ID = /^[A-Za-z0-9-]{1,64}$/;

export type SaveResult =
  | { kind: "saved"; replayed: boolean; invoice: ServerInvoice } // 201 created / 200 replayed
  | { kind: "conflict" } // 409: key already used for a different body
  | { kind: "rejected"; messages: string[] } // 400 (validation / key format)
  | { kind: "invalid-draft"; message: string | null } // 422 invalid_draft
  | { kind: "unauthorized" } // 401
  | { kind: "forbidden" } // 403
  /** The request may or may not have been committed. NOT proof of failure. */
  | { kind: "uncertain"; cause: "network" | "server" | "malformed" | "timeout" }
  | { kind: "aborted" };

export interface ListQuery {
  limit: number;
  cursor: string | null;
  currency: string | null;
  status: string | null;
  q: string | null;
}

export type ListResult =
  | { kind: "ok"; page: ListPage }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "rejected" } // 400: the server refused the query (a client bug, not the operator's fault)
  | { kind: "unavailable" }
  | { kind: "malformed" }
  | { kind: "offline" }
  | { kind: "aborted" };

/** Why the server refused to map a local invoice to a PayPal draft (it never rounds silently). */
export const MAPPING_REFUSALS = [
  "rounding_required_line",
  "rounding_required_tax",
  "rounding_required_discount",
  "tax_with_discount_multiline",
  "due_date_past",
  "invalid_invoice_date",
] as const;
export type MappingRefusalReason = (typeof MAPPING_REFUSALS)[number];

/**
 * Outcome of `POST /api/invoice-drafts/:id/paypal-draft`. Every documented backend answer has its own
 * kind. `uncertain` means a PayPal draft MAY or MAY NOT exist (lost connection, timeout, 5xx or an
 * unreadable success): it is never a failure and never a success.
 */
export type PayPalDraftResult =
  | { kind: "created"; paypalInvoiceId: string; replayed: boolean } // 201 / 200
  | { kind: "in-progress" } // 409 in_progress
  | { kind: "reconciliation-pending" } // 409 reconciliation_pending
  | { kind: "mapping-refused"; reason: MappingRefusalReason } // 422
  | { kind: "paypal-mismatch"; code: string | null } // 502
  | { kind: "paypal-rejected"; code: string | null } // 502
  | { kind: "paypal-unknown"; code: string | null } // 502 paypal_outcome_unknown
  | { kind: "disabled" } // 503 paypal_disabled
  | { kind: "unavailable" } // 503 unavailable
  | { kind: "not-found" } // 404
  | { kind: "unauthorized" } // 401
  | { kind: "forbidden" } // 403
  | { kind: "bad-request" } // 400 (or any other 4xx): the request itself was refused
  | { kind: "uncertain"; cause: "network" | "server" | "malformed" | "timeout" }
  | { kind: "aborted" };

export type GetResult =
  | { kind: "ok"; invoice: ServerInvoice }
  | { kind: "not-found" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | { kind: "malformed" }
  | { kind: "offline" }
  | { kind: "aborted" };

/** Exactly the strict `invoiceDraftSchema` keys; no totals, ids, status or fixture properties. */
export function saveBody(d: InvoiceDraft): InvoiceDraft {
  return {
    customerName: d.customerName,
    customerEmail: d.customerEmail,
    currency: d.currency,
    lineItems: d.lineItems.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
    dueDate: d.dueDate,
    taxPercent: d.taxPercent,
    discount: d.discount ? { kind: d.discount.kind, value: d.discount.value } : null,
  };
}

async function messagesOf(res: Response): Promise<string[]> {
  try {
    const body: unknown = await res.json();
    if (!isRecord(body) || !Array.isArray(body["issues"])) return [];
    const out: string[] = [];
    for (const i of body["issues"].slice(0, MAX_MESSAGES))
      if (isRecord(i) && text(i["message"], 1, MAX_MESSAGE)) out.push(i["message"]);
    return out;
  } catch {
    return [];
  }
}

export interface InvoiceApi {
  save(
    draft: InvoiceDraft,
    idempotencyKey: string,
    csrfToken: string,
    signal: AbortSignal,
  ): Promise<SaveResult>;
  get(id: string, signal: AbortSignal): Promise<GetResult>;
  list(query: ListQuery, signal: AbortSignal): Promise<ListResult>;
  createPayPalDraft(id: string, csrfToken: string, signal: AbortSignal): Promise<PayPalDraftResult>;
}

export function createInvoiceApi(
  doFetch: FetchLike = (input, init) => fetch(input, init),
): InvoiceApi {
  const base: RequestInit = { credentials: "same-origin", cache: "no-store", redirect: "error" };
  return {
    async save(draft, idempotencyKey, csrfToken, signal) {
      if (!IDEMPOTENCY_KEY.test(idempotencyKey)) return { kind: "rejected", messages: [] };
      let res: Response;
      try {
        res = await doFetch("/api/invoice-drafts", {
          ...base,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-csrf-token": csrfToken,
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify(saveBody(draft)),
          signal,
        });
      } catch {
        return signal.aborted ? { kind: "aborted" } : { kind: "uncertain", cause: "network" };
      }
      switch (res.status) {
        case 201:
        case 200: {
          let invoice: ServerInvoice | null = null;
          try {
            invoice = parseServerInvoice(await res.json(), false);
          } catch {
            if (signal.aborted) return { kind: "aborted" };
          }
          // 201 means created (replayed:false); 200 means an existing record (replayed:true).
          if (!invoice || invoice.replayed !== (res.status === 200))
            return { kind: "uncertain", cause: "malformed" };
          return { kind: "saved", replayed: invoice.replayed, invoice };
        }
        case 409:
          return { kind: "conflict" };
        case 400:
          return { kind: "rejected", messages: await messagesOf(res) };
        case 422: {
          let message: string | null = null;
          try {
            const b: unknown = await res.json();
            if (isRecord(b) && text(b["message"], 1, MAX_MESSAGE)) message = b["message"];
          } catch {
            /* an unreadable 422 body is still "invalid_draft" */
          }
          return { kind: "invalid-draft", message };
        }
        case 401:
          return { kind: "unauthorized" };
        case 403:
          return { kind: "forbidden" };
        default:
          // 5xx may follow a commit, so it is uncertain; any other unexpected 4xx cannot have saved.
          return res.status >= 500
            ? { kind: "uncertain", cause: "server" }
            : { kind: "rejected", messages: [] };
      }
    },
    async list(query, signal) {
      const params = new URLSearchParams();
      params.set("limit", String(query.limit));
      if (query.cursor) params.set("cursor", query.cursor);
      if (query.currency) params.set("currency", query.currency);
      if (query.status) params.set("status", query.status);
      if (query.q) params.set("q", query.q);
      let res: Response;
      try {
        res = await doFetch(`/api/invoice-drafts?${params.toString()}`, {
          ...base,
          method: "GET",
          headers: { "cache-control": "no-store" },
          signal,
        });
      } catch {
        return signal.aborted ? { kind: "aborted" } : { kind: "offline" };
      }
      switch (res.status) {
        case 200:
          try {
            const page = parseListPage(await res.json(), query.limit, query.cursor);
            return page ? { kind: "ok", page } : { kind: "malformed" };
          } catch {
            return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
          }
        case 400:
          return { kind: "rejected" };
        case 401:
          return { kind: "unauthorized" };
        case 403:
          return { kind: "forbidden" };
        default:
          return { kind: "unavailable" };
      }
    },
    async createPayPalDraft(id, csrfToken, signal) {
      if (!isUuid(id)) return { kind: "not-found" };
      let res: Response;
      try {
        res = await doFetch(`/api/invoice-drafts/${id}/paypal-draft`, {
          ...base,
          method: "POST",
          headers: { "cache-control": "no-store", "x-csrf-token": csrfToken },
          signal,
        });
      } catch {
        return signal.aborted ? { kind: "aborted" } : { kind: "uncertain", cause: "network" };
      }
      let body: unknown = null;
      let readable = true;
      try {
        body = await res.json();
      } catch {
        readable = false;
      }
      const error = isRecord(body) && typeof body["error"] === "string" ? body["error"] : null;
      const code = (): string | null =>
        isRecord(body) && typeof body["code"] === "string" && SAFE_CODE.test(body["code"])
          ? body["code"]
          : null;
      switch (res.status) {
        case 201:
        case 200: {
          // Exactly { paypalInvoiceId, status: "DRAFT", replayed }; an arbitrary 200 is NOT proof.
          const ok =
            readable &&
            isRecord(body) &&
            exactKeys(body, ["paypalInvoiceId", "status", "replayed"]) &&
            typeof body["paypalInvoiceId"] === "string" &&
            PAYPAL_INVOICE_ID.test(body["paypalInvoiceId"]) &&
            body["status"] === "DRAFT" &&
            body["replayed"] === (res.status === 200); // 201 = created now, 200 = already existed
          return ok
            ? {
                kind: "created",
                paypalInvoiceId: (body as { paypalInvoiceId: string }).paypalInvoiceId,
                replayed: res.status === 200,
              }
            : { kind: "uncertain", cause: "malformed" };
        }
        case 409:
          if (error === "in_progress") return { kind: "in-progress" };
          if (error === "reconciliation_pending") return { kind: "reconciliation-pending" };
          return { kind: "bad-request" };
        case 422: {
          const reason = isRecord(body) ? body["reason"] : null;
          return error === "mapping_refused" &&
            typeof reason === "string" &&
            (MAPPING_REFUSALS as readonly string[]).includes(reason)
            ? { kind: "mapping-refused", reason: reason as MappingRefusalReason }
            : { kind: "bad-request" };
        }
        case 502:
          if (error === "paypal_mismatch") return { kind: "paypal-mismatch", code: code() };
          if (error === "paypal_rejected") return { kind: "paypal-rejected", code: code() };
          if (error === "paypal_outcome_unknown") return { kind: "paypal-unknown", code: code() };
          return { kind: "uncertain", cause: "server" };
        case 503:
          if (error === "paypal_disabled") return { kind: "disabled" };
          if (error === "unavailable") return { kind: "unavailable" };
          return { kind: "uncertain", cause: "server" };
        case 404:
          return { kind: "not-found" };
        case 401:
          return { kind: "unauthorized" };
        case 403:
          return { kind: "forbidden" };
        default:
          // A 5xx may follow work already done on the server: uncertain. Any other 4xx cannot have created anything.
          return res.status >= 500
            ? { kind: "uncertain", cause: "server" }
            : { kind: "bad-request" };
      }
    },
    async get(id, signal) {
      if (!isUuid(id)) return { kind: "not-found" };
      let res: Response;
      try {
        res = await doFetch(`/api/invoice-drafts/${id}`, {
          ...base,
          method: "GET",
          headers: { "cache-control": "no-store" },
          signal,
        });
      } catch {
        return signal.aborted ? { kind: "aborted" } : { kind: "offline" };
      }
      switch (res.status) {
        case 200: {
          try {
            const invoice = parseServerInvoice(await res.json(), true);
            // The record must be the one requested.
            return invoice && invoice.id.toLowerCase() === id.toLowerCase()
              ? { kind: "ok", invoice }
              : { kind: "malformed" };
          } catch {
            return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
          }
        }
        case 404:
          return { kind: "not-found" };
        case 401:
          return { kind: "unauthorized" };
        case 403:
          return { kind: "forbidden" };
        default:
          return { kind: "unavailable" };
      }
    },
  };
}
