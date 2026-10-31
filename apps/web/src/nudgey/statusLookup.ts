/**
 * Read-only state behind Nudgey's "Check invoice status" selector. It asks the EXISTING authenticated,
 * operator-scoped invoice search (`session.listInvoices`, the search text only in the POST body) for ONE
 * bounded page and shows what the server says about each saved invoice's PayPal Sandbox DRAFT.
 * It never calls PayPal, never writes, and never turns "a draft exists" into paid / unpaid / overdue.
 * Pure TypeScript (no React): it is in memory only, and every new search aborts the previous one.
 */
import type { Action } from "../demo/appState.js";
import type { ListItem } from "../domain/serverList.js";
import type { ListQuery, ListResult } from "../invoices/api.js";

export const STATUS_PAGE = 20;
export const STATUS_MAX_TERM = 100;

export type StatusFailure = "offline" | "unavailable" | "malformed" | "forbidden" | "rejected";

export interface StatusState {
  phase: "idle" | "loading" | "ready" | "error";
  /** The normalised term the CURRENT items answer (empty = all invoices). */
  term: string;
  items: ListItem[];
  /** The server reported another page: the shown records are NOT all of the matches. */
  more: boolean;
  failure: StatusFailure | null;
  /** The typed text could not be sent (control characters or too long); nothing was requested. */
  invalidTerm: boolean;
  selectedId: string | null;
}

const IDLE: StatusState = {
  phase: "idle",
  term: "",
  items: [],
  more: false,
  failure: null,
  invalidTerm: false,
  selectedId: null,
};

const hasControl = (s: string) =>
  Array.from(s).some((c) => {
    const n = c.charCodeAt(0);
    return n < 0x20 || n === 0x7f;
  });

/** The existing real-mode navigation to the saved invoice (the unsaved-form guard wraps `dispatch`). */
export const statusOpenAction = (id: string): Action => ({
  type: "open-saved",
  id,
  notice: "opened",
});

export interface StatusDeps {
  listInvoices: ((query: ListQuery, signal: AbortSignal) => Promise<ListResult>) | undefined;
  /** A 401 ends the whole session. */
  expired: (() => void) | undefined;
}

export class StatusLookup {
  private st: StatusState = IDLE;
  private readonly listeners = new Set<() => void>();
  private work: AbortController | null = null;
  private disposed = false;
  private lastRaw = "";

  constructor(private deps: StatusDeps) {}

  setDeps(deps: StatusDeps): void {
    this.deps = deps;
  }
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): StatusState => this.st;

  private set(next: Partial<StatusState>) {
    this.st = { ...this.st, ...next };
    for (const l of this.listeners) l();
  }

  attach(): void {
    this.disposed = false;
  }
  dispose(): void {
    this.disposed = true;
    this.work?.abort();
    this.work = null;
  }

  /** Forget everything (panel closed, Back, sign-out) and end any request in flight. */
  reset(): void {
    this.work?.abort();
    this.work = null;
    this.lastRaw = "";
    if (this.st !== IDLE) {
      this.st = IDLE;
      for (const l of this.listeners) l();
    }
  }

  select(id: string | null): void {
    if (id === null || this.st.items.some((i) => i.id === id)) this.set({ selectedId: id });
  }

  retry(): Promise<void> {
    return this.search(this.lastRaw);
  }

  /** One bounded page for `raw` (empty = every invoice). Ends the previous request on EVERY call. */
  async search(raw: string): Promise<void> {
    this.work?.abort();
    this.work = null;
    this.lastRaw = raw;
    if (hasControl(raw) || raw.trim().length > STATUS_MAX_TERM) {
      // Nothing is sent: a bad term never reaches the server and never shows stale matches.
      this.set({
        phase: "ready",
        items: [],
        more: false,
        failure: null,
        invalidTerm: true,
        selectedId: null,
      });
      return;
    }
    const term = raw.replace(/\s+/g, " ").trim();
    const ac = new AbortController();
    this.work = ac;
    this.set({ phase: "loading", term, failure: null, invalidTerm: false });
    const { listInvoices, expired } = this.deps;
    const r: ListResult = listInvoices
      ? await listInvoices(
          { limit: STATUS_PAGE, cursor: null, currency: null, status: null, q: term || null },
          ac.signal,
        )
      : { kind: "unavailable" };
    if (ac.signal.aborted || r.kind === "aborted" || this.disposed) return; // stale: never shown
    this.work = null;
    if (r.kind === "unauthorized") {
      this.reset();
      expired?.();
      return;
    }
    if (r.kind !== "ok") {
      this.set({ phase: "error", items: [], more: false, failure: r.kind, selectedId: null });
      return;
    }
    const keep = this.st.selectedId && r.page.items.some((i) => i.id === this.st.selectedId);
    this.set({
      phase: "ready",
      items: r.page.items,
      more: r.page.nextCursor !== null,
      failure: null,
      selectedId: keep ? this.st.selectedId : null,
    });
  }
}
