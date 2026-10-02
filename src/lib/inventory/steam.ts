import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { fetchRows } from "@/lib/analytics/queries";
import type { InventoryItemView, InventoryPriceView, InventoryValuation } from "@/lib/analytics/types";
import { getSteamHttpClient } from "@/lib/steam/http-client";

const PAGE_SIZE = 2_000;
const MAX_PAGES = 10;
const INVENTORY_CACHE_MS = 60_000;
const PRICE_STALE_AFTER_HOURS = 24;

const idSchema = z.union([z.string(), z.number()]).transform(String);
const flagSchema = z.union([z.boolean(), z.number(), z.string()]);
const assetSchema = z
  .object({
    assetid: idSchema,
    classid: idSchema,
    instanceid: idSchema.nullable().optional(),
    amount: idSchema.nullable().optional(),
  })
  .passthrough();
const descriptionSchema = z
  .object({
    classid: idSchema,
    instanceid: idSchema.nullable().optional(),
    market_hash_name: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    icon_url: z.string().nullable().optional(),
    marketable: flagSchema.nullable().optional(),
  })
  .passthrough();
const inventoryPageSchema = z
  .object({
    success: z.boolean().optional(),
    assets: z.array(assetSchema).optional().default([]),
    descriptions: z.array(descriptionSchema).optional().default([]),
    more_items: flagSchema.nullable().optional(),
    last_assetid: idSchema.nullable().optional(),
    total_inventory_count: z.union([z.number(), z.string()]).nullable().optional(),
    error: z.string().nullable().optional(),
    Error: z.string().nullable().optional(),
  })
  .passthrough();

type SteamInventoryGroup = {
  name: string;
  marketHashName: string | null;
  imageUrl: string | null;
  amount: number;
  assetCount: number;
  marketable: boolean;
};

type SteamInventorySnapshot = {
  groups: SteamInventoryGroup[];
  fetchedAt: string;
  pagesFetched: number;
  truncated: boolean;
  totalInventoryCount: number | null;
};

type CachedSnapshot = { expiresAt: number; promise?: Promise<SteamInventorySnapshot>; data?: SteamInventorySnapshot };
const inventoryCache = new Map<string, CachedSnapshot>();

export class PrivateSteamInventoryError extends Error {
  constructor() {
    super("Steam сообщает, что CS2-инвентарь закрыт для просмотра.");
    this.name = "PrivateSteamInventoryError";
  }
}

export function parseSteamInventoryPage(payload: unknown): z.infer<typeof inventoryPageSchema> {
  const page = inventoryPageSchema.parse(payload);
  const pageError = page.error ?? page.Error ?? null;
  if (page.success === false && /private|not public|не открыт/i.test(pageError ?? "")) {
    throw new PrivateSteamInventoryError();
  }
  if (page.success === false || pageError) {
    throw new Error(pageError || "Steam не вернул публичный CS2-инвентарь.");
  }
  return page;
}

/** Возвращает только SteamID64; vanity URL требует ключ Steam Web API и здесь не принимается. */
export function normalizeSteamId64(value: string): string | null {
  const input = value.trim();
  const profileMatch = input.match(/^https?:\/\/steamcommunity\.com\/profiles\/(\d{17})(?:\/.*)?$/i);
  const steamId = profileMatch?.[1] ?? input;
  return /^7656119\d{10}$/.test(steamId) ? steamId : null;
}

function flag(value: boolean | number | string | null | undefined): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function toImageUrl(iconUrl: string | null | undefined): string | null {
  if (!iconUrl) return null;
  if (iconUrl.startsWith("https://") || iconUrl.startsWith("http://")) return iconUrl;
  return `https://community.akamai.steamstatic.com/economy/image/${iconUrl}`;
}

