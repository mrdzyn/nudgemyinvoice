import type { FollowUpsController } from "../followups/controller.js";
import type { ListQuery, ListResult } from "../invoices/api.js";
import { MAX_PROMPT_CHARS, parseIntent } from "./intent.js";
import { runLookup, summarizeForAnnouncement, type LookupResult } from "./lookup.js";
import { browserTimeZoneOrNull, parseScheduleIntent } from "./scheduleIntent.js";
import {
  ScheduleCandidateController,
  type ScheduleCandidateState,
  type SelectedScheduleCandidate,
} from "./scheduleCandidate.js";

export interface ChatMessage {
  id: number;
  role: "user" | "nudgey";
  /** What the operator typed (user) or a short sentence (nudgey). Plain text, rendered escaped. */
  text?: string;
  result?: LookupResult;
  /** An ephemeral C2 candidate lookup. Never persisted and removed when a new question begins. */
  schedule?: ScheduleCandidateState;
  /** A lookup is running for this question. */
  pending?: boolean;
}

export const MAX_MESSAGES = 20;
export const EMPTY_PROMPT_TEXT =
  "Type a question first, for example “What are my pending invoices?”.";

const REJECTION_TEXT = {
  empty: EMPTY_PROMPT_TEXT,
  "too-long": `Please keep questions under ${MAX_PROMPT_CHARS} characters.`,
  "control-characters": "That text contains characters I can't read. Please retype the question.",
} as const;

export interface ChatDeps {
  listInvoices: ((query: ListQuery, signal: AbortSignal) => Promise<ListResult>) | undefined;
  followUps: Pick<FollowUpsController, "readFresh"> | undefined;
  /** A 401 anywhere ends the session (the workspace, and this conversation with it, goes away). */
  expired: (() => void) | undefined;
  announce: (message: string) => void;
  scheduleCandidates?: ScheduleCandidateController;
  now?: () => Date;
  timeZone?: () => string | null;
}

/**
 * Conversation state for Nudgey. It lives ONLY in memory in the active workspace: nothing is written
 * to browser storage or sent anywhere as a transcript. Each question aborts the previous one; the
 * answer to an aborted question is dropped and never rendered. Pure TypeScript (no React).
 */
export class ChatSession {
  private msgs: ChatMessage[] = [];
  private readonly listeners = new Set<() => void>();
  private work: AbortController | null = null;
  private nextId = 1;
  private disposed = false;
  private scheduleReplyId: number | null = null;

  constructor(private deps: ChatDeps) {}

  /** The latest dependencies (they change identity as the session rotates); no state is lost. */
  setDeps(deps: ChatDeps): void {
    this.deps = deps;
    deps.scheduleCandidates?.setDeps({
      listInvoices: deps.listInvoices,
      expired: deps.expired,
      now: deps.now ?? (() => new Date()),
      timeZone: deps.timeZone ?? browserTimeZoneOrNull,
    });
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): ChatMessage[] => this.msgs;
  get busy(): boolean {
    return this.msgs.some((m) => m.pending);
  }

  private set(next: ChatMessage[]) {
    this.msgs = next.slice(-MAX_MESSAGES);
    for (const l of this.listeners) l();
  }

  /** Forget the conversation and abort any lookup in flight (panel closed, Back, sign-out). */
  clear(): void {
    this.work?.abort();
    this.work = null;
    this.scheduleReplyId = null;
    this.deps.scheduleCandidates?.reset();
    if (this.msgs.length) this.set([]);
  }

  /** React may mount, clean up and mount again (StrictMode): attaching undoes a previous dispose. */
  attach(): void {
    this.disposed = false;
    this.deps.scheduleCandidates?.attach();
  }

  dispose(): void {
    this.disposed = true;
    this.work?.abort();
    this.work = null;
    this.scheduleReplyId = null;
    this.deps.scheduleCandidates?.dispose();
  }

