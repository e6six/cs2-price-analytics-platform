import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Справочник источников данных: маркетплейсы и внешние наборы данных.
 *
 * Комиссии, KYC-политики и юридические условия хранятся только вместе с
 * ссылкой на источник и датой проверки (`feeSourceUrl`, `termsCheckedAt`).
 * Если значение не подтверждено документацией площадки, оно остаётся `null`,
 * а `feeStatus` = `unverified` — UI обязан показывать это как неизвестное,
 * а не как факт.
 */
export const markets = pgTable(
  "cs2_markets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    region: text("region").notNull(),
    website: text("website").notNull(),
    /** live | delayed | dataset | credentials_required | planned | disabled */
    integrationStatus: text("integration_status").notNull().default("planned"),
    /** public_api | dataset | partner_api | manual */
    integrationType: text("integration_type").notNull().default("public_api"),
    /** Нужны ли учётные данные (ключ/сессия) для работы адаптера. */
    requiresCredentials: boolean("requires_credentials").notNull().default(false),
    /** Какая переменная окружения включает адаптер. */
    credentialEnvVar: text("credential_env_var"),
    docsUrl: text("docs_url"),
    /** Лицензия/условия перепубликации данных источника. */
    dataLicense: text("data_license"),
    attribution: text("attribution"),
    /** suspended | limited | unverified — показывается в интерфейсе как предупреждение. */
    rateLimitNotes: text("rate_limit_notes"),
    /** Что именно означает цена источника для покупателя. */
    priceSemantics: text("price_semantics"),
    normalizationNotes: text("normalization_notes"),
    buyerFeePercent: numeric("buyer_fee_percent", { precision: 5, scale: 2 }),
    sellerFeePercent: numeric("seller_fee_percent", { precision: 5, scale: 2 }),
    /** verified | unverified */
    feeStatus: text("fee_status").notNull().default("unverified"),
    feeSourceUrl: text("fee_source_url"),
    feeCheckedAt: timestamp("fee_checked_at", { withTimezone: true }),
    kycPolicy: text("kyc_policy").notNull().default("Не проверена"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cs2_markets_status_idx").on(table.integrationStatus)],
);

/**
 * Канонический торговый предмет (единица рынка), идентифицируемая
 * `market_hash_name` — именем, которое используют Steam и площадки.
 */
export const items = pgTable(
  "cs2_items",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    marketHashName: text("market_hash_name").notNull().unique(),
    name: text("name").notNull(),
    /** skin | case | sticker | agent | key | music_kit | charm | collectible | patch | graffiti | other */
    kind: text("kind").notNull().default("skin"),
    weapon: text("weapon"),
    skin: text("skin"),
    category: text("category"),
    rarity: text("rarity"),
    rarityColor: text("rarity_color"),
    collection: text("collection"),
    wear: text("wear"),
    stattrak: boolean("stattrak").notNull().default(false),
    souvenir: boolean("souvenir").notNull().default(false),
    paintIndex: text("paint_index"),
    minFloat: numeric("min_float", { precision: 8, scale: 6 }),
    maxFloat: numeric("max_float", { precision: 8, scale: 6 }),
    imageUrl: text("image_url"),
    description: text("description"),
    /** Относительная популярность (0..100) для сортировки по умолчанию. */
    popularity: integer("popularity").notNull().default(0),
    /** Источник метаданных (`markets.id` или `dataset:<name>`). */
    metadataSource: text("metadata_source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cs2_items_category_idx").on(table.category),
    index("cs2_items_kind_idx").on(table.kind),
    index("cs2_items_popularity_idx").on(table.popularity),
    index("cs2_items_name_idx").on(table.name),
    index("cs2_items_weapon_idx").on(table.weapon),
  ],
);

/**
 * Снимок котировки: одна строка = наблюдение цены предмета на площадке
 * в момент времени. `sourceKey` обеспечивает идемпотентность повторных sync.
 */
export const priceQuotes = pgTable(
  "cs2_price_quotes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceKey: text("source_key").notNull().unique(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    /** lowest_ask | median_sale | highest_bid | suggested | last_sale */
    priceKind: text("price_kind").notNull().default("lowest_ask"),
    /** Цена покупателя в валюте источника. */
    price: numeric("price", { precision: 14, scale: 4 }).notNull(),
    /** Валюта, в которой цена получена от источника (ISO 4217). */
    currency: text("currency").notNull().default("USD"),
    /** Нормализованная цена в USD на момент снимка. */
    priceUsd: numeric("price_usd", { precision: 14, scale: 4 }).notNull(),
    /** Объём/число активных лотов, если источник их отдаёт. */
    volume: integer("volume"),
    /** Сколько дней истории содержит источник, если он это сообщает. */
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    sourceUrl: text("source_url"),
    ingestRunId: integer("ingest_run_id"),
    isLive: boolean("is_live").notNull().default(false),
    note: text("note"),
  },
  (table) => [
    index("cs2_price_quotes_item_idx").on(table.itemId, table.capturedAt),
    index("cs2_price_quotes_market_idx").on(table.marketId, table.capturedAt),
    index("cs2_price_quotes_latest_idx").on(table.itemId, table.priceUsd),
    index("cs2_price_quotes_fetched_idx").on(table.fetchedAt),
  ],
);

