import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Badge } from "../../components/Badge.js";
import { Notice } from "../../components/Notice.js";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { CurrencyCode } from "../../domain/types.js";
import "./studio.css";
import { fetchDevLicenceKey } from "./studioLicence.js";
import { loadStudioModule, type StudioModule } from "./studioLoader.js";
import {
  buildStudioModel,
  defaultChartCurrency,
  type StudioCurrency,
  type StudioRange,
} from "./studioModel.js";
import { STATUS_SERIES } from "./studioReport.js";

const NARROW = "(max-width: 767px)";

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

function CurrencyTabs({
  currencies,
  active,
  onSelect,
}: {
  currencies: readonly CurrencyCode[];
  active: CurrencyCode;
  onSelect: (c: CurrencyCode) => void;
}) {
  const refs = useRef(new Map<CurrencyCode, HTMLButtonElement>());
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % currencies.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + currencies.length) % currencies.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = currencies.length - 1;
    else return;
    e.preventDefault();
    const c = currencies[next];
    if (!c) return;
    onSelect(c);
    refs.current.get(c)?.focus();
  };
  return (
    <div
      className="cur-tabs"
      role="tablist"
      aria-label="Chart currency (view only; does not change the filters)"
    >
      {currencies.map((c, i) => (
        <button
          key={c}
          type="button"
          role="tab"
          className="cur-tab"
          aria-selected={c === active}
          tabIndex={c === active ? 0 : -1}
          ref={(el) => {
            if (el) refs.current.set(c, el);
            else refs.current.delete(c);
          }}
          onClick={() => onSelect(c)}
          onKeyDown={(e) => move(e, i)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** Exact accessible equivalent of the chart: ONE row per local calendar day, zero-invoice days included. */
function DailyTable({ cur }: { cur: StudioCurrency }) {
  return (
    <details className="data-alt">
      <summary>View {cur.currency} daily data as a table</summary>
      <div className="table-scroll">
        <table className="data tight" data-testid="studio-daily-table">
          <caption className="sr-only">
            {cur.currency} invoices by local creation day; every calendar day in the range,
            including days with no invoices, exact values
          </caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col" className="r">
                Invoices
              </th>
              <th scope="col" className="r">
                Total ({cur.currency})
              </th>
            </tr>
          </thead>
          <tbody>
            {cur.days.map((d) => (
              <tr key={d.day} className={d.count === 0 ? "zero" : undefined}>
                <th scope="row">{d.label}</th>
                <td className="r num">{d.count}</td>
                <td className="r num">{d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const BADGE_KIND = { none: "neutral", progress: "info", created: "ok", attention: "warn" } as const;
const BADGE_ICON = { none: "○", progress: "◔", created: "✓", attention: "!" } as const;

/** Counts only, per currency; never summed across currencies. Text is the accessible form of the status chart. */
function StatusList({ currencies }: { currencies: readonly StudioCurrency[] }) {
  return (
    <div className="status-text" data-testid="studio-status-list">
      {currencies.map((c) => (
        <div className="status-row" key={c.currency}>
          <div className="status-head">
            <strong>{c.currency}</strong>
            <span className="muted">
              {c.invoiceCount} invoice{c.invoiceCount === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="state-list">
            {STATUS_SERIES.map(({ state, label }) => (
              <li key={state}>
                <Badge kind={BADGE_KIND[state]} glyph={BADGE_ICON[state]}>
                  {label}
                </Badge>
                <span className="num cnt">{c.stateCounts[state]}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type Phase = "idle" | "loading" | "ready" | "failed";

/**
 * "Activity analytics": a view-only AG Studio region between the full-population currency cards and the AG Grid
 * Community table. It renders the EXISTING analytics answer only (no fetch of its own, no new endpoint) and keeps
 * everything exact: currencies are separate, amounts are minor-unit BigInt, zero days stay in the table.
 */
export default function StudioPanel({
  summary,
  range,
}: {
  summary: AnalyticsSummary;
  range: StudioRange;
}) {
  const model = useMemo(() => buildStudioModel(summary, range), [summary, range]);
  const narrow = useNarrow();
  const [open, setOpen] = useState(() => !window.matchMedia(NARROW).matches);
  const [phase, setPhase] = useState<Phase>("idle");
  const [attempt, setAttempt] = useState(0);
  const [mod, setMod] = useState<StudioModule | null>(null);
  const [licence, setLicence] = useState<string | null>(null);
  const [selected, setSelected] = useState<CurrencyCode | null>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  const failedRef = useRef(false);

  const onFailure = useCallback(() => {
    failedRef.current = true;
    setPhase("failed");
  }, []);

  // Studio and the licence are fetched only once the panel is open (mobile stays unloaded while collapsed).
  // One request per attempt: a ref (not the phase) guards it, so React StrictMode and phase changes can
  // neither start it twice nor cancel it; only unmounting discards the result.
  const mounted = useRef(true);
  const requested = useRef(-1);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open || !model.ok || requested.current === attempt) return;
    requested.current = attempt;
    setPhase("loading");
    void Promise.all([loadStudioModule(), fetchDevLicenceKey()]).then(
      ([m, key]) => {
        if (!mounted.current) return;
        failedRef.current = false;
        setMod(m);
        setLicence(key);
        setPhase("ready");
      },
      () => {
        if (mounted.current) setPhase("failed");
      },
    );
  }, [open, model.ok, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  // Studio is "active" only when real Studio widgets are actually rendered: ready, a usable module, and a
  // chart-safe currency selected. Over-limit (not plotted) or failed states show the exact table without the badge.
  let studioRendered = false;
  const body = (() => {
    if (!model.ok)
      return (
        <Notice kind="info" role="status" id="studio-unavailable">
          <strong>Charts unavailable.</strong> The totals above and the invoice table below are not
          affected.
        </Notice>
      );
    const active =
      model.currencies.find((c) => c.currency === selected) ??
      model.currencies.find((c) => c.currency === defaultChartCurrency(model)) ??
      null;
    if (!active) return null;
    const names = model.currencies.map((c) => c.currency);
    const first = active.buckets[0];
    const peak = first && active.buckets.reduce((b, x) => (x.minor > b.minor ? x : b), first);
    const weekly = active.mode === "weekly";
    const failed = phase === "failed";
    const showCharts = phase === "ready" && mod !== null && active.chartSafe;
    const Studio = showCharts ? mod : null;
    studioRendered = Studio !== null && !failed;
    const peakLine = peak && (
      <p className="hint hint-tight">
        Peak {weekly ? "week" : "day"}: {peak.title} · {peak.total} · {peak.count} invoice
        {peak.count === 1 ? "" : "s"}. One currency per chart; axes are never shared across
        currencies.
      </p>
    );
    const chartColumn = (
      <div className="studio-chart">
        <div className="chart-bar">
          <h3 className="h3">
            {weekly ? "Weekly" : "Daily"} invoice value ·{" "}
            <span className="cur-now">{active.currency}</span>
          </h3>
          {names.length > 1 ? (
            <CurrencyTabs currencies={names} active={active.currency} onSelect={setSelected} />
          ) : null}
        </div>
        {weekly ? (
          <p className="mode-note">
            <Badge kind="info">Weekly view</Badge> The range is longer than 90 days, so bars group
            each local week (Monday start). The table keeps every day.
          </p>
        ) : null}
        {failed ? (
          <Notice kind="info" role="status" id="studio-unavailable">
            <strong>Charts unavailable.</strong> The totals above and the invoice table below are
            not affected.
            <div className="mt-12">
              <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
                Try loading charts again
              </button>
            </div>
          </Notice>
        ) : phase === "ready" && !active.chartSafe ? (
          <Notice kind="info" role="status" id="studio-too-large">
            <strong>Chart not drawn.</strong> An amount in this range is too large to plot without
            risking a wrong label. The exact daily table below is complete.
          </Notice>
        ) : Studio ? (
          <div
            className="chart-wrap"
            role="group"
            aria-roledescription="chart"
            aria-label={`${weekly ? "Weekly" : "Daily"} ${active.currency} invoice totals (AG Studio). The full daily table follows.`}
          >
            <Studio.TrendChart trend={active} compact={narrow} onReady={() => undefined} />
          </div>
        ) : (
          <div className="skeleton chart-skel" aria-hidden="true" />
        )}
        {peakLine}
        <DailyTable cur={active} />
      </div>
    );
    const statusColumn = (
      <div className="studio-status">
        <h3 className="h3">PayPal Sandbox draft status</h3>
        {Studio ? (
          <div
            className="chart-wrap"
            role="group"
            aria-roledescription="chart"
            aria-label="PayPal Sandbox draft status by currency (AG Studio). The counts follow as text."
          >
            <Studio.StatusChart all={model.currencies} compact={narrow} />
          </div>
        ) : null}
        <StatusList currencies={model.currencies} />
        <p className="hint hint-tight">
          <strong>PayPal draft created</strong> means a Sandbox DRAFT exists. It is not sent, not
          paid and not overdue.
        </p>
      </div>
    );
    const inner = (
      <>
        <p className="hint hint-tight">
          Same filters and the same full-population server totals as the cards above. Values are
          invoice totals by creation day ({model.timeZone}), not payments.
        </p>
        <div className="studio-grid">
          {chartColumn}
          {statusColumn}
        </div>
      </>
    );
    return Studio ? (
      <Studio.StudioRoot licenseKey={licence} onFailure={onFailure}>
        {inner}
      </Studio.StudioRoot>
    ) : (
      inner
    );
  })();

  const active = studioRendered;
  return (
    <section
      className="card studio"
      id="studio-panel"
      aria-labelledby={titleId}
      aria-busy={open && phase === "loading" ? true : undefined}
      data-studio={
        active
          ? "active"
          : phase === "failed" || !model.ok || phase === "ready"
            ? "fallback"
            : "pending"
      }
      data-open={open ? "1" : "0"}
    >
      <div className="studio-head">
        <div className="studio-title">
          <h2 className="card-title" id={titleId}>
            Activity analytics
          </h2>
          {active ? <Badge kind="neutral">Studio · view only</Badge> : null}
        </div>
        {model.ok ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm studio-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Hide charts" : "Show charts"}
          </button>
        ) : null}
      </div>
      <div className="studio-body" id={bodyId} hidden={model.ok ? !open : false}>
        {phase === "loading" && model.ok ? (
          <p className="sr-only" role="status">
            Loading analytics
          </p>
        ) : null}
        {body}
      </div>
    </section>
  );
}
