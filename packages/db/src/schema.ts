import {
  bigint,
  char,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  jsonb,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { CURRENCY_CODES } from "@nmi/shared";
import { PRIVILEGED_ACTIONS } from "@nmi/domain";

// Literal lists come from the domain constants (never user input), so persistence cannot drift
// from the contract. Changing either list requires a new migration.
const quoted = (xs: readonly string[]) => sql.raw(xs.map((x) => `'${x}'`).join(","));

/** Money is stored as integer minor units plus an explicit ISO currency; there are no floats. */
const money = (name: string) => bigint(name, { mode: "bigint" });
const currency = () => char("currency", { length: 3 }).notNull();

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paypalInvoiceId: text("paypal_invoice_id"),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    currency: currency(),
    subtotalMinor: money("subtotal_minor").notNull(),
    discountMinor: money("discount_minor")
      .notNull()
      .default(sql`0`),
    taxMinor: money("tax_minor")
      .notNull()
      .default(sql`0`),
    totalMinor: money("total_minor").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    // Derived from validated PayPal observations, never from client input.
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_paypal_invoice_id_uq").on(t.paypalInvoiceId),
    check("invoices_subtotal_nonneg", sql`${t.subtotalMinor} >= 0`),
    check("invoices_discount_nonneg", sql`${t.discountMinor} >= 0`),
    check("invoices_tax_nonneg", sql`${t.taxMinor} >= 0`),
    check("invoices_total_nonneg", sql`${t.totalMinor} >= 0`),
    check("invoices_discount_le_subtotal", sql`${t.discountMinor} <= ${t.subtotalMinor}`),
    // Per-line sums cannot be a CHECK; the application computes subtotal from items exactly.
    check(
      "invoices_total_consistent",
      sql`${t.totalMinor} = ${t.subtotalMinor} - ${t.discountMinor} + ${t.taxMinor}`,
    ),
    check("invoices_currency_supported", sql`${t.currency} in (${quoted(CURRENCY_CODES)})`),
    check(
      "invoices_status_chk",
      sql`${t.status} in ('draft','sent','paid','partially_paid','cancelled','refunded')`,
    ),
    index("invoices_due_date_idx").on(t.dueDate),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantityHundredths: bigint("quantity_hundredths", { mode: "bigint" }).notNull(),
    unitPriceMinor: money("unit_price_minor").notNull(),
  },
  (t) => [
    check("invoice_items_quantity_positive", sql`${t.quantityHundredths} > 0`),
    check("invoice_items_unit_price_nonneg", sql`${t.unitPriceMinor} >= 0`),
  ],
);

/** One-time approvals bound to action + resource + payload digest, with expiry. */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    resourceId: text("resource_id").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    approverId: text("approver_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("approvals_resource_idx").on(t.action, t.resourceId),
    check("approvals_action_allowed", sql`${t.action} in (${quoted(PRIVILEGED_ACTIONS)})`),
    check("approvals_payload_digest_sha256_hex", sql`${t.payloadDigest} ~ '^[0-9a-f]{64}$'`),
    check("approvals_approver_nonempty", sql`length(${t.approverId}) > 0`),
    check("approvals_expiry_after_creation", sql`${t.expiresAt} > ${t.createdAt}`),
    check(
      "approvals_consumed_not_before_creation",
      sql`${t.consumedAt} is null or ${t.consumedAt} >= ${t.createdAt}`,
    ),
  ],
);

export const paypalWebhookEvents = pgTable(
  "paypal_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paypalEventId: text("paypal_event_id").notNull(),
    eventType: text("event_type").notNull(),
    verified: text("verification_result").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("paypal_webhook_events_event_id_uq").on(t.paypalEventId)],
);

/**
 * Append-only audit trail. Immutability against UPDATE/DELETE/TRUNCATE is enforced by database
 * triggers (migration 0003), not just by application convention. `detail` is an allow-listed,
 * sanitized object (see audit.ts); never store credentials, tokens, cookies, emails or prompts.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    outcome: text("outcome"),
    detail: jsonb("detail")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    check(
      "audit_log_outcome_allowed",
      sql`${t.outcome} is null or ${t.outcome} in ('success','failure','denied','error')`,
    ),
    index("audit_log_at_idx").on(t.at),
  ],
);

/**
 * The single provisioned demo operator. No self-registration; created only by the explicit
 * provisioning CLI. `password_hash` is a salted scrypt string, never a plaintext or reversible value.
 */
export const operators = pgTable(
  "operators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("operators_username_uq").on(t.username),
    // Exactly one operator row may exist (constant-expression unique index).
    uniqueIndex("operators_single_row_uq").on(sql`(true)`),
    check("operators_username_format", sql`${t.username} ~ '^[a-z0-9._-]{3,64}$'`),
    check("operators_password_hash_scheme", sql`${t.passwordHash} like 'scrypt$%'`),
  ],
);

/** Server-side sessions. Only the SHA-256 of the opaque token is stored; the token never is. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    index("sessions_operator_idx").on(t.operatorId),
    check("sessions_token_hash_hex", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("sessions_expiry_after_creation", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);