function cacheInventorySnapshot(steamId64: string, promise: Promise<SteamInventorySnapshot>): Promise<SteamInventorySnapshot> {
  const cached: CachedSnapshot = { expiresAt: Number.POSITIVE_INFINITY, promise };
  inventoryCache.set(steamId64, cached);
  while (inventoryCache.size > 100) {
    const oldest = inventoryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    inventoryCache.delete(oldest);
  }
  return promise
    .then((data) => {
      const current = inventoryCache.get(steamId64);
      if (current === cached) {
        current.data = data;
        current.promise = undefined;
        current.expiresAt = Date.now() + INVENTORY_CACHE_MS;
      }
      return data;
    })
    .catch((error) => {
      if (inventoryCache.get(steamId64) === cached) inventoryCache.delete(steamId64);
      throw error;
    });
}

/**
 * Reads only public Steam inventory pages. It does not authenticate, use cookies,
 * or bypass privacy/rate-limit controls. Steam's page size is capped at 2,000;
 * this service stops after 10 pages and reports if the response was truncated.
 */
export async function fetchPublicSteamInventory(
  steamId64: string,
  signal?: AbortSignal,
): Promise<SteamInventorySnapshot> {
  const now = Date.now();
  const current = inventoryCache.get(steamId64);
  if (current && current.expiresAt > now) {
    if (current.data) return current.data;
    if (current.promise) return current.promise;
  }

  const promise = (async (): Promise<SteamInventorySnapshot> => {
    const client = getSteamHttpClient();
    const assets: z.infer<typeof assetSchema>[] = [];
    const descriptions = new Map<string, z.infer<typeof descriptionSchema>>();
    let startAssetId: string | undefined;
    let totalInventoryCount: number | null = null;
    let pagesFetched = 0;
    let truncated = false;

    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      const url = new URL(`/inventory/${steamId64}/730/2`, "https://steamcommunity.com");
      url.searchParams.set("l", "english");
      url.searchParams.set("count", String(PAGE_SIZE));
      if (startAssetId) url.searchParams.set("start_assetid", startAssetId);

      const raw = await client.requestJson<unknown>(url.toString(), { signal });
      const page = parseSteamInventoryPage(raw);
      pagesFetched += 1;
      assets.push(...page.assets);
      for (const description of page.descriptions) {
        descriptions.set(`${description.classid}_${description.instanceid ?? "0"}`, description);
      }

      const total = page.total_inventory_count == null ? Number.NaN : Number(page.total_inventory_count);
      if (Number.isFinite(total) && total >= 0) totalInventoryCount = total;
      const hasMore = flag(page.more_items);
      if (!hasMore) break;

      const nextAssetId = page.last_assetid;
      if (!nextAssetId || nextAssetId === startAssetId) {
        throw new Error("Steam вернул некорректный курсор инвентаря; повторите запрос позже.");
      }
      if (pageNumber === MAX_PAGES - 1) {
        truncated = true;
        break;
      }
      startAssetId = nextAssetId;
    }

    const groups = new Map<string, SteamInventoryGroup>();
    for (const asset of assets) {
      const description = descriptions.get(`${asset.classid}_${asset.instanceid ?? "0"}`);
      const marketHashName = description?.market_hash_name?.trim() || null;
      const name = marketHashName ?? description?.name?.trim() ?? `Предмет ${asset.classid}`;
      const marketable = flag(description?.marketable);
      const amount = Math.max(1, Number(asset.amount) || 1);
      const key = `${marketHashName ?? `${asset.classid}_${asset.instanceid ?? "0"}`}::${marketable ? "marketable" : "not-marketable"}`;
      const existing = groups.get(key);
      if (existing) {
        existing.amount += amount;
        existing.assetCount += 1;
        if (!existing.imageUrl) existing.imageUrl = toImageUrl(description?.icon_url);
      } else {
        groups.set(key, {
          name,
          marketHashName,
          imageUrl: toImageUrl(description?.icon_url),
          amount,
          assetCount: 1,
          marketable,
        });
      }
    }

    return {
      groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
      fetchedAt: new Date().toISOString(),
      pagesFetched,
      truncated,
      totalInventoryCount,
    };
  })();

  return cacheInventorySnapshot(steamId64, promise);
}

