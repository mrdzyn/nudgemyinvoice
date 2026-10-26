/**
 * Fixed budget of N units per rolling window per key (single process, in memory).
 * `tryTake` is synchronous, so a burst cannot over-spend it.
 */
export class WindowBudget {
  private readonly taken = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 1_000,
  ) {}

  tryTake(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const cutoff = this.now() - this.windowMs;
    const live = (this.taken.get(key) ?? []).filter((t) => t > cutoff);
    if (live.length >= this.max) {
      const first = live[live.length - this.max] as number;
      this.taken.set(key, live);
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((first + this.windowMs - this.now()) / 1000)),
      };
    }
    live.push(this.now());
    this.taken.set(key, live);
    if (this.taken.size > this.maxKeys) {
      const k = this.taken.keys().next().value;
      if (k !== undefined) this.taken.delete(k);
    }
    return { ok: true };
  }
}
