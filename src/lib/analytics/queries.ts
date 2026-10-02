import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import { ensureItemStats } from "@/lib/analytics/stats";
import type {
  CatalogItem,
  CatalogResult,
  HistoryPoint,
  ItemDetail,
  ItemStats,
  PriceOffer,
} from "@/lib/analytics/types";

/** Политика свежести: котировка старше этого времени помечается как устаревшая. */
export const STALE_AFTER_HOURS = 14 * 24;

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function fetchRows<T>(db: Database, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows?: T[] } | T[];
  if (Array.isArray(result)) return result;
  return (result.rows ?? []) as T[];
}

/**
 * Материализованные показатели предмета (`cs2_item_stats`) обновляются после
 * импорта набора и каждой синхронизации — см. `refreshItemStats`. Благодаря
 * этому каталог не выполняет оконные функции по всей истории на каждый запрос.
 */
const STATS_JOIN = sql`left join cs2_item_stats s on s.item_id = i.id`;

function changePercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

/** Проценты уже посчитаны в показателях; вычисление — запасной путь. */
function resolveChange(stored: unknown, current: number | null, previous: unknown): number | null {
  const storedValue = toNumber(stored);
  if (storedValue !== null) return storedValue;
  return changePercent(current, toNumber(previous));
}

type CatalogRow = {
  id: number;
  slug: string;
  market_hash_name: string;
  name: string;
  kind: string;
  weapon: string | null;
  skin: string | null;
  category: string | null;
  rarity: string | null;
  rarity_color: string | null;
  collection: string | null;
  wear: string | null;
  stattrak: boolean;
  souvenir: boolean;
  min_float: string | null;
  max_float: string | null;
  image_url: string | null;
  best_price: string | null;
  best_market: string | null;
  market_count: number | null;
  average_price: string | null;
  last_captured_at: Date | string | null;
  last_price: string | null;
  price_7d: string | null;
  price_30d: string | null;
  change_7d: string | null;
  change_30d: string | null;
  points: number | null;
  series_noisy: boolean | null;
};

function mapCatalogRow(row: CatalogRow): CatalogItem {
  const lastPrice = toNumber(row.last_price);
  const best = toNumber(row.best_price);
  const reference = lastPrice ?? best;
  return {
    id: row.id,
    slug: row.slug,
    marketHashName: row.market_hash_name,
    name: row.name,
    kind: row.kind,
    weapon: row.weapon,
    skin: row.skin,
    category: row.category,
    rarity: row.rarity,
    rarityColor: row.rarity_color,
    collection: row.collection,
    wear: row.wear,
    stattrak: row.stattrak,
    souvenir: row.souvenir,
    minFloat: toNumber(row.min_float),
    maxFloat: toNumber(row.max_float),
    imageUrl: row.image_url,
    bestPriceUsd: best,
    bestMarketId: row.best_market,
    marketCount: row.market_count ?? 0,
    lastCapturedAt: toIso(row.last_captured_at),
    change7d: resolveChange(row.change_7d, reference, row.price_7d),
    change30d: resolveChange(row.change_30d, reference, row.price_30d),
    hasHistory: (row.points ?? 0) > 0,
    changeSuppressed: row.series_noisy === true,
    averagePriceUsd: toNumber(row.average_price),
  };
}

export type CatalogFilters = {
  query?: string;
  category?: string;
  weapon?: string;
  rarity?: string;
  collection?: string;
  wear?: string;
  kind?: string;
  stattrak?: boolean;
  souvenir?: boolean;
  minPrice?: number;
  maxPrice?: number;
  marketId?: string;
  requirePrice?: boolean;
  slugs?: string[];
  /** Минимальный прокси-показатель наблюдаемости (доля снимков с ценой, 0..100). */
  minPopularity?: number;
  /** Минимальное число точек истории — отсекает неликвидные предметы в лидерах. */
  minHistoryPoints?: number;
  sort?: string;
  page?: number;
  limit?: number;
};

