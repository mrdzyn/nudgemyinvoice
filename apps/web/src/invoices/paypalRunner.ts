import type { PayPalDraftResult } from "./api.js";

export const PAYPAL_TIMEOUT_MS = 60_000;

type CreateFn = (signal: AbortSignal) => Promise<PayPalDraftResult>;

/**
 * At most one PayPal-draft request at a time for one confirmation. The answer is delivered only if
 * it still belongs to the current request: aborting (unmount, sign-out, 401, navigation) or a newer
 * start makes a late answer unreachable. A request that does not finish in time is aborted and
 * reported as UNCERTAIN: aborting the browser request does NOT prove the server stopped, so it is
 * never a failure and is never retried automatically.
 */
export function createPayPalRunner(
  create: CreateFn,
  onResult: (r: PayPalDraftResult) => void,
  timeoutMs = PAYPAL_TIMEOUT_MS,
) {
  let current: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    get pending() {
      return current !== null;
    },
    /** False (and no request) when one is already in flight. */
    start(): boolean {
      if (current) return false;
      const ac = new AbortController();
      current = ac;
      const deliver = (r: PayPalDraftResult) => {
        if (current !== ac) return;
        clearTimeout(timer);
        current = null;
        onResult(r);
      };
      timer = setTimeout(() => {
        if (current !== ac) return;
        ac.abort();
        deliver({ kind: "uncertain", cause: "timeout" });
      }, timeoutMs);
      create(ac.signal).then(deliver, () => deliver({ kind: "uncertain", cause: "network" }));
      return true;
    },
    abort(): boolean {
      const was = current !== null;
      clearTimeout(timer);
      current?.abort();
      current = null;
      return was;
    },
  };
}
