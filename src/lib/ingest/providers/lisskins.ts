import { z } from "zod";
import { HttpClient } from "@/lib/http";
import { getConfig } from "@/lib/config";
import type { Provider, ProviderResult, RawQuote } from "@/lib/ingest/types";
import { normalizePrice, normalizeVolume } from "@/lib/ingest/types";

/**
 * LIS-SKINS: documented public CS2 JSON price list.
 *
 * `csgo.json` is the compact, grouped export described in the official docs:
 * one row per market hash name with a price, unlocked_price and item count.
 * It does not require an API key. The authenticated `/v1/market/search` API
 * supports cursor pagination (200 results/page, 200 requests/minute), but its
 * docs warn that it can lag by several minutes and recommend WebSockets for
 * immediate listing events. We use the single-request export for scheduled
 * price snapshots; the export's timestamp/currency fields are not guaranteed.
 */
const priceEntrySchema = z
  .object({
    name: z.string().min(1),
    price: z.union([z.number(), z.string()]).optional(),
    unlocked_price: z.union([z.number(), z.string()]).nullable().optional(),
    count: z.union([z.number(), z.string()]).optional(),
    url: z.string().url().optional(),
  })
  .passthrough();

const listSchema = z.union([
  z.array(priceEntrySchema),
  z.object({
    items: z.array(priceEntrySchema),
    last_update: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
  }),
]);

function getFeedTime(value: string | number | undefined, fetchedAt: Date): Date {
  if (value === undefined) return fetchedAt;
  const numeric = typeof value === "number" ? value : Number(value);
  const parsed = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fetchedAt : parsed;
}

export function parseLisSkinsPriceList(
  payload: unknown,
  options: { currency?: string; fetchedAt?: Date } = {},
): RawQuote[] {
  const parsed = listSchema.parse(payload);
  const entries = Array.isArray(parsed) ? parsed : parsed.items;
  const capturedAt = getFeedTime(Array.isArray(parsed) ? undefined : parsed.last_update, options.fetchedAt ?? new Date());
  const currency = options.currency ?? "USD";
  const quotes: RawQuote[] = [];

  for (const entry of entries) {
    // `price` is the quoted price. The compact feed also exposes
    // `unlocked_price` as unlock-price information; do not substitute it for
    // the current quote because it may describe a different availability state.
    const price = normalizePrice(entry.price);
    if (price === null) continue;
    quotes.push({
      marketHashName: entry.name,
      marketId: "lisskins",
      priceKind: "lowest_ask",
      price,
      currency,
      volume: normalizeVolume(entry.count),
      capturedAt,
      sourceUrl: entry.url ?? `https://lis-skins.com/market/?search=${encodeURIComponent(entry.name)}`,
      note:
        "LIS-SKINS public grouped JSON export; quoted price field used. The feed's unlocked_price is a separate unlock-price value and is not substituted. Export does not consistently expose its upstream update time or currency, so captured_at is the feed timestamp when present, otherwise fetch time.",
    });
  }

  return quotes;
}

let client: HttpClient | null = null;

function getLisSkinsClient(): HttpClient {
  if (!client) {
    client = new HttpClient({
      sourceId: "lisskins",
      baseUrl: "https://lis-skins.com",
      minIntervalMs: 5_000,
      concurrency: 1,
      maxPerMinute: 12,
      maxRetries: 2,
      timeoutMs: getConfig().SYNC_REQUEST_TIMEOUT_MS,
    });
  }
  return client;
}

export const lisskinsProvider: Provider = {
  id: "lisskins",
  marketId: "lisskins",
  label: "LIS-SKINS",
  mode: "bulk",
  requiresCredentials: false,

  async fetchQuotes({ marketHashNames, signal }): Promise<ProviderResult> {
    const config = getConfig();
    const payload = await getLisSkinsClient().requestJson<unknown>("/market_export_json/csgo.json", { signal });
    const quotes = parseLisSkinsPriceList(payload, {
      currency: config.LISSKINS_PRICE_CURRENCY,
      fetchedAt: new Date(),
    });

    const filter = marketHashNames ? new Set(marketHashNames) : null;
    const selected = filter ? quotes.filter((quote) => filter.has(quote.marketHashName)) : quotes;
    if (selected.length === 0) {
      throw new Error("lisskins: экспорт не содержит валидных цен для каталога");
    }

    const rowCount = Array.isArray(payload)
      ? payload.length
      : typeof payload === "object" && payload !== null && Array.isArray((payload as { items?: unknown }).items)
        ? (payload as { items: unknown[] }).items.length
        : selected.length;

    return {
      quotes: selected,
      requests: 1,
      notes: `LIS-SKINS JSON price list: ${selected.length} котировок, записей в экспорте ${rowCount}; валюта ${config.LISSKINS_PRICE_CURRENCY}`,
    };
  },
};
