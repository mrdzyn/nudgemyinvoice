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
    check("invoices_total_nonneg", sql`${t.totalMinor} >= 0`),
    check(
      "invoices_status_chk",
      sql`${t.status} in ('draft','sent','paid','partially_paid','cancelled','refunded')`,
    ),
    index("invoices_due_date_idx").on(t.dueDate),
  ],
);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantityHundredths: bigint("quantity_hundredths", { mode: "bigint" }).notNull(),
  unitPriceMinor: money("unit_price_minor").notNull(),
});

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
  (t) => [index("approvals_resource_idx").on(t.action, t.resourceId)],
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

/** Append-only audit trail; the application role should have INSERT/SELECT only. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  resourceId: text("resource_id"),
  detail: jsonb("detail")
    .notNull()
    .default(sql`'{}'::jsonb`),
});
