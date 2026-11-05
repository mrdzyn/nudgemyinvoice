/**
 * Typed same-origin transport for the NMI-P6 AI nudge queue:
 *   GET  /api/nudges/summary                      (real counts + whether AI drafting is configured)
 *   GET  /api/nudges?view=pending|approved|history[&invoiceId=]
 *   POST /api/invoice-drafts/:id/nudges           (draft ONE nudge: one bounded, costed AI call)
 *   POST /api/nudges/:id/edit | approve | reject  (version-bound review transitions)
 * Nothing here sends, schedules or dispatches a message: "approve" means approved for the operator's OWN manual
 * use, and every nudge the server returns must say `sentToCustomer: false` or it is refused as malformed.
 * Responses are UNTRUSTED and strictly validated. The CSRF token is supplied per call from memory.
 */
import type { FetchLike } from "../auth/api.js";
import { isRecord, isUuid, isValidInstant, text } from "../domain/serverInvoice.js";

export const NUDGE_TONES = ["friendly", "professional", "firm"] as const;
export type NudgeTone = (typeof NUDGE_TONES)[number];
export type NudgeStatus = "pending_review" | "approved" | "rejected" | "superseded";
export type NudgeView = "pending" | "approved" | "history";
export const NUDGE_MAX_MESSAGE = 2000;

export interface NudgeFacts {
  currency: string;
  /** Exact, code-prefixed amount as rendered into the message, e.g. "USD 1,200.00". */
  amount: string;
  dueDate: string;
  /** Calendar days from the due date to `asOfDate` (negative = before the due date). Date-only. */
  daysPastDue: number;
  asOfDate: string;
  timeZone: string;
  invoiceRef: string;
}

export interface NudgeInvoiceRef {
  customerName: string;
  currency: string;
  total: string;
  dueDate: string;
}

export interface NudgeItem {
  id: string;
  invoiceId: string;
  tone: NudgeTone;
  status: NudgeStatus;
  message: string;
  aiMessage: string;
  rationale: string;
  facts: NudgeFacts;
  model: string;
  edited: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  supersededAt: string | null;
  /** Present on list answers; mutation answers carry no invoice context (the caller keeps it). */
  invoice: NudgeInvoiceRef | null;
}

export interface NudgeCounts {
  pending: number;
  approved: number;
  rejected: number;
  superseded: number;
  total: number;
}

type Failure = "unauthorized" | "unavailable" | "malformed" | "offline" | "aborted";

export type SummaryOutcome =
  { kind: "ok"; counts: NudgeCounts; aiAvailable: boolean } | { kind: Failure };

export type NudgeListOutcome = { kind: "ok"; items: NudgeItem[] } | { kind: Failure };

export interface PendingRef {
  id: string;
  version: number;
}

export type GenerateOutcome =
  | { kind: "ok"; nudge: NudgeItem }
  /** 409: this invoice already has a draft waiting for review; replacing it must name it. */
  | { kind: "pending-exists"; pending: PendingRef }
  /** 409: the pending draft named for replacement changed (another tab). */
  | { kind: "version-conflict"; pending: PendingRef | null }
  /** 429: the per-operator drafting budget is used up for now. */
  | { kind: "rate-limited"; retryAfterSeconds: number }
  /** 429: too many drafts in flight right now. */
  | { kind: "busy" }
  /** 503: no model configured, or the provider failed. Nothing was stored. */
  | { kind: "ai-unavailable" }
  /** 422: the AI's output failed the server's checks. Nothing was stored. */
  | { kind: "ai-rejected" }
  | { kind: "not-found" | "invalid" | "forbidden" }
  | { kind: Failure };

export type TransitionOutcome =
  | { kind: "ok"; nudge: NudgeItem }
  | { kind: "version-conflict" | "not-pending" | "not-found" | "invalid" | "forbidden" }
  | { kind: Failure };

