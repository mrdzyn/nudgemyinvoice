import { describe, expect, it, vi } from "vitest";
import { createParseRunner, effectOf } from "./runner.js";
import type { ParseResult } from "./api.js";

/**
 * Objective: one real parse at a time; duplicate clicks do nothing; a late or out-of-order answer
 * after abort/restart never reaches the UI; a 401 means "end the session"; only a validated draft
 * becomes a review form. Deferred promises stand in for the network (SIMULATED).
 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const unavailable: ParseResult = { kind: "unavailable" };

describe("createParseRunner", () => {
  it("rejects a duplicate start while pending and sends one request", () => {
    const parse = vi.fn(() => deferred<ParseResult>().promise);
    const runner = createParseRunner(parse, () => undefined);
    expect(runner.start("a")).toBe(true);
    expect(runner.start("a")).toBe(false);
    expect(runner.pending).toBe(true);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("delivers the answer once and allows a new request afterwards", async () => {
    const d = deferred<ParseResult>();
    const got: ParseResult[] = [];
    const runner = createParseRunner(
      () => d.promise,
      (r) => got.push(r),
    );
    runner.start("a");
    d.resolve(unavailable);
    await flush();
    expect(got).toEqual([unavailable]);
    expect(runner.pending).toBe(false);
    expect(runner.start("b")).toBe(true);
  });

  it("drops the answer of an aborted request, even if the transport ignores the signal", async () => {
    const d = deferred<ParseResult>();
    const got: ParseResult[] = [];
    let signal!: AbortSignal;
    const runner = createParseRunner(
      (_t, s) => ((signal = s), d.promise),
      (r) => got.push(r),
    );
    runner.start("a");
    expect(runner.abort()).toBe(true);
    expect(signal.aborted).toBe(true);
    d.resolve({
      kind: "outcome",
      outcome: { status: "invalid", errors: [{ path: "p", message: "m" }] },
    });
    await flush();
    expect(got).toEqual([]);
    expect(runner.abort()).toBe(false);
  });

  it("ignores a stale answer after abort + restart (out-of-order)", async () => {
    const first = deferred<ParseResult>();
    const second = deferred<ParseResult>();
    const queue = [first, second];
    const got: string[] = [];
    const runner = createParseRunner(
      () => queue.shift()!.promise,
      (r) => got.push(r.kind),
    );
    runner.start("old");
    runner.abort();
    runner.start("new");
    second.resolve({ kind: "forbidden" });
    await flush();
    first.resolve({ kind: "throttled", retryAfterSeconds: 1 });
    await flush();
    expect(got).toEqual(["forbidden"]);
  });

  it("turns a transport rejection into an offline result", async () => {
    const got: string[] = [];
    const runner = createParseRunner(
      () => Promise.reject(new Error("x")),
      (r) => got.push(r.kind),
    );
    runner.start("a");
    await flush();
    expect(got).toEqual(["offline"]);
  });
});

describe("effectOf", () => {
  const draft = {
    customerName: "Acme",
    customerEmail: "a@b.co",
    currency: "EUR" as const,
    lineItems: [{ description: "x", quantity: "1", unitPrice: "10.00" }],
    dueDate: "2026-12-31",
    taxPercent: null,
    discount: null,
  };
  const totals = {
    currency: "EUR" as const,
    lineTotals: ["10.00"],
    subtotal: "10.00",
    discount: "0.00",
    tax: "0.00",
    total: "10.00",
  };

  it("maps a validated draft to an editable review form only", () => {
    const fx = effectOf({ kind: "outcome", outcome: { status: "draft", draft, totals } });
    expect(fx.type).toBe("review");
    if (fx.type === "review") {
      expect(fx.form.currency).toBe("EUR");
      expect(fx.form.lines).toEqual(draft.lineItems);
    }
  });
  it("ends the session on 401", () => {
    expect(effectOf({ kind: "unauthorized" })).toEqual({ type: "expire-session" });
  });
  it.each<[ParseResult, string]>([
    [{ kind: "throttled", retryAfterSeconds: 9 }, "throttled"],
    [{ kind: "rejected", messages: ["m"] }, "rejected"],
    [{ kind: "forbidden" }, "forbidden"],
    [{ kind: "offline" }, "offline"],
    [{ kind: "malformed" }, "malformed"],
    [{ kind: "unavailable" }, "service"],
  ])("%j stays in the composer as a failure (%s) without entering review", (r, reason) => {
    const fx = effectOf(r);
    expect(fx.type).toBe("composer");
    if (fx.type === "composer") expect(fx.parse).toMatchObject({ status: "failed", reason });
  });
  it("keeps clarification, invalid and unavailable outcomes in the composer", () => {
    const q = effectOf({
      kind: "outcome",
      outcome: {
        status: "needs_clarification",
        questions: [{ field: "dueDate", question: "When?" }],
      },
    });
    expect(q).toMatchObject({ type: "composer", parse: { status: "clarify" } });
    const u = effectOf({
      kind: "outcome",
      outcome: { status: "unavailable", fallback: "manual_entry", reason: "ai_not_configured" },
    });
    expect(u).toMatchObject({
      type: "composer",
      parse: { status: "unavailable", reason: "ai_not_configured" },
    });
  });
});
