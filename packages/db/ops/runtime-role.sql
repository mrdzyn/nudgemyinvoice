-- NudgeMyInvoice runtime role: the ONLY database privileges the running API needs.
--
-- Run once as the migration/owner role, AFTER migrations 0000-0006 have been applied. It changes
-- privileges only (no table, column or constraint is created or altered). The role is created
-- separately and WITHOUT a password in any statement, file or command line:
--
--   CREATE ROLE nmi_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
--
-- then set its password interactively (psql hashes it client-side; nothing is logged or kept in shell
-- history), and store the same value only in the host secret store:
--
--   psql "$OWNER_DATABASE_URL"   -- then, at the prompt:  \password nmi_runtime
--
-- NEVER put a password in this file, in psql -c / -v arguments, or in a committed connection string.

-- What it deliberately cannot do: change schema, TRUNCATE or DELETE anything, create/modify
-- operators (provisioning is an owner-run CLI), touch approvals or webhook events (unused by the
-- API), UPDATE or read back-modify the append-only audit log (INSERT only), or UPDATE any invoice
-- column other than the PayPal link.

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM nmi_runtime;
GRANT USAGE ON SCHEMA "public" TO nmi_runtime;

-- Login and session lifecycle.
GRANT SELECT ON "public"."operators" TO nmi_runtime;
-- createSession locks the operator row (SELECT ... FOR UPDATE), and PostgreSQL requires UPDATE
-- privilege on at least one column for any row lock. Grant it on the one column nothing depends
-- on (created_at); password_hash, credential_version and disabled_at stay unmodifiable.
GRANT UPDATE ("created_at") ON "public"."operators" TO nmi_runtime;
GRANT SELECT, INSERT, UPDATE ON "public"."sessions" TO nmi_runtime;

-- Saved drafts (immutable once written, except the one-time PayPal link) and their line items.
GRANT SELECT, INSERT ON "public"."invoices" TO nmi_runtime;
GRANT UPDATE ("paypal_invoice_id") ON "public"."invoices" TO nmi_runtime;
GRANT SELECT, INSERT ON "public"."invoice_items" TO nmi_runtime;

-- Durable PayPal operation fencing (inert while PAYPAL_DRAFTS_ENABLED=false, but the route reads it).
GRANT SELECT, INSERT, UPDATE ON "public"."paypal_draft_operations" TO nmi_runtime;

-- Append-only audit trail: INSERT only (a trigger additionally rejects UPDATE/DELETE/TRUNCATE).
GRANT INSERT ON "public"."audit_log" TO nmi_runtime;
