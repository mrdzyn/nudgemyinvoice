import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ICellRendererParams } from "ag-grid-community";
import type { ListItem } from "../../domain/serverList.js";
import {
  COLUMNS,
  columnsFor,
  CustomerCell,
  InvoiceCell,
  leaveGridOnTab,
  openOnKey,
  rowId,
  StatusCell,
  TotalCell,
  ViewCell,
} from "./InvoiceGrid.js";
import { compareInstant, compareText, compareTotal, statusLabel } from "./invoiceGridSort.js";

/**
 * Objective: the AG Grid column model is correct without a browser. AG Grid draws rows only in the
 * browser, so the cell renderers are rendered directly, the comparators are exercised with exact
 * BigInt money, and the real-browser journeys cover the assembled grid.
 */
const item = (n: number, over: Partial<ListItem> = {}): ListItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  customerName: `Customer ${n}`,
  customerEmail: `c${n}@example.test`,
  currency: "USD",
  dueDate: "2030-01-15",
  total: "10.00",
  createdAt: "2026-10-27T10:00:00.000Z",
  paypalState: "none",
  ...over,
});
const params = (data: ListItem, onOpen: (id: string) => void = () => undefined) =>
  ({ data, context: { onOpen } }) as unknown as ICellRendererParams<
    ListItem,
    unknown,
    { onOpen: (id: string) => void }
  >;
const html = (el: React.ReactElement) => renderToString(el).replace(/<!-- -->/g, "");

describe("columns", () => {
  it("has the six approved columns with stable ids; only Actions is neither sortable nor resizable", () => {
    expect(COLUMNS.map((c) => c.headerName)).toEqual([
      "Invoice",
      "Customer",
      "Due",
      "Total",
      "PayPal Sandbox",
      "Actions",
    ]);
    const actions = COLUMNS.find((c) => c.colId === "actions");
    expect(actions?.sortable).toBe(false);
    expect(actions?.resizable).toBe(false);
    expect(COLUMNS.filter((c) => c.sortable !== false)).toHaveLength(5);
  });
  it("below the tablet breakpoint the same six columns are re-ordered so customer, total and View come first, with fixed widths", () => {
    const narrow = columnsFor(true);
    expect(narrow.map((c) => c.colId)).toEqual([
      "customer",
      "total",
      "actions",
      "status",
      "invoice",
      "due",
    ]);
    expect(narrow.every((c) => c.flex === null)).toBe(true);
    expect(narrow.slice(0, 3).reduce((w, c) => w + (c.width ?? 0), 0)).toBeLessThanOrEqual(356);
    expect(columnsFor(false)).toBe(COLUMNS);
    expect(new Set(narrow.map((c) => c.colId))).toEqual(new Set(COLUMNS.map((c) => c.colId)));
  });
  it("identifies rows by the invoice UUID", () => {
    expect(rowId({ data: item(7) })).toBe("00000000-0000-4000-8000-000000000007");
  });
});

describe("cell renderers", () => {
  it("invoice, customer, total and status cells show the saved values with the exact currency", () => {
    const i = item(3, { total: "1234.50", currency: "EUR", paypalState: "created" });
    expect(html(<InvoiceCell {...params(i)} />)).toContain("00000000");
    expect(html(<InvoiceCell {...params(i)} />)).toContain("Saved Oct 27, 2026");
    const c = html(<CustomerCell {...params(i)} />);
    expect(c).toContain("Customer 3");
    expect(c).toContain("c3@example.test");
    const t = html(<TotalCell {...params(i)} />);
    expect(t).toContain("€1,234.50");
    expect(t).toContain("EUR");
    expect(html(<StatusCell {...params(i)} />)).toContain("PayPal draft created");
    expect(html(<StatusCell {...params(item(4))} />)).toContain("No PayPal draft");
  });
  it("JPY has no decimals and a zero-decimal total stays exact", () => {
    expect(html(<TotalCell {...params(item(1, { currency: "JPY", total: "1200" }))} />)).toContain(
      "1,200",
    );
  });
  it("the View action is a real labelled button that opens only its own invoice", () => {
    const seen: string[] = [];
    const i = item(5);
    const h = html(<ViewCell {...params(i, (id) => void seen.push(id))} />);
    expect(h).toContain('<button type="button"');
    expect(h).toContain('aria-label="View invoice 00000000 for Customer 5"');
    expect(h).not.toContain("onclick");
    expect(seen).toEqual([]); // rendering never opens anything; the click path runs in the browser journeys
  });
  it("renders nothing for an absent row", () => {
    const p = {
      data: undefined,
      context: { onOpen: () => undefined },
    } as unknown as ICellRendererParams<ListItem, unknown, { onOpen: (id: string) => void }>;
    expect(html(<ViewCell {...p} />)).toBe("");
  });
});

