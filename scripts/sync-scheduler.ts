/**
 * Long-running poller for bulk marketplace feeds.
 *
 * Example: npm run sync:watch -- --interval=5
 * Steam priceoverview is intentionally excluded by default: call the one-item
 * refresh endpoint when viewing a listing, or schedule small targeted batches.
 */
import "dotenv/config";
import { closeDb, getReadyDb } from "@/db";
import { logger } from "@/lib/logger";
import { providers } from "@/lib/ingest/providers";
import { syncSources } from "@/lib/ingest/runner";

const DEFAULT_SOURCES = ["skinport", "csfloat", "lisskins", "skinbaron"];

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function sleepOrStop(ms: number, shouldStop: () => boolean): Promise<void> {
  if (shouldStop()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      process.removeListener("SIGINT", finish);
      process.removeListener("SIGTERM", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
  });
}

async function main(): Promise<void> {
  const intervalMinutes = Number.parseInt(readArg("interval") ?? "5", 10);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1_440) {
    throw new Error("--interval должен быть целым числом от 1 до 1440 минут");
  }
  const sourceIds = (readArg("source") ?? DEFAULT_SOURCES.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsedLimit = readArg("limit");
  const limit = parsedLimit === undefined ? undefined : Number.parseInt(parsedLimit, 10);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50_000)) {
    throw new Error("--limit должен быть целым числом от 1 до 50000");
  }
  if (sourceIds.length === 0) throw new Error("Укажите хотя бы один --source");
  const availableSources = new Set(providers.map((provider) => provider.id));
  const unknownSources = sourceIds.filter((sourceId) => !availableSources.has(sourceId));
  if (unknownSources.length > 0) throw new Error(`Неизвестные источники: ${unknownSources.join(", ")}`);
  if (sourceIds.includes("steam-community") && (limit === undefined || limit > 50)) {
    throw new Error("Для планового Steam priceoverview укажите --limit от 1 до 50, например --source=steam-community --limit=25");
  }

  let stopRequested = false;
  const requestStop = () => {
    stopRequested = true;
    logger.info("получен сигнал остановки; текущая синхронизация завершится штатно");
  };
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);

  try {
    const db = await getReadyDb();
    logger.info("планировщик обновления цен запущен", { intervalMinutes, sources: sourceIds, limit: limit ?? null });

    while (!stopRequested) {
      const startedAt = Date.now();
      try {
        const report = await syncSources(db, {
          sourceIds,
          limit,
          aggregateHistory: true,
          triggeredBy: "scheduler",
        });
        logger.info("плановый прогон завершён", {
          sources: report.runs.map((run) => ({ sourceId: run.sourceId, status: run.status, quotes: run.matched, message: run.message })),
          durationMs: Date.now() - startedAt,
          historyRows: report.historyRows,
        });
      } catch (error) {
        logger.error("плановый прогон не завершён; повтор будет выполнен по расписанию", {
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!stopRequested) await sleepOrStop(intervalMinutes * 60_000, () => stopRequested);
    }
  } finally {
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
    await closeDb();
  }
}

main().catch((error) => {
  logger.error("планировщик синхронизации завершился с ошибкой", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
