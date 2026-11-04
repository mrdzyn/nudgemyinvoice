import { Component, lazy, Suspense, type ReactNode } from "react";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { StudioRange } from "./studioModel.js";

/**
 * Opt-in, development-only "Activity analytics" (AG Studio) slot for the real dashboard.
 *
 * `import.meta.env.DEV` is a build-time constant, so a production build contains neither this feature's panel,
 * the licensed packages, the licence fetch nor any key (the build additionally fails if a Studio package is ever
 * resolved, see vite.studio-dev.ts). Default OFF: without VITE_NMI_STUDIO_LOCAL=1 this renders nothing and the
 * dashboard is exactly the Community one. If the lazy chunk or the panel fails, the slot disappears and the
 * cards and the AG Grid Community table are untouched.
 */
const StudioPanel =
  import.meta.env.DEV && import.meta.env["VITE_NMI_STUDIO_LOCAL"] === "1"
    ? lazy(() => import("./StudioPanel.js"))
    : null;

export const studioLocalEnabled = StudioPanel !== null;

class SlotBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function StudioSlot({ summary, range }: { summary: AnalyticsSummary; range: StudioRange }) {
  if (!StudioPanel) return null;
  return (
    <SlotBoundary>
      <Suspense fallback={null}>
        <StudioPanel summary={summary} range={range} />
      </Suspense>
    </SlotBoundary>
  );
}
