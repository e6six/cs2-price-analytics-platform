/**
 * Сборка проверенного набора данных `data/bootstrap/*` из открытых источников.
 *
 * Набор содержит три артефакта, которые коммитятся в репозиторий и загружаются
 * в базу при первом старте (см. `src/lib/ingest/bootstrap.ts`):
 *
 *  - catalog.json.gz — метаданные предметов (CSGO-API, MIT);
 *  - quotes.json.gz  — актуальный снимок минимальных цен Steam (MIT-агрегат);
 *  - history.json.gz — исторические недельные срезы цен (история коммитов того же репозитория);
 *  - manifest.json   — происхождение, лицензии, контрольные суммы и статистика.
 *
 * Правила качества:
 *  - берётся последний снимок каждой даты (промежуточные «докачки» отбрасываются);
 *  - снимки с `metadata.resume_from` (частичные проходы) не используются как история;
 *  - аномально короткие снимки (< 50% от медианного размера) отбрасываются;
 *  - нулевые/отрицательные цены не попадают в набор: отсутствие данных — это
 *    не ноль, а отсутствие строки.
 *
 * Запуск: npm run data:bootstrap
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const SOURCES_DIR = process.env.SOURCES_DIR ?? path.join(process.cwd(), ".cache", "sources");
const OUT_DIR = process.env.BOOTSTRAP_OUT_DIR ?? path.join(process.cwd(), "data", "bootstrap");

/** Минимальная доля снимков с ценой, чтобы предмет получил историю. */
const HISTORY_MIN_COVERAGE = 0.6;
/** Максимум предметов с историей (остальные получают только текущую котировку). */
const HISTORY_MAX_ITEMS = 40_000;
/** Описания обрезаются: полный текст описаний не нужен витрине и весит десятки МБ. */
const DESCRIPTION_LIMIT = 240;

type RawEntity = Record<string, unknown> & {
  id?: string;
  name?: string;
  market_hash_name?: string | null;
  description?: string;
  rarity?: { name?: string; color?: string } | null;
  weapon?: { name?: string } | null;
  category?: { name?: string } | null;
  pattern?: { name?: string } | null;
  collections?: Array<{ name?: string }>;
  min_float?: number | null;
  max_float?: number | null;
  wear?: { name?: string } | null;
  stattrak?: boolean;
  souvenir?: boolean;
  paint_index?: string | null;
  image?: string | null;
  skin_id?: string;
  phase?: string | null;
};

type CatalogItem = {
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
  phase: string | null;
  metadataSource: string;
};

type Snapshot = { date: string; prices: Record<string, number>; commit: string; itemCount: number };

