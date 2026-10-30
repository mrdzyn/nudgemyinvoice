/**
 * Deterministic, rule-based reading of what the operator typed into Nudgey (NMI-NDG-02 C1). No model,
 * no network, no storage: a pure function from text to ONE bounded intent. Anything it does not
 * recognise becomes `help`; payment questions become `payment-unsupported` (payment status is not
 * known to this application, so it never answers them from saved or PayPal-draft data).
 */
import { CURRENCY_CODES, type CurrencyCode } from "../domain/types.js";

export const MAX_PROMPT_CHARS = 200;
export const MAX_SEARCH_TERM = 100;

/** The four PayPal-operation categories the server can filter by. NOT payment states. */
export type PayPalGroup = "none" | "progress" | "created" | "attention";

export type Intent =
  | { kind: "pending" }
  | { kind: "list"; currency: CurrencyCode | null; status: PayPalGroup | null }
  | { kind: "search"; term: string }
  | { kind: "followups"; which: "due" | "upcoming" | "all" }
  | { kind: "payment-unsupported" }
  | { kind: "help" };

export type ParseOutcome =
  { ok: true; intent: Intent } | { ok: false; reason: "empty" | "too-long" | "control-characters" };

export const EXAMPLE_QUESTIONS = [
  "What are my pending invoices?",
  "Show my USD invoices",
  "Find invoices for Northwind Studio",
  "Which follow-ups are due?",
  "What follow-ups are upcoming?",
] as const;

const hasControl = (s: string) =>
  Array.from(s).some((c) => {
    const n = c.charCodeAt(0);
    return n < 0x20 || n === 0x7f;
  });

const STOP_TERMS = new Set(["me", "my", "all", "any", "them", "it", "everything", "the", "a"]);

/** A customer search term from the original (case-preserved) text, or null if there is nothing usable. */
function cleanTerm(raw: string): string | null {
  const term = raw
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (term.length < 2 || term.length > MAX_SEARCH_TERM) return null;
  if (STOP_TERMS.has(term.toLowerCase())) return null;
  return term;
}

const currencyIn = (lower: string): CurrencyCode | null => {
  for (const c of CURRENCY_CODES) if (new RegExp(`\\b${c.toLowerCase()}\\b`).test(lower)) return c;
  return null;
};

export function parseIntent(input: string): ParseOutcome {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (input.length > MAX_PROMPT_CHARS) return { ok: false, reason: "too-long" };
  if (hasControl(text)) return { ok: false, reason: "control-characters" };
  const lower = text
    .toLowerCase()
    .replace(/[?.!]+$/g, "")
    .trim();
  const ok = (intent: Intent): ParseOutcome => ({ ok: true, intent });

  // 2. An explicit customer search: "find invoices for X", "invoices from X", "customer X".
  const search =
    /^(?:find|search|look up|lookup|show|list|get|see)\s+(?:me\s+)?(?:all\s+)?(?:my\s+)?invoices?\s+(?:for|from|of|to|with|named|called)\s+(.+)$/i.exec(
      text.replace(/[?.!]+$/g, "").trim(),
    ) ??
    /^(?:find|search|look up|lookup|show)\s+(?:me\s+)?(?:the\s+)?customer\s+(?:named\s+|called\s+)?(.+)$/i.exec(
      text.replace(/[?.!]+$/g, "").trim(),
    ) ??
    /^invoices?\s+(?:for|from|of|to)\s+(.+)$/i.exec(text.replace(/[?.!]+$/g, "").trim());
  if (search) {
    const term = cleanTerm(search[1] ?? "");
    return term ? ok({ kind: "search", term }) : ok({ kind: "help" });
  }

  // "invoices for <nothing usable>" is a malformed search, never a request to list everything.
  if (/\binvoices?\s+(?:for|from|of|to|named|called)\b/.test(lower)) return ok({ kind: "help" });

  // Nudgey C1 is read-only: a request to change, send or remind is never turned into an action.
  if (
    /\b(delete|remove|cancel|send|email|e-mail|mail|create|add|update|edit|change|mark|pay|refund|charge|remind|schedule|reschedule|complete|resend)\b/.test(
      lower,
    )
  )
    return ok({ kind: "help" });

  // Follow-ups (local reminders). "overdue" here means a due reminder, never an unpaid invoice.
  if (/\bfollow[- ]?ups?\b/.test(lower)) {
    if (/\bupcoming\b|\bscheduled\b|\bcoming up\b|\bnext\b|\blater\b/.test(lower))
      return ok({ kind: "followups", which: "upcoming" });
    if (/\bdue\b|\boverdue\b|\bnow\b|\btoday\b|\bpending\b/.test(lower))
      return ok({ kind: "followups", which: "due" });
    return ok({ kind: "followups", which: "all" });
  }

  // 3. Payment claims are NOT answerable: no payment reconciliation exists.
  if (
    /\b(paid|unpaid|overdue|outstanding|owe|owes|owed|owing|payment|payments|receivable|late)\b/.test(
      lower,
    ) ||
    /\bpast due\b|\bhas .* paid\b|\bgot paid\b/.test(lower)
  )
    return ok({ kind: "payment-unsupported" });

  // 4. "Pending" / "needs attention": PayPal DRAFT operation categories, not payment state.
  if (
    /\b(pending|needs? attention|waiting|open|incomplete)\b/.test(lower) &&
    /\binvoices?\b/.test(lower)
  )
    return ok({ kind: "pending" });

  // 5. A plain list, optionally narrowed by currency and/or PayPal draft state.
  if (/\binvoices?\b|\bpaypal drafts?\b|\bdrafts?\b/.test(lower)) {
    if (!/\b(show|list|view|see|display|get|what|which|find)\b/.test(lower))
      return ok({ kind: "help" });
    const status: PayPalGroup | null = /\bno paypal draft\b|\bwithout (?:a )?paypal draft\b/.test(
      lower,
    )
      ? "none"
      : /\bpaypal drafts?\b|\bdrafts? created\b/.test(lower)
        ? "created"
        : /\b(?:rejected|failed|errors?)\b/.test(lower)
          ? "attention"
          : null;
    return ok({ kind: "list", currency: currencyIn(lower), status });
  }

  return ok({ kind: "help" });
}
