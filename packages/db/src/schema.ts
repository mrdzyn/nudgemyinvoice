import {
  bigint,
  char,
  integer,
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
    // Ownership and client-retry de-duplication (see PostgresInvoiceDraftStore.save).
    createdBy: uuid("created_by").references(() => operators.id),
    idempotencyKey: text("idempotency_key"),
    // SHA-256 of the canonical validated draft; a replayed key must present the same draft.
    draftDigest: char("draft_digest", { length: 64 }),
    // Original (un-rounded) tax/discount inputs, so PayPal mapping and round trips are exact.
    taxBps: integer("tax_bps"),
    discountKind: text("discount_kind"),
    discountBps: integer("discount_bps"),
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
    uniqueIndex("invoices_idempotency_uq")
      .on(t.createdBy, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    check(
      "invoices_draft_digest_hex",
      sql`${t.draftDigest} is null or ${t.draftDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "invoices_idempotency_key_format",
      sql`${t.idempotencyKey} is null or ${t.idempotencyKey} ~ '^[A-Za-z0-9_-]{8,128}$'`,
    ),
    check("invoices_tax_bps_range", sql`${t.taxBps} is null or (${t.taxBps} between 0 and 10000)`),
    check("invoices_tax_requires_rate", sql`${t.taxBps} is not null or ${t.taxMinor} = 0`),
    check(
      "invoices_discount_shape",
      sql`(${t.discountKind} is null and ${t.discountBps} is null and ${t.discountMinor} = 0)
        or (${t.discountKind} is not null and ${t.discountKind} = 'percent'
            and ${t.discountBps} is not null and ${t.discountBps} between 0 and 10000)
        or (${t.discountKind} is not null and ${t.discountKind} = 'amount' and ${t.discountBps} is null)`,
    ),
    check(
      "invoices_customer_fields_bounded",
      sql`length(${t.customerName}) between 1 and 200 and length(${t.customerEmail}) between 3 and 254`,
    ),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    quantityHundredths: bigint("quantity_hundredths", { mode: "bigint" }).notNull(),
    unitPriceMinor: money("unit_price_minor").notNull(),
  },
  (t) => [
    check("invoice_items_quantity_positive", sql`${t.quantityHundredths} > 0`),
    check("invoice_items_unit_price_nonneg", sql`${t.unitPriceMinor} >= 0`),
    check("invoice_items_position_nonneg", sql`${t.position} >= 0`),
    check("invoice_items_description_bounded", sql`length(${t.description}) between 1 and 200`),
    uniqueIndex("invoice_items_position_uq").on(t.invoiceId, t.position),
  ],
);

/**
 * Durable record of the (single) PayPal sandbox draft creation for a local invoice.
 * One row per invoice (unique invoice_id) is the barrier that makes a second external create
 * impossible without an explicit, fenced claim. `attempts` is the fencing counter: every state
 * change after a claim must present the attempts value it was granted.
 *
 * states: pending (reserved) -> creating (claimed; lease) -> created | rejected | mismatch | unknown.
 * `unknown` means the outcome of the external call is not known; it is reconciled by looking the
 * invoice up by its deterministic invoice_number BEFORE any further create.
 */
export const paypalDraftOperations = pgTable(
  "paypal_draft_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => operators.id),
    state: text("state").notNull().default("pending"),
    // Stable PayPal-Request-Id for every attempt (sent, but NOT relied upon: PayPal documents it
    // only for some Invoicing endpoints, not invoices.create).
    requestId: uuid("request_id").notNull().defaultRandom(),
    // Deterministic remote invoice number we choose; used to find the invoice after an unclear outcome.
    invoiceNumber: text("invoice_number").notNull(),
    // SHA-256 of the exact PayPal request body built at intent time.
    payloadDigest: char("payload_digest", { length: 64 }).notNull(),
    // Exact YYYY-MM-DD invoice date sent to PayPal in the initial request body.
    invoiceDate: text("invoice_date"),
    paypalInvoiceId: text("paypal_invoice_id"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createAttemptedAt: timestamp("create_attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("paypal_draft_operations_invoice_uq").on(t.invoiceId),
    uniqueIndex("paypal_draft_operations_number_uq").on(t.invoiceNumber),
    uniqueIndex("paypal_draft_operations_remote_uq")
      .on(t.paypalInvoiceId)
      .where(sql`${t.paypalInvoiceId} is not null`),
    check(
      "paypal_draft_operations_state_allowed",
      sql`${t.state} in ('pending','creating','created','unknown','rejected','mismatch')`,
    ),
    check(
      "paypal_draft_operations_created_has_remote",
      sql`${t.state} <> 'created' or ${t.paypalInvoiceId} is not null`,
    ),
    check(
      "paypal_draft_operations_remote_only_when_known",
      sql`${t.paypalInvoiceId} is null or ${t.state} in ('created','mismatch','unknown','creating')`,
    ),
    check("paypal_draft_operations_attempts_nonneg", sql`${t.attempts} >= 0`),
    check("paypal_draft_operations_number_format", sql`${t.invoiceNumber} ~ '^NMI-[0-9a-f]{20}$'`),
    check("paypal_draft_operations_digest_hex", sql`${t.payloadDigest} ~ '^[0-9a-f]{64}$'`),
    check(
      "paypal_draft_operations_invoice_date_format",
      sql`${t.invoiceDate} is null or ${t.invoiceDate} ~ '^\\d{4}-\\d{2}-\\d{2}$'`,
    ),
    check(
      "paypal_draft_operations_error_code_token",
      sql`${t.lastErrorCode} is null or ${t.lastErrorCode} ~ '^[a-z0-9_.:-]{1,64}$'`,
    ),
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
    // Bumped on every password rotation. A session may only be issued for the exact version whose
    // password the login verified (see PostgresAuthStore.createSession).
    credentialVersion: integer("credential_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("operators_username_uq").on(t.username),
    // Exactly one operator row may exist (constant-expression unique index).
    uniqueIndex("operators_single_row_uq").on(sql`(true)`),
    check("operators_username_format", sql`${t.username} ~ '^[a-z0-9._-]{3,64}$'`),
    check("operators_password_hash_scheme", sql`${t.passwordHash} like 'scrypt$%'`),
    check("operators_credential_version_positive", sql`${t.credentialVersion} >= 1`),
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
