import { describe, expect, it } from "vitest";
import { AttemptLimiter, type Admission } from "./attempt-limiter.js";

const limits = { accountMax: 5, ipMax: 20, windowMs: 900_000 };
const admitted = (xs: Admission[]) => xs.filter((x) => x.ok).length;

describe("AttemptLimiter admission", () => {
  it("a synchronous burst of 100 on one account/address admits exactly the account budget", () => {
    const l = new AttemptLimiter(limits, () => 1_000);
    const results = Array.from({ length: 100 }, () => l.tryAdmit("1.1.1.1|demo", "1.1.1.1"));
    expect(admitted(results)).toBe(5);
    for (const r of results) if (!r.ok) expect(r.retryAfterSeconds).toBe(900);
  });

  it("different usernames from one address are capped by the address budget", () => {
    const l = new AttemptLimiter(limits, () => 1_000);
    const results = Array.from({ length: 100 }, (_, i) =>
      l.tryAdmit(`1.1.1.1|user-${i}`, "1.1.1.1"),
    );
    expect(admitted(results)).toBe(20);
  });

  it("rapidly alternating usernames cannot exceed accountMax per name nor ipMax overall", () => {
    const l = new AttemptLimiter(limits, () => 1_000);
    const names = ["a", "b", "c"];
    const results = Array.from({ length: 60 }, (_, i) =>
      l.tryAdmit(`1.1.1.1|${names[i % 3]}`, "1.1.1.1"),
    );
    expect(admitted(results)).toBe(15); // 3 names x 5, below the address cap of 20
  });

  it("is atomic across both budgets: a refusal on one budget reserves nothing on the other", () => {
    const l = new AttemptLimiter({ accountMax: 1, ipMax: 3, windowMs: 1000 }, () => 0);
    expect(l.tryAdmit("ip|a", "ip").ok).toBe(true);
    for (let i = 0; i < 50; i++) expect(l.tryAdmit("ip|a", "ip").ok).toBe(false); // account full
    // had refusals leaked address slots, these would already be refused
    expect(l.tryAdmit("ip|b", "ip").ok).toBe(true);
    expect(l.tryAdmit("ip|c", "ip").ok).toBe(true);
    expect(l.tryAdmit("ip|d", "ip").ok).toBe(false);
  });

  it("other addresses and accounts are unaffected", () => {
    const l = new AttemptLimiter(limits, () => 0);
    for (let i = 0; i < 5; i++) l.tryAdmit("1.1.1.1|demo", "1.1.1.1");
    expect(l.tryAdmit("1.1.1.1|demo", "1.1.1.1").ok).toBe(false);
    expect(l.tryAdmit("2.2.2.2|demo", "2.2.2.2").ok).toBe(true);
  });
});

describe("AttemptLimiter accounting and recovery", () => {
  it("reports retry-after from the oldest counted slot and recovers when the window passes", () => {
    let t = 1_000_000;
    const l = new AttemptLimiter(limits, () => t);
    for (let i = 0; i < 5; i++) {
      l.tryAdmit("ip|demo", "ip");
      t += 10_000;
    }
    const blocked = l.tryAdmit("ip|demo", "ip");
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 850 }); // first slot expires 900s after t0
    t = 1_000_000 + 899_999;
    expect(l.tryAdmit("ip|demo", "ip").ok).toBe(false); // one millisecond early: still counted
    t = 1_000_000 + 900_000;
    expect(l.tryAdmit("ip|demo", "ip").ok).toBe(true); // the first slot has now expired
    expect(l.tryAdmit("ip|demo", "ip").ok).toBe(false);
  });

  it("uses the larger wait when both budgets are full", () => {
    let t = 0;
    const l = new AttemptLimiter({ accountMax: 1, ipMax: 1, windowMs: 100_000 }, () => t);
    l.tryAdmit("ip|a", "ip");
    t = 40_000;
    expect(l.tryAdmit("ip|a", "ip")).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("success refunds the address slot and clears the account history", () => {
    const l = new AttemptLimiter({ accountMax: 2, ipMax: 3, windowMs: 1000 }, () => 0);
    const a = l.tryAdmit("ip|a", "ip");
    const b = l.tryAdmit("ip|a", "ip");
    if (!a.ok || !b.ok) throw new Error("expected admission");
    expect(l.tryAdmit("ip|a", "ip").ok).toBe(false);
    b.ticket.succeed();
    expect(l.tryAdmit("ip|a", "ip").ok).toBe(true); // account history cleared
  });

  it("a failed attempt keeps its slot consumed; an unsettled one counts as a failure", () => {
    const l = new AttemptLimiter({ accountMax: 2, ipMax: 10, windowMs: 1000 }, () => 0);
    const a = l.tryAdmit("ip|a", "ip");
    if (!a.ok) throw new Error("expected admission");
    a.ticket.fail();
    l.tryAdmit("ip|a", "ip"); // never settled
    expect(l.tryAdmit("ip|a", "ip").ok).toBe(false);
  });

  it("release (error before any hashing) refunds both slots, exactly once", () => {
    const l = new AttemptLimiter({ accountMax: 1, ipMax: 1, windowMs: 1000 }, () => 0);
    const a = l.tryAdmit("ip|a", "ip");
    if (!a.ok) throw new Error("expected admission");
    expect(l.tryAdmit("ip|a", "ip").ok).toBe(false);
    a.ticket.release();
    a.ticket.release(); // idempotent
    a.ticket.fail(); // settling twice changes nothing
    expect(l.tryAdmit("ip|a", "ip").ok).toBe(true);
    expect(l.tryAdmit("ip|a", "ip").ok).toBe(false);
  });

  it("a ticket settled after the account history was cleared does not resurrect or double-refund", () => {
    const l = new AttemptLimiter({ accountMax: 3, ipMax: 3, windowMs: 1000 }, () => 0);
    const a = l.tryAdmit("ip|a", "ip");
    const b = l.tryAdmit("ip|a", "ip");
    if (!a.ok || !b.ok) throw new Error("expected admission");
    a.ticket.succeed(); // clears account history
    b.ticket.release(); // must not throw or add capacity beyond the budget
    const next = Array.from({ length: 10 }, () => l.tryAdmit("ip|a", "ip"));
    expect(admitted(next)).toBeLessThanOrEqual(3);
  });

  it("bounds the number of tracked keys", () => {
    const l = new AttemptLimiter({ accountMax: 1, ipMax: 1000, windowMs: 1000 }, () => 0, 3);
    for (const k of ["a", "b", "c", "d", "e"]) l.tryAdmit(`ip|${k}`, "ip");
    expect(l.tryAdmit("ip|a", "ip").ok).toBe(true); // evicted, so admitted again
    expect(l.tryAdmit("ip|e", "ip").ok).toBe(false);
  });
});
