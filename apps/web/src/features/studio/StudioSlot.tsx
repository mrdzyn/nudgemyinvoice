import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Notice } from "../../components/Notice.js";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { StudioRange } from "./studioModel.js";

/**
 * Opt-in, development-only "Activity analytics" (AG Studio) slot for the real dashboard.
 *
 * `import.meta.env.DEV` is a build-time constant, so a production build contains neither this feature's panel,
 * the licensed packages, the licence fetch nor any key (the build additionally fails if a Studio package is ever
 * resolved, see vite.studio-dev.ts). Default OFF: without VITE_NMI_STUDIO_LOCAL=1 this renders nothing and the
 * dashboard is exactly the Community one. If the lazy chunk or the panel fails, the slot shows a short
 * "Charts unavailable" notice and the cards and the AG Grid Community table are untouched.
 */
const StudioPanel =
  import.meta.env.DEV && import.meta.env["VITE_NMI_STUDIO_LOCAL"] === "1"
    ? lazy(() => import("./StudioPanel.js"))
    : null;

export const studioLocalEnabled = StudioPanel !== null;

/**
 * Dependency-free fallback for when the outer StudioPanel chunk itself cannot load or render. It makes no claim
 * that Studio is active (no badge) and offers no Retry: React.lazy caches a rejected import, so a button could
 * not honestly promise recovery. The authoritative currency cards above and the AG Grid Community table below
 * carry every figure; a page reload is the only recovery.
 */
export function StudioUnavailable() {
  return (
    <section
      className="card studio"
      id="studio-panel"
      aria-labelledby="studio-unavailable-title"
      data-studio="fallback"
      data-open="1"
    >
      <div className="studio-head">
        <div className="studio-title">
          <h2 className="card-title" id="studio-unavailable-title">
            Activity analytics
          </h2>
        </div>
      </div>
      <Notice kind="info" role="status" id="studio-unavailable">
        <strong>Charts unavailable.</strong> The totals above and the invoice table below are not
        affected. Reload the page to try loading charts again.
      </Notice>
    </section>
  );
}

class SlotBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <StudioUnavailable /> : this.props.children;
  }
}

type PanelComponent = ComponentType<{ summary: AnalyticsSummary; range: StudioRange }>;

/** Exported so the outer-chunk failure can be fault-injected; the app only uses StudioSlot. */
export function StudioSlotWith({
  Panel,
  summary,
  range,
}: {
  Panel: PanelComponent;
  summary: AnalyticsSummary;
  range: StudioRange;
}) {
  return (
    <SlotBoundary>
      <Suspense fallback={null}>
        <Panel summary={summary} range={range} />
      </Suspense>
    </SlotBoundary>
  );
}

export function StudioSlot({ summary, range }: { summary: AnalyticsSummary; range: StudioRange }) {
  if (!StudioPanel) return null;
  return <StudioSlotWith Panel={StudioPanel} summary={summary} range={range} />;
}
