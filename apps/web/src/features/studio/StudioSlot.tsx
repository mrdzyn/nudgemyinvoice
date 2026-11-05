import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Notice } from "../../components/Notice.js";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { StudioRange } from "./studioModel.js";

/**
 * "Activity analytics" (AG Studio) slot for the real authenticated dashboard. Two ways in, both decided at build time:
 *
 * - **Licensed production variant (P5):** `NMI_WEB_STUDIO=licensed` at `vite build` defines
 *   `__NMI_STUDIO_LICENSED__ = true`. The panel and the licensed packages then ship as LAZY chunks loaded only
 *   after sign-in; the licence itself is never in the build and is fetched at runtime from the authenticated
 *   `/api/studio/licence` route (studioLicence.ts). The build guard and bundle scan verify this variant.
 * - **Local development (A5-I1):** the Vite dev server with `VITE_NMI_STUDIO_LOCAL=1`; licence via the
 *   loopback-only dev bridge.
 *
 * Any other build (the default, CI's ordinary build, tests) is the Community dashboard: this renders nothing and
 * the build fails if a Studio package is resolved. If the lazy chunk or the panel fails, the slot shows a short
 * "Charts unavailable" notice and the cards and the AG Grid Community table are untouched.
 */
export const studioLicensedBuild =
  typeof __NMI_STUDIO_LICENSED__ !== "undefined" && __NMI_STUDIO_LICENSED__ === true;
const studioDevLocal = import.meta.env.DEV && import.meta.env["VITE_NMI_STUDIO_LOCAL"] === "1";

const StudioPanel =
  studioLicensedBuild || studioDevLocal ? lazy(() => import("./StudioPanel.js")) : null;

export const studioEnabled = StudioPanel !== null;

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
        <strong>Charts unavailable.</strong> The currency totals and invoice table below are not
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
    <div className="studio-slot">
      <SlotBoundary>
        <Suspense fallback={null}>
          <Panel summary={summary} range={range} />
        </Suspense>
      </SlotBoundary>
    </div>
  );
}

export function StudioSlot({ summary, range }: { summary: AnalyticsSummary; range: StudioRange }) {
  if (!StudioPanel) return null;
  return <StudioSlotWith Panel={StudioPanel} summary={summary} range={range} />;
}

/**
 * Reserves the panel's space while the shared analytics answer reloads (every filter change clears it), so the
 * cards and invoice table do not jump up and back down under the analytics-first layout. Decorative only: it
 * shows no figures (never stale ones) and the dashboard's own loading status is the announced state.
 */
export function StudioSlotPlaceholder() {
  if (!studioEnabled) return null;
  return (
    <div className="studio-slot" aria-hidden="true" data-testid="studio-placeholder">
      <div className="card studio studio-placeholder">
        <div className="studio-head">
          <div className="studio-title">
            <span className="card-title">Activity analytics</span>
          </div>
        </div>
        <div className="skeleton studio-placeholder-body" />
      </div>
    </div>
  );
}
