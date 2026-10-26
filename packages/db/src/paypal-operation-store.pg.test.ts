import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { PostgresInvoiceDraftStore } from "./invoice-draft-store.js";
import { PostgresPayPalOperationStore } from "./paypal-operation-store.js";
import {
  createScratchDatabase,
  testDatabaseUrl,
  type ScratchDatabase,
} from "./testing/pg-scratch.js";

/** The durable "at most one PayPal draft per invoice" state machine, with concurrent real connections. */
const url = testDatabaseUrl();
const DIGEST = "c".repeat(64);

describe.skipIf(!url)("PostgresPayPalOperationStore (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let ops: PostgresPayPalOperationStore;
  let drafts: PostgresInvoiceDraftStore;
  let operatorId: string;
  let n = 0;
  const sql = async (q: string, p: unknown[] = []) => (await scratch.pool.query(q, p)).rows;

  async function newInvoice(): Promise<{ invoiceId: string; invoiceNumber: string }> {
    const res = await drafts.save({
      draft: {
        customerName: "Acme",
        customerEmail: "a@example.com",
        currency: "USD",
        lineItems: [{ description: "x", quantity: "1", unitPrice: "10.00" }],
        dueDate: "2026-12-01",
        taxPercent: null,
        discount: null,
      },
      operatorId,
    });
    if (res.outcome !== "created") throw new Error("expected created");
    const hex = (++n).toString(16).padStart(20, "0");
    return { invoiceId: res.saved.id, invoiceNumber: `NMI-${hex}` };
  }
  const reserve = async (invoiceDate: string | null = "2026-10-25") => {
    const inv = await newInvoice();
    const op = await ops.reserve({ ...inv, operatorId, payloadDigest: DIGEST, invoiceDate });
    return { ...inv, op };
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 25);
    const db = createDb(scratch.pool);
    ops = new PostgresPayPalOperationStore(db);
    drafts = new PostgresInvoiceDraftStore(db);
    operatorId = (
      await sql(
        "INSERT INTO operators (username, password_hash) VALUES ('demo-operator', 'scrypt$1$8$1$c2FsdHNhbHQ$aGFzaA') RETURNING id",
      )
    )[0].id as string;
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  it("reserve is idempotent: one row per invoice, stable request id and invoice number", async () => {
    const { invoiceId, invoiceNumber, op } = await reserve();
    const again = await ops.reserve({
      invoiceId,
      invoiceNumber,
      operatorId,
      payloadDigest: DIGEST,
      invoiceDate: "2026-10-25",
    });
    expect(again.id).toBe(op.id);
    expect(again.requestId).toBe(op.requestId);
    expect(op.invoiceDate).toBe("2026-10-25");
    expect(again.invoiceDate).toBe("2026-10-25");
    expect(op.state).toBe("pending");
    expect(
      (
        await sql("SELECT count(*)::int n FROM paypal_draft_operations WHERE invoice_id=$1", [
          invoiceId,
        ])
      )[0].n,
    ).toBe(1);
  });

  it("20 simultaneous claimers: exactly one wins the claim", async () => {
    const { invoiceId } = await reserve();
    const results = await Promise.all(Array.from({ length: 20 }, () => ops.claim(invoiceId, 120)));
    const winners = results.filter((r) => r.claimed);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.claimed && winners[0].mode).toBe("create");
    expect(winners[0]?.claimed && winners[0].op.attempts).toBe(1);
    for (const r of results) if (!r.claimed) expect(r.op.state).toBe("creating");
  });

  it("only the fenced holder can record the outcome, and creation links the invoice atomically", async () => {
    const { invoiceId } = await reserve();
    const c = await ops.claim(invoiceId, 120);
    if (!c.claimed) throw new Error("expected claim");
    expect(await ops.markCreated(invoiceId, c.op.attempts + 1, "INV2-WRONGFENCE")).toBe(false);
    expect(await ops.markCreated(invoiceId, c.op.attempts, "INV2-AAA-111")).toBe(true);
    expect(await ops.markCreated(invoiceId, c.op.attempts, "INV2-AAA-111")).toBe(false); // already finished
    const op = await ops.get(invoiceId);
    expect(op).toMatchObject({ state: "created", paypalInvoiceId: "INV2-AAA-111" });
    expect(
      (await sql("SELECT paypal_invoice_id p FROM invoices WHERE id=$1", [invoiceId]))[0].p,
    ).toBe("INV2-AAA-111");
    // a finished operation can never be claimed again
    expect((await ops.claim(invoiceId, 120)).claimed).toBe(false);
  });

  it("a remote id can be linked to only one invoice; the failed link rolls the operation back", async () => {
    const a = await reserve();
    const b = await reserve();
    const ca = await ops.claim(a.invoiceId, 120);
    const cb = await ops.claim(b.invoiceId, 120);
    if (!ca.claimed || !cb.claimed) throw new Error("expected claims");
    expect(await ops.markCreated(a.invoiceId, ca.op.attempts, "INV2-SHARED")).toBe(true);
    await expect(ops.markCreated(b.invoiceId, cb.op.attempts, "INV2-SHARED")).rejects.toBeDefined();
    const op = await ops.get(b.invoiceId);
    expect(op).toMatchObject({ state: "creating", paypalInvoiceId: null }); // nothing half-applied
  });

  it("rejected -> claimable again for a fresh create with a new fence; the old fence is dead", async () => {
    const { invoiceId } = await reserve();
    const first = await ops.claim(invoiceId, 120);
    if (!first.claimed) throw new Error("expected claim");
    expect(await ops.markRejected(invoiceId, first.op.attempts, "http_422")).toBe(true);
    expect((await ops.get(invoiceId))?.state).toBe("rejected");
    const second = await ops.claim(invoiceId, 120);
    expect(second.claimed && second.mode).toBe("create");
    expect(second.claimed && second.op.attempts).toBe(2);
    expect(await ops.markUnknown(invoiceId, first.op.attempts, "stale")).toBe(false);
  });

  it("unknown -> claimed for RECONCILE (never a blind create), with the time since the last create attempt", async () => {
    const { invoiceId } = await reserve();
    const first = await ops.claim(invoiceId, 120);
    if (!first.claimed) throw new Error("expected claim");
    expect(await ops.markCreateAttempt(invoiceId, first.op.attempts)).toBe(true);
    expect(await ops.markUnknown(invoiceId, first.op.attempts, "timeout")).toBe(true);
    const next = await ops.claim(invoiceId, 120);
    expect(next.claimed && next.mode).toBe("reconcile");
    expect(next.claimed && next.secondsSinceCreateAttempt).not.toBeNull();
    expect(next.claimed && (next.secondsSinceCreateAttempt as number)).toBeGreaterThanOrEqual(0);
  });

  it("a stale 'creating' lease is taken over as RECONCILE, and the stale holder is fenced out", async () => {
    const { invoiceId } = await reserve();
    const stale = await ops.claim(invoiceId, 120);
    if (!stale.claimed) throw new Error("expected claim");
    expect((await ops.claim(invoiceId, 120)).claimed).toBe(false); // lease still valid
    await sql(
      "UPDATE paypal_draft_operations SET claimed_at = now() - interval '10 minutes' WHERE invoice_id=$1",
      [invoiceId],
    );
    const takeover = await ops.claim(invoiceId, 120);
    expect(takeover.claimed && takeover.mode).toBe("reconcile");
    // the crashed/slow original request wakes up late and tries to record a result
    expect(await ops.markCreated(invoiceId, stale.op.attempts, "INV2-LATE")).toBe(false);
    expect(await ops.markRejected(invoiceId, stale.op.attempts, "late")).toBe(false);
    expect((await ops.get(invoiceId))?.paypalInvoiceId).toBeNull();
  });

  it("mismatch keeps the remote id for traceability and is terminal (no further claims)", async () => {
    const { invoiceId } = await reserve();
    const c = await ops.claim(invoiceId, 120);
    if (!c.claimed) throw new Error("expected claim");
    expect(await ops.markMismatch(invoiceId, c.op.attempts, "INV2-MISMATCH", "total_differs")).toBe(
      true,
    );
    expect(await ops.get(invoiceId)).toMatchObject({
      state: "mismatch",
      paypalInvoiceId: "INV2-MISMATCH",
      lastErrorCode: "total_differs",
    });
    expect((await ops.claim(invoiceId, 120)).claimed).toBe(false);
    expect(
      (await sql("SELECT paypal_invoice_id p FROM invoices WHERE id=$1", [invoiceId]))[0].p,
    ).toBeNull();
  });

  it("claim on an invoice with no reservation fails loudly", async () => {
    await expect(ops.claim("00000000-0000-4000-8000-000000000000", 120)).rejects.toBeDefined();
  });
});
