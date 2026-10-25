import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENCY_CODES } from "@nmi/shared";
import { PRIVILEGED_ACTIONS, payloadDigest } from "@nmi/domain";
import { applyMigrations, testDatabaseUrl } from "./testing/pg-scratch.js";

/**
 * Real PostgreSQL constraint tests. They run ONLY when TEST_DATABASE_URL points at a disposable
 * database whose name starts with "nmi_test"; otherwise they are skipped (and reported as skipped,
 * never as passed). Each run applies the committed migrations, in journal order, into a fresh
 * schema that is dropped afterwards. Nothing persistent is touched or reset.
 */
const url = testDatabaseUrl();

describe.skipIf(!url)("PostgreSQL constraints (real database)", () => {
  const schema = `t_${randomBytes(6).toString("hex")}`;
  let client: pg.Client;

  /** Expect an insert to fail with a CHECK violation naming `constraint`. */
  async function expectCheckViolation(
    sql: string,
    params: unknown[],
    constraint: string | string[],
  ) {
    await client.query("SAVEPOINT s");
    try {
      await client.query(sql, params);
      throw new Error("insert unexpectedly succeeded");
    } catch (e) {
      const err = e as { code?: string; constraint?: string; message: string };
      expect(err.code, err.message).toBe("23514");
      expect([constraint].flat()).toContain(err.constraint);
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT s");
    }
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await applyMigrations(client, schema);
    await client.query("BEGIN"); // every test runs inside one transaction that is rolled back
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  });

  const insertInvoice = `INSERT INTO invoices
    (customer_name, customer_email, currency, subtotal_minor, discount_minor, tax_minor, total_minor, due_date,
     tax_bps, discount_kind)
    VALUES ('A','a@example.com',$1,$2,$3,$4,$5,'2026-11-01',
     CASE WHEN $4::bigint <> 0 THEN 1000 END, CASE WHEN $3::bigint <> 0 THEN 'amount' END)`;

  it("has every named constraint installed", async () => {
    const r = await client.query(
      `SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = $1 AND contype = 'c'`,
      [schema],
    );
    expect(r.rows.map((x: { conname: string }) => x.conname).sort()).toEqual(
      [
        "invoices_subtotal_nonneg",
        "invoices_discount_nonneg",
        "invoices_tax_nonneg",
        "invoices_total_nonneg",
        "invoices_discount_le_subtotal",
        "invoices_total_consistent",
        "invoices_currency_supported",
        "invoices_status_chk",
        "invoice_items_quantity_positive",
        "invoice_items_unit_price_nonneg",
        "approvals_action_allowed",
        "approvals_payload_digest_sha256_hex",
        "approvals_approver_nonempty",
        "approvals_expiry_after_creation",
        "approvals_consumed_not_before_creation",
        "operators_username_format",
        "operators_password_hash_scheme",
        "operators_credential_version_positive",
        "sessions_token_hash_hex",
        "sessions_expiry_after_creation",
        "invoices_draft_digest_hex",
        "invoices_idempotency_key_format",
        "invoices_tax_bps_range",
        "invoices_tax_requires_rate",
        "invoices_discount_shape",
        "invoices_customer_fields_bounded",
        "invoice_items_position_nonneg",
        "invoice_items_description_bounded",
        "paypal_draft_operations_state_allowed",
        "paypal_draft_operations_created_has_remote",
        "paypal_draft_operations_remote_only_when_known",
        "paypal_draft_operations_attempts_nonneg",
        "paypal_draft_operations_number_format",
        "paypal_draft_operations_digest_hex",
        "paypal_draft_operations_error_code_token",
        "audit_log_outcome_allowed",
      ].sort(),
    );
  });

  describe("invoices", () => {
    it("accepts a consistent invoice in every supported currency", async () => {
      for (const c of CURRENCY_CODES) {
        await client.query("SAVEPOINT ok");
        await client.query(insertInvoice, [c, 1000, 100, 90, 990]);
        await client.query("ROLLBACK TO SAVEPOINT ok");
      }
    });

    it.each([
      [
        "negative subtotal",
        ["USD", -1, 0, 0, -1],
        ["invoices_subtotal_nonneg", "invoices_discount_le_subtotal"],
      ],
      ["negative discount", ["USD", 100, -1, 0, 101], "invoices_discount_nonneg"],
      ["negative tax", ["USD", 100, 0, -1, 99], "invoices_tax_nonneg"],
      [
        "negative total",
        ["USD", 0, 0, 0, -5],
        ["invoices_total_nonneg", "invoices_total_consistent"],
      ],
      [
        "discount above subtotal",
        ["USD", 100, 101, 0, -1],
        ["invoices_discount_le_subtotal", "invoices_total_nonneg"],
      ],
      ["inconsistent total", ["USD", 1000, 100, 90, 1000], "invoices_total_consistent"],
      ["unsupported currency", ["XYZ", 100, 0, 0, 100], "invoices_currency_supported"],
      ["lowercase currency", ["usd", 100, 0, 0, 100], "invoices_currency_supported"],
    ])("rejects %s", async (_n, params, constraint) => {
      await expectCheckViolation(insertInvoice, params, constraint);
    });
  });

  describe("invoice_items", () => {
    let invoiceId: string;
    beforeAll(async () => {
      const r = await client.query(`${insertInvoice} RETURNING id`, ["USD", 100, 0, 0, 100]);
      invoiceId = r.rows[0].id as string;
    });
    const insertItem = `INSERT INTO invoice_items (invoice_id, position, description, quantity_hundredths, unit_price_minor)
       VALUES ($1, (SELECT count(*) FROM invoice_items WHERE invoice_id = $1), 'x', $2, $3)`;

    it("accepts positive quantity and zero or positive price", async () => {
      await client.query(insertItem, [invoiceId, 150, 0]);
      await client.query(insertItem, [invoiceId, 1, 2500]);
    });
    it("rejects zero and negative quantity", async () => {
      await expectCheckViolation(
        insertItem,
        [invoiceId, 0, 100],
        "invoice_items_quantity_positive",
      );
      await expectCheckViolation(
        insertItem,
        [invoiceId, -100, 100],
        "invoice_items_quantity_positive",
      );
    });
    it("rejects negative unit price", async () => {
      await expectCheckViolation(
        insertItem,
        [invoiceId, 100, -1],
        "invoice_items_unit_price_nonneg",
      );
    });
  });

  describe("approvals", () => {
    const insertApproval = `INSERT INTO approvals (action, resource_id, payload_digest, approver_id, expires_at)
      VALUES ($1,'INV-1',$2, $3, now() + interval '10 minutes')`;
    const digest = payloadDigest({ invoiceId: "INV-1" });

    it("accepts every privileged action name with a sha-256 hex digest", async () => {
      for (const a of PRIVILEGED_ACTIONS) {
        await client.query("SAVEPOINT ok");
        await client.query(insertApproval, [a, digest, "human-1"]);
        await client.query("ROLLBACK TO SAVEPOINT ok");
      }
    });
    it("rejects an unknown action name", async () => {
      await expectCheckViolation(
        insertApproval,
        ["autoApprove", digest, "h"],
        "approvals_action_allowed",
      );
      await expectCheckViolation(
        insertApproval,
        ["SENDINVOICE", digest, "h"],
        "approvals_action_allowed",
      );
    });
    it.each([
      ["too short", "abc123"],
      ["uppercase hex", digest.toUpperCase()],
      ["non-hex", "z".repeat(64)],
      ["65 chars", `${digest}0`],
      ["empty", ""],
    ])("rejects a malformed digest (%s)", async (_n, bad) => {
      await expectCheckViolation(
        insertApproval,
        ["sendInvoice", bad, "h"],
        "approvals_payload_digest_sha256_hex",
      );
    });
    it("rejects an empty approver", async () => {
      await expectCheckViolation(
        insertApproval,
        ["sendInvoice", digest, ""],
        "approvals_approver_nonempty",
      );
    });
    it("rejects an expiry not after creation and a consume time before creation", async () => {
      await expectCheckViolation(
        `INSERT INTO approvals (action, resource_id, payload_digest, approver_id, expires_at, created_at)
         VALUES ('sendInvoice','r',$1,'h', now() - interval '1 minute', now())`,
        [digest],
        "approvals_expiry_after_creation",
      );
      await expectCheckViolation(
        `INSERT INTO approvals (action, resource_id, payload_digest, approver_id, expires_at, consumed_at)
         VALUES ('sendInvoice','r',$1,'h', now() + interval '1 hour', now() - interval '1 day')`,
        [digest],
        "approvals_consumed_not_before_creation",
      );
    });
  });

  describe("operators, sessions, audit_log", () => {
    const hash = "scrypt$16384$8$1$c2FsdA$aGFzaA";
    const insertOp = `INSERT INTO operators (username, password_hash) VALUES ($1,$2)`;
    it("accepts one well-formed operator and rejects a second row", async () => {
      await client.query(insertOp, ["demo-operator", hash]);
      await client.query("SAVEPOINT s2");
      await expect(client.query(insertOp, ["another", hash])).rejects.toMatchObject({
        code: "23505",
        constraint: "operators_single_row_uq",
      });
      await client.query("ROLLBACK TO SAVEPOINT s2");
    });
    it.each([["UPPER"], ["ab"], ["has space"], ["x".repeat(65)]])(
      "rejects malformed username %j",
      async (u) => {
        await client.query("SAVEPOINT s3");
        await expect(client.query(insertOp, [u, hash])).rejects.toMatchObject({
          code: "23514",
          constraint: "operators_username_format",
        });
        await client.query("ROLLBACK TO SAVEPOINT s3");
      },
    );
    it("rejects a plaintext-looking password hash", async () => {
      await client.query("SAVEPOINT s4");
      await expect(client.query("DELETE FROM operators")).resolves.toBeDefined();
      await expect(client.query(insertOp, ["demo-operator", "hunter2"])).rejects.toMatchObject({
        code: "23514",
        constraint: "operators_password_hash_scheme",
      });
      await client.query("ROLLBACK TO SAVEPOINT s4");
    });
    it("rejects a credential version below 1", async () => {
      await client.query("SAVEPOINT s7");
      await expect(
        client.query("UPDATE operators SET credential_version = 0"),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "operators_credential_version_positive",
      });
      await client.query("ROLLBACK TO SAVEPOINT s7");
    });
    it("rejects malformed session token hashes and non-future expiry", async () => {
      const op = (await client.query("SELECT id FROM operators LIMIT 1")).rows[0].id as string;
      const ins = `INSERT INTO sessions (operator_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`;
      await client.query("SAVEPOINT s5");
      await expect(client.query(ins, [op, "not-hex"])).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT s5");
      await client.query("SAVEPOINT s6");
      await expect(
        client.query(
          `INSERT INTO sessions (operator_id, token_hash, expires_at) VALUES ($1,$2, now() - interval '1 hour')`,
          [op, "a".repeat(64)],
        ),
      ).rejects.toMatchObject({ code: "23514", constraint: "sessions_expiry_after_creation" });
      await client.query("ROLLBACK TO SAVEPOINT s6");
    });
    it("rejects an unknown audit outcome", async () => {
      await expectCheckViolation(
        `INSERT INTO audit_log (actor, action, outcome) VALUES ('a','auth.login',$1)`,
        ["maybe"],
        "audit_log_outcome_allowed",
      );
    });
  });

  describe("invoice drafts and PayPal draft operations (NMI-P2-I2)", () => {
    const base = `INSERT INTO invoices (customer_name, customer_email, currency, subtotal_minor, discount_minor, tax_minor,
      total_minor, due_date, tax_bps, discount_kind, discount_bps, idempotency_key, draft_digest) VALUES
      ('A','a@example.com','USD',1000,$1,$2,$3,'2026-11-01',$4,$5,$6,$7,$8) RETURNING id`;
    const none = [null, null, null, null];
    it("accepts a percent discount with its basis points and a tax with its rate", async () => {
      await client.query("SAVEPOINT a1");
      await client.query(base, [100, 90, 990, 1000, "percent", 1000, null, null]);
      await client.query("ROLLBACK TO SAVEPOINT a1");
    });
    it("rejects tax without a rate, discount without a kind, and malformed shapes", async () => {
      await expectCheckViolation(
        base,
        [0, 90, 1090, null, null, null, null, null],
        "invoices_tax_requires_rate",
      );
      await expectCheckViolation(
        base,
        [100, 0, 900, null, null, null, null, null],
        "invoices_discount_shape",
      );
      await expectCheckViolation(
        base,
        [100, 0, 900, null, "percent", null, null, null],
        "invoices_discount_shape",
      );
      await expectCheckViolation(
        base,
        [100, 0, 900, null, "amount", 500, null, null],
        "invoices_discount_shape",
      );
      await expectCheckViolation(
        base,
        [0, 0, 1000, null, "fixed", null, null, null],
        "invoices_discount_shape",
      );
      await expectCheckViolation(
        base,
        [0, 10, 1010, 10001, null, null, null, null],
        "invoices_tax_bps_range",
      );
    });
    it("rejects a malformed idempotency key and draft digest", async () => {
      await expectCheckViolation(
        base,
        [0, 0, 1000, ...none.slice(0, 3), "short", null],
        "invoices_idempotency_key_format",
      );
      await expectCheckViolation(
        base,
        [0, 0, 1000, ...none.slice(0, 3), null, "ABC"],
        "invoices_draft_digest_hex",
      );
    });
    it("enforces one invoice item per position and bounded descriptions", async () => {
      const inv = (await client.query(base, [0, 0, 1000, null, null, null, null, null])).rows[0]
        .id as string;
      const item = `INSERT INTO invoice_items (invoice_id, position, description, quantity_hundredths, unit_price_minor) VALUES ($1,$2,$3,100,1000)`;
      await client.query(item, [inv, 0, "ok"]);
      await client.query("SAVEPOINT a2");
      await expect(client.query(item, [inv, 0, "dup position"])).rejects.toMatchObject({
        code: "23505",
        constraint: "invoice_items_position_uq",
      });
      await client.query("ROLLBACK TO SAVEPOINT a2");
      await expectCheckViolation(item, [inv, 1, ""], "invoice_items_description_bounded");
      await expectCheckViolation(
        item,
        [inv, 1, "x".repeat(201)],
        "invoice_items_description_bounded",
      );
      await expectCheckViolation(item, [inv, -1, "neg"], "invoice_items_position_nonneg");
    });
    it("allows at most one PayPal draft operation per invoice and per remote id and invoice number", async () => {
      const mk = async () =>
        (await client.query(base, [0, 0, 1000, null, null, null, null, null])).rows[0].id as string;
      const [a, b] = [await mk(), await mk()];
      const op = `INSERT INTO paypal_draft_operations (invoice_id, state, invoice_number, payload_digest, paypal_invoice_id)
                  VALUES ($1,$2,$3,$4,$5)`;
      const dg = "a".repeat(64);
      await client.query(op, [a, "pending", "NMI-" + "1".repeat(20), dg, null]);
      for (const [args, constraint] of [
        [[a, "pending", "NMI-" + "2".repeat(20), dg, null], "paypal_draft_operations_invoice_uq"],
        [[b, "pending", "NMI-" + "1".repeat(20), dg, null], "paypal_draft_operations_number_uq"],
      ] as const) {
        await client.query("SAVEPOINT a3");
        await expect(client.query(op, [...args])).rejects.toMatchObject({
          code: "23505",
          constraint,
        });
        await client.query("ROLLBACK TO SAVEPOINT a3");
      }
      await client.query(op, [b, "created", "NMI-" + "3".repeat(20), dg, "INV2-REMOTE-1"]);
      const c = await mk();
      await client.query("SAVEPOINT a4");
      await expect(
        client.query(op, [c, "created", "NMI-" + "4".repeat(20), dg, "INV2-REMOTE-1"]),
      ).rejects.toMatchObject({
        code: "23505",
        constraint: "paypal_draft_operations_remote_uq",
      });
      await client.query("ROLLBACK TO SAVEPOINT a4");
    });
    it("rejects impossible operation states", async () => {
      const inv = (await client.query(base, [0, 0, 1000, null, null, null, null, null])).rows[0]
        .id as string;
      const op = `INSERT INTO paypal_draft_operations (invoice_id, state, invoice_number, payload_digest, paypal_invoice_id)
                  VALUES ($1,$2,$3,$4,$5)`;
      const dg = "b".repeat(64);
      const num = "NMI-" + "5".repeat(20);
      await expectCheckViolation(
        op,
        [inv, "created", num, dg, null],
        "paypal_draft_operations_created_has_remote",
      );
      await expectCheckViolation(
        op,
        [inv, "rejected", num, dg, "INV2-X"],
        "paypal_draft_operations_remote_only_when_known",
      );
      await expectCheckViolation(
        op,
        [inv, "sent", num, dg, null],
        "paypal_draft_operations_state_allowed",
      );
      await expectCheckViolation(
        op,
        [inv, "pending", "NMI-short", dg, null],
        "paypal_draft_operations_number_format",
      );
      await expectCheckViolation(
        op,
        [inv, "pending", num, "xyz", null],
        "paypal_draft_operations_digest_hex",
      );
    });
  });
});
