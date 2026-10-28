import { CellStyleModule, ClientSideRowModelModule, ModuleRegistry } from "ag-grid-community";
import type { ColDef, ICellRendererParams, TabToNextHeaderParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz-no-font.css";
import { PayPalStatusBadge } from "../../components/Badge.js";
import { formatCurrency } from "../../domain/money.js";
import type { ListItem } from "../../domain/serverList.js";
import { formatDate, shortId } from "./DashboardScreen.js";
import { compareInstant, compareText, compareTotal, statusLabel } from "./invoiceGridSort.js";

// Community only: the client-side row model (sorting and resizing ship with the core) and cell
// classes. No Enterprise or Studio module is registered; the boundary test forbids importing either.
ModuleRegistry.registerModules([ClientSideRowModelModule, CellStyleModule]);

interface GridContext {
  onOpen: (id: string) => void;
}
type Params = ICellRendererParams<ListItem, unknown, GridContext>;

export function InvoiceCell({ data }: Params) {
  if (!data) return null;
  return (
    <div className="cell-stack">
      <span className="mono">{shortId(data.id)}</span>
      <span className="cell-sub">Saved {formatDate(data.createdAt)}</span>
    </div>
  );
}

export function CustomerCell({ data }: Params) {
  if (!data) return null;
  return (
    <div className="cell-stack">
      <span className="cell-main">{data.customerName}</span>
      <span className="cell-sub">{data.customerEmail}</span>
    </div>
  );
}

export function TotalCell({ data }: Params) {
  if (!data) return null;
  return (
    <span className="num">
      <strong>{formatCurrency(data.total, data.currency)}</strong>{" "}
      <span className="cell-sub">{data.currency}</span>
    </span>
  );
}

export function StatusCell({ data }: Params) {
  if (!data) return null;
  return <PayPalStatusBadge state={data.paypalState} />;
}

export function ViewCell({ data, context }: Params) {
  if (!data) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      aria-label={`View invoice ${shortId(data.id)} for ${data.customerName}`}
      onClick={() => context.onOpen(data.id)}
    >
      View
    </button>
  );
}

function glyph(ch: string) {
  return () => {
    const s = document.createElement("span");
    s.setAttribute("aria-hidden", "true");
    s.textContent = ch;
    return s;
  };
}
// Text glyphs instead of AG Grid's icon font (data-URI fonts are blocked by the strict CSP).
const ICONS = {
  sortAscending: glyph("▲"),
  sortDescending: glyph("▼"),
  sortUnSort: glyph("↕"),
};

export const COLUMNS: ColDef<ListItem>[] = [
  {
    colId: "invoice",
    headerName: "Invoice",
    cellRenderer: InvoiceCell,
    valueGetter: (p) => p.data?.createdAt ?? "",
    comparator: compareInstant,
    minWidth: 140,
    flex: 1,
  },
  {
    colId: "customer",
    headerName: "Customer",
    cellRenderer: CustomerCell,
    valueGetter: (p) => p.data?.customerName ?? "",
    comparator: compareText,
    minWidth: 200,
    flex: 2,
  },
  {
    colId: "due",
    headerName: "Due",
    valueGetter: (p) => p.data?.dueDate ?? "",
    valueFormatter: (p) => formatDate(String(p.value)),
    comparator: compareInstant,
    minWidth: 120,
    flex: 1,
  },
  {
    colId: "total",
    headerName: "Total",
    cellRenderer: TotalCell,
    cellClass: "ag-right-aligned-cell",
    headerClass: "ag-right-aligned-header",
    comparator: (_a, _b, na, nb) => (na.data && nb.data ? compareTotal(na.data, nb.data) : 0),
    minWidth: 150,
    flex: 1,
  },
  {
    colId: "status",
    headerName: "PayPal Sandbox",
    cellRenderer: StatusCell,
    valueGetter: (p) => (p.data ? statusLabel(p.data.paypalState) : ""),
    comparator: compareText,
    minWidth: 190,
    flex: 1,
  },
  {
    colId: "actions",
    headerName: "Actions",
    cellRenderer: ViewCell,
    sortable: false,
    resizable: false,
    minWidth: 100,
    maxWidth: 120,
  },
];

export const rowId = (p: { data: ListItem }): string => p.data.id;

const NARROW_MEDIA = "(max-width: 767px)";

/**
 * Below the app's tablet breakpoint the grid is a horizontally scrollable region (the page itself
 * never scrolls sideways). The columns are re-ordered so the customer, total and View action are
 * visible together without scrolling; status, invoice and due date follow to the right.
 */
