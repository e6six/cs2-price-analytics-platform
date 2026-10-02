/**
 * Синхронизация реальных цен: npm run sync [-- --source=skinport,csfloat] [-- --limit=500]
 *
 * Примеры:
 *   npm run sync                                  # все включённые источники
 *   npm run sync -- --source=steam-community --limit=250
 *   npm run sync -- --source=skinport,csfloat --no-history
 *
 * Источники без учётных данных, недоступные из сети или заблокированные
 * площадкой помечаются в журнале как skipped — прогон не падает целиком.
 */
import "dotenv/config";
import { closeDb, getDb } from "@/db";
import { syncSources } from "@/lib/ingest/runner";
import { logger } from "@/lib/logger";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const sourceIds = readArg("source")?.split(",").map((value) => value.trim()).filter(Boolean);
  const limit = readArg("limit") ? Number.parseInt(readArg("limit") as string, 10) : undefined;

  const db = await getDb();
  const report = await syncSources(db, {
    sourceIds,
    limit: Number.isFinite(limit) ? limit : undefined,
    aggregateHistory: !args.has("--no-history"),
    triggeredBy: "cli",
  });

  for (const run of report.runs) {
    logger.info("источник обработан", { ...run });
  }
  logger.info("синхронизация завершена", { historyRows: report.historyRows });

  const failed = report.runs.filter((run) => run.status === "failed").length;
  await closeDb();
  if (failed === report.runs.length && report.runs.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  logger.error("синхронизация не удалась", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
