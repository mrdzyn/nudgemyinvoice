import type {
  FollowUpApi,
  ListOutcome,
  FollowUpInputBody,
  FollowUpView,
  ForInvoiceOutcome,
  MutationOutcome,
} from "./api.js";

export interface FollowUpsSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  /** Why the last read failed; the previous items stay visible. */
  error: "offline" | "unavailable" | "malformed" | null;
  items: FollowUpView[];
  /** Counts as computed BY THE SERVER from the database at the last read. */
  counts: { due: number; upcoming: number };
  serverNow: string | null;
  /** Incremented after every successful change so other views (the invoice page) re-read. */
  version: number;
}

const INITIAL: FollowUpsSnapshot = {
  status: "idle",
  error: null,
  items: [],
  counts: { due: 0, upcoming: 0 },
  serverNow: null,
  version: 0,
};

/**
 * Client state for follow-ups: one source of truth for Nudgey and the invoice page. Every number it
 * exposes comes from a server read; it never invents a count or a due state locally. A 401 ends the
 * session through `onExpired`. Pure TypeScript (no React) so it can be tested without a DOM.
 */
export class FollowUpsController {
  private snap: FollowUpsSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private reads: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly api: FollowUpApi,
    private readonly csrfToken: string,
    private readonly onExpired: () => void,
    private readonly pollMs = 60_000,
  ) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): FollowUpsSnapshot => this.snap;

  private set(next: Partial<FollowUpsSnapshot>) {
    this.snap = { ...this.snap, ...next };
    for (const l of this.listeners) l();
  }

  /** Load once and keep the due/upcoming split fresh while the workspace is open. */
  start(): void {
    this.stopped = false;
    void this.refresh();
    if (this.pollMs > 0 && !this.timer)
      this.timer = setInterval(() => void this.refresh(), this.pollMs);
  }

  stop(): void {
    this.stopped = true;
    this.reads?.abort();
    this.reads = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async refresh(): Promise<void> {
    this.reads?.abort();
    const ac = new AbortController();
    this.reads = ac;
    if (this.snap.status === "idle") this.set({ status: "loading" });
    const r = await this.api.list(ac.signal);
    if (ac.signal.aborted || this.stopped || r.kind === "aborted") return;
    if (this.reads === ac) this.reads = null;
    if (r.kind === "ok") {
      this.set({
        status: "ready",
        error: null,
        items: r.items,
        counts: r.counts,
        serverNow: r.now,
      });
    } else if (r.kind === "unauthorized") {
      this.onExpired();
    } else {
      this.set({ status: this.snap.items.length ? "ready" : "error", error: r.kind });
    }
  }

  /**
   * A fresh server read for a caller that needs the answer itself (the Nudgey lookup): it is bound to
   * the CALLER's signal, updates the shared snapshot when it succeeds, and a 401 ends the session.
   */
  async readFresh(signal: AbortSignal): Promise<ListOutcome> {
    const r = await this.api.list(signal);
    if (signal.aborted || this.stopped) return { kind: "aborted" };
    if (r.kind === "ok") {
      this.set({
        status: "ready",
        error: null,
        items: r.items,
        counts: r.counts,
        serverNow: r.now,
      });
    } else if (r.kind === "unauthorized") {
      this.onExpired();
    }
    return r;
  }

  forInvoice(invoiceId: string, signal: AbortSignal): Promise<ForInvoiceOutcome> {
    return this.api.forInvoice(invoiceId, signal).then((r) => {
      if (r.kind === "unauthorized") this.onExpired();
      return r;
    });
  }

  create(
    invoiceId: string,
    input: FollowUpInputBody,
    signal: AbortSignal,
  ): Promise<MutationOutcome> {
    return this.after(this.api.create(invoiceId, input, this.csrfToken, signal));
  }
  reschedule(id: string, input: FollowUpInputBody, signal: AbortSignal): Promise<MutationOutcome> {
    return this.after(this.api.reschedule(id, input, this.csrfToken, signal));
  }
  complete(id: string, signal: AbortSignal): Promise<MutationOutcome> {
    return this.after(this.api.complete(id, this.csrfToken, signal));
  }
  cancel(id: string, signal: AbortSignal): Promise<MutationOutcome> {
    return this.after(this.api.cancel(id, this.csrfToken, signal));
  }

  private async after(p: Promise<MutationOutcome>): Promise<MutationOutcome> {
    const r = await p;
    if (r.kind === "unauthorized") this.onExpired();
    else if (
      r.kind === "ok" ||
      r.kind === "duplicate" ||
      r.kind === "not-active" ||
      r.kind === "not-found"
    ) {
      // Re-read the truth from the server (also after a refusal that means our view was stale).
      if (r.kind === "ok") this.set({ version: this.snap.version + 1 });
      await this.refresh();
    }
    return r;
  }
}
