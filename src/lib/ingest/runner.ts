import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { ingestRuns, items, markets, priceHistoryDaily, priceQuotes, sourceHealth } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { getUsdRate, syncFxRates } from "@/lib/fx";
import { logger } from "@/lib/logger";
import { refreshItemStats } from "@/lib/analytics/stats";
import { getProvider, providers } from "@/lib/ingest/providers";
import type { Provider, RawQuote } from "@/lib/ingest/types";

export type SyncOptions = {
  sourceIds?: string[];
  /** Ограничение числа предметов (для item-источников). */
  limit?: number;
  /** Точечное обновление конкретных market_hash_name (Steam / карточка предмета). */
  marketHashNames?: string[];
  /** Пересобрать дневную историю из накопленных котировок. */
  aggregateHistory?: boolean;
  triggeredBy?: string;
  signal?: AbortSignal;
};

export type SyncReport = {
  runs: Array<{
    sourceId: string;
    status: "success" | "partial" | "failed" | "skipped";
    quotes: number;
    matched: number;
    unmatched: number;
    requests: number;
    durationMs: number;
    message?: string;
  }>;
  historyRows: number;
  fxRows: number;
};

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function round(value: number, digits = 4): string {
  return value.toFixed(digits);
}

/**
 * Нормализация цены в USD.
 *
 * Если курс неизвестен, цена сохраняется как есть, а расхождение помечается в
 * `note`: лучше показать «цена в исходной валюте», чем подставить догадку.
 */
async function normalizeToUsd(
  db: Database,
  quote: RawQuote,
  rateCache: Map<string, { rate: number; source: "db" | "static" }>,
): Promise<{ priceUsd: number; note: string | null }> {
  if (quote.currency === "USD") return { priceUsd: quote.price, note: quote.note ?? null };

  const cacheKey = `${quote.currency}:${quote.capturedAt.toISOString().slice(0, 10)}`;
  let conversion = rateCache.get(cacheKey);
  if (!conversion) {
    conversion = await getUsdRate(db, quote.currency, quote.capturedAt);
    rateCache.set(cacheKey, conversion);
  }
  const { rate, source } = conversion;
  if (source === "static") {
    return {
      priceUsd: quote.price * rate,
      note: `${quote.note ?? ""} | использован статический курс ${quote.currency}→USD ${rate.toFixed(4)} (нет данных ЕЦБ)`.trim(),
    };
  }
  return {
    priceUsd: quote.price * rate,
    note: `${quote.note ?? ""} | курс ЕЦБ ${quote.currency}→USD ${rate.toFixed(4)} на ${quote.capturedAt.toISOString().slice(0, 10)}`.trim(),
  };
}

async function persistQuotes(db: Database, runId: number, quotes: RawQuote[]): Promise<{ inserted: number; unmatched: number }> {
  if (quotes.length === 0) return { inserted: 0, unmatched: 0 };

  const names = [...new Set(quotes.map((quote) => quote.marketHashName))];
  const idByName = new Map<string, number>();
  for (const batch of chunk(names, 5_000)) {
    const rows = await db
      .select({ id: items.id, marketHashName: items.marketHashName })
      .from(items)
      .where(inArray(items.marketHashName, batch));
    for (const row of rows) idByName.set(row.marketHashName, row.id);
  }

  const prepared: Array<typeof priceQuotes.$inferInsert> = [];
  const rateCache = new Map<string, { rate: number; source: "db" | "static" }>();
  let unmatched = 0;

  for (const quote of quotes) {
    const itemId = idByName.get(quote.marketHashName);
    if (!itemId) {
      unmatched += 1;
      continue;
    }
    const { priceUsd, note } = await normalizeToUsd(db, quote, rateCache);
    prepared.push({
      sourceKey: `${quote.marketId}:${quote.priceKind}:${itemId}:${quote.capturedAt.toISOString()}`,
      itemId,
      marketId: quote.marketId,
      priceKind: quote.priceKind,
      price: round(quote.price),
      currency: quote.currency,
      priceUsd: round(priceUsd),
      volume: quote.volume ?? null,
      capturedAt: quote.capturedAt,
      sourceUrl: quote.sourceUrl ?? null,
      ingestRunId: runId,
      isLive: true,
      note,
    });
  }

  let inserted = 0;
  for (const batch of chunk(prepared, 1_000)) {
    const rows = await db.insert(priceQuotes).values(batch).onConflictDoNothing().returning({ id: priceQuotes.id });
    inserted += rows.length;
  }

  return { inserted, unmatched };
}

