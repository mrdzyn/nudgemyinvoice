import { useCallback, useEffect, useRef } from "react";

/** setTimeout that is cancelled automatically on unmount (the simulated "server" delays). */
export function useScheduler() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const t of live) clearTimeout(t);
      live.clear();
    };
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
}

/** Move focus to a screen heading after in-app navigation (not on first page load). */
export function useFocusOnMount<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, []);
  return ref;
}
