import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateTotals, type InvoiceDraft } from "@nmi/shared";
import { createDb } from "./client.js";
import { PostgresInvoiceDraftStore } from "./invoice-draft-store.js";
import {
  decodeCursor,
  encodeCursor,
  LIST_MAX_LIMIT,
  PostgresInvoiceListStore,
  type InvoiceListQuery,
} from "./invoice-list-store.js";
import {
  createScratchDatabase,
  testDatabaseUrl,
  type ScratchDatabase,
} from "./testing/pg-scratch.js";

/**
 * Objective: the dashboard list is read-only, owner-scoped, bounded, exact and stable. Operator A
 * never sees B's (or an ownerless) invoice, detail reads of another operator's id look like unknown
 * ids, keyset pagination neither skips nor repeats rows (equal timestamps, microsecond gaps,
 * concurrent inserts), filters and search run over the WHOLE owned collection, money stays exact and
 * the PayPal state comes only from the durable operation row.
 *
 * NOTE: production allows exactly one operator (`operators_single_row_uq`). This suite drops that
 * index in its own scratch schema ONLY to exercise owner scoping as defense in depth; nothing here
 * changes the committed migrations.
 */
const url = testDatabaseUrl();

const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  customerName: "Acme Design",
  customerEmail: "billing@acme.example",
  currency: "USD",
  lineItems: [{ description: "Logo concept", quantity: "2", unitPrice: "250.00" }],
  dueDate: "2030-12-01",
  taxPercent: null,
  discount: null,
  ...over,
});

