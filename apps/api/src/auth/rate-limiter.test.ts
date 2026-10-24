import { describe, expect, it } from "vitest";
import { FailureLimiter } from "./rate-limiter.js";

describe("FailureLimiter", () => {
  it("blocks after the limit, reports retry-after, and recovers when the window passes", () => {
    let t = 1_000_000;
    const l = new FailureLimiter(3, 60_000, () => t);
    for (let i = 0; i < 3; i++) {
      expect(l.retryAfterSeconds("k")).toBe(0);
      l.recordFailure("k");
      t += 1000;
    }
    expect(l.retryAfterSeconds("k")).toBeGreaterThan(0);
    expect(l.retryAfterSeconds("k")).toBeLessThanOrEqual(60);
    expect(l.retryAfterSeconds("other")).toBe(0);
    t += 61_000;
    expect(l.retryAfterSeconds("k")).toBe(0);
  });
  it("reset clears a key, and the key table is bounded", () => {
    const l = new FailureLimiter(1, 60_000, () => 1, 3);
    l.recordFailure("a");
    expect(l.retryAfterSeconds("a")).toBeGreaterThan(0);
    l.reset("a");
    expect(l.retryAfterSeconds("a")).toBe(0);
    for (const k of ["1", "2", "3", "4", "5"]) l.recordFailure(k);
    expect(l.retryAfterSeconds("1")).toBe(0); // evicted
    expect(l.retryAfterSeconds("5")).toBeGreaterThan(0);
  });
});
