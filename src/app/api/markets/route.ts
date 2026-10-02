import { getReadyDb } from "@/db";
import { route } from "@/lib/api/http";
import { getMarketDirectory } from "@/lib/analytics/aggregates";

export const dynamic = "force-dynamic";

/**
 * Справочник площадок: статус интеграции, условия использования, комиссии с
 * источником и датой проверки, число котировок и состояние здоровья источника.
 * Непроверенные значения отдаются как `null`/`unverified` — их нельзя трактовать
 * как тариф площадки.
 */
export const GET = route(
  async () => {
    const db = await getReadyDb();
    const markets = await getMarketDirectory(db);
    return {
      markets,
      notes: [
        "Комиссии помечены статусом: verified — из документации площадки, reported — из публичного обзора, conflicting — источники противоречат, unverified — данных нет.",
        "Комиссии удерживаются с продавца или покупателя по-разному; перед расчётами сверяйтесь с площадкой.",
      ],
    };
  },
  { cache: { sMaxAge: 300, staleWhileRevalidate: 900 } },
);
