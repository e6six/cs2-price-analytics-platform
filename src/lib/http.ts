import { logger } from "@/lib/logger";
import { getConfig } from "@/lib/config";

export type HttpErrorKind = "network" | "timeout" | "http" | "parse" | "rate_limited" | "circuit_open";

export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly url: string;

  constructor(options: {
    kind: HttpErrorKind;
    url: string;
    message: string;
    status?: number;
    retryAfterMs?: number;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "HttpError";
    this.kind = options.kind;
    this.url = options.url;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }

  get retryable(): boolean {
    if (this.kind === "network" || this.kind === "timeout" || this.kind === "rate_limited") return true;
    if (this.kind === "http" && this.status) return this.status >= 500 || this.status === 408 || this.status === 429;
    return false;
  }
}

/** Разбор Retry-After (секунды или HTTP-дата) с ограничением сверху. */
export function parseRetryAfter(value: string | null, maxMs = 60_000): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxMs);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - Date.now(), 0), maxMs);
}

export type RateLimiterOptions = {
  /** Минимальный интервал между запросами, мс. */
  minIntervalMs: number;
  /** Сколько запросов допускается одновременно. */
  concurrency?: number;
  /** Потолок запросов в минуту (необязательно). */
  maxPerMinute?: number;
};

/**
 * Простой ограничитель частоты для исходящих запросов к площадкам.
 *
 * Источники вроде Steam Community Market агрессивно ограничивают частоту,
 * поэтому интервал и параллелизм задаются на уровне адаптера, а сброс
 * (429 / Retry-After) обрабатывается вызывающим кодом.
 */
export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly concurrency: number;
  private readonly maxPerMinute: number;
  private readonly timestamps: number[] = [];
  private active = 0;
  private queue: Array<() => void> = [];
  private lastStartedAt = 0;

  constructor(options: RateLimiterOptions) {
    this.minIntervalMs = Math.max(0, options.minIntervalMs);
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.maxPerMinute = options.maxPerMinute ?? 0;
  }

  private pruneTimestamps(now: number): void {
    while (this.timestamps.length > 0 && now - this.timestamps[0] > 60_000) this.timestamps.shift();
  }

  private async acquire(): Promise<void> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;

    const now = Date.now();
    this.pruneTimestamps(now);
    let waitMs = Math.max(0, this.lastStartedAt + this.minIntervalMs - now);
    if (this.maxPerMinute > 0 && this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0];
      waitMs = Math.max(waitMs, oldest + 60_000 - now);
    }
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    const startedAt = Date.now();
    this.lastStartedAt = startedAt;
    this.timestamps.push(startedAt);
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

export type HttpClientOptions = {
  /** Идентификатор источника для логов. */
  sourceId: string;
  baseUrl?: string;
  /** User-Agent обязателен: часть площадок блокирует запросы без него. */
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  minIntervalMs?: number;
  concurrency?: number;
  maxPerMinute?: number;
  defaultHeaders?: Record<string, string>;
};

export type RequestOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /** Отключить повторы (например, для запросов с побочными эффектами). */
  retries?: number;
  signal?: AbortSignal;
};

const DEFAULT_USER_AGENT =
  "cs2-price-analytics/1.0 (+https://github.com/e6six/cs2-price-analytics-platform; data aggregation for analytics)";

function jitter(base: number, ratio = 0.25): number {
  const delta = base * ratio;
  return Math.max(0, base - delta + Math.random() * delta * 2);
}

/**
 * HTTP-клиент с таймаутом, повторами, экспоненциальным backoff, jitter,
 * учётом `Retry-After` и размыкателем цепи (circuit breaker).
 *
 * Размыкатель защищает и площадку, и наш сервис: после серии отказов запросы
 * временно не отправляются, а вызывающий код получает явную ошибку
 * `circuit_open` вместо каскада таймаутов.
 */
export class HttpClient {
  private readonly options: Required<
    Pick<HttpClientOptions, "sourceId" | "timeoutMs" | "maxRetries">
  > &
    HttpClientOptions;
  private readonly limiter: RateLimiter;
  private failures = 0;
  private openedAt = 0;
  private halfOpenProbeInFlight = false;
  readonly metrics = { requests: 0, retries: 0, failures: 0, rateLimited: 0 };