export interface NudgeApi {
  summary(signal: AbortSignal): Promise<SummaryOutcome>;
  list(view: NudgeView, invoiceId: string | null, signal: AbortSignal): Promise<NudgeListOutcome>;
  generate(
    invoiceId: string,
    input: { tone: NudgeTone; timeZone: string; replace: PendingRef | null },
    csrfToken: string,
    signal: AbortSignal,
  ): Promise<GenerateOutcome>;
  edit(
    id: string,
    version: number,
    message: string,
    csrfToken: string,
    signal: AbortSignal,
  ): Promise<TransitionOutcome>;
  approve(
    id: string,
    version: number,
    csrfToken: string,
    signal: AbortSignal,
  ): Promise<TransitionOutcome>;
  reject(
    id: string,
    version: number,
    csrfToken: string,
    signal: AbortSignal,
  ): Promise<TransitionOutcome>;
}

const STATUSES: readonly string[] = ["pending_review", "approved", "rejected", "superseded"];
const VIEW_STATUSES: Record<NudgeView, readonly NudgeStatus[]> = {
  pending: ["pending_review"],
  approved: ["approved"],
  history: ["rejected", "superseded"],
};
const ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[0-9a-f]{8}$/;
/** Like `text`, but a message may contain ordinary line breaks and tabs (no other control characters). */
export const isMultiline = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" &&
  v.length >= min &&
  v.length <= max &&
  Array.from(v).every((c) => {
    const n = c.charCodeAt(0);
    return !((n < 0x20 && n !== 9 && n !== 10 && n !== 13) || n === 0x7f);
  });
const COUNT = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000;
const VERSION = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1_000_000;
const instantOrNull = (v: unknown): v is string | null => v === null || isValidInstant(v);

function parseFacts(v: unknown): NudgeFacts | null {
  if (!isRecord(v)) return null;
  const { currency, amount, dueDate, daysPastDue, asOfDate, timeZone, invoiceRef } = v;
  if (
    typeof currency !== "string" ||
    !CURRENCY.test(currency) ||
    !text(amount, 5, 40) ||
    !amount.startsWith(`${currency} `) ||
    typeof dueDate !== "string" ||
    !ISO_DATE.test(dueDate) ||
    typeof asOfDate !== "string" ||
    !ISO_DATE.test(asOfDate) ||
    !Number.isInteger(daysPastDue) ||
    Math.abs(daysPastDue as number) > 100_000 ||
    typeof timeZone !== "string" ||
    timeZone.length > 64 ||
    !ZONE.test(timeZone) ||
    typeof invoiceRef !== "string" ||
    !REF.test(invoiceRef)
  )
    return null;
  return {
    currency,
    amount,
    dueDate,
    daysPastDue: daysPastDue as number,
    asOfDate,
    timeZone,
    invoiceRef,
  };
}

function parseInvoiceRef(v: unknown): NudgeInvoiceRef | null {
  if (
    !isRecord(v) ||
    !text(v["customerName"], 1, 200) ||
    typeof v["currency"] !== "string" ||
    !CURRENCY.test(v["currency"]) ||
    !text(v["total"], 1, 40) ||
    typeof v["dueDate"] !== "string" ||
    !ISO_DATE.test(v["dueDate"])
  )
    return null;
  return {
    customerName: v["customerName"],
    currency: v["currency"],
    total: v["total"],
    dueDate: v["dueDate"],
  };
}

/** Strict parse of one nudge. Anything unexpected — including `sentToCustomer` not exactly false — is refused. */
export function parseNudge(v: unknown, withInvoice: boolean): NudgeItem | null {
  if (!isRecord(v)) return null;
  const {
    id,
    invoiceId,
    tone,
    status,
    message,
    aiMessage,
    rationale,
    model,
    promptVersion,
    edited,
    version,
    createdAt,
    updatedAt,
    approvedAt,
    rejectedAt,
    supersededAt,
    sentToCustomer,
  } = v;
  const facts = parseFacts(v["facts"]);
  if (
    !isUuid(id) ||
    !isUuid(invoiceId) ||
    typeof tone !== "string" ||
    !(NUDGE_TONES as readonly string[]).includes(tone) ||
    typeof status !== "string" ||
    !STATUSES.includes(status) ||
    !isMultiline(message, 1, NUDGE_MAX_MESSAGE) ||
    !isMultiline(aiMessage, 1, NUDGE_MAX_MESSAGE) ||
    !text(rationale, 1, 600) ||
    !text(model, 1, 100) ||
    !text(promptVersion, 1, 40) ||
    typeof edited !== "boolean" ||
    !VERSION(version) ||
    !isValidInstant(createdAt) ||
    !isValidInstant(updatedAt) ||
    !instantOrNull(approvedAt) ||
    !instantOrNull(rejectedAt) ||
    !instantOrNull(supersededAt) ||
    (status === "approved") !== (approvedAt !== null) ||
    (status === "rejected") !== (rejectedAt !== null) ||
    (status === "superseded") !== (supersededAt !== null) ||
    sentToCustomer !== false ||
    !facts
  )
    return null;
  let invoice: NudgeInvoiceRef | null = null;
  if (withInvoice) {
    invoice = parseInvoiceRef(v["invoice"]);
    if (!invoice) return null;
  }
  return {
    id,
    invoiceId,
    tone: tone as NudgeTone,
    status: status as NudgeStatus,
    message,
    aiMessage,
    rationale,
    facts,
    model,
    edited,
    version,
    createdAt,
    updatedAt,
    approvedAt,
    rejectedAt,
    supersededAt,
    invoice,
  };
}

