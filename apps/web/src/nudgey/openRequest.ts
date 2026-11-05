/**
 * In-memory request to open Nudgey's chat with an editable prefilled prompt (NMI-P6 "Draft a nudge" buttons).
 * It never submits anything: the operator still types or speaks the customer, presses Ask, picks the exact
 * invoice and confirms before any (costed) draft is made. No storage, no URL, no network.
 */
type Listener = (prefill: string) => void;
const listeners = new Set<Listener>();

export const DRAFT_NUDGE_PREFILL = "draft a professional nudge for ";

export function onNudgeyOpenRequest(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Returns false when no Nudgey is mounted to receive it. */
export function requestNudgeyChat(prefill: string = DRAFT_NUDGE_PREFILL): boolean {
  for (const l of listeners) l(prefill);
  return listeners.size > 0;
}
