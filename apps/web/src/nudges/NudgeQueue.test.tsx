// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../demo/AppContext.js";
import { initialState, type Action, type AppState } from "../demo/appState.js";
import type {
  GenerateOutcome,
  NudgeApi,
  NudgeCounts,
  NudgeItem,
  NudgeView,
  TransitionOutcome,
} from "./api.js";
import { NudgesController } from "./controller.js";
import { NudgeDraftCard } from "./NudgeDraftCard.js";
import { NudgeQueue } from "./NudgeQueueScreen.js";
import { NudgeSummaryCard } from "./NudgeSummaryCard.js";
import { dueDateText } from "./format.js";

/**
 * Objective (NMI-P6 UI): the approved queue, dashboard card and drafting card render REAL server answers (here a
 * synthetic in-memory API), bind every review action to the version on screen, allow Copy only after approval,
 * confirm before rejecting or regenerating, show each required state, and never offer to send anything.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const INV = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
const NID = (n: number) => `00000000-0000-4000-8000-0000000000a${n}`;
const item = (n: number, over: Partial<NudgeItem> = {}): NudgeItem => ({
  id: NID(n),
  invoiceId: INV(n),
  tone: "professional",
  status: "pending_review",
  message: `Hi Customer ${n},\n\nInvoice 1000000${n} for USD 1,200.00 was due on October 30, 2026. Could you share an update?\n\nKind regards,`,
  aiMessage: `Hi Customer ${n},\n\nInvoice 1000000${n} for USD 1,200.00 was due on October 30, 2026. Could you share an update?\n\nKind regards,`,
  rationale: "Courteous and concise, asking for an update.",
  facts: {
    currency: "USD",
    amount: "USD 1,200.00",
    dueDate: "2026-10-30",
    daysPastDue: 6,
    asOfDate: "2026-11-05",
    timeZone: "UTC",
    invoiceRef: `1000000${n}`,
  },
  model: "fake",
  edited: false,
  version: 1,
  createdAt: "2026-11-05T04:00:00.000Z",
  updatedAt: "2026-11-05T04:00:00.000Z",
  approvedAt: null,
  rejectedAt: null,
  supersededAt: null,
  invoice: {
    customerName: `Customer ${n}`,
    currency: "USD",
    total: "1200.00",
    dueDate: "2026-10-30",
  },
  ...over,
});

/** In-memory fake of the server contract. Records every call; behaves like the real version-bound store. */
function fakeApi(seed: NudgeItem[], ai = true) {
  let rows = seed.map((r) => ({ ...r }));
  const calls: { op: string; args: unknown[] }[] = [];
  let failNext: { list?: boolean; transition?: TransitionOutcome; generate?: GenerateOutcome } = {};
  const counts = (): NudgeCounts => {
    const by = (s: string) => rows.filter((r) => r.status === s).length;
    const c = {
      pending: by("pending_review"),
      approved: by("approved"),
      rejected: by("rejected"),
      superseded: by("superseded"),
    };
    return { ...c, total: c.pending + c.approved + c.rejected + c.superseded };
  };
  const inView = (v: NudgeView, r: NudgeItem) =>
    v === "pending"
      ? r.status === "pending_review"
      : v === "approved"
        ? r.status === "approved"
        : r.status === "rejected" || r.status === "superseded";
  const strip = (r: NudgeItem): NudgeItem => ({ ...r, invoice: null });
  const move = (id: string, version: number, patch: Partial<NudgeItem>): TransitionOutcome => {
    if (failNext.transition) {
      const f = failNext.transition;
      failNext = {};
      return f;
    }
    const r = rows.find((x) => x.id === id);
    if (!r) return { kind: "not-found" };
    if (r.status !== "pending_review") return { kind: "not-pending" };
    if (r.version !== version) return { kind: "version-conflict" };
    Object.assign(r, patch, { version: r.version + 1, updatedAt: "2026-11-05T05:00:00.000Z" });
    return { kind: "ok", nudge: strip(r) };
  };
  const api: NudgeApi = {
    async summary() {
      calls.push({ op: "summary", args: [] });
      return { kind: "ok", counts: counts(), aiAvailable: ai };
    },
    async list(view, invoiceId) {
      calls.push({ op: "list", args: [view, invoiceId] });
      if (failNext.list) {
        failNext = {};
        return { kind: "unavailable" };
      }
      return {
        kind: "ok",
        items: rows
          .filter((r) => inView(view, r) && (invoiceId === null || r.invoiceId === invoiceId))
          .map((r) => ({ ...r })),
      };
    },
    async generate(invoiceId, input, csrf) {
      calls.push({ op: "generate", args: [invoiceId, input, csrf] });
      if (failNext.generate) {
        const f = failNext.generate;
        failNext = {};
        return f;
      }
      const pending = rows.find((r) => r.invoiceId === invoiceId && r.status === "pending_review");
      if (pending && !input.replace)
        return { kind: "pending-exists", pending: { id: pending.id, version: pending.version } };
      if (
        pending &&
        input.replace &&
        (input.replace.id !== pending.id || input.replace.version !== pending.version)
      )
        return { kind: "version-conflict", pending: { id: pending.id, version: pending.version } };
      if (pending)
        Object.assign(pending, {
          status: "superseded",
          supersededAt: "2026-11-05T05:00:00.000Z",
          version: pending.version + 1,
        });
      const base = rows.find((r) => r.invoiceId === invoiceId) ?? item(9, { invoiceId });
      const created = item(8, {
        id: `00000000-0000-4000-8000-0000000000b${rows.length}`,
        invoiceId,
        tone: input.tone,
        invoice: base.invoice,
      });
      rows = [created, ...rows];
      return { kind: "ok", nudge: strip(created) };
    },
    async edit(id, version, message, csrf) {
      calls.push({ op: "edit", args: [id, version, message, csrf] });
      const r = rows.find((x) => x.id === id);
      return move(id, version, { message, edited: message !== r?.aiMessage });
    },
    async approve(id, version, csrf) {
      calls.push({ op: "approve", args: [id, version, csrf] });
      return move(id, version, { status: "approved", approvedAt: "2026-11-05T05:00:00.000Z" });
    },
    async reject(id, version, csrf) {
      calls.push({ op: "reject", args: [id, version, csrf] });
      return move(id, version, { status: "rejected", rejectedAt: "2026-11-05T05:00:00.000Z" });
    },
  };
  return {
    api,
    calls,
    rows: () => rows,
    fail: (f: typeof failNext) => {
      failNext = f;
    },
  };
}

