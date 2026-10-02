import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { items, markets, priceHistory, priceListings } from "@/db/schema";
import { DEMO_ITEMS, DEMO_MARKETS, makeHistoryRows, makeListingRows } from "@/lib/demo-data";
import type {
  DashboardSnapshot,
  HistoryPoint,
  ItemDetail,
  ItemSummary,
  MarketSummary,
  PriceOffer,
} from "@/lib/types";

let seedReady = false;
let seedPromise: Promise<void> | null = null;

function asNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function asIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function ensureDemoData(): Promise<void> {
  if (seedReady) return;
  if (!seedPromise) {
    seedPromise = seedDemoData()
      .then(() => {
        seedReady = true;
      })
      .finally(() => {
        seedPromise = null;
      });
  }
  await seedPromise;
}

async function seedDemoData(): Promise<void> {
  const [itemCount] = await db.select({ value: count() }).from(items);
  const [marketCount] = await db.select({ value: count() }).from(markets);
  if (itemCount.value >= DEMO_ITEMS.length && marketCount.value >= DEMO_MARKETS.length) return;

  await db.transaction(async (tx) => {
    await tx
      .insert(markets)
      .values(
        DEMO_MARKETS.map((market) => ({
          ...market,
          integrationStatus: "not_connected",
          integrationType: "Планируется",
          buyerFeePercent: null,
          sellerFeePercent: null,
          feeStatus: "unverified",
          kycPolicy: "Не проверена",
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(items)
      .values(
        DEMO_ITEMS.map((item) => ({
          slug: item.slug,
          marketHashName: item.name,
          name: item.name,
          weapon: item.weapon,
          skin: item.skin,
          category: item.category,
          rarity: item.rarity,
          collection: item.collection,
          wear: item.wear,
          stattrak: item.stattrak,
          souvenir: item.souvenir,
          paintSeed: item.paintSeed,
          floatValue: item.floatValue.toFixed(6),
          demand: item.demand,
          change24h: item.change24h.toFixed(2),
          artTheme: item.artTheme,
        })),
      )
      .onConflictDoNothing();

    const savedItems = await tx
      .select({ id: items.id, slug: items.slug })
      .from(items)
      .where(inArray(items.slug, DEMO_ITEMS.map((item) => item.slug)));
    const itemIds = new Map(savedItems.map((item) => [item.slug, item.id]));

    const allListings = DEMO_ITEMS.flatMap((item, itemIndex) => {
      const itemId = itemIds.get(item.slug);
      return itemId ? makeListingRows(itemId, itemIndex, item.basePrice) : [];
    });
    const allHistory = DEMO_ITEMS.flatMap((item, itemIndex) => {
      const itemId = itemIds.get(item.slug);
      return itemId ? makeHistoryRows(itemId, itemIndex, item.basePrice) : [];
    });

    if (allListings.length > 0) {
      await tx.insert(priceListings).values(allListings).onConflictDoNothing();
    }
    if (allHistory.length > 0) {
      await tx.insert(priceHistory).values(allHistory).onConflictDoNothing();
    }
  });
}

type ListingJoinRow = {
  id: number;
  itemId: number;
  marketId: string;
  marketName: string;
  marketShortName: string;
  region: string;
  currency: string;
  buyerPrice: string;
  sellerPayout: string;
  capturedAt: Date;
  isDemo: boolean;
};

function toItemSummary(
  item: typeof items.$inferSelect,
  itemListings: ListingJoinRow[],
): ItemSummary {
  const sorted = [...itemListings].sort((left, right) => asNumber(left.buyerPrice) - asNumber(right.buyerPrice));
  const best = sorted[0];

  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    weapon: item.weapon,
    skin: item.skin,
    category: item.category,
    rarity: item.rarity,
    collection: item.collection,
    wear: item.wear,
    stattrak: item.stattrak,
    souvenir: item.souvenir,
    paintSeed: item.paintSeed,
    floatValue: asNumber(item.floatValue),
    demand: item.demand,
    change24h: asNumber(item.change24h),
    artTheme: item.artTheme,
    currentPrice: best ? asNumber(best.buyerPrice) : 0,
    sellerPayout: best ? asNumber(best.sellerPayout) : 0,
    bestMarket: best?.marketName ?? "Нет данных",
    listingCount: itemListings.length,
    capturedAt: best ? asIsoString(best.capturedAt) : null,
  };
}

async function loadItemListingRows(itemIds?: number[]): Promise<ListingJoinRow[]> {
  if (itemIds && itemIds.length === 0) return [];

  const query = db
    .select({
      id: priceListings.id,
      itemId: priceListings.itemId,
      marketId: priceListings.marketId,
      marketName: markets.name,
      marketShortName: markets.shortName,
      region: priceListings.region,
      currency: priceListings.currency,
      buyerPrice: priceListings.buyerPrice,
      sellerPayout: priceListings.sellerPayout,
      capturedAt: priceListings.capturedAt,
      isDemo: priceListings.isDemo,
    })
    .from(priceListings)
    .innerJoin(markets, eq(priceListings.marketId, markets.id));

  const rows = itemIds
    ? await query.where(inArray(priceListings.itemId, itemIds))
    : await query;
  return rows as ListingJoinRow[];
}

function groupListings(rows: ListingJoinRow[]): Map<number, ListingJoinRow[]> {
  const grouped = new Map<number, ListingJoinRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.itemId) ?? [];
    current.push(row);
    grouped.set(row.itemId, current);
  }
  return grouped;
}

function toHistoryPoint(row: typeof priceHistory.$inferSelect): HistoryPoint {
  return {
    date: row.recordedOn,
    lowPrice: asNumber(row.lowPrice),
    medianPrice: asNumber(row.medianPrice),
    volume: row.volume,
  };
}

function toPriceOffer(row: ListingJoinRow): PriceOffer {
  return {
    id: row.id,
    marketId: row.marketId,
    marketName: row.marketName,
    marketShortName: row.marketShortName,
    region: row.region,
    currency: row.currency,
    buyerPrice: asNumber(row.buyerPrice),
    sellerPayout: asNumber(row.sellerPayout),
    capturedAt: asIsoString(row.capturedAt) ?? new Date().toISOString(),
    isDemo: row.isDemo,
  };
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  await ensureDemoData();

  const itemRows = await db.select().from(items).orderBy(desc(items.demand));
  const listingRows = await loadItemListingRows(itemRows.map((item) => item.id));
  const groupedListings = groupListings(listingRows);
  const mappedItems = itemRows.map((item) => toItemSummary(item, groupedListings.get(item.id) ?? []));
  const listingCounts = new Map<string, number>();
  for (const listing of listingRows) {
    listingCounts.set(listing.marketId, (listingCounts.get(listing.marketId) ?? 0) + 1);
  }

  const marketRows = await db.select().from(markets).orderBy(asc(markets.name));
  const mappedMarkets: MarketSummary[] = marketRows.map((market) => ({
    id: market.id,
    name: market.name,
    shortName: market.shortName,
    region: market.region,
    website: market.website,
    integrationStatus: market.integrationStatus,
    integrationType: market.integrationType,
    buyerFeePercent: market.buyerFeePercent === null ? null : asNumber(market.buyerFeePercent),
    sellerFeePercent: market.sellerFeePercent === null ? null : asNumber(market.sellerFeePercent),
    feeStatus: market.feeStatus,
    kycPolicy: market.kycPolicy,
    listingCount: listingCounts.get(market.id) ?? 0,
  }));

  const featuredItem = mappedItems.find((item) => item.slug === "ak-47-redline-field-tested") ?? mappedItems[0];
  const historyRows = featuredItem
    ? await db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.itemId, featuredItem.id))
        .orderBy(asc(priceHistory.recordedOn))
    : [];
  const latestCapture = listingRows.reduce<Date | null>((latest, listing) => {
    if (!latest || listing.capturedAt > latest) return listing.capturedAt;
    return latest;
  }, null);

  return {
    items: mappedItems,
    markets: mappedMarkets,
    history: historyRows.map(toHistoryPoint),
    featuredItemId: featuredItem?.id ?? 0,
    updatedAt: asIsoString(latestCapture) ?? new Date().toISOString(),
    metrics: {
      itemCount: mappedItems.length,
      marketCount: mappedMarkets.length,
      offerCount: listingRows.length,
      historyDays: historyRows.length,
    },
  };
}

