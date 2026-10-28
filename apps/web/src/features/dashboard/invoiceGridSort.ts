import { minorOf, type ListItem } from "../../domain/serverList.js";

/**
 * Comparators for the invoice grid. Sorting reorders only the rows already loaded; it never
 * touches the server query. Money is compared as exact BigInt minor units, never as a float, and
 * amounts of different currencies are never compared by magnitude: the currency code orders
 * first, then the exact amount within one currency. The tie order is the loaded (newest-first)
 * order because AG Grid's sort is stable.
 */
export function compareTotal(a: ListItem, b: ListItem): number {
  if (a.currency !== b.currency) return a.currency < b.currency ? -1 : 1;
  const x = minorOf(a.total);
  const y = minorOf(b.total);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

/** Instants and calendar dates are validated ISO strings; compare the instants they denote. */
export function compareInstant(a: string, b: string): number {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

const STATUS_LABEL: Record<ListItem["paypalState"], string> = {
  none: "No PayPal draft",
  pending: "Creation in progress",
  creating: "Creation in progress",
  created: "PayPal draft created",
  unknown: "Outcome unknown",
  rejected: "PayPal rejected",
  mismatch: "Needs operator review",
};
export const statusLabel = (s: ListItem["paypalState"]): string => STATUS_LABEL[s];