let host: HTMLDivElement;
let root: Root;
let dispatched: Action[];
const expire = vi.fn();
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  dispatched = [];
  expire.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => await Promise.resolve());
};
const state = (over: Partial<AppState> = {}): AppState => ({
  ...initialState("light"),
  authed: true,
  screen: "nudges",
  ...over,
});
async function mount(node: React.ReactNode, s: AppState = state()) {
  await act(async () =>
    root.render(
      <AppProvider
        state={s}
        dispatch={(a) => dispatched.push(a)}
        session={{ username: "op", signOut: () => undefined }}
      >
        {node}
      </AppProvider>,
    ),
  );
  await flush();
}
const controller = (api: NudgeApi) =>
  new NudgesController(api, "csrf-mem", expire, () => "Asia/Manila");
const button = (label: string | RegExp) =>
  [...host.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? ""),
  ) as HTMLButtonElement | undefined;
const click = async (label: string | RegExp) => {
  const b = button(label);
  if (!b) throw new Error(`no button ${String(label)} in: ${host.textContent}`);
  await act(async () => b.click());
  await flush();
};
const type = async (el: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("Nudge queue — pending review", () => {
  it("shows real counts, the list and the review panel with verified facts; no Copy and no Send", async () => {
    const f = fakeApi([
      item(1),
      item(2),
      item(3, { status: "approved", approvedAt: "2026-11-04T04:00:00.000Z" }),
    ]);
    await mount(<NudgeQueue controller={controller(f.api)} />);
    expect(host.querySelector('[data-testid="count-pending"]')?.textContent).toBe("2");
    expect(host.querySelector('[data-testid="count-approved"]')?.textContent).toBe("1");
    expect(host.querySelectorAll(".nq-list .nq-row")).toHaveLength(2);
    expect(host.textContent).toContain("Verified facts used");
    expect(host.textContent).toContain("USD 1,200.00");
    expect(host.textContent).toContain("6 days after the due date");
    expect(button("Approve for manual use")).toBeTruthy();
    expect(button(/^Copy/)).toBeUndefined(); // D2: copy only after approval
    expect(
      [...host.querySelectorAll("button")].some((b) => /^\s*send\b/i.test(b.textContent ?? "")),
    ).toBe(false);
    expect(host.textContent).not.toMatch(/unpaid|overdue|outstanding|recovered|risk score/i);
    const tabs = host.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(
      "nq-tab-pending",
    );
  });

  it("an edit must be saved (version-bound) before approval, then approval uses the NEW version", async () => {
    const f = fakeApi([item(1)]);
    await mount(<NudgeQueue controller={controller(f.api)} />);
    const ta = host.querySelector("textarea") as HTMLTextAreaElement;
    await type(ta, "Hi Customer 1, just checking in on invoice 10000001. Kind regards,");
    expect(button("Approve for manual use")?.disabled).toBe(true);
    expect(host.textContent).toContain("Unsaved edits — save them before approving.");
    await click("Save edits");
    expect(f.calls.find((c) => c.op === "edit")?.args).toEqual([
      NID(1),
      1,
      "Hi Customer 1, just checking in on invoice 10000001. Kind regards,",
      "csrf-mem",
    ]);
    expect(host.textContent).toContain("Edits saved. The original AI draft is kept unchanged.");
    await click("Approve for manual use");
    expect(f.calls.find((c) => c.op === "approve")?.args).toEqual([NID(1), 2, "csrf-mem"]);
    expect(host.textContent).toContain("Nothing was sent");
    expect(f.rows()[0]?.status).toBe("approved");
  });

  it("a change made elsewhere is reported (version conflict) with Reload, and nothing is approved", async () => {
    const f = fakeApi([item(1)]);
    await mount(<NudgeQueue controller={controller(f.api)} />);
    f.fail({ transition: { kind: "version-conflict" } });
    await click("Approve for manual use");
    expect(host.textContent).toContain("This draft changed in another tab.");
    expect(button("Reload draft")).toBeTruthy();
    expect(f.rows()[0]?.status).toBe("pending_review");
  });

  it("reject asks first, then moves the draft to History", async () => {
    const f = fakeApi([item(1)]);
    await mount(<NudgeQueue controller={controller(f.api)} />);
    await click("Reject");
    expect(f.calls.some((c) => c.op === "reject")).toBe(false);
    expect(host.textContent).toContain("Reject this draft?");
    await click("Reject draft");
    expect(f.calls.find((c) => c.op === "reject")?.args).toEqual([NID(1), 1, "csrf-mem"]);
    expect(host.textContent).toContain("moved to History. Nothing was sent.");
  });

  it("regenerate confirms the costed call, names the exact pending draft and its version, and uses the chosen tone", async () => {
    const f = fakeApi([item(1)]);
    await mount(<NudgeQueue controller={controller(f.api)} />);
    const sel = host.querySelector(".nq-regen select") as HTMLSelectElement;
    await act(async () => {
      sel.value = "firm";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click("Regenerate");
    expect(f.calls.some((c) => c.op === "generate")).toBe(false);
    expect(host.textContent).toContain("This makes one AI call.");
    await click("Draft new version");
    expect(f.calls.find((c) => c.op === "generate")?.args).toEqual([
      INV(1),
      { tone: "firm", timeZone: "Asia/Manila", replace: { id: NID(1), version: 1 } },
      "csrf-mem",
    ]);
    expect(host.textContent).toContain(
      "New firm draft ready for review. The previous draft moved to History.",
    );
  });

  it.each([
    [
      { kind: "rate-limited", retryAfterSeconds: 480 } as GenerateOutcome,
      "You've reached the drafting limit for now.",
    ],
    [{ kind: "ai-rejected" } as GenerateOutcome, "didn't pass our checks"],
    [{ kind: "ai-unavailable" } as GenerateOutcome, "AI drafting isn't available right now."],
    [
      { kind: "version-conflict", pending: null } as GenerateOutcome,
      "The pending draft changed in another tab.",
    ],
  ])("regenerate failure %j is explained and nothing changes", async (outcome, text) => {
    const f = fakeApi([item(1)]);
    await mount(<NudgeQueue controller={controller(f.api)} />);
    f.fail({ generate: outcome });
    await click("Regenerate");
    await click("Draft new version");
    expect(host.textContent).toContain(text);
    expect(f.rows()).toHaveLength(1);
    expect(f.rows()[0]?.status).toBe("pending_review");
  });

  it("AI off: a notice explains it, Regenerate and Draft a nudge are disabled, approval still works", async () => {
    const f = fakeApi([item(1)], false);
    await mount(<NudgeQueue controller={controller(f.api)} />);
    expect(host.textContent).toContain("AI drafting isn't available on this server.");
    expect(button("Regenerate")?.disabled).toBe(true);
    expect(button("Draft a nudge")?.disabled).toBe(true);
    expect(button("Approve for manual use")?.disabled).toBe(false);
  });
});

describe("Nudge queue — approved, history and states", () => {
  it("approved: read-only text, 'Not sent', and Copy writes exactly the approved message to the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const approved = item(1, {
      status: "approved",
      approvedAt: "2026-11-04T04:00:00.000Z",
      edited: true,
      message: "Edited text for Customer 1.",
    });
    const f = fakeApi([approved]);
    await mount(
      <NudgeQueue controller={controller(f.api)} />,
      state({ nudgeFocus: { view: "approved", id: null } }),
    );
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("Not sent — copy it into your own email or messaging app.");
    expect(host.textContent).toContain("Original AI draft and rationale");
    await click("Copy message");
    expect(writeText).toHaveBeenCalledWith("Edited text for Customer 1.");
    expect(host.textContent).toContain("Copied to clipboard");
  });

  it("history lists rejected and replaced drafts and says none were sent", async () => {
    const f = fakeApi([
      item(1, { status: "rejected", rejectedAt: "2026-11-02T04:00:00.000Z" }),
      item(2, { status: "superseded", supersededAt: "2026-11-03T04:00:00.000Z" }),
    ]);
    await mount(
      <NudgeQueue controller={controller(f.api)} />,
      state({ nudgeFocus: { view: "history", id: null } }),
    );
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(host.textContent).toContain("Rejected");
    expect(host.textContent).toContain("Replaced by a newer draft");
    expect(host.textContent).toContain("Nothing in history was sent.");
  });

  it("empty and error states (with Retry) are explicit", async () => {
    const empty = fakeApi([]);
    await mount(<NudgeQueue controller={controller(empty.api)} />);
    expect(host.textContent).toContain("No nudges waiting for review.");
    const broken = fakeApi([item(1)]);
    broken.fail({ list: true });
    await mount(<NudgeQueue controller={controller(broken.api)} />);
    expect(host.textContent).toContain("Could not load your nudges.");
    await click("Retry");
    expect(host.textContent).toContain("Verified facts used");
  });

  it("a 401 ends the session", async () => {
    const f = fakeApi([item(1)]);
    const api: NudgeApi = { ...f.api, list: async () => ({ kind: "unauthorized" }) };
    await mount(<NudgeQueue controller={controller(api)} />);
    expect(expire).toHaveBeenCalled();
  });
});

