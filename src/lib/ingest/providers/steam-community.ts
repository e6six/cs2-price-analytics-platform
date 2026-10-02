import { z } from "zod";
import { HttpClient } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getConfig } from "@/lib/config";
import type { Provider, ProviderResult, RawQuote } from "@/lib/ingest/types";
import { normalizePrice, normalizeVolume } from "@/lib/ingest/types";

/**
 * Steam Community Market — `priceoverview`.
 *
 * Публичный, но неофициальный и жёстко ограниченный по частоте запросов
 * эндпоинт: отдаёт минимальную цену лота, медиану продаж и объём.
 * Корректная работа требует пауз между запросами, поэтому адаптер работает
 * по предметам (`mode: "item"`) и используется для точечного обновления.
 *
 * Цена возвращается в валюте, заданной `currency` (ISO 4217 numeric),
 * объём — строкой вида "1,234".
 */
const STEAM_CURRENCY_CODES: Record<string, number> = {
  USD: 1,
  GBP: 2,
  EUR: 3,
  CHF: 4,
  RUB: 5,
  PLN: 6,
  BRL: 7,
  JPY: 8,
  NOK: 9,
  SEK: 10,
  TRY: 11,
  UAH: 14,
  AUD: 21,
  CAD: 20,
  CNY: 23,
  INR: 24,
};

const MAJOR_UNITS = new Set(["USD", "EUR", "GBP", "CHF", "AUD", "CAD", "NOK", "SEK", "PLN", "BRL", "TRY", "CNY", "UAH"]);

const priceOverviewSchema = z.object({
  success: z.boolean(),
  lowest_price: z.string().optional(),
  median_price: z.string().optional(),
  volume: z.string().optional(),
});

export const steamCommunityProvider: Provider = {
  id: "steam-community",
  marketId: "steam-community",
  label: "Steam Community Market",
  mode: "item",
  requiresCredentials: false,

  async fetchQuotes({ marketHashNames, limit, signal }): Promise<ProviderResult> {
    const config = getConfig();
    if (!marketHashNames || marketHashNames.length === 0) {
      throw new Error("steam-community требует список market_hash_name (режим item)");
    }

    const client = new HttpClient({
      sourceId: "steam-community",
      baseUrl: "https://steamcommunity.com",
      minIntervalMs: 4_000,
      concurrency: 1,
      maxPerMinute: 12,
      maxRetries: 3,
      timeoutMs: config.SYNC_REQUEST_TIMEOUT_MS,
    });

    const targets = marketHashNames.slice(0, limit ?? marketHashNames.length);
    const quotes: RawQuote[] = [];
    const missing: string[] = [];
    let requests = 0;
    let rateLimited = false;

    for (const name of targets) {
      if (signal?.aborted) break;
      if (rateLimited) {
        missing.push(name);
        continue;
      }

      const url = `/market/priceoverview/?appid=730&currency=${STEAM_CURRENCY_CODES.USD}&market_hash_name=${encodeURIComponent(name)}`;
      try {
        requests += 1;
        const payload = priceOverviewSchema.parse(await client.requestJson<unknown>(url));
        if (!payload.success) {
          missing.push(name);
          continue;
        }

        const lowest = normalizePrice(payload.lowest_price ?? payload.median_price);
        if (lowest === null) {
          missing.push(name);
          continue;
        }

        quotes.push({
          marketHashName: name,
          marketId: "steam-community",
          priceKind: "lowest_ask",
          price: lowest,
          currency: "USD",
          volume: normalizeVolume(payload.volume),
          capturedAt: new Date(),
          sourceUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`,
          note: "минимальная цена лота в Steam Community Market (валюта USD)",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("429")) rateLimited = true;
        logger.warn("steam-community: предмет пропущен", { name, error: message });
        missing.push(name);
      }
    }

    return {
      quotes,
      requests,
      missing,
      notes: rateLimited
        ? "Steam вернул 429: оставшиеся предметы перенесены на следующий прогон"
        : `запрошено ${targets.length} предметов`,
    };
  },
};

export { MAJOR_UNITS };