describe.skipIf(!url)("PostgresInvoiceListStore (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let drafts: PostgresInvoiceDraftStore;
  let list: PostgresInvoiceListStore;
  let A: string;
  let B: string;
  let n = 0;
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;

  const addOperator = async (name: string) =>
    (
      await sql(
        `INSERT INTO operators (username, password_hash) VALUES ($1, 'scrypt$test') RETURNING id`,
        [name],
      )
    )[0].id as string;
  const save = async (operatorId: string, d: InvoiceDraft = draft()) => {
    const r = await drafts.save({
      draft: d,
      operatorId,
      idempotencyKey: `k-${String(++n).padStart(10, "0")}`,
    });
    if (r.outcome !== "created") throw new Error("expected created");
    return r.saved.id;
  };
  const stamp = (id: string, iso: string) =>
    sql("UPDATE invoices SET created_at = $2::timestamptz WHERE id = $1", [id, iso]);
  const op = (invoiceId: string, state: string, by: string) =>
    sql(
      `INSERT INTO paypal_draft_operations (invoice_id, created_by, state, invoice_number, payload_digest, paypal_invoice_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        invoiceId,
        by,
        state,
        `NMI-${String(++n).padStart(20, "0")}`,
        "a".repeat(64),
        state === "created" ? `INV2-${n}` : null,
      ],
    );
  const q = (operatorId: string, extra: Partial<InvoiceListQuery> = {}) =>
    list.list({ operatorId, ...extra });
  const ids = async (operatorId: string, extra: Partial<InvoiceListQuery> = {}) =>
    (await q(operatorId, { limit: 50, ...extra })).items.map((i) => i.id);
  async function allPages(
    operatorId: string,
    limit: number,
    extra: Partial<InvoiceListQuery> = {},
  ) {
    const seen: string[] = [];
    let cursor: InvoiceListQuery["cursor"];
    for (let guard = 0; guard < 100; guard++) {
      const page = await q(operatorId, { ...extra, limit, cursor });
      seen.push(...page.items.map((i) => i.id));
      if (!page.nextCursor) return seen;
      cursor = decodeCursor(encodeCursor(page.nextCursor)) ?? undefined;
      expect(cursor).toBeDefined();
    }
    throw new Error("pagination did not terminate");
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 10);
    // Test-only DDL in the scratch schema: allow a second operator to exist.
    await sql(`DROP INDEX operators_single_row_uq`);
    const db = createDb(scratch.pool);
    drafts = new PostgresInvoiceDraftStore(db);
    list = new PostgresInvoiceListStore(db);
    A = await addOperator("operator-a");
    B = await addOperator("operator-b");
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  describe("owner scoping", () => {
    it("A sees only A's invoices, B only B's, and an ownerless row is exposed to nobody", async () => {
      const a1 = await save(A, draft({ customerName: "A One" }));
      const a2 = await save(A, draft({ customerName: "A Two" }));
      const b1 = await save(B, draft({ customerName: "B One" }));
      const orphan = (
        await sql(
          `INSERT INTO invoices (customer_name, customer_email, currency, subtotal_minor, total_minor, due_date)
           VALUES ('Orphan Co', 'o@orphan.example', 'USD', 100, 100, '2030-01-01') RETURNING id`,
        )
      )[0].id as string;
      const forA = await ids(A);
      const forB = await ids(B);
      expect(forA).toEqual(expect.arrayContaining([a1, a2]));
      expect(forA).not.toContain(b1);
      expect(forA).not.toContain(orphan);
      expect(forB).toContain(b1);
      expect(forB).not.toContain(a1);
      expect(forB).not.toContain(a2);
      expect(forB).not.toContain(orphan);
      // search cannot be used to reach another owner's rows either
      expect(await ids(A, { search: "B One" })).toEqual([]);
      expect(await ids(A, { search: "Orphan" })).toEqual([]);
      expect(await ids(A, { search: b1.slice(0, 8) })).toEqual([]);
    });

    it("an operator with no invoices (or an unknown operator id) gets an empty page", async () => {
      const C = await addOperator("operator-c");
      expect(await q(C)).toEqual({ items: [], nextCursor: null });
      expect(await q("00000000-0000-4000-8000-000000000000")).toEqual({
        items: [],
        nextCursor: null,
      });
    });

    it("getOwned: other operator, ownerless and unknown ids are all null; the owner reads it", async () => {
      const mine = await save(A, draft({ customerName: "Owned Read" }));
      const orphan = (
        await sql(
          `INSERT INTO invoices (customer_name, customer_email, currency, subtotal_minor, total_minor, due_date)
           VALUES ('Orphan Two', 'o2@orphan.example', 'USD', 100, 100, '2030-01-01') RETURNING id`,
        )
      )[0].id as string;
      expect((await drafts.getOwned(mine, A))?.draft.customerName).toBe("Owned Read");
      expect(await drafts.getOwned(mine, B)).toBeNull();
      expect(await drafts.getOwned(orphan, A)).toBeNull();
      expect(await drafts.getOwned("00000000-0000-4000-8000-000000000000", A)).toBeNull();
      expect(await drafts.getOwned("not-a-uuid", A)).toBeNull();
      expect(await drafts.getOwned("' OR 1=1 --", A)).toBeNull();
    });
  });

  describe("pagination", () => {
    it("stable across rows that share the same created_at (id DESC tie-break), no skip or repeat", async () => {
      const P = await addOperator("operator-ties");
      const made: string[] = [];
      for (let i = 0; i < 7; i++) made.push(await save(P, draft({ customerName: `Tie ${i}` })));
      for (const id of made) await stamp(id, "2030-02-02T10:00:00.123456Z");
      const expected = [...made].sort().reverse(); // uuid text order DESC
      expect(await allPages(P, 3)).toEqual(expected);
      expect(await allPages(P, 1)).toEqual(expected);
      expect(await allPages(P, 7)).toEqual(expected);
    });

    it("orders by created_at DESC and keeps microsecond differences apart", async () => {
      const P = await addOperator("operator-micro");
      const x = await save(P);
      const y = await save(P);
      const z = await save(P);
      await stamp(x, "2030-03-03T10:00:00.000001Z");
      await stamp(y, "2030-03-03T10:00:00.000002Z");
      await stamp(z, "2030-03-03T10:00:00.000003Z");
      expect(await allPages(P, 1)).toEqual([z, y, x]);
      const first = await q(P, { limit: 1 });
      expect(first.nextCursor?.createdAt).toBe("2030-03-03T10:00:00.000003Z");
    });

    it("a newer insert between pages does not shift later pages; an older one is still reached once", async () => {
      const P = await addOperator("operator-concurrent");
      const seeded: string[] = [];
      for (let i = 0; i < 6; i++) {
        const id = await save(P);
        await stamp(id, `2030-04-0${i + 1}T09:00:00Z`);
        seeded.push(id);
      }
      const newestFirst = [...seeded].reverse();
      const page1 = await q(P, { limit: 2 });
      expect(page1.items.map((i) => i.id)).toEqual(newestFirst.slice(0, 2));
      const newer = await save(P);
      await stamp(newer, "2030-04-30T09:00:00Z");
      const older = await save(P);
      await stamp(older, "2030-03-30T09:00:00Z");
      const rest: string[] = [];
      let cursor = page1.nextCursor ?? undefined;
      while (cursor) {
        const p = await q(P, { limit: 2, cursor });
        rest.push(...p.items.map((i) => i.id));
        cursor = p.nextCursor ?? undefined;
      }
      expect(rest).toEqual([...newestFirst.slice(2), older]);
      expect(rest).not.toContain(newer);
      const all = [...page1.items.map((i) => i.id), ...rest];
      expect(new Set(all).size).toBe(all.length);
    });

    it("empty collection and a cursor past the end return an empty page with no cursor", async () => {
      const P = await addOperator("operator-empty");
      expect(await q(P)).toEqual({ items: [], nextCursor: null });
      const only = await save(P);
      const page = await q(P, { limit: 5 });
      expect(page.items.map((i) => i.id)).toEqual([only]);
      expect(page.nextCursor).toBeNull();
      const past = await q(P, { cursor: { createdAt: "1999-01-01T00:00:00.000000Z", id: only } });
      expect(past).toEqual({ items: [], nextCursor: null });
    });

    it("clamps the page size to 1..50 and never returns more than the limit", async () => {
      const P = await addOperator("operator-limit");
      for (let i = 0; i < 55; i++) await save(P);
      expect((await q(P, { limit: 1000 })).items).toHaveLength(LIST_MAX_LIMIT);
      expect((await q(P, { limit: 0 })).items).toHaveLength(1);
      expect((await q(P)).items).toHaveLength(20);
      expect(await allPages(P, 50)).toHaveLength(55);
    });
  });

  describe("filters and search (whole owned collection, preserved across pages)", () => {
    it("search finds a row on the LAST page, not only the first page", async () => {
      const P = await addOperator("operator-search");
      for (let i = 0; i < 30; i++) await save(P, draft({ customerName: `Filler ${i}` }));
      const needle = await save(
        P,
        draft({ customerName: "Zebra Studios", customerEmail: "z@zebra.example" }),
      );
      await stamp(needle, "2001-01-01T00:00:00Z"); // oldest: would be on page 2 of 20
      expect(await ids(P, { search: "zebra" })).toEqual([needle]);
      expect(await ids(P, { search: "ZEBRA.EXAMPLE" })).toEqual([needle]);
      expect(await ids(P, { search: needle.slice(0, 8) })).toEqual([needle]);
      expect(await ids(P, { search: needle })).toEqual([needle]);
    });

    it("LIKE wildcards are literal: % and _ do not match everything, backslash is safe", async () => {
      const P = await addOperator("operator-wild");
      const pct = await save(P, draft({ customerName: "100% Pure" }));
      const under = await save(P, draft({ customerName: "snake_case Ltd" }));
      await save(P, draft({ customerName: "Plain Name" }));
      expect(await ids(P, { search: "%" })).toEqual([pct]);
      expect(await ids(P, { search: "_" })).toEqual([under]);
      expect(await ids(P, { search: "a_c" })).toEqual([]); // not a wildcard for "a?c"
      expect(await ids(P, { search: "\\" })).toEqual([]);
      expect(await ids(P, { search: "'; DROP TABLE invoices; --" })).toEqual([]);
      expect((await sql("SELECT count(*)::int AS n FROM invoices"))[0].n).toBeGreaterThan(0);
    });

    it("currency and PayPal-status filters are exact and combine with search and paging", async () => {
      const P = await addOperator("operator-filters");
      const usd = await save(P, draft({ customerName: "Mix USD" }));
      const eur = await save(P, draft({ customerName: "Mix EUR", currency: "EUR" }));
      const jpy = await save(
        P,
        draft({
          customerName: "Mix JPY",
          currency: "JPY",
          lineItems: [{ description: "x", quantity: "1", unitPrice: "5000" }],
        }),
      );
      await op(eur, "created", P);
      await op(jpy, "creating", P);
      expect(await ids(P, { currency: "EUR" })).toEqual([eur]);
      expect(await ids(P, { currency: "JPY" })).toEqual([jpy]);
      expect(await ids(P, { status: "none" })).toEqual([usd]);
      expect(await ids(P, { status: "created" })).toEqual([eur]);
      expect(await ids(P, { status: "progress" })).toEqual([jpy]);
      expect(await ids(P, { status: "attention" })).toEqual([]);
      expect(await ids(P, { currency: "EUR", status: "created", search: "mix" })).toEqual([eur]);
      expect(await ids(P, { currency: "USD", status: "created" })).toEqual([]);
      expect(await allPages(P, 1, { search: "mix" })).toHaveLength(3);
      expect(await allPages(P, 1, { currency: "EUR" })).toEqual([eur]);
    });

    it("every durable operation state is reported, 'none' only when no operation row exists", async () => {
      const P = await addOperator("operator-states");
      const states = ["pending", "creating", "created", "unknown", "rejected", "mismatch"] as const;
      const made: Record<string, string> = {};
      for (const s of states) {
        made[s] = await save(P, draft({ customerName: `State ${s}` }));
        await op(made[s] as string, s, P);
      }
      const none = await save(P, draft({ customerName: "State none" }));
      const items = (await q(P, { limit: 50 })).items;
      for (const s of states) expect(items.find((i) => i.id === made[s])?.paypalState).toBe(s);
      expect(items.find((i) => i.id === none)?.paypalState).toBe("none");
      expect(await ids(P, { status: "attention" })).toEqual(
        expect.arrayContaining([made["unknown"], made["rejected"], made["mismatch"]]),
      );
      expect((await ids(P, { status: "attention" })).length).toBe(3);
      expect((await ids(P, { status: "progress" })).length).toBe(2);
    });

    it("a locally saved invoice is never reported as a PayPal draft (no invoices.paypal_invoice_id inference)", async () => {
      const P = await addOperator("operator-nopp");
      const id = await save(P);
      await sql("UPDATE invoices SET paypal_invoice_id = 'INV2-STRAY-ID' WHERE id = $1", [id]);
      expect((await q(P)).items[0]?.paypalState).toBe("none");
    });
  });

  describe("exact money and one currency per row", () => {
    it("totals are exact decimal strings in the invoice's own currency and equal the server calculation", async () => {
      const P = await addOperator("operator-money");
      const cases: InvoiceDraft[] = [
        draft({
          lineItems: [{ description: "r", quantity: "1.5", unitPrice: "0.33" }],
          taxPercent: "8.25",
        }),
        draft({
          currency: "JPY",
          lineItems: [{ description: "y", quantity: "2", unitPrice: "1000" }],
          taxPercent: "10",
        }),
        draft({
          currency: "GBP",
          lineItems: [{ description: "g", quantity: "3", unitPrice: "33.33" }],
          discount: { kind: "percent", value: "10" },
        }),
        draft({
          currency: "EUR",
          lineItems: [{ description: "e", quantity: "1", unitPrice: "999999999999.99" }],
        }),
      ];
      const made = new Map<string, InvoiceDraft>();
      for (const d of cases) made.set(await save(P, d), d);
      for (const item of (await q(P, { limit: 50 })).items) {
        const d = made.get(item.id) as InvoiceDraft;
        expect(item.currency).toBe(d.currency);
        expect(item.total).toBe(calculateTotals(d).total);
        expect(item.total).toMatch(d.currency === "JPY" ? /^\d+$/ : /^\d+\.\d{2}$/);
      }
    });

    it("returns only dashboard fields (no line items, digests, idempotency keys or owner ids)", async () => {
      const P = await addOperator("operator-fields");
      await save(P);
      const item = (await q(P)).items[0] as unknown as Record<string, unknown>;
      expect(Object.keys(item).sort()).toEqual(
        [
          "createdAt",
          "currency",
          "customerEmail",
          "customerName",
          "dueDate",
          "id",
          "paypalState",
          "total",
        ].sort(),
      );
    });
  });

  describe("read-only", () => {
    it("listing mutates nothing", async () => {
      const before = await sql(
        "SELECT (SELECT count(*)::int FROM invoices) a, (SELECT count(*)::int FROM invoice_items) b, (SELECT count(*)::int FROM paypal_draft_operations) c, (SELECT count(*)::int FROM audit_log) d, (SELECT max(created_at)::text FROM invoices) e",
      );
      await q(A);
      await q(B, { search: "x", status: "none", currency: "USD" });
      const after = await sql(
        "SELECT (SELECT count(*)::int FROM invoices) a, (SELECT count(*)::int FROM invoice_items) b, (SELECT count(*)::int FROM paypal_draft_operations) c, (SELECT count(*)::int FROM audit_log) d, (SELECT max(created_at)::text FROM invoices) e",
      );
      expect(after).toEqual(before);
    });
  });
});

describe("cursor codec", () => {
  const id = "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11";
  const ok = { createdAt: "2030-01-02T03:04:05.123456Z", id };
  it("round-trips a canonical cursor", () => {
    expect(decodeCursor(encodeCursor(ok))).toEqual(ok);
  });
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
  it.each<[string, string]>([
    ["empty", ""],
    ["not base64url", "!!!"],
    ["not json", Buffer.from("nope").toString("base64url")],
    ["wrong shape", enc({ createdAt: ok.createdAt, id })],
    ["too many members", enc([ok.createdAt, id, 1])],
    ["non-string parts", enc([1, 2])],
    ["bad uuid", enc([ok.createdAt, "not-a-uuid"])],
    ["millisecond precision only", enc(["2030-01-02T03:04:05.123Z", id])],
    ["impossible date (Feb 31)", enc(["2030-02-31T03:04:05.123456Z", id])],
    ["non-leap Feb 29", enc(["2031-02-29T03:04:05.123456Z", id])],
    ["hour 24", enc(["2030-01-02T24:00:00.000000Z", id])],
    ["offset instead of Z", enc(["2030-01-02T03:04:05.123456+00:00", id])],
    ["SQL in the timestamp", enc(["2030-01-02T03:04:05.123456Z'; DROP TABLE invoices;--", id])],
    ["uppercase uuid (non-canonical)", enc([ok.createdAt, id.toUpperCase()])],
    ["oversized", "A".repeat(121)],
  ])("rejects %s", (_n, raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });
  it("accepts a leap-day instant", () => {
    const c = { createdAt: "2032-02-29T23:59:59.999999Z", id };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
});
