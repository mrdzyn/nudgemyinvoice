/**
 * Typed same-origin transport for the local follow-up scheduler (NMI-FUP-01):
 *   GET  /api/follow-ups                            (the operator's active follow-ups + due/upcoming counts)
 *   GET  /api/invoice-drafts/:id/follow-ups         (one invoice's active follow-up + recent history)
 *   POST /api/follow-ups                            (schedule)
 *   POST /api/follow-ups/:id/reschedule | complete | cancel
 * These are LOCAL reminders for the operator. Nothing here contacts a customer, PayPal or OpenAI.
 * Responses are UNTRUSTED and strictly validated. The CSRF token is supplied per call from memory.
 */
import type { FetchLike } from "../auth/api.js";
import { isRecord, isUuid, isValidInstant, text } from "../domain/serverInvoice.js";

export type FollowUpStatus = "active" | "completed" | "canceled";
export type FollowUpState = "due" | "upcoming" | "completed" | "canceled";

export interface FollowUpView {
  id: string;
  invoiceId: string;
  /** The real scheduled instant, UTC ISO 8601. */
  dueAt: string;
  /** IANA zone it was scheduled in; used only to display the instant back. */
  timezone: string;
  note: string | null;
  message: string;
  status: FollowUpStatus;
  state: FollowUpState;
  invoice: { customerName: string; currency: string; total: string; dueDate: string } | null;
}

export interface FollowUpInputBody {
  dueAt: string;
  timezone: string;
  note: string | null;
  message: string;
}

export type ListOutcome =
  | { kind: "ok"; now: string; counts: { due: number; upcoming: number }; items: FollowUpView[] }
  | { kind: "unauthorized" | "unavailable" | "malformed" | "offline" | "aborted" };

export type ForInvoiceOutcome =
  | { kind: "ok"; active: FollowUpView | null; recent: FollowUpView[] }
  | { kind: "not-found" | "unauthorized" | "unavailable" | "malformed" | "offline" | "aborted" };

export type MutationOutcome =
  | { kind: "ok"; followUp: FollowUpView }
  | {
      kind:
        | "duplicate" // 409 duplicate_active: this invoice already has an active follow-up
        | "not-active" // 409 not_active: already completed or canceled
        | "not-found"
        | "invalid" // 400: the server refused the values
        | "unauthorized"
        | "forbidden"
        | "unavailable"
        | "malformed"
        | "offline"
        | "aborted";
    };

export interface FollowUpApi {
  list(signal: AbortSignal): Promise<ListOutcome>;
  forInvoice(invoiceId: string, signal: AbortSignal): Promise<ForInvoiceOutcome>;
  create(
    invoiceId: string,
    input: FollowUpInputBody,
    csrfToken: string,
    signal: AbortSignal,
  ): Promise<MutationOutcome>;
  reschedule(
    id: string,
    input: FollowUpInputBody,
    csrfToken: string,
    signal: AbortSignal,
  ): Promise<MutationOutcome>;
  complete(id: string, csrfToken: string, signal: AbortSignal): Promise<MutationOutcome>;
  cancel(id: string, csrfToken: string, signal: AbortSignal): Promise<MutationOutcome>;
}

const STATUSES = ["active", "completed", "canceled"];
const STATES = ["due", "upcoming", "completed", "canceled"];
const ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;
const CURRENCY = /^[A-Z]{3}$/;
/** Like `text`, but a note or message may contain ordinary line breaks and tabs (no other control characters). */
const multiline = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" &&
  v.length >= min &&
  v.length <= max &&
  Array.from(v).every((c) => {
    const n = c.charCodeAt(0);
    return !((n < 0x20 && n !== 9 && n !== 10 && n !== 13) || n === 0x7f);
  });
const COUNT = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000;

export function parseFollowUp(v: unknown, withInvoice: boolean): FollowUpView | null {
  if (!isRecord(v)) return null;
  const {
    id,
    invoiceId,
    dueAt,
    timezone,
    note,
    message,
    status,
    state,
    sentToCustomer,
    createdAt,
    completedAt,
    canceledAt,
  } = v;
  if (
    !isUuid(id) ||
    !isUuid(invoiceId) ||
    !isValidInstant(dueAt) ||
    !isValidInstant(createdAt) ||
    typeof timezone !== "string" ||
    timezone.length > 64 ||
    !ZONE.test(timezone) ||
    !(note === null || multiline(note, 1, 500)) ||
    !multiline(message, 1, 2000) ||
    typeof status !== "string" ||
    !STATUSES.includes(status) ||
    typeof state !== "string" ||
    !STATES.includes(state) ||
    sentToCustomer !== false ||
    !(completedAt === null || isValidInstant(completedAt)) ||
    !(canceledAt === null || isValidInstant(canceledAt))
  )
    return null;
  let invoice: FollowUpView["invoice"] = null;
  if (withInvoice) {
    const i = v["invoice"];
    if (
      !isRecord(i) ||
      !text(i["customerName"], 1, 200) ||
      typeof i["currency"] !== "string" ||
      !CURRENCY.test(i["currency"]) ||
      !text(i["total"], 1, 40) ||
      !text(i["dueDate"], 10, 10)
    )
      return null;
    invoice = {
      customerName: i["customerName"],
      currency: i["currency"],
      total: i["total"],
      dueDate: i["dueDate"],
    };
  }
  return {
    id,
    invoiceId,
    dueAt,
    timezone,
    note,
    message,
    status: status as FollowUpStatus,
    state: state as FollowUpState,
    invoice,
  };
}

