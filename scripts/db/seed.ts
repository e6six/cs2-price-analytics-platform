/**
 * Загрузка проверенного набора данных: npm run db:seed [-- --refresh]
 *
 *  - без флагов: загружает набор, если база пуста;
 *  - `--refresh`: принудительный переимпорт data/bootstrap (котировки, история,
 *    метаданные, показатели) — используется после пересборки набора;
 *  - `--sources`: обновляет только справочник источников.
 */
import "dotenv/config";
import { closeDb, ensureBootstrap, getReadyDb } from "@/db";
import { ensureBootstrapData, readBootstrapManifest } from "@/lib/ingest/bootstrap";
import { seedSources } from "@/lib/ingest/sources";
import { refreshItemStats } from "@/lib/analytics/stats";
import { logger } from "@/lib/logger";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  // ensureBootstrap загружает набор при пустой базе и переоткрывает соединение,
  // поэтому рабочее соединение берём уже после него.
  await ensureBootstrap();
  const db = await getReadyDb();

  if (args.has("--sources")) {
    await seedSources(db);
    logger.info("справочник источников обновлён");
    await closeDb();
    return;
  }

  if (args.has("--refresh")) {
    // Полный переимпорт набора: метаданные, котировки, история, показатели.
    const result = await ensureBootstrapData(db, { force: true });
    logger.info("набор переимпортирован", { ...result });
    await closeDb();
    return;
  }

  if (args.has("--stats")) {
    const stats = await refreshItemStats(db);
    logger.info("показатели предметов пересобраны", { items: stats });
    await closeDb();
    return;
  }

  const manifest = readBootstrapManifest();
  // Набор уже загружен в ensureBootstrap; здесь только отчёт для оператора.
  const result = await ensureBootstrapData(db);
  logger.info("загрузка набора завершена", {
    ...result,
    generator: manifest?.generator,
    sources: manifest?.sources.map((source) => `${source.id}@${source.commit.slice(0, 8)}`),
  });
  await closeDb();
}

main().catch((error) => {
  logger.error("загрузка набора не удалась", { error });
  process.exitCode = 1;
});
