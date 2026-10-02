import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { ingestRuns, items, priceHistoryDaily, priceQuotes, sourceHealth } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { seedSources } from "@/lib/ingest/sources";
import { refreshItemStats } from "@/lib/analytics/stats";

export const BOOTSTRAP_SOURCE_ID = "dataset:bootstrap";
export const STEAM_MARKET_ID = "steam-community";

type CatalogEntry = {
  marketHashName: string;
  name: string;
  kind: string;
  weapon: string | null;
  skin: string | null;
  category: string | null;
  rarity: string | null;
  rarityColor: string | null;
  collection: string | null;
  wear: string | null;
  stattrak: boolean;
  souvenir: boolean;
  paintIndex: string | null;
  minFloat: number | null;
  maxFloat: number | null;
  imageUrl: string | null;
  description: string | null;
  metadataSource: string;
  popularity: number;
};

type QuotesFile = { capturedAt: string; quotes: Array<{ i: number; p: number }> };
type HistoryFile = { dates: string[]; items: Array<[number, number[]]> };

export type BootstrapResult = {
  skipped: boolean;
  items: number;
  quotes: number;
  historyRows: number;
  source: { snapshotDate: string; generatedAt: string } | null;
  durationMs: number;
};

function slugify(marketHashName: string, usedSlugs: Set<string>): string {
  const base = marketHashName
    .toLowerCase()
    .replace(/★/g, "star")
    .replace(/™/g, "trak")
    .replace(/[|]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  let slug = base || "item";
  let counter = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  usedSlugs.add(slug);
  return slug;
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export type BootstrapManifest = {
  generatedAt: string;
  generator?: string;
  sources: Array<{ id: string; repo: string; commit: string; license: string; attribution: string; usedFor: string }>;
  stats: Record<string, unknown> & {
    snapshotDate?: string;
    historyFrom?: string;
    historyTo?: string;
  };
  /** Контрольные суммы артефактов: используются как идентификатор набора. */
  files?: Record<string, { sha256: string; bytes: number; records: number }>;
};

export function readBootstrapManifest(dir = getConfig().BOOTSTRAP_DIR): BootstrapManifest | null {
  try {
    const raw = readFileSync(path.join(dir, "manifest.json"), "utf8");
    return JSON.parse(raw) as BootstrapManifest;
  } catch {
    return null;
  }
}

function readGzipJson<T>(file: string): T {
  const buffer = readFileSync(file);
  return JSON.parse(gunzipSync(buffer).toString("utf8")) as T;
}

export function bootstrapArtifactsAvailable(dir = getConfig().BOOTSTRAP_DIR): boolean {
  try {
    readBootstrapManifest(dir);
    for (const file of ["catalog.json.gz", "quotes.json.gz", "history.json.gz"]) {
      readFileSync(path.join(dir, file));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Загрузка проверенного набора данных в пустую базу.
 *
 * Идемпотентна: повторный запуск обновляет метаданные и котировки, но не
 * дублирует строки (ключи `market_hash_name`, `source_key` и уникальный индекс
 * истории). Если база уже наполнена, загрузка пропускается, чтобы старт
 * приложения не ждал лишней работы.
 */
export async function ensureBootstrapData(db: Database, options: { force?: boolean } = {}): Promise<BootstrapResult> {
  const startedAt = Date.now();
  const config = getConfig();

  await seedSources(db);

  const empty = { skipped: true, items: 0, quotes: 0, historyRows: 0, source: null, durationMs: 0 };
  if (!config.AUTO_BOOTSTRAP) return empty;
  if (!bootstrapArtifactsAvailable(config.BOOTSTRAP_DIR)) {
    logger.warn("набор данных бутстрапа не найден — каталог останется пустым до первой синхронизации", {
      dir: config.BOOTSTRAP_DIR,
    });
    return empty;
  }

  const existingRows = await db.select({ value: count() }).from(items);
  const existingCount = Number(existingRows[0]?.value ?? 0);
  if (existingCount > 0 && !options.force) {
    const manifest = readBootstrapManifest(config.BOOTSTRAP_DIR);
    if (manifest && !(await datasetMatchesLastImport(db, manifest))) {
      logger.warn("набор данных в репозитории новее загруженного — выполните npm run db:seed -- --refresh", {
        generatedAt: manifest.generatedAt,
        snapshot: manifest.stats?.snapshotDate,
      });
    }
    return { ...empty, skipped: true, items: existingCount, durationMs: Date.now() - startedAt };
  }

  const manifest = readBootstrapManifest(config.BOOTSTRAP_DIR);
  const catalog = readGzipJson<CatalogEntry[]>(path.join(config.BOOTSTRAP_DIR, "catalog.json.gz"));
  const quotesFile = readGzipJson<QuotesFile>(path.join(config.BOOTSTRAP_DIR, "quotes.json.gz"));
  const historyFile = readGzipJson<HistoryFile>(path.join(config.BOOTSTRAP_DIR, "history.json.gz"));

  logger.info("загрузка проверенного набора данных", {
    items: catalog.length,
    quotes: quotesFile.quotes.length,
    historyItems: historyFile.items.length,
    snapshot: quotesFile.capturedAt,
  });

  const [run] = await db
    .insert(ingestRuns)
    .values({
      sourceId: BOOTSTRAP_SOURCE_ID,
      status: "running",
      triggeredBy: "startup",
      message: "импорт набора data/bootstrap",
    })
    .returning({ id: ingestRuns.id });

  try {
    const phase = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
      const phaseStart = Date.now();
      const value = await task();
      logger.debug("фаза импорта завершена", { phase: name, durationMs: Date.now() - phaseStart });
      return value;
    };

    await phase("items", () => upsertCatalogItems(db, catalog, { skipUpdate: !options.force }));
    const idRows = await phase("item-ids", () =>
      db.select({ id: items.id, marketHashName: items.marketHashName }).from(items),
    );
    const idByName = new Map(idRows.map((row) => [row.marketHashName, row.id]));

    const capturedAt = new Date(quotesFile.capturedAt);
    const quoteRows = quotesFile.quotes
      .map((entry) => {
        const marketHashName = catalog[entry.i]?.marketHashName;
        const itemId = marketHashName ? idByName.get(marketHashName) : undefined;
        if (!itemId) return null;
        return {
          sourceKey: `${STEAM_MARKET_ID}:lowest_ask:${itemId}:${capturedAt.toISOString()}`,
          itemId,
          marketId: STEAM_MARKET_ID,
          priceKind: "lowest_ask" as const,
          price: entry.p.toFixed(4),
          currency: "USD",
          priceUsd: entry.p.toFixed(4),
          volume: null,
          capturedAt,
          sourceUrl: `https://github.com/${getConfig().STEAM_DATASET_REPO}/blob/main/static/latest.json`,
          ingestRunId: run.id,
          isLive: false,
          note: "снимок открытого датасета Steam (MIT), цена минимального лота",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    await phase("quotes", async () => {
      for (const batch of chunk(quoteRows, 2_000)) {
        // Принудительное обновление перезаписывает цену того же снимка, чтобы
        // повторный импорт после пересборки набора не оставлял старых значений.
        await db
          .insert(priceQuotes)
          .values(batch)
          .onConflictDoUpdate({
            target: priceQuotes.sourceKey,
            set: {
              price: sql`excluded.price`,
              priceUsd: sql`excluded.price_usd`,
              currency: sql`excluded.currency`,
              note: sql`excluded.note`,
            },
          });
      }
    });

    const historyRows = historyFile.items.flatMap(([itemIndex, series]) => {
      const marketHashName = catalog[itemIndex]?.marketHashName;
      const itemId = marketHashName ? idByName.get(marketHashName) : undefined;
      if (!itemId) return [];

      const rows: Array<typeof priceHistoryDaily.$inferInsert> = [];
      for (let index = 0; index < series.length; index += 2) {
        const date = historyFile.dates[series[index]];
        const price = series[index + 1];
        if (!date || !Number.isFinite(price) || price <= 0) continue;
        rows.push({
          itemId,
          marketId: STEAM_MARKET_ID,
          recordedOn: date,
          priceKind: "lowest_ask",
          lowPrice: price.toFixed(4),
          medianPrice: null,
          volume: null,
          currency: "USD",
          priceUsd: price.toFixed(4),
          isLive: false,
          sourceRef: "dataset:steam-price-tracker",
        });
      }
      return rows;
    });

    await phase("history", async () => {
      for (const batch of chunk(historyRows, 5_000)) {
        await db
          .insert(priceHistoryDaily)
          .values(batch)
          .onConflictDoUpdate({
            target: [
              priceHistoryDaily.itemId,
              priceHistoryDaily.marketId,
              priceHistoryDaily.recordedOn,
              priceHistoryDaily.priceKind,
            ],
            set: {
              lowPrice: sql`excluded.low_price`,
              priceUsd: sql`excluded.price_usd`,
              sourceRef: sql`excluded.source_ref`,
            },
          });
      }
    });

    // Показатели предметов считаются один раз, затем читаются каталогом и сводкой.
    await phase("stats", () => refreshItemStats(db));

    await db
      .update(ingestRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        itemsMatched: catalog.length,
        quotesInserted: quoteRows.length,
        historyUpserted: historyRows.length,
        message: `снимок датасета: ${quotesFile.capturedAt}; key:${datasetKey(manifest)}`,
      })
      .where(eq(ingestRuns.id, run.id));

    await db
      .insert(sourceHealth)
      .values({
        sourceId: BOOTSTRAP_SOURCE_ID,
        lastAttemptAt: new Date(),
        lastSuccessAt: new Date(),
        lastQuoteCount: quoteRows.length,
        breakerState: "closed",
      })
      .onConflictDoUpdate({
        target: sourceHealth.sourceId,
        set: {
          lastAttemptAt: new Date(),
          lastSuccessAt: new Date(),
          consecutiveFailures: 0,
          breakerState: "closed",
          lastError: null,
          lastQuoteCount: quoteRows.length,
          updatedAt: new Date(),
        },
      });

    const result: BootstrapResult = {
      skipped: false,
      items: catalog.length,
      quotes: quoteRows.length,
      historyRows: historyRows.length,
      source: {
        snapshotDate: quotesFile.capturedAt,
        generatedAt: manifest?.generatedAt ?? new Date().toISOString(),
      },
      durationMs: Date.now() - startedAt,
    };
    logger.info("набор данных загружен", { ...result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(ingestRuns)
      .set({ status: "failed", finishedAt: new Date(), durationMs: Date.now() - startedAt, errorCount: 1, message })
      .where(eq(ingestRuns.id, run.id));
    logger.error("не удалось загрузить набор данных", { error: message });
    throw error;
  }
}

/**
 * Идемпотентная запись каталога: обновляет метаданные существующих предметов
 * и добавляет новые, не трогая идентификаторы и не задевая котировки.
 */
/** Идентификатор набора: контрольные суммы артефактов из манифеста. */
function datasetKey(manifest: BootstrapManifest | null): string {
  if (!manifest?.files) return "unknown";
  return createHash("sha256")
    .update(
      Object.entries(manifest.files)
        .map(([file, meta]) => `${file}:${meta?.sha256 ?? ""}`)
        .join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

/** Совпадает ли загруженный набор с текущими артефактами. */
async function datasetMatchesLastImport(db: Database, manifest: BootstrapManifest): Promise<boolean> {
  const [row] = await db
    .select({ message: ingestRuns.message })
    .from(ingestRuns)
    .where(and(eq(ingestRuns.sourceId, BOOTSTRAP_SOURCE_ID), eq(ingestRuns.status, "success")))
    .orderBy(desc(ingestRuns.id))
    .limit(1);
  if (!row?.message) return false;
  return row.message.includes(`key:${datasetKey(manifest)}`);
}

export async function upsertCatalogItems(
  db: Database,
  catalog: CatalogEntry[],
  options: { skipUpdate?: boolean } = {},
): Promise<number> {
  const usedSlugs = new Set<string>();
  let processed = 0;

  for (const batch of chunk(catalog, 1_000)) {
    await db
      .insert(items)
      .values(
        batch.map((entry) => ({
          slug: slugify(entry.marketHashName, usedSlugs),
          marketHashName: entry.marketHashName,
          name: entry.name,
          kind: entry.kind,
          weapon: entry.weapon,
          skin: entry.skin,
          category: entry.category,
          rarity: entry.rarity,
          rarityColor: entry.rarityColor,
          collection: entry.collection,
          wear: entry.wear,
          stattrak: entry.stattrak,
          souvenir: entry.souvenir,
          paintIndex: entry.paintIndex,
          minFloat: entry.minFloat === null ? null : entry.minFloat.toFixed(6),
          maxFloat: entry.maxFloat === null ? null : entry.maxFloat.toFixed(6),
          imageUrl: entry.imageUrl,
          description: entry.description,
          popularity: entry.popularity ?? 0,
          metadataSource: entry.metadataSource,
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: items.marketHashName,
        set: {
          name: sql`excluded.name`,
          kind: sql`excluded.kind`,
          weapon: sql`excluded.weapon`,
          skin: sql`excluded.skin`,
          category: sql`excluded.category`,
          rarity: sql`excluded.rarity`,
          rarityColor: sql`excluded.rarity_color`,
          collection: sql`excluded.collection`,
          wear: sql`excluded.wear`,
          stattrak: sql`excluded.stattrak`,
          souvenir: sql`excluded.souvenir`,
          paintIndex: sql`excluded.paint_index`,
          minFloat: sql`excluded.min_float`,
          maxFloat: sql`excluded.max_float`,
          imageUrl: sql`excluded.image_url`,
          description: sql`excluded.description`,
          popularity: sql`excluded.popularity`,
          metadataSource: sql`excluded.metadata_source`,
          updatedAt: sql`now()`,
        },
      });
    processed += batch.length;
  }

  return processed;
}

/** Принудительная перезагрузка метаданных каталога из набора `data/bootstrap`. */
export async function reloadCatalogMetadata(db: Database): Promise<number> {
  const config = getConfig();
  const catalog = readGzipJson<CatalogEntry[]>(path.join(config.BOOTSTRAP_DIR, "catalog.json.gz"));
  return upsertCatalogItems(db, catalog);
}
