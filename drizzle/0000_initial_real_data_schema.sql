CREATE TABLE "cs2_fx_rates" (
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"recorded_on" date NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cs2_fx_rates_base_quote_recorded_on_pk" PRIMARY KEY("base","quote","recorded_on")
);
--> statement-breakpoint
CREATE TABLE "cs2_ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"triggered_by" text DEFAULT 'manual' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"requests_made" integer DEFAULT 0 NOT NULL,
	"items_matched" integer DEFAULT 0 NOT NULL,
	"items_unmatched" integer DEFAULT 0 NOT NULL,
	"quotes_inserted" integer DEFAULT 0 NOT NULL,
	"history_upserted" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"message" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "cs2_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"market_hash_name" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'skin' NOT NULL,
	"weapon" text,
	"skin" text,
	"category" text,
	"rarity" text,
	"rarity_color" text,
	"collection" text,
	"wear" text,
	"stattrak" boolean DEFAULT false NOT NULL,
	"souvenir" boolean DEFAULT false NOT NULL,
	"paint_index" text,
	"min_float" numeric(8, 6),
	"max_float" numeric(8, 6),
	"image_url" text,
	"description" text,
	"popularity" integer DEFAULT 0 NOT NULL,
	"metadata_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cs2_items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "cs2_items_market_hash_name_unique" UNIQUE("market_hash_name")
);
--> statement-breakpoint
CREATE TABLE "cs2_markets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"region" text NOT NULL,
	"website" text NOT NULL,
	"integration_status" text DEFAULT 'planned' NOT NULL,
	"integration_type" text DEFAULT 'public_api' NOT NULL,
	"requires_credentials" boolean DEFAULT false NOT NULL,
	"credential_env_var" text,
	"docs_url" text,
	"data_license" text,
	"attribution" text,
	"rate_limit_notes" text,
	"price_semantics" text,
	"normalization_notes" text,
	"buyer_fee_percent" numeric(5, 2),
	"seller_fee_percent" numeric(5, 2),
	"fee_status" text DEFAULT 'unverified' NOT NULL,
	"fee_source_url" text,
	"fee_checked_at" timestamp with time zone,
	"kyc_policy" text DEFAULT 'Не проверена' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cs2_price_history_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"market_id" text NOT NULL,
	"recorded_on" date NOT NULL,
	"price_kind" text DEFAULT 'lowest_ask' NOT NULL,
	"low_price" numeric(14, 4) NOT NULL,
	"median_price" numeric(14, 4),
	"volume" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"price_usd" numeric(14, 4) NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"source_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cs2_price_quotes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"item_id" integer NOT NULL,
	"market_id" text NOT NULL,
	"price_kind" text DEFAULT 'lowest_ask' NOT NULL,
	"price" numeric(14, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"price_usd" numeric(14, 4) NOT NULL,
	"volume" integer,
	"captured_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_url" text,
	"ingest_run_id" integer,
	"is_live" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "cs2_price_quotes_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "cs2_source_health" (
	"source_id" text PRIMARY KEY NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"breaker_state" text DEFAULT 'closed' NOT NULL,
	"breaker_opened_at" timestamp with time zone,
	"last_error" text,
	"last_quote_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cs2_price_history_daily" ADD CONSTRAINT "cs2_price_history_daily_item_id_cs2_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."cs2_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs2_price_history_daily" ADD CONSTRAINT "cs2_price_history_daily_market_id_cs2_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."cs2_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs2_price_quotes" ADD CONSTRAINT "cs2_price_quotes_item_id_cs2_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."cs2_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs2_price_quotes" ADD CONSTRAINT "cs2_price_quotes_market_id_cs2_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."cs2_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cs2_ingest_runs_source_idx" ON "cs2_ingest_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "cs2_ingest_runs_status_idx" ON "cs2_ingest_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cs2_items_category_idx" ON "cs2_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "cs2_items_kind_idx" ON "cs2_items" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "cs2_items_popularity_idx" ON "cs2_items" USING btree ("popularity");--> statement-breakpoint
CREATE INDEX "cs2_items_name_idx" ON "cs2_items" USING btree ("name");--> statement-breakpoint
CREATE INDEX "cs2_items_weapon_idx" ON "cs2_items" USING btree ("weapon");--> statement-breakpoint
CREATE INDEX "cs2_markets_status_idx" ON "cs2_markets" USING btree ("integration_status");--> statement-breakpoint
CREATE UNIQUE INDEX "cs2_history_unique_idx" ON "cs2_price_history_daily" USING btree ("item_id","market_id","recorded_on","price_kind");--> statement-breakpoint
CREATE INDEX "cs2_history_recorded_idx" ON "cs2_price_history_daily" USING btree ("recorded_on");--> statement-breakpoint
CREATE INDEX "cs2_history_item_idx" ON "cs2_price_history_daily" USING btree ("item_id","recorded_on");--> statement-breakpoint
CREATE INDEX "cs2_price_quotes_item_idx" ON "cs2_price_quotes" USING btree ("item_id","captured_at");--> statement-breakpoint
CREATE INDEX "cs2_price_quotes_market_idx" ON "cs2_price_quotes" USING btree ("market_id","captured_at");--> statement-breakpoint
CREATE INDEX "cs2_price_quotes_latest_idx" ON "cs2_price_quotes" USING btree ("item_id","price_usd");--> statement-breakpoint
CREATE INDEX "cs2_price_quotes_fetched_idx" ON "cs2_price_quotes" USING btree ("fetched_at");