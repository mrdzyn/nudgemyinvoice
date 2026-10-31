import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NudgeyPanel } from "../components/Nudgey.js";
import type { ListItem } from "../domain/serverList.js";
import type { FollowUpView } from "../followups/api.js";
import { ChatView, DRAFT_STATE_NOTE, ResultView, ScheduleCandidateView } from "./NudgeyChat.js";
import type { ScheduleProposal } from "./scheduleIntent.js";
import type { ChatMessage } from "./chatSession.js";
import { GROUPS, type LookupResult } from "./lookup.js";

const clean = (h: string) => h.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
const noop = () => undefined;
const at = new Date("2026-10-30T12:00:00Z");
const item = (n: number, over: Partial<ListItem> = {}): ListItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  customerName: `Customer ${n}`,
  customerEmail: `c${n}@example.com`,
  currency: "USD",
  dueDate: "2030-01-15",
  total: "540.00",
  createdAt: "2026-10-30T12:00:00.000Z",
  paypalState: "none",
  ...over,
});
const fu = (
  n: number,
  state: "due" | "upcoming",
  over: Partial<FollowUpView> = {},
): FollowUpView => ({
  id: `00000000-0000-4000-8000-0000000000a${n}`,
  invoiceId: `10000000-0000-4000-8000-00000000000${n}`,
  dueAt: "2026-11-02T01:30:00.000Z",
  timezone: "Asia/Manila",
  note: "ask about PO",
  message: "m",
  status: "active",
  state,
  invoice: {
    customerName: `Customer ${n}`,
    currency: "USD",
    total: "540.00",
    dueDate: "2030-01-15",
  },
  ...over,
});
const view = (result: LookupResult) =>
  clean(
    renderToString(
      <ResultView result={result} at={at} onOpenInvoice={noop} onOpenDashboard={noop} />,
    ),
  );
const chat = (messages: ChatMessage[], busy = false) =>
  clean(
    renderToString(
      <ChatView
        messages={messages}
        busy={busy}
        at={at}
        onAsk={noop}
        onBack={noop}
        onOpenInvoice={noop}
        onOpenDashboard={noop}
        onSchedule={noop}
        onSelectSchedule={noop}
        onReviewSchedule={noop}
        onRetrySchedule={noop}
        onDraftChange={noop}
      />,
    ),
  );

describe("Ask Nudgey entry (existing quick actions untouched)", () => {
  it("adds 'Ask Nudgey' only when a real session provides it and keeps every existing action and the no-send footnote", () => {
    const base = { username: "op", onChoose: noop, onClose: noop, titleId: "t" };
    const without = clean(renderToString(<NudgeyPanel {...base} />));
    const withAsk = clean(renderToString(<NudgeyPanel {...base} onAsk={noop} onSchedule={noop} />));
    expect(without).not.toContain("Ask Nudgey");
    for (const t of [
      "Create an invoice",
      "View my invoices",
      "Check invoice status",
      "Ask Nudgey",
      "Look up invoices and follow-ups (read-only)",
      "Schedule a follow-up",
      "Nothing is sent automatically",
    ])
      expect(withAsk).toContain(t);
  });
});

