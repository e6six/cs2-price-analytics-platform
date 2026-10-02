import { randomUUID } from "node:crypto";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";

export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "rate_limited"
  | "service_unavailable"
  | "unauthorized"
  | "internal_error";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, "bad_request", message, details);
}

export function notFound(message: string): ApiError {
  return new ApiError(404, "not_found", message);
}

export function unauthorized(message = "Требуется авторизация"): ApiError {
  return new ApiError(401, "unauthorized", message);
}

export function serviceUnavailable(message: string, details?: unknown): ApiError {
  return new ApiError(503, "service_unavailable", message, details);
}

type CachePolicy = {
  /** Время жизни в CDN/прокси, секунды. */
  sMaxAge?: number;
  /** Время жизни в браузере, секунды. */
  maxAge?: number;
  staleWhileRevalidate?: number;
};

/**
 * Лимит запросов по IP.
 *
 * Хранилище в памяти процесса: его достаточно для одного инстанса и защиты от
 * случайных всплесков. Для нескольких реплик лимит должен считаться в общем
 * хранилище (Redis) — это зафиксировано в README.
 */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identity: string): { limited: boolean; retryAfterSeconds: number } {
  const limit = getConfig().API_RATE_LIMIT_PER_MINUTE;
  if (limit <= 0) return { limited: false, retryAfterSeconds: 0 };

  const now = Date.now();
  const bucket = rateBuckets.get(identity);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(identity, { count: 1, resetAt: now + 60_000 });
    return { limited: false, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

function clientIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export type RouteContext = {
  requestId: string;
  identity: string;
  /** Динамические сегменты маршрута, уже разрешённые из Promise. */
  params: Record<string, string>;
};

type NextRouteArgs = { params?: Promise<Record<string, string | string[]>> };

/**
 * Обёртка обработчика: единый формат ошибок, идентификатор запроса, лимит
 * частоты, заголовки кэширования и логирование.
 */
export function route(
  handler: (request: Request, context: RouteContext) => Promise<Response | unknown>,
  options: { cache?: CachePolicy; skipRateLimit?: boolean } = {},
) {
  return async (request: Request, args?: NextRouteArgs): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const identity = clientIdentity(request);
    const startedAt = Date.now();

    let params: Record<string, string> = {};
    try {
      const resolved = args?.params ? await args.params : {};
      params = Object.fromEntries(
        Object.entries(resolved).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
      );
    } catch {
      params = {};
    }

    try {
      if (!options.skipRateLimit) {
        const { limited, retryAfterSeconds } = checkRateLimit(identity);
        if (limited) {
          return Response.json(
            { error: { code: "rate_limited", message: "Слишком много запросов, попробуйте позже" }, requestId },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds), "x-request-id": requestId } },
          );
        }
      }

      const payload = await handler(request, { requestId, identity, params });
      if (payload instanceof Response) {
        payload.headers.set("x-request-id", requestId);
        return payload;
      }

      const headers: Record<string, string> = { "x-request-id": requestId };
      if (options.cache) {
        const ttl = options.cache.sMaxAge ?? getConfig().API_CACHE_TTL_SECONDS;
        headers["cache-control"] = [
          "public",
          `max-age=${options.cache.maxAge ?? 0}`,
          `s-maxage=${ttl}`,
          `stale-while-revalidate=${options.cache.staleWhileRevalidate ?? ttl * 2}`,
        ].join(", ");
      } else {
        headers["cache-control"] = "no-store";
      }

      return Response.json(payload, { headers });
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(500, "internal_error", "Внутренняя ошибка сервиса");

      const logPayload = {
        requestId,
        method: request.method,
        url: request.url,
        status: apiError.status,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
      if (apiError.status >= 500) logger.error("запрос завершился ошибкой", logPayload);
      else logger.warn("запрос отклонён", logPayload);

      return Response.json(
        { error: { code: apiError.code, message: apiError.message, details: apiError.details }, requestId },
        { status: apiError.status, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
      );
    }
  };
}

export function parseQuery(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}
