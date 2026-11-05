CREATE TABLE "invoice_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"tone" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"message" text NOT NULL,
	"ai_message" text NOT NULL,
	"rationale" text NOT NULL,
	"facts" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "invoice_nudges_tone_chk" CHECK ("invoice_nudges"."tone" in ('friendly','professional','firm')),
	CONSTRAINT "invoice_nudges_status_chk" CHECK ("invoice_nudges"."status" in ('pending_review','approved','rejected','superseded')),
	CONSTRAINT "invoice_nudges_closed_at_chk" CHECK (("invoice_nudges"."status" = 'approved') = ("invoice_nudges"."approved_at" is not null) and ("invoice_nudges"."status" = 'rejected') = ("invoice_nudges"."rejected_at" is not null) and ("invoice_nudges"."status" = 'superseded') = ("invoice_nudges"."superseded_at" is not null)),
	CONSTRAINT "invoice_nudges_message_len" CHECK (length("invoice_nudges"."message") between 1 and 2000),
	CONSTRAINT "invoice_nudges_ai_message_len" CHECK (length("invoice_nudges"."ai_message") between 1 and 2000),
	CONSTRAINT "invoice_nudges_rationale_len" CHECK (length("invoice_nudges"."rationale") between 1 and 600),
	CONSTRAINT "invoice_nudges_model_len" CHECK (length("invoice_nudges"."model") between 1 and 100),
	CONSTRAINT "invoice_nudges_prompt_version_len" CHECK (length("invoice_nudges"."prompt_version") between 1 and 40),
	CONSTRAINT "invoice_nudges_version_pos" CHECK ("invoice_nudges"."version" >= 1),
	CONSTRAINT "invoice_nudges_facts_object" CHECK (jsonb_typeof("invoice_nudges"."facts") = 'object')
);
--> statement-breakpoint
ALTER TABLE "invoice_nudges" ADD CONSTRAINT "invoice_nudges_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_nudges" ADD CONSTRAINT "invoice_nudges_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_nudges_one_pending_uq" ON "invoice_nudges" USING btree ("invoice_id") WHERE "invoice_nudges"."status" = 'pending_review';--> statement-breakpoint
CREATE INDEX "invoice_nudges_operator_idx" ON "invoice_nudges" USING btree ("operator_id","status","created_at");--> statement-breakpoint
CREATE INDEX "invoice_nudges_invoice_idx" ON "invoice_nudges" USING btree ("invoice_id");