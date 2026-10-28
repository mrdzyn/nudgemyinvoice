import { describe, expect, it, vi } from "vitest";
import type { PayPalDraftResult } from "./api.js";
import { createPayPalRunner } from "./paypalRunner.js";
import {
  canOfferCreate,
  initialPanel,
  panelReducer,
  type DurableState,
  type PanelUi,
} from "./paypalPanel.js";

/**
 * Objective: a PayPal Sandbox draft POST can only follow an explicit confirmation; cancel and
 * every other path issue none; a double confirm is one request; uncertain outcomes block a blind
 * retry until the durable state is re-read; disabled is not re-probed; late answers are dropped.
 */
const confirming = panelReducer(initialPanel, { type: "open-confirm" });
const creating = panelReducer(confirming, { type: "confirm" });
const result = (s: PanelUi, r: PayPalDraftResult) => panelReducer(s, { type: "result", result: r });

describe("panelReducer", () => {
  it("starts idle: nothing is requested by merely rendering", () => {
    expect(initialPanel).toMatchObject({ phase: "idle", outcome: null, unverified: false });
  });
  it("the only path to a request is open -> confirm", () => {
    expect(confirming.phase).toBe("confirming");
    expect(creating.phase).toBe("creating");
    // confirm without an open dialog does nothing
    expect(panelReducer(initialPanel, { type: "confirm" })).toBe(initialPanel);
    // nor can it be reached from checking or creating
    expect(panelReducer(creating, { type: "confirm" })).toBe(creating);
    expect(
      panelReducer(panelReducer(initialPanel, { type: "check-start" }), { type: "confirm" }).phase,
    ).toBe("checking");
  });
  it("cancel returns to idle and leaves nothing to send", () => {
    const c = panelReducer(confirming, { type: "cancel-confirm" });
    expect(c.phase).toBe("idle");
    expect(panelReducer(c, { type: "confirm" })).toBe(c); // a stray confirm after cancel is inert
  });
  it("opening is refused while creating, checking, unverified or after 'disabled'", () => {
    expect(panelReducer(creating, { type: "open-confirm" })).toBe(creating);
    const disabled = result(creating, { kind: "disabled" });
    expect(disabled.disabledSeen).toBe(true);
    expect(panelReducer(disabled, { type: "open-confirm" })).toBe(disabled);
    const unsure = result(creating, { kind: "uncertain", cause: "network" });
    expect(unsure.unverified).toBe(true);
    expect(panelReducer(unsure, { type: "open-confirm" })).toBe(unsure);
  });
  it("a result is accepted only while a request is in flight (late/stray answers are ignored)", () => {
    expect(
      result(initialPanel, { kind: "created", paypalInvoiceId: "INV2-X", replayed: false }),
    ).toBe(initialPanel);
    expect(result(confirming, { kind: "disabled" })).toBe(confirming);
  });
  it.each<PayPalDraftResult>([
    { kind: "uncertain", cause: "timeout" },
    { kind: "paypal-unknown", code: "timeout" },
    { kind: "in-progress" },
    { kind: "reconciliation-pending" },
    { kind: "unavailable" },
  ])("%j leaves the saved state unverified (no blind retry)", (r) => {
    const s = result(creating, r);
    expect(s.phase).toBe("idle");
    expect(s.outcome).toEqual(r);
    expect(s.unverified).toBe(true);
  });
  it.each<PayPalDraftResult>([
    { kind: "created", paypalInvoiceId: "INV2-X", replayed: false },
    { kind: "mapping-refused", reason: "due_date_past" },
    { kind: "paypal-rejected", code: null },
    { kind: "paypal-mismatch", code: null },
    { kind: "forbidden" },
    { kind: "not-found" },
    { kind: "bad-request" },
  ])("%j is definite and does not by itself block the next explicit action", (r) => {
    expect(result(creating, r).unverified).toBe(false);
  });
  it("a successful read-back clears 'unverified'; a failed one keeps it and flags stale data", () => {
    const unsure = result(creating, { kind: "uncertain", cause: "network" });
    const ok = panelReducer(unsure, { type: "readback", ok: true });
    expect(ok.unverified).toBe(false);
    expect(ok.readFailed).toBe(false);
    const bad = panelReducer(unsure, { type: "readback", ok: false });
    expect(bad.unverified).toBe(true);
    expect(bad.readFailed).toBe(true);
  });
  it("a read-back never lands while a new request is in flight", () => {
    expect(panelReducer(creating, { type: "readback", ok: true })).toBe(creating);
  });
  it("Check status is read-only: it never leads to creating", () => {
    const c = panelReducer(initialPanel, { type: "check-start" });
    expect(c.phase).toBe("checking");
    expect(panelReducer(c, { type: "check-start" })).toBe(c); // no overlap
    const done = panelReducer(c, { type: "check-done", ok: true });
    expect(done.phase).toBe("idle");
    expect(
      panelReducer(panelReducer(initialPanel, { type: "check-start" }), {
        type: "check-done",
        ok: false,
      }).readFailed,
    ).toBe(true);
  });
});

