import { z } from "zod";
import { HttpClient } from "@/lib/http";
import type { Provider, ProviderResult, RawQuote } from "@/lib/ingest/types";
import { normalizePrice, normalizeVolume } from "@/lib/ingest/types";

/**
 * Skinport — публичный API каталога (`GET /v1/items`).
 *
 * Официальные условия: авторизация не требуется, ответ кэшируется 5 минут,
 * лимит 8 запросов за 5 минут, обязателен заголовок `Accept-Encoding: br`.
 * Один запрос возвращает весь каталог — это основной bulk-источник.
 *
 * `min_price` — минимальная цена выставленного лота (цена покупателя);
 * `suggested_price` — рекомендованная цена для продавца, не котировка.
 */
const skinportItemSchema = z
  .object({
    market_hash_name: z.string().min(1),
    currency: z.string().min(3).max(3).optional(),
    suggested_price: z.number().nullable().optional(),
    min_price: z.number().nullable().optional(),
    median_price: z.number().nullable().optional(),
    mean_price: z.number().nullable().optional(),
    quantity: z.number().nullable().optional(),
    market_page: z.string().optional(),
    item_page: z.string().optional(),
    updated_at: z.number().optional(),
  })
  .passthrough();

const skinportResponseSchema = z.array(skinportItemSchema);

export const skinportProvider: Provider = {
  id: "skinport",
  marketId: "skinport",
  label: "Skinport",
  mode: "bulk",
  requiresCredentials: false,

  async fetchQuotes({ marketHashNames, signal }): Promise<ProviderResult> {
    const client = new HttpClient({
      sourceId: "skinport",
      baseUrl: "https://api.skinport.com",
      minIntervalMs: 5_000,
      concurrency: 1,
      maxPerMinute: 1,
      maxRetries: 3,
      defaultHeaders: {
        // Skinport отвечает 406 без Brotli; undici распаковывает br автоматически.
        "accept-encoding": "br",
        accept: "application/json",
      },
    });

    const payload = await client.requestJson<unknown>(
      "/v1/items?app_id=730&currency=USD&tradable=1",
      { signal },
    );
    const parsed = skinportResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`skinport: неожиданный формат ответа (${parsed.error.issues[0]?.message ?? "schema"})`);
    }

    const filter = marketHashNames ? new Set(marketHashNames) : null;
    const capturedAt = new Date();
    const quotes: RawQuote[] = [];

    for (const entry of parsed.data) {
      if (filter && !filter.has(entry.market_hash_name)) continue;
      const price = normalizePrice(entry.min_price);
      if (price === null) continue; // Нет лотов — это не «цена 0», а отсутствие данных.

      quotes.push({
        marketHashName: entry.market_hash_name,
        marketId: "skinport",
        priceKind: "lowest_ask",
        price,
        currency: entry.currency ?? "USD",
        volume: normalizeVolume(entry.quantity),
        capturedAt,
        sourceUrl: entry.market_page ?? `https://skinport.com/market?search=${encodeURIComponent(entry.market_hash_name)}`,
        note: "min_price — минимальная цена лота на Skinport; комиссия продавца удерживается площадкой",
      });
    }

    return {
      quotes,
      requests: 1,
      notes: `получено ${parsed.data.length} позиций каталога Skinport`,
    };
  },
};

export { skinportItemSchema };
