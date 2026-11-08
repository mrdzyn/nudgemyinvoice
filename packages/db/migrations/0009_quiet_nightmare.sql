CREATE TABLE "paypal_imported_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid NOT NULL,
	"paypal_env" text DEFAULT 'sandbox' NOT NULL,
	"remote_invoice_id" text NOT NULL,
	"invoice_number" text,
	"remote_status" text DEFAULT 'DRAFT' NOT NULL,
	"currency" char(3) NOT NULL,
	"total_minor" bigint NOT NULL,
	"due_date" date,
	"linked_invoice_id" uuid,
	"source" text DEFAULT 'paypal_sandbox' NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paypal_imported_drafts_env_sandbox" CHECK ("paypal_imported_drafts"."paypal_env" = 'sandbox'),
	CONSTRAINT "paypal_imported_drafts_remote_format" CHECK ("paypal_imported_drafts"."remote_invoice_id" ~ '^[A-Za-z0-9-]{1,64}$'),
	CONSTRAINT "paypal_imported_drafts_status_draft" CHECK ("paypal_imported_drafts"."remote_status" = 'DRAFT'),
	CONSTRAINT "paypal_imported_drafts_source_fixed" CHECK ("paypal_imported_drafts"."source" = 'paypal_sandbox'),
	CONSTRAINT "paypal_imported_drafts_currency_supported" CHECK ("paypal_imported_drafts"."currency" in ('USD','EUR','GBP','CAD','AUD','JPY')),
	CONSTRAINT "paypal_imported_drafts_total_nonneg" CHECK ("paypal_imported_drafts"."total_minor" >= 0),
	CONSTRAINT "paypal_imported_drafts_number_bounded" CHECK ("paypal_imported_drafts"."invoice_number" is null or length("paypal_imported_drafts"."invoice_number") between 1 and 25)
);
--> statement-breakpoint
ALTER TABLE "paypal_imported_drafts" ADD CONSTRAINT "paypal_imported_drafts_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_imported_drafts" ADD CONSTRAINT "paypal_imported_drafts_linked_invoice_id_invoices_id_fk" FOREIGN KEY ("linked_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_imported_drafts_env_remote_uq" ON "paypal_imported_drafts" USING btree ("paypal_env","remote_invoice_id");--> statement-breakpoint
CREATE INDEX "paypal_imported_drafts_operator_idx" ON "paypal_imported_drafts" USING btree ("operator_id","last_synced_at");--> statement-breakpoint
CREATE INDEX "paypal_imported_drafts_linked_idx" ON "paypal_imported_drafts" USING btree ("linked_invoice_id");