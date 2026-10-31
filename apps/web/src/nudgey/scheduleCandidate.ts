/** One bounded, owner-scoped invoice read and explicit candidate selection for C2. */
import type { ListItem } from "../domain/serverList.js";
import type { ListQuery, ListResult } from "../invoices/api.js";
import { resolveWallTime, type ScheduleProposal } from "./scheduleIntent.js";

export const SCHEDULE_CANDIDATE_PAGE = 20;

export type CandidateFailure = "offline" | "unavailable" | "malformed" | "forbidden" | "rejected";

export type ScheduleCandidateState =
  | { kind: "idle" }
  | { kind: "loading"; proposal: ScheduleProposal }
  | { kind: "ready"; proposal: ScheduleProposal; items: ListItem[]; selectedId: string | null }
  | { kind: "empty"; proposal: ScheduleProposal }
  | { kind: "truncated"; proposal: ScheduleProposal }
  | { kind: "error"; proposal: ScheduleProposal; failure: CandidateFailure }
  | { kind: "reconfirm"; message: string };

export interface SelectedScheduleCandidate {
  proposal: ScheduleProposal;
  invoice: ListItem;
  generation: number;
}

export interface ScheduleCandidateDeps {
  listInvoices: ((query: ListQuery, signal: AbortSignal) => Promise<ListResult>) | undefined;
  expired: (() => void) | undefined;
  now: () => Date;
  timeZone: () => string | null;
}

const IDLE: ScheduleCandidateState = { kind: "idle" };

export class ScheduleCandidateController {
  private state: ScheduleCandidateState = IDLE;
  private readonly listeners = new Set<() => void>();
  private work: AbortController | null = null;
  private disposed = false;
  /** Reset/disposal suppresses late results; replacement searches alone do not suppress a 401. */
  private lifecycle = 0;
  private generation = 0;
  private lastProposal: ScheduleProposal | null = null;
  private consumed = false;

  constructor(private deps: ScheduleCandidateDeps) {}

  setDeps(deps: ScheduleCandidateDeps): void {
    this.deps = deps;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ScheduleCandidateState => this.state;

  private set(state: ScheduleCandidateState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  attach(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.lifecycle++;
    this.generation++;
    this.work?.abort();
    this.work = null;
    this.lastProposal = null;
    this.consumed = false;
  }

  /** Close, Back, sign-out, or another explicit discard invalidates even a late 401. */
  reset(): void {
    this.lifecycle++;
    this.generation++;
    this.work?.abort();
    this.work = null;
    this.lastProposal = null;
    this.consumed = false;
    if (this.state !== IDLE) this.set(IDLE);
  }

  /** A replacement attempt aborts the request but leaves its lifecycle's late 401 authoritative. */
  abortSuperseded(): void {
    this.generation++;
    this.work?.abort();
    this.work = null;
  }

  /** A newly typed prompt hides old candidate actions while preserving a late active-session 401. */
  supersedeCandidate(): void {
    this.generation++;
    this.work?.abort();
    this.work = null;
    this.lastProposal = null;
    this.consumed = false;
    if (this.state !== IDLE) this.set(IDLE);
  }

  retry(): Promise<void> {
    return this.lastProposal ? this.search(this.lastProposal) : Promise.resolve();
  }

  async search(proposal: ScheduleProposal): Promise<void> {
    if (this.disposed) return;
    this.abortSuperseded();
    const ac = new AbortController();
    this.work = ac;
    const generation = ++this.generation;
    const lifecycle = this.lifecycle;
    this.lastProposal = proposal;
    this.consumed = false;
    this.set({ kind: "loading", proposal });
    const { listInvoices, expired } = this.deps;
    const result: ListResult = listInvoices
      ? await listInvoices(
          {
            limit: SCHEDULE_CANDIDATE_PAGE,
            cursor: null,
            currency: null,
            status: null,
            q: proposal.term,
          },
          ac.signal,
        )
      : { kind: "unavailable" };

    if (result.kind === "unauthorized") {
      if (this.disposed || lifecycle !== this.lifecycle) return;
      if (this.work === ac) this.work = null;
      this.reset();
      expired?.();
      return;
    }
    if (
      ac.signal.aborted ||
      result.kind === "aborted" ||
      this.disposed ||
      lifecycle !== this.lifecycle ||
      generation !== this.generation ||
      this.work !== ac
    )
      return;
    this.work = null;
    if (result.kind !== "ok") {
      this.set({ kind: "error", proposal, failure: result.kind });
      return;
    }
    if (result.page.nextCursor !== null) {
      this.set({ kind: "truncated", proposal });
      return;
    }
    if (result.page.items.length === 0) {
      this.set({ kind: "empty", proposal });
      return;
    }
    this.set({ kind: "ready", proposal, items: result.page.items, selectedId: null });
  }

  select(id: string | null): void {
    if (this.state.kind !== "ready" || this.consumed) return;
    if (id !== null && !this.state.items.some((item) => item.id === id)) return;
    this.set({ ...this.state, selectedId: id });
  }

  /** Return one single-use selected server record, or require a fresh proposal if time/zone changed. */
  confirm(): SelectedScheduleCandidate | null {
    if (this.state.kind !== "ready" || !this.state.selectedId || this.consumed) return null;
    const { proposal, items, selectedId } = this.state;
    const invoice = items.find((item) => item.id === selectedId);
    const now = this.deps.now();
    const zone = this.deps.timeZone();
    if (!invoice) return null;
    if (zone !== proposal.timeZone) {
      this.consumed = true;
      this.set({
        kind: "reconfirm",
        message:
          "Your browser time zone changed. Ask again to create a proposal in the current zone.",
      });
      return null;
    }
    const resolved = resolveWallTime(proposal.date, proposal.time, proposal.timeZone);
    if (
      resolved.kind !== "ok" ||
      resolved.dueAt !== proposal.dueAt ||
      Date.parse(proposal.dueAt) <= now.getTime()
    ) {
      this.consumed = true;
      this.set({
        kind: "reconfirm",
        message: "This time proposal is no longer current. Ask again or use the manual scheduler.",
      });
      return null;
    }
    this.consumed = true;
    return { proposal, invoice, generation: this.generation };
  }
}
