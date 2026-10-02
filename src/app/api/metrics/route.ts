import { checkDatabase, getReadyDb } from "@/db";
import { route } from "@/lib/api/http";
import { getAnalyticsSummary, getMarketDirectory } from "@/lib/analytics/aggregates";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Метрики в формате Prometheus text exposition — для скрейпинга без SDK.
 * Отдаётся без кэширования; лимит частоты к метрикам не применяется.
 */
export const GET = route(
  async () => {
    const database = await checkDatabase();
    const db = await getReadyDb();
    const [summary, markets] = await Promise.all([getAnalyticsSummary(db), getMarketDirectory(db)]);
    const ageHours = summary.freshness.ageHours;

    const lines: string[] = [
      "# HELP cs2_db_up Доступность базы данных (1 — доступна).",
      "# TYPE cs2_db_up gauge",
      `cs2_db_up ${database.ok ? 1 : 0}`,
      "# HELP cs2_db_latency_ms Задержка проверки соединения с базой.",
      "# TYPE cs2_db_latency_ms gauge",
      `cs2_db_latency_ms ${database.latencyMs}`,
      "# HELP cs2_items_total Число предметов в каталоге.",
      "# TYPE cs2_items_total gauge",
      `cs2_items_total ${summary.coverage.items}`,
      "# HELP cs2_items_with_price_total Число предметов с актуальной ценой.",
      "# TYPE cs2_items_with_price_total gauge",
      `cs2_items_with_price_total ${summary.coverage.itemsWithPrice}`,
      "# HELP cs2_quotes_total Число сохранённых котировок.",
      "# TYPE cs2_quotes_total gauge",
      `cs2_quotes_total ${summary.coverage.quotes}`,
      "# HELP cs2_history_points_total Число точек истории цен.",
      "# TYPE cs2_history_points_total gauge",
      `cs2_history_points_total ${summary.coverage.historyPoints}`,
      "# HELP cs2_data_age_hours Возраст самого свежего снимка цены, часы.",
      "# TYPE cs2_data_age_hours gauge",
      `cs2_data_age_hours ${ageHours ?? -1}`,
      "# HELP cs2_market_index Равновзвешенный индекс цен (база 100).",
      "# TYPE cs2_market_index gauge",
      `cs2_market_index ${summary.index.current ?? 0}`,
      "# HELP cs2_source_quotes_total Число котировок по источнику.",
      "# TYPE cs2_source_quotes_total gauge",
    ];

    for (const market of markets) {
      lines.push(`cs2_source_quotes_total{source="${market.id}",status="${market.integrationStatus}"} ${market.quoteCount}`);
    }
    lines.push("# HELP cs2_source_breaker Состояние размыкателя (1 — разомкнут).");
    lines.push("# TYPE cs2_source_breaker gauge");
    for (const market of markets) {
      lines.push(`cs2_source_breaker{source="${market.id}"} ${market.health.breakerState === "open" ? 1 : 0}`);
    }
    lines.push(`# config API_RATE_LIMIT_PER_MINUTE=${getConfig().API_RATE_LIMIT_PER_MINUTE}`);

    return new Response(`${lines.join("\n")}\n`, {
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
  { skipRateLimit: true },
);
