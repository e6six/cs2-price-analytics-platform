import { getReadyDb } from "@/db";
import { Dashboard, type DashboardInitialData } from "@/components/dashboard";
import { getAnalyticsSummary, getDataSourceStatus, getIngestRuns, getMarketDirectory } from "@/lib/analytics/aggregates";
import { getCatalog, getFacets, getHistory } from "@/lib/analytics/queries";
import { readBootstrapManifest } from "@/lib/ingest/bootstrap";

export const dynamic = "force-dynamic";

/**
 * Главная страница: сервер собирает снимок состояния из базы (сводка, первая
 * страница каталога, справочник площадок, статусы источников, фильтры), а
 * клиент дальше работает с API.
 */
export default async function HomePage() {
  const db = await getReadyDb();

  const [summary, catalog, markets, sources, runs, facets] = await Promise.all([
    getAnalyticsSummary(db),
    getCatalog(db, { limit: 30, sort: "popularity" }),
    getMarketDirectory(db),
    getDataSourceStatus(db),
    getIngestRuns(db, 15),
    getFacets(db),
  ]);

  const chartOptions = await getCatalog(db, { limit: 40, sort: "markets-desc", requirePrice: true });
  const chartItem = chartOptions.items.find((item) => item.hasHistory) ?? chartOptions.items[0] ?? null;
  const chartHistory = chartItem ? await getHistory(db, chartItem.id, 365) : [];
  const manifest = readBootstrapManifest();

  const initial: DashboardInitialData = {
    summary,
    catalog,
    markets,
    sources,
    runs,
    facets,
    bootstrap: manifest
      ? { generatedAt: manifest.generatedAt, stats: manifest.stats, sources: manifest.sources }
      : null,
    chart: { item: chartItem, history: chartHistory, options: chartOptions.items },
  };

  return <Dashboard initial={initial} />;
}
