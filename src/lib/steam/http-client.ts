import { getConfig } from "@/lib/config";
import { HttpClient } from "@/lib/http";

/**
 * Один общий ограничитель для всех обращений к Steam Community из процесса.
 * Market priceoverview и чтение публичного инвентаря конкурируют за одну
 * осторожную квоту: 12 запросов в минуту, не чаще одного запроса в 4 секунды.
 */
let client: HttpClient | null = null;

export function getSteamHttpClient(): HttpClient {
  if (!client) {
    client = new HttpClient({
      sourceId: "steam-community",
      baseUrl: "https://steamcommunity.com",
      minIntervalMs: 4_000,
      concurrency: 1,
      maxPerMinute: 12,
      maxRetries: 2,
      timeoutMs: getConfig().SYNC_REQUEST_TIMEOUT_MS,
    });
  }
  return client;
}
