import { getReadyDb } from "@/db";
import { badRequest, notFound, parseQuery, route } from "@/lib/api/http";
import { historyRangeSchema, RANGE_DAYS } from "@/lib/api/validation";
import { getItemBySlugOrId, getHistory } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

/** Временной ряд по предмету: `range=7d|30d|90d|365d`, опционально `market`. */
export const GET = route(
  async (request, { params }) => {
    const query = parseQuery(request);
    const parsed = historyRangeSchema.safeParse({
      range: query.get("range") ?? undefined,
      market: query.get("market") ?? undefined,
    });
    if (!parsed.success) throw badRequest("Некорректные параметры истории");

    const db = await getReadyDb();
    const identifier = params.id ?? "";
    const reference = await getItemBySlugOrId(db, identifier);
    if (!reference) throw notFound("Предмет не найден");

    const history = await getHistory(db, reference.id, RANGE_DAYS[parsed.data.range], parsed.data.market);

    return {
      itemId: reference.id,
      range: parsed.data.range,
      marketId: parsed.data.market ?? null,
      points: history.length,
      history,
    };
  },
  { cache: { sMaxAge: 300, staleWhileRevalidate: 900 } },
);
