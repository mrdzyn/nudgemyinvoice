import { describe, expect, it, vi } from "vitest";
import type { ListQuery, ListResult } from "../invoices/api.js";
import type { ListItem } from "../domain/serverList.js";
import {
  ScheduleCandidateController,
  SCHEDULE_CANDIDATE_PAGE,
  type ScheduleCandidateDeps,
} from "./scheduleCandidate.js";
import type { ScheduleProposal } from "./scheduleIntent.js";

const item = (n: number): ListItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  customerName: "Northwind Studio",
  customerEmail: `n${n}@example.test`,
  currency: "USD",
  dueDate: "2030-01-15",
  total: `${n}.00`,
  createdAt: "2026-10-30T12:00:00.000Z",
  paypalState: "created",
});
const ok = (items: ListItem[], nextCursor: string | null = null): ListResult => ({
  kind: "ok",
  page: { items, nextCursor },
});
const proposal: ScheduleProposal = {
  term: "Northwind Studio",
  date: "2026-11-01",
  time: "09:00",
  timeZone: "Asia/Manila",
  dueAt: "2026-11-01T01:00:00.000Z",
};

function make(respond: (q: ListQuery, signal: AbortSignal) => Promise<ListResult> | ListResult) {
  const queries: ListQuery[] = [];
  const expired = vi.fn();
  const deps: ScheduleCandidateDeps = {
    listInvoices: async (q, signal) => {
      queries.push(q);
      return respond(q, signal);
    },
    expired,
    now: () => new Date("2026-10-31T04:00:00.000Z"),
    timeZone: () => "Asia/Manila",
  };
  return { controller: new ScheduleCandidateController(deps), queries, expired };
}

describe("authenticated follow-up candidate lookup", () => {
  it("uses the authenticated bounded search and requires an explicit exact-invoice choice", async () => {
    const { controller, queries } = make(() => ok([item(1), item(2)]));
    await controller.search(proposal);
    expect(queries).toEqual([
      {
        limit: SCHEDULE_CANDIDATE_PAGE,
        cursor: null,
        currency: null,
        status: null,
        q: "Northwind Studio",
      },
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      kind: "ready",
      selectedId: null,
      items: [{ id: item(1).id }, { id: item(2).id }],
    });
    expect(controller.confirm()).toBeNull();
    controller.select(item(2).id);
    expect(controller.confirm()).toMatchObject({ invoice: { id: item(2).id }, proposal });
    expect(controller.confirm()).toBeNull(); // proposal is single-use
  });

  it("requires choosing even a single match and refuses truncated result sets", async () => {
    const { controller } = make(() => ok([item(1)]));
    await controller.search(proposal);
    expect(controller.confirm()).toBeNull();
    const truncated = make(() =>
      ok(
        Array.from({ length: 20 }, (_, i) => item(i + 1)),
        "next",
      ),
    );
    await truncated.controller.search(proposal);
    expect(truncated.controller.getSnapshot()).toMatchObject({ kind: "truncated" });
  });

  it("drops stale non-401 completions but an internally aborted 401 still expires the session", async () => {
    const gates: { resolve: (result: ListResult) => void; signal: AbortSignal }[] = [];
    const { controller, expired } = make(
      (_q, signal) => new Promise((resolve) => gates.push({ resolve, signal })),
    );
    const first = controller.search(proposal);
    const second = controller.search({ ...proposal, term: "Other" });
    expect(gates[0]?.signal.aborted).toBe(true);
    gates[1]?.resolve(ok([item(2)]));
    await second;
    gates[0]?.resolve(ok([item(1)]));
    await first;
    expect(controller.getSnapshot()).toMatchObject({ kind: "ready", items: [{ id: item(2).id }] });

    const third = controller.search(proposal);
    const fourth = controller.search({ ...proposal, term: "Last" });
    gates[2]?.resolve({ kind: "unauthorized" });
    await third;
    expect(expired).toHaveBeenCalledTimes(1);
    gates[3]?.resolve(ok([item(2)]));
    await fourth;
    expect(controller.getSnapshot()).toMatchObject({ kind: "idle" });
  });

  it("suppresses late 401 after explicit reset/disposal and reconfirms changed zone or elapsed proposal", async () => {
    const gates: { resolve: (result: ListResult) => void; signal: AbortSignal }[] = [];
    const now = new Date("2026-10-31T04:00:00.000Z");
    const { controller, expired } = make(
      (_q, signal) => new Promise((resolve) => gates.push({ resolve, signal })),
    );
    controller.setDeps({
      listInvoices: async (_q, signal) => new Promise((resolve) => gates.push({ resolve, signal })),
      expired,
      now: () => now,
      timeZone: () => "Asia/Manila",
    });
    const pending = controller.search(proposal);
    controller.reset();
    gates[0]?.resolve({ kind: "unauthorized" });
    await pending;
    expect(expired).not.toHaveBeenCalled();

    const ready = make(() => ok([item(1)]));
    await ready.controller.search(proposal);
    ready.controller.select(item(1).id);
    ready.controller.setDeps({
      listInvoices: async () => ok([item(1)]),
      expired,
      now: () => now,
      timeZone: () => "America/Los_Angeles",
    });
    expect(ready.controller.confirm()).toBeNull();
    expect(ready.controller.getSnapshot()).toMatchObject({ kind: "reconfirm" });
    const elapsed = make(() => ok([item(1)]));
    await elapsed.controller.search(proposal);
    elapsed.controller.select(item(1).id);
    elapsed.controller.setDeps({
      listInvoices: async () => ok([item(1)]),
      expired,
      now: () => new Date("2026-11-01T02:00:00.000Z"),
      timeZone: () => "Asia/Manila",
    });
    expect(elapsed.controller.confirm()).toBeNull();
    expect(elapsed.controller.getSnapshot()).toMatchObject({ kind: "reconfirm" });

    const disposable = make(
      (_q, _signal) =>
        new Promise<ListResult>((resolve) => gates.push({ resolve, signal: _signal })),
    );
    const last = disposable.controller.search(proposal);
    disposable.controller.dispose();
    gates[1]?.resolve({ kind: "unauthorized" });
    await last;
    expect(disposable.expired).not.toHaveBeenCalled();
  });
});
