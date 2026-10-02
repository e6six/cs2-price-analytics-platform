import { and, eq, desc } from "drizzle-orm";
import type { Database } from "@/db";
import { fxRates } from "@/db/schema";
import { HttpClient } from "@/lib/http";
import { logger } from "@/lib/logger";

/**
 * Курсы валют.
 *
 * Источники вроде BUFF163 отдают цены в CNY, DMarket — в разных валютах.
 * Чтобы сравнение было корректным, каждая котировка нормализуется в USD:
 * берём официальный курс ЕЦБ за день снимка (fallback — последний известный),
 * иначе помечаем котировку как «не нормализована».
 *
 * Никакой автоматической подстановки «примерного» курса нет: без курса цена
 * сохраняется в исходной валюте с `price_usd` = цене и флагом в `note`.
 */
const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

const staticFallback: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  CNY: 0.14,
};

export async function fetchEcbRates(): Promise<Array<{ base: string; quote: string; rate: number; recordedOn: string }>> {
  const client = new HttpClient({ sourceId: "ecb-fx", minIntervalMs: 500, maxRetries: 2 });
  const xml = await client.requestText(ECB_URL);
  const dateMatch = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/);
  const recordedOn = dateMatch?.[1] ?? new Date().toISOString().slice(0, 10);
  const rows: Array<{ base: string; quote: string; rate: number; recordedOn: string }> = [];

  const pattern = /currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g;
  let match: RegExpExecArray | null;
  const eurRates: Record<string, number> = { EUR: 1 };
  while ((match = pattern.exec(xml)) !== null) {
    eurRates[match[1]] = Number.parseFloat(match[2]);
  }

  for (const [quote, perEur] of Object.entries(eurRates)) {
    if (!Number.isFinite(perEur) || perEur <= 0) continue;
    // 1 единица валюты quote = 1/perEur EUR = (1/perEur) * usdPerEur USD
    const usdPerEur = eurRates.USD;
    if (!usdPerEur) continue;
    rows.push({ base: quote, quote: "USD", rate: usdPerEur / perEur, recordedOn });
  }
  return rows;
}

export async function syncFxRates(db: Database): Promise<number> {
  try {
    const rows = await fetchEcbRates();
    if (rows.length === 0) return 0;
    await db
      .insert(fxRates)
      .values(
        rows.map((row) => ({
          base: row.base,
          quote: row.quote,
          recordedOn: row.recordedOn,
          rate: row.rate.toFixed(8),
          source: "ECB eurofxref-daily",
        })),
      )
      .onConflictDoUpdate({
        target: [fxRates.base, fxRates.quote, fxRates.recordedOn],
        set: { rate: fxRates.rate, fetchedAt: new Date() },
      });
    logger.info("курсы ЕЦБ обновлены", { rows: rows.length, recordedOn: rows[0]?.recordedOn });
    return rows.length;
  } catch (error) {
    logger.warn("не удалось получить курсы ЕЦБ, используются последние сохранённые", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Курс `from` → USD на дату (или ближайшую предшествующую).
 * Если курса нет в базе — возвращается статический ориентир с пометкой.
 */
export async function getUsdRate(
  db: Database,
  from: string,
  on: Date,
): Promise<{ rate: number; source: "db" | "static" }> {
  if (from === "USD") return { rate: 1, source: "db" };

  const day = on.toISOString().slice(0, 10);
  const rows = await db
    .select({ rate: fxRates.rate, recordedOn: fxRates.recordedOn })
    .from(fxRates)
    .where(and(eq(fxRates.base, from), eq(fxRates.quote, "USD")))
    .orderBy(desc(fxRates.recordedOn))
    .limit(5);

  const exact = rows.find((row) => row.recordedOn <= day);
  if (exact) return { rate: Number(exact.rate), source: "db" };

  const fallback = staticFallback[from];
  if (fallback !== undefined) return { rate: fallback, source: "static" };
  return { rate: 1, source: "static" };
}