/**
 * Пересборка дневной истории из реальных котировок.
 *
 * За день берётся минимум по снимкам (low) и медиана по снимкам (median) —
 * это то, что можно честно посчитать из накопленных наблюдений. Объём
 * остаётся NULL, если источник его не публикует.
 */
export async function aggregateDailyHistory(db: Database, daysBack = 3): Promise<number> {
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const result = await db.execute(sql`
    with daily as (
      select
        q.item_id,
        q.market_id,
        (q.captured_at at time zone 'UTC')::date as recorded_on,
        q.price_kind,
        min(q.price) as low_price,
        percentile_cont(0.5) within group (order by q.price) as median_price,
        max(q.currency) as currency,
        min(q.price_usd) as low_price_usd,
        percentile_cont(0.5) within group (order by q.price_usd) as median_price_usd
      from cs2_price_quotes q
      where q.captured_at >= ${from}
      group by 1, 2, 3, 4
    )
    insert into cs2_price_history_daily
      (item_id, market_id, recorded_on, price_kind, low_price, median_price, volume, currency, price_usd, is_live, source_ref)
    select
      d.item_id,
      d.market_id,
      d.recorded_on,
      d.price_kind,
      d.low_price,
      d.median_price,
      null,
      d.currency,
      d.low_price_usd,
      true,
      d.market_id
    from daily d
    on conflict (item_id, market_id, recorded_on, price_kind) do update
      set low_price = excluded.low_price,
          median_price = excluded.median_price,
          price_usd = excluded.price_usd,
          currency = excluded.currency,
          is_live = excluded.is_live,
          source_ref = excluded.source_ref
  `);

  const rows = (result as unknown as { rowCount?: number; rows?: unknown[] }).rowCount ?? 0;
  return rows;
}

/** Удаление устаревших котировок согласно политике хранения. */
export async function pruneQuotes(db: Database): Promise<number> {
  const retentionDays = getConfig().QUOTE_RETENTION_DAYS;
  if (retentionDays <= 0) return 0;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(priceQuotes)
    .where(and(lt(priceQuotes.capturedAt, cutoff), eq(priceQuotes.isLive, true)))
    .returning({ id: priceQuotes.id });
  return deleted.length;
}

async function updateHealth(
  db: Database,
  sourceId: string,
  state: { success: boolean; quoteCount: number; error?: string },
): Promise<void> {
  const now = new Date();
  const [existing] = await db
    .select({ failures: sourceHealth.consecutiveFailures })
    .from(sourceHealth)
    .where(eq(sourceHealth.sourceId, sourceId))
    .limit(1);

  const failures = state.success ? 0 : (existing?.failures ?? 0) + 1;
  const breakerState = failures >= 5 ? "open" : "closed";

  await db
    .insert(sourceHealth)
    .values({
      sourceId,
      lastAttemptAt: now,
      lastSuccessAt: state.success ? now : null,
      consecutiveFailures: failures,
      breakerState,
      breakerOpenedAt: breakerState === "open" ? now : null,
      lastError: state.error ?? null,
      lastQuoteCount: state.quoteCount,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sourceHealth.sourceId,
      set: {
        lastAttemptAt: now,
        ...(state.success ? { lastSuccessAt: now } : {}),
        consecutiveFailures: failures,
        breakerState,
        breakerOpenedAt: breakerState === "open" ? now : null,
        lastError: state.error ?? null,
        lastQuoteCount: state.quoteCount,
        updatedAt: now,
      },
    });
}

