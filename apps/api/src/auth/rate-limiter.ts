/** In-memory sliding-window failure counter (single-process demo; see docs/SECURITY.md for limits). */
export class FailureLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  private live(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  /** Seconds until the key may try again, or 0 when it is allowed. */
  retryAfterSeconds(key: string): number {
    const kept = this.live(key);
    if (kept.length < this.maxFailures) return 0;
    const oldest = kept[kept.length - this.maxFailures] as number;
    return Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000));
  }

  recordFailure(key: string): void {
    const kept = this.live(key);
    kept.push(this.now());
    this.hits.set(key, kept);
    if (this.hits.size > this.maxKeys) {
      const first = this.hits.keys().next().value;
      if (first !== undefined) this.hits.delete(first);
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
