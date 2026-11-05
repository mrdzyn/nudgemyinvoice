import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InvoiceDraft } from "@nmi/shared";
import { createDb } from "./client.js";
import { PostgresInvoiceDraftStore } from "./invoice-draft-store.js";
import { PostgresNudgeStore, type NudgeCreateInput } from "./nudge-store.js";
import {
  createScratchDatabase,
  testDatabaseUrl,
  type ScratchDatabase,
} from "./testing/pg-scratch.js";

/**
 * Objective (NMI-P6): AI nudges are operator-isolated, at most one pending per invoice, every transition is
 * bound to the reviewed version, the AI original is immutable, counts are exact, and nothing is deleted.
 * The production single-operator index is dropped ONLY in this scratch schema to exercise isolation.
 */
const url = testDatabaseUrl();

const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  customerName: "Synthetic Client",
  customerEmail: "billing@client.example",
  currency: "USD",
  lineItems: [{ description: "Design work", quantity: "2", unitPrice: "600.00" }],
  dueDate: "2026-10-30",
  taxPercent: null,
  discount: null,
  ...over,
});
const input = (over: Partial<NudgeCreateInput> = {}): NudgeCreateInput => ({
  tone: "professional",
  message:
    "Hi Synthetic Client, a reminder that invoice abc for USD 1,200.00 was due on October 30, 2026.",
  rationale: "Courteous and concise because the invoice is a little overdue.",
  facts: {
    currency: "USD",
    amount: "USD 1,200.00",
    dueDate: "2026-10-30",
    daysPastDue: 6,
    asOfDate: "2026-11-05",
    timeZone: "Asia/Manila",
    invoiceRef: "abc",
  },
  model: "fake-model",
  promptVersion: "p6-nudge-v1",
  ...over,
});

