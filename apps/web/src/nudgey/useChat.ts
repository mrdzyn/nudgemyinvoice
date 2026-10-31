import { useEffect, useRef, useSyncExternalStore } from "react";
import { ChatSession, type ChatDeps, type ChatMessage } from "./chatSession.js";
import { browserTimeZoneOrNull } from "./scheduleIntent.js";
import { ScheduleCandidateController } from "./scheduleCandidate.js";

export type { ChatMessage } from "./chatSession.js";

const NONE: ChatMessage[] = [];

/** Thin React binding over the pure `ChatSession`. State disappears with the workspace. */
export function useNudgeyChat(deps: ChatDeps) {
  const session = useRef<ChatSession | null>(null);
  const candidates = useRef<ScheduleCandidateController | null>(null);
  if (!candidates.current)
    candidates.current = new ScheduleCandidateController({
      listInvoices: deps.listInvoices,
      expired: deps.expired,
      now: () => new Date(),
      timeZone: browserTimeZoneOrNull,
    });
  const withCandidates: ChatDeps = {
    ...deps,
    scheduleCandidates: candidates.current,
    now: () => new Date(),
    timeZone: browserTimeZoneOrNull,
  };
  if (!session.current) session.current = new ChatSession(withCandidates);
  const s = session.current;
  s.setDeps(withCandidates);
  useEffect(() => {
    s.attach();
    return () => s.dispose();
  }, [s]);
  const messages = useSyncExternalStore(s.subscribe, s.getSnapshot, () => NONE);
  return {
    messages,
    ask: (t: string) => s.ask(t),
    clear: () => s.clear(),
    busy: messages.some((m) => m.pending),
    // Stable identity: used in effect dependency lists.
    session: s,
  };
}
