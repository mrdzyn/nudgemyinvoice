import { describe, expect, it } from "vitest";
import type { FollowUpView, ListOutcome } from "../followups/api.js";
import type { ListItem } from "../domain/serverList.js";
import type { ListQuery, ListResult } from "../invoices/api.js";
import { parseIntent, type Intent } from "./intent.js";
import {
  CHAT_PAGE,
  GROUPS,
  OVERVIEW_PAGE,
  runLookup,
  summarizeForAnnouncement,
  type LookupDeps,
} from "./lookup.js";

const intent = (s: string): Intent => {
  const r = parseIntent(s);
  if (!r.ok) throw new Error("rejected");
  return r.intent;
};
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
const page = (items: ListItem[], nextCursor: string | null = null): ListResult => ({
  kind: "ok",
  page: { items, nextCursor },
});
const fu = (n: number, state: "due" | "upcoming"): FollowUpView => ({
  id: `00000000-0000-4000-8000-0000000000a${n}`,
  invoiceId: `10000000-0000-4000-8000-00000000000${n}`,
  dueAt: "2026-11-02T01:30:00.000Z",
  timezone: "Asia/Manila",
  note: null,
  message: "m",
  status: "active",
  state,
  invoice: {
    customerName: `Customer ${n}`,
    currency: "USD",
    total: "540.00",
    dueDate: "2030-01-15",
  },
});
const sig = () => new AbortController().signal;

function deps(
  over: {
    list?: (q: ListQuery) => ListResult | Promise<ListResult>;
    follow?: () => ListOutcome | Promise<ListOutcome>;
  } = {},
) {
  const queries: ListQuery[] = [];
  let followReads = 0;
  const d: LookupDeps = {
    listInvoices: async (q) => {
      queries.push(q);
      return over.list ? over.list(q) : page([]);
    },
    readFollowUps: async () => {
      followReads++;
      return over.follow
        ? over.follow()
        : {
            kind: "ok",
            now: "2026-10-30T12:00:00.000Z",
            counts: { due: 0, upcoming: 0 },
            items: [],
          };
    },
  };
  return { d, queries, reads: () => followReads };
}

