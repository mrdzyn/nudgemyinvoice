import type { CurrencyCode, InvoiceDraft, RefusalReason, Totals } from "./types.js";

/**
 * Browser-side ESTIMATE of the server's integer-minor-unit arithmetic. It mirrors
 * packages/shared (calculateTotals) and packages/paypal (assertExactMapping); parity is proven by
 * money.test.ts. It is never authoritative: the server recomputes every total on save.
 */
export const CURRENCY_INFO: Record<
  CurrencyCode,
  { exponent: number; symbol: string; name: string }
> = {
  USD: { exponent: 2, symbol: "$", name: "US dollar" },
  EUR: { exponent: 2, symbol: "€", name: "Euro" },
  GBP: { exponent: 2, symbol: "£", name: "Pound sterling" },
  CAD: { exponent: 2, symbol: "CA$", name: "Canadian dollar" },
  AUD: { exponent: 2, symbol: "A$", name: "Australian dollar" },
  JPY: { exponent: 0, symbol: "¥", name: "Japanese yen (no decimals)" },
};

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

const DECIMAL = /^(\d{1,12})(?:\.(\d+))?$/;

export function parseMoney(value: string, currency: CurrencyCode): bigint {
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new MoneyError("Enter an amount such as 250 or 250.00.");
  const exp = CURRENCY_INFO[currency].exponent;
  const frac = m[2] ?? "";
  if (frac.length > exp) {
    throw new MoneyError(
      exp === 0
        ? `${currency} amounts have no decimal places.`
        : `${currency} amounts allow at most ${exp} decimal places.`,
    );
  }
  return BigInt((m[1] ?? "") + frac.padEnd(exp, "0"));
}

export function formatMinor(minor: bigint, currency: CurrencyCode): string {
  const exp = CURRENCY_INFO[currency].exponent;
  const s = minor.toString().padStart(exp + 1, "0");
  return exp === 0 ? s : `${s.slice(0, -exp)}.${s.slice(-exp)}`;
}

export function parseQuantity(value: string): bigint {
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new MoneyError("Enter a quantity such as 1 or 2.5.");
  const frac = m[2] ?? "";
  if (frac.length > 2) throw new MoneyError("Quantity allows at most 2 decimal places.");
  const hundredths = BigInt((m[1] ?? "") + frac.padEnd(2, "0"));
  if (hundredths <= 0n) throw new MoneyError("Quantity must be greater than zero.");
  if (hundredths > 10_000_000n) throw new MoneyError("Quantity is unreasonably large.");
  return hundredths;
}

export function parsePercent(value: string): bigint {
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new MoneyError("Enter a percentage such as 8 or 8.25.");
  const frac = m[2] ?? "";
  if (frac.length > 2) throw new MoneyError("Percentages allow at most 2 decimal places.");
  const bps = BigInt((m[1] ?? "") + frac.padEnd(2, "0"));
  if (bps > 10_000n) throw new MoneyError("A percentage must be between 0 and 100.");
  return bps;
}

const divHalfUp = (n: bigint, d: bigint) => (n * 2n + d) / (d * 2n);

/** "$1,234.50"; the decimal string is formatted without any floating-point step. */
export function formatCurrency(decimal: string, currency: CurrencyCode): string {
  const [whole = "0", frac] = decimal.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return CURRENCY_INFO[currency].symbol + grouped + (frac ? `.${frac}` : "");
}

export interface EstimatedTotals extends Totals {
  /** True when any figure had to be rounded half up to the smallest currency unit. */
  rounded: boolean;
}

export function estimateTotals(d: InvoiceDraft): EstimatedTotals {
  const c = d.currency;
  let subtotal = 0n;
  let rounded = false;
  const lines = d.lineItems.map((item) => {
    const product = parseMoney(item.unitPrice, c) * parseQuantity(item.quantity);
    if (product % 100n !== 0n) rounded = true;
    const line = divHalfUp(product, 100n);
    subtotal += line;
    return line;
  });
  let discount = 0n;
  if (d.discount) {
    if (d.discount.kind === "percent") {
      const product = subtotal * parsePercent(d.discount.value);
      if (product % 10_000n !== 0n) rounded = true;
      discount = divHalfUp(product, 10_000n);
    } else {
      discount = parseMoney(d.discount.value, c);
    }
    if (discount > subtotal) throw new MoneyError("The discount exceeds the subtotal.");
  }
  const taxable = subtotal - discount;
  let tax = 0n;
  if (d.taxPercent) {
    const product = taxable * parsePercent(d.taxPercent);
    if (product % 10_000n !== 0n) rounded = true;
    tax = divHalfUp(product, 10_000n);
  }
  const fmt = (v: bigint) => formatMinor(v, c);
  return {
    currency: c,
    lineTotals: lines.map(fmt),
    subtotal: fmt(subtotal),
    discount: fmt(discount),
    tax: fmt(tax),
    total: fmt(taxable + tax),
    rounded,
  };
}

/** Fixed "today" of the design so the demo is reproducible (matches the approved preview). */
export const DEMO_TODAY = "2026-10-27";

export const REFUSAL_TEXT: Record<RefusalReason, string> = {
  rounding_required_line:
    "A line total (quantity × unit price) is not an exact number of minor units.",
  rounding_required_tax: "The tax amount is not an exact number of minor units.",
  rounding_required_discount: "The percent discount is not an exact number of minor units.",
  tax_with_discount_multiline:
    "Tax combined with a discount is only supported on single-line invoices.",
  due_date_past: "The due date is in the past.",
};

/**
 * Preview of assertExactMapping(): why the server would refuse to create a PayPal Sandbox draft.
 * Only a preview; the server decides.
 */
export function paypalRefusal(d: InvoiceDraft, today: string = DEMO_TODAY): RefusalReason | null {
  if (d.dueDate && d.dueDate < today) return "due_date_past";
  const c = d.currency;
  const lines: bigint[] = [];
  for (const item of d.lineItems) {
    const product = parseMoney(item.unitPrice, c) * parseQuantity(item.quantity);
    if (product % 100n !== 0n) return "rounding_required_line";
    lines.push(product / 100n);
  }
  const subtotal = lines.reduce((a, b) => a + b, 0n);
  const tax = d.taxPercent ? parsePercent(d.taxPercent) : null;
  const discount = d.discount;
  const exact = (base: bigint, bps: bigint) => (base * bps) % 10_000n === 0n;
  if (tax !== null && discount) {
    if (lines.length !== 1) return "tax_with_discount_multiline";
    let discountMinor: bigint;
    if (discount.kind === "percent") {
      const bps = parsePercent(discount.value);
      if (!exact(subtotal, bps)) return "rounding_required_discount";
      discountMinor = (subtotal * bps) / 10_000n;
    } else {
      discountMinor = parseMoney(discount.value, c);
    }
    if (!exact(subtotal - discountMinor, tax)) return "rounding_required_tax";
  } else if (tax !== null) {
    for (const line of lines) if (!exact(line, tax)) return "rounding_required_tax";
  } else if (
    discount &&
    discount.kind === "percent" &&
    !exact(subtotal, parsePercent(discount.value))
  ) {
    return "rounding_required_discount";
  }
  return null;
}
