import { z } from "zod";
import { HttpClient } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { Provider, ProviderResult, RawQuote } from "@/lib/ingest/types";
import { normalizePrice, normalizeVolume } from "@/lib/ingest/types";

/**
 * CSFloat — публичный API (без ключа для чтения каталога).
 *
 * Основной путь — bulk-эндпоинт `/api/v1/listings/price-list`: одна пачка
 * минимальных цен по всему каталогу. Формат эндпоинта не покрыт официальной
 * документацией, поэтому ответ разбирается строго и пофакторно: некорректные
 * записи отбрасываются, а если валидных нет вовсе — прогон помечается ошибкой,
 * чтобы в базу не попали выдуманные числа.
 *
 * Цены CSFloat передаются в центах USD; в базу пишутся как USD.
 */
const priceListEntrySchema = z
  .object({
    market_hash_name: z.string().min(1).optional(),
    marketHashName: z.string().min(1).optional(),
    min_price: z.number().nullable().optional(),
    minPrice: z.number().nullable().optional(),
    price: z.number().nullable().optional(),
    quantity: z.number().nullable().optional(),
    count: z.number().nullable().optional(),
  })
  .passthrough();

const priceListResponseSchema = z.union([z.array(priceListEntrySchema), z.object({ data: z.array(priceListEntrySchema) })]);

export const csfloatProvider: Provider = {
  id: "csfloat",
  marketId: "csfloat",
  label: "CSFloat",
  mode: "bulk",
  requiresCredentials: false,

  async fetchQuotes({ marketHashNames, signal }): Promise<ProviderResult> {
    const client = new HttpClient({
      sourceId: "csfloat",
      baseUrl: "https://csfloat.com",
      minIntervalMs: 12_000,
      concurrency: 1,
      maxPerMinute: 5,
      maxRetries: 3,
    });

    const payload = await client.requestJson<unknown>("/api/v1/listings/price-list", { signal });
    const parsed = priceListResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("csfloat: неожиданный формат ответа price-list");
    }

    const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
    const filter = marketHashNames ? new Set(marketHashNames) : null;
    const capturedAt = new Date();
    const quotes: RawQuote[] = [];
    let invalid = 0;

    for (const row of rows) {
      const name = row.market_hash_name ?? row.marketHashName;
      const cents = row.min_price ?? row.minPrice ?? row.price;
      if (!name || typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) {
        invalid += 1;
        continue;
      }
      if (filter && !filter.has(name)) continue;

      const price = normalizePrice(cents / 100);
      if (price === null) {
        invalid += 1;
        continue;
      }

      quotes.push({
        marketHashName: name,
        marketId: "csfloat",
        priceKind: "lowest_ask",
        price,
        currency: "USD",
        volume: normalizeVolume(row.quantity ?? row.count),
        capturedAt,
        sourceUrl: `https://csfloat.com/search?market_hash_name=${encodeURIComponent(name)}`,
        note: "цена в центах USD, приведена к долларам",
      });
    }

    if (quotes.length === 0) {
      throw new Error(`csfloat: не разобрано ни одной котировки (записей: ${rows.length}, отброшено: ${invalid})`);
    }
    if (invalid > 0) logger.warn("csfloat: часть записей пропущена", { invalid, total: rows.length });

    return {
      quotes,
      requests: 1,
      notes: `price-list: ${quotes.length} котировок, отброшено ${invalid}`,
    };
  },
};
