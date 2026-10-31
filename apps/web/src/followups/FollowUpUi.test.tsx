import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FollowUpView } from "./api.js";
import type { FollowUpsSnapshot } from "./controller.js";
import {
  FollowUpList,
  FollowUpSummary,
  InvoiceFollowUpCard,
  LOCAL_ONLY_COPY,
  ScheduleForm,
} from "./FollowUpUi.js";
import { NudgeyPanel } from "../components/Nudgey.js";

const clean = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
const fu = (over: Partial<FollowUpView> = {}): FollowUpView => ({
  id: "00000000-0000-4000-8000-000000000001",
  invoiceId: "10000000-0000-4000-8000-000000000001",
  dueAt: "2026-11-02T01:30:00.000Z",
  timezone: "Asia/Manila",
  note: "ask about PO",
  message: "Hi Northwind",
  status: "active",
  state: "upcoming",
  invoice: {
    customerName: "Northwind Studio",
    currency: "USD",
    total: "540.00",
    dueDate: "2030-01-15",
  },
  ...over,
});
const snap = (over: Partial<FollowUpsSnapshot> = {}): FollowUpsSnapshot => ({
  status: "ready",
  error: null,
  items: [],
  counts: { due: 0, upcoming: 0 },
  serverNow: "2026-10-30T12:00:00.000Z",
  version: 0,
  ...over,
});
const at = new Date("2026-10-30T12:00:00Z");
const noop = () => undefined;

