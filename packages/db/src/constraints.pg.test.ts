import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENCY_CODES } from "@nmi/shared";
import { PRIVILEGED_ACTIONS, payloadDigest } from "@nmi/domain";

/**
 * Real PostgreSQL constraint tests. They run ONLY when TEST_DATABASE_URL points at a disposable
 * database whose name starts with "nmi_test"; otherwise they are skipped (and reported as skipped,
 * never as passed). Each run applies the committed migrations, in journal order, into a fresh
 * schema that is dropped afterwards. Nothing persistent is touched or reset.
 */
const url = process.env["TEST_DATABASE_URL"];
if (!url && process.env["REQUIRE_DB_TESTS"] === "1") {
  throw new Error("REQUIRE_DB_TESTS=1 but TEST_DATABASE_URL is not set; refusing to skip");
}
if (url) {
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/^nmi_test/.test(dbName)) {
    throw new Error(`Refusing to run: database "${dbName}" is not a disposable nmi_test* database`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, "..", "migrations");

function migrationStatements(): string[] {
  const journal = JSON.parse(readFileSync(join(migrations, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  return journal.entries.flatMap((e) =>
    readFileSync(join(migrations, `${e.tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

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
    // Drizzle qualifies FK targets as "public"."table"; point them at this run's scratch schema.
    for (const stmt of migrationStatements()) {
      await client.query(stmt.replaceAll('"public".', `"${schema}".`));
    }
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
    (customer_name, customer_email, currency, subtotal_minor, discount_minor, tax_minor, total_minor, due_date)
    VALUES ('A','a@example.com',$1,$2,$3,$4,$5,'2026-11-01')`;

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
    const insertItem = `INSERT INTO invoice_items (invoice_id, description, quantity_hundredths, unit_price_minor) VALUES ($1,'x',$2,$3)`;

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
});
