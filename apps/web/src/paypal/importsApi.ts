/**
 * Typed same-origin transport for the manual PayPal Sandbox DRAFT import:
 *   POST /api/paypal/imports/sync (one bounded read-only list import for this operator)
 *   GET  /api/paypal/imports      (that operator's imported rows for the dashboard section)
 * Responses are UNTRUSTED and strictly validated. Imported rows are a separate mirror: they are
 * never added to invoice analytics and never authorise a local or PayPal change. The CSRF token
 * is supplied per call from volatile memory. Nothing here sends, reminds, cancels, pays, creates
 * or modifies anything in PayPal.
 */
import type { FetchLike } from "../auth/api.js";
import { exactKeys, isRecord } from "../domain/serverInvoice.js";
import { CURRENCY_CODES } from "../domain/types.js";

export interface SyncCounts {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

export type PayPalSyncResult =
  | { kind: "ok"; counts: SyncCounts; partialFailure: boolean; truncated: boolean } // 200
  | { kind: "disabled" } // 503 sync_disabled: the read-sync flag is off
  | { kind: "unavailable" } // 503 sync_unavailable: no server PayPal client
  | { kind: "rate-limited" } // 429 too_many_requests
  | { kind: "busy" } // 429 busy: another sync holds the single slot
  /** Rows were stored but the audit trail write failed: report before relying on the sync. */
  | { kind: "audit-failed"; counts: SyncCounts } // 500 audit_failed
  | { kind: "unauthorized" } // 401
  | { kind: "forbidden" } // 403
  | { kind: "bad-request" } // 400 (or any other 4xx)
  /** The server may have stored rows before the connection broke: refresh the list, never assume. */
  | { kind: "uncertain"; cause: "network" | "server" | "malformed" | "timeout" }
  | { kind: "aborted" };

export interface ImportedDraftItem {
  remoteInvoiceId: string;
  invoiceNumber: string | null;
  currency: string;
  /** Decimal string in the row's own currency; rows are never summed or converted. */
  total: string;
  dueDate: string | null;
  linkedInvoiceId: string | null;
  lastSyncedAt: string;
}

export type ImportsListResult =
  | { kind: "ok"; items: ImportedDraftItem[] } // 200
  | { kind: "disabled" } // 503 sync_disabled
  | { kind: "unauthorized" } // 401
  | { kind: "forbidden" } // 403
  | { kind: "unavailable" }
  | { kind: "malformed" }
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "aborted" };

const REMOTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /^\d+(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const nonNegInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2_147_483_647;

function parseCounts(v: unknown): SyncCounts | null {
  if (!isRecord(v) || !exactKeys(v, ["created", "updated", "unchanged", "skipped", "failed"]))
    return null;
  const { created, updated, unchanged, skipped, failed } = v;
  if (
    !nonNegInt(created) ||
    !nonNegInt(updated) ||
    !nonNegInt(unchanged) ||
    !nonNegInt(skipped) ||
    !nonNegInt(failed)
  )
    return null;
  return { created, updated, unchanged, skipped, failed };
}

function parseItem(v: unknown): ImportedDraftItem | null {
  if (
    !isRecord(v) ||
    !exactKeys(v, [
      "remoteInvoiceId",
      "invoiceNumber",
      "currency",
      "total",
      "dueDate",
      "linkedInvoiceId",
      "lastSyncedAt",
    ])
  )
    return null;
  const {
    remoteInvoiceId,
    invoiceNumber,
    currency,
    total,
    dueDate,
    linkedInvoiceId,
    lastSyncedAt,
  } = v;
  if (typeof remoteInvoiceId !== "string" || !REMOTE_ID.test(remoteInvoiceId)) return null;
  if (
    invoiceNumber !== null &&
    (typeof invoiceNumber !== "string" || invoiceNumber.length < 1 || invoiceNumber.length > 25)
  )
    return null;
  if (typeof currency !== "string" || !(CURRENCY_CODES as readonly string[]).includes(currency))
    return null;
  if (typeof total !== "string" || total.length > 32 || !MONEY.test(total)) return null;
  if (dueDate !== null) {
    if (typeof dueDate !== "string" || !DATE.test(dueDate)) return null;
    const instant = Date.parse(`${dueDate}T00:00:00Z`);
    if (!Number.isFinite(instant)) return null;
    if (new Date(instant).toISOString().slice(0, 10) !== dueDate) return null;
  }
  if (
    linkedInvoiceId !== null &&
    (typeof linkedInvoiceId !== "string" || !UUID.test(linkedInvoiceId))
  )
    return null;
  if (typeof lastSyncedAt !== "string" || !Number.isFinite(Date.parse(lastSyncedAt))) return null;
  return {
    remoteInvoiceId,
    invoiceNumber,
    currency,
    total,
    dueDate,
    linkedInvoiceId,
    lastSyncedAt,
  };
}

export function parseSyncResponse(body: unknown): {
  counts: SyncCounts;
  partialFailure: boolean;
  truncated: boolean;
} | null {
  if (!isRecord(body) || !exactKeys(body, ["counts", "syncedAt", "partialFailure", "truncated"]))
    return null;
  const counts = parseCounts(body["counts"]);
  if (!counts) return null;
  if (typeof body["syncedAt"] !== "string" || !Number.isFinite(Date.parse(body["syncedAt"])))
    return null;
  if (typeof body["partialFailure"] !== "boolean") return null;
  if (typeof body["truncated"] !== "boolean") return null;
  // The flags must agree with the counts: partial failure means a failed row/page or truncation.
  if (body["partialFailure"] !== (counts.failed > 0 || body["truncated"])) return null;
  return { counts, partialFailure: body["partialFailure"], truncated: body["truncated"] };
}

export function parseImportsResponse(body: unknown): ImportedDraftItem[] | null {
  if (!isRecord(body) || !exactKeys(body, ["items"])) return null;
  const { items } = body;
  if (!Array.isArray(items) || items.length > 100) return null;
  const out: ImportedDraftItem[] = [];
  for (const item of items) {
    const parsed = parseItem(item);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

export function createImportsApi(
  doFetch: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 60_000,
) {
  const base: RequestInit = { credentials: "same-origin", cache: "no-store", redirect: "error" };
  const withTimeout = (signal: AbortSignal) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    return {
      signal: controller.signal,
      done: () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      },
    };
  };
  return {
    async sync(csrfToken: string, signal: AbortSignal): Promise<PayPalSyncResult> {
      if (signal.aborted) return { kind: "aborted" };
      const t = withTimeout(signal);
      try {
        const res = await doFetch("/api/paypal/imports/sync", {
          ...base,
          method: "POST",
          headers: { "cache-control": "no-store", "x-csrf-token": csrfToken },
          signal: t.signal,
        });
        let body: unknown = null;
        let readable = true;
        try {
          body = await res.json();
        } catch {
          readable = false;
        }
        const error = isRecord(body) && typeof body["error"] === "string" ? body["error"] : null;
        switch (res.status) {
          case 200: {
            if (!readable)
              return signal.aborted
                ? { kind: "aborted" }
                : { kind: "uncertain", cause: "malformed" };
            const parsed = parseSyncResponse(body);
            if (!parsed)
              return signal.aborted
                ? { kind: "aborted" }
                : { kind: "uncertain", cause: "malformed" };
            if (signal.aborted) return { kind: "aborted" };
            return {
              kind: "ok",
              counts: parsed.counts,
              partialFailure: parsed.partialFailure,
              truncated: parsed.truncated,
            };
          }
          case 400:
            return { kind: "bad-request" };
          case 401:
            return { kind: "unauthorized" };
          case 403:
            return { kind: "forbidden" };
          case 429:
            if (error === "busy") return { kind: "busy" };
            return { kind: "rate-limited" };
          case 503:
            if (error === "sync_disabled") return { kind: "disabled" };
            if (error === "sync_unavailable") return { kind: "unavailable" };
            return signal.aborted ? { kind: "aborted" } : { kind: "uncertain", cause: "server" };
          default:
            // A 500 with audit_failed means rows were stored but the trail is missing: say so
            // explicitly with the counts (a retry is idempotent). Any other 5xx after a POST
            // may have stored rows: uncertain. Other 4xx stored nothing.
            if (res.status === 500 && error === "audit_failed") {
              if (!readable)
                return signal.aborted
                  ? { kind: "aborted" }
                  : { kind: "uncertain", cause: "malformed" };
              const counts = isRecord(body) ? parseCounts(body["counts"]) : null;
              if (!counts)
                return signal.aborted
                  ? { kind: "aborted" }
                  : { kind: "uncertain", cause: "malformed" };
              return signal.aborted ? { kind: "aborted" } : { kind: "audit-failed", counts };
            }
            return signal.aborted
              ? { kind: "aborted" }
              : res.status >= 500
                ? { kind: "uncertain", cause: "server" }
                : { kind: "bad-request" };
        }
      } catch {
        if (signal.aborted) return { kind: "aborted" };
        return t.signal.aborted
          ? { kind: "uncertain", cause: "timeout" }
          : { kind: "uncertain", cause: "network" };
      } finally {
        t.done();
      }
    },
    async list(signal: AbortSignal): Promise<ImportsListResult> {
      if (signal.aborted) return { kind: "aborted" };
      const t = withTimeout(signal);
      try {
        const res = await doFetch("/api/paypal/imports", {
          ...base,
          method: "GET",
          headers: { "cache-control": "no-store" },
          signal: t.signal,
        });
        switch (res.status) {
          case 200: {
            let body: unknown = null;
            try {
              body = await res.json();
            } catch {
              return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
            }
            const items = parseImportsResponse(body);
            if (!items) return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
            return signal.aborted ? { kind: "aborted" } : { kind: "ok", items };
          }
          case 401:
            return { kind: "unauthorized" };
          case 403:
            return { kind: "forbidden" };
          case 503: {
            let error: string | null = null;
            try {
              const body: unknown = await res.json();
              if (isRecord(body) && typeof body["error"] === "string") error = body["error"];
            } catch {
              /* an unreadable 503 is still unavailable */
            }
            return error === "sync_disabled" ? { kind: "disabled" } : { kind: "unavailable" };
          }
          default:
            return signal.aborted ? { kind: "aborted" } : { kind: "unavailable" };
        }
      } catch {
        if (signal.aborted) return { kind: "aborted" };
        return t.signal.aborted ? { kind: "timeout" } : { kind: "offline" };
      } finally {
        t.done();
      }
    },
  };
}

export type ImportsApi = ReturnType<typeof createImportsApi>;
