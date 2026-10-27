import type { InvoiceDraft } from "../domain/types.js";
import type { SaveResult } from "./api.js";

export const SAVE_TIMEOUT_MS = 20_000;

type SaveFn = (draft: InvoiceDraft, key: string, signal: AbortSignal) => Promise<SaveResult>;

/**
 * At most one save request at a time. The result is delivered only if it belongs to the request
 * that is still current: aborting (logout, session end, unmount) or a newer start makes any late
 * answer unreachable. A request that does not finish in time is aborted and reported as UNCERTAIN
 * (the server may still have committed it), never as a failure.
 */
export function createSaveRunner(
  save: SaveFn,
  onResult: (r: SaveResult) => void,
  timeoutMs = SAVE_TIMEOUT_MS,
) {
  let current: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    get pending() {
      return current !== null;
    },
    /** False (and no request) when a save is already in flight. */
    start(draft: InvoiceDraft, key: string): boolean {
      if (current) return false;
      const ac = new AbortController();
      current = ac;
      const deliver = (r: SaveResult) => {
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
      save(draft, key, ac.signal).then(
        (r) => {
          deliver(r);
        },
        () => deliver({ kind: "uncertain", cause: "network" }),
      );
      return true;
    },
    /** True when a request was actually cancelled. */
    abort(): boolean {
      const was = current !== null;
      clearTimeout(timer);
      current?.abort();
      current = null;
      return was;
    },
  };
}
