import { z } from "zod";
import { HttpClient } from "@/lib/http";
import { getConfig, hasCredential } from "@/lib/config";
import type { Provider, ProviderResult, RawQuote } from "@/lib/ingest/types";
import { normalizePrice, normalizeVolume } from "@/lib/ingest/types";

/**
 * BUFF163 — крупнейшая площадка (CNY) и ключевой ориентир азиатского рынка.
 *
 * Открытого API без авторизации нет: адаптер включается только при заданном
 * `BUFF_COOKIE` (сессия аккаунта). Оператор обязан соблюдать пользовательское
 * соглашение площадки; адаптер не обходит защиту, не подменяет отпечаток
 * клиента и ограничивает частоту запросов.
 *
 * Цены приходят в CNY и требуют курса для нормализации (см. `cs2_fx_rates`).
 */
const buffGoodsSchema = z.object({
  data: z
    .object({
      items: z.array(
        z
          .object({
            market_hash_name: z.string().min(1),
            sell_min_price: z.union([z.string(), z.number()]).optional(),
            sell_num: z.union([z.string(), z.number()]).optional(),
            buy_max_price: z.union([z.string(), z.number()]).optional(),
            goods_info: z.object({ info: z.object({ steam_market_hash_name: z.string().optional() }).optional() }).optional(),
            id: z.number().optional(),
          })
          .passthrough(),
      ),
    })
    .passthrough(),
});

export const buff163Provider: Provider = {
  id: "buff163",
  marketId: "buff163",
  label: "BUFF163",
  mode: "bulk",
  requiresCredentials: true,

  disabledReason() {
    if (!hasCredential(getConfig().BUFF_COOKIE)) {
      return "не задан BUFF_COOKIE (сессия аккаунта BUFF163); подключение требует договора с площадкой";
    }
    return null;
  },

  async fetchQuotes({ signal }): Promise<ProviderResult> {
    const config = getConfig();
    const client = new HttpClient({
      sourceId: "buff163",
      baseUrl: "https://buff.163.com",
      minIntervalMs: 3_000,
      concurrency: 1,
      maxPerMinute: 10,
      maxRetries: 2,
      defaultHeaders: {
        cookie: config.BUFF_COOKIE ?? "",
        referer: "https://buff.163.com/market/csgo",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    const capturedAt = new Date();
    const quotes: RawQuote[] = [];
    let requests = 0;

    // Постраничный обход: 80 позиций на страницу, ограничение — 40 страниц за прогон.
    for (let page = 1; page <= 40; page += 1) {
      const payload = await client.requestJson<unknown>(
        `/api/market/goods?game=csgo&page_num=${page}&page_size=80&sort_by=default`,
        { signal },
      );
      requests += 1;
      const parsed = buffGoodsSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`buff163: неожиданный формат ответа на странице ${page}`);
      }
      const rows = parsed.data.data.items;
      if (rows.length === 0) break;

      for (const row of rows) {
        const name = row.goods_info?.info?.steam_market_hash_name ?? row.market_hash_name;
        const price = normalizePrice(row.sell_min_price);
        if (!name || price === null) continue;
        quotes.push({
          marketHashName: name,
          marketId: "buff163",
          priceKind: "lowest_ask",
          price,
          currency: "CNY",
          volume: normalizeVolume(row.sell_num),
          capturedAt,
          sourceUrl: row.id ? `https://buff.163.com/goods/${row.id}` : "https://buff.163.com/market/csgo",
          note: "sell_min_price (CNY), нормализуется по курсу ЦБ",
        });
      }
      if (rows.length < 80) break;
    }

    return { quotes, requests, notes: `BUFF163: ${quotes.length} котировок (CNY)` };
  },
};