describe("canOfferCreate (which durable states may start a new explicit attempt)", () => {
  const states: DurableState[] = [
    "none",
    "pending",
    "creating",
    "created",
    "unknown",
    "rejected",
    "mismatch",
  ];
  it("offers create only for none / rejected / unknown", () => {
    expect(states.filter((d) => canOfferCreate(d, initialPanel))).toEqual(
      ["none", "unknown", "rejected"].sort(
        (a, b) => states.indexOf(a as DurableState) - states.indexOf(b as DurableState),
      ),
    );
  });
  it("never for created, mismatch (no blind retry) or in-flight states", () => {
    for (const d of ["created", "mismatch", "pending", "creating"] as const)
      expect(canOfferCreate(d, initialPanel)).toBe(false);
  });
  it("never while busy, unverified or after a disabled answer", () => {
    expect(canOfferCreate("none", creating)).toBe(false);
    expect(canOfferCreate("none", { ...initialPanel, unverified: true })).toBe(false);
    expect(canOfferCreate("none", { ...initialPanel, disabledSeen: true })).toBe(false);
  });
});

describe("createPayPalRunner (single flight, timeout = uncertain)", () => {
  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((a) => (resolve = a));
    return { promise, resolve };
  };
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  it("a second start while pending sends nothing", () => {
    const create = vi.fn(() => deferred<PayPalDraftResult>().promise);
    const r = createPayPalRunner(create, () => undefined);
    expect(r.start()).toBe(true);
    expect(r.start()).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("delivers once; an aborted request's late answer is unreachable", async () => {
    const d = deferred<PayPalDraftResult>();
    const got: PayPalDraftResult[] = [];
    const r = createPayPalRunner(
      () => d.promise,
      (x) => got.push(x),
    );
    r.start();
    expect(r.abort()).toBe(true);
    d.resolve({ kind: "created", paypalInvoiceId: "INV2-LATE", replayed: false });
    await flush();
    expect(got).toEqual([]);
  });
  it("a timeout is UNCERTAIN, aborts the request and ignores a late success", async () => {
    vi.useFakeTimers();
    try {
      const d = deferred<PayPalDraftResult>();
      const got: PayPalDraftResult[] = [];
      let signal!: AbortSignal;
      const r = createPayPalRunner(
        (s) => ((signal = s), d.promise),
        (x) => got.push(x),
        1000,
      );
      r.start();
      vi.advanceTimersByTime(1000);
      expect(got).toEqual([{ kind: "uncertain", cause: "timeout" }]);
      expect(signal.aborted).toBe(true);
      d.resolve({ kind: "created", paypalInvoiceId: "INV2-LATE", replayed: false });
      await flush();
      expect(got).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("a rejected transport is uncertain, never a failure", async () => {
    const got: PayPalDraftResult[] = [];
    const r = createPayPalRunner(
      () => Promise.reject(new Error("x")),
      (x) => got.push(x),
    );
    r.start();
    await flush();
    expect(got).toEqual([{ kind: "uncertain", cause: "network" }]);
  });
});