describe("Dashboard summary card", () => {
  it("shows real counts and the 3 newest pending drafts with Review; Open queue navigates", async () => {
    const f = fakeApi([item(1), item(2), item(3), item(4)]);
    await mount(
      <NudgeSummaryCard controller={controller(f.api)} />,
      state({ screen: "dashboard" }),
    );
    expect(host.textContent).toContain("AI Nudge Queue");
    expect(host.textContent).toContain("Nothing is ever sent");
    expect(host.querySelector('[data-testid="count-pending"]')?.textContent).toBe("4");
    expect(host.querySelectorAll(".nq-mini li")).toHaveLength(3);
    await click(/^Review/);
    expect(dispatched.at(-1)).toEqual({ type: "open-nudges", view: "pending", id: NID(1) });
    await click("Open queue");
    expect(dispatched.at(-1)).toEqual({ type: "open-nudges", view: "pending", id: null });
  });
});

describe("Saved-invoice drafting card", () => {
  it("drafts ONLY on click, with the chosen tone and no replacement, then offers Open in queue", async () => {
    const f = fakeApi([]);
    await mount(
      <NudgeDraftCard invoiceId={INV(5)} controller={controller(f.api)} />,
      state({ screen: "saved" }),
    );
    expect(f.calls.some((c) => c.op === "generate")).toBe(false);
    expect(host.textContent).toContain("the AI receives only the tone, the currency code");
    const firm = host.querySelector('input[value="firm"]') as HTMLInputElement;
    await act(async () => firm.click());
    await click("Draft nudge");
    expect(f.calls.filter((c) => c.op === "generate")).toHaveLength(1);
    expect(f.calls.find((c) => c.op === "generate")?.args).toEqual([
      INV(5),
      { tone: "firm", timeZone: "Asia/Manila", replace: null },
      "csrf-mem",
    ]);
    expect(host.textContent).toContain("Draft ready for review.");
    await click("Open in queue");
    expect(dispatched.at(-1)).toMatchObject({ type: "open-nudges", view: "pending" });
  });

  it("an existing pending draft is shown up front; replacing names it exactly", async () => {
    const f = fakeApi([item(1, { version: 4 })]);
    await mount(
      <NudgeDraftCard invoiceId={INV(1)} controller={controller(f.api)} />,
      state({ screen: "saved" }),
    );
    expect(host.textContent).toContain("This invoice already has a draft waiting for review.");
    expect(button("Draft nudge")).toBeUndefined();
    await click(/^Replace with a new professional draft/);
    expect(f.calls.find((c) => c.op === "generate")?.args[1]).toEqual({
      tone: "professional",
      timeZone: "Asia/Manila",
      replace: { id: NID(1), version: 4 },
    });
  });

  it.each([
    [
      { kind: "rate-limited", retryAfterSeconds: 300 } as GenerateOutcome,
      "Try again in about 5 minutes.",
    ],
    [{ kind: "ai-rejected" } as GenerateOutcome, "so nothing was saved"],
    [{ kind: "offline" } as GenerateOutcome, "Could not reach the server."],
  ])("failure %j says nothing was saved", async (outcome, text) => {
    const f = fakeApi([]);
    await mount(
      <NudgeDraftCard invoiceId={INV(5)} controller={controller(f.api)} />,
      state({ screen: "saved" }),
    );
    f.fail({ generate: outcome });
    await click("Draft nudge");
    expect(host.textContent).toContain(text);
    expect(f.rows()).toHaveLength(0);
  });

  it("AI off disables drafting with an explanation", async () => {
    const f = fakeApi([], false);
    await mount(
      <NudgeDraftCard invoiceId={INV(5)} controller={controller(f.api)} />,
      state({ screen: "saved" }),
    );
    expect(host.textContent).toContain("AI drafting isn't available on this server.");
    expect(button("Draft nudge")?.disabled).toBe(true);
  });
});

describe("date-only wording (owner refinement 1)", () => {
  it("never states payment status", () => {
    for (const d of [-7, -1, 0, 1, 6, 45])
      expect(dueDateText(d)).not.toMatch(/unpaid|overdue|outstanding|late|paid|owed/i);
    expect(dueDateText(-1)).toBe("Due in 1 day");
    expect(dueDateText(0)).toBe("Due date is today");
    expect(dueDateText(6)).toBe("6 days after the due date");
  });
});
