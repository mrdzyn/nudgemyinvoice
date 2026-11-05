/**
 * NMI-P6: deterministic reading of a Nudgey request to DRAFT a payment nudge ("draft a firm nudge for Zorblax").
 * Pure: no model, no network, no storage. It only proposes; the operator still picks the exact saved invoice and
 * confirms before the one costed AI call (approved D7). Requests to SEND, e-mail, text, schedule or dispatch get a
 * clear refusal: the application never contacts a customer.
 */
import type { NudgeTone } from "../nudges/api.js";
import { MAX_PROMPT_CHARS, MAX_SEARCH_TERM } from "./intent.js";

export type NudgeIntent =
  | { kind: "not-nudge" }
  | { kind: "draft"; tone: NudgeTone | null; term: string }
  | { kind: "clarify"; message: string }
  | { kind: "unsupported"; message: string };

export const NUDGE_EXAMPLE = "draft a friendly nudge for Northwind";

export const SEND_REFUSAL =
  "I can't send, e-mail, text, schedule or deliver anything — NudgeMyInvoice never contacts your customers. " +
  `I can draft a nudge for you to review: try “${NUDGE_EXAMPLE}”. You copy and send approved messages yourself.`;

export const NUDGE_CLARIFY = `Which customer is it for? For example “${NUDGE_EXAMPLE}”.`;

const NUDGE_WORD = /\b(nudges?|payment reminders?|reminder messages?|follow[- ]?up messages?)\b/;
const SEND_WORD =
  /\b(send|sends|sending|sent|e-?mail|e-?mailing|text|sms|whatsapp|message them|dispatch|deliver|auto(?:matically)?|schedule|post)\b/;
const TONE = /\b(friendly|professional|firm)\b/;
const DRAFT =
  /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:draft|write|prepare|compose|create|make|generate)\s+(?:me\s+)?(?:a\s+|an\s+|another\s+|one\s+)?(?:new\s+)?(?:(friendly|professional|firm)\s+)?(?:payment\s+)?(?:nudge|reminder message|follow[- ]?up message|payment reminder)(?:\s+(?:for|to)\s+(.+?))?(?:,?\s+(?:in\s+)?(?:a\s+)?(friendly|professional|firm)(?:\s+tone)?)?$/i;

const STOP_TERMS = new Set([
  "me",
  "my",
  "all",
  "them",
  "it",
  "this",
  "that",
  "the",
  "a",
  "him",
  "her",
]);

function cleanTerm(raw: string | undefined): string | null {
  const term = (raw ?? "")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^(?:the\s+)?(?:customer|client|invoice)\s+(?:for\s+|named\s+|called\s+)?/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (term.length < 2 || term.length > MAX_SEARCH_TERM) return null;
  if (STOP_TERMS.has(term.toLowerCase())) return null;
  return term;
}

const hasControl = (s: string) =>
  Array.from(s).some((c) => {
    const n = c.charCodeAt(0);
    return n < 0x20 || n === 0x7f;
  });

export function parseNudgeIntent(input: string): NudgeIntent {
  if (input.length > MAX_PROMPT_CHARS || hasControl(input)) return { kind: "not-nudge" };
  const text = input
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?.!]+$/g, "")
    .trim();
  const lower = text.toLowerCase();
  if (!lower) return { kind: "not-nudge" };
  // "send it", "email them", "send the nudge to Acme", "text Northwind a reminder": never an action.
  if (/^(?:please\s+)?(?:send|e-?mail|text|sms|whatsapp|dispatch|deliver)\b/.test(lower))
    return { kind: "unsupported", message: SEND_REFUSAL };
  if (!NUDGE_WORD.test(lower)) return { kind: "not-nudge" };
  const m = DRAFT.exec(text);
  if (!m) {
    if (SEND_WORD.test(lower)) return { kind: "unsupported", message: SEND_REFUSAL };
    // Mentions a nudge but is not a draft request we understand: guide rather than guess.
    return /^(?:please\s+)?(?:draft|write|prepare|compose|create|make|generate)\b/.test(lower)
      ? { kind: "clarify", message: NUDGE_CLARIFY }
      : { kind: "not-nudge" };
  }
  // A send word OUTSIDE the customer name ("…nudge, then email it"), or a send instruction chained onto the
  // name ("for Acme and email it"), is refused; a customer that merely contains such a word ("Text Co") is not.
  const residue = lower.replace((m[2] ?? "").toLowerCase(), " ");
  if (
    SEND_WORD.test(residue) ||
    /\b(?:and|then|&)\s+(?:send|e-?mail|text|sms|whatsapp|dispatch|deliver|schedule)\b/i.test(
      m[2] ?? "",
    )
  )
    return { kind: "unsupported", message: SEND_REFUSAL };
  const toneWord = (m[1] ?? m[3] ?? TONE.exec(lower)?.[1] ?? null) as NudgeTone | null;
  const term = cleanTerm(m[2]);
  if (!term) return { kind: "clarify", message: NUDGE_CLARIFY };
  return { kind: "draft", tone: toneWord, term };
}
