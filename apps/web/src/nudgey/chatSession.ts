import type { FollowUpsController } from "../followups/controller.js";
import type { ListQuery, ListResult } from "../invoices/api.js";
import { MAX_PROMPT_CHARS, parseIntent } from "./intent.js";
import { runLookup, summarizeForAnnouncement, type LookupResult } from "./lookup.js";

export interface ChatMessage {
  id: number;
  role: "user" | "nudgey";
  /** What the operator typed (user) or a short sentence (nudgey). Plain text, rendered escaped. */
  text?: string;
  result?: LookupResult;
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

  constructor(private deps: ChatDeps) {}

  /** The latest dependencies (they change identity as the session rotates); no state is lost. */
  setDeps(deps: ChatDeps): void {
    this.deps = deps;
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
    if (this.msgs.length) this.set([]);
  }

  /** React may mount, clean up and mount again (StrictMode): attaching undoes a previous dispose. */
  attach(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.work?.abort();
    this.work = null;
  }

  async ask(raw: string): Promise<void> {
    // EVERY new attempt (even one that is rejected below) ends the lookup still in flight, so its late
    // answer can never render, announce or end the session on behalf of a question that was replaced.
    this.work?.abort();
    this.work = null;
    const parsed = parseIntent(raw);
    if (!parsed.ok) {
      const add: ChatMessage[] = [];
      if (parsed.reason !== "empty")
        add.push({ id: this.nextId++, role: "user", text: raw.slice(0, MAX_PROMPT_CHARS) });
      add.push({ id: this.nextId++, role: "nudgey", text: REJECTION_TEXT[parsed.reason] });
      this.set([...this.dropPending(), ...add]);
      return;
    }
    const ac = new AbortController();
    this.work = ac;
    const userId = this.nextId++;
    const replyId = this.nextId++;
    this.set([
      ...this.dropPending(),
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

  /** An unanswered question and its pending reply are removed together. */
  private dropPending(): ChatMessage[] {
    const i = this.msgs.findIndex((m) => m.pending);
    return i < 0 ? this.msgs : this.msgs.slice(0, Math.max(0, i - 1));
  }
}