const ENTITY_FILES: Array<{ file: string; kind: string }> = [
  { file: "skins_not_grouped.json", kind: "skin" },
  { file: "crates.json", kind: "case" },
  { file: "agents.json", kind: "agent" },
  { file: "keys.json", kind: "key" },
  { file: "music_kits.json", kind: "music_kit" },
  { file: "keychains.json", kind: "charm" },
  { file: "patches.json", kind: "patch" },
  { file: "stickers.json", kind: "sticker" },
  { file: "graffiti.json", kind: "graffiti" },
  { file: "collectibles.json", kind: "collectible" },
];

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function stripHtml(value: string | undefined | null): string | null {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT - 1)}…` : text;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Все коммиты, менявшие latest.json, от старых к новым. */
function listSnapshotCommits(trackerDir: string): Array<{ sha: string; date: string }> {
  const output = git(["log", "--format=%H|%cI", "--", "static/latest.json"], trackerDir);
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date] = line.split("|");
      return { sha, date: date.slice(0, 10) };
    })
    .reverse();
}

type DatasetSnapshotFile = {
  metadata?: { updated_at?: string; currency?: string; item_count?: number; resume_from?: number };
  prices?: Record<string, number>;
};

function readSnapshot(trackerDir: string, sha: string): DatasetSnapshotFile | null {
  try {
    const raw = git(["show", `${sha}:static/latest.json`], trackerDir);
    return JSON.parse(raw) as DatasetSnapshotFile;
  } catch {
    return null;
  }
}

function buildSnapshots(trackerDir: string): Snapshot[] {
  const commits = listSnapshotCommits(trackerDir);
  console.log(`[data:bootstrap] коммитов с ценами: ${commits.length}`);

  const byDate = new Map<string, { sha: string; prices: Record<string, number>; partial: boolean }>();

  for (const commit of commits) {
    const parsed = readSnapshot(trackerDir, commit.sha);
    if (!parsed?.prices) continue;
    const itemCount = Object.keys(parsed.prices).length;
    if (itemCount === 0) continue;

    const date = (parsed.metadata?.updated_at ?? `${commit.date}T00:00:00Z`).slice(0, 10);
    const partial = Boolean(parsed.metadata?.resume_from);
    const previous = byDate.get(date);

    // Последний коммит даты считается финальным; полный снимок всегда лучше частичного.
    if (!previous || (previous.partial && !partial) || (previous.partial === partial && itemCount >= Object.keys(previous.prices).length)) {
      byDate.set(date, { sha: commit.sha, prices: parsed.prices, partial });
    }
  }

  const snapshots = [...byDate.entries()]
    .map(([date, value]) => ({ date, prices: value.prices, commit: value.sha, itemCount: Object.keys(value.prices).length }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const sizes = snapshots.map((snapshot) => snapshot.itemCount).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
  const kept = snapshots.filter((snapshot) => snapshot.itemCount >= median * 0.5);
  const dropped = snapshots.length - kept.length;
  if (dropped > 0) console.log(`[data:bootstrap] отброшено неполных снимков: ${dropped} (медиана ${median} позиций)`);

  return kept;
}

function buildCatalog(apiDir: string): { catalog: CatalogItem[]; byKind: Record<string, number> } {
  const collectionsBySkinId = new Map<string, string>();
  const grouped = readJson<RawEntity[]>(path.join(apiDir, "skins.json"));
  for (const skin of grouped) {
    const collection = skin.collections?.find((entry) => entry?.name)?.name;
    if (skin.id && collection) collectionsBySkinId.set(skin.id, collection);
  }

  const catalog = new Map<string, CatalogItem>();
  const byKind: Record<string, number> = {};

  for (const { file, kind } of ENTITY_FILES) {
    const filePath = path.join(apiDir, file);
    if (!existsSync(filePath)) continue;
    const entities = readJson<RawEntity[]>(filePath);
    for (const entity of entities) {
      const marketHashName = entity.market_hash_name?.trim();
      if (!marketHashName) continue;
      if (catalog.has(marketHashName)) continue;

      const isWeaponSkin = kind === "skin";
      const collection = isWeaponSkin && entity.skin_id ? collectionsBySkinId.get(entity.skin_id) ?? null : null;

      catalog.set(marketHashName, {
        marketHashName,
        name: entity.name?.trim() ?? marketHashName,
        kind,
        weapon: entity.weapon?.name?.trim() ?? null,
        skin: entity.pattern?.name?.trim() ?? null,
        category: entity.category?.name?.trim() ?? null,
        rarity: entity.rarity?.name?.trim() ?? null,
        rarityColor: entity.rarity?.color?.trim() ?? null,
        collection,
        wear: entity.wear?.name?.trim() ?? null,
        stattrak: Boolean(entity.stattrak),
        souvenir: Boolean(entity.souvenir),
        paintIndex: entity.paint_index ?? null,
        minFloat: typeof entity.min_float === "number" ? entity.min_float : null,
        maxFloat: typeof entity.max_float === "number" ? entity.max_float : null,
        imageUrl: entity.image ?? null,
        description: stripHtml(entity.description),
        phase: entity.phase ?? null,
        metadataSource: `dataset:csgo-api@${file}`,
      });
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
  }

  return { catalog: [...catalog.values()], byKind };
}

function main(): void {
  const apiDir = path.join(SOURCES_DIR, "csgo-api", "public", "api", "en");
  const trackerDir = path.join(SOURCES_DIR, "counter-strike-price-tracker");

  if (!existsSync(apiDir) || !existsSync(trackerDir)) {
    throw new Error(`Исходные данные не найдены в ${SOURCES_DIR}. Сначала выполните npm run data:fetch`);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const { catalog, byKind } = buildCatalog(apiDir);
  const snapshots = buildSnapshots(trackerDir);
  const latest = snapshots.at(-1);
  if (!latest) throw new Error("не найдено ни одного снимка цен");

  const catalogByName = new Map(catalog.map((item) => [item.marketHashName, item]));
  const catalogIndex = new Map(catalog.map((item, index) => [item.marketHashName, index]));

  /**
   * В источнике цены лежат в центах USD (`sell_price` из Steam
   * market/search/render). Приводим к долларам и проверяем правдоподобность:
   * медиана рынка CS2 не может быть в тысячах долларов, это признак ошибки units.
   */
  const toUsd = (cents: number): number => Math.round((cents / 100) * 100) / 100;
  const samplePrices = Object.values(latest.prices).filter((value) => Number.isFinite(value) && value > 0);
  const sortedSample = [...samplePrices].sort((a, b) => a - b);
  const medianCents = sortedSample[Math.floor(sortedSample.length / 2)] ?? 0;
  const medianUsd = medianCents / 100;
  if (medianUsd < 0.1 || medianUsd > 3000) {
    throw new Error(
      `[data:bootstrap] подозрительные единицы цен: медиана ${medianCents} → $${medianUsd}. Ожидались центы USD.`,
    );
  }
  console.log(`[data:bootstrap] медиана рынка: $${medianUsd.toFixed(2)} (из ${samplePrices.length} цен)`);

  // Котировки: только предметы, для которых есть метаданные (иначе теряется смысл каталога).
  const quotes = Object.entries(latest.prices)
    .filter(([name, price]) => catalogByName.has(name) && Number.isFinite(price) && price > 0)
    .map(([name, price]) => ({
      i: catalogIndex.get(name) ?? -1,
      p: toUsd(price),
    }))
    .filter((entry) => entry.i >= 0);

  // История: недельные срезы по предметам с достаточным покрытием.
  const dates = snapshots.map((snapshot) => snapshot.date);
  const coverage = new Map<string, number[]>();
  snapshots.forEach((snapshot, dayIndex) => {
    for (const [name, price] of Object.entries(snapshot.prices)) {
      if (!catalogByName.has(name) || !Number.isFinite(price) || price <= 0) continue;
      const series = coverage.get(name) ?? [];
      series.push(dayIndex, Math.round(price) / 100);
      coverage.set(name, series);
    }
  });

  type Candidate = { name: string; series: number[]; coverage: number; medianPrice: number };
  const candidates: Candidate[] = [...coverage.entries()]
    .map(([name, series]): Candidate => {
      const points = series.length / 2;
      const pricesOnly = series.filter((_, index) => index % 2 === 1);
      pricesOnly.sort((a, b) => a - b);
      const medianPrice = pricesOnly[Math.floor(pricesOnly.length / 2)] ?? 0;
      return { name, series, coverage: points / dates.length, medianPrice };
    })
    .filter((entry) => entry.coverage >= HISTORY_MIN_COVERAGE)
    .sort((left, right) => right.coverage - left.coverage || right.medianPrice - left.medianPrice);

  const historyEntries: Array<[number, number[]]> = candidates
    .slice(0, HISTORY_MAX_ITEMS)
    .map((entry): [number, number[]] => [catalogIndex.get(entry.name) ?? -1, entry.series])
    .filter(([index]) => index >= 0);

  const popularityByIndex = new Map<number, number>();
  for (const [name, series] of coverage) {
    const index = catalogIndex.get(name);
    if (index === undefined) continue;
    const points = series.length / 2;
    popularityByIndex.set(index, Math.round((points / dates.length) * 100));
  }

  const catalogWithPopularity = catalog.map((item, index) => ({
    ...item,
    popularity: popularityByIndex.get(index) ?? 0,
  }));

  const writeGzipJson = (file: string, value: unknown): { bytes: number; sha256: string } => {
    const json = JSON.stringify(value);
    const compressed = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
    writeFileSync(file, compressed);
    return { bytes: compressed.byteLength, sha256: createHash("sha256").update(compressed).digest("hex") };
  };

  const catalogFile = path.join(OUT_DIR, "catalog.json.gz");
  const quotesFile = path.join(OUT_DIR, "quotes.json.gz");
  const historyFile = path.join(OUT_DIR, "history.json.gz");

  const catalogMeta = writeGzipJson(catalogFile, catalogWithPopularity);
  const quotesMeta = writeGzipJson(quotesFile, { capturedAt: `${latest.date}T00:00:00.000Z`, quotes });
  const historyMeta = writeGzipJson(historyFile, { dates, items: historyEntries });

  const csgoApiCommit = git(["rev-parse", "HEAD"], path.join(SOURCES_DIR, "csgo-api")).trim();
  const trackerCommit = git(["rev-parse", "HEAD"], trackerDir).trim();

  const manifest = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/data/build-bootstrap.ts",
    sources: [
      {
        id: "dataset:csgo-api",
        repo: "https://github.com/ByMykel/CSGO-API",
        commit: csgoApiCommit,
        license: "MIT",
        attribution: "ByMykel/CSGO-API",
        usedFor: "метаданные предметов (названия, редкость, коллекции, износ, изображения)",
      },
      {
        id: "dataset:steam-price-tracker",
        repo: "https://github.com/ByMykel/counter-strike-price-tracker",
        commit: trackerCommit,
        license: "MIT",
        attribution: "ByMykel/counter-strike-price-tracker",
        usedFor: "минимальные цены Steam Community Market (снимок и история недельных срезов)",
      },
    ],
    stats: {
      catalogItems: catalogWithPopularity.length,
      catalogByKind: byKind,
      quoteItems: quotes.length,
      historyItems: historyEntries.length,
      historyDates: dates.length,
      historyFrom: dates[0],
      historyTo: dates.at(-1),
      snapshotDate: latest.date,
    },
    files: {
      "catalog.json.gz": { ...catalogMeta, records: catalogWithPopularity.length },
      "quotes.json.gz": { ...quotesMeta, records: quotes.length },
      "history.json.gz": { ...historyMeta, records: historyEntries.length },
    },
  };

  writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("[data:bootstrap] готово");
  console.log(JSON.stringify(manifest.stats, null, 2));
  console.log(
    `[data:bootstrap] размеры: catalog ${(catalogMeta.bytes / 1024).toFixed(0)} КБ, quotes ${(quotesMeta.bytes / 1024).toFixed(0)} КБ, history ${(historyMeta.bytes / 1024).toFixed(0)} КБ`,
  );
}

main();
