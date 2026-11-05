import {
  Component,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { studioTheme, type AgStudioErrorRaisedEvent, type AgStudioProperties } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import type { StudioCurrency } from "./studioModel.js";
import {
  buildStatusData,
  buildStatusState,
  buildTrendData,
  buildTrendState,
} from "./studioReport.js";

/**
 * The ONLY module that imports the licensed AG Studio packages. It is loaded lazily, by the dev-only slot, and
 * is never part of an ordinary production build. Everything Studio receives is built by studioReport.ts from the
 * sanitised aggregate model; both widgets run in `view` mode with no filter panel, cross-filtering or AI module.
 */

export interface StudioRootProps {
  licenseKey: string | null;
  onFailure: (reason: string) => void;
  children: ReactNode;
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** NMI design tokens resolved at render time so light, dark and any later token change flow into Studio. */
function readTokens() {
  return {
    surface: cssVar("--surface", "#ffffff"),
    text: cssVar("--text", "#0f172a"),
    muted: cssVar("--text-muted", "#55657a"),
    border: cssVar("--border", "#e2e8f0"),
    action: cssVar("--action-bg", "#2563eb"),
    none: cssVar("--border-input", "#64748b"),
    progress: cssVar("--info-text", "#1e40af"),
    created: cssVar("--ok-border", "#059669"),
    attention: cssVar("--warn-border", "#d97706"),
    font: cssVar("--font-sans", "Inter, system-ui, sans-serif"),
  };
}

function useTokens() {
  const [tokens, setTokens] = useState(readTokens);
  useEffect(() => {
    const refresh = () => setTokens(readTokens());
    const mo = new MutationObserver(refresh);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", refresh);
    };
  }, []);
  return tokens;
}

class Boundary extends Component<
  { onFailure: (r: string) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.onFailure(error instanceof Error ? error.message : "render failed");
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface Ctx {
  theme: ReturnType<typeof studioTheme.withParams>;
  trendTheme: ReturnType<typeof studioTheme.withParams>;
  onFailure: (reason: string) => void;
}
const StudioCtx = createContext<Ctx | null>(null);
const useStudioCtx = (): Ctx => {
  const c = useContext(StudioCtx);
  if (!c) throw new Error("Studio widgets must be rendered inside <StudioRoot>");
  return c;
};

/** Licence provider + failure boundary + NMI theme for every Studio widget beneath it. */
export function StudioRoot({ licenseKey, onFailure, children }: StudioRootProps) {
  const tokens = useTokens();
  const { theme, trendTheme } = useMemo(() => {
    const base = {
      backgroundColor: tokens.surface,
      textColor: tokens.text,
      fontFamily: tokens.font,
      accentColor: tokens.action,
      borderColor: tokens.border,
      // The widgets sit inside the NMI card: no Studio frame, minimum size or canvas chrome.
      studioMinWidth: 0,
      studioMinHeight: 0,
      studioCanvasMinWidth: 0,
      studioCanvasPadding: 0,
      studioCanvasBorder: false,
      studioCanvasBorderRadius: 0,
      studioCanvasShadow: "none",
      studioCanvasBackgroundColor: tokens.surface,
      studioWidgetBackgroundColor: tokens.surface,
      chartGridLineColor: tokens.border,
      chartAxisLineColor: tokens.none,
      chartTextColor: tokens.text,
      chartSubtleTextColor: tokens.muted,
    } as const;
    const palette = (c1: string) => ({
      chartPaletteFills1Color: c1,
      chartPaletteFills2Color: tokens.progress,
      chartPaletteFills3Color: tokens.created,
      chartPaletteFills4Color: tokens.attention,
      chartPaletteStrokes1Color: c1,
      chartPaletteStrokes2Color: tokens.progress,
      chartPaletteStrokes3Color: tokens.created,
      chartPaletteStrokes4Color: tokens.attention,
    });
    return {
      // Status chart: neutral = no draft, info = in progress, ok = created, warn = needs attention.
      theme: studioTheme.withParams({ ...base, ...palette(tokens.none) }),
      // Trend chart: one series in the action colour.
      trendTheme: studioTheme.withParams({ ...base, ...palette(tokens.action) }),
    };
  }, [tokens]);
  const ctx = useMemo(() => ({ theme, trendTheme, onFailure }), [theme, trendTheme, onFailure]);
  return (
    <Boundary onFailure={onFailure}>
      <AgStudioProvider {...(licenseKey ? { licenseKey } : {})}>
        <StudioCtx.Provider value={ctx}>{children}</StudioCtx.Provider>
      </AgStudioProvider>
    </Boundary>
  );
}

/**
 * P5: the per-response CSP nonce the production server publishes in `<meta name="nmi-style-nonce">`. Studio's
 * theming injects <style> elements; with this nonce they satisfy `style-src 'self' 'nonce-…'` without
 * `'unsafe-inline'`. Absent on the dev server (no CSP there), which is fine. Every Studio instance on a page must
 * carry the same nonce, so it is read once.
 */
const styleNonce =
  typeof document === "undefined"
    ? undefined
    : (document.querySelector('meta[name="nmi-style-nonce"]')?.getAttribute("content") ??
      undefined);

/*
 * AG Studio 3.0.0 does not forward `styleNonce` to its colour sensor or to the AG Charts DOM manager. Those few
 * static vendor stylesheets are allowed by exact SHA-256 hash in the server's CSP (apps/api/src/plugins/
 * studio-style-hashes.ts). There is deliberately NO page-wide createElement patch (SEC-N1): any other <style>
 * without the nonce stays blocked.
 */

/** View-only: remove every widget toolbar item (CSV/image export, duplicate, delete). */
const viewOnlyWidgets: NonNullable<AgStudioProperties["widgets"]> = (defaults) => ({
  ...defaults,
  widgets: defaults.widgets.map((w) => ({ ...w, toolbar: [] })),
});

function useCommon(trendSeries: boolean) {
  const { theme, trendTheme, onFailure } = useStudioCtx();
  const panels = useMemo(() => ({ view: { left: [], right: [] } }), []);
  return {
    mode: "view" as const,
    ...(styleNonce ? { styleNonce } : {}),
    style: { height: "100%", width: "100%" },
    theme: trendSeries ? trendTheme : theme,
    panels,
    widgets: viewOnlyWidgets,
    onErrorRaised: (e: AgStudioErrorRaisedEvent) =>
      onFailure(
        `${e.errorType}${e.fatal ? " (fatal)" : ""}: ${e.errorDetails.slice(0, 2).join("; ")}`,
      ),
  };
}

export function TrendChart({
  trend,
  compact,
  onReady,
}: {
  trend: StudioCurrency;
  compact: boolean;
  onReady: () => void;
}) {
  const common = useCommon(true);
  const data = useMemo(() => buildTrendData(trend), [trend]);
  const { surface } = useTokens();
  const state = useMemo(() => buildTrendState(trend, surface, compact), [trend, surface, compact]);
  return (
    <div className="studio-canvas studio-canvas-trend" data-testid="studio-trend">
      <AgStudio
        key={`${trend.currency}-${trend.mode}-${trend.buckets.length}`}
        {...common}
        data={data}
        initialState={state}
        onStudioReady={onReady}
      />
    </div>
  );
}

export function StatusChart({
  all,
  compact,
}: {
  all: readonly StudioCurrency[];
  compact: boolean;
}) {
  const common = useCommon(false);
  const data = useMemo(() => buildStatusData(all), [all]);
  const { surface } = useTokens();
  const rows = all.length;
  const state = useMemo(() => buildStatusState(surface, compact, rows), [surface, compact, rows]);
  return (
    <div
      className={`studio-canvas studio-canvas-status studio-rows-${Math.min(all.length, 8)}`}
      data-testid="studio-status"
    >
      <AgStudio {...common} data={data} initialState={state} />
    </div>
  );
}