describe("sorting comparators (loaded rows only, exact money)", () => {
  it("orders totals exactly in one currency, including values a float would merge", () => {
    const a = item(1, { total: "9007199254740993.00" });
    const b = item(2, { total: "9007199254740992.99" });
    expect(compareTotal(a, b)).toBe(1);
    expect(compareTotal(b, a)).toBe(-1);
    expect(compareTotal(a, item(3, { total: "9007199254740993.00" }))).toBe(0);
  });
  it("never ranks different currencies by magnitude: currency code first, then amount", () => {
    const eur = item(1, { currency: "EUR", total: "999999.00" });
    const usd = item(2, { currency: "USD", total: "1.00" });
    expect(compareTotal(eur, usd)).toBe(-1);
    expect(compareTotal(usd, eur)).toBe(1);
    const jpy = item(3, { currency: "JPY", total: "5" });
    const usd2 = item(4, { currency: "USD", total: "2.00" });
    expect(compareTotal(jpy, usd2)).toBe(-1);
  });
  it("orders text, instants and statuses", () => {
    expect(compareText("alice", "Bob")).toBeLessThan(0);
    expect(compareInstant("2026-10-27T10:00:00.000Z", "2026-10-27T10:00:00.001Z")).toBe(-1);
    expect(compareInstant("2030-01-02", "2030-01-01")).toBe(1);
    expect(statusLabel("pending")).toBe(statusLabel("creating"));
    expect(statusLabel("mismatch")).toBe("Needs operator review");
  });
});

describe("keyboard hooks", () => {
  const cellKey = (key: string, col: string, over: Record<string, unknown> = {}) => {
    let prevented = false;
    const opened: string[] = [];
    const ev = { key, target: null, preventDefault: () => void (prevented = true) };
    const e = {
      event: ev,
      column: { getColId: () => col },
      data: item(9),
      context: { onOpen: (id: string) => void opened.push(id) },
      ...over,
    };
    openOnKey(e as unknown as Parameters<typeof openOnKey>[0]);
    return { opened, prevented };
  };
  it("Enter and Space on the Actions cell open exactly that invoice", () => {
    for (const k of ["Enter", " "]) {
      const r = cellKey(k, "actions");
      expect(r.opened).toEqual([item(9).id]);
      expect(r.prevented).toBe(true);
    }
  });
  it("other keys and other columns do nothing", () => {
    expect(cellKey("ArrowDown", "actions").opened).toEqual([]);
    expect(cellKey("Enter", "customer").opened).toEqual([]);
    expect(cellKey("Enter", "actions", { data: undefined }).opened).toEqual([]);
  });
  it("an Enter that came from the inner button is left to the button (no double open)", () => {
    const ev = {
      key: "Enter",
      target: { closest: (sel: string) => (sel === "button" ? {} : null) },
      preventDefault: () => undefined,
    };
    const opened: string[] = [];
    openOnKey({
      event: ev,
      column: { getColId: () => "actions" },
      data: item(1),
      context: { onOpen: (id: string) => void opened.push(id) },
    } as unknown as Parameters<typeof openOnKey>[0]);
    expect(opened).toEqual([]);
  });
  it("Tab hands focus back to the browser from headers and cells (one tab stop, no trap)", () => {
    expect(leaveGridOnTab()).toBe(false);
  });
});