type InventoryQuoteRow = {
  market_hash_name: string;
  market_id: string;
  price: string;
  currency: string;
  price_usd: string;
  captured_at: Date | string;
  source_url: string | null;
  is_live: boolean;
};

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mapQuote(row: InventoryQuoteRow, now: number): InventoryPriceView {
  const capturedAt = toIso(row.captured_at);
  const ageHours = Math.max(0, (now - new Date(capturedAt).getTime()) / 3_600_000);
  return {
    marketId: row.market_id,
    price: Number(row.price),
    currency: row.currency,
    priceUsd: Number(row.price_usd),
    capturedAt,
    sourceUrl: row.source_url,
    isLive: row.is_live,
    ageHours: Number(ageHours.toFixed(1)),
    isStale: ageHours > PRICE_STALE_AFTER_HOURS,
  };
}

function sumValue(items: InventoryItemView[], source: "steam" | "external"): number {
  const total = items.reduce((sum, item) => {
    const price = item.marketable ? item[source]?.priceUsd : undefined;
    return sum + (price ? price * item.amount : 0);
  }, 0);
  return Number(total.toFixed(2));
}

export function calculateInventoryTotals(items: InventoryItemView[]): InventoryValuation["totals"] {
  return {
    assets: items.reduce((sum, item) => sum + item.amount, 0),
    marketableAssets: items.reduce((sum, item) => sum + (item.marketable ? item.amount : 0), 0),
    unmarketableAssets: items.reduce((sum, item) => sum + (item.marketable ? 0 : item.amount), 0),
    steamPricedAssets: items.reduce((sum, item) => sum + (item.marketable && item.steam ? item.amount : 0), 0),
    externalPricedAssets: items.reduce((sum, item) => sum + (item.marketable && item.external ? item.amount : 0), 0),
    steamValueUsd: sumValue(items, "steam"),
    externalValueUsd: sumValue(items, "external"),
  };
}

/** Joins public Steam inventory names to the most recent price per market in our DB. */
export async function valueSteamInventory(
  db: Database,
  steamId64: string,
  snapshot: SteamInventorySnapshot,
): Promise<InventoryValuation> {
  const names = [...new Set(snapshot.groups.map((item) => item.marketHashName).filter((name): name is string => Boolean(name)))];
  const priceRows: InventoryQuoteRow[] = [];
  for (let offset = 0; offset < names.length; offset += 400) {
    const batch = names.slice(offset, offset + 400);
    const rows = await fetchRows<InventoryQuoteRow>(
      db,
      sql`
        select distinct on (i.market_hash_name, q.market_id)
          i.market_hash_name,
          q.market_id,
          q.price,
          q.currency,
          q.price_usd,
          q.captured_at,
          q.source_url,
          q.is_live
        from cs2_items i
        join cs2_price_quotes q on q.item_id = i.id
        where i.market_hash_name in (${sql.join(batch.map((name) => sql`${name}`), sql`, `)})
        order by i.market_hash_name, q.market_id, q.captured_at desc, q.id desc
      `,
    );
    priceRows.push(...rows);
  }

  const quotesByName = new Map<string, InventoryPriceView[]>();
  const now = Date.now();
  for (const row of priceRows) {
    const list = quotesByName.get(row.market_hash_name) ?? [];
    list.push(mapQuote(row, now));
    quotesByName.set(row.market_hash_name, list);
  }

  const items: InventoryItemView[] = snapshot.groups.map((group) => {
    const quotes = group.marketHashName ? quotesByName.get(group.marketHashName) ?? [] : [];
    const steam = quotes.find((quote) => quote.marketId === "steam-community") ?? null;
    const external =
      quotes
        .filter((quote) => quote.marketId !== "steam-community" && quote.priceUsd > 0)
        .sort((a, b) => a.priceUsd - b.priceUsd)[0] ?? null;
    return {
      ...group,
      steam,
      external,
    };
  });

  const totals = calculateInventoryTotals(items);

  return {
    steamId64,
    fetchedAt: snapshot.fetchedAt,
    pagesFetched: snapshot.pagesFetched,
    truncated: snapshot.truncated,
    totalInventoryCount: snapshot.totalInventoryCount,
    totals,
    items,
  };
}