describe.skipIf(!url)("PostgresNudgeStore (real PostgreSQL)", () => {
  let scratch: ScratchDatabase;
  let store: PostgresNudgeStore;
  let drafts: PostgresInvoiceDraftStore;
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
  const created = async (op: string, inv: string, over: Partial<NudgeCreateInput> = {}) => {
    const r = await store.create(op, inv, input(over), null);
    if (!r.ok) throw new Error(r.reason);
    return r.value;
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase(url as string, 6);
    await sql("DROP INDEX operators_single_row_uq");
    const db = createDb(scratch.pool);
    store = new PostgresNudgeStore(db);
    drafts = new PostgresInvoiceDraftStore(db);
    A = await addOperator("nudge-a");
    B = await addOperator("nudge-b");
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  it("returns verified invoice facts only for the owner", async () => {
    const inv = await save(A);
    const ctx = await store.invoiceContext(A, inv);
    expect(ctx).toMatchObject({
      id: inv,
      customerName: "Synthetic Client",
      currency: "USD",
      total: "1200.00",
      dueDate: "2026-10-30",
      repeat: false,
      pending: null,
    });
    expect(await store.invoiceContext(B, inv)).toBeNull();
  });

  it("creates a pending draft whose AI original equals the message; another operator cannot see or touch it", async () => {
    const inv = await save(A);
    const nd = await created(A, inv);
    expect(nd).toMatchObject({
      status: "pending_review",
      version: 1,
      edited: false,
      tone: "professional",
    });
    expect(nd.aiMessage).toBe(nd.message);
    expect(await store.get(B, nd.id)).toBeNull();
    expect(await store.list(B, "pending")).toEqual([]);
    expect(await store.create(B, inv, input(), null)).toEqual({ ok: false, reason: "not_found" });
    for (const t of [
      store.approve(B, nd.id, 1),
      store.reject(B, nd.id, 1),
      store.edit(B, nd.id, 1, "x".repeat(20)),
    ])
      expect(await t).toEqual({ ok: false, reason: "not_found" });
  });

  it("allows at most one pending draft per invoice; replacing requires the exact pending id + version", async () => {
    const inv = await save(A);
    const first = await created(A, inv);
    expect(await store.create(A, inv, input(), null)).toEqual({
      ok: false,
      reason: "pending_exists",
    });
    expect(await store.create(A, inv, input(), { id: first.id, version: 99 })).toEqual({
      ok: false,
      reason: "version_conflict",
    });
    const second = await store.create(A, inv, input({ tone: "firm" }), {
      id: first.id,
      version: first.version,
    });
    expect(second.ok).toBe(true);
    const old = await store.get(A, first.id);
    expect(old).toMatchObject({ status: "superseded", version: 2 });
    expect(old?.supersededAt).not.toBeNull();
    expect((await store.invoiceContext(A, inv))?.pending?.id).toBe(
      second.ok ? second.value.id : "",
    );
  });

  it("edit keeps the AI original, flags the edit and bumps the version; stale versions are refused", async () => {
    const inv = await save(A);
    const nd = await created(A, inv);
    const e = await store.edit(
      A,
      nd.id,
      1,
      "Edited by the operator: please let me know when payment is on its way.",
    );
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.value).toMatchObject({ version: 2, edited: true, status: "pending_review" });
    expect(e.value.aiMessage).toBe(nd.aiMessage);
    expect(await store.approve(A, nd.id, 1)).toEqual({ ok: false, reason: "version_conflict" });
    const back = await store.edit(A, nd.id, 2, nd.aiMessage);
    expect(back.ok && back.value.edited).toBe(false);
  });

  it("approve and reject are one-way and version-bound; a closed draft cannot change", async () => {
    const i1 = await save(A);
    const i2 = await save(A);
    const a = await created(A, i1);
    const r = await created(A, i2);
    const ap = await store.approve(A, a.id, 1);
    expect(ap.ok && ap.value.status).toBe("approved");
    expect(ap.ok && ap.value.approvedAt).not.toBeNull();
    const rj = await store.reject(A, r.id, 1);
    expect(rj.ok && rj.value.status).toBe("rejected");
    for (const t of [
      store.approve(A, a.id, 2),
      store.reject(A, a.id, 2),
      store.edit(A, a.id, 2, "x".repeat(30)),
      store.approve(A, r.id, 2),
    ])
      expect(await t).toEqual({ ok: false, reason: "not_pending" });
    expect((await store.invoiceContext(A, i1))?.repeat).toBe(true);
  });

  it("counts and views are exact and operator-scoped", async () => {
    const C = await addOperator("nudge-c");
    const inv = [await save(C), await save(C), await save(C), await save(C)];
    const p = await created(C, inv[0] as string);
    const a = await created(C, inv[1] as string);
    const r = await created(C, inv[2] as string);
    const s1 = await created(C, inv[3] as string);
    await store.approve(C, a.id, 1);
    await store.reject(C, r.id, 1);
    await store.create(C, inv[3] as string, input(), { id: s1.id, version: 1 });
    expect(await store.summary(C)).toEqual({
      pending: 2,
      approved: 1,
      rejected: 1,
      superseded: 1,
      total: 5,
    });
    expect((await store.list(C, "pending")).map((x) => x.invoiceId).sort()).toEqual(
      [inv[0], inv[3]].sort(),
    );
    expect((await store.list(C, "approved")).map((x) => x.id)).toEqual([a.id]);
    expect((await store.list(C, "history")).map((x) => x.status).sort()).toEqual([
      "rejected",
      "superseded",
    ]);
    expect((await store.list(C, "pending", { invoiceId: inv[0] as string }))[0]?.id).toBe(p.id);
    expect((await store.list(C, "pending"))[0]?.invoice).toMatchObject({
      customerName: "Synthetic Client",
      currency: "USD",
      total: "1200.00",
    });
    expect((await store.summary(B)).total).toBe(0);
  });

  it("database constraints reject impossible states and unknown tones", async () => {
    const inv = await save(A);
    const base = `INSERT INTO invoice_nudges (invoice_id, operator_id, tone, status, message, ai_message, rationale, facts, model, prompt_version, approved_at)
                  VALUES ($1, $2, $3, $4, 'm', 'm', 'r', '{}'::jsonb, 'x', 'v', $5)`;
    await expect(sql(base, [inv, A, "rude", "pending_review", null])).rejects.toThrow(
      /invoice_nudges_tone_chk/,
    );
    await expect(sql(base, [inv, A, "firm", "sent", null])).rejects.toThrow(
      /invoice_nudges_status_chk/,
    );
    await expect(sql(base, [inv, A, "firm", "approved", null])).rejects.toThrow(
      /invoice_nudges_closed_at_chk/,
    );
    await expect(sql(base, [inv, A, "firm", "pending_review", new Date()])).rejects.toThrow(
      /invoice_nudges_closed_at_chk/,
    );
    await expect(
      sql(
        `INSERT INTO invoice_nudges (invoice_id, operator_id, tone, message, ai_message, rationale, facts, model, prompt_version) VALUES ($1,$2,'firm',$3,'m','r','{}'::jsonb,'x','v')`,
        [inv, A, "x".repeat(2001)],
      ),
    ).rejects.toThrow(/invoice_nudges_message_len/);
  });
});
