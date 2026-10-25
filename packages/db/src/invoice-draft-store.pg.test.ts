import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { calculateTotals, sumByCurrency, type InvoiceDraft } from "@nmi/shared";
import { createDb } from "./client.js";
import { DraftIntegrityError, PostgresInvoiceDraftStore } from "./invoice-draft-store.js";
import {
  createScratchDatabase,
  testDatabaseUrl,
  type ScratchDatabase,
} from "./testing/pg-scratch.js";

/** Exact-money persistence and idempotency of invoice drafts against real PostgreSQL. */
const url = testDatabaseUrl();

const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concept", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2026-12-01",
  taxPercent: null,
  discount: null,
  ...over,
});

describe.skipIf(!url)("PostgresInvoiceDraftStore (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let store: PostgresInvoiceDraftStore;
  let operatorId: string;
  let n = 0;
  const key = () => `key-${(++n).toString().padStart(8, "0")}`;
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
  const counts = async () =>
    (
      await sql(
        "SELECT (SELECT count(*)::int FROM invoices) AS i, (SELECT count(*)::int FROM invoice_items) AS it",
      )
    )[0] as {
      i: number;
      it: number;
    };

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 20);
    store = new PostgresInvoiceDraftStore(createDb(scratch.pool));
    operatorId = (
      await sql(
        "INSERT INTO operators (username, password_hash) VALUES ('demo-operator', 'scrypt$1$8$1$c2FsdHNhbHQ$aGFzaA') RETURNING id",
      )
    )[0].id as string;
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  describe("exact money round trip", () => {
    it("persists and reloads identical numbers (tax + percent discount, fractional quantity)", async () => {
      const input = draft({
        lineItems: [
          { description: "Consulting", quantity: "1.5", unitPrice: "80.00" },
          { description: "Hosting", quantity: "3", unitPrice: "10.50" },
        ],
        taxPercent: "8.25",
        discount: { kind: "percent", value: "10" },
      });
      const expected = calculateTotals(input);
      const res = await store.save({ draft: input, operatorId });
      if (res.outcome !== "created") throw new Error("expected created");
      expect(res.saved.totals).toEqual(expected);
      expect(res.saved.draft).toEqual(input); // already canonical, so byte-identical
      const row = (await sql("SELECT * FROM invoices WHERE id = $1", [res.saved.id]))[0];
      expect(String(row.subtotal_minor)).toBe("15150");
      expect(row.tax_bps).toBe(825);
      expect(row.discount_kind).toBe("percent");
      expect(row.discount_bps).toBe(1000);
      const reloaded = await store.get(res.saved.id);
      expect(reloaded?.draft).toEqual(input);
      expect(reloaded?.totals).toEqual(expected);
    });

    it("normalizes representation but never the value (1.50 -> 1.5, 2.00 -> 2)", async () => {
      const input = draft({
        lineItems: [{ description: "x", quantity: "1.50", unitPrice: "10.00" }],
      });
      const res = await store.save({ draft: input, operatorId });
      if (res.outcome !== "created") throw new Error("expected created");
      expect(res.saved.draft.lineItems[0]?.quantity).toBe("1.5");
      expect(res.saved.totals.total).toBe("15.00");
    });

    it("keeps float-hostile amounts exact (0.1 x 3, half-up tax rounding)", async () => {
      const a = await store.save({
        draft: draft({ lineItems: [{ description: "x", quantity: "3", unitPrice: "0.10" }] }),
        operatorId,
      });
      expect(a.outcome === "created" && a.saved.totals.total).toBe("0.30");
      const b = await store.save({
        draft: draft({
          lineItems: [{ description: "x", quantity: "1", unitPrice: "0.05" }],
          taxPercent: "10",
        }),
        operatorId,
      });
      expect(b.outcome === "created" && b.saved.totals.tax).toBe("0.01");
    });

    it("stores USD, EUR and zero-decimal JPY independently and never sums across currencies", async () => {
      await store.save({
        draft: draft({
          currency: "EUR",
          lineItems: [{ description: "x", quantity: "1", unitPrice: "80.50" }],
        }),
        operatorId,
      });
      await store.save({
        draft: draft({
          currency: "JPY",
          lineItems: [{ description: "x", quantity: "1", unitPrice: "15000" }],
        }),
        operatorId,
      });
      const rows = await sql("SELECT currency, total_minor FROM invoices ORDER BY created_at");
      const perCurrency = sumByCurrency(
        rows.map((r) => ({
          currency: r.currency,
          total: formatByScale(r.currency, BigInt(r.total_minor)),
        })),
      );
      expect(Object.keys(perCurrency).sort()).toEqual(["EUR", "JPY", "USD"]);
      expect(perCurrency.JPY).toBe("15000");
      expect(perCurrency.EUR).toBe("80.50");
    });
  });

  describe("transactions", () => {
    it("rolls back the invoice AND its items if anything later in the transaction fails", async () => {
      const before = await counts();
      await expect(
        store.save({
          draft: draft({
            lineItems: [
              { description: "a", quantity: "1", unitPrice: "1" },
              { description: "b", quantity: "1", unitPrice: "2" },
            ],
          }),
          operatorId,
          afterWrite: async () => {
            throw new Error("audit failed");
          },
        }),
      ).rejects.toThrow("audit failed");
      expect(await counts()).toEqual(before);
    });

    it("rejects a non-strict or invalid draft before touching the database", async () => {
      const before = await counts();
      const bad: unknown[] = [
        { ...draft(), total: "1.00" }, // client-supplied total is not accepted
        { ...draft(), currency: "XYZ" },
        draft({ lineItems: [{ description: "x", quantity: "1", unitPrice: "-5" }] }),
        draft({ lineItems: [] }),
        draft({ dueDate: "2026-02-30" }),
        draft({ customerEmail: "not-an-email" }),
      ];
      for (const b of bad) {
        await expect(store.save({ draft: b as InvoiceDraft, operatorId })).rejects.toBeInstanceOf(
          ZodError,
        );
      }
      expect(await counts()).toEqual(before);
    });
  });

  describe("client retry idempotency", () => {
    it("same key + same draft replays the stored draft; same key + different draft conflicts", async () => {
      const k = key();
      const first = await store.save({ draft: draft(), operatorId, idempotencyKey: k });
      expect(first.outcome).toBe("created");
      const before = await counts();
      const again = await store.save({ draft: draft(), operatorId, idempotencyKey: k });
      expect(again.outcome).toBe("replayed");
      if (first.outcome === "created" && again.outcome === "replayed")
        expect(again.saved.id).toBe(first.saved.id);
      const changed = await store.save({
        draft: draft({ lineItems: [{ description: "x", quantity: "2", unitPrice: "251.00" }] }),
        operatorId,
        idempotencyKey: k,
      });
      expect(changed.outcome).toBe("conflict");
      expect(await counts()).toEqual(before);
    });

    it("12 simultaneous requests with one key create exactly one invoice (11 replays)", async () => {
      const k = key();
      const before = await counts();
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          store.save({ draft: draft(), operatorId, idempotencyKey: k }),
        ),
      );
      expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
      expect(results.filter((r) => r.outcome === "replayed")).toHaveLength(11);
      const ids = new Set(results.map((r) => (r.outcome === "conflict" ? "" : r.saved.id)));
      expect(ids.size).toBe(1);
      const after = await counts();
      expect(after.i - before.i).toBe(1);
      expect(after.it - before.it).toBe(1);
    });

    it("without a key every request is a new draft (documented: send an Idempotency-Key)", async () => {
      const before = await counts();
      await store.save({ draft: draft(), operatorId });
      await store.save({ draft: draft(), operatorId });
      expect((await counts()).i - before.i).toBe(2);
    });
  });

  describe("reads", () => {
    it("returns null for unknown or malformed ids", async () => {
      expect(await store.get("00000000-0000-4000-8000-000000000000")).toBeNull();
      expect(await store.get("not-a-uuid")).toBeNull();
      expect(await store.get("' OR 1=1 --")).toBeNull();
    });

    it("detects a stored row whose items no longer match its totals", async () => {
      const res = await store.save({ draft: draft(), operatorId });
      if (res.outcome !== "created") throw new Error("expected created");
      // keep every CHECK satisfied but desynchronize items from totals
      await sql(
        "UPDATE invoices SET subtotal_minor = subtotal_minor + 1, total_minor = total_minor + 1 WHERE id = $1",
        [res.saved.id],
      );
      await expect(store.get(res.saved.id)).rejects.toBeInstanceOf(DraftIntegrityError);
    });
  });
});

function formatByScale(currency: string, minor: bigint): string {
  const exp = currency === "JPY" ? 0 : 2;
  const s = minor.toString().padStart(exp + 1, "0");
  return exp === 0 ? s : `${s.slice(0, -exp)}.${s.slice(-exp)}`;
}
