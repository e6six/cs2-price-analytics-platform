/** Нормализованная котировка, которую возвращает любой адаптер источника. */
export type RawQuote = {
  /** Каноническое имя предмета (Steam market_hash_name) — ключ сопоставления. */
  marketHashName: string;
  /** `markets.id` источника. */
  marketId: string;
  /** Что означает цена: минимальный лот, медиана сделок, бид и т. д. */
  priceKind: "lowest_ask" | "median_sale" | "highest_bid" | "suggested" | "last_sale";
  price: number;
  currency: string;
  /** Число активных лотов/сделок, если источник его публикует. */
  volume?: number | null;
  /** Сколько дней истории содержит источник (для статей и валидации). */
  capturedAt: Date;
  sourceUrl?: string;
  /** Служебная пометка (например, «цена включает комиссию покупателя»). */
  note?: string;
};

export type ProviderRunContext = {
  /** Если задано — забирать котировки только по этим предметам. */
  marketHashNames?: string[];
  /** Верхняя граница числа предметов за прогон (бюджет запросов). */
  limit?: number;
  signal?: AbortSignal;
  /** Состояние предыдущего прогона источника (курсор, счётчики) для продолжения обхода. */
  metadata?: Record<string, unknown> | null;
};

export type ProviderResult = {
  quotes: RawQuote[];
  /** Сколько HTTP-запросов было сделано (для журнала ингеста). */
  requests: number;
  /** Имена предметов, которых не удалось получить (для отчёта о покрытии). */
  missing?: string[];
  notes?: string;
  /** Состояние для следующего прогона: сохраняется в `cs2_ingest_runs.details.state`. */
  state?: Record<string, unknown>;
  /** true, если прогон завершился не полностью (остановка по лимиту/ошибке площадки). */
  partial?: boolean;
};

export type Provider = {
  id: string;
  /** `markets.id`, к которому относятся котировки. */
  marketId: string;
  label: string;
  /** bulk — одна пачка на весь каталог; item — по предмету за запрос. */
  mode: "bulk" | "item";
  /** Требует ли источник учётные данные. */
  requiresCredentials: boolean;
  /**
   * false — источник сам обходит каталог и не принимает список имён;
   * в этом случае `limit` трактуется как бюджет страниц, а не число предметов.
   */
  supportsNameFilter?: boolean;
  /** Функция проверки готовности: возвращает причину, если источник выключен. */
  disabledReason?: () => string | null;
  fetchQuotes: (context: ProviderRunContext) => Promise<ProviderResult>;
};

export function normalizePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string") {
    // Steam отдаёт "$21.45", "$1,234.56" и локальные форматы с запятой-разделителем.
    const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function normalizeVolume(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d-]/g, "");
    if (!cleaned) return null;
    const parsed = Number.parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
