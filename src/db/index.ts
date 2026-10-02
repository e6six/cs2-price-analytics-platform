import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import * as schema from "@/db/schema";

export type Database = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

type DriverHandle = {
  db: Database;
  driver: "pg" | "pglite";
  close: () => Promise<void>;
};

const globalForDb = globalThis as typeof globalThis & {
  __cs2Db?: Promise<DriverHandle>;
  __cs2Bootstrap?: Promise<void>;
};

async function createPgHandle(): Promise<DriverHandle> {
  const config = getConfig();
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    application_name: "cs2-price-analytics",
    statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS || undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Пул не должен ронять процесс при сетевой ошибке idle-соединения.
  pool.on("error", (error) => {
    logger.error("pg pool error", { error: error.message });
  });

  const db = drizzle(pool, { schema }) as unknown as Database;
  return {
    db,
    driver: "pg",
    close: async () => {
      await pool.end();
    },
  };
}

async function createPgliteHandle(): Promise<DriverHandle> {
  const config = getConfig();
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { mkdirSync } = await import("node:fs");
  const path = await import("node:path");

  logger.warn("DATABASE_URL не задан — используется встроенный PostgreSQL (PGlite)", {
    dataDir: config.PGLITE_DATA_DIR,
    hint: "Для production укажите DATABASE_URL управляемого PostgreSQL",
  });

  // PGlite создаёт каталог данных, но не родительские каталоги.
  mkdirSync(path.dirname(path.resolve(config.PGLITE_DATA_DIR)), { recursive: true });
  const client = new PGlite(config.PGLITE_DATA_DIR);
  const db = drizzle(client, { schema }) as unknown as Database;
  return {
    db,
    driver: "pglite",
    close: async () => {
      await client.close();
    },
  };
}

export function getDriver(): "pg" | "pglite" {
  return getConfig().driver;
}

/**
 * Ленивая инициализация соединения. Один инстанс на процесс (важно для dev-режима
 * Next.js, где модули перезагружаются при HMR).
 */
export function getDbHandle(): Promise<DriverHandle> {
  if (!globalForDb.__cs2Db) {
    globalForDb.__cs2Db = (getDriver() === "pg" ? createPgHandle() : createPgliteHandle()).catch(
      (error) => {
        globalForDb.__cs2Db = undefined;
        throw error;
      },
    );
  }
  return globalForDb.__cs2Db;
}

export async function getDb(): Promise<Database> {
  const handle = await getDbHandle();
  return handle.db;
}

export async function closeDb(): Promise<void> {
  const handle = globalForDb.__cs2Db;
  globalForDb.__cs2Db = undefined;
  if (!handle) return;
  try {
    const resolved = await handle.catch(() => null);
    await resolved?.close();
  } catch (error) {
    // Закрытие — служебная операция: сбой при остановке не должен валить процесс.
    logger.warn("соединение с базой закрыто с ошибкой", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Пересоздание соединения. Нужно для встроенного PostgreSQL: после массового
 * импорта (десятки тысяч строк) PGlite в этой сборке перестаёт возвращать
 * строки в том же соединении, хотя данные записаны. Переоткрытие базы
 * возвращает согласованное состояние.
 */
export async function resetDbHandle(): Promise<void> {
  await closeDb();
}

/** Однократная инициализация схемы и загрузка проверенного набора данных. */
export function ensureBootstrap(): Promise<void> {
  if (!globalForDb.__cs2Bootstrap) {
    globalForDb.__cs2Bootstrap = (async () => {
      const config = getConfig();
      const { runMigrations } = await import("@/db/migrate");
      const db = await getDb();

      if (config.AUTO_MIGRATE) {
        await runMigrations(db, getDriver());
      }

      if (config.AUTO_BOOTSTRAP) {
        const { ensureBootstrapData } = await import("@/lib/ingest/bootstrap");
        const result = await ensureBootstrapData(db);
        if (!result.skipped && result.items > 0 && getDriver() === "pglite") {
          logger.info("переоткрытие встроенной базы после массового импорта", { items: result.items });
          await resetDbHandle();
        }
      }
    })().catch((error) => {
      globalForDb.__cs2Bootstrap = undefined;
      throw error;
    });
  }
  return globalForDb.__cs2Bootstrap;
}

/**
 * База, готовая к запросам: гарантирует, что миграции применены, набор данных
 * загружен, а соединение не осталось в состоянии после массового импорта.
 */
export async function getReadyDb(): Promise<Database> {
  await ensureBootstrap();
  return getDb();
}

export async function checkDatabase(): Promise<{ ok: boolean; driver: "pg" | "pglite"; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`select 1`);
    return { ok: true, driver: getDriver(), latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      driver: getDriver(),
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { schema };