const SORTS: Record<string, SQL> = {
  "price-asc": sql`s.best_price_usd asc nulls last, i.popularity desc, i.id asc`,
  "price-desc": sql`s.best_price_usd desc nulls last, i.popularity desc, i.id asc`,
  "change-asc": sql`s.change_7d asc nulls last, i.popularity desc`,
  "change-desc": sql`s.change_7d desc nulls last, i.popularity desc`,
  popularity: sql`i.popularity desc, i.id asc`,
  name: sql`i.name asc`,
  "markets-desc": sql`coalesce(s.market_count, 0) desc, i.popularity desc`,
  "updated-desc": sql`s.last_captured_at desc nulls last, i.popularity desc`,
};

function buildCatalogConditions(filters: CatalogFilters): SQL {
  const conditions: SQL[] = [];

  const query = filters.query?.trim();
  if (query) {
    const like = `%${query}%`;
    conditions.push(
      sql`(i.name ilike ${like} or i.collection ilike ${like} or i.weapon ilike ${like} or i.market_hash_name ilike ${like})`,
    );
  }
  if (filters.category) conditions.push(sql`i.category = ${filters.category}`);
  if (filters.kind) conditions.push(sql`i.kind = ${filters.kind}`);
  if (filters.weapon) conditions.push(sql`i.weapon = ${filters.weapon}`);
  if (filters.rarity) conditions.push(sql`i.rarity = ${filters.rarity}`);
  if (filters.collection) conditions.push(sql`i.collection = ${filters.collection}`);
  if (filters.wear) conditions.push(sql`i.wear = ${filters.wear}`);
  if (filters.stattrak) conditions.push(sql`i.stattrak = true`);
  if (filters.souvenir) conditions.push(sql`i.souvenir = true`);
  if (filters.minPrice !== undefined) conditions.push(sql`s.best_price_usd >= ${filters.minPrice}`);
  if (filters.maxPrice !== undefined) conditions.push(sql`s.best_price_usd <= ${filters.maxPrice}`);
  if (filters.requirePrice) conditions.push(sql`s.best_price_usd is not null`);
  if (filters.minPopularity !== undefined) conditions.push(sql`i.popularity >= ${filters.minPopularity}`);
  if (filters.minHistoryPoints !== undefined) conditions.push(sql`coalesce(s.history_points, 0) >= ${filters.minHistoryPoints}`);
  if (filters.slugs && filters.slugs.length > 0) {
    conditions.push(sql`i.slug in (${sql.join(filters.slugs.map((slug) => sql`${slug}`), sql`, `)})`);
  }
  if (filters.marketId) {
    conditions.push(sql`exists (
      select 1 from cs2_price_quotes q
      where q.item_id = i.id and q.market_id = ${filters.marketId}
    )`);
  }

  return conditions.length > 0 ? sql.join(conditions, sql` and `) : sql`true`;
}

export async function getCatalog(db: Database, filters: CatalogFilters = {}): Promise<CatalogResult> {
  await ensureItemStats(db);
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 30));
  const offset = (page - 1) * limit;
  const orderBy = SORTS[filters.sort ?? "popularity"] ?? SORTS.popularity;
  const where = buildCatalogConditions(filters);

  const rows = await fetchRows<CatalogRow>(
    db,
    sql`
      select
        i.id, i.slug, i.market_hash_name, i.name, i.kind, i.weapon, i.skin, i.category,
        i.rarity, i.rarity_color, i.collection, i.wear, i.stattrak, i.souvenir,
        i.min_float, i.max_float, i.image_url,
        s.best_price_usd as best_price, s.best_market_id as best_market, s.market_count,
        s.average_price_usd as average_price, s.last_captured_at,
        s.last_price_usd as last_price, s.price_7d_usd as price_7d, s.price_30d_usd as price_30d,
        s.change_7d, s.change_30d, s.history_points as points, s.series_noisy
      from cs2_items i
      ${STATS_JOIN}
      where ${where}
      order by ${orderBy}
      limit ${limit} offset ${offset}
    `,
  );

  const [totalRow] = await fetchRows<{ total: number }>(
    db,
    sql`
      select count(*)::int as total
      from cs2_items i
      ${STATS_JOIN}
      where ${where}
    `,
  );

  return {
    items: rows.map(mapCatalogRow),
    total: totalRow?.total ?? 0,
    page,
    limit,
    sort: filters.sort ?? "popularity",
  };
}

