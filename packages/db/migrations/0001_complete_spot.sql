ALTER TABLE "approvals" ADD CONSTRAINT "approvals_action_allowed" CHECK ("approvals"."action" in ('sendInvoice','sendReminder','cancelInvoice','refundPayment','capturePayment','markPaid'));--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_payload_digest_sha256_hex" CHECK ("approvals"."payload_digest" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_nonempty" CHECK (length("approvals"."approver_id") > 0);--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_expiry_after_creation" CHECK ("approvals"."expires_at" > "approvals"."created_at");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_consumed_not_before_creation" CHECK ("approvals"."consumed_at" is null or "approvals"."consumed_at" >= "approvals"."created_at");--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_quantity_positive" CHECK ("invoice_items"."quantity_hundredths" > 0);--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_unit_price_nonneg" CHECK ("invoice_items"."unit_price_minor" >= 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subtotal_nonneg" CHECK ("invoices"."subtotal_minor" >= 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_discount_nonneg" CHECK ("invoices"."discount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_nonneg" CHECK ("invoices"."tax_minor" >= 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_discount_le_subtotal" CHECK ("invoices"."discount_minor" <= "invoices"."subtotal_minor");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_consistent" CHECK ("invoices"."total_minor" = "invoices"."subtotal_minor" - "invoices"."discount_minor" + "invoices"."tax_minor");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_supported" CHECK ("invoices"."currency" in ('USD','EUR','GBP','CAD','AUD','JPY'));