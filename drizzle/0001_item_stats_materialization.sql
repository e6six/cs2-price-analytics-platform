CREATE TABLE "cs2_item_stats" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"best_price_usd" numeric(14, 4),
	"worst_price_usd" numeric(14, 4),
	"average_price_usd" numeric(14, 4),
	"best_market_id" text,
	"market_count" integer DEFAULT 0 NOT NULL,
	"last_captured_at" timestamp with time zone,
	"has_live_quote" boolean DEFAULT false NOT NULL,
	"last_price_usd" numeric(14, 4),
	"first_price_usd" numeric(14, 4),
	"price_7d_usd" numeric(14, 4),
	"price_30d_usd" numeric(14, 4),
	"price_90d_usd" numeric(14, 4),
	"change_7d" numeric(10, 3),
	"change_30d" numeric(10, 3),
	"change_90d" numeric(10, 3),
	"history_points" integer DEFAULT 0 NOT NULL,
	"history_from" date,
	"history_to" date,
	"last_recorded_on" date,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cs2_item_stats" ADD CONSTRAINT "cs2_item_stats_item_id_cs2_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."cs2_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cs2_item_stats_best_price_idx" ON "cs2_item_stats" USING btree ("best_price_usd");--> statement-breakpoint
CREATE INDEX "cs2_item_stats_change7d_idx" ON "cs2_item_stats" USING btree ("change_7d");--> statement-breakpoint
CREATE INDEX "cs2_item_stats_market_count_idx" ON "cs2_item_stats" USING btree ("market_count");--> statement-breakpoint
CREATE INDEX "cs2_item_stats_points_idx" ON "cs2_item_stats" USING btree ("history_points");