export async function getItemBySlugOrId(db: Database, identifier: string): Promise<{ id: number } | null> {
  const numericId = Number.parseInt(identifier, 10);
  const [row] = await fetchRows<{ id: number }>(
    db,
    Number.isSafeInteger(numericId) && numericId > 0 && String(numericId) === identifier
      ? sql`select id from cs2_items where id = ${numericId} limit 1`
      : sql`select id from cs2_items where slug = ${identifier} limit 1`,
  );
  return row ?? null;
}

export async function getHistory(
  db: Database,
  itemId: number,
  days = 365,
  marketId?: string,
): Promise<HistoryPoint[]> {
  // Диапазон отсчитывается от последнего наблюдения предмета, а не от текущей
  // даты: наборы построены на снимках, поэтому «последние 90 дней» должны
  // означать последние 90 дней данных, иначе свежий срез оказывается пустым.
  const [anchorRow] = await fetchRows<{ anchor: string | null }>(
    db,
    sql`select max(recorded_on) as anchor from cs2_price_history_daily where item_id = ${itemId}`,
  );
  const anchor = anchorRow?.anchor ? String(anchorRow.anchor).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const from = new Date(new Date(`${anchor}T00:00:00Z`).getTime() - Math.max(7, days) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rows = await fetchRows<{
    recorded_on: string;
    low_price: string;
    median_price: string | null;
    volume: number | null;
    market_id: string;
    price_kind: string;
    is_live: boolean;
  }>(
    db,
    marketId
      ? sql`
          select recorded_on, low_price, median_price, volume, market_id, price_kind, is_live
          from cs2_price_history_daily
          where item_id = ${itemId} and recorded_on >= ${from} and market_id = ${marketId}
          order by recorded_on asc
        `
      : sql`
          select recorded_on, low_price, median_price, volume, market_id, price_kind, is_live
          from cs2_price_history_daily
          where item_id = ${itemId} and recorded_on >= ${from}
          order by recorded_on asc
        `,
  );

  return rows.map((row) => ({
    date: typeof row.recorded_on === "string" ? row.recorded_on.slice(0, 10) : toIso(row.recorded_on)?.slice(0, 10) ?? "",
    lowPriceUsd: toNumber(row.low_price) ?? 0,
    medianPriceUsd: toNumber(row.median_price),
    volume: row.volume,
    marketId: row.market_id,
    priceKind: row.price_kind as HistoryPoint["priceKind"],
    isLive: row.is_live,
  }));
}

export async function getItemOffers(db: Database, itemId: number): Promise<PriceOffer[]> {
  const rows = await fetchRows<{
    market_id: string;
    market_name: string;
    market_short_name: string;
    integration_status: string;
    price_kind: string;
    price: string;
    currency: string;
    price_usd: string;
    volume: number | null;
    captured_at: Date | string;
    fetched_at: Date | string;
    source_url: string | null;
    is_live: boolean;
    note: string | null;
  }>(
    db,
    sql`
      with latest_quotes as (
        select distinct on (q.item_id, q.market_id)
          q.item_id, q.market_id, q.price_kind, q.price, q.currency, q.price_usd,
          q.volume, q.captured_at, q.fetched_at, q.source_url, q.is_live, q.note
        from cs2_price_quotes q
        where q.item_id = ${itemId}
        order by q.item_id, q.market_id, q.captured_at desc, q.id desc
      )
      select
        lq.market_id, m.name as market_name, m.short_name as market_short_name, m.integration_status,
        lq.price_kind, lq.price, lq.currency, lq.price_usd, lq.volume,
        lq.captured_at, lq.fetched_at, lq.source_url, lq.is_live, lq.note
      from latest_quotes lq
      join cs2_markets m on m.id = lq.market_id
      where lq.item_id = ${itemId}
      order by lq.price_usd asc
    `,
  );

  const now = Date.now();
  return rows.map((row) => {
    const capturedAt = toIso(row.captured_at) ?? new Date().toISOString();
    const ageHours = (now - new Date(capturedAt).getTime()) / 3_600_000;
    return {
      marketId: row.market_id,
      marketName: row.market_name,
      marketShortName: row.market_short_name,
      integrationStatus: row.integration_status,
      priceKind: row.price_kind as PriceOffer["priceKind"],
      price: toNumber(row.price) ?? 0,
      currency: row.currency,
      priceUsd: toNumber(row.price_usd) ?? 0,
      volume: row.volume,
      capturedAt,
      fetchedAt: toIso(row.fetched_at) ?? capturedAt,
      sourceUrl: row.source_url,
      isLive: row.is_live,
      note: row.note,
      isStale: ageHours > STALE_AFTER_HOURS,
      ageHours: Number(ageHours.toFixed(1)),
    };
  });
}

export async function getItemDetail(db: Database, identifier: string, historyDays = 365): Promise<ItemDetail | null> {
  const reference = await getItemBySlugOrId(db, identifier);
  if (!reference) return null;

  const [item] = await getCatalogItemsByIds(db, [reference.id]);
  if (!item) return null;

  const [offers, history, markets, storedStats] = await Promise.all([
    getItemOffers(db, reference.id),
    getHistory(db, reference.id, historyDays),
    fetchRows<{ id: string; name: string; integration_status: string; requires_credentials: boolean }>(
      db,
      sql`select id, name, integration_status, requires_credentials from cs2_markets where integration_status <> 'disabled' order by name asc`,
    ),
    getStoredStats(db, reference.id),
  ]);

  const quotedMarkets = new Set(offers.map((offer) => offer.marketId));
  const stats = computeStats(offers, history, storedStats);

  return {
    item,
    offers,
    history,
    stats,
    marketsWithoutQuotes: markets
      .filter((market) => !quotedMarkets.has(market.id))
      .map((market) => ({
        marketId: market.id,
        name: market.name,
        integrationStatus: market.integration_status,
        requiresCredentials: market.requires_credentials,
      })),
  };
}

export async function getCatalogItemsByIds(db: Database, ids: number[]): Promise<CatalogItem[]> {
  if (ids.length === 0) return [];
  await ensureItemStats(db);
  const rows = await fetchRows<CatalogRow>(
    db,
    sql`
      select
        i.id, i.slug, i.market_hash_name, i.name, i.kind, i.weapon, i.skin, i.category,
        i.rarity, i.rarity_color, i.collection, i.wear, i.stattrak, i.souvenir,
        i.min_float, i.max_float, i.image_url,
        s.best_price_usd as best_price, s.best_market_id as best_market, s.market_count,
        s.average_price_usd as average_price, s.last_captured_at,
        s.last_price_usd as last_price, s.price_7d_usd as price_7d, s.price_30d_usd as price_30d,
        s.change_7d, s.change_30d, s.history_points as points, s.series_noisy
      from cs2_items i
      ${STATS_JOIN}
      where i.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `,
  );
  return rows.map(mapCatalogRow);
}

type StoredStats = {
  change_7d: string | null;
  change_30d: string | null;
  change_90d: string | null;
  price_7d_date: string | null;
  price_30d_date: string | null;
  price_90d_date: string | null;
  history_from: string | null;
  history_to: string | null;
  points: number | null;
  series_noisy: boolean | null;
};

/**
 * Показатели предмета из материализованной таблицы: они считаются один раз
 * после импорта/синхронизации (`refreshItemStats`) и уже сглажены по выбросам.
 */
async function getStoredStats(db: Database, itemId: number): Promise<StoredStats | null> {
  const [row] = await fetchRows<StoredStats>(
    db,
    sql`
      select change_7d, change_30d, change_90d,
             price_7d_date, price_30d_date, price_90d_date,
             series_noisy, history_from, history_to, history_points as points
      from cs2_item_stats
      where item_id = ${itemId}
      limit 1
    `,
  );
  return row ?? null;
}

function toDay(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function computeStats(offers: PriceOffer[], history: HistoryPoint[], stored: StoredStats | null = null): ItemStats {
  const prices = offers.map((offer) => offer.priceUsd).filter((price) => price > 0);
  const best = prices.length > 0 ? Math.min(...prices) : null;
  const worst = prices.length > 0 ? Math.max(...prices) : null;
  const average = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;

  const sorted = [...history].sort((left, right) => left.date.localeCompare(right.date));
  const last = sorted.at(-1) ?? null;
  const findReference = (daysAgo: number): HistoryPoint | null => {
    if (!last) return null;
    const cutoff = new Date(new Date(`${last.date}T00:00:00Z`).getTime() - daysAgo * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const candidates = sorted.filter((point) => point.date <= cutoff);
    return candidates.at(-1) ?? null;
  };

  const current = last?.lowPriceUsd ?? best;
  const reference7d = findReference(7);
  const reference30d = findReference(30);
  const reference90d = findReference(90);

  // Приоритет — у материализованных (сглаженных) показателей; пересчёт по
  // загруженному окну истории остаётся запасным путём, если строки ещё нет.
  const hasStored = stored !== null && (stored.points ?? 0) > 0;
  return {
    bestPriceUsd: best,
    worstPriceUsd: worst,
    averagePriceUsd: average === null ? null : Number(average.toFixed(2)),
    spreadPercent:
      best !== null && worst !== null && best > 0 && prices.length > 1
        ? Number((((worst - best) / best) * 100).toFixed(2))
        : null,
    change7d: toNumber(stored?.change_7d) ?? changePercent(current ?? null, reference7d?.lowPriceUsd ?? null),
    change30d: toNumber(stored?.change_30d) ?? changePercent(current ?? null, reference30d?.lowPriceUsd ?? null),
    change90d: toNumber(stored?.change_90d) ?? changePercent(current ?? null, reference90d?.lowPriceUsd ?? null),
    change7dFrom: toDay(stored?.price_7d_date) ?? reference7d?.date ?? null,
    change30dFrom: toDay(stored?.price_30d_date) ?? reference30d?.date ?? null,
    change90dFrom: toDay(stored?.price_90d_date) ?? reference90d?.date ?? null,
    historyFrom: hasStored ? toDay(stored?.history_from) : sorted[0]?.date ?? null,
    historyTo: hasStored ? toDay(stored?.history_to) : last?.date ?? null,
    points: hasStored ? (stored?.points ?? 0) : sorted.length,
    changeSuppressed: stored?.series_noisy === true,
  };
}

export async function getFacets(db: Database): Promise<Record<string, Array<{ value: string; count: number }>>> {
  const dimension = async (column: SQL): Promise<Array<{ value: string; count: number }>> =>
    fetchRows<{ value: string; count: number }>(
      db,
      sql`
        select ${column} as value, count(*)::int as count
        from cs2_items
        where ${column} is not null and ${column} <> ''
        group by 1
        order by count desc, value asc
        limit 60
      `,
    );

  const [categories, weapons, rarities, collections, wears, kinds] = await Promise.all([
    dimension(sql`category`),
    dimension(sql`weapon`),
    dimension(sql`rarity`),
    dimension(sql`collection`),
    dimension(sql`wear`),
    dimension(sql`kind`),
  ]);

  return { categories, weapons, rarities, collections, wears, kinds };
}
