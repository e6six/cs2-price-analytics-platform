import { getConfig } from "@/lib/config";
import { HttpClient, HttpError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { normalizePrice } from "@/lib/ingest/types";
import type { Provider, ProviderResult, RawQuote } from "@/lib/ingest/types";

/**
 * Steam Community Market — живой обход каталога через публичный поиск маркета
 * (`/market/search/render/`).
 *
 * У Steam нет массового прайса, но поиск отдаёт по 100 позиций за страницу,
 * поэтому весь каталог (~34 000 предметов ≈ 341 страница) можно пройти за
 * несколько прогонов, продолжая с сохранённого курсора `start`.
 *
 * Правила работы (осознанно консервативные):
 * - один запрос за раз, пауза `STEAM_SEARCH_INTERVAL_MS` (по умолчанию 3 с);
 * - никаких прокси, ротации IP, повторов и обхода CAPTCHA/Cloudflare;
 * - при 429/403 прогон немедленно останавливается, причина попадает в notes,
 *   а следующий прогон продолжает с того же `start`.
 */

export const SEARCH_PAGE_SIZE = 100;

const SEARCH_PATH = "/market/search/render/";
const MAX_PAGES_LIMIT = 1_000;

/**
 * Строка выдачи поиска после нормализации. `price` — минимальная цена лота в
 * долларах (Steam при `currency=1` отдаёт `sell_price` в центах USD).
 */
export type SteamSearchRow = {
  marketHashName: string;
  price: number;
  volume: number | null;
};

export type SteamSearchPage = {
  /** `total_count` выдачи, если Steam вернул конечное число; иначе null. */
  totalCount: number | null;
  rows: SteamSearchRow[];
};

/** Курсор обхода: сохраняется в `cs2_ingest_runs.details.state` между прогонами. */
export type SteamSearchCursor = {
  /** Со скольких позиций выдачи продолжать (`start` в запросе). */
  nextStart: number;
  /** Сколько всего позиций в выдаче, если известно. */
  totalCount: number | null;
  /** Сколько полных проходов по выдаче уже завершено. */
  completedPasses: number;
};

const DEFAULT_CURSOR: SteamSearchCursor = { nextStart: 0, totalCount: null, completedPasses: 0 };

/** Русские формы множественного числа для заметок прогона. */
function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function readNonNegativeInt(value: unknown): number | null {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(raw)) return null;
  const parsed = Math.trunc(raw);
  return parsed >= 0 ? parsed : null;
}

/**
 * Безопасно читает курсор предыдущего прогона. Мусор, отрицательные значения и
 * отсутствие полей трактуются как дефолт: лучше начать выдачу сначала, чем
 * запросить отрицательный `start`.
 */
export function readCursor(metadata: Record<string, unknown> | null | undefined): SteamSearchCursor {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { ...DEFAULT_CURSOR };
  return {
    nextStart: readNonNegativeInt(metadata.nextStart) ?? DEFAULT_CURSOR.nextStart,
    totalCount: readNonNegativeInt(metadata.totalCount),
    completedPasses: readNonNegativeInt(metadata.completedPasses) ?? DEFAULT_CURSOR.completedPasses,
  };
}

/**
 * Разбирает страницу поиска, не бросая исключений: вместо отказа от прогона
 * битые позиции пропускаются, а неподходящая страница (HTML защиты, заглушка)
 * даёт пустой результат — цикл обхода воспримет это как конец выдачи.
 */
export function parseSteamSearchPage(payload: unknown): SteamSearchPage {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { totalCount: null, rows: [] };
  }

  const record = payload as Record<string, unknown>;
  const totalCount =
    typeof record.total_count === "number" && Number.isFinite(record.total_count) && record.total_count >= 0
      ? Math.trunc(record.total_count)
      : null;

  if (!Array.isArray(record.results)) return { totalCount, rows: [] };

  const rows: SteamSearchRow[] = [];
  for (const raw of record.results) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;

    const marketHashName = typeof item.hash_name === "string" ? item.hash_name.trim() : "";
    if (!marketHashName) continue;

    // При currency=1 sell_price — целое число центов USD; текстовая цена
    // используется только как фолбэк, чтобы не выдумывать значение.
    let price: number | null = null;
    if (typeof item.sell_price === "number" && Number.isFinite(item.sell_price) && item.sell_price > 0) {
      price = item.sell_price / 100;
    } else {
      price = normalizePrice(item.sell_price_text);
    }
    if (price === null) continue;

    const volume =
      typeof item.sell_listings === "number" && Number.isInteger(item.sell_listings) && item.sell_listings >= 0
        ? item.sell_listings
        : null;

    rows.push({ marketHashName, price, volume });
  }

  return { totalCount, rows };
}

