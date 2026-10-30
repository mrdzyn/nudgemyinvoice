/**
 * Read-only lookup behind Nudgey's chat (NMI-NDG-02 C1). It turns an `Intent` into requests to the
 * EXISTING authenticated, operator-scoped APIs (the invoice search/list and the follow-up list) and
 * returns what the server said, labelled honestly. It never writes, never contacts PayPal or OpenAI,
 * never sums amounts, and never calls an invoice paid or unpaid: PayPal DRAFT state is not payment state.
 */
import type { ListQuery, ListResult } from "../invoices/api.js";
import type { ListOutcome, FollowUpView } from "../followups/api.js";
import type { ListItem } from "../domain/serverList.js";
import { statusLabel } from "../features/dashboard/invoiceGridSort.js";
import type { Intent, PayPalGroup } from "./intent.js";

/** Records shown per answer. Each answer says when more exist instead of implying a total. */
export const CHAT_PAGE = 10;
export const OVERVIEW_PAGE = 5;

export type Failure = "offline" | "unavailable" | "malformed" | "forbidden" | "rejected";

export interface InvoiceGroup {
  key: PayPalGroup;
  label: string;
  hint: string;
  items: ListItem[];
  /** True when the server reported another page: the shown records are NOT all of them. */
  more: boolean;
  failed: Failure | null;
}

export type LookupResult =
  | { kind: "overview"; groups: InvoiceGroup[] }
  | { kind: "invoices"; title: string; scope: string; items: ListItem[]; more: boolean }
  | {
      kind: "followups";
      which: "due" | "upcoming" | "all";
      items: FollowUpView[];
      /** Whole-list counts computed by the server for the operator's active follow-ups. */
      counts: { due: number; upcoming: number };
      limited: boolean;
    }
  | { kind: "message"; text: string; tone: "info" | "limit" }
  | { kind: "error"; failure: Failure }
  | { kind: "expired" }
  | { kind: "aborted" };

export interface LookupDeps {
  listInvoices: (query: ListQuery, signal: AbortSignal) => Promise<ListResult>;
  readFollowUps: (signal: AbortSignal) => Promise<ListOutcome>;
}

export const GROUPS: { key: PayPalGroup; label: string; hint: string }[] = [
  {
    key: "none",
    label: "No PayPal draft",
    hint: "Saved here only; no PayPal draft has been created.",
  },
  {
    key: "progress",
    label: "PayPal draft in progress",
    hint: "A PayPal Sandbox draft is being created.",
  },
  {
    key: "created",
    label: "PayPal Sandbox draft created",
    hint: "A draft exists in PayPal Sandbox. It has not been sent.",
  },
  {
    key: "attention",
    label: "Needs PayPal attention",
    hint: "The draft outcome was rejected, unknown or needs your review.",
  },
];

export const PAYMENT_UNSUPPORTED_TEXT =
  "I can't tell you whether an invoice is paid, unpaid or overdue. NudgeMyInvoice does not receive or reconcile payment information yet, and a PayPal draft is not a payment status. I can show your saved invoices with their PayPal draft state, or your follow-up reminders.";

export const HELP_TEXT =
  "I can look things up read-only: your pending invoices (by PayPal draft state), invoices by currency, invoices for a customer, and which follow-ups are due or upcoming. I can't send, change or schedule anything from this box.";

const fail = (r: ListResult): LookupResult | null => {
  switch (r.kind) {
    case "ok":
      return null;
    case "unauthorized":
      return { kind: "expired" };
    case "aborted":
      return { kind: "aborted" };
    default:
      return { kind: "error", failure: r.kind };
  }
};

const query = (
  limit: number,
  over: Partial<Pick<ListQuery, "currency" | "status" | "q">> = {},
): ListQuery => ({ limit, cursor: null, currency: null, status: null, q: null, ...over });

