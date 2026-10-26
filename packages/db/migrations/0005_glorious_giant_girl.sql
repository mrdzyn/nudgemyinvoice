CREATE TABLE "paypal_draft_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"created_by" uuid,
	"state" text DEFAULT 'pending' NOT NULL,
	"request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"payload_digest" char(64) NOT NULL,
	"paypal_invoice_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"claimed_at" timestamp with time zone,
	"create_attempted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "paypal_draft_operations_state_allowed" CHECK ("paypal_draft_operations"."state" in ('pending','creating','created','unknown','rejected','mismatch')),
	CONSTRAINT "paypal_draft_operations_created_has_remote" CHECK ("paypal_draft_operations"."state" <> 'created' or "paypal_draft_operations"."paypal_invoice_id" is not null),
	CONSTRAINT "paypal_draft_operations_remote_only_when_known" CHECK ("paypal_draft_operations"."paypal_invoice_id" is null or "paypal_draft_operations"."state" in ('created','mismatch','unknown','creating')),
	CONSTRAINT "paypal_draft_operations_attempts_nonneg" CHECK ("paypal_draft_operations"."attempts" >= 0),
	CONSTRAINT "paypal_draft_operations_number_format" CHECK ("paypal_draft_operations"."invoice_number" ~ '^NMI-[0-9a-f]{20}$'),
	CONSTRAINT "paypal_draft_operations_digest_hex" CHECK ("paypal_draft_operations"."payload_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "paypal_draft_operations_error_code_token" CHECK ("paypal_draft_operations"."last_error_code" is null or "paypal_draft_operations"."last_error_code" ~ '^[a-z0-9_.:-]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "draft_digest" char(64);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_bps" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_kind" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_bps" integer;--> statement-breakpoint
ALTER TABLE "paypal_draft_operations" ADD CONSTRAINT "paypal_draft_operations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_draft_operations" ADD CONSTRAINT "paypal_draft_operations_created_by_operators_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_draft_operations_invoice_uq" ON "paypal_draft_operations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_draft_operations_number_uq" ON "paypal_draft_operations" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_draft_operations_remote_uq" ON "paypal_draft_operations" USING btree ("paypal_invoice_id") WHERE "paypal_draft_operations"."paypal_invoice_id" is not null;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_operators_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_items_position_uq" ON "invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_idempotency_uq" ON "invoices" USING btree ("created_by","idempotency_key") WHERE "invoices"."idempotency_key" is not null;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_position_nonneg" CHECK ("invoice_items"."position" >= 0);--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_description_bounded" CHECK (length("invoice_items"."description") between 1 and 200);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_draft_digest_hex" CHECK ("invoices"."draft_digest" is null or "invoices"."draft_digest" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_idempotency_key_format" CHECK ("invoices"."idempotency_key" is null or "invoices"."idempotency_key" ~ '^[A-Za-z0-9_-]{8,128}$');--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_bps_range" CHECK ("invoices"."tax_bps" is null or ("invoices"."tax_bps" between 0 and 10000));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_requires_rate" CHECK ("invoices"."tax_bps" is not null or "invoices"."tax_minor" = 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_discount_shape" CHECK (("invoices"."discount_kind" is null and "invoices"."discount_bps" is null and "invoices"."discount_minor" = 0)
        or ("invoices"."discount_kind" is not null and "invoices"."discount_kind" = 'percent'
            and "invoices"."discount_bps" is not null and "invoices"."discount_bps" between 0 and 10000)
        or ("invoices"."discount_kind" is not null and "invoices"."discount_kind" = 'amount' and "invoices"."discount_bps" is null));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_fields_bounded" CHECK (length("invoices"."customer_name") between 1 and 200 and length("invoices"."customer_email") between 3 and 254);