export type ItemListFilters = {
  query?: string;
  category?: string;
  weapon?: string;
  rarity?: string;
  collection?: string;
  wear?: string;
  stattrak?: boolean;
  souvenir?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
};

export async function getItemsList(filters: ItemListFilters = {}) {
  await ensureDemoData();
  const conditions = [];
  const query = filters.query?.trim();

  if (query) {
    const match = `%${query}%`;
    conditions.push(
      or(
        ilike(items.name, match),
        ilike(items.collection, match),
        ilike(items.weapon, match),
      ),
    );
  }
  if (filters.category && filters.category !== "Все") {
    conditions.push(eq(items.category, filters.category));
  }
  if (filters.weapon && filters.weapon !== "Все оружие") {
    conditions.push(eq(items.weapon, filters.weapon));
  }
  if (filters.rarity && filters.rarity !== "Все редкости") {
    conditions.push(eq(items.rarity, filters.rarity));
  }
  if (filters.collection && filters.collection !== "Все коллекции") {
    conditions.push(eq(items.collection, filters.collection));
  }
  if (filters.wear && filters.wear !== "Все состояния") {
    conditions.push(eq(items.wear, filters.wear));
  }
  if (filters.stattrak) conditions.push(eq(items.stattrak, true));
  if (filters.souvenir) conditions.push(eq(items.souvenir, true));

  const itemRows = await db
    .select()
    .from(items)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(items.demand));
  const listingRows = await loadItemListingRows(itemRows.map((item) => item.id));
  const grouped = groupListings(listingRows);
  const mapped = itemRows.map((item) => toItemSummary(item, grouped.get(item.id) ?? []));

  if (filters.sort === "price-asc") mapped.sort((left, right) => left.currentPrice - right.currentPrice);
  if (filters.sort === "price-desc") mapped.sort((left, right) => right.currentPrice - left.currentPrice);
  if (filters.sort === "change") mapped.sort((left, right) => right.change24h - left.change24h);

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(60, Math.max(1, filters.limit ?? 30));
  const start = (page - 1) * limit;

  return {
    items: mapped.slice(start, start + limit),
    total: mapped.length,
    page,
    limit,
  };
}

export async function getItemDetail(itemId: number, historyDays = 365): Promise<ItemDetail | null> {
  await ensureDemoData();
  const [item] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!item) return null;

  const listings = await loadItemListingRows([itemId]);
  const offers = listings
    .sort((left, right) => asNumber(left.buyerPrice) - asNumber(right.buyerPrice))
    .map(toPriceOffer);
  const cutoff = new Date(Date.now() - Math.max(7, historyDays) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rows = await db
    .select()
    .from(priceHistory)
    .where(and(eq(priceHistory.itemId, itemId), gte(priceHistory.recordedOn, cutoff)))
    .orderBy(asc(priceHistory.recordedOn));

  return {
    item: toItemSummary(item, listings),
    offers,
    history: rows.map(toHistoryPoint),
  };
}

export async function getMarketDirectory(): Promise<MarketSummary[]> {
  await ensureDemoData();
  const [marketRows, listingRows] = await Promise.all([
    db.select().from(markets).orderBy(asc(markets.name)),
    db.select({ marketId: priceListings.marketId }).from(priceListings),
  ]);
  const counts = new Map<string, number>();
  for (const listing of listingRows) counts.set(listing.marketId, (counts.get(listing.marketId) ?? 0) + 1);

  return marketRows.map((market) => ({
    id: market.id,
    name: market.name,
    shortName: market.shortName,
    region: market.region,
    website: market.website,
    integrationStatus: market.integrationStatus,
    integrationType: market.integrationType,
    buyerFeePercent: market.buyerFeePercent === null ? null : asNumber(market.buyerFeePercent),
    sellerFeePercent: market.sellerFeePercent === null ? null : asNumber(market.sellerFeePercent),
    feeStatus: market.feeStatus,
    kycPolicy: market.kycPolicy,
    listingCount: counts.get(market.id) ?? 0,
  }));
}

export async function getAnalyticsSummary() {
  const snapshot = await getDashboardSnapshot();
  const movements = [...snapshot.items].sort((left, right) => right.change24h - left.change24h);
  const gains = movements.filter((item) => item.change24h > 0).length;
  const losses = movements.filter((item) => item.change24h < 0).length;
  const [historyStats] = await db
    .select({ days: count(), volume: sql<number>`coalesce(sum(${priceHistory.volume}), 0)::int` })
    .from(priceHistory)
    .where(eq(priceHistory.itemId, snapshot.featuredItemId));

  return {
    demo: true,
    capturedAt: snapshot.updatedAt,
    metrics: snapshot.metrics,
    marketBreadth: { advancing: gains, declining: losses },
    topMovers: movements.slice(0, 4),
    historyDays: historyStats?.days ?? 0,
    featuredVolume: historyStats?.volume ?? 0,
  };
}
