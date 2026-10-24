/**
 * Bounds concurrent password-hashing work (scrypt uses ~128 MiB per hash).
 *
 * `reserve()` is SYNCHRONOUS and returns null when `maxConcurrent + maxQueued` reservations are
 * already outstanding, so the caller can answer 429 before doing any database or hashing work.
 * A reservation runs at most `maxConcurrent` jobs at once; the rest wait in FIFO order.
 */
export interface GateSlot {
  /** Waits for a free worker, runs `fn`, then frees the worker and the reservation. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Frees the reservation without running (idempotent; also safe after `run`). */
  release(): void;
}

export class BoundedWorkGate {
  private reserved = 0;
  private running = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {
    if (maxConcurrent < 1 || maxQueued < 0) throw new Error("invalid gate bounds");
  }

  get outstanding(): number {
    return this.reserved;
  }

  reserve(): GateSlot | null {
    if (this.reserved >= this.maxConcurrent + this.maxQueued) return null;
    this.reserved++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.reserved--;
    };
    return {
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        if (done) throw new Error("gate slot already released");
        if (this.running >= this.maxConcurrent) {
          await new Promise<void>((resolve) => this.waiters.push(resolve));
        } else {
          this.running++;
        }
        try {
          return await fn();
        } finally {
          const next = this.waiters.shift();
          if (next)
            next(); // hand the worker straight to the next waiter
          else this.running--;
          finish();
        }
      },
      release: finish,
    };
  }
}
