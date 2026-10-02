import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const markets = pgTable(
  "cs2_markets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    region: text("region").notNull(),
    website: text("website").notNull(),
    integrationStatus: text("integration_status").notNull().default("not_connected"),
    integrationType: text("integration_type").notNull().default("unverified"),
    buyerFeePercent: numeric("buyer_fee_percent", { precision: 5, scale: 2 }),
    sellerFeePercent: numeric("seller_fee_percent", { precision: 5, scale: 2 }),
    feeStatus: text("fee_status").notNull().default("unverified"),
    kycPolicy: text("kyc_policy").notNull().default("Не проверена"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cs2_markets_region_idx").on(table.region)],
);

export const items = pgTable(
  "cs2_items",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    marketHashName: text("market_hash_name").notNull().unique(),
    name: text("name").notNull(),
    weapon: text("weapon").notNull(),
    skin: text("skin").notNull(),
    category: text("category").notNull(),
    rarity: text("rarity").notNull(),
    collection: text("collection").notNull(),
    wear: text("wear").notNull(),
    stattrak: boolean("stattrak").notNull().default(false),
    souvenir: boolean("souvenir").notNull().default(false),
    paintSeed: integer("paint_seed").notNull(),
    floatValue: numeric("float_value", { precision: 8, scale: 6 }).notNull(),
    demand: integer("demand").notNull().default(0),
    change24h: numeric("change_24h", { precision: 6, scale: 2 }).notNull().default("0"),
    artTheme: text("art_theme").notNull().default("violet"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cs2_items_category_idx").on(table.category),
    index("cs2_items_demand_idx").on(table.demand),
    index("cs2_items_name_idx").on(table.name),
  ],
);

export const priceListings = pgTable(
  "cs2_price_listings",
  {
    id: serial("id").primaryKey(),
    sourceKey: text("source_key").notNull().unique(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    buyerPrice: numeric("buyer_price", { precision: 12, scale: 2 }).notNull(),
    sellerPayout: numeric("seller_payout", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    region: text("region").notNull().default("Глобально"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(true),
  },
  (table) => [
    index("cs2_price_listings_item_idx").on(table.itemId),
    index("cs2_price_listings_market_idx").on(table.marketId),
    index("cs2_price_listings_captured_idx").on(table.capturedAt),
  ],
);

export const priceHistory = pgTable(
  "cs2_price_history",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    recordedOn: date("recorded_on").notNull(),
    lowPrice: numeric("low_price", { precision: 12, scale: 2 }).notNull(),
    medianPrice: numeric("median_price", { precision: 12, scale: 2 }).notNull(),
    volume: integer("volume").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(true),
  },
  (table) => [
    uniqueIndex("cs2_price_history_item_day_unique").on(table.itemId, table.recordedOn),
    index("cs2_price_history_recorded_idx").on(table.recordedOn),
  ],
);
