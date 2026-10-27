import { formFromDraft, type FormState } from "../domain/invoiceForm.js";
import type { ParseState } from "../demo/appState.js";
import type { ParseResult } from "./api.js";

type ParseFn = (description: string, signal: AbortSignal) => Promise<ParseResult>;

/**
 * At most one real parse request at a time. A result is delivered only if it belongs to the request
 * that is still current: aborting (navigation, sign-out, session end, unmount) or starting another
 * makes any late answer unreachable, so stale or out-of-order responses can never reach the UI.
 */
export function createParseRunner(parse: ParseFn, onResult: (r: ParseResult) => void) {
  let current: AbortController | null = null;
  return {
    get pending() {
      return current !== null;
    },
    /** False (and no request) when one is already in flight. */
    start(description: string): boolean {
      if (current) return false;
      const ac = new AbortController();
      current = ac;
      const deliver = (r: ParseResult) => {
        if (current !== ac || ac.signal.aborted) return;
        current = null;
        onResult(r);
      };
      parse(description, ac.signal).then(deliver, () => deliver({ kind: "offline" }));
      return true;
    },
    /** True when a request was actually cancelled. */
    abort(): boolean {
      const was = current !== null;
      current?.abort();
      current = null;
      return was;
    },
  };
}

export type ParseEffect =
  | { type: "expire-session" }
  | { type: "review"; form: FormState }
  | { type: "composer"; parse: ParseState; announce: string };

/** Maps a validated transport result to exactly one UI effect. Pure, so it is unit-tested. */
export function effectOf(r: ParseResult): ParseEffect {
  switch (r.kind) {
    case "unauthorized":
      return { type: "expire-session" };
    case "aborted":
      return { type: "composer", parse: { status: "idle" }, announce: "Parsing cancelled" };
    case "outcome": {
      const o = r.outcome;
      switch (o.status) {
        case "draft":
          return { type: "review", form: formFromDraft(o.draft) };
        case "needs_clarification":
          return {
            type: "composer",
            parse: { status: "clarify", scenarioId: "", questions: o.questions },
            announce: "The AI needs more information",
          };
        case "invalid":
          return {
            type: "composer",
            parse: { status: "invalid", errors: o.errors },
            announce: "The AI could not read the text",
          };
        case "unavailable":
          return {
            type: "composer",
            parse: { status: "unavailable", reason: o.reason },
            announce: "AI parsing is unavailable",
          };
      }
      break;
    }
    case "throttled":
      return {
        type: "composer",
        parse: { status: "failed", reason: "throttled", retryAfterSeconds: r.retryAfterSeconds },
        announce: "Too many parse requests",
      };
    case "rejected":
      return {
        type: "composer",
        parse: { status: "failed", reason: "rejected", messages: r.messages },
        announce: "The server could not accept the description",
      };
    case "forbidden":
      return {
        type: "composer",
        parse: { status: "failed", reason: "forbidden" },
        announce: "The server did not accept the request",
      };
    case "offline":
      return {
        type: "composer",
        parse: { status: "failed", reason: "offline" },
        announce: "Could not reach the server",
      };
    case "malformed":
      return {
        type: "composer",
        parse: { status: "failed", reason: "malformed" },
        announce: "The server's answer was not usable",
      };
    case "unavailable":
      return {
        type: "composer",
        parse: { status: "failed", reason: "service" },
        announce: "The parsing service is unavailable",
      };
  }
}