const NARROW: Record<string, Partial<ColDef<ListItem>>> = {
  customer: { width: 146, minWidth: 140, flex: null },
  total: { width: 120, minWidth: 110, flex: null },
  actions: { width: 86, minWidth: 84, maxWidth: 96, flex: null },
  status: { width: 200, minWidth: 190, flex: null },
  invoice: { width: 140, minWidth: 130, flex: null },
  due: { width: 120, minWidth: 110, flex: null },
};
const NARROW_ORDER = ["customer", "total", "actions", "status", "invoice", "due"];

function useNarrow(): boolean {
  const query = () => typeof matchMedia !== "undefined" && matchMedia(NARROW_MEDIA).matches;
  const [narrow, setNarrow] = useState(query);
  useEffect(() => {
    const m = matchMedia(NARROW_MEDIA);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** The column set for the current width; exported so the layout is testable without a browser. */
export function columnsFor(narrow: boolean): ColDef<ListItem>[] {
  if (!narrow) return COLUMNS;
  return NARROW_ORDER.map((id) => {
    const base = COLUMNS.find((c) => c.colId === id);
    return { ...(base as ColDef<ListItem>), ...NARROW[id] };
  });
}

const TABBABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Moves focus to the first tabbable element that follows `region` in document order. */
function focusAfter(region: HTMLElement) {
  const next = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).find(
    (n) =>
      !region.contains(n) &&
      region.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING &&
      n.getClientRects().length > 0,
  );
  next?.focus();
}

/**
 * The saved-invoice table. Sorting applies only to the rows loaded so far; filters and search stay
 * server-side. Rows are identified by the validated invoice UUID so a load-more append keeps the
 * operator's sort, focus and column widths.
 *
 * Keyboard: Tab walks the sortable column headers once (Enter sorts, arrow keys move between
 * headers), then moves to the first row's View button; each View button is one tab stop in reading
 * order and Tab after the last one leaves the grid. Shift+Tab retraces the same path. Cells are not
 * focus targets, so there is no 100-stop cell-by-cell walk and no keyboard trap.
 */
export function InvoiceGrid({
  items,
  onOpen,
}: {
  items: readonly ListItem[];
  onOpen: (id: string) => void;
}) {
  const context = useMemo<GridContext>(() => ({ onOpen }), [onOpen]);
  const narrow = useNarrow();
  const columns = useMemo(() => columnsFor(narrow), [narrow]);
  const ids = columns.map((c) => c.colId ?? "");
  const lastId = ids[ids.length - 1] ?? "";
  const wrap = useRef<HTMLDivElement>(null);
  const grid = useRef<AgGridReact<ListItem>>(null);
  const viewButtons = () =>
    Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>(".ag-row button") ?? []);

  const tabToNextHeader = (p: TabToNextHeaderParams<ListItem>) => {
    const col = p.previousHeaderPosition?.column;
    const at = ids.indexOf(col && "getColId" in col ? col.getColId() : "");
    if (!p.backwards && at === ids.length - 1) {
      const first = viewButtons()[0];
      if (!first) return false;
      // The grid re-focuses the current header after this callback returns, so hand over afterwards.
      setTimeout(() => first.focus(), 0);
      return true;
    }
    if (p.backwards && at <= 0) return false;
    return p.nextHeaderPosition ?? false;
  };

  // The grid's own Tab handling keeps focus on a button inside a row, so Tab and Shift+Tab are
  // resolved here, before the grid sees them: the next/previous View button, then the header row
  // (backwards) or the next focusable element after the grid (forwards).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onTab = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.key !== "Tab" || !(t instanceof HTMLButtonElement) || !t.closest(".ag-row")) return;
      const buttons = viewButtons();
      const i = buttons.indexOf(t);
      if (i < 0) return;
      e.preventDefault();
      e.stopPropagation();
      const next = buttons[e.shiftKey ? i - 1 : i + 1];
      if (next) next.focus();
      else if (e.shiftKey) grid.current?.api.setFocusedHeader(lastId);
      else focusAfter(el);
    };
    el.addEventListener("keydown", onTab, true);
    return () => el.removeEventListener("keydown", onTab, true);
  }, []);

  return (
    <div
      ref={wrap}
      className="nmi-grid ag-theme-quartz"
      data-testid="invoice-grid"
      role="group"
      aria-label="Saved invoices, newest first"
    >
      <AgGridReact<ListItem>
        ref={grid}
        theme="legacy"
        rowData={items as ListItem[]}
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
        getRowId={rowId}
        context={context}
        icons={ICONS}
        domLayout="autoHeight"
        rowHeight={64}
        headerHeight={44}
        suppressCellFocus
        tabToNextHeader={tabToNextHeader}
        suppressMovableColumns
        suppressColumnVirtualisation
        suppressRowVirtualisation
        ensureDomOrder
        animateRows={false}
      />
    </div>
  );
}
