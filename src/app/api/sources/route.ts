import { getReadyDb } from "@/db";
import { route } from "@/lib/api/http";
import { getDataSourceStatus, getIngestRuns } from "@/lib/analytics/aggregates";
import { readBootstrapManifest } from "@/lib/ingest/bootstrap";
import { listProviderStatus } from "@/lib/ingest/providers";

export const dynamic = "force-dynamic";

/**
 * Прозрачность данных: какие источники подключены, на каких условиях, когда
 * последний успешный сбор и что именно загружено в базу при развёртывании.
 */
export const GET = route(
  async () => {
    const db = await getReadyDb();
    const [sources, runs] = await Promise.all([getDataSourceStatus(db), getIngestRuns(db, 15)]);
    const manifest = readBootstrapManifest();

    return {
      sources,
      providers: listProviderStatus(),
      lastRuns: runs,
      bootstrap: manifest
        ? {
            generatedAt: manifest.generatedAt,
            stats: manifest.stats,
            sources: manifest.sources,
          }
        : null,
      disclaimer:
        "Данные предоставляются «как есть» для аналитики. Сервис не продаёт предметы, не принимает средства и не связан с Valve Corporation.",
    };
  },
  { cache: { sMaxAge: 60, staleWhileRevalidate: 300 } },
);
