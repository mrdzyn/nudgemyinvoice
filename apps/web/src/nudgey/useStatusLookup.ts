import { useEffect, useRef, useSyncExternalStore } from "react";
import { StatusLookup, type StatusDeps, type StatusState } from "./statusLookup.js";

const NONE: StatusState = {
  phase: "idle",
  term: "",
  items: [],
  more: false,
  failure: null,
  invalidTerm: false,
  selectedId: null,
};

/** Thin React binding over the pure `StatusLookup`; its state disappears with the workspace. */
export function useStatusLookup(deps: StatusDeps) {
  const ref = useRef<StatusLookup | null>(null);
  if (!ref.current) ref.current = new StatusLookup(deps);
  const lookup = ref.current;
  lookup.setDeps(deps);
  useEffect(() => {
    lookup.attach();
    return () => lookup.dispose();
  }, [lookup]);
  const state = useSyncExternalStore(lookup.subscribe, lookup.getSnapshot, () => NONE);
  return { state, lookup };
}
