import { and, desc, eq } from "drizzle-orm";
import { getReadyDb } from "@/db";
import { items, priceQuotes } from "@/db/schema";
import { badRequest, notFound, route } from "@/lib/api/http";
import { historyRangeSchema, RANGE_DAYS } from "@/lib/api/validation";
import { getItemBySlugOrId, getItemDetail } from "@/lib/analytics/queries";
import { getConfig } from "@/lib/config";
import { syncSources } from "@/lib/ingest/runner";
import { getSteamRefreshCooldown } from "@/lib/steam/refresh-cooldown";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * On-demand live refresh for one catalog item. Steam's public priceoverview is
 * queried through the same process-wide limiter as other Steam requests. A
 * recent quote is reused to avoid exhausting Steam's undocumented market quota.
 */
export const POST = route(async (request, { params }) => {
  const rangeResult = historyRangeSchema.safeParse({
    range: new URL(request.url).searchParams.get("range") ?? undefined,
  });
  if (!rangeResult.success) throw badRequest("Некорректный диапазон истории");

  const db = await getReadyDb();
  const identifier = params.id ?? "";
  const reference = await getItemBySlugOrId(db, identifier);
  if (!reference) throw notFound("Предмет не найден");

  const [item] = await db.select({ id: items.id, marketHashName: items.marketHashName }).from(items).where(eq(items.id, reference.id)).limit(1);
  if (!item) throw notFound("Предмет не найден");

  const [previousQuote] = await db
    .select({ capturedAt: priceQuotes.capturedAt })
    .from(priceQuotes)
    .where(
      and(
        eq(priceQuotes.itemId, item.id),
        eq(priceQuotes.marketId, "steam-community"),
        eq(priceQuotes.priceKind, "lowest_ask"),
        eq(priceQuotes.isLive, true),
      ),
    )
    .orderBy(desc(priceQuotes.capturedAt))
    .limit(1);

  const cooldownSeconds = getConfig().STEAM_PRICE_REFRESH_COOLDOWN_SECONDS;
  const cooldown = getSteamRefreshCooldown(previousQuote?.capturedAt, cooldownSeconds);
  const reusedRecentQuote = cooldown.reuse;
  let report = null;

  if (!reusedRecentQuote) {
    report = await syncSources(db, {
      sourceIds: ["steam-community"],
      marketHashNames: [item.marketHashName],
      limit: 1,
      aggregateHistory: false,
      triggeredBy: "user:item-refresh",
    });
  }

  const detail = await getItemDetail(db, String(item.id), RANGE_DAYS[rangeResult.data.range]);
  if (!detail) throw notFound("Предмет не найден");

  const steamQuote = detail.offers.find((offer) => offer.marketId === "steam-community" && offer.priceKind === "lowest_ask");
  const run = report?.runs[0];
  let message: string;
  if (reusedRecentQuote) {
    message = `Использована котировка Steam от ${previousQuote!.capturedAt.toISOString()}; повторный запрос будет доступен через ${cooldown.remainingSeconds} сек.`;
  } else if (run?.status === "failed") {
    message = `Steam временно не ответил: ${run.message ?? "ошибка источника"}`;
  } else if (run && run.matched > 0 && steamQuote) {
    message = `Цена Steam обновлена: ${steamQuote.price.toFixed(2)} ${steamQuote.currency}, снимок ${steamQuote.capturedAt}.`;
  } else {
    message = run?.message ?? "Steam не вернул минимальную цену активного лота для этого предмета.";
  }

  return {
    detail,
    refresh: {
      reusedRecentQuote,
      message,
      status: run?.status ?? "cached",
      requests: run?.requests ?? 0,
      capturedAt: reusedRecentQuote || (run?.matched ?? 0) > 0 ? steamQuote?.capturedAt ?? null : null,
    },
  };
});
