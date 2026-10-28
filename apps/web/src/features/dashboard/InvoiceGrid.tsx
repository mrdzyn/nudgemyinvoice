import { CellStyleModule, ClientSideRowModelModule, ModuleRegistry } from "ag-grid-community";
import type {
  CellKeyDownEvent,
  ColDef,
  FullWidthCellKeyDownEvent,
  ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useState } from "react";
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
      tabIndex={-1}
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

/**
 * Keyboard model (AG Grid's supported grid navigation, no custom focus code): Tab enters the grid
 * on the column headers and Tab or Shift+Tab leaves it, so the grid is one tab stop and never a
 * trap (`tabToNextHeader` / `tabToNextCell` return `false`, which hands Tab back to the browser).
 * Arrow keys move between headers and cells in every direction, Home/End/PageUp/PageDown work as
 * in any AG Grid, Enter or Space on a header sorts, and Enter or Space on the Actions cell opens
 * that invoice. AG Grid scrolls a focused cell into view, including the columns beyond a narrow
 * screen. The View button is not a separate tab stop: the focused cell is the keyboard target.
 */
export const leaveGridOnTab = (): false => false;

/** Enter or Space on the focused Actions cell opens that row's invoice (once). */
export function openOnKey(
  e: CellKeyDownEvent<ListItem, GridContext> | FullWidthCellKeyDownEvent<ListItem, GridContext>,
): void {
  const k = e.event as KeyboardEvent | null | undefined;
  if (!k || (k.key !== "Enter" && k.key !== " ")) return;
  if (!("column" in e) || e.column.getColId() !== "actions") return;
  // A real click/Enter on the inner button is handled by the button itself.
  if ((k.target as Element | null)?.closest?.("button")) return;
  const id = e.data?.id;
  if (!id) return;
  k.preventDefault();
  e.context.onOpen(id);
}

/**
 * The saved-invoice table. Sorting applies only to the rows loaded so far; filters and search stay
 * server-side. Rows are identified by the validated invoice UUID so a load-more append keeps the
 * operator's sort, focus and column widths. The number of loaded rows is bounded by the dashboard
 * (`MAX_LOADED_ROWS`), which is what bounds the DOM: every loaded row stays in the DOM, in reading
 * order, for assistive technology.
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
  return (
    <div
      className="nmi-grid ag-theme-quartz"
      data-testid="invoice-grid"
      role="group"
      aria-label="Saved invoices, newest first"
      aria-describedby="dash-sort-note"
    >
      <AgGridReact<ListItem>
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
        tabToNextHeader={leaveGridOnTab}
        tabToNextCell={leaveGridOnTab}
        onCellKeyDown={openOnKey}
        suppressMovableColumns
        suppressColumnVirtualisation
        suppressRowVirtualisation
        ensureDomOrder
        animateRows={false}
      />
    </div>
  );
}
