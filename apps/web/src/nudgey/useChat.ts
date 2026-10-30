import { useEffect, useRef, useSyncExternalStore } from "react";
import { ChatSession, type ChatDeps, type ChatMessage } from "./chatSession.js";

export type { ChatMessage } from "./chatSession.js";

const NONE: ChatMessage[] = [];

/** Thin React binding over the pure `ChatSession`. State disappears with the workspace. */
export function useNudgeyChat(deps: ChatDeps) {
  const session = useRef<ChatSession | null>(null);
  if (!session.current) session.current = new ChatSession(deps);
  const s = session.current;
  s.setDeps(deps);
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
