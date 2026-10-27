import type { Action } from "../demo/appState.js";

/** State of the real save on the Review screen, as far as leaving that screen is concerned. */
export type SaveGuard = "none" | "pending" | "uncertain";

/**
 * Actions that take the operator OFF the Review screen by their own choice. `open-saved` is not one
 * of them: it is the confirmed outcome of the save itself.
 */
export function isLeavingAction(a: Action): boolean {
  return a.type === "navigate" || a.type === "discard-review";
}

/** Leaving is allowed straight away only when no save is unresolved. */
export function mustConfirmLeave(guard: SaveGuard, a: Action): boolean {
  return guard !== "none" && isLeavingAction(a);
}

/**
 * The idempotency key and request body live only in the Review form's memory. Leaving destroys them,
 * so an unresolved save (the server may already have committed it) needs an explicit decision.
 */
export const LEAVE_COPY: Record<
  Exclude<SaveGuard, "none">,
  { title: string; body: string; confirm: string; cancel: string }
> = {
  pending: {
    title: "A save is still in progress",
    body: "The server has not answered yet, and it may already have saved this invoice. If you leave now this page stops waiting and forgets the request, so creating the invoice again later may produce a duplicate.",
    confirm: "Leave and forget this save",
    cancel: "Stay and wait",
  },
  uncertain: {
    title: "This save is unconfirmed",
    body: "We could not confirm whether this invoice was saved, so it may already exist. If you leave, the retry key is discarded and saving it again later may create a second draft. Staying lets you retry the identical request safely.",
    confirm: "Leave and discard the retry key",
    cancel: "Stay and retry",
  },
};
