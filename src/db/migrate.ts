import path from "node:path";
import type { Database } from "@/db";
import { logger } from "@/lib/logger";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * Применение SQL-миграций из `drizzle/`.
 *
 * Миграции идемпотентны и учитываются в таблице `drizzle.__drizzle_migrations`,
 * поэтому их безопасно запускать отдельным шагом деплоя (`npm run db:migrate`)
 * или автоматически при старте (`AUTO_MIGRATE=true`).
 */
export async function runMigrations(db: Database, driver: "pg" | "pglite"): Promise<void> {
  const startedAt = Date.now();
  const options = { migrationsFolder: MIGRATIONS_FOLDER };

  if (driver === "pg") {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as unknown as Parameters<typeof migrate>[0], options);
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as unknown as Parameters<typeof migrate>[0], options);
  }

  logger.info("миграции применены", { driver, durationMs: Date.now() - startedAt });
}

export const migrationsFolder = MIGRATIONS_FOLDER;
