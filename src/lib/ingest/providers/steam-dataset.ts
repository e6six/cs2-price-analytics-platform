import { z } from "zod";
import { HttpClient } from "@/lib/http";
import { getConfig, hasCredential } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { Provider, ProviderResult, RawQuote } from "@/lib/ingest/types";

/**
 * Массовый источник цен Steam — открытый датасет
 * `ByMykel/counter-strike-price-tracker` (лицензия MIT), который собирается из
 * того же `priceoverview` Steam Community Market.
 *
 * Зачем он нужен: Steam не отдаёт прайс-лист целиком, а поштучный обход
 * десятков тысяч предметов упирается в лимиты площадки. Датасет даёт снимок
 * всех цен за один запрос, а `steam-community` используется для точечного
 * обновления самых важных предметов.
 *
 * Важно: время снимка берётся из `metadata.updated_at` датасета, а не из
 * момента запроса — иначе устаревшие данные выглядели бы как свежие.
 */
const datasetSchema = z.object({
  metadata: z.object({
    updated_at: z.string(),
    currency: z.string().default("USD"),
    item_count: z.number().optional(),
  }),
  prices: z.record(z.string(), z.number()),
});

const contentsResponseSchema = z.object({
  /** Пусто, если файл больше лимита contents API (1 МБ). */
  content: z.string().optional(),
  encoding: z.string().optional(),
  size: z.number().optional(),
});

export const steamDatasetProvider: Provider = {
  id: "steam-dataset",
  marketId: "steam-community",
  label: "Steam (открытый датасет, MIT)",
  mode: "bulk",
  requiresCredentials: false,

  async fetchQuotes({ marketHashNames, signal }): Promise<ProviderResult> {
    const config = getConfig();
    const repo = config.STEAM_DATASET_REPO;
    const client = new HttpClient({
      sourceId: "steam-dataset",
      baseUrl: "https://api.github.com",
      minIntervalMs: 1_000,
      concurrency: 1,
      maxRetries: 2,
      defaultHeaders: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(hasCredential(config.GITHUB_TOKEN) ? { authorization: `Bearer ${config.GITHUB_TOKEN}` } : {}),
      },
    });

    const path = `/repos/${repo}/contents/static/latest.json`;
    const contents = contentsResponseSchema.parse(await client.requestJson<unknown>(path, { signal }));

    const inline = contents.content?.trim() ?? "";
    let decoded: string;
    if (inline) {
      decoded = Buffer.from(inline, contents.encoding === "base64" ? "base64" : "utf8").toString("utf8");
    } else {
      // Файл датасета больше 1 МБ, поэтому contents API отдаёт его без
      // содержимого (`encoding: "none"`). Забираем тот же файл raw-медиатипом:
      // GitHub отдаёт так до 100 МБ.
      logger.info("датасет Steam больше лимита contents API — читаем raw-содержимое", {
        repo,
        sizeBytes: contents.size ?? null,
      });
      decoded = await client.requestText(path, {
        headers: { accept: "application/vnd.github.raw" },
        signal,
      });
    }

    let dataset: z.infer<typeof datasetSchema>;
    try {
      dataset = datasetSchema.parse(JSON.parse(decoded));
    } catch (error) {
      throw new Error(
        `steam-dataset: не удалось разобрать ${repo}/static/latest.json (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    const capturedAt = new Date(dataset.metadata.updated_at);
    if (Number.isNaN(capturedAt.getTime())) {
      throw new Error("steam-dataset: некорректная дата снимка в metadata.updated_at");
    }

    // В датасете цены в центах USD (Steam sell_price) — приводим к долларам.
    const filter = marketHashNames ? new Set(marketHashNames) : null;
    const quotes: RawQuote[] = [];
    for (const [name, cents] of Object.entries(dataset.prices)) {
      if (filter && !filter.has(name)) continue;
      if (!Number.isFinite(cents) || cents <= 0) continue;
      const price = cents / 100;
      quotes.push({
        marketHashName: name,
        marketId: "steam-community",
        priceKind: "lowest_ask",
        price,
        currency: dataset.metadata.currency,
        capturedAt,
        sourceUrl: `https://github.com/${repo}/blob/main/static/latest.json`,
        note: `снимок датасета ${repo} (${dataset.metadata.updated_at}); sell_price в центах USD пересчитан в доллары`,
      });
    }

    return {
      quotes,
      requests: 1,
      notes: `датасет ${repo}: ${quotes.length} цен, снимок ${dataset.metadata.updated_at}`,
    };
  },
};
