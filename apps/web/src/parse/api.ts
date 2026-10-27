/**
 * Typed same-origin transport for `POST /api/invoice-drafts/parse`, the only invoice route the web
 * app may call in C2. The 200 body is UNTRUSTED: it is validated field by field and anything that
 * is not exactly one of the four documented outcomes fails closed (`malformed`) without reaching
 * the review form. The CSRF token is passed per call from volatile React memory and never stored.
 */
import {
  exactKeys,
  isRecord,
  MAX_MESSAGE,
  parseDraft,
  parseTotals,
  text,
} from "../domain/serverInvoice.js";
import type { ParseOutcome } from "../domain/types.js";
import type { FetchLike } from "../auth/api.js";

export const MAX_QUESTIONS = 10;
export const MAX_ERRORS = 20;

export type ParseResult =
  | { kind: "outcome"; outcome: ParseOutcome }
  | { kind: "rejected"; messages: string[] } // 400: the request body was refused
  | { kind: "unauthorized" } // 401: session is gone
  | { kind: "forbidden" } // 403: Origin or CSRF refused
  | { kind: "throttled"; retryAfterSeconds: number | null } // 429
  | { kind: "unavailable" } // 503 and other server errors
  | { kind: "malformed" } // 200 with a body that is not a documented outcome
  | { kind: "offline" } // network failure
  | { kind: "aborted" };

const FIELDS = ["customerName", "customerEmail", "currency", "lineItems", "dueDate", "other"];

/** Validates the HTTP 200 body. Returns null for anything that is not exactly a documented outcome. */
export function validateParseOutcome(body: unknown): ParseOutcome | null {
  if (!isRecord(body)) return null;
  switch (body["status"]) {
    case "draft": {
      if (!exactKeys(body, ["status", "draft", "totals"])) return null;
      const draft = parseDraft(body["draft"]);
      if (!draft) return null;
      const totals = parseTotals(body["totals"], draft);
      return totals ? { status: "draft", draft, totals } : null;
    }
    case "needs_clarification": {
      if (!exactKeys(body, ["status", "questions"])) return null;
      const qs = body["questions"];
      if (!Array.isArray(qs) || qs.length < 1 || qs.length > MAX_QUESTIONS) return null;
      const questions: { field: string; question: string }[] = [];
      for (const q of qs) {
        if (!isRecord(q) || !exactKeys(q, ["field", "question"])) return null;
        if (typeof q["field"] !== "string" || !FIELDS.includes(q["field"])) return null;
        if (!text(q["question"], 1, MAX_MESSAGE)) return null;
        questions.push({ field: q["field"], question: q["question"] });
      }
      return { status: "needs_clarification", questions };
    }
    case "invalid": {
      if (!exactKeys(body, ["status", "errors"])) return null;
      const es = body["errors"];
      if (!Array.isArray(es) || es.length < 1 || es.length > MAX_ERRORS) return null;
      const errors: { path: string; message: string }[] = [];
      for (const e of es) {
        if (!isRecord(e) || !exactKeys(e, ["path", "message"])) return null;
        if (typeof e["path"] !== "string" || e["path"].length > 120) return null;
        if (!text(e["message"], 1, MAX_MESSAGE)) return null;
        errors.push({ path: e["path"], message: e["message"] });
      }
      return { status: "invalid", errors };
    }
    case "unavailable": {
      if (!exactKeys(body, ["status", "fallback", "reason"])) return null;
      if (body["fallback"] !== "manual_entry") return null;
      if (typeof body["reason"] !== "string" || !/^[a-z_]{1,60}$/.test(body["reason"])) return null;
      return { status: "unavailable", fallback: "manual_entry", reason: body["reason"] };
    }
    default:
      return null;
  }
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (raw === null || !/^\d{1,5}$/.test(raw.trim())) return null;
  return Number(raw);
}

/** 400 issues are server-authored; keep only short printable messages, never the raw JSON. */
function rejectedMessages(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body["issues"])) return [];
  const out: string[] = [];
  for (const i of body["issues"].slice(0, MAX_ERRORS)) {
    if (isRecord(i) && text(i["message"], 1, MAX_MESSAGE)) out.push(i["message"]);
  }
  return out;
}

export interface ParseApi {
  parse(description: string, csrfToken: string, signal: AbortSignal): Promise<ParseResult>;
}

export function createParseApi(doFetch: FetchLike = (input, init) => fetch(input, init)): ParseApi {
  return {
    async parse(description, csrfToken, signal) {
      let res: Response;
      try {
        res = await doFetch("/api/invoice-drafts/parse", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ text: description }),
          signal,
        });
      } catch {
        return signal.aborted ? { kind: "aborted" } : { kind: "offline" };
      }
      switch (res.status) {
        case 200:
          try {
            const outcome = validateParseOutcome(await res.json());
            return outcome ? { kind: "outcome", outcome } : { kind: "malformed" };
          } catch {
            return signal.aborted ? { kind: "aborted" } : { kind: "malformed" };
          }
        case 400: {
          let messages: string[] = [];
          try {
            messages = rejectedMessages(await res.json());
          } catch {
            /* an unreadable 400 body still means "rejected" */
          }
          return { kind: "rejected", messages };
        }
        case 401:
          return { kind: "unauthorized" };
        case 403:
          return { kind: "forbidden" };
        case 429:
          return { kind: "throttled", retryAfterSeconds: retryAfter(res) };
        default:
          return { kind: "unavailable" };
      }
    },
  };
}