describe("Nudgey follow-up UI", () => {
  it("shows the Schedule a follow-up shortcut only when a real session provides it, and keeps the no-send copy", () => {
    const base = { username: "op", onChoose: noop, onClose: noop, titleId: "t" };
    const without = clean(renderToString(<NudgeyPanel {...base} />));
    const withIt = clean(renderToString(<NudgeyPanel {...base} onSchedule={noop} />));
    expect(without).not.toContain("Schedule a follow-up");
    expect(withIt).toContain("Schedule a follow-up");
    expect(withIt).toContain("A reminder for you, not a message to the customer");
    expect(withIt).toContain("Nothing is sent automatically");
  });

  it("renders Due and Upcoming counts exactly as the server reported them", () => {
    const html = clean(
      renderToString(<FollowUpSummary snap={snap({ counts: { due: 2, upcoming: 3 } })} />),
    );
    expect(html).toMatch(/<strong>2<\/strong> Due/);
    expect(html).toMatch(/<strong>3<\/strong> Upcoming/);
  });

  it("shows honest loading and error states instead of zeros", () => {
    expect(
      clean(renderToString(<FollowUpSummary snap={snap({ status: "idle", serverNow: null })} />)),
    ).toContain("Loading your follow-ups");
    const err = clean(
      renderToString(
        <FollowUpSummary snap={snap({ status: "error", error: "offline", serverNow: null })} />,
      ),
    );
    expect(err).toContain("could not be loaded (offline)");
    expect(err).not.toMatch(/<strong>0<\/strong>/);
  });

  it("renders an Ask Nudgey proposal as an editable prefill and names the explicit Save boundary", () => {
    const html = clean(
      renderToString(
        <ScheduleForm
          mode="create"
          invoices={[
            {
              id: fu().invoiceId,
              customerName: "Northwind Studio",
              currency: "USD",
              total: "540.00",
              dueDate: "2030-01-15",
            },
          ]}
          invoicesStatus="ready"
          prefill={{
            invoiceId: fu().invoiceId,
            date: "2026-11-01",
            time: "09:00",
            timeZone: "Asia/Manila",
            message: "Hi Northwind Studio",
          }}
          busy={false}
          error={null}
          now={at}
          timeZone="Asia/Manila"
          onSubmit={noop}
          onBack={noop}
        />,
      ),
    );
    expect(html).toContain("Proposed from your question");
    expect(html).toContain('value="2026-11-01"');
    expect(html).toContain('value="09:00"');
    expect(html).toContain("Hi Northwind Studio");
    expect(html).toContain("Save follow-up");
    expect(html).toContain("nothing is scheduled until you choose Save follow-up.");
  });

  it("groups real items into Due and Upcoming with time, zone, note and every action", () => {
    const html = clean(
      renderToString(
        <FollowUpList
          items={[
            fu({ state: "due" }),
            fu({ id: "00000000-0000-4000-8000-000000000002", state: "upcoming" }),
          ]}
          busyId={null}
          at={at}
          onComplete={noop}
          onReschedule={noop}
          onCancel={noop}
          onOpen={noop}
        />,
      ),
    );
    expect(html).toContain("Due (1)");
    expect(html).toContain("Upcoming (1)");
    expect(html).toContain("Northwind Studio");
    expect(html).toMatch(/9:30 AM GMT\+8/);
    expect(html).toContain("Asia/Manila (GMT+8)");
    expect(html).toContain("Note: ask about PO");
    for (const a of ["Open invoice", "Mark complete", "Reschedule", "Cancel"])
      expect(html).toContain(a);
    expect(html).not.toMatch(/\bsent\b|delivered|emailed/i);
  });

  it("shows an empty state and disables controls for the row being changed", () => {
    expect(
      clean(
        renderToString(
          <FollowUpList
            items={[]}
            busyId={null}
            at={at}
            onComplete={noop}
            onReschedule={noop}
            onCancel={noop}
            onOpen={noop}
          />,
        ),
      ),
    ).toContain("No follow-ups scheduled yet");
    const busy = renderToString(
      <FollowUpList
        items={[fu()]}
        busyId={fu().id}
        at={at}
        onComplete={noop}
        onReschedule={noop}
        onCancel={noop}
        onOpen={noop}
      />,
    );
    expect((busy.match(/disabled=""/g) ?? []).length).toBe(4);
  });

  it("escapes customer-controlled text instead of rendering it as HTML", () => {
    const html = renderToString(
      <FollowUpList
        items={[
          fu({
            note: "<img src=x onerror=alert(1)>",
            invoice: {
              customerName: "<script>alert(1)</script>",
              currency: "USD",
              total: "1.00",
              dueDate: "2030-01-15",
            },
          }),
        ]}
        busyId={null}
        at={at}
        onComplete={noop}
        onReschedule={noop}
        onCancel={noop}
        onOpen={noop}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("schedule form", () => {
  const props = {
    invoices: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        customerName: "Northwind Studio",
        currency: "USD",
        total: "540.00",
        dueDate: "2030-01-15",
      },
    ],
    invoicesStatus: "ready" as const,
    busy: false,
    error: null,
    now: at,
    timeZone: "Asia/Manila",
    onSubmit: noop,
    onBack: noop,
  };

  it("offers saved invoices, date, time, optional note, an editable message and the browser time zone", () => {
    const html = clean(renderToString(<ScheduleForm mode="create" {...props} />));
    for (const t of [
      "Saved invoice",
      "Date",
      "Time",
      "Note (optional)",
      "Follow-up message (editable draft)",
      "Northwind Studio · USD 540.00 · due 2030-01-15",
      "Asia/Manila (GMT+8)",
      "saved in UTC",
      "Use suggested message",
      "Copy message",
      "Save follow-up",
    ])
      expect(html).toContain(t);
    expect(html).toContain('type="date"');
    expect(html).toContain('type="time"');
    expect(html).toContain("<textarea");
    expect(html).toContain(LOCAL_ONLY_COPY);
    expect(html).toContain("Nothing is sent to the customer");
  });

  it("reschedule mode fixes the invoice, prefilled from the saved follow-up", () => {
    const html = clean(
      renderToString(
        <ScheduleForm
          mode="reschedule"
          {...props}
          initial={{
            invoiceId: props.invoices[0]!.id,
            dueAt: "2026-11-02T01:30:00.000Z",
            note: "ask about PO",
            message: "Hi Northwind",
            timezone: "Asia/Manila",
          }}
        />,
      ),
    );
    expect(html).toContain("Reschedule follow-up");
    expect(html).toContain("Save new time");
    expect(html).not.toContain("<select");
    expect(html).toContain("Hi Northwind");
    expect(html).toContain('value="ask about PO"');
  });

  it("shows loading/empty invoice states and a server error without leaking markup", () => {
    expect(
      clean(
        renderToString(
          <ScheduleForm mode="create" {...props} invoices={[]} invoicesStatus="loading" />,
        ),
      ),
    ).toContain("Loading your invoices");
    expect(
      clean(renderToString(<ScheduleForm mode="create" {...props} invoices={[]} />)),
    ).toContain("No saved invoices yet");
    const html = renderToString(<ScheduleForm mode="create" {...props} error={'<b>bad</b> "x"'} />);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<b>bad");
  });

  it("keeps the verified Ask Nudgey candidate actionable while owner-scoped invoice choices load", () => {
    const candidate = props.invoices[0]!;
    const alternate = {
      id: "10000000-0000-4000-8000-000000000003",
      customerName: "Vienna Cafe",
      currency: "EUR",
      total: "215.99",
      dueDate: "2030-03-01",
    };
    const html = clean(
      renderToString(
        <ScheduleForm
          mode="create"
          {...props}
          invoices={[candidate, alternate]}
          invoicesStatus="loading"
          prefill={{
            invoiceId: candidate.id,
            date: "2027-01-15",
            time: "21:30",
            timeZone: "Asia/Manila",
            message: "Reviewed candidate",
          }}
        />,
      ),
    );
    expect(html).toContain(`value="${candidate.id}" selected=""`);
    expect(html).toContain(`value="${alternate.id}"`);
    expect(html).not.toMatch(/<select[^>]*disabled=""/);
  });
});

describe("invoice detail follow-up card", () => {
  it("states plainly that a scheduled follow-up is a local reminder, not a sent message", () => {
    const html = clean(
      renderToString(
        <InvoiceFollowUpCard
          at={at}
          load={{ status: "done", kind: "ok", active: fu(), recent: [] }}
        />,
      ),
    );
    expect(html).toContain("Follow-up scheduled");
    expect(html).toContain("Upcoming");
    expect(html).toMatch(/9:30 AM GMT\+8/);
    expect(html).toContain("Hi Northwind");
    expect(html).toContain(LOCAL_ONLY_COPY);
    expect(html).not.toMatch(/was sent|has been sent|delivered|emailed to/i);
    expect(html).not.toMatch(/unpaid|overdue/i);
  });

  it("shows due state, history, empty state, loading and errors", () => {
    expect(
      clean(
        renderToString(
          <InvoiceFollowUpCard
            at={at}
            load={{ status: "done", kind: "ok", active: fu({ state: "due" }), recent: [] }}
          />,
        ),
      ),
    ).toContain("Follow-up due");
    const hist = clean(
      renderToString(
        <InvoiceFollowUpCard
          at={at}
          load={{
            status: "done",
            kind: "ok",
            active: null,
            recent: [
              fu({ status: "completed", state: "completed" }),
              fu({
                id: "00000000-0000-4000-8000-000000000003",
                status: "canceled",
                state: "canceled",
              }),
            ],
          }}
        />,
      ),
    );
    expect(hist).toContain("No follow-up is scheduled for this invoice");
    expect(hist).toContain("Completed · was set for");
    expect(hist).toContain("Canceled · was set for");
    expect(
      clean(renderToString(<InvoiceFollowUpCard at={at} load={{ status: "loading" }} />)),
    ).toContain("Loading the follow-up");
    expect(
      clean(
        renderToString(<InvoiceFollowUpCard at={at} load={{ status: "done", kind: "offline" }} />),
      ),
    ).toContain("Could not reach the server");
    expect(
      clean(
        renderToString(
          <InvoiceFollowUpCard at={at} load={{ status: "done", kind: "malformed" }} />,
        ),
      ),
    ).toContain("could not be loaded right now");
  });

  it("escapes a stored message and note", () => {
    const html = renderToString(
      <InvoiceFollowUpCard
        at={at}
        load={{
          status: "done",
          kind: "ok",
          active: fu({ message: "<script>x</script>", note: "<b>n</b>" }),
          recent: [],
        }}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>n");
  });
});
