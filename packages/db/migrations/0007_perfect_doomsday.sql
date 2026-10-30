CREATE TABLE "invoice_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"note" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "invoice_follow_ups_status_chk" CHECK ("invoice_follow_ups"."status" in ('active','completed','canceled')),
	CONSTRAINT "invoice_follow_ups_closed_at_chk" CHECK (("invoice_follow_ups"."status" = 'completed') = ("invoice_follow_ups"."completed_at" is not null) and ("invoice_follow_ups"."status" = 'canceled') = ("invoice_follow_ups"."canceled_at" is not null)),
	CONSTRAINT "invoice_follow_ups_timezone_format" CHECK ("invoice_follow_ups"."timezone" ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$' and length("invoice_follow_ups"."timezone") <= 64),
	CONSTRAINT "invoice_follow_ups_note_len" CHECK ("invoice_follow_ups"."note" is null or (length("invoice_follow_ups"."note") between 1 and 500)),
	CONSTRAINT "invoice_follow_ups_message_len" CHECK (length("invoice_follow_ups"."message") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "invoice_follow_ups" ADD CONSTRAINT "invoice_follow_ups_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_follow_ups" ADD CONSTRAINT "invoice_follow_ups_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_follow_ups_one_active_uq" ON "invoice_follow_ups" USING btree ("invoice_id") WHERE "invoice_follow_ups"."status" = 'active';--> statement-breakpoint
CREATE INDEX "invoice_follow_ups_operator_idx" ON "invoice_follow_ups" USING btree ("operator_id","status","due_at");--> statement-breakpoint
CREATE INDEX "invoice_follow_ups_invoice_idx" ON "invoice_follow_ups" USING btree ("invoice_id");