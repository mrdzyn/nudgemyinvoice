import { CURRENCY_CODES, type CurrencyCode, type InvoiceDraft } from "./types.js";
import { estimateTotals, MoneyError, parseMoney, parsePercent, parseQuantity } from "./money.js";

/** Editable form state. Everything is a string exactly as typed; nothing is persisted anywhere. */
export interface FormLine {
  description: string;
  quantity: string;
  unitPrice: string;
}
export interface FormState {
  customerName: string;
  customerEmail: string;
  currency: CurrencyCode;
  dueDate: string;
  taxPercent: string;
  discountKind: "none" | "percent" | "amount";
  discountValue: string;
  lines: FormLine[];
}

export const MAX_LINE_ITEMS = 50;
export const MAX_TEXT = 200;
export const MAX_EMAIL = 254;
export const MAX_PARSE_CHARS = 2000;

export const blankForm = (): FormState => ({
  customerName: "",
  customerEmail: "",
  currency: "USD",
  dueDate: "",
  taxPercent: "",
  discountKind: "none",
  discountValue: "",
  lines: [{ description: "", quantity: "1", unitPrice: "" }],
});

export const formFromDraft = (d: InvoiceDraft): FormState => ({
  customerName: d.customerName,
  customerEmail: d.customerEmail,
  currency: d.currency,
  dueDate: d.dueDate,
  taxPercent: d.taxPercent ?? "",
  discountKind: d.discount ? d.discount.kind : "none",
  discountValue: d.discount ? d.discount.value : "",
  lines: d.lineItems.map((l) => ({ ...l })),
});

export const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function toDraft(f: FormState): InvoiceDraft {
  return {
    customerName: clean(f.customerName),
    customerEmail: f.customerEmail.trim(),
    currency: f.currency,
    lineItems: f.lines.map((l) => ({
      description: clean(l.description),
      quantity: l.quantity.trim(),
      unitPrice: l.unitPrice.trim(),
    })),
    dueDate: f.dueDate,
    taxPercent: f.taxPercent.trim() === "" ? null : f.taxPercent.trim(),
    discount:
      f.discountKind === "none" ? null : { kind: f.discountKind, value: f.discountValue.trim() },
  };
}

export function isValidIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y = 0, m = 0, d = 0] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export interface FieldError {
  /** `customerName`, `line-0-quantity`, `lines`, ... */
  id: string;
  message: string;
}

/** DOM id of the control that owns an error. */
export const controlId = (errorId: string) =>
  errorId === "lines" ? "add-line-btn" : `f-${errorId}`;

/** Mirrors invoiceDraftSchema. Errors come back in document order. */
export function validateForm(f: FormState): { errors: FieldError[]; draft: InvoiceDraft | null } {
  const errors: FieldError[] = [];
  const add = (id: string, message: string) => errors.push({ id, message });
  const name = clean(f.customerName);
  if (!name) add("customerName", "Customer name is required.");
  else if (name.length > MAX_TEXT)
    add("customerName", "Customer name must be 200 characters or fewer.");
  const email = f.customerEmail.trim();
  if (!email) add("customerEmail", "Customer email is required.");
  else if (email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    add("customerEmail", "Enter a valid email address, for example billing@company.example.");
  if (!(CURRENCY_CODES as readonly string[]).includes(f.currency))
    add("currency", "Choose a supported currency.");
  if (!isValidIsoDate(f.dueDate)) add("dueDate", "Enter a valid due date.");
  f.lines.forEach((l, i) => {
    const d = clean(l.description);
    if (!d) add(`line-${i}-description`, `Line ${i + 1}: description is required.`);
    else if (d.length > MAX_TEXT)
      add(`line-${i}-description`, `Line ${i + 1}: description must be 200 characters or fewer.`);
    const check = (id: string, fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        if (!(e instanceof MoneyError)) throw e;
        add(id, `Line ${i + 1}: ${e.message}`);
      }
    };
    check(`line-${i}-quantity`, () => parseQuantity(l.quantity));
    check(`line-${i}-unitPrice`, () => parseMoney(l.unitPrice, f.currency));
  });
  if (f.lines.length < 1) add("lines", "Add at least one line item.");
  if (f.lines.length > MAX_LINE_ITEMS) add("lines", "An invoice can have at most 50 line items.");
  const tryMoney = (id: string, fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      if (!(e instanceof MoneyError)) throw e;
      add(id, e.message);
    }
  };
  if (f.taxPercent.trim() !== "") tryMoney("taxPercent", () => parsePercent(f.taxPercent));
  if (f.discountKind !== "none") {
    if (f.discountValue.trim() === "")
      add("discountValue", "Enter a discount value, or choose None.");
    else
      tryMoney("discountValue", () =>
        f.discountKind === "percent"
          ? parsePercent(f.discountValue)
          : parseMoney(f.discountValue, f.currency),
      );
  }
  if (errors.length === 0) tryMoney("discountValue", () => estimateTotals(toDraft(f)));
  return { errors, draft: errors.length ? null : toDraft(f) };
}
