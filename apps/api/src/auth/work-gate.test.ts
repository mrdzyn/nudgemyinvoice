import { describe, expect, it } from "vitest";
import { BoundedWorkGate } from "./work-gate.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("BoundedWorkGate", () => {
  it("rejects reservations beyond concurrent + queued, synchronously", () => {
    const g = new BoundedWorkGate(2, 3);
    const slots = Array.from({ length: 8 }, () => g.reserve());
    expect(slots.filter(Boolean)).toHaveLength(5);
    expect(g.outstanding).toBe(5);
  });

  it("never runs more than maxConcurrent jobs at once and runs queued jobs in FIFO order", async () => {
    const g = new BoundedWorkGate(2, 4);
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    const gates = Array.from({ length: 6 }, () => deferred());
    const jobs = Array.from({ length: 6 }, (_, i) => {
      const slot = g.reserve();
      if (!slot) throw new Error("expected a slot");
      return slot.run(async () => {
        order.push(i);
        running++;
        peak = Math.max(peak, running);
        await (gates[i] as ReturnType<typeof deferred>).promise;
        running--;
      });
    });
    await Promise.resolve();
    expect(running).toBe(2);
    expect(order).toEqual([0, 1]);
    for (const d of gates) d.resolve();
    await Promise.all(jobs);
    expect(peak).toBe(2);
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
    expect(g.outstanding).toBe(0);
  });

  it("frees capacity when a job throws, and when a reservation is released unused", async () => {
    const g = new BoundedWorkGate(1, 0);
    const first = g.reserve();
    expect(g.reserve()).toBeNull();
    await expect(first?.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const second = g.reserve();
    expect(second).not.toBeNull();
    second?.release();
    second?.release(); // idempotent
    expect(g.outstanding).toBe(0);
    expect(g.reserve()).not.toBeNull();
  });

  it("refuses to run on a released slot", async () => {
    const g = new BoundedWorkGate(1, 1);
    const s = g.reserve();
    s?.release();
    await expect(s?.run(async () => 1)).rejects.toThrow(/released/);
  });

  it("rejects nonsensical bounds", () => {
    expect(() => new BoundedWorkGate(0, 1)).toThrow();
    expect(() => new BoundedWorkGate(1, -1)).toThrow();
  });
});
