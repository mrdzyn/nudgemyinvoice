-- Audit log is append-only: ordinary UPDATE, DELETE and TRUNCATE are rejected by the database.
-- The table owner or a superuser can still drop/disable triggers; run the application with a
-- separate role holding only INSERT and SELECT on audit_log (see docs/SECURITY.md).
CREATE FUNCTION nmi_audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION nmi_audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION nmi_audit_log_immutable();
