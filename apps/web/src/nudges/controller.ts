import type {
  GenerateOutcome,
  NudgeApi,
  NudgeCounts,
  NudgeListOutcome,
  NudgeTone,
  NudgeView,
  PendingRef,
  TransitionOutcome,
} from "./api.js";

export interface NudgeSnapshot {
  /** Real server counts; null until the first successful read. */
  counts: NudgeCounts | null;
  aiAvailable: boolean;
  status: "loading" | "ok" | "error";
  /** Bumped after every successful change, so open views re-read the server. */
  version: number;
}

const INITIAL: NudgeSnapshot = { counts: null, aiAvailable: false, status: "loading", version: 0 };

/**
 * One per signed-in workspace. Owns the real nudge counts (nav badge, dashboard card, queue) and binds the CSRF
 * token in memory. A 401 from any call ends the whole session. Nothing here sends, schedules or polls: the
 * counts are re-read only when a view opens or after the operator's own change.
 */
export class NudgesController {
  private snap: NudgeSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private inflight: { p: Promise<void>; ac: AbortController } | null = null;
  private stopped = false;

  constructor(
    private readonly api: NudgeApi,
    private readonly csrfToken: string,
    private readonly expire: () => void,
    private readonly timeZone: () => string,
  ) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): NudgeSnapshot => this.snap;

  private set(patch: Partial<NudgeSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  stop(): void {
    this.stopped = true;
    this.inflight?.ac.abort();
    this.inflight = null;
  }
  start(): void {
    this.stopped = false;
  }

  /** Re-read the real counts (coalesced). */
  refresh(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.inflight) return this.inflight.p;
    const ac = new AbortController();
    const p = this.api.summary(ac.signal).then((r) => {
      if (this.inflight?.ac === ac) this.inflight = null;
      if (ac.signal.aborted || r.kind === "aborted" || this.stopped) return;
      if (r.kind === "unauthorized") {
        this.expire();
        return;
      }
      if (r.kind === "ok") this.set({ counts: r.counts, aiAvailable: r.aiAvailable, status: "ok" });
      else this.set({ status: "error" });
    });
    this.inflight = { p, ac };
    return p;
  }

  /** After any successful change: new version (views reload) and fresh counts. */
  private changed(): void {
    this.inflight?.ac.abort();
    this.inflight = null;
    this.set({ version: this.snap.version + 1 });
    void this.refresh();
  }

  private guard<T extends { kind: string }>(r: T): T {
    if (r.kind === "unauthorized") this.expire();
    return r;
  }

  async list(
    view: NudgeView,
    invoiceId: string | null,
    signal: AbortSignal,
  ): Promise<NudgeListOutcome> {
    return this.guard(await this.api.list(view, invoiceId, signal));
  }

  /** ONE costed AI call. Only ever invoked from an explicit operator click. */
  async generate(
    invoiceId: string,
    tone: NudgeTone,
    replace: PendingRef | null,
    signal: AbortSignal,
  ): Promise<GenerateOutcome> {
    const r = this.guard(
      await this.api.generate(
        invoiceId,
        { tone, timeZone: this.timeZone(), replace },
        this.csrfToken,
        signal,
      ),
    );
    if (r.kind === "ok") this.changed();
    else if (r.kind === "ai-unavailable") void this.refresh();
    return r;
  }

  async edit(
    id: string,
    version: number,
    message: string,
    signal: AbortSignal,
  ): Promise<TransitionOutcome> {
    const r = this.guard(await this.api.edit(id, version, message, this.csrfToken, signal));
    if (r.kind === "ok") this.changed();
    return r;
  }

  async approve(id: string, version: number, signal: AbortSignal): Promise<TransitionOutcome> {
    const r = this.guard(await this.api.approve(id, version, this.csrfToken, signal));
    if (r.kind === "ok") this.changed();
    return r;
  }

  async reject(id: string, version: number, signal: AbortSignal): Promise<TransitionOutcome> {
    const r = this.guard(await this.api.reject(id, version, this.csrfToken, signal));
    if (r.kind === "ok") this.changed();
    return r;
  }
}