export function createFollowUpApi(
  doFetch: FetchLike = (input, init) => fetch(input, init),
): FollowUpApi {
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

  async function mutate(
    path: string,
    csrfToken: string,
    signal: AbortSignal,
    json: Record<string, unknown> | null,
  ): Promise<MutationOutcome> {
    let res: Response;
    try {
      res = await doFetch(path, {
        ...base,
        method: "POST",
        headers: {
          "cache-control": "no-store",
          "x-csrf-token": csrfToken,
          ...(json ? { "content-type": "application/json" } : {}),
        },
        ...(json ? { body: JSON.stringify(json) } : {}),
        signal,
      });
    } catch {
      return signal.aborted ? { kind: "aborted" } : { kind: "offline" };
    }
    switch (res.status) {
      case 200:
      case 201: {
        try {
          const fu = parseFollowUp(await res.json(), false);
          return fu ? { kind: "ok", followUp: fu } : { kind: "malformed" };
        } catch {
          return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
        }
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
        try {
          const b: unknown = await res.json();
          const e = isRecord(b) ? b["error"] : null;
          return e === "duplicate_active"
            ? { kind: "duplicate" }
            : e === "not_active"
              ? { kind: "not-active" }
              : { kind: "unavailable" };
        } catch {
          return { kind: "unavailable" };
        }
      }
      default:
        return { kind: "unavailable" };
    }
  }

  const body = (i: FollowUpInputBody): FollowUpInputBody => ({
    dueAt: i.dueAt,
    timezone: i.timezone,
    note: i.note,
    message: i.message,
  });

  return {
    async list(signal) {
      const res = await read("/api/follow-ups", signal);
      if (res === "aborted" || res === "offline") return { kind: res };
      if (res.status === 401) return { kind: "unauthorized" };
      if (res.status !== 200) return { kind: "unavailable" };
      try {
        const b: unknown = await res.json();
        if (
          !isRecord(b) ||
          !isValidInstant(b["now"]) ||
          !Array.isArray(b["items"]) ||
          b["items"].length > 100
        )
          return { kind: "malformed" };
        const counts = b["counts"];
        if (!isRecord(counts) || !COUNT(counts["due"]) || !COUNT(counts["upcoming"]))
          return { kind: "malformed" };
        const items: FollowUpView[] = [];
        for (const raw of b["items"]) {
          const fu = parseFollowUp(raw, true);
          if (!fu || fu.status !== "active") return { kind: "malformed" };
          items.push(fu);
        }
        const due = items.filter((i) => i.state === "due").length;
        if (counts["due"] !== due || counts["upcoming"] !== items.length - due)
          return { kind: "malformed" };
        return { kind: "ok", now: b["now"], counts: { due, upcoming: items.length - due }, items };
      } catch {
        return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
      }
    },
    async forInvoice(invoiceId, signal) {
      if (!isUuid(invoiceId)) return { kind: "not-found" };
      const res = await read(`/api/invoice-drafts/${invoiceId}/follow-ups`, signal);
      if (res === "aborted" || res === "offline") return { kind: res };
      if (res.status === 401) return { kind: "unauthorized" };
      if (res.status === 404) return { kind: "not-found" };
      if (res.status !== 200) return { kind: "unavailable" };
      try {
        const b: unknown = await res.json();
        if (!isRecord(b) || !Array.isArray(b["recent"]) || b["recent"].length > 10)
          return { kind: "malformed" };
        const active = b["active"] === null ? null : parseFollowUp(b["active"], false);
        if (b["active"] !== null && (!active || active.invoiceId !== invoiceId))
          return { kind: "malformed" };
        const recent: FollowUpView[] = [];
        for (const raw of b["recent"]) {
          const fu = parseFollowUp(raw, false);
          if (!fu || fu.invoiceId !== invoiceId) return { kind: "malformed" };
          recent.push(fu);
        }
        return { kind: "ok", active, recent };
      } catch {
        return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
      }
    },
    create(invoiceId, input, csrfToken, signal) {
      if (!isUuid(invoiceId)) return Promise.resolve({ kind: "not-found" });
      // The server body is strict: the invoice id travels with the schedule fields.
      return mutate("/api/follow-ups", csrfToken, signal, { invoiceId, ...body(input) });
    },
    reschedule(id, input, csrfToken, signal) {
      if (!isUuid(id)) return Promise.resolve({ kind: "not-found" });
      return mutate(`/api/follow-ups/${id}/reschedule`, csrfToken, signal, { ...body(input) });
    },
    complete(id, csrfToken, signal) {
      if (!isUuid(id)) return Promise.resolve({ kind: "not-found" });
      return mutate(`/api/follow-ups/${id}/complete`, csrfToken, signal, null);
    },
    cancel(id, csrfToken, signal) {
      if (!isUuid(id)) return Promise.resolve({ kind: "not-found" });
      return mutate(`/api/follow-ups/${id}/cancel`, csrfToken, signal, null);
    },
  };
}
