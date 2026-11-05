// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../demo/AppContext.js";
import { initialState } from "../demo/appState.js";
import type { ListItem } from "../domain/serverList.js";
import type { ListResult } from "../invoices/api.js";
import type { GenerateOutcome, NudgeApi } from "../nudges/api.js";
import { NudgesController } from "../nudges/controller.js";
import { ChatSession } from "./chatSession.js";
import { NudgeDraftFlow } from "./NudgeDraftFlow.js";
import { SEND_REFUSAL } from "./nudgeIntent.js";

/**
 * Objective (NMI-P6 D7): Nudgey drafting reuses the owner-scoped invoice lookup, never drafts without an explicit
 * invoice choice and confirmation (one costed call per click), shows the result as Pending review with Open in
 * queue, and refuses "send" requests.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const inv = (n: number, over: Partial<ListItem> = {}): ListItem => ({
  id: `10000000-0000-4000-8000-00000000000${n}`,
  customerName: `Zorblax ${n}`,
  customerEmail: `z${n}@example.test`,
  currency: "USD",
  dueDate: "2026-10-30",
  total: "1200.00",
  createdAt: "2026-10-01T00:00:00.000Z",
  paypalState: "none",
  ...over,
});
const created = (invoiceId: string, tone: "friendly" | "professional" | "firm") => ({
  id: "00000000-0000-4000-8000-0000000000c1",
  invoiceId,
  tone,
  status: "pending_review" as const,
  message:
    "Hi Zorblax 1,\n\nA note about invoice 10000000 for USD 1,200.00, which was due on October 30, 2026.",
  aiMessage: "x",
  rationale: "Direct and polite.",
  facts: {
    currency: "USD",
    amount: "USD 1,200.00",
    dueDate: "2026-10-30",
    daysPastDue: 6,
    asOfDate: "2026-11-05",
    timeZone: "UTC",
    invoiceRef: "10000000",
  },
  model: "fake",
  edited: false,
  version: 1,
  createdAt: "2026-11-05T04:00:00.000Z",
  updatedAt: "2026-11-05T04:00:00.000Z",
  approvedAt: null,
  rejectedAt: null,
  supersededAt: null,
  invoice: null,
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => await Promise.resolve());
};

function setup(items: ListItem[], outcome?: GenerateOutcome, nextCursor: string | null = null) {
  const generate = vi.fn(
    async (invoiceId: string, input: { tone: "friendly" | "professional" | "firm" }) =>
      outcome ?? ({ kind: "ok", nudge: created(invoiceId, input.tone) } as GenerateOutcome),
  );
  const api = {
    summary: async () => ({
      kind: "ok",
      counts: { pending: 0, approved: 0, rejected: 0, superseded: 0, total: 0 },
      aiAvailable: true,
    }),
    list: async () => ({ kind: "ok", items: [] }),
    generate,
  } as unknown as NudgeApi;
  const nudges = new NudgesController(
    api,
    "csrf",
    () => undefined,
    () => "UTC",
  );
  const listInvoices = vi.fn(
    async (): Promise<ListResult> => ({ kind: "ok", page: { items, nextCursor } }) as ListResult,
  );
  const opened: (string | null)[] = [];
  const render = async (tone: "friendly" | "professional" | "firm" | null = "firm") => {
    await act(async () =>
      root.render(
        <AppProvider
          state={{ ...initialState("light"), authed: true, screen: "dashboard" }}
          dispatch={() => undefined}
          session={{ username: "op", signOut: () => undefined, listInvoices, nudges }}
        >
          <NudgeDraftFlow
            request={{ tone, term: "zorblax" }}
            onOpenQueue={(id) => opened.push(id)}
          />
        </AppProvider>,
      ),
    );
    await flush();
  };
  return { generate, listInvoices, opened, render };
}
const button = (label: string | RegExp) =>
  [...host.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? ""),
  ) as HTMLButtonElement | undefined;
const click = async (label: string | RegExp) => {
  const b = button(label);
  if (!b) throw new Error(`no button ${String(label)}: ${host.textContent}`);
  await act(async () => b.click());
  await flush();
};

describe("NudgeDraftFlow", () => {
  it("one match: searches the operator's invoices, asks to confirm, and drafts exactly once on click", async () => {
    const t = setup([inv(1)]);
    await t.render("firm");
    expect(t.listInvoices).toHaveBeenCalledWith(
      { limit: 20, cursor: null, currency: null, status: null, q: "zorblax" },
      expect.anything(),
    );
    expect(host.textContent).toContain("I found 1 matching invoice");
    expect(host.textContent).toContain("This makes one AI call.");
    expect(t.generate).not.toHaveBeenCalled();
    await click("Draft firm nudge");
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.generate.mock.calls[0]?.[0]).toBe(inv(1).id);
    expect(t.generate.mock.calls[0]?.[1]).toEqual({ tone: "firm", timeZone: "UTC", replace: null });
    expect(host.textContent).toContain("Draft ready for review");
    expect(host.textContent).toContain("Nothing was sent.");
    await click("Open in queue");
    expect(t.opened).toEqual(["00000000-0000-4000-8000-0000000000c1"]);
  });

  it("several matches: nothing is preselected and Draft stays disabled until one is chosen", async () => {
    const t = setup([inv(1), inv(2)]);
    await t.render(null);
    expect(host.textContent).toContain("I found 2 matching invoices — choose one");
    expect(button("Draft professional nudge")?.disabled).toBe(true);
    const radio = host.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement;
    await act(async () => radio.click());
    expect(button("Draft professional nudge")?.disabled).toBe(false);
  });

  it("cancel drafts nothing", async () => {
    const t = setup([inv(1)]);
    await t.render();
    await click("Cancel");
    expect(host.textContent).toContain("nothing was drafted");
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("a pending draft offers an explicit replace that names it", async () => {
    const t = setup([inv(1)], {
      kind: "pending-exists",
      pending: { id: "00000000-0000-4000-8000-0000000000d1", version: 3 },
    });
    await t.render();
    await click("Draft firm nudge");
    expect(host.textContent).toContain("already has a draft waiting for review");
    await click(/^Replace with a new firm draft/);
    expect(t.generate.mock.calls[1]?.[1]).toEqual({
      tone: "firm",
      timeZone: "UTC",
      replace: { id: "00000000-0000-4000-8000-0000000000d1", version: 3 },
    });
  });

  it("no match and too many matches are explained; nothing is drafted", async () => {
    const none = setup([]);
    await none.render();
    expect(host.textContent).toContain("No saved invoices matched “zorblax”");
    const many = setup([inv(1)], undefined, "next");
    await many.render();
    expect(host.textContent).toContain("More than 20 invoices matched");
    expect(none.generate).not.toHaveBeenCalled();
    expect(many.generate).not.toHaveBeenCalled();
  });
});

describe("ChatSession nudge intents", () => {
  const deps = () => ({
    listInvoices: undefined,
    followUps: undefined,
    expired: undefined,
    announce: vi.fn(),
  });
  it("a draft request becomes a proposal message (no lookup, no AI call yet)", async () => {
    const s = new ChatSession(deps());
    await s.ask("draft a firm nudge for zorblax");
    const msgs = s.getSnapshot();
    expect(msgs.map((m) => m.role)).toEqual(["user", "nudgey"]);
    expect(msgs[1]?.nudge).toEqual({ tone: "firm", term: "zorblax" });
  });
  it("'send it' gets the clear refusal", async () => {
    const d = deps();
    const s = new ChatSession(d);
    await s.ask("send it");
    expect(s.getSnapshot()[1]?.text).toBe(SEND_REFUSAL);
    expect(d.announce).toHaveBeenCalledWith(SEND_REFUSAL);
  });
});

describe("P6-AUD-03 in the chat flow", () => {
  it("a lookup cancelled (unmounted) after its 401 was received still ends the session", async () => {
    let release!: (v: ListResult) => void;
    const expired = vi.fn();
    const listInvoices = vi.fn(() => new Promise<ListResult>((r) => (release = r)));
    const nudges = new NudgesController(
      {
        summary: async () => ({ kind: "aborted" }),
      } as unknown as NudgeApi,
      "csrf",
      () => undefined,
      () => "UTC",
    );
    await act(async () =>
      root.render(
        <AppProvider
          state={{ ...initialState("light"), authed: true, screen: "dashboard" }}
          dispatch={() => undefined}
          session={{
            username: "op",
            signOut: () => undefined,
            listInvoices,
            nudges,
            sessionExpired: expired,
          }}
        >
          <NudgeDraftFlow
            request={{ tone: "firm", term: "zorblax" }}
            onOpenQueue={() => undefined}
          />
        </AppProvider>,
      ),
    );
    act(() => root.render(<></>)); // the chat closes: the lookup is aborted
    await act(async () => release({ kind: "unauthorized" }));
    expect(expired).toHaveBeenCalledTimes(1);
  });
});
