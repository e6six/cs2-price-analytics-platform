/**
 * Инициализация серверного процесса Next.js.
 *
 * Миграции и загрузка набора выполняются в фоне, чтобы сервер начинал слушать
 * порт сразу: запросы, которые придут раньше, дождутся готовности базы внутри
 * `getReadyDb()`. Ошибка инициализации логируется и повторяется при следующем
 * запросе — процесс не падает.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureBootstrap } = await import("@/db");
  const { logger } = await import("@/lib/logger");

  logger.info("инициализация базы данных", { driver: process.env.DATABASE_URL ? "pg" : "pglite" });

  ensureBootstrap().catch((error) => {
    logger.error("фоновая инициализация базы не удалась", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
