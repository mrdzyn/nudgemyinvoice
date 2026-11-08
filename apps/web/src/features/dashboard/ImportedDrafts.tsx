import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../../components/Badge.js";
import { Notice } from "../../components/Notice.js";
import { Spinner } from "../../components/Spinner.js";
import type {
  ImportedDraftItem,
  ImportsListResult,
  PayPalSyncResult,
  SyncCounts,
} from "../../paypal/importsApi.js";

export type ImportsSyncFn = (signal: AbortSignal) => Promise<PayPalSyncResult>;
export type ImportsListFn = (signal: AbortSignal) => Promise<ImportsListResult>;

export type ImportsPhase =
  "loading" | "ready" | "syncing" | "load-error" | "sync-error" | "disabled";

export interface ImportsViewState {
  phase: ImportsPhase;
  items: ImportedDraftItem[];
  counts: SyncCounts | null;
  partialFailure: boolean;
  notice: string | null;
  syncDisabled: boolean;
}

export const initialImportsView: ImportsViewState = {
  phase: "loading",
  items: [],
  counts: null,
  partialFailure: false,
  notice: null,
  syncDisabled: false,
};

const FAILURE: Record<string, string> = {
  "load-error": "Could not load the imported drafts.",
  "sync-error": "The import did not finish.",
  "rate-limited": "Too many syncs. Wait a few minutes, then try again.",
  busy: "Another sync is already running. Wait for it to finish, then try again.",
  uncertain:
    "The connection broke during the import. The list below was refreshed: some rows may have been stored.",
  forbidden: "The server did not accept this request. Reload the page and try again.",
  unavailable: "The import service is not available right now. Try again later.",
  "bad-request": "The server refused this request. Reload the page and try again.",
};

function CountsLine({ counts, partialFailure }: { counts: SyncCounts; partialFailure: boolean }) {
  return (
    <p className="hint" data-testid="imports-counts">
      Created {counts.created} · Updated {counts.updated} · Unchanged {counts.unchanged} · Skipped{" "}
      {counts.skipped} · Failed {counts.failed}
      {partialFailure ? (
        <span>
          {" "}
          — <strong>partial failure:</strong> earlier rows were kept; fix the cause and sync again.
        </span>
      ) : null}
    </p>
  );
}

