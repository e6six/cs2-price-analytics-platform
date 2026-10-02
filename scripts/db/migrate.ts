/**
 * Применение миграций: npm run db:migrate
 *
 * В production это отдельный шаг деплоя (до старта новой версии приложения).
 * При AUTO_MIGRATE=true те же миграции применяются при старте процесса.
 */
import "dotenv/config";
import { closeDb, getDb, getDriver } from "@/db";
import { runMigrations } from "@/db/migrate";
import { logger } from "@/lib/logger";

async function main(): Promise<void> {
  const driver = getDriver();
  const db = await getDb();
  await runMigrations(db, driver);
  logger.info("миграции применены", { driver });
  await closeDb();
}

main().catch((error) => {
  logger.error("миграции не применены", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