describe("Nudgey lookup: read-only requests to the existing APIs", () => {
  it("'pending invoices' asks the server once per PayPal DRAFT group (bounded) and keeps the groups apart", async () => {
    const { d, queries } = deps({
      list: (q) =>
        page(
          q.status === "none"
            ? [item(1), item(2)]
            : q.status === "created"
              ? [item(3, { paypalState: "created" })]
              : [],
        ),
    });
    const r = await runLookup(intent("What are my pending invoices?"), d, sig());
    expect(queries.map((q) => [q.status, q.limit, q.currency, q.q, q.cursor])).toEqual([
      ["none", OVERVIEW_PAGE, null, null, null],
      ["progress", OVERVIEW_PAGE, null, null, null],
      ["created", OVERVIEW_PAGE, null, null, null],
      ["attention", OVERVIEW_PAGE, null, null, null],
    ]);
    expect(r.kind).toBe("overview");
    if (r.kind !== "overview") return;
    expect(r.groups.map((g) => [g.label, g.items.length])).toEqual([
      ["No PayPal draft", 2],
      ["PayPal draft in progress", 0],
      ["PayPal Sandbox draft created", 1],
      ["Needs PayPal attention", 0],
    ]);
    expect(JSON.stringify(r)).not.toMatch(/unpaid|overdue|\bpaid\b/i);
  });

  it("discloses truncation per group and never reports a total it does not have", async () => {
    const { d } = deps({ list: (q) => page([item(1)], q.status === "none" ? "cursor-1" : null) });
    const r = await runLookup(intent("pending invoices"), d, sig());
    if (r.kind !== "overview") throw new Error("kind");
    expect(r.groups.map((g) => g.more)).toEqual([true, false, false, false]);
    expect(JSON.stringify(r)).not.toMatch(/"total(Count)?":\s*\d/);
  });

  it("a partial failure is shown per group; a total failure is one honest error", async () => {
    const partial = deps({
      list: (q) => (q.status === "created" ? { kind: "unavailable" } : page([])),
    });
    const r = await runLookup(intent("pending invoices"), partial.d, sig());
    if (r.kind !== "overview") throw new Error("kind");
    expect(r.groups.map((g) => g.failed)).toEqual([null, null, "unavailable", null]);
    const all = deps({ list: () => ({ kind: "offline" }) });
    expect(await runLookup(intent("pending invoices"), all.d, sig())).toEqual({
      kind: "error",
      failure: "offline",
    });
  });

  it("'show my USD invoices' sends the currency filter and a bounded page, never a client-side filter", async () => {
    const { d, queries } = deps({
      list: () => page([item(1), item(2, { currency: "USD" })], "more"),
    });
    const r = await runLookup(intent("Show my USD invoices"), d, sig());
    expect(queries).toEqual([
      { limit: CHAT_PAGE, cursor: null, currency: "USD", status: null, q: null },
    ]);
    expect(r).toMatchObject({ kind: "invoices", more: true });
    if (r.kind === "invoices") expect(r.title).toBe("USD invoices");
  });

  it("'show my PayPal drafts' filters on the created PayPal state", async () => {
    const { d, queries } = deps();
    await runLookup(intent("Show my PayPal drafts"), d, sig());
    expect(queries[0]).toMatchObject({ status: "created", currency: null, q: null });
  });

  it("a customer search sends the term as the POST body field q and nothing else", async () => {
    const { d, queries } = deps({
      list: () => page([item(1, { customerName: "Northwind Studio" })]),
    });
    const r = await runLookup(intent("Find invoices for Northwind Studio"), d, sig());
    expect(queries).toEqual([
      { limit: CHAT_PAGE, cursor: null, currency: null, status: null, q: "Northwind Studio" },
    ]);
    expect(r).toMatchObject({
      kind: "invoices",
      more: false,
      items: [{ customerName: "Northwind Studio" }],
    });
  });

  it("an empty result is reported as no match, not as an error or an invented record", async () => {
    const { d } = deps();
    expect(await runLookup(intent("Find invoices for Nobody Ltd"), d, sig())).toMatchObject({
      kind: "invoices",
      items: [],
      more: false,
    });
  });

  it("each invoice keeps its own currency; nothing is summed across currencies", async () => {
    const { d } = deps({
      list: () =>
        page([
          item(1, { currency: "USD", total: "540.00" }),
          item(2, { currency: "EUR", total: "431.98" }),
        ]),
    });
    const r = await runLookup(intent("show my invoices"), d, sig());
    expect(r).toMatchObject({
      kind: "invoices",
      items: [
        { currency: "USD", total: "540.00" },
        { currency: "EUR", total: "431.98" },
      ],
    });
    expect(JSON.stringify(r)).not.toMatch(/971\.98|sum/i);
  });

  it("follow-ups use a FRESH server read and filter by the server's own due/upcoming state", async () => {
    const { d, reads, queries } = deps({
      follow: () => ({
        kind: "ok",
        now: "2026-10-30T12:00:00.000Z",
        counts: { due: 1, upcoming: 2 },
        items: [fu(1, "due"), fu(2, "upcoming"), fu(3, "upcoming")],
      }),
    });
    const due = await runLookup(intent("Which follow-ups are due?"), d, sig());
    expect(due).toMatchObject({ kind: "followups", which: "due", counts: { due: 1, upcoming: 2 } });
    if (due.kind === "followups") expect(due.items.map((i) => i.state)).toEqual(["due"]);
    const up = await runLookup(intent("What follow-ups are upcoming?"), d, sig());
    if (up.kind === "followups")
      expect(up.items.map((i) => i.state)).toEqual(["upcoming", "upcoming"]);
    const all = await runLookup(intent("show my follow-ups"), d, sig());
    if (all.kind === "followups") expect(all.items).toHaveLength(3);
    expect(reads()).toBe(3);
    expect(queries).toEqual([]); // invoice list not used for follow-ups
  });

  it("marks a follow-up answer as limited when the server's 100-item bound may have applied", async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      ...fu(1, "upcoming"),
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    const { d } = deps({
      follow: () => ({
        kind: "ok",
        now: "2026-10-30T12:00:00.000Z",
        counts: { due: 0, upcoming: 100 },
        items: many,
      }),
    });
    expect(await runLookup(intent("follow-ups upcoming"), d, sig())).toMatchObject({
      kind: "followups",
      limited: true,
    });
  });

  it("payment questions and unknown text make NO request and say the truth", async () => {
    const { d, queries, reads } = deps();
    const pay = await runLookup(intent("Is Northwind Studio paid?"), d, sig());
    expect(pay).toMatchObject({ kind: "message", tone: "limit" });
    if (pay.kind === "message") {
      expect(pay.text).toMatch(/can't tell you whether an invoice is paid, unpaid or overdue/);
      expect(pay.text).toMatch(/not .*payment status|does not receive or reconcile payment/);
    }
    const help = await runLookup(intent("tell me a joke"), d, sig());
    expect(help).toMatchObject({ kind: "message", tone: "info" });
    expect(queries).toEqual([]);
    expect(reads()).toBe(0);
  });

  it("maps 401 to session expiry and other failures to honest errors", async () => {
    for (const [kind, want] of [
      ["unauthorized", { kind: "expired" }],
      ["forbidden", { kind: "error", failure: "forbidden" }],
      ["offline", { kind: "error", failure: "offline" }],
      ["unavailable", { kind: "error", failure: "unavailable" }],
      ["malformed", { kind: "error", failure: "malformed" }],
      ["rejected", { kind: "error", failure: "rejected" }],
    ] as const) {
      const { d } = deps({ list: () => ({ kind }) as ListResult });
      expect(await runLookup(intent("show my invoices"), d, sig()), kind).toEqual(want);
    }
    const f = deps({ follow: () => ({ kind: "unauthorized" }) });
    expect(await runLookup(intent("follow-ups due"), f.d, sig())).toEqual({ kind: "expired" });
    const g = deps({ follow: () => ({ kind: "offline" }) });
    expect(await runLookup(intent("follow-ups due"), g.d, sig())).toEqual({
      kind: "error",
      failure: "offline",
    });
  });

  it("an aborted lookup yields nothing renderable, even if the server answered", async () => {
    const ac = new AbortController();
    const { d } = deps({
      list: () => {
        ac.abort();
        return page([item(1)]);
      },
    });
    expect(await runLookup(intent("show my invoices"), d, ac.signal)).toEqual({ kind: "aborted" });
    const ac2 = new AbortController();
    const f = deps({
      follow: () => {
        ac2.abort();
        return {
          kind: "ok",
          now: "2026-10-30T12:00:00.000Z",
          counts: { due: 1, upcoming: 0 },
          items: [fu(1, "due")],
        };
      },
    });
    expect(await runLookup(intent("follow-ups due"), f.d, ac2.signal)).toEqual({ kind: "aborted" });
  });

  it("announcements are one short sentence, never the list", async () => {
    const { d } = deps({ list: () => page([item(1), item(2)], "x") });
    const r = await runLookup(intent("show my invoices"), d, sig());
    const s = summarizeForAnnouncement(r);
    expect(s).toBe("Showing 2 invoices, more are available in the dashboard.");
    expect(s).not.toContain("Customer");
  });

  it("the spoken summary never calls the account empty when a group could not be loaded (review M3)", async () => {
    const mk = (failed: (string | null)[], counts: number[]) => ({
      kind: "overview" as const,
      groups: GROUPS.map((g, i) => ({
        ...g,
        items: Array.from({ length: counts[i] ?? 0 }, (_, n) => item(n + 1)),
        more: false,
        failed: (failed[i] ?? null) as "unavailable" | null,
      })),
    });
    // genuinely empty: every group answered and was empty
    expect(summarizeForAnnouncement(mk([null, null, null, null], [0, 0, 0, 0]))).toBe(
      "No saved invoices found.",
    );
    // all zero rows, but one group failed: must NOT say there are no invoices
    const partialEmpty = summarizeForAnnouncement(
      mk([null, null, "unavailable", null], [0, 0, 0, 0]),
    );
    expect(partialEmpty).toBe(
      "Some PayPal draft groups could not be loaded, so I can't say whether you have saved invoices.",
    );
    expect(partialEmpty).not.toMatch(/no saved invoices/i);
    // some rows and one failure
    expect(summarizeForAnnouncement(mk(["unavailable", null, null, null], [0, 0, 2, 0]))).toBe(
      "Showing 2 saved invoices; 1 PayPal draft group could not be loaded.",
    );
    expect(
      summarizeForAnnouncement(mk(["unavailable", "unavailable", null, null], [0, 0, 1, 0])),
    ).toBe("Showing 1 saved invoices; 2 PayPal draft groups could not be loaded.");
    // and the lookup itself produces exactly that shape for a partial failure
    const { d } = deps({
      list: (q) => (q.status === "attention" ? { kind: "unavailable" } : page([])),
    });
    const r = await runLookup(intent("pending invoices"), d, sig());
    expect(summarizeForAnnouncement(r)).not.toMatch(/no saved invoices/i);
  });
});
