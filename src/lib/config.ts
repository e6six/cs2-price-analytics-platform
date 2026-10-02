import { z } from "zod";

/**
 * Проверка окружения при старте процесса.
 *
 * Секреты провайдеров не хранятся в коде: адаптеры включаются только при
 * наличии переменной, а её отсутствие — нормальное состояние («источник не
 * подключён»), а не ошибка запуска приложения.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Полноценный PostgreSQL (production). Если не задан — используется встроенный. */
  DATABASE_URL: z.string().min(1).optional(),
  /** pg | pglite | auto (по умолчанию auto: DATABASE_URL → pg, иначе pglite). */
  DATABASE_DRIVER: z.enum(["pg", "pglite", "auto"]).default("auto"),
  /** Каталог встроенной базы (для локального запуска и preview). */
  PGLITE_DATA_DIR: z.string().default(".cache/pglite"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(15_000),
  DATABASE_SSL: booleanish.default(false),

  /** Прогонять миграции при старте приложения (удобно в контейнере/превью). */
  AUTO_MIGRATE: booleanish.default(true),
  /** Загружать проверенный набор данных при пустой базе. */
  AUTO_BOOTSTRAP: booleanish.default(true),
  /** Путь к каталогу с датасетами бутстрапа. */
  BOOTSTRAP_DIR: z.string().default("data/bootstrap"),

  /** Токен для запуска синхронизации через API (POST /api/sync). */
  SYNC_TOKEN: z.string().min(16).optional(),
  /** Разрешить анонимный запуск синхронизации (только для локальной разработки). */
  ALLOW_ANONYMOUS_SYNC: booleanish.default(false),
  /** Максимальное число предметов за один прогон синхронизации. */
  SYNC_MAX_ITEMS: z.coerce.number().int().min(1).max(50_000).default(250),
  /** Пауза между запросами к rate-limited источникам, мс. */
  SYNC_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(500).default(10_000),

  // --- Источники данных (включаются наличием учётных данных там, где они нужны) ---
  /** Steam Web API key — не нужен для market/priceoverview, но нужен для части методов. */
  STEAM_WEB_API_KEY: z.string().optional(),
  /** steamLoginSecure cookie для /market/pricehistory (полная история по предмету). */
  STEAM_MARKET_COOKIE: z.string().optional(),
  /** Минимальная свежесть перед повторным live-запросом Steam для одного предмета. */
  STEAM_PRICE_REFRESH_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  /** CSFloat передаётся опционально: публичные лоты доступны без ключа. */
  CSFLOAT_API_KEY: z.string().optional(),
  /** Личный API key SkinBaron, создаётся в профиле; нужен для GetExtendedPriceList. */
  SKINBARON_API_KEY: z.string().optional(),
  /** Документация SkinBaron не включает валюту в ответ цены: по умолчанию EUR. */
  SKINBARON_PRICE_CURRENCY: z.enum(["EUR", "USD"]).default("EUR"),
  /** Валюта экспорта LIS-SKINS (в ответе экспорта поле валюты отсутствует). */
  LISSKINS_PRICE_CURRENCY: z.enum(["EUR", "USD"]).default("USD"),
  /** DMarket API: публичные лоты доступны без ключа. */
  DMARKET_API_KEY: z.string().optional(),
  /** Buff163 требует авторизованную сессию. */
  BUFF_COOKIE: z.string().optional(),
  /** Ключ Waxpeer (партнёрский API). */
  WAXPEER_API_KEY: z.string().optional(),
  /** Публичный GitHub-датасет Steam-цен (MIT) для массового обновления. */
  STEAM_DATASET_REPO: z.string().default("ByMykel/counter-strike-price-tracker"),
  GITHUB_TOKEN: z.string().optional(),

  /** Ограничение публичного API: запросов в минуту на IP (0 — выключено). */
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(120),
  /** Кэширование ответов API, секунды. */
  API_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(60),
  /** Хранение котировок, дней (0 — без ограничения). */
  QUOTE_RETENTION_DAYS: z.coerce.number().int().min(0).default(400),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof envSchema> & {
  driver: "pg" | "pglite";
};

function resolveDriver(env: z.infer<typeof envSchema>): "pg" | "pglite" {
  if (env.DATABASE_DRIVER === "pg" || env.DATABASE_DRIVER === "pglite") return env.DATABASE_DRIVER;
  return env.DATABASE_URL ? "pg" : "pglite";
}

function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Некорректная конфигурация окружения: ${issues}`);
  }

  const env = parsed.data;
  return { ...env, driver: env.DATABASE_DRIVER === "auto" ? resolveDriver(env) : env.DATABASE_DRIVER };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Сброс кэша нужен только тестам и скриптам, меняющим process.env. */
export function resetConfigCache(): void {
  cached = null;
}

export function hasCredential(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