  async ask(raw: string): Promise<void> {
    // EVERY new attempt (even one that is rejected below) ends the lookup still in flight, so its late
    // answer can never render, announce or end the session on behalf of a question that was replaced.
    this.work?.abort();
    this.work = null;
    this.deps.scheduleCandidates?.abortSuperseded();
    this.scheduleReplyId = null;
    const scheduleIntent = parseScheduleIntent(
      raw,
      (this.deps.now ?? (() => new Date()))(),
      (this.deps.timeZone ?? browserTimeZoneOrNull)(),
    );
    if (scheduleIntent.kind !== "not-scheduling") {
      const user: ChatMessage = {
        id: this.nextId++,
        role: "user",
        text: raw.slice(0, MAX_PROMPT_CHARS),
      };
      const replyId = this.nextId++;
      if (scheduleIntent.kind === "clarify" || scheduleIntent.kind === "unsupported") {
        this.deps.scheduleCandidates?.reset();
        this.set([
          ...this.dropReplaceableAttempt(),
          user,
          { id: replyId, role: "nudgey", text: scheduleIntent.message },
        ]);
        return;
      }
      const candidates = this.deps.scheduleCandidates;
      if (!candidates) {
        this.set([
          ...this.dropReplaceableAttempt(),
          user,
          {
            id: replyId,
            role: "nudgey",
            text: "I can't search your saved invoices right now. Use Schedule a follow-up to enter it manually.",
          },
        ]);
        return;
      }
      this.scheduleReplyId = replyId;
      const request = candidates.search(scheduleIntent.proposal);
      this.set([
        ...this.dropReplaceableAttempt(),
        user,
        { id: replyId, role: "nudgey", pending: true, schedule: candidates.getSnapshot() },
      ]);
      await request;
      if (this.disposed || this.scheduleReplyId !== replyId) return;
      this.set(
        this.msgs.map((m) => {
          if (m.id !== replyId) return m;
          const message = { ...m };
          delete message.pending;
          return { ...message, schedule: candidates.getSnapshot() };
        }),
      );
      this.deps.announce(
        "Invoice candidates loaded. Select the exact invoice before reviewing the proposal.",
      );
      return;
    }
    const parsed = parseIntent(raw);
    if (!parsed.ok) {
      const add: ChatMessage[] = [];
      if (parsed.reason !== "empty")
        add.push({ id: this.nextId++, role: "user", text: raw.slice(0, MAX_PROMPT_CHARS) });
      add.push({ id: this.nextId++, role: "nudgey", text: REJECTION_TEXT[parsed.reason] });
      this.set([...this.dropReplaceableAttempt(), ...add]);
      return;
    }
    const ac = new AbortController();
    this.work = ac;
    const userId = this.nextId++;
    const replyId = this.nextId++;
    this.set([
      ...this.dropReplaceableAttempt(),
      { id: userId, role: "user", text: raw.trim() },
      { id: replyId, role: "nudgey", pending: true },
    ]);
    const { listInvoices, followUps, expired, announce } = this.deps;
    const result = await runLookup(
      parsed.intent,
      {
        listInvoices: (q, s) =>
          listInvoices ? listInvoices(q, s) : Promise.resolve({ kind: "unavailable" as const }),
        readFollowUps: (s) =>
          followUps ? followUps.readFresh(s) : Promise.resolve({ kind: "unavailable" as const }),
      },
      ac.signal,
    );
    if (ac.signal.aborted || result.kind === "aborted" || this.disposed) return; // stale: never rendered
    this.work = null;
    if (result.kind === "expired") {
      this.set([]);
      expired?.();
      return;
    }
    this.set(
      this.msgs.map((m) =>
        m.id === replyId ? { id: replyId, role: "nudgey" as const, result } : m,
      ),
    );
    announce(summarizeForAnnouncement(result));
  }

  private dropScheduleCandidate(): ChatMessage[] {
    const i = this.msgs.findIndex((m) => m.schedule);
    return i < 0 ? this.msgs : this.msgs.slice(0, Math.max(0, i - 1));
  }

  /** A replacement removes an unanswered exchange and/or any still-actionable C2 candidate. */
  private dropReplaceableAttempt(): ChatMessage[] {
    const pending = this.msgs.findIndex((m) => m.pending);
    const candidate = this.msgs.findIndex((m) => m.schedule);
    const indexes = [pending, candidate].filter((i) => i >= 0);
    const first = indexes.length ? Math.min(...indexes) : -1;
    return first < 0 ? this.msgs : this.msgs.slice(0, Math.max(0, first - 1));
  }

  selectScheduleCandidate(id: string | null): void {
    const candidates = this.deps.scheduleCandidates;
    if (!candidates) return;
    candidates.select(id);
    this.updateScheduleReply(candidates.getSnapshot());
  }

  retryScheduleCandidates(): Promise<void> {
    const candidates = this.deps.scheduleCandidates;
    if (!candidates) return Promise.resolve();
    const replyId = this.scheduleReplyId;
    const request = candidates.retry();
    this.updateScheduleReply(candidates.getSnapshot(), true);
    return request.then(() => {
      if (replyId !== null && this.scheduleReplyId === replyId && !this.disposed)
        this.updateScheduleReply(candidates.getSnapshot(), false);
    });
  }

  confirmScheduleCandidate(): SelectedScheduleCandidate | null {
    const candidates = this.deps.scheduleCandidates;
    if (!candidates) return null;
    const selected = candidates.confirm();
    this.updateScheduleReply(candidates.getSnapshot());
    return selected;
  }

  discardScheduleCandidate(): void {
    if (
      this.scheduleReplyId === null &&
      this.deps.scheduleCandidates?.getSnapshot().kind === "idle"
    )
      return;
    this.deps.scheduleCandidates?.reset();
    this.scheduleReplyId = null;
    this.set(this.dropScheduleCandidate());
  }

  /** A replacement draft removes stale actions but doesn't treat a late 401 as a disposed view. */
  replaceScheduleCandidate(): void {
    if (
      this.scheduleReplyId === null &&
      this.deps.scheduleCandidates?.getSnapshot().kind === "idle"
    )
      return;
    this.deps.scheduleCandidates?.supersedeCandidate();
    this.scheduleReplyId = null;
    this.set(this.dropScheduleCandidate());
  }

  private updateScheduleReply(schedule: ScheduleCandidateState, pending?: boolean): void {
    const id = this.scheduleReplyId;
    if (id === null) return;
    this.set(
      this.msgs.map((m) =>
        m.id === id ? { ...m, ...(pending === undefined ? {} : { pending }), schedule } : m,
      ),
    );
  }
}