/** Pure view: every sync/imports state renders without fixtures or a network. */
export function ImportedDraftsView({
  view,
  onSync,
}: {
  view: ImportsViewState;
  onSync: () => void;
}) {
  const syncing = view.phase === "syncing";
  const busy = view.phase === "loading" || syncing;
  return (
    <section aria-labelledby="imports-heading" id="paypal-imports">
      <h2 id="imports-heading">PayPal Sandbox imports</h2>
      <p className="hint">
        Sandbox DRAFT invoices imported by the manual sync below. These rows are separate from the
        invoice analytics above and are never added to those totals.
      </p>
      <div className="mt-8">
        <button
          type="button"
          className="btn btn-secondary"
          id="imports-sync"
          onClick={onSync}
          disabled={busy || view.syncDisabled}
          aria-busy={syncing}
          title={view.syncDisabled ? "PayPal sync is switched off" : undefined}
        >
          {syncing ? (
            <span role="status">
              <Spinner /> Syncing…
            </span>
          ) : (
            "Sync PayPal Drafts"
          )}
        </button>
      </div>
      {view.syncDisabled ? (
        <Notice kind="info" role="note" id="imports-disabled">
          PayPal sync is switched off. The button above is disabled and nothing was imported.
        </Notice>
      ) : null}
      {view.counts && view.phase !== "loading" ? (
        <CountsLine counts={view.counts} partialFailure={view.partialFailure} />
      ) : null}
      {view.notice ? (
        <Notice
          kind={view.phase === "sync-error" ? "warn" : "err"}
          role="alert"
          id="imports-notice"
        >
          <strong>{FAILURE[view.notice] ?? "Something went wrong."}</strong>
          {view.notice === "sync-error-uncertain" ? <span> {FAILURE["uncertain"]}</span> : null}
          {view.phase === "load-error" || view.phase === "sync-error" ? (
            <div className="mt-8">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                id="imports-retry"
                onClick={onSync}
                disabled={syncing}
              >
                Try again
              </button>
            </div>
          ) : null}
        </Notice>
      ) : null}
      {view.phase === "loading" ? (
        <div className="table-card pad-16" aria-busy="true">
          <p className="sr-only" role="status">
            Loading imported drafts…
          </p>
        </div>
      ) : view.items.length === 0 && (view.phase === "ready" || view.phase === "sync-error") ? (
        <p className="hint" id="imports-empty">
          No imported drafts yet. Use Sync PayPal Drafts to import existing Sandbox DRAFT invoices.
        </p>
      ) : view.items.length > 0 ? (
        <div className="table-card">
          <p className="sr-only" role="status" data-testid="imports-result-count">
            {view.items.length} imported draft{view.items.length === 1 ? "" : "s"} loaded
          </p>
          <table className="grid" id="imports-table">
            <thead>
              <tr>
                <th scope="col">Remote invoice</th>
                <th scope="col">Currency</th>
                <th scope="col">Total</th>
                <th scope="col">Due</th>
                <th scope="col">Linked</th>
                <th scope="col">Last synced</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <tr key={`${item.remoteInvoiceId}`}>
                  <td>
                    <code>{item.remoteInvoiceId}</code>
                    {item.invoiceNumber ? (
                      <span className="muted"> · {item.invoiceNumber}</span>
                    ) : null}
                  </td>
                  <td>{item.currency}</td>
                  <td className="num">{item.total}</td>
                  <td>{item.dueDate ?? "—"}</td>
                  <td>
                    {item.linkedInvoiceId ? (
                      <Badge kind="ok" glyph="✓">
                        Linked
                      </Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="muted">{item.lastSyncedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Stateful section: loads this operator's imported rows on mount and runs one manual sync at a
 * time. A 401 ends the session like every other authenticated call. Late answers after unmount,
 * sign-out or a newer request are unreachable.
 */
export function ImportedDraftsSection({
  sync,
  list,
  onExpired,
}: {
  sync: ImportsSyncFn;
  list: ImportsListFn;
  onExpired: () => void;
}) {
  const [view, setView] = useState<ImportsViewState>(initialImportsView);
  const mounted = useRef(false);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const fns = useRef({ sync, list });
  fns.current = { sync, list };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const r = await fns.current.list(signal);
    if (signal.aborted || !mounted.current) return false;
    switch (r.kind) {
      case "ok":
        setView((v) => ({ ...v, phase: "ready", items: r.items, notice: null }));
        return true;
      case "unauthorized":
        expired.current();
        return false;
      case "disabled":
        setView((v) => ({ ...v, phase: "disabled", syncDisabled: true, notice: null }));
        return false;
      default:
        setView((v) => ({ ...v, phase: "load-error", notice: "load-error" }));
        return false;
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void refresh(ac.signal);
    return () => ac.abort();
  }, [refresh]);

  const onSync = useCallback(async () => {
    const ac = new AbortController();
    setView((v) => ({ ...v, phase: "syncing", notice: null }));
    const r = await fns.current.sync(ac.signal);
    if (ac.signal.aborted || !mounted.current) return;
    switch (r.kind) {
      case "ok":
        setView((v) => ({ ...v, counts: r.counts, partialFailure: r.partialFailure }));
        await refresh(ac.signal);
        if (!mounted.current) return;
        // A partial failure keeps its counts visible alongside the refreshed list.
        if (r.partialFailure) setView((v) => ({ ...v, phase: "sync-error", notice: "sync-error" }));
        return;
      case "unauthorized":
        expired.current();
        return;
      case "disabled":
        setView((v) => ({ ...v, phase: "disabled", syncDisabled: true, notice: null }));
        return;
      case "aborted":
        setView((v) => (v.phase === "syncing" ? { ...v, phase: "ready" } : v));
        return;
      case "rate-limited":
        setView((v) => ({ ...v, phase: "sync-error", notice: "rate-limited" }));
        return;
      case "busy":
        setView((v) => ({ ...v, phase: "sync-error", notice: "busy" }));
        return;
      case "uncertain":
        // The server may have stored rows: refresh the list, then say so.
        await refresh(ac.signal);
        if (!mounted.current) return;
        setView((v) => ({ ...v, phase: "sync-error", notice: "sync-error-uncertain" }));
        return;
      case "forbidden":
      case "unavailable":
      case "bad-request":
        setView((v) => ({ ...v, phase: "sync-error", notice: r.kind }));
        return;
      default:
        setView((v) => ({ ...v, phase: "sync-error", notice: "sync-error" }));
    }
  }, [refresh]);

  return <ImportedDraftsView view={view} onSync={() => void onSync()} />;
}