  constructor(options: HttpClientOptions) {
    this.options = {
      timeoutMs: getConfig().SYNC_REQUEST_TIMEOUT_MS,
      maxRetries: 3,
      ...options,
    };
    this.limiter = new RateLimiter({
      minIntervalMs: options.minIntervalMs ?? 250,
      concurrency: options.concurrency ?? 2,
      maxPerMinute: options.maxPerMinute,
    });
  }

  private circuitOpen(): boolean {
    if (this.failures < 5) return false;
    const cooldown = Math.min(30_000 * 2 ** (this.failures - 5), 10 * 60_000);
    if (Date.now() - this.openedAt < cooldown) return true;
    return false;
  }

  private recordSuccess(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.halfOpenProbeInFlight = false;
  }

  private recordFailure(): void {
    this.failures += 1;
    this.openedAt = Date.now();
    this.halfOpenProbeInFlight = false;
  }

  async requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, options, "json");
  }

  async requestText(path: string, options: RequestOptions = {}): Promise<string> {
    return this.request<string>(path, options, "text");
  }

  private async request<T>(path: string, options: RequestOptions, mode: "json" | "text"): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.options.baseUrl ?? ""}${path}`;
    const retries = options.retries ?? this.options.maxRetries;

    if (this.circuitOpen()) {
      throw new HttpError({
        kind: "circuit_open",
        url,
        message: `Источник ${this.options.sourceId} временно отключён после ${this.failures} ошибок подряд`,
      });
    }

    let lastError: HttpError | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) {
        this.metrics.retries += 1;
        const backoff = jitter(Math.min(500 * 2 ** (attempt - 1), 8_000));
        const waitMs = Math.max(backoff, lastError?.retryAfterMs ?? 0);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      try {
        return await this.limiter.run(async () => {
          this.metrics.requests += 1;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
          const onAbort = () => controller.abort();
          options.signal?.addEventListener("abort", onAbort, { once: true });

          try {
            const response = await fetch(url, {
              method: options.method ?? "GET",
              headers: {
                "user-agent": this.options.userAgent ?? DEFAULT_USER_AGENT,
                accept: mode === "json" ? "application/json" : "text/html,application/json;q=0.9,*/*;q=0.8",
                ...this.options.defaultHeaders,
                ...options.headers,
              },
              body: options.body,
              signal: controller.signal,
              cache: "no-store",
            });

            if (!response.ok) {
              const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
              if (response.status === 429) this.metrics.rateLimited += 1;
              throw new HttpError({
                kind: response.status === 429 ? "rate_limited" : "http",
                url,
                status: response.status,
                retryAfterMs,
                message: `${this.options.sourceId}: HTTP ${response.status} ${response.statusText} для ${url}`,
              });
            }

            const text = await response.text();
            if (mode === "text") {
              this.recordSuccess();
              return text as T;
            }
            try {
              const parsed = JSON.parse(text) as T;
              this.recordSuccess();
              return parsed;
            } catch (error) {
              throw new HttpError({
                kind: "parse",
                url,
                message: `${this.options.sourceId}: некорректный JSON ответа`,
                cause: error,
              });
            }
          } catch (error) {
            if (error instanceof HttpError) throw error;
            const aborted = controller.signal.aborted;
            throw new HttpError({
              kind: aborted ? "timeout" : "network",
              url,
              message: aborted
                ? `${this.options.sourceId}: таймаут ${this.options.timeoutMs} мс для ${url}`
                : `${this.options.sourceId}: сетевая ошибка (${(error as Error).message})`,
              cause: error,
            });
          } finally {
            clearTimeout(timeout);
            options.signal?.removeEventListener("abort", onAbort);
          }
        });
      } catch (error) {
        const httpError =
          error instanceof HttpError
            ? error
            : new HttpError({ kind: "network", url, message: String(error), cause: error });

        lastError = httpError;
        this.metrics.failures += 1;

        if (!httpError.retryable || attempt === retries) {
          if (httpError.kind === "network" || httpError.kind === "timeout" || httpError.status === 429) {
            this.recordFailure();
          }
          throw httpError;
        }

        logger.debug("повтор запроса", {
          source: this.options.sourceId,
          url,
          attempt: attempt + 1,
          kind: httpError.kind,
          status: httpError.status,
        });
      }
    }

    throw lastError ?? new HttpError({ kind: "network", url, message: "неизвестная ошибка" });
  }

  get breakerState(): "closed" | "open" {
    return this.circuitOpen() ? "open" : "closed";
  }
}
