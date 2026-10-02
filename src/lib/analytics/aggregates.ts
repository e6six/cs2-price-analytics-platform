import { sql } from "drizzle-orm";
import type { Database } from "@/db";
import { fetchRows, getCatalog, toNumber, STALE_AFTER_HOURS } from "@/lib/analytics/queries";
import type {
  AnalyticsSummary,
  CatalogItem,
  DataSourceStatus,
  IngestRunView,
  MarketDirectoryEntry,
} from "@/lib/analytics/types";
import { ensureItemStats } from "@/lib/analytics/stats";
import { listProviderStatus } from "@/lib/ingest/providers";
import { hasCredential, getConfig } from "@/lib/config";

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Сводка по рынку.
 *
 * Индекс считается как медиана отношений «последняя цена / первая цена» по
 * предметам с историей (равновзвешенный индекс, база 100 на первой дате).
 * Это устойчивее среднего: отдельные дорогие предметы не искажают картину.
 */
export async function getAnalyticsSummary(db: Database): Promise<AnalyticsSummary> {
  await ensureItemStats(db);

  const [freshnessRow] = await fetchRows<{ latest_captured_at: Date | string | null; quotes: number }>(
    db,
    sql`
      select max(s.last_captured_at) as latest_captured_at,
             (select count(*)::int from cs2_price_quotes) as quotes
      from cs2_item_stats s
    `,
  );

  const [coverageRow] = await fetchRows<{
    items: number;
    items_with_price: number;
    history_items: number;
    history_points: number;
    markets_with_quotes: number;
    live_sources: number;
    planned_sources: number;
  }>(
    db,
    sql`
      select
        (select count(*)::int from cs2_items) as items,
        (select count(*)::int from cs2_item_stats where best_price_usd is not null) as items_with_price,
        (select count(*)::int from cs2_item_stats where history_points > 0) as history_items,
        (select coalesce(sum(history_points), 0)::int from cs2_item_stats) as history_points,
        (select count(distinct market_id)::int from cs2_price_quotes) as markets_with_quotes,
        (select count(*)::int from cs2_markets where integration_status = 'live') as live_sources,
        (select count(*)::int from cs2_markets where integration_status in ('planned', 'credentials_required')) as planned_sources
    `,
  );

  // Ряд индекса: для каждой даты — медиана отношений цены предмета к его первой
  // цене (база 100). Медиана устойчива к выбросам, а сам ряд строится одним
  // проходом по истории с соединением по первичному ключу показателей.
  const indexSeries = await fetchRows<{ recorded_on: string; value: string }>(
    db,
    sql`
      select h.recorded_on,
             percentile_cont(0.5) within group (order by h.price_usd / s.first_price_usd) * 100 as value
      from cs2_price_history_daily h
      join cs2_item_stats s on s.item_id = h.item_id
      where s.first_price_usd > 0 and s.history_points >= 4
      group by h.recorded_on
      order by h.recorded_on asc
    `,
  );

  const series = indexSeries.map((row) => ({
    date: String(row.recorded_on).slice(0, 10),
    value: Number(Number(row.value).toFixed(3)),
  }));
  const lastPoint = series.at(-1) ?? null;
  const firstPoint = series[0] ?? null;

  const changeOverDays = (days: number): number | null => {
    if (!lastPoint) return null;
    const cutoff = new Date(new Date(`${lastPoint.date}T00:00:00Z`).getTime() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const reference = [...series].reverse().find((point) => point.date <= cutoff);
    if (!reference || reference.value <= 0) return null;
    return Number((((lastPoint.value - reference.value) / reference.value) * 100).toFixed(3));
  };

  const [constituentsRow] = await fetchRows<{ constituents: number }>(
    db,
    sql`
      select count(*)::int as constituents
      from cs2_item_stats
      where history_points >= 4 and first_price_usd > 0
    `,
  );

  const [breadth] = await fetchRows<{ advancing: number; declining: number; flat: number }>(
    db,
    sql`
      select
        count(*) filter (where change_7d > 0)::int as advancing,
        count(*) filter (where change_7d < 0)::int as declining,
        count(*) filter (where change_7d = 0)::int as flat
      from cs2_item_stats
      where change_7d is not null and history_points >= 4
    `,
  );

  // Лидеры считаются только по ликвидным предметам: дешёвые позиции с парой
  // наблюдений дают шумные проценты и не описывают рынок.
  const liquidityFilter = { requirePrice: true, minHistoryPoints: 20, minPopularity: 70 } as const;
  const [gainers, losers, liquid] = await Promise.all([
    getCatalog(db, { ...liquidityFilter, sort: "change-desc", limit: 6 }),
    getCatalog(db, { ...liquidityFilter, sort: "change-asc", limit: 6 }),
    getCatalog(db, { sort: "markets-desc", limit: 6 }),
  ]);

  const latestCapturedAt = toIso(freshnessRow?.latest_captured_at ?? null);
  const ageHours = latestCapturedAt ? (Date.now() - new Date(latestCapturedAt).getTime()) / 3_600_000 : null;

  return {
    freshness: {
      latestCapturedAt,
      ageHours: ageHours === null ? null : Number(ageHours.toFixed(1)),
      snapshotLabel: latestCapturedAt ? latestCapturedAt.slice(0, 10) : null,
      isStale: ageHours !== null && ageHours > STALE_AFTER_HOURS,
    },
    coverage: {
      items: coverageRow?.items ?? 0,
      itemsWithPrice: coverageRow?.items_with_price ?? 0,
      quotes: freshnessRow?.quotes ?? 0,
      historyItems: coverageRow?.history_items ?? 0,
      historyPoints: coverageRow?.history_points ?? 0,
      marketsWithQuotes: coverageRow?.markets_with_quotes ?? 0,
      sourcesLive: coverageRow?.live_sources ?? 0,
      sourcesPlanned: coverageRow?.planned_sources ?? 0,
    },
    index: {
      current: lastPoint?.value ?? null,
      change7d: changeOverDays(7),
      change30d: changeOverDays(30),
      changeAll:
        lastPoint && firstPoint && firstPoint.value > 0
          ? Number((((lastPoint.value - firstPoint.value) / firstPoint.value) * 100).toFixed(2))
          : null,
      baseDate: firstPoint?.date ?? null,
      constituents: constituentsRow?.constituents ?? 0,
      series,
    },
    breadth: {
      advancing: breadth?.advancing ?? 0,
      declining: breadth?.declining ?? 0,
      flat: breadth?.flat ?? 0,
    },
    topGainers: gainers.items.filter((item: CatalogItem) => (item.change7d ?? 0) > 0).slice(0, 4),
    topLosers: losers.items.filter((item: CatalogItem) => (item.change7d ?? 0) < 0).slice(0, 4),
    mostLiquid: liquid.items,
    dataNote:
      "Цены — снимки публичных предложений площадок с указанием времени. Это не торговая рекомендация и не поток реального времени.",
  };
}

export async function getMarketDirectory(db: Database): Promise<MarketDirectoryEntry[]> {
  const rows = await fetchRows<{
    id: string;
    name: string;
    short_name: string;
    region: string;
    website: string;
    integration_status: string;
    integration_type: string;
    requires_credentials: boolean;
    credential_env_var: string | null;
    docs_url: string | null;
    data_license: string | null;
    attribution: string | null;
    rate_limit_notes: string | null;
    price_semantics: string | null;
    normalization_notes: string | null;
    buyer_fee_percent: string | null;
    seller_fee_percent: string | null;
    fee_status: string;
    fee_source_url: string | null;
    fee_checked_at: Date | string | null;
    kyc_policy: string;
    quote_count: number;
    last_quote_at: Date | string | null;
    last_success_at: Date | string | null;
    breaker_state: string | null;
    consecutive_failures: number | null;
    last_error: string | null;
  }>(
    db,
    sql`
      with ${SQL_QUOTE_STATS}
      select
        m.*,
        coalesce(s.quote_count, 0) as quote_count,
        s.last_quote_at,
        h.last_success_at,
        h.breaker_state,
        h.consecutive_failures,
        h.last_error
      from cs2_markets m
      left join quote_stats s on s.market_id = m.id
      left join cs2_source_health h on h.source_id = m.id
      order by
        case m.integration_status
          when 'live' then 0
          when 'dataset' then 1
          when 'credentials_required' then 2
          when 'planned' then 3
          else 4
        end,
        m.name asc
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    region: row.region,
    website: row.website,
    integrationStatus: row.integration_status,
    integrationType: row.integration_type,
    requiresCredentials: row.requires_credentials,
    credentialEnvVar: row.credential_env_var,
    docsUrl: row.docs_url,
    dataLicense: row.data_license,
    attribution: row.attribution,
    rateLimitNotes: row.rate_limit_notes,
    priceSemantics: row.price_semantics,
    normalizationNotes: row.normalization_notes,
    buyerFeePercent: toNumber(row.buyer_fee_percent),
    sellerFeePercent: toNumber(row.seller_fee_percent),
    feeStatus: row.fee_status,
    feeSourceUrl: row.fee_source_url,
    feeCheckedAt: toIso(row.fee_checked_at),
    kycPolicy: row.kyc_policy,
    quoteCount: row.quote_count,
    lastQuoteAt: toIso(row.last_quote_at),
    lastSuccessAt: toIso(row.last_success_at),
    health: {
      breakerState: row.breaker_state ?? "closed",
      consecutiveFailures: row.consecutive_failures ?? 0,
      lastError: row.last_error,
    },
  }));
}

const SQL_QUOTE_STATS = sql`
  quote_stats as (
    select market_id, count(*)::int as quote_count, max(captured_at) as last_quote_at
    from cs2_price_quotes
    group by market_id
  )
`;

export async function getDataSourceStatus(db: Database): Promise<DataSourceStatus[]> {
  const [directory, providers] = await Promise.all([getMarketDirectory(db), Promise.resolve(listProviderStatus())]);
  const config = getConfig();

  const credentialByMarket = new Map(
    providers.filter((provider) => provider.marketId).map((provider) => [provider.marketId, provider]),
  );

  return directory.map((market) => {
    const provider = credentialByMarket.get(market.id);
    const envValue = market.credentialEnvVar ? (process.env[market.credentialEnvVar] ?? undefined) : undefined;
    return {
      id: market.id,
      name: market.name,
      integrationStatus: market.integrationStatus,
      requiresCredentials: market.requiresCredentials,
      credentialEnvVar: market.credentialEnvVar,
      attribution: market.attribution,
      dataLicense: market.dataLicense,
      lastSuccessAt: market.lastSuccessAt,
      lastQuoteAt: market.lastQuoteAt,
      quoteCount: market.quoteCount,
      breakerState: market.health.breakerState,
      consecutiveFailures: market.health.consecutiveFailures,
      lastError: market.health.lastError,
      // «Настроен» = либо публичный источник, либо заданы учётные данные.
      configured:
        provider?.enabled ??
        (!market.requiresCredentials || hasCredential(envValue) || Boolean(config.SYNC_TOKEN && false)),
    };
  });
}

export async function getIngestRuns(db: Database, limit = 20): Promise<IngestRunView[]> {
  const rows = await fetchRows<{
    id: number;
    source_id: string;
    status: string;
    triggered_by: string;
    started_at: Date | string;
    finished_at: Date | string | null;
    duration_ms: number | null;
    requests_made: number;
    items_matched: number;
    items_unmatched: number;
    quotes_inserted: number;
    history_upserted: number;
    message: string | null;
  }>(
    db,
    sql`
      select id, source_id, status, triggered_by, started_at, finished_at, duration_ms,
             requests_made, items_matched, items_unmatched, quotes_inserted, history_upserted, message
      from cs2_ingest_runs
      order by started_at desc, id desc
      limit ${Math.min(Math.max(limit, 1), 100)}
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    triggeredBy: row.triggered_by,
    startedAt: toIso(row.started_at) ?? "",
    finishedAt: toIso(row.finished_at),
    durationMs: row.duration_ms,
    requestsMade: row.requests_made,
    itemsMatched: row.items_matched,
    itemsUnmatched: row.items_unmatched,
    quotesInserted: row.quotes_inserted,
    historyUpserted: row.history_upserted,
    message: row.message,
  }));
}

export async function getItemHistoryCoverage(db: Database): Promise<{ from: string | null; to: string | null; points: number }> {
  const [row] = await fetchRows<{ from_date: string | null; to_date: string | null; points: number }>(
    db,
    sql`select min(recorded_on) as from_date, max(recorded_on) as to_date, count(*)::int as points from cs2_price_history_daily`,
  );
  return {
    from: row?.from_date ? String(row.from_date).slice(0, 10) : null,
    to: row?.to_date ? String(row.to_date).slice(0, 10) : null,
    points: row?.points ?? 0,
  };
}
