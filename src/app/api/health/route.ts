import { checkDatabase, getReadyDb } from "@/db";
import { route } from "@/lib/api/http";
import { getAnalyticsSummary } from "@/lib/analytics/aggregates";
import { readBootstrapManifest } from "@/lib/ingest/bootstrap";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Healthcheck для оркестратора/мониторинга.
 *
 * 200 — база отвечает и данные доступны; 503 — сервис не готов (нет базы или
 * набор ещё не загружен). Ответ не кэшируется.
 */
export const GET = route(
  async () => {
    const database = await checkDatabase();
    if (!database.ok) {
      return Response.json(
        {
          ok: false,
          status: "unavailable",
          database,
          hint: "Проверьте DATABASE_URL и доступность PostgreSQL",
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }

    const db = await getReadyDb();
    const summary = await getAnalyticsSummary(db);
    const manifest = readBootstrapManifest();
    const config = getConfig();
    const ready = summary.coverage.items > 0;

    return Response.json(
      {
        ok: ready,
        status: ready ? "ready" : "empty",
        version: process.env.APP_VERSION ?? "1.0.0",
        environment: config.NODE_ENV,
        database: { ...database, driver: database.driver },
        data: {
          items: summary.coverage.items,
          itemsWithPrice: summary.coverage.itemsWithPrice,
          markets: summary.coverage.marketsWithQuotes,
          latestCapturedAt: summary.freshness.latestCapturedAt,
          ageHours: summary.freshness.ageHours,
          isStale: summary.freshness.isStale,
          snapshot: manifest?.generatedAt ?? null,
          bootstrapSources: manifest?.sources.map((source) => `${source.id}@${source.commit.slice(0, 8)}`) ?? [],
        },
      },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  },
  { skipRateLimit: true },
);
