import { getReadyDb } from "@/db";
import { route } from "@/lib/api/http";
import { getAnalyticsSummary, getItemHistoryCoverage } from "@/lib/analytics/aggregates";

export const dynamic = "force-dynamic";

/** Сводка рынка: индекс, широта движения, лидеры роста и падения, покрытие. */
export const GET = route(
  async () => {
    const db = await getReadyDb();
    const [summary, coverage] = await Promise.all([getAnalyticsSummary(db), getItemHistoryCoverage(db)]);
    return { ...summary, history: coverage };
  },
  { cache: { sMaxAge: 60, staleWhileRevalidate: 300 } },
);
