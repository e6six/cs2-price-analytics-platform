import { getReadyDb } from "@/db";
import { badRequest, parseQuery, serviceUnavailable, route, unauthorized } from "@/lib/api/http";
import { providerCatalog, syncSources } from "@/lib/ingest/runner";
import { getConfig, hasCredential } from "@/lib/config";
import { getIngestRuns } from "@/lib/analytics/aggregates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorize(request: Request): void {
  const config = getConfig();
  if (!hasCredential(config.SYNC_TOKEN)) {
    if (config.NODE_ENV !== "production" && config.ALLOW_ANONYMOUS_SYNC) return;
    throw serviceUnavailable(
      "Синхронизация не настроена: задайте SYNC_TOKEN (или ALLOW_ANONYMOUS_SYNC=1 вне production)",
    );
  }

  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : request.headers.get("x-sync-token");
  if (token !== config.SYNC_TOKEN) throw unauthorized("Неверный токен синхронизации");
}

/** Статус источников без запуска сбора. */
export const GET = route(
  async () => {
    const db = await getReadyDb();
    return { providers: providerCatalog(), runs: await getIngestRuns(db, 10) };
  },
  { cache: { sMaxAge: 30, staleWhileRevalidate: 120 } },
);

/**
 * Запуск сбора цен.
 *
 * Предназначен для планировщика (cron/CronJob). Требует `SYNC_TOKEN`; прогон
 * ограничен по числу предметов и времени, а результат виден в `/api/sources`.
 */
export const POST = route(
  async (request) => {
    authorize(request);

    const params = parseQuery(request);
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const sourcesParam = params.get("sources") ?? params.get("source");
    const limitParam = params.get("limit");

    const sourceIds: string[] | undefined = sourcesParam
      ? sourcesParam.split(",").map((value) => value.trim()).filter(Boolean)
      : Array.isArray(body?.sources)
        ? body.sources
        : undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : body?.limit;

    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 50_000)) {
      throw badRequest("Некорректное значение limit");
    }

    const db = await getReadyDb();
    const report = await syncSources(db, {
      sourceIds,
      limit: limit === undefined ? undefined : Number(limit),
      aggregateHistory: body?.aggregateHistory !== false,
      triggeredBy: `api:${request.headers.get("user-agent")?.slice(0, 40) ?? "unknown"}`,
    });

    const failed = report.runs.filter((run) => run.status === "failed").length;
    const succeeded = report.runs.filter((run) => run.status === "success" || run.status === "partial").length;

    return {
      ok: failed === 0,
      report,
      summary: {
        sources: report.runs.length,
        succeeded,
        failed,
        skipped: report.runs.filter((run) => run.status === "skipped").length,
        historyRows: report.historyRows,
      },
    };
  },
  { skipRateLimit: false },
);
