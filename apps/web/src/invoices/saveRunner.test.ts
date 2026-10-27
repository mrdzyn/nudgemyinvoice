import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyLedger } from "./keyLedger.js";
import { createSaveRunner } from "./saveRunner.js";
import { mayStartSave, type SaveUi } from "./useRealSave.js";
import type { SaveResult } from "./api.js";
import type { InvoiceDraft } from "../domain/types.js";

/**
 * Objective: one save at a time; a double click sends one request; an uncertain outcome (timeout,
 * lost connection) is never a failure and a retry reuses the SAME key for the SAME body; a changed
 * body never inherits a key; late answers after abort/timeout are unreachable. Deferred promises
 * and fake timers stand in for the network (SIMULATED).
 */
const draft = {} as InvoiceDraft;
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const ok: SaveResult = { kind: "conflict" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSaveRunner", () => {
  it("ignores a second start while pending (one request on double click)", () => {
    const save = vi.fn(() => deferred<SaveResult>().promise);
    const r = createSaveRunner(save, () => undefined);
    expect(r.start(draft, "k1")).toBe(true);
    expect(r.start(draft, "k1")).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("delivers once and then allows a new save", async () => {
    const d = deferred<SaveResult>();
    const got: SaveResult[] = [];
    const r = createSaveRunner(
      () => d.promise,
      (x) => got.push(x),
    );
    r.start(draft, "k");
    d.resolve(ok);
    await flush();
    expect(got).toEqual([ok]);
    expect(r.start(draft, "k")).toBe(true);
  });
  it("drops the answer of an aborted save even if the transport ignores the signal", async () => {
    const d = deferred<SaveResult>();
    const got: SaveResult[] = [];
    let signal!: AbortSignal;
    const r = createSaveRunner(
      (_d, _k, s) => ((signal = s), d.promise),
      (x) => got.push(x),
    );
    r.start(draft, "k");
    expect(r.abort()).toBe(true);
    expect(signal.aborted).toBe(true);
    d.resolve(ok);
    await flush();
    vi.advanceTimersByTime(60_000);
    expect(got).toEqual([]);
  });
  it("reports a timeout as UNCERTAIN, aborts the request and ignores a late success", async () => {
    const d = deferred<SaveResult>();
    const got: SaveResult[] = [];
    let signal!: AbortSignal;
    const r = createSaveRunner(
      (_d, _k, s) => ((signal = s), d.promise),
      (x) => got.push(x),
      1000,
    );
    r.start(draft, "k");
    vi.advanceTimersByTime(1000);
    expect(got).toEqual([{ kind: "uncertain", cause: "timeout" }]);
    expect(signal.aborted).toBe(true);
    d.resolve({ kind: "conflict" });
    await flush();
    expect(got).toHaveLength(1);
    expect(r.pending).toBe(false);
  });
  it("a rejected transport is uncertain, never a failure", async () => {
    const got: SaveResult[] = [];
    const r = createSaveRunner(
      () => Promise.reject(new Error("x")),
      (x) => got.push(x),
    );
    r.start(draft, "k");
    await flush();
    expect(got).toEqual([{ kind: "uncertain", cause: "network" }]);
  });
  it("does not fire the timeout after a normal answer", async () => {
    const d = deferred<SaveResult>();
    const got: SaveResult[] = [];
    const r = createSaveRunner(
      () => d.promise,
      (x) => got.push(x),
      1000,
    );
    r.start(draft, "k");
    d.resolve(ok);
    await flush();
    vi.advanceTimersByTime(5000);
    expect(got).toEqual([ok]);
  });
});

describe("createKeyLedger (key lifecycle bound to the body)", () => {
  const mint = () => {
    let n = 0;
    return () => `key-${++n}-abcdefgh`;
  };
  it("reuses the same key for the identical body (explicit retry after uncertainty)", () => {
    const l = createKeyLedger(mint());
    const k = l.keyFor('{"a":1}');
    expect(l.keyFor('{"a":1}')).toBe(k);
    expect(l.matches('{"a":1}')).toBe(true);
  });
  it("never lets an edited body inherit the old key", () => {
    const l = createKeyLedger(mint());
    const k = l.keyFor('{"a":1}');
    const k2 = l.keyFor('{"a":2}');
    expect(k2).not.toBe(k);
    expect(l.matches('{"a":1}')).toBe(false);
  });
  it("reset (explicit new key / abandon) mints a fresh key for the same body", () => {
    const l = createKeyLedger(mint());
    const k = l.keyFor("b");
    l.reset();
    expect(l.active).toBe(false);
    expect(l.keyFor("b")).not.toBe(k);
  });
});

describe("mayStartSave (submit gate)", () => {
  const ui = (status: SaveUi["status"]): SaveUi =>
    status === "uncertain"
      ? { status, cause: "timeout" }
      : status === "failed"
        ? { status, reason: "rejected", messages: [] }
        : ({ status } as SaveUi);
  it("allows a first save and a retry after a definite failure", () => {
    expect(mayStartSave(ui("idle"), false, false)).toBe(true);
    expect(mayStartSave(ui("failed"), false, true)).toBe(true);
  });
  it("blocks while a save is pending", () => {
    expect(mayStartSave(ui("saving"), true, true)).toBe(false);
  });
  it("blocks over an unresolved 409 until the operator asks for a new key", () => {
    expect(mayStartSave(ui("conflict"), false, true)).toBe(false);
  });
  it("after an uncertain outcome allows only the identical body, never an edited one", () => {
    expect(mayStartSave(ui("uncertain"), false, true)).toBe(true);
    expect(mayStartSave(ui("uncertain"), false, false)).toBe(false);
  });
});
