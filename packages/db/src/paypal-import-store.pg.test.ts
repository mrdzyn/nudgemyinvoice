import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { PostgresPayPalImportStore } from "./paypal-import-store.js";
import {
  createScratchDatabase,
  testDatabaseUrl,
  type ScratchDatabase,
} from "./testing/pg-scratch.js";

/**
 * CON-01 follow-up. Objective: the imported-draft upsert is atomic, idempotent and
 * owner-safe under concurrency — no SELECT-then-act race, no unique-violation failure on
 * concurrent inserts, and every write carries an owner predicate so one operator can never
 * modify another operator's row. Real PostgreSQL 16, disposable database only.
 */
const url = testDatabaseUrl();

describe.skipIf(!url)("PostgresPayPalImportStore upsert (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let store: PostgresPayPalImportStore;
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;
  let A = "";
  let B = "";

  const input = (over: Record<string, unknown> = {}) => ({
    operatorId: A,
    remoteInvoiceId: "INV2-STORE-1",
    invoiceNumber: "s1",
    currency: "USD" as const,
    totalMinor: 1000n,
    dueDate: "2026-12-01",
    linkedInvoiceId: null,
    ...over,
  });
  const row = async (remoteInvoiceId: string) =>
    (
      await sql(
        `SELECT operator_id AS op, total_minor::text AS total FROM paypal_imported_drafts WHERE remote_invoice_id = $1`,
        [remoteInvoiceId],
      )
    )[0] as { op: string; total: string } | undefined;

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 6);
    store = new PostgresPayPalImportStore(createDb(scratch.pool));
    await sql("DROP INDEX operators_single_row_uq"); // test-only: two operators, one scratch schema
    A = (
      await sql(
        `INSERT INTO operators (username, password_hash) VALUES ('store-a', 'scrypt$test') RETURNING id`,
      )
    )[0].id as string;
    B = (
      await sql(
        `INSERT INTO operators (username, password_hash) VALUES ('store-b', 'scrypt$test') RETURNING id`,
      )
    )[0].id as string;
  });

  afterAll(async () => {
    await scratch?.drop().catch(() => undefined);
  });

  it("concurrent duplicate upserts never fail: exactly one created, rest unchanged", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => store.upsert(input({ remoteInvoiceId: "INV2-RACE-1" }))),
    );
    const outcomes = results.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(["created", "unchanged", "unchanged", "unchanged"]);
    expect(await store.countByOperator(A)).toBe(1);
  });

  it("same-owner value changes report updated, repeats report unchanged", async () => {
    expect((await store.upsert(input({ remoteInvoiceId: "INV2-CHG-1" }))).outcome).toBe("created");
    const changed = await store.upsert(input({ remoteInvoiceId: "INV2-CHG-1", totalMinor: 2000n }));
    expect(changed.outcome).toBe("updated");
    expect(changed.outcome === "updated" ? changed.draft.totalMinor : null).toBe("2000");
    expect(
      (await store.upsert(input({ remoteInvoiceId: "INV2-CHG-1", totalMinor: 2000n }))).outcome,
    ).toBe("unchanged");
  });

  it("null and value transitions are real changes (IS DISTINCT FROM, not =)", async () => {
    expect(
      (await store.upsert(input({ remoteInvoiceId: "INV2-NV-1", invoiceNumber: null }))).outcome,
    ).toBe("created");
    expect(
      (await store.upsert(input({ remoteInvoiceId: "INV2-NV-1", invoiceNumber: "7" }))).outcome,
    ).toBe("updated");
    expect(
      (await store.upsert(input({ remoteInvoiceId: "INV2-NV-1", invoiceNumber: null }))).outcome,
    ).toBe("updated");
  });

  it("a second operator cannot read-modify-write the first row: conflict, values intact", async () => {
    expect((await store.upsert(input({ remoteInvoiceId: "INV2-OWN-1" }))).outcome).toBe("created");
    expect(
      (
        await store.upsert(
          input({ remoteInvoiceId: "INV2-OWN-1", operatorId: B, totalMinor: 9999n }),
        )
      ).outcome,
    ).toBe("owner_conflict");
    expect(await row("INV2-OWN-1")).toMatchObject({ op: A, total: "1000" });
    expect(await store.countByOperator(B)).toBe(0);
  });
});
