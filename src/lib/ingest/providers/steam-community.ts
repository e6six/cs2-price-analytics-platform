import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSteamHttpClient } from "@/lib/steam/http-client";
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

/** Steam в разных эндпоинтах отдаёт булевы флаги то boolean, то 1/0, то строкой. */
const flagSchema = z.union([z.boolean(), z.number(), z.string()]);

const priceOverviewSchema = z
  .object({
    // Steam отдаёт success то boolean, то числом 1/0, то строкой.
    success: flagSchema.nullable().optional(),
    lowest_price: z.string().nullable().optional(),
    median_price: z.string().nullable().optional(),
    volume: z.string().nullable().optional(),
  })
  .passthrough();

export type SteamPriceOverview = z.infer<typeof priceOverviewSchema>;

/**
 * Разбор ответа `priceoverview`. Отсутствие `success` — не отказ: решение
 * принимается по наличию `lowest_price`, иначе котировка не выдумывается.
 */
export function parseSteamPriceOverview(payload: unknown): SteamPriceOverview {
  try {
    return priceOverviewSchema.parse(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error("Steam вернул ответ priceoverview в неожиданном формате; повторите запрос позже.");
    }
    throw error;
  }
}

/**
 * true только для явного отказа Steam: `false`, `0`, `"0"`, `"false"`.
 * `undefined`/`null` и любые другие значения отказом не считаются.
 */
export function steamSuccessIsFalse(value: unknown): boolean {
  return value === false || value === 0 || value === "0" || value === "false";
}

export const steamCommunityProvider: Provider = {
  id: "steam-community",
  marketId: "steam-community",
  label: "Steam Community Market",
  mode: "item",
  requiresCredentials: false,

  async fetchQuotes({ marketHashNames, limit, signal }): Promise<ProviderResult> {
    if (!marketHashNames || marketHashNames.length === 0) {
      throw new Error("steam-community требует список market_hash_name (режим item)");
    }

    // Shared with public inventory requests so we cannot accidentally apply
    // separate per-process rate limits to different Steam endpoints.
    const client = getSteamHttpClient();

    const targets = marketHashNames.slice(0, limit ?? marketHashNames.length);
    const quotes: RawQuote[] = [];
    const missing: string[] = [];
    let requests = 0;
    let rateLimited = false;
    const errorMessages = new Set<string>();

    for (const name of targets) {
      if (signal?.aborted) break;
      if (rateLimited) {
        missing.push(name);
        continue;
      }

      const url = `/market/priceoverview/?appid=730&currency=${STEAM_CURRENCY_CODES.USD}&market_hash_name=${encodeURIComponent(name)}`;
      try {
        requests += 1;
        const payload = parseSteamPriceOverview(await client.requestJson<unknown>(url));
        // Явный отказ (0/false/"false") — пропуск; отсутствие поля решается по lowest_price.
        if (steamSuccessIsFalse(payload.success)) {
          missing.push(name);
          continue;
        }

        // Не подменяем минимальный лот медианой продаж: это разные типы цен.
        const lowest = normalizePrice(payload.lowest_price);
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
          note: "lowest_price из Steam Community Market priceoverview (валюта USD); цена в Steam Wallet, а не денежная выплата",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errorMessages.add(message);
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
        ? `Steam вернул 429: обработано ${quotes.length} из ${targets.length}; оставшиеся предметы перенесены на следующий прогон`
        : errorMessages.size > 0
          ? `запрошено ${targets.length}, получено ${quotes.length}; ошибки Steam: ${[...errorMessages].join("; ")}`
          : `запрошено ${targets.length}, получено ${quotes.length} котировок, без активной lowest_price: ${missing.length}`,
    };
  },
};

export { MAJOR_UNITS };