function parsePending(v: unknown): PendingRef | null {
  return isRecord(v) && isUuid(v["id"]) && VERSION(v["version"])
    ? { id: v["id"], version: v["version"] }
    : null;
}

export function createNudgeApi(doFetch: FetchLike = (input, init) => fetch(input, init)): NudgeApi {
  const base: RequestInit = { credentials: "same-origin", cache: "no-store", redirect: "error" };

  async function read(
    path: string,
    signal: AbortSignal,
  ): Promise<Response | "aborted" | "offline"> {
    try {
      return await doFetch(path, {
        ...base,
        method: "GET",
        headers: { "cache-control": "no-store" },
        signal,
      });
    } catch {
      return signal.aborted ? "aborted" : "offline";
    }
  }

  async function post(
    path: string,
    csrfToken: string,
    signal: AbortSignal,
    json: Record<string, unknown>,
  ): Promise<Response | "aborted" | "offline"> {
    try {
      return await doFetch(path, {
        ...base,
        method: "POST",
        headers: {
          "cache-control": "no-store",
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        body: JSON.stringify(json),
        signal,
      });
    } catch {
      return signal.aborted ? "aborted" : "offline";
    }
  }

  async function body(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }

  async function transition(
    path: string,
    csrfToken: string,
    signal: AbortSignal,
    json: Record<string, unknown>,
  ): Promise<TransitionOutcome> {
    const res = await post(path, csrfToken, signal, json);
    if (res === "aborted" || res === "offline") return { kind: res };
    switch (res.status) {
      case 200: {
        const b = await body(res);
        if (signal.aborted) return { kind: "aborted" };
        const n = parseNudge(b, false);
        return n ? { kind: "ok", nudge: n } : { kind: "malformed" };
      }
      case 400:
        return { kind: "invalid" };
      case 401:
        return { kind: "unauthorized" };
      case 403:
        return { kind: "forbidden" };
      case 404:
        return { kind: "not-found" };
      case 409: {
        const b = await body(res);
        const e = isRecord(b) ? b["error"] : null;
        return e === "version_conflict"
          ? { kind: "version-conflict" }
          : e === "not_pending"
            ? { kind: "not-pending" }
            : { kind: "unavailable" };
      }
      default:
        return { kind: "unavailable" };
    }
  }

  return {
    async summary(signal) {
      const res = await read("/api/nudges/summary", signal);
      if (res === "aborted" || res === "offline") return { kind: res };
      if (res.status === 401) return { kind: "unauthorized" };
      if (res.status !== 200) return { kind: "unavailable" };
      const b = await body(res);
      if (signal.aborted) return { kind: "aborted" };
      if (!isRecord(b) || typeof b["aiAvailable"] !== "boolean" || !isRecord(b["counts"]))
        return { kind: "malformed" };
      const c = b["counts"];
      const { pending, approved, rejected, superseded, total } = c;
      if (
        !COUNT(pending) ||
        !COUNT(approved) ||
        !COUNT(rejected) ||
        !COUNT(superseded) ||
        !COUNT(total) ||
        total !== pending + approved + rejected + superseded
      )
        return { kind: "malformed" };
      return {
        kind: "ok",
        counts: { pending, approved, rejected, superseded, total },
        aiAvailable: b["aiAvailable"],
      };
    },

    async list(view, invoiceId, signal) {
      if (invoiceId !== null && !isUuid(invoiceId)) return { kind: "malformed" };
      const res = await read(
        invoiceId === null
          ? `/api/nudges?view=${view}`
          : `/api/nudges?view=${view}&invoiceId=${invoiceId}`,
        signal,
      );
      if (res === "aborted" || res === "offline") return { kind: res };
      if (res.status === 401) return { kind: "unauthorized" };
      if (res.status !== 200) return { kind: "unavailable" };
      const b = await body(res);
      if (signal.aborted) return { kind: "aborted" };
      if (
        !isRecord(b) ||
        b["view"] !== view ||
        !Array.isArray(b["items"]) ||
        b["items"].length > 100
      )
        return { kind: "malformed" };
      const items: NudgeItem[] = [];
      for (const raw of b["items"]) {
        const n = parseNudge(raw, true);
        // Every item must belong to the requested view (and invoice), or the whole answer is refused.
        if (
          !n ||
          !VIEW_STATUSES[view].includes(n.status) ||
          (invoiceId !== null && n.invoiceId !== invoiceId)
        )
          return { kind: "malformed" };
        items.push(n);
      }
      return { kind: "ok", items };
    },

    async generate(invoiceId, input, csrfToken, signal) {
      if (!isUuid(invoiceId)) return { kind: "not-found" };
      const res = await post(`/api/invoice-drafts/${invoiceId}/nudges`, csrfToken, signal, {
        tone: input.tone,
        timeZone: input.timeZone,
        ...(input.replace
          ? { replace: { id: input.replace.id, version: input.replace.version } }
          : {}),
      });
      if (res === "aborted" || res === "offline") return { kind: res };
      // P6-AUD-03: a RECEIVED 401 outranks cancellation (it must still end the session), so it is decided from the
      // status line before the body is read and before the abort check.
      if (res.status === 401) return { kind: "unauthorized" };
      const b = await body(res);
      if (signal.aborted) return { kind: "aborted" };
      const e = isRecord(b) ? b["error"] : null;
      switch (res.status) {
        case 201: {
          const n = parseNudge(b, false);
          return n && n.invoiceId === invoiceId && n.status === "pending_review"
            ? { kind: "ok", nudge: n }
            : { kind: "malformed" };
        }
        case 400:
          return { kind: "invalid" };
        case 401:
          return { kind: "unauthorized" };
        case 403:
          return { kind: "forbidden" };
        case 404:
          return { kind: "not-found" };
        case 409: {
          const pending = isRecord(b) ? parsePending(b["pending"]) : null;
          if (e === "pending_exists")
            return pending ? { kind: "pending-exists", pending } : { kind: "malformed" };
          if (e === "version_conflict") return { kind: "version-conflict", pending };
          return { kind: "unavailable" };
        }
        case 422:
          return e === "ai_output_rejected" ? { kind: "ai-rejected" } : { kind: "unavailable" };
        case 429: {
          if (e === "busy") return { kind: "busy" };
          const s = isRecord(b) ? b["retryAfterSeconds"] : null;
          return {
            kind: "rate-limited",
            retryAfterSeconds: Number.isInteger(s) && (s as number) > 0 ? (s as number) : 60,
          };
        }
        case 503:
          return { kind: "ai-unavailable" };
        default:
          return { kind: "unavailable" };
      }
    },

    edit(id, version, message, csrfToken, signal) {
      if (!isUuid(id)) return Promise.resolve({ kind: "not-found" });
      return transition(`/api/nudges/${id}/edit`, csrfToken, signal, { version, message });
    },
    approve(id, version, csrfToken, signal) {
      if (!isUuid(id)) return Promise.resolve({ kind: "not-found" });
      return transition(`/api/nudges/${id}/approve`, csrfToken, signal, { version });
    },
    reject(id, version, csrfToken, signal) {
      if (!isUuid(id)) return Promise.resolve({ kind: "not-found" });
      return transition(`/api/nudges/${id}/reject`, csrfToken, signal, { version });
    },
  };
}