async function runProvider(db: Database, provider: Provider, options: SyncOptions): Promise<SyncReport["runs"][number]> {
  const startedAt = Date.now();
  const config = getConfig();
  const [run] = await db
    .insert(ingestRuns)
    .values({
      sourceId: provider.id,
      status: "running",
      triggeredBy: options.triggeredBy ?? "manual",
      message: `режим ${provider.mode}`,
    })
    .returning({ id: ingestRuns.id });

  try {
    let marketHashNames: string[] | undefined;

    if (provider.mode === "item") {
      if (options.marketHashNames?.length) {
        const requested = [...new Set(options.marketHashNames.map((name) => name.trim()).filter(Boolean))];
        marketHashNames = requested.slice(0, options.limit ?? requested.length);
      } else {
        const limit = options.limit ?? config.SYNC_MAX_ITEMS;
        // Фоновое точечное обновление идёт по наиболее значимым предметам.
        const rows = await db
          .select({ marketHashName: items.marketHashName })
          .from(items)
          .orderBy(sql`${items.popularity} desc, ${items.id} asc`)
          .limit(limit);
        marketHashNames = rows.map((row) => row.marketHashName);
      }
    } else if (options.limit && options.limit > 0) {
      const rows = await db
        .select({ marketHashName: items.marketHashName })
        .from(items)
        .orderBy(sql`${items.popularity} desc, ${items.id} asc`)
        .limit(options.limit);
      marketHashNames = rows.map((row) => row.marketHashName);
    }

    const result = await provider.fetchQuotes({ marketHashNames, limit: options.limit, signal: options.signal });
    const { inserted, unmatched } = await persistQuotes(db, run.id, result.quotes);
    const missing = result.missing?.length ?? 0;
    const status: "success" | "partial" = unmatched > 0 || missing > 0 ? "partial" : "success";

    await db
      .update(ingestRuns)
      .set({
        status,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        requestsMade: result.requests,
        itemsMatched: inserted,
        itemsUnmatched: unmatched + missing,
        quotesInserted: inserted,
        message: result.notes ?? null,
        details: { missing: result.missing?.slice(0, 50) ?? [] },
      })
      .where(eq(ingestRuns.id, run.id));

    await updateHealth(db, provider.id, { success: true, quoteCount: inserted });

    return {
      sourceId: provider.id,
      status,
      quotes: result.quotes.length,
      matched: inserted,
      unmatched: unmatched + missing,
      requests: result.requests,
      durationMs: Date.now() - startedAt,
      message: result.notes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(ingestRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        errorCount: 1,
        message,
      })
      .where(eq(ingestRuns.id, run.id));
    await updateHealth(db, provider.id, { success: false, quoteCount: 0, error: message });
    logger.error("синхронизация источника не удалась", { source: provider.id, error: message });

    return {
      sourceId: provider.id,
      status: "failed",
      quotes: 0,
      matched: 0,
      unmatched: 0,
      requests: 0,
      durationMs: Date.now() - startedAt,
      message,
    };
  }
}

/**
 * Оркестратор синхронизации: запускает адаптеры, пишет журнал и состояние,
 * агрегирует дневную историю и (при необходимости) обновляет курсы валют.
 *
 * Каждый источник изолирован: падение одного не мешает остальным, а результат
 * по каждому виден в `cs2_ingest_runs`.
 */
export async function syncSources(db: Database, options: SyncOptions = {}): Promise<SyncReport> {
  const selected = options.sourceIds?.length
    ? providers.filter((provider) => options.sourceIds?.includes(provider.id))
    : providers;

  if (selected.length === 0) {
    throw new Error(
      `Неизвестные источники: ${options.sourceIds?.join(", ")}. Доступны: ${providers.map((provider) => provider.id).join(", ")}`,
    );
  }

  const runs: SyncReport["runs"] = [];
  const config = getConfig();
  const needsFx = selected.some(
    (provider) =>
      !provider.disabledReason?.() &&
      (provider.id === "buff163" ||
        (provider.id === "skinbaron" && config.SKINBARON_PRICE_CURRENCY !== "USD") ||
        (provider.id === "lisskins" && config.LISSKINS_PRICE_CURRENCY !== "USD")),
  );
  let fxRows = 0;

  if (needsFx) {
    fxRows = await syncFxRates(db);
    if (fxRows === 0) {
      logger.warn("актуальный курс валют недоступен: будет использован последний известный или помеченный fallback");
    }
  }

  for (const provider of selected) {
    const disabledReason = provider.disabledReason?.() ?? null;
    if (disabledReason) {
      logger.info("источник пропущен", { source: provider.id, reason: disabledReason });
      runs.push({
        sourceId: provider.id,
        status: "skipped",
        quotes: 0,
        matched: 0,
        unmatched: 0,
        requests: 0,
        durationMs: 0,
        message: disabledReason,
      });
      continue;
    }
    runs.push(await runProvider(db, provider, options));
  }

  let historyRows = 0;
  if (options.aggregateHistory !== false) {
    historyRows = await aggregateDailyHistory(db);
  }

  await pruneQuotes(db);

  // После сбора пересобираем материализованные показатели, чтобы API отдавал
  // свежие цены и динамику без тяжёлых запросов.
  const insertedQuotes = runs.reduce((sum, run) => sum + run.matched, 0);
  if (insertedQuotes > 0 || historyRows > 0) {
    await refreshItemStats(db);
  }

  return { runs, historyRows, fxRows };
}

export function providerCatalog() {
  return providers.map((provider) => ({
    id: provider.id,
    marketId: provider.marketId,
    label: provider.label,
    mode: provider.mode,
    requiresCredentials: provider.requiresCredentials,
    disabledReason: provider.disabledReason?.() ?? null,
  }));
}

export { getProvider };
