import { formatDateOnly } from "../followups/schedule.js";
import type { GenerateOutcome, NudgeFacts, NudgeTone } from "./api.js";

export const TONE_LABEL: Record<NudgeTone, string> = {
  friendly: "Friendly",
  professional: "Professional",
  firm: "Firm",
};

export const TONE_HINT: Record<NudgeTone, string> = {
  friendly: "Warm and relaxed — good before or just after the due date.",
  professional: "Courteous and concise — a safe default.",
  firm: "Direct about asking for a payment update, still polite. Never threatening.",
};

export const TONE_BADGE: Record<NudgeTone, "ok" | "info" | "warn"> = {
  friendly: "ok",
  professional: "info",
  firm: "warn",
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Where the as-of date falls relative to the DUE DATE. Date-only by design (owner refinement 1): a due date says
 * nothing about whether an invoice has been paid, so this never says "unpaid", "overdue" or "outstanding".
 */
export function dueDateText(daysPastDue: number): string {
  if (daysPastDue < 0) return `Due in ${plural(-daysPastDue, "day")}`;
  if (daysPastDue === 0) return "Due date is today";
  return `${plural(daysPastDue, "day")} after the due date`;
}

export function dueDateBadge(daysPastDue: number): "neutral" | "warn" {
  return daysPastDue > 0 ? "warn" : "neutral";
}

export const factsAsOf = (f: NudgeFacts) => formatDateOnly(f.asOfDate);

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** A server instant in the operator's local time, e.g. "Nov 5, 2026, 11:58 AM". */
export function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : WHEN.format(new Date(t));
}

/** Operator-facing text for a draft attempt that produced no draft. Nothing was stored in any of these cases. */
export function generateFailureText(
  r: Exclude<GenerateOutcome, { kind: "ok" } | { kind: "pending-exists" } | { kind: "aborted" }>,
): { kind: "warn" | "err" | "info"; title: string; body: string } {
  switch (r.kind) {
    case "rate-limited":
      return {
        kind: "warn",
        title: "You've reached the drafting limit for now.",
        body: `Try again in about ${plural(Math.max(1, Math.ceil(r.retryAfterSeconds / 60)), "minute")}. This keeps AI cost bounded. Nothing was saved.`,
      };
    case "busy":
      return {
        kind: "warn",
        title: "Another draft is still being written.",
        body: "Wait a moment and try again. Nothing was saved.",
      };
    case "ai-unavailable":
      return {
        kind: "warn",
        title: "AI drafting isn't available right now.",
        body: "Nothing was saved. You can still review, approve and copy existing drafts.",
      };
    case "ai-rejected":
      return {
        kind: "warn",
        title: "The AI's draft didn't pass our checks,",
        body: "so nothing was saved (for example it invented a number, a link or a payment-status claim). Try again or choose another tone.",
      };
    case "version-conflict":
      return {
        kind: "warn",
        title: "The pending draft changed in another tab.",
        body: "Reload to see the latest draft before replacing it. Nothing was saved.",
      };
    case "not-found":
      return {
        kind: "err",
        title: "This saved invoice could not be found.",
        body: "Nothing was saved.",
      };
    case "offline":
      return {
        kind: "err",
        title: "Could not reach the server.",
        body: "Nothing was saved. Check your connection and try again.",
      };
    case "forbidden":
      return {
        kind: "err",
        title: "The server did not accept this request.",
        body: "Reload the page and try again. Nothing was saved.",
      };
    case "invalid":
    case "malformed":
    case "unavailable":
    case "unauthorized":
    case "aborted":
      return {
        kind: "err",
        title: "The draft could not be created.",
        body: "Nothing was saved. Try again in a moment.",
      };
  }
}

/** Client-side check before saving edits (the server enforces the same rules). */
export function editProblem(message: string): string | null {
  const t = message.trim();
  if (t.length === 0) return "The message can't be empty.";
  if (t.length > 2000) return `The message is ${t.length - 2000} characters over the 2,000 limit.`;
  const bad = Array.from(t).some((c) => {
    const n = c.charCodeAt(0);
    return (n < 0x20 && n !== 9 && n !== 10 && n !== 13) || n === 0x7f;
  });
  return bad ? "The message contains characters that can't be saved." : null;
}
