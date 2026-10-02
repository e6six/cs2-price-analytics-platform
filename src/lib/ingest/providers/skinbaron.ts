import { z } from "zod";
import { HttpClient } from "@/lib/http";
import { getConfig, hasCredential } from "@/lib/config";
import type { Provider, ProviderResult, RawQuote } from "@/lib/ingest/types";
import { normalizePrice } from "@/lib/ingest/types";

/** SkinBaron's documented GetExtendedPriceList response row. */
const priceEntrySchema = z
  .object({
    marketHashName: z.string().min(1),
    lowestPrice: z.union([z.number(), z.string()]).nullable().optional(),
    minWear: z.number().nullable().optional(),
    maxWear: z.number().nullable().optional(),
    imageUrl: z.string().url().optional(),
    dopplerClassName: z.string().optional(),
  })
  .passthrough();

export function parseSkinBaronPriceList(
  payload: unknown,
  options: { currency?: string; capturedAt?: Date } = {},
): RawQuote[] {
  const rows = z.array(priceEntrySchema).parse(payload);
  const capturedAt = options.capturedAt ?? new Date();
  const currency = options.currency ?? "EUR";
  const quotes: RawQuote[] = [];

  for (const row of rows) {
    const price = normalizePrice(row.lowestPrice);
    if (price === null) continue;
    quotes.push({
      marketHashName: row.marketHashName,
      marketId: "skinbaron",
      priceKind: "lowest_ask",
      price,
      currency,
      capturedAt,
      sourceUrl: `https://skinbaron.de/en/csgo?search=${encodeURIComponent(row.marketHashName)}`,
      note:
        "SkinBaron GetExtendedPriceList lowestPrice. The official response schema does not include a currency field; currency is taken from SKINBARON_PRICE_CURRENCY and must be verified by the operator.",
    });
  }

  return quotes;
}

let client: HttpClient | null = null;

function getSkinBaronClient(): HttpClient {
  if (!client) {
    client = new HttpClient({
      sourceId: "skinbaron",
      baseUrl: "https://api.skinbaron.de",
      minIntervalMs: 10_000,
      concurrency: 1,
      maxPerMinute: 6,
      maxRetries: 2,
      timeoutMs: getConfig().SYNC_REQUEST_TIMEOUT_MS,
      defaultHeaders: {
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
        accept: "application/json",
      },
    });
  }
  return client;
}

export const skinbaronProvider: Provider = {
  id: "skinbaron",
  marketId: "skinbaron",
  label: "SkinBaron",
  mode: "bulk",
  requiresCredentials: true,

  disabledReason() {
    if (!hasCredential(getConfig().SKINBARON_API_KEY)) {
      return "не задан SKINBARON_API_KEY (создаётся в профиле SkinBaron)";
    }
    return null;
  },

  async fetchQuotes({ marketHashNames, signal }): Promise<ProviderResult> {
    const config = getConfig();
    if (!hasCredential(config.SKINBARON_API_KEY)) {
      throw new Error("skinbaron: требуется SKINBARON_API_KEY");
    }

    const payload = await getSkinBaronClient().requestJson<unknown>("/GetExtendedPriceList", {
      method: "POST",
      body: JSON.stringify({ apikey: config.SKINBARON_API_KEY, appId: 730 }),
      signal,
    });
    const quotes = parseSkinBaronPriceList(payload, {
      currency: config.SKINBARON_PRICE_CURRENCY,
      capturedAt: new Date(),
    });
    const filter = marketHashNames ? new Set(marketHashNames) : null;
    const selected = filter ? quotes.filter((quote) => filter.has(quote.marketHashName)) : quotes;
    if (selected.length === 0) {
      throw new Error("skinbaron: GetExtendedPriceList не вернул валидных котировок каталога");
    }

    return {
      quotes: selected,
      requests: 1,
      notes: `SkinBaron GetExtendedPriceList: ${selected.length} котировок; валюта ${config.SKINBARON_PRICE_CURRENCY} задаётся оператором, так как API её не возвращает`,
    };
  },
};
