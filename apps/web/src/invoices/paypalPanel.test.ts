import { describe, expect, it, vi } from "vitest";
import type { ServerInvoice, ServerPayPalState } from "../domain/serverInvoice.js";
import type { PayPalDraftResult } from "./api.js";
import { createPayPalRunner } from "./paypalRunner.js";
import {
  awaitingReadback,
  canOfferCreate,
  initialPanel,
  panelReducer,
  type PanelAction,
  type PanelUi,
} from "./paypalPanel.js";

/**
 * Objective: a PayPal Sandbox draft POST can only follow an explicit confirmation; cancel and
 * every other path issue none; a double confirm is one request; uncertain outcomes block a blind
 * retry until the durable state is re-read; disabled is not re-probed; late answers are dropped.
 */
const NONE = {
  id: "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11",
  paypal: { state: "none", paypalInvoiceId: null, lastErrorCode: null },
} as unknown as ServerInvoice; // eligibility only reads .paypal
const confirming = panelReducer(initialPanel, { type: "open-confirm", invoice: NONE });
const creating = panelReducer(confirming, { type: "confirm" });
const result = (s: PanelUi, r: PayPalDraftResult) => panelReducer(s, { type: "result", result: r });

describe("panelReducer", () => {
  it("starts idle: nothing is requested by merely rendering", () => {
    expect(initialPanel).toMatchObject({
      phase: "idle",
      outcome: null,
      unverified: false,
      locked: false,
      seq: 0,
      verifiedWith: null,
    });
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
    expect(panelReducer(creating, { type: "open-confirm", invoice: NONE })).toBe(creating);
    const disabled = result(creating, { kind: "disabled" });
    expect(disabled.disabledSeen).toBe(true);
    expect(panelReducer(disabled, { type: "open-confirm", invoice: NONE })).toBe(disabled);
    const unsure = result(creating, { kind: "uncertain", cause: "network" });
    expect(unsure.unverified).toBe(true);
    expect(panelReducer(unsure, { type: "open-confirm", invoice: NONE })).toBe(unsure);
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
  // MAJOR-1: EVERY answer fails closed until the authoritative re-read after it has landed.
  it.each<PayPalDraftResult>([
    { kind: "created", paypalInvoiceId: "INV2-X", replayed: false },
    { kind: "mapping-refused", reason: "due_date_past" },
    { kind: "paypal-rejected", code: null },
    { kind: "paypal-mismatch", code: null },
    { kind: "forbidden" },
    { kind: "not-found" },
    { kind: "bad-request" },
    { kind: "disabled" },
  ])("%j also leaves the saved state unverified: no create until a re-read has landed", (r) => {
    const s = result(creating, r);
    expect(s.unverified).toBe(true);
    expect(s.verifiedWith).toBeNull();
    expect(panelReducer(s, { type: "open-confirm", invoice: NONE })).toBe(s);
  });
  it.each<PayPalDraftResult["kind"]>([
    "mapping-refused",
    "disabled",
    "not-found",
    "forbidden",
    "bad-request",
  ])("%s locks creating for this view even after a successful re-read", (kind) => {
    const r = { kind } as PayPalDraftResult;
    const withReason: PayPalDraftResult =
      kind === "mapping-refused" ? { kind, reason: "due_date_past" } : r;
    const s = result(creating, withReason);
    expect(s.locked).toBe(true);
    const ok = panelReducer(s, { type: "readback", ok: true, seq: s.seq, invoice: inv("none") });
    expect(canOfferCreate(inv("none"), ok)).toBe(false);
  });
  it("a read-back never lands while a new request is in flight", () => {
    expect(
      panelReducer(creating, {
        type: "readback",
        ok: true,
        seq: creating.seq,
        invoice: inv("none"),
      }),
    ).toBe(creating);
  });
  it("Check status is read-only: it never leads to creating", () => {
    const c = panelReducer(initialPanel, { type: "check-start" });
    expect(c.phase).toBe("checking");
    expect(panelReducer(c, { type: "check-start" })).toBe(c); // no overlap
    const done = panelReducer(c, { type: "check-done", ok: true, invoice: inv("none") });
    expect(done.phase).toBe("idle");
    expect(
      panelReducer(panelReducer(initialPanel, { type: "check-start" }), {
        type: "check-done",
        ok: false,
      }).readFailed,
    ).toBe(true);
  });
});

/** A saved invoice as GET /api/invoice-drafts/:id would return it (only the PayPal part matters here). */
const inv = (
  state: ServerPayPalState["state"],
  paypalInvoiceId: string | null = null,
): ServerInvoice => ({
  id: "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11",
  draft: {
    customerName: "Zeta Studio",
    customerEmail: "ap@zeta.example",
    currency: "USD",
    lineItems: [{ description: "Audit", quantity: "1", unitPrice: "300.00" }],
    dueDate: "2030-03-01",
    taxPercent: null,
    discount: null,
  },
  totals: {
    currency: "USD",
    lineTotals: ["300.00"],
    subtotal: "300.00",
    discount: "0.00",
    tax: "0.00",
    total: "300.00",
  },
  paypalInvoiceId,
  replayed: false,
  createdAt: "2026-10-27T10:00:00.000Z",
  paypal: { state, paypalInvoiceId, lastErrorCode: null },
});
const STALE = inv("none"); // what the prop still says right after a POST, before the GET has landed
const run = (s: PanelUi, ...actions: PanelAction[]) => actions.reduce(panelReducer, s);
const afterPost = (r: PayPalDraftResult) => result(creating, r);
const readOk = (s: PanelUi, invoice: ServerInvoice): PanelUi =>
  panelReducer(s, { type: "readback", ok: true, seq: s.seq, invoice });
const readFail = (s: PanelUi): PanelUi =>
  panelReducer(s, { type: "readback", ok: false, seq: s.seq });

describe("MAJOR-1 regression: no create/retry while the authoritative read-back is pending, failed or stale", () => {
  const created: PayPalDraftResult = {
    kind: "created",
    paypalInvoiceId: "INV2-NEW-1",
    replayed: false,
  };
  const mismatch: PayPalDraftResult = { kind: "paypal-mismatch", code: "payload_digest_mismatch" };
  const refused: PayPalDraftResult = { kind: "mapping-refused", reason: "rounding_required_line" };

  it("mismatch + delayed GET: the stale 'none' prop offers no retry", () => {
    const s = afterPost(mismatch);
    expect(awaitingReadback(s, STALE)).toBe(true);
    expect(canOfferCreate(STALE, s)).toBe(false);
  });
  it("mismatch + failed GET: still no retry, and the failure is flagged", () => {
    const s = readFail(afterPost(mismatch));
    expect(s.readFailed).toBe(true);
    expect(canOfferCreate(STALE, s)).toBe(false);
    expect(canOfferCreate(inv("mismatch"), s)).toBe(false);
  });
  it("mismatch + valid GET: still no retry (durable 'mismatch' never offers one)", () => {
    const m = inv("mismatch");
    expect(canOfferCreate(m, readOk(afterPost(mismatch), m))).toBe(false);
  });
  it("created + delayed GET: no create offered from the stale prop", () => {
    const s = afterPost(created);
    expect(canOfferCreate(STALE, s)).toBe(false);
    expect(awaitingReadback(s, STALE)).toBe(true);
  });
  it("created + failed GET: no create, even though readFailed is set", () => {
    const s = readFail(afterPost(created));
    expect(s.readFailed).toBe(true);
    expect(canOfferCreate(STALE, s)).toBe(false);
  });
  it("created + malformed/contradicting GET (still 'none' or a different id) is NOT accepted as verification", () => {
    for (const bad of [inv("none"), inv("created", "INV2-OTHER"), inv("unknown")]) {
      const s = readOk(afterPost(created), bad);
      expect(s.readFailed).toBe(true);
      expect(s.verifiedWith).toBeNull();
      expect(canOfferCreate(bad, s)).toBe(false);
    }
  });
  it("created + matching GET: verified, and nothing more is offered (it exists)", () => {
    const good = inv("created", "INV2-NEW-1");
    const s = readOk(afterPost(created), good);
    expect(awaitingReadback(s, good)).toBe(false);
    expect(canOfferCreate(good, s)).toBe(false);
  });
  it("mapping refused + stale 'none': no blind retry, before or after a valid read-back", () => {
    const s = afterPost(refused);
    expect(canOfferCreate(STALE, s)).toBe(false);
    const ok = readOk(s, inv("none"));
    expect(canOfferCreate(inv("none"), ok)).toBe(false);
  });
  it("uncertain + failed GET stays blocked; Check status that also fails stays blocked", () => {
    const s = readFail(afterPost({ kind: "uncertain", cause: "network" }));
    expect(canOfferCreate(STALE, s)).toBe(false);
    const checking = panelReducer(s, { type: "check-start" });
    const failed = panelReducer(checking, { type: "check-done", ok: false });
    expect(failed.readFailed).toBe(true);
    expect(canOfferCreate(STALE, failed)).toBe(false);
  });
  it("valid read-back restores only the legitimate actions", () => {
    const after = (r: PayPalDraftResult, durable: ServerInvoice) => {
      const s = readOk(afterPost(r), durable);
      return canOfferCreate(durable, s);
    };
    // uncertain answer, server never started: a fresh explicit attempt is legitimate
    expect(after({ kind: "uncertain", cause: "network" }, inv("none"))).toBe(true);
    // uncertain answer, durable 'unknown': explicit retry (the server reconciles first)
    expect(after({ kind: "paypal-unknown", code: "timeout" }, inv("unknown"))).toBe(true);
    // rejected: explicit retry
    expect(after({ kind: "paypal-rejected", code: null }, inv("rejected"))).toBe(true);
    // in flight / created / mismatch: never
    expect(after({ kind: "in-progress" }, inv("creating"))).toBe(false);
    expect(after({ kind: "reconciliation-pending" }, inv("pending"))).toBe(false);
    expect(after({ kind: "paypal-mismatch", code: null }, inv("mismatch"))).toBe(false);
  });
  it("a read-back is only valid for the exact invoice object it produced (a different prop stays blocked)", () => {
    const verified = inv("none");
    const s = readOk(afterPost({ kind: "uncertain", cause: "network" }), verified);
    expect(canOfferCreate(verified, s)).toBe(true);
    expect(canOfferCreate(inv("none"), s)).toBe(false); // an equal-looking but different object
  });
  it("a stale read-back (an earlier confirmation) cannot clear a newer guard", () => {
    const first = afterPost({ kind: "uncertain", cause: "network" }); // seq 1, awaiting
    const staleSeq = first.seq;
    // The operator can only start another POST after verification; do that, then answer the second.
    const good = inv("none");
    const verified = readOk(first, good);
    const second = result(
      run(verified, { type: "open-confirm", invoice: good }, { type: "confirm" }),
      {
        kind: "paypal-mismatch",
        code: null,
      },
    );
    expect(second.seq).toBe(staleSeq + 1);
    expect(second.unverified).toBe(true);
    // the first confirmation's slow read-back finally lands:
    const late = panelReducer(second, {
      type: "readback",
      ok: true,
      seq: staleSeq,
      invoice: inv("none"),
    });
    expect(late).toBe(second); // untouched
    expect(canOfferCreate(STALE, late)).toBe(false);
    // ...and a late failure of the old read cannot flag or unflag the newer one either
    expect(panelReducer(second, { type: "readback", ok: false, seq: staleSeq })).toBe(second);
  });
  it("a read-back that arrives while the next POST is in flight is ignored", () => {
    const first = afterPost({ kind: "uncertain", cause: "network" });
    const verifiedInv = inv("none");
    const verified = readOk(first, verifiedInv);
    const inflight = run(
      verified,
      { type: "open-confirm", invoice: verifiedInv },
      { type: "confirm" },
    );
    expect(
      panelReducer(inflight, { type: "readback", ok: true, seq: first.seq, invoice: inv("none") }),
    ).toBe(inflight);
  });
});

describe("canOfferCreate (which durable states may start a new explicit attempt)", () => {
  const states: ServerPayPalState["state"][] = [
    "none",
    "pending",
    "creating",
    "created",
    "unknown",
    "rejected",
    "mismatch",
  ];
  it("offers create only for none / rejected / unknown", () => {
    expect(states.filter((d) => canOfferCreate(inv(d), initialPanel))).toEqual(
      ["none", "unknown", "rejected"].sort(
        (a, b) => states.indexOf(a as never) - states.indexOf(b as never),
      ),
    );
  });
  it("never for created, mismatch (no blind retry) or in-flight states", () => {
    for (const d of ["created", "mismatch", "pending", "creating"] as const)
      expect(canOfferCreate(inv(d), initialPanel)).toBe(false);
  });
  it("never while busy, awaiting a re-read, locked or after a disabled answer", () => {
    expect(canOfferCreate(inv("none"), creating)).toBe(false);
    expect(canOfferCreate(inv("none"), { ...initialPanel, unverified: true })).toBe(false);
    expect(canOfferCreate(inv("none"), { ...initialPanel, locked: true })).toBe(false);
    expect(canOfferCreate(inv("none"), { ...initialPanel, disabledSeen: true })).toBe(false);
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