/** Человекочитаемая причина остановки обхода (попадает в notes и журнал прогонов). */
export function describeStop(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.kind === "rate_limited" || error.status === 429) return "Steam вернул 429 (лимит частоты)";
    if (error.status === 403) return "Steam вернул 403 (доступ ограничен)";
    if (error.kind === "parse") return "Steam вернул страницу вместо JSON (похоже на защиту от частых запросов)";
    if (error.kind === "timeout") return "таймаут запроса";
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export const steamSearchProvider: Provider = {
  id: "steam-search",
  marketId: "steam-community",
  label: "Steam Community Market (обход поиска, живые цены)",
  mode: "bulk",
  requiresCredentials: false,
  // Обход идёт по страницам выдачи: limit — бюджет страниц, а не число предметов.
  supportsNameFilter: false,

  async fetchQuotes({ marketHashNames, limit, signal, metadata }): Promise<ProviderResult> {
    const config = getConfig();
    const cursor = readCursor(metadata);
    const maxPages = Math.min(Math.max(Math.trunc(limit ?? config.STEAM_SEARCH_PAGES), 1), MAX_PAGES_LIMIT);
    // Список имён — только для точечных ручных прогонов; в обычном режиме берём всю выдачу.
    const nameFilter = marketHashNames && marketHashNames.length > 0 ? new Set(marketHashNames) : null;

    const client = new HttpClient({
      sourceId: "steam-search",
      baseUrl: "https://steamcommunity.com",
      minIntervalMs: config.STEAM_SEARCH_INTERVAL_MS,
      concurrency: 1,
      // Повторы вредны: при 429/403 нужно останавливаться, а не давить на Steam.
      maxRetries: 0,
      timeoutMs: Math.max(config.SYNC_REQUEST_TIMEOUT_MS, 20_000),
      defaultHeaders: {
        referer: "https://steamcommunity.com/market/search?appid=730",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    const firstPosition = cursor.nextStart;
    let start = cursor.nextStart;
    let totalCount = cursor.totalCount;
    let completedPasses = cursor.completedPasses;
    const quotes: RawQuote[] = [];
    let requests = 0;
    let pages = 0;
    let wrapped = false;
    let stopReason: string | null = null;

    while (pages < maxPages) {
      if (signal?.aborted) {
        stopReason = "запрос отменён вызывающей стороной";
        break;
      }

      const url =
        `${SEARCH_PATH}?query=&start=${start}&count=${SEARCH_PAGE_SIZE}` +
        `&search_descriptions=0&sort_column=popular&sort_dir=desc&appid=730&norender=1&currency=1`;

      let payload: unknown;
      try {
        payload = await client.requestJson<unknown>(url, { signal });
      } catch (error) {
        // Немедленная остановка: следующий прогон продолжит с этого же start.
        stopReason = describeStop(error);
        logger.warn("steam-search: обход остановлен", { start, reason: stopReason });
        break;
      }

      requests += 1;
      pages += 1;
      const page = parseSteamSearchPage(payload);
      if (page.totalCount !== null) totalCount = page.totalCount;

      // Пустая страница — конец выдачи.
      if (page.rows.length === 0) {
        wrapped = true;
        break;
      }

      const capturedAt = new Date();
      for (const row of page.rows) {
        if (nameFilter && !nameFilter.has(row.marketHashName)) continue;
        quotes.push({
          marketHashName: row.marketHashName,
          marketId: "steam-community",
          priceKind: "lowest_ask",
          price: row.price,
          currency: "USD",
          volume: row.volume,
          capturedAt,
          sourceUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(row.marketHashName)}`,
          note: "минимальная цена лота из поиска маркета Steam, число активных лотов — в объёме",
        });
      }

      start += page.rows.length;
      if (totalCount !== null && start >= totalCount) {
        wrapped = true;
        break;
      }
    }

    if (!wrapped && stopReason === null) {
      stopReason = `достигнут бюджет страниц (${maxPages}); продолжение — следующим прогоном с курсора`;
    }

    const positionEnd = start;
    if (wrapped) {
      completedPasses += 1;
      start = 0;
    }

    const notes = [
      `обход поиска Steam: ${pages} ${plural(pages, ["страница", "страницы", "страниц"])}, ${quotes.length} ${plural(
        quotes.length,
        ["котировка", "котировки", "котировок"],
      )}, позиции ${firstPosition}–${positionEnd} из ${totalCount ?? "неизвестно"}`,
      wrapped ? "полный проход по выдаче завершён" : "проход не завершён",
      stopReason ? `остановка: ${stopReason}` : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join("; ");

    return {
      quotes,
      requests,
      notes,
      state: { nextStart: start, totalCount, completedPasses },
      partial: stopReason !== null,
    };
  },
};
