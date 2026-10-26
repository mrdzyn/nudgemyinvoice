import { and, asc, eq, sql } from "drizzle-orm";
import { payloadDigest } from "@nmi/domain";
import {
  calculateTotals,
  formatMoney,
  formatPercent,
  formatQuantity,
  invoiceDraftSchema,
  parseMoney,
  parsePercent,
  parseQuantity,
  type CalculatedTotals,
  type CurrencyCode,
  type InvoiceDraft,
} from "@nmi/shared";
import type { Db } from "./client.js";
import { invoiceItems, invoices } from "./schema.js";

export class DraftIntegrityError extends Error {
  constructor() {
    super("Stored invoice draft failed its integrity check");
    this.name = "DraftIntegrityError";
  }
}

export interface SavedDraft {
  id: string;
  draft: InvoiceDraft;
  totals: CalculatedTotals;
  draftDigest: string;
  paypalInvoiceId: string | null;
  createdAt: Date;
}

export type SaveResult =
  | { outcome: "created"; saved: SavedDraft }
  | { outcome: "replayed"; saved: SavedDraft }
  | { outcome: "conflict" };

export interface SaveInput {
  draft: InvoiceDraft;
  operatorId: string;
  /** Client retry key. Same key + same draft returns the stored draft; same key + different draft is a conflict. */
  idempotencyKey?: string | undefined;
  /** Runs inside the same transaction (e.g. the audit row), so either both commit or neither does. */
  afterWrite?: (tx: Db, info: { invoiceId: string; replayed: boolean }) => Promise<void>;
}

/**
 * Persists validated invoice drafts. The server recomputes every amount from the strict draft with
 * exact integer arithmetic; client or model supplied totals never reach this layer. Invoice and
 * items are written in ONE transaction.
 *
 * Canonical form: money as currency-scale decimals, quantities and percentages with trailing zeros
 * removed ("2.00" -> "2", "1.50" -> "1.5"); values are numerically identical to the input.
 */
export class PostgresInvoiceDraftStore {
  constructor(private readonly db: Db) {}

  async save(input: SaveInput): Promise<SaveResult> {
    const draft = invoiceDraftSchema.parse(input.draft); // defense in depth: never trust the caller
    const totals = calculateTotals(draft);
    const c = draft.currency;
    const digest = payloadDigest(draft);
    const key = input.idempotencyKey;

    const values = {
      createdBy: input.operatorId,
      idempotencyKey: key ?? null,
      draftDigest: digest,
      customerName: draft.customerName,
      customerEmail: draft.customerEmail,
      currency: c,
      subtotalMinor: parseMoney(totals.subtotal, c),
      discountMinor: parseMoney(totals.discount, c),
      taxMinor: parseMoney(totals.tax, c),
      totalMinor: parseMoney(totals.total, c),
      dueDate: draft.dueDate,
      taxBps: draft.taxPercent === null ? null : Number(parsePercent(draft.taxPercent)),
      discountKind: draft.discount?.kind ?? null,
      discountBps:
        draft.discount?.kind === "percent" ? Number(parsePercent(draft.discount.value)) : null,
    };

    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(invoices)
        .values(values)
        .onConflictDoNothing({
          target: [invoices.createdBy, invoices.idempotencyKey],
          where: sql`${invoices.idempotencyKey} is not null`,
        })
        .returning({ id: invoices.id });
      const row = inserted[0];

      if (!row) {
        // Only possible with a key: another request (or an earlier one) already holds it.
        const existing = await tx
          .select({ id: invoices.id, digest: invoices.draftDigest })
          .from(invoices)
          .where(
            and(
              eq(invoices.createdBy, input.operatorId),
              eq(invoices.idempotencyKey, key as string),
            ),
          )
          .limit(1);
        const found = existing[0];
        if (!found || found.digest !== digest) return { outcome: "conflict" } as const;
        await input.afterWrite?.(tx as unknown as Db, { invoiceId: found.id, replayed: true });
        return {
          outcome: "replayed",
          saved: await loadDraft(tx as unknown as Db, found.id),
        } as const;
      }

      await tx.insert(invoiceItems).values(
        draft.lineItems.map((item, position) => ({
          invoiceId: row.id,
          position,
          description: item.description,
          quantityHundredths: parseQuantity(item.quantity),
          unitPriceMinor: parseMoney(item.unitPrice, c),
        })),
      );
      await input.afterWrite?.(tx as unknown as Db, { invoiceId: row.id, replayed: false });
      return { outcome: "created", saved: await loadDraft(tx as unknown as Db, row.id) } as const;
    });
  }

  async get(id: string): Promise<SavedDraft | null> {
    if (!UUID.test(id)) return null;
    const exists = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);
    return exists.length ? loadDraft(this.db, id) : null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rebuilds the strict draft from rows and re-verifies the stored totals against it. */
async function loadDraft(db: Db, id: string): Promise<SavedDraft> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const inv = rows[0];
  if (!inv) throw new DraftIntegrityError();
  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id))
    .orderBy(asc(invoiceItems.position));
  const c = inv.currency as CurrencyCode;
  const draft = invoiceDraftSchema.parse({
    customerName: inv.customerName,
    customerEmail: inv.customerEmail,
    currency: c,
    lineItems: items.map((i) => ({
      description: i.description,
      quantity: formatQuantity(i.quantityHundredths),
      unitPrice: formatMoney(i.unitPriceMinor, c),
    })),
    dueDate: inv.dueDate,
    taxPercent: inv.taxBps === null ? null : formatPercent(BigInt(inv.taxBps)),
    discount:
      inv.discountKind === "percent"
        ? { kind: "percent", value: formatPercent(BigInt(inv.discountBps ?? 0)) }
        : inv.discountKind === "amount"
          ? { kind: "amount", value: formatMoney(inv.discountMinor, c) }
          : null,
  });
  const totals = calculateTotals(draft);
  const stored = [inv.subtotalMinor, inv.discountMinor, inv.taxMinor, inv.totalMinor];
  const recomputed = [totals.subtotal, totals.discount, totals.tax, totals.total].map((v) =>
    parseMoney(v, c),
  );
  if (stored.some((v, i) => v !== recomputed[i])) throw new DraftIntegrityError();
  return {
    id: inv.id,
    draft,
    totals,
    draftDigest: inv.draftDigest ?? payloadDigest(draft),
    paypalInvoiceId: inv.paypalInvoiceId,
    createdAt: inv.createdAt,
  };
}