export async function runLookup(
  intent: Intent,
  deps: LookupDeps,
  signal: AbortSignal,
): Promise<LookupResult> {
  switch (intent.kind) {
    case "help":
      return { kind: "message", text: HELP_TEXT, tone: "info" };
    case "payment-unsupported":
      return { kind: "message", text: PAYMENT_UNSUPPORTED_TEXT, tone: "limit" };

    case "pending": {
      const answers = await Promise.all(
        GROUPS.map((g) => deps.listInvoices(query(OVERVIEW_PAGE, { status: g.key }), signal)),
      );
      if (signal.aborted || answers.some((a) => a.kind === "aborted")) return { kind: "aborted" };
      if (answers.some((a) => a.kind === "unauthorized")) return { kind: "expired" };
      if (answers.every((a) => a.kind !== "ok")) {
        const first = answers[0] as ListResult;
        return fail(first) ?? { kind: "error", failure: "unavailable" };
      }
      const groups: InvoiceGroup[] = GROUPS.map((g, i) => {
        const a = answers[i] as ListResult;
        return {
          ...g,
          items: a.kind === "ok" ? a.page.items : [],
          more: a.kind === "ok" && a.page.nextCursor !== null,
          failed: a.kind === "ok" ? null : (a.kind as Failure),
        };
      });
      return { kind: "overview", groups };
    }

    case "list":
    case "search": {
      const q =
        intent.kind === "search"
          ? query(CHAT_PAGE, { q: intent.term })
          : query(CHAT_PAGE, { currency: intent.currency, status: intent.status });
      const a = await deps.listInvoices(q, signal);
      if (signal.aborted) return { kind: "aborted" };
      const f = fail(a);
      if (f) return f;
      if (a.kind !== "ok") return { kind: "error", failure: "unavailable" };
      const scope =
        intent.kind === "search"
          ? `Invoices matching “${intent.term}”`
          : [
              intent.currency ? `${intent.currency} invoices` : "Your invoices",
              intent.status
                ? `PayPal state: ${GROUPS.find((g) => g.key === intent.status)?.label}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ");
      return {
        kind: "invoices",
        title: scope,
        scope,
        items: a.page.items,
        more: a.page.nextCursor !== null,
      };
    }

    case "followups": {
      const r = await deps.readFollowUps(signal);
      if (signal.aborted || r.kind === "aborted") return { kind: "aborted" };
      if (r.kind === "unauthorized") return { kind: "expired" };
      if (r.kind !== "ok")
        return {
          kind: "error",
          failure:
            r.kind === "offline" ? "offline" : r.kind === "malformed" ? "malformed" : "unavailable",
        };
      const items = r.items.filter((i) => intent.which === "all" || i.state === intent.which);
      return {
        kind: "followups",
        which: intent.which,
        items,
        counts: r.counts,
        limited: r.items.length >= 100,
      };
    }
  }
}

/** One short sentence for assistive technology: never the list itself. */
export function summarizeForAnnouncement(r: LookupResult): string {
  switch (r.kind) {
    case "overview": {
      const shown = r.groups.reduce((n, g) => n + g.items.length, 0);
      return shown === 0
        ? "No saved invoices found."
        : `Showing ${shown} saved invoices in ${r.groups.filter((g) => g.items.length).length} PayPal draft groups.`;
    }
    case "invoices":
      return r.items.length === 0
        ? "No matching invoices."
        : `Showing ${r.items.length} invoice${r.items.length === 1 ? "" : "s"}${r.more ? ", more are available in the dashboard" : ""}.`;
    case "followups":
      return r.items.length === 0
        ? "No matching follow-ups."
        : `Showing ${r.items.length} follow-up${r.items.length === 1 ? "" : "s"}.`;
    case "message":
      return r.tone === "limit"
        ? "Payment status is not available."
        : "I did not understand; examples are shown.";
    case "error":
      return "The lookup could not be completed.";
    case "expired":
      return "Your session ended.";
    case "aborted":
      return "";
  }
}

export { statusLabel };
