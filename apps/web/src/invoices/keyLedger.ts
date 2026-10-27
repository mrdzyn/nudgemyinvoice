import { newIdempotencyKey } from "./idempotency.js";

/**
 * Binds one Idempotency-Key to the exact request body it was first used with. The same body always
 * gets the same key (so an explicit retry after an uncertain outcome replays instead of duplicating);
 * a different body never inherits a key (the server would answer 409). Volatile memory only.
 */
export function createKeyLedger(mint: () => string = newIdempotencyKey) {
  let current: { key: string; body: string } | null = null;
  return {
    keyFor(body: string): string {
      if (current && current.body === body) return current.key;
      current = { key: mint(), body };
      return current.key;
    },
    /** True when `body` is exactly the body the active key was first used with. */
    matches(body: string): boolean {
      return current !== null && current.body === body;
    },
    /** Forget the key (explicit "use a new key", or explicitly abandoning an uncertain attempt). */
    reset() {
      current = null;
    },
    get active() {
      return current !== null;
    },
  };
}
