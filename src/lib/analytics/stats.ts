import { count, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { itemStats } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Пересборка материализованных показателей (`cs2_item_stats`).
 *
 * Один проход по котировкам и истории считает:
 *  - лучшую/худшую/среднюю цену и площадку-лидер;
 *  - сглаженные граничные цены (`last_price_usd` — медиана трёх последних
 *    наблюдений, `first_price_usd` — медиана трёх первых);
 *  - изменения за 7/30/90 дней: текущее значение сравнивается с медианой трёх
 *    наблюдений, ближайших к отметке N дней назад (окна не пересекаются);
 *  - границы истории и число наблюдений.
 *
 * Сглаживание нужно из-за наборов с недельной частотой: сырые пары «последняя
 * точка к точке недельной давности» дают на таких данных скачки в тысячи
 * процентов, а совпадающие окна — наоборот, вечные нули. Непересекающиеся
 * трёхточечные медианы устойчивы к одиночным выбросам и чувствительны к тренду.
 *
 * Значения затем читаются каталогом и сводкой, поэтому стоимость запроса не
 * зависит от объёма истории. Функция идемпотентна.
 */
export async function refreshItemStats(db: Database): Promise<number> {
  const startedAt = Date.now();

  await db.execute(sql`
    insert into cs2_item_stats (
      item_id, best_price_usd, worst_price_usd, average_price_usd, best_market_id,
      market_count, last_captured_at, has_live_quote,
      last_price_usd, first_price_usd, price_7d_usd, price_30d_usd, price_90d_usd,
      price_7d_date, price_30d_date, price_90d_date,
      change_7d, change_30d, change_90d,
      history_points, series_noisy, history_from, history_to, last_recorded_on, refreshed_at
    )
    with latest_quotes as (
      select distinct on (q.item_id, q.market_id)
        q.item_id, q.market_id, q.price_usd, q.captured_at, q.is_live
      from cs2_price_quotes q
      order by q.item_id, q.market_id, q.captured_at desc, q.id desc
    ),
    item_best as (
      select
        lq.item_id,
        min(lq.price_usd) as best_price,
        max(lq.price_usd) as worst_price,
        avg(lq.price_usd) as average_price,
        (array_agg(lq.market_id order by lq.price_usd asc, lq.market_id asc))[1] as best_market,
        count(*)::int as market_count,
        max(lq.captured_at) as last_captured_at,
        bool_or(lq.is_live) as has_live_quote
      from latest_quotes lq
      group by lq.item_id
    ),
    history_rows as (
      select
        h.item_id,
        h.recorded_on,
        h.price_usd,
        max(h.recorded_on) over (partition by h.item_id) as last_day,
        row_number() over (partition by h.item_id order by h.recorded_on asc) as rn_asc,
        row_number() over (partition by h.item_id order by h.recorded_on desc) as rn_desc
      from cs2_price_history_daily h
    ),
    history_prepared as (
      select
        hr.item_id,
        hr.recorded_on,
        hr.price_usd,
        hr.rn_asc,
        hr.rn_desc,
        -- Текущее значение — медиана трёх последних наблюдений.
        case when hr.rn_desc <= 3 then true else false end as is_current,
        -- Опорные окна набираются только из более старых точек (rn_desc > 3),
        -- чтобы окна «сейчас» и «N дней назад» не пересекались.
        case when hr.rn_desc > 3 then abs(hr.recorded_on - (hr.last_day - 7)) end as dist_7d,
        case when hr.rn_desc > 3 then abs(hr.recorded_on - (hr.last_day - 30)) end as dist_30d,
        case when hr.rn_desc > 3 then abs(hr.recorded_on - (hr.last_day - 90)) end as dist_90d
      from history_rows hr
    ),
    history_steps as (
      select
        h.item_id,
        h.price_usd / nullif(lag(h.price_usd) over (partition by h.item_id order by h.recorded_on), 0) as ratio
      from cs2_price_history_daily h
    ),
    history_jumps as (
      select
        hs.item_id,
        max(greatest(hs.ratio, 1 / hs.ratio)) as max_jump
      from history_steps hs
      group by hs.item_id
    ),
    history_ranked as (
      select
        hp.item_id,
        hp.recorded_on,
        hp.price_usd,
        hp.rn_asc,
        hp.rn_desc,
        hp.is_current,
        hp.dist_7d,
        hp.dist_30d,
        hp.dist_90d,
        -- Три наблюдения, ближайшие к отметке N дней назад.
        row_number() over (
          partition by hp.item_id order by hp.dist_7d asc nulls last
        ) as near_7d,
        row_number() over (
          partition by hp.item_id order by hp.dist_30d asc nulls last
        ) as near_30d,
        row_number() over (
          partition by hp.item_id order by hp.dist_90d asc nulls last
        ) as near_90d
      from history_prepared hp
    ),
    history_stats as (
      select
        hr.item_id,
        max(case when hr.rn_asc = 1 then hr.price_usd end) as first_price,
        max(case when hr.rn_desc = 1 then hr.price_usd end) as last_price,
        max(case when hr.rn_desc = 1 then hr.recorded_on end) as last_recorded_on,
        min(hr.recorded_on) as history_from,
        max(hr.recorded_on) as history_to,
        count(*)::int as points,
        coalesce(bool_or(hj.max_jump > 5), false) as series_noisy,
        percentile_cont(0.5) within group (order by hr.price_usd)
          filter (where hr.is_current) as current_smoothed,
        percentile_cont(0.5) within group (order by hr.price_usd)
          filter (where hr.rn_asc <= 3) as first_smoothed,
        percentile_cont(0.5) within group (order by hr.price_usd)
          filter (where hr.dist_7d is not null and hr.near_7d <= 3) as price_7d,
        percentile_cont(0.5) within group (order by hr.price_usd)
          filter (where hr.dist_30d is not null and hr.near_30d <= 3) as price_30d,
        percentile_cont(0.5) within group (order by hr.price_usd)
          filter (where hr.dist_90d is not null and hr.near_90d <= 3) as price_90d,
        max(case when hr.near_7d = 1 and hr.dist_7d is not null then hr.recorded_on end) as price_7d_date,
        max(case when hr.near_30d = 1 and hr.dist_30d is not null then hr.recorded_on end) as price_30d_date,
        max(case when hr.near_90d = 1 and hr.dist_90d is not null then hr.recorded_on end) as price_90d_date
      from history_ranked hr
      left join history_jumps hj on hj.item_id = hr.item_id
      group by hr.item_id
    )
    select
      i.id,
      b.best_price,
      b.worst_price,
      b.average_price,
      b.best_market,
      coalesce(b.market_count, 0),
      b.last_captured_at,
      coalesce(b.has_live_quote, false),
      h.current_smoothed,
      h.first_smoothed,
      h.price_7d,
      h.price_30d,
      h.price_90d,
      h.price_7d_date,
      h.price_30d_date,
      h.price_90d_date,
      case
        when h.points >= 4 and not coalesce(h.series_noisy, false) and h.price_7d > 0 and h.current_smoothed > 0
        then round(((h.current_smoothed - h.price_7d) / h.price_7d * 100)::numeric, 3)
      end,
      case
        when h.points >= 4 and not coalesce(h.series_noisy, false) and h.price_30d > 0 and h.current_smoothed > 0
        then round(((h.current_smoothed - h.price_30d) / h.price_30d * 100)::numeric, 3)
      end,
      case
        when h.points >= 4 and not coalesce(h.series_noisy, false) and h.price_90d > 0 and h.current_smoothed > 0
        then round(((h.current_smoothed - h.price_90d) / h.price_90d * 100)::numeric, 3)
      end,
      coalesce(h.points, 0),
      coalesce(h.series_noisy, false),
      h.history_from,
      h.history_to,
      h.last_recorded_on,
      now()
    from cs2_items i
    left join item_best b on b.item_id = i.id
    left join history_stats h on h.item_id = i.id
    on conflict (item_id) do update set
      best_price_usd = excluded.best_price_usd,
      worst_price_usd = excluded.worst_price_usd,
      average_price_usd = excluded.average_price_usd,
      best_market_id = excluded.best_market_id,
      market_count = excluded.market_count,
      last_captured_at = excluded.last_captured_at,
      has_live_quote = excluded.has_live_quote,
      last_price_usd = excluded.last_price_usd,
      first_price_usd = excluded.first_price_usd,
      price_7d_usd = excluded.price_7d_usd,
      price_30d_usd = excluded.price_30d_usd,
      price_90d_usd = excluded.price_90d_usd,
      price_7d_date = excluded.price_7d_date,
      price_30d_date = excluded.price_30d_date,
      price_90d_date = excluded.price_90d_date,
      change_7d = excluded.change_7d,
      change_30d = excluded.change_30d,
      change_90d = excluded.change_90d,
      history_points = excluded.history_points,
      series_noisy = excluded.series_noisy,
      history_from = excluded.history_from,
      history_to = excluded.history_to,
      last_recorded_on = excluded.last_recorded_on,
      refreshed_at = now()
  `);

  const [row] = await db.select({ value: count() }).from(itemStats);
  const total = Number(row?.value ?? 0);
  logger.info("материализованные показатели обновлены", { items: total, durationMs: Date.now() - startedAt });
  return total;
}

const globalForStats = globalThis as typeof globalThis & { __cs2StatsReady?: Promise<number | null> };

/**
 * Гарантирует, что показатели посчитаны: на пустой таблице выполняет первую
 * сборку (например, когда каталог загружен, а пересборка ещё не запускалась).
 */
export function ensureItemStats(db: Database): Promise<number | null> {
  if (!globalForStats.__cs2StatsReady) {
    globalForStats.__cs2StatsReady = (async () => {
      const [row] = await db.select({ value: count() }).from(itemStats);
      if (Number(row?.value ?? 0) > 0) return null;
      return refreshItemStats(db);
    })().catch((error) => {
      globalForStats.__cs2StatsReady = undefined;
      logger.warn("не удалось подготовить показатели предметов", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
  }
  return globalForStats.__cs2StatsReady;
}
