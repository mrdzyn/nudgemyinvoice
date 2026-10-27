import type { PayPalViewState } from "../domain/types.js";

type Kind = "ok" | "warn" | "err" | "neutral" | "info";

export function Badge({ kind, glyph, children }: { kind: Kind; glyph?: string; children: string }) {
  return (
    <span className={`badge badge-${kind}`}>
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      {children}
    </span>
  );
}

/** Status never relies on colour alone: every state has a glyph and text. */
export function PayPalStatusBadge({ state }: { state: PayPalViewState }) {
  switch (state) {
    case "created":
      return (
        <Badge kind="ok" glyph="✓">
          PayPal draft created
        </Badge>
      );
    case "pending":
    case "creating":
      return (
        <Badge kind="warn" glyph="◔">
          Creation in progress
        </Badge>
      );
    case "reconciling":
      return (
        <Badge kind="warn" glyph="◔">
          Reconciling
        </Badge>
      );
    case "unknown":
      return (
        <Badge kind="warn" glyph="?">
          Outcome unknown
        </Badge>
      );
    case "rejected":
      return (
        <Badge kind="err" glyph="✕">
          PayPal rejected
        </Badge>
      );
    case "mismatch":
      return (
        <Badge kind="err" glyph="!">
          Needs operator review
        </Badge>
      );
    case "refused":
      return (
        <Badge kind="neutral" glyph="–">
          Not eligible
        </Badge>
      );
    case "none":
      return (
        <Badge kind="neutral" glyph="○">
          No PayPal draft
        </Badge>
      );
  }
}