/**
 * Дневной ряд цен по предмету и площадке.
 *
 * Строки появляются двумя способами:
 *  - агрегацией реальных снимков `cs2_price_quotes` за день (`isLive = true`);
 *  - импортом подтверждённого исторического набора (`isLive = false`,
 *    `sourceRef` указывает на конкретный датасет и его лицензию).
 *
 * `volume` может быть `null`: если источник не отдаёт объём, поле остаётся
 * пустым. Ноль здесь означал бы «торгов не было», это другое утверждение.
 */
export const priceHistoryDaily = pgTable(
  "cs2_price_history_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    recordedOn: date("recorded_on").notNull(),
    priceKind: text("price_kind").notNull().default("lowest_ask"),
    lowPrice: numeric("low_price", { precision: 14, scale: 4 }).notNull(),
    medianPrice: numeric("median_price", { precision: 14, scale: 4 }),
    volume: integer("volume"),
    currency: text("currency").notNull().default("USD"),
    priceUsd: numeric("price_usd", { precision: 14, scale: 4 }).notNull(),
    isLive: boolean("is_live").notNull().default(false),
    /** `markets.id` или `dataset:<id>` — откуда пришла строка. */
    sourceRef: text("source_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cs2_history_unique_idx").on(
      table.itemId,
      table.marketId,
      table.recordedOn,
      table.priceKind,
    ),
    index("cs2_history_recorded_idx").on(table.recordedOn),
    index("cs2_history_item_idx").on(table.itemId, table.recordedOn),
  ],
);

/** Журнал запусков синхронизации: наблюдаемость ингеста. */
export const ingestRuns = pgTable(
  "cs2_ingest_runs",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    /** running | success | partial | failed */
    status: text("status").notNull().default("running"),
    triggeredBy: text("triggered_by").notNull().default("manual"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    requestsMade: integer("requests_made").notNull().default(0),
    itemsMatched: integer("items_matched").notNull().default(0),
    itemsUnmatched: integer("items_unmatched").notNull().default(0),
    quotesInserted: integer("quotes_inserted").notNull().default(0),
    historyUpserted: integer("history_upserted").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    message: text("message"),
    details: jsonb("details"),
  },
  (table) => [
    index("cs2_ingest_runs_source_idx").on(table.sourceId, table.startedAt),
    index("cs2_ingest_runs_status_idx").on(table.status),
  ],
);

/** Состояние источника: используется circuit breaker и панелью здоровья. */
export const sourceHealth = pgTable("cs2_source_health", {
  sourceId: text("source_id").primaryKey(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  /** closed | half_open | open */
  breakerState: text("breaker_state").notNull().default("closed"),
  breakerOpenedAt: timestamp("breaker_opened_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastQuoteCount: integer("last_quote_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Курсы валют для нормализации цен в USD. */
export const fxRates = pgTable(
  "cs2_fx_rates",
  {
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    recordedOn: date("recorded_on").notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.base, table.quote, table.recordedOn] })],
);

/**
 * Материализованные показатели предмета.
 *
 * Тяжёлые оконные функции по всей истории цен считаются один раз после сбора
 * данных и складываются сюда: каталог, лидеры и сводка читают уже готовые
 * значения, поэтому ответ API не зависит от объёма истории.
 *
 * Таблица пересобирается целиком (`refreshItemStats`) после импорта набора и
 * после каждой синхронизации.
 */
export const itemStats = pgTable(
  "cs2_item_stats",
  {
    itemId: integer("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    bestPriceUsd: numeric("best_price_usd", { precision: 14, scale: 4 }),
    worstPriceUsd: numeric("worst_price_usd", { precision: 14, scale: 4 }),
    averagePriceUsd: numeric("average_price_usd", { precision: 14, scale: 4 }),
    bestMarketId: text("best_market_id"),
    marketCount: integer("market_count").notNull().default(0),
    lastCapturedAt: timestamp("last_captured_at", { withTimezone: true }),
    hasLiveQuote: boolean("has_live_quote").notNull().default(false),
    lastPriceUsd: numeric("last_price_usd", { precision: 14, scale: 4 }),
    firstPriceUsd: numeric("first_price_usd", { precision: 14, scale: 4 }),
    price7dUsd: numeric("price_7d_usd", { precision: 14, scale: 4 }),
    price30dUsd: numeric("price_30d_usd", { precision: 14, scale: 4 }),
    price90dUsd: numeric("price_90d_usd", { precision: 14, scale: 4 }),
    price7dDate: date("price_7d_date"),
    price30dDate: date("price_30d_date"),
    price90dDate: date("price_90d_date"),
    change7d: numeric("change_7d", { precision: 10, scale: 3 }),
    change30d: numeric("change_30d", { precision: 10, scale: 3 }),
    change90d: numeric("change_90d", { precision: 10, scale: 3 }),
    historyPoints: integer("history_points").notNull().default(0),
    seriesNoisy: boolean("series_noisy").notNull().default(false),
    historyFrom: date("history_from"),
    historyTo: date("history_to"),
    lastRecordedOn: date("last_recorded_on"),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cs2_item_stats_best_price_idx").on(table.bestPriceUsd),
    index("cs2_item_stats_change7d_idx").on(table.change7d),
    index("cs2_item_stats_market_count_idx").on(table.marketCount),
    index("cs2_item_stats_points_idx").on(table.historyPoints),
  ],
);

export type MarketRow = typeof markets.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type PriceQuoteRow = typeof priceQuotes.$inferSelect;
export type PriceHistoryRow = typeof priceHistoryDaily.$inferSelect;
export type IngestRunRow = typeof ingestRuns.$inferSelect;
export type SourceHealthRow = typeof sourceHealth.$inferSelect;
export type ItemStatsRow = typeof itemStats.$inferSelect;
