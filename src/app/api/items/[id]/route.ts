import { getReadyDb } from "@/db";
import { notFound, parseQuery, route } from "@/lib/api/http";
import { historyRangeSchema, RANGE_DAYS } from "@/lib/api/validation";
import { getItemDetail } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

/**
 * Карточка предмета: метаданные, актуальные котировки всех подключённых
 * площадок с указанием источника и времени снимка, история и статистика.
 * Принимает как числовой id, так и slug.
 */
export const GET = route(
  async (request, { params: routeParams }) => {
    const params = parseQuery(request);
    const parsed = historyRangeSchema.safeParse({
      range: params.get("range") ?? undefined,
      market: params.get("market") ?? undefined,
    });

    const identifier = routeParams.id ?? "";

    const db = await getReadyDb();
    const detail = await getItemDetail(db, identifier, parsed.success ? RANGE_DAYS[parsed.data.range] : 365);
    if (!detail) throw notFound("Предмет не найден");

    return {
      ...detail,
      range: parsed.success ? parsed.data.range : "365d",
    };
  },
  { cache: { sMaxAge: 120, staleWhileRevalidate: 600 } },
);
