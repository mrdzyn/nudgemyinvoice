import { describe, expect, it, vi } from "vitest";
import { createNudgeApi, type NudgeApi, type SummaryOutcome } from "./api.js";
import { NudgesController } from "./controller.js";

/**
 * Objective (P6-AUD-03): a RECEIVED 401 always ends the session, even when the request was cancelled after the
 * status arrived (navigation, a superseding refresh). Only disposal of the workspace suppresses it. Deterministic:
 * every response is released by the test, never by a timer.
 */
const INV = "10000000-0000-4000-8000-000000000001";
const counts = { pending: 0, approved: 0, rejected: 0, superseded: 0, total: 0 };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => (resolve = r));
  return { p, resolve };
}

describe("transport: a received 401 outranks cancellation", () => {
  it("generate: the 401 status arrives, the caller aborts before the body is read -> unauthorized (not aborted)", async () => {
    const ac = new AbortController();
    const body = deferred<unknown>();
    const fetchLike = vi.fn(async () => {
      // The status line has been received; the caller navigates away before the body is parsed.
      ac.abort();
      return { status: 401, json: () => body.p } as unknown as Response;
    });
    const api = createNudgeApi(fetchLike);
    const pending = api.generate(
      INV,
      { tone: "firm", timeZone: "UTC", replace: null },
      "t",
      ac.signal,
    );
    body.resolve({ error: "unauthorized" });
    expect(await pending).toEqual({ kind: "unauthorized" });
  });
  it.each([
    ["summary", (a: NudgeApi, s: AbortSignal) => a.summary(s)],
    ["list", (a: NudgeApi, s: AbortSignal) => a.list("pending", null, s)],
    ["approve", (a: NudgeApi, s: AbortSignal) => a.approve(INV, 1, "t", s)],
    ["edit", (a: NudgeApi, s: AbortSignal) => a.edit(INV, 1, "x", "t", s)],
    ["reject", (a: NudgeApi, s: AbortSignal) => a.reject(INV, 1, "t", s)],
  ])("%s: the same late-abort 401 is reported as unauthorized", async (_n, call) => {
    const ac = new AbortController();
    const api = createNudgeApi(async () => {
      ac.abort();
      return { status: 401, json: async () => ({}) } as unknown as Response;
    });
    expect(await call(api, ac.signal)).toEqual({ kind: "unauthorized" });
  });
  it("a request that never received a response stays merely aborted (no session end)", async () => {
    const ac = new AbortController();
    ac.abort();
    const api = createNudgeApi(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    expect(await api.summary(ac.signal)).toEqual({ kind: "aborted" });
  });
});

describe("controller: late 401s end the session", () => {
  const api = (summary: () => Promise<SummaryOutcome>, over: Partial<NudgeApi> = {}): NudgeApi =>
    ({
      summary: () => summary(),
      list: async () => ({ kind: "ok", items: [] }),
      generate: async () => ({ kind: "unavailable" }),
      edit: async () => ({ kind: "unavailable" }),
      approve: async () => ({ kind: "unavailable" }),
      reject: async () => ({ kind: "unavailable" }),
      ...over,
    }) as NudgeApi;

  it("a refresh SUPERSEDED (aborted) by a newer one still expires the session when its 401 lands", async () => {
    const first = deferred<SummaryOutcome>();
    const second = deferred<SummaryOutcome>();
    const queue = [first, second];
    const expire = vi.fn();
    const approved = { kind: "ok", nudge: {} } as unknown as Awaited<
      ReturnType<NudgeApi["approve"]>
    >;
    const c = new NudgesController(
      api(() => queue.shift()!.p, { approve: async () => approved }),
      "csrf",
      expire,
      () => "UTC",
    );
    const r1 = c.refresh();
    // The operator's own change supersedes (aborts) the first read and starts another.
    await c.approve(INV, 1, new AbortController().signal);
    first.resolve({ kind: "unauthorized" });
    await r1;
    expect(expire).toHaveBeenCalledTimes(1);
    second.resolve({ kind: "ok", counts, aiAvailable: false });
  });
  it("a caller-aborted mutation whose 401 was received still expires the session", async () => {
    const expire = vi.fn();
    const ac = new AbortController();
    const c = new NudgesController(
      api(async () => ({ kind: "ok", counts, aiAvailable: true }), {
        generate: async () => {
          ac.abort();
          return { kind: "unauthorized" };
        },
      }),
      "csrf",
      expire,
      () => "UTC",
    );
    expect((await c.generate(INV, "firm", null, ac.signal)).kind).toBe("unauthorized");
    expect(expire).toHaveBeenCalledTimes(1);
  });
  it("after the workspace is disposed (stop), a late 401 is ignored", async () => {
    const d = deferred<SummaryOutcome>();
    const expire = vi.fn();
    const c = new NudgesController(
      api(() => d.p),
      "csrf",
      expire,
      () => "UTC",
    );
    const r = c.refresh();
    c.stop();
    d.resolve({ kind: "unauthorized" });
    await r;
    expect(expire).not.toHaveBeenCalled();
  });
});