describe("conversation view", () => {
  it("presents every invoice as an explicit accessible radio choice and keeps review disabled until selection", () => {
    const proposal: ScheduleProposal = {
      term: "Northwind Studio",
      date: "2026-11-01",
      time: "09:00",
      timeZone: "Asia/Manila",
      dueAt: "2026-11-01T01:00:00.000Z",
    };
    const html = clean(
      renderToString(
        <ScheduleCandidateView
          state={{ kind: "ready", proposal, items: [item(1), item(2)], selectedId: null }}
          at={at}
          onSelect={noop}
          onReview={noop}
          onRetry={noop}
          onManual={noop}
        />,
      ),
    );
    expect((html.match(/type="radio"/g) ?? []).length).toBe(2);
    expect((html.match(/checked=""/g) ?? []).length).toBe(0);
    expect(html).toContain("Review in scheduler");
    expect(html).toContain('disabled=""');
    expect(html).toContain("Proposal only — nothing scheduled");
  });

  it("offers the five example questions, a labelled bounded input, Ask and Back, and states it is read-only", () => {
    const html = chat([]);
    for (const q of [
      "What are my pending invoices?",
      "Show my USD invoices",
      "Find invoices for Northwind Studio",
      "Which follow-ups are due?",
      "What follow-ups are upcoming?",
    ])
      expect(html).toContain(q);
    expect(html).toContain("Ask Nudgey a question");
    expect(html).toContain('maxLength="200"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Ask<\/button>/); // empty input => cannot submit
    expect(html).toContain("Back");
    expect(html).toContain("Nothing is sent, changed or");
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="off"'); // the transcript is not read out wholesale
    expect(html).toContain("Ask a question or pick an example above.");
  });

  it("renders the transcript with screen-reader labels, a pending state, and escapes typed text", () => {
    const html = chat(
      [
        { id: 1, role: "user", text: '<img src=x onerror=alert(1)> "Northwind"' },
        { id: 2, role: "nudgey", pending: true },
      ],
      true,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("You: ");
    expect(html).toContain("Nudgey: ");
    expect(html).toContain("Looking that up");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Ask (replaces the current lookup)");
  });
});

describe("result cards (server data only, honest labels)", () => {
  it("shows pending invoices as four PayPal DRAFT groups, with the not-payment-status disclaimer and truncation", () => {
    const html = view({
      kind: "overview",
      groups: GROUPS.map((g, i) => ({
        ...g,
        items: i === 0 ? [item(1), item(2)] : i === 2 ? [item(3, { paypalState: "created" })] : [],
        more: i === 0,
        failed: null,
      })),
    });
    for (const g of GROUPS) expect(html).toContain(g.label);
    expect(html).toContain(DRAFT_STATE_NOTE);
    expect(html).toContain("No PayPal draft");
    expect(html).toContain("PayPal draft created");
    expect(html).toContain("Showing up to 2 records; more exist");
    expect(html).toContain("Open the full dashboard");
    expect(html.replaceAll(DRAFT_STATE_NOTE, "")).not.toMatch(
      /unpaid|overdue|\bpaid\b|payment received/i,
    );
    expect((html.match(/Open invoice/g) ?? []).length).toBe(3);
  });

  it("an empty account says so plainly and a failed group says which group failed", () => {
    const empty = view({
      kind: "overview",
      groups: GROUPS.map((g) => ({ ...g, items: [], more: false, failed: null })),
    });
    expect(empty).toContain("You have no saved invoices yet.");
    const part = view({
      kind: "overview",
      groups: GROUPS.map((g, i) => ({
        ...g,
        items: i === 0 ? [item(1)] : [],
        more: false,
        failed: i === 2 ? ("unavailable" as const) : null,
      })),
    });
    expect(part).toContain("Could not load this group.");
    expect(part).toContain("PayPal Sandbox draft created");
  });

  it("a customer search lists the matches with their own currency and total and never a combined total", () => {
    const html = view({
      kind: "invoices",
      title: "Invoices matching “Northwind”",
      scope: "x",
      items: [
        item(1, { customerName: "Northwind Studio" }),
        item(2, { currency: "EUR", total: "431.98" }),
      ],
      more: false,
    });
    expect(html).toContain("Northwind Studio");
    expect(html).toContain("USD 540.00");
    expect(html).toContain("EUR 431.98");
    expect(html).toContain("Invoice due January 15, 2030");
    expect(html).not.toMatch(/971\.98|total of|combined|sum/i);
    expect(html).toContain("for Northwind Studio"); // accessible name of the open button
  });

  it("no match is a plain sentence; truncation tells the operator how to see the rest", () => {
    expect(view({ kind: "invoices", title: "t", scope: "t", items: [], more: false })).toContain(
      "No matching invoices.",
    );
    const more = view({
      kind: "invoices",
      title: "USD invoices",
      scope: "x",
      items: [item(1)],
      more: true,
    });
    expect(more).toContain("Showing up to 1 matching records; more exist.");
    expect(more).toContain("Open the full dashboard");
  });

  it("follow-up cards show the server's due/upcoming state, the local time with its zone, and the reminder-not-payment note", () => {
    const html = view({
      kind: "followups",
      which: "due",
      items: [fu(1, "due")],
      counts: { due: 1, upcoming: 2 },
      limited: false,
    });
    expect(html).toContain("You have 1 due and 2 upcoming follow-ups.");
    expect(html).toContain("Due");
    expect(html).toMatch(/9:30 AM GMT\+8/);
    expect(html).toContain("Asia/Manila (GMT+8)");
    expect(html).toContain("Note: ask about PO");
    expect(html).toContain("A due follow-up does not mean an invoice is unpaid");
    expect(html).toContain("nothing was sent to the customer");
    expect(
      view({
        kind: "followups",
        which: "upcoming",
        items: [],
        counts: { due: 0, upcoming: 0 },
        limited: false,
      }),
    ).toContain("No upcoming follow-ups right now.");
    expect(
      view({
        kind: "followups",
        which: "all",
        items: [fu(1, "due")],
        counts: { due: 1, upcoming: 0 },
        limited: true,
      }),
    ).toContain("(the first 100 active are counted)");
  });

  it("refuses payment questions truthfully and explains unknown requests", () => {
    const pay = view({
      kind: "message",
      tone: "limit",
      text: "I can't tell you whether an invoice is paid, unpaid or overdue.",
    });
    expect(pay).toContain("chat-limit");
    expect(pay).toContain("I can&#x27;t tell you whether".replace("&#x27;", "'"));
    expect(view({ kind: "error", failure: "offline" })).toContain("couldn't reach the server");
    expect(view({ kind: "error", failure: "malformed" })).toContain(
      "wasn't in the expected format",
    );
    expect(view({ kind: "expired" })).toBe("");
    expect(view({ kind: "aborted" })).toBe("");
  });

  it("escapes customer-controlled text in every card", () => {
    const html = renderToString(
      <ResultView
        result={{
          kind: "invoices",
          title: "t",
          scope: "t",
          items: [item(1, { customerName: "<script>alert(1)</script>" })],
          more: false,
        }}
        at={at}
        onOpenInvoice={noop}
        onOpenDashboard={noop}
      />,
    );
    expect(html).not.toContain("<script>");
    const f = renderToString(
      <ResultView
        result={{
          kind: "followups",
          which: "all",
          items: [
            fu(1, "due", {
              note: "<b>x</b>",
              invoice: {
                customerName: "<img src=x>",
                currency: "USD",
                total: "1.00",
                dueDate: "2030-01-15",
              },
            }),
          ],
          counts: { due: 1, upcoming: 0 },
          limited: false,
        }}
        at={at}
        onOpenInvoice={noop}
        onOpenDashboard={noop}
      />,
    );
    expect(f).not.toContain("<img");
    expect(f).not.toContain("<b>x");
  });
});
