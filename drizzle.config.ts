import { defineConfig } from "drizzle-kit";

/**
 * Генерация SQL-миграций (`npm run db:generate`) и их применение
 * (`npm run db:migrate`). URL берётся из окружения; значение по умолчанию —
 * локальный PostgreSQL из docker-compose.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: false,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://cs2:cs2@127.0.0.1:5432/cs2_index",
  },
});
