/** Публичные типы API. Все цены — в USD, если не указано иное. */

export type QuoteKind = "lowest_ask" | "median_sale" | "highest_bid" | "suggested" | "last_sale";

export type CatalogItem = {
  id: number;
  slug: string;
  marketHashName: string;
  name: string;
  kind: string;
  weapon: string | null;
  skin: string | null;
  category: string | null;
  rarity: string | null;
  rarityColor: string | null;
  collection: string | null;
  wear: string | null;
  stattrak: boolean;
  souvenir: boolean;
  minFloat: number | null;
  maxFloat: number | null;
  imageUrl: string | null;
  /** Лучшая (минимальная) цена покупателя среди подключённых площадок. */
  bestPriceUsd: number | null;
  /** Площадка с лучшей ценой. */
  bestMarketId: string | null;
  /** Число площадок, по которым есть котировки. */
  marketCount: number;
  /** Время самого свежего снимка по предмету. */
  lastCapturedAt: string | null;
  /** Изменение к цене недельной давности по истории, %. */
  change7d: number | null;
  change30d: number | null;
  /** Есть ли исторические наблюдения. */
  hasHistory: boolean;
  /** Ряд неустойчив: производные изменения не рассчитываются. */
  changeSuppressed: boolean;
  /** Средняя цена по площадкам (для оценки спреда). */
  averagePriceUsd: number | null;
};

export type CatalogFacet = { value: string; count: number };

export type CatalogResult = {
  items: CatalogItem[];
  total: number;
  page: number;
  limit: number;
  sort: string;
};

export type PriceOffer = {
  marketId: string;
  marketName: string;
  marketShortName: string;
  integrationStatus: string;
  priceKind: QuoteKind;
  price: number;
  currency: string;
  priceUsd: number;
  volume: number | null;
  capturedAt: string;
  fetchedAt: string;
  sourceUrl: string | null;
  isLive: boolean;
  note: string | null;
  /** Устарела ли котировка относительно политики свежести (дней). */
  isStale: boolean;
  ageHours: number;
};

export type HistoryPoint = {
  date: string;
  lowPriceUsd: number;
  medianPriceUsd: number | null;
  volume: number | null;
  marketId: string;
  priceKind: QuoteKind;
  isLive: boolean;
};

export type ItemStats = {
  bestPriceUsd: number | null;
  worstPriceUsd: number | null;
  averagePriceUsd: number | null;
  spreadPercent: number | null;
  change7d: number | null;
  change30d: number | null;
  change90d: number | null;
  /** Дата, с которой сравнивается текущая цена (ближайшая точка не новее периода). */
  change7dFrom: string | null;
  change30dFrom: string | null;
  change90dFrom: string | null;
  historyFrom: string | null;
  historyTo: string | null;
  points: number;
  /** Ряд неустойчив (резкие скачки) — изменения намеренно не рассчитаны. */
  changeSuppressed: boolean;
};

export type ItemDetail = {
  item: CatalogItem;
  offers: PriceOffer[];
  history: HistoryPoint[];
  stats: ItemStats;
  marketsWithoutQuotes: Array<{ marketId: string; name: string; integrationStatus: string; requiresCredentials: boolean }>;
};

export type MarketDirectoryEntry = {
  id: string;
  name: string;
  shortName: string;
  region: string;
  website: string;
  integrationStatus: string;
  integrationType: string;
  requiresCredentials: boolean;
  credentialEnvVar: string | null;
  docsUrl: string | null;
  dataLicense: string | null;
  attribution: string | null;
  rateLimitNotes: string | null;
  priceSemantics: string | null;
  normalizationNotes: string | null;
  buyerFeePercent: number | null;
  sellerFeePercent: number | null;
  feeStatus: string;
  feeSourceUrl: string | null;
  feeCheckedAt: string | null;
  kycPolicy: string;
  /** Число актуальных котировок от источника. */
  quoteCount: number;
  lastQuoteAt: string | null;
  lastSuccessAt: string | null;
  health: {
    breakerState: string;
    consecutiveFailures: number;
    lastError: string | null;
  };
};

export type AnalyticsSummary = {
  /** Свежесть данных: время последнего снимка и его возраст. */
  freshness: {
    latestCapturedAt: string | null;
    ageHours: number | null;
    snapshotLabel: string | null;
    isStale: boolean;
  };
  coverage: {
    items: number;
    itemsWithPrice: number;
    quotes: number;
    historyItems: number;
    historyPoints: number;
    marketsWithQuotes: number;
    sourcesLive: number;
    sourcesPlanned: number;
  };
  /** Индекс: медиана цен корзины предметов с историей (база 100 на первой дате). */
  index: {
    current: number | null;
    change7d: number | null;
    change30d: number | null;
    changeAll: number | null;
    baseDate: string | null;
    constituents: number;
  };
  breadth: { advancing: number; declining: number; flat: number };
  topGainers: CatalogItem[];
  topLosers: CatalogItem[];
  mostLiquid: CatalogItem[];
  dataNote: string;
};

export type DataSourceStatus = {
  id: string;
  name: string;
  integrationStatus: string;
  requiresCredentials: boolean;
  credentialEnvVar: string | null;
  attribution: string | null;
  dataLicense: string | null;
  lastSuccessAt: string | null;
  lastQuoteAt: string | null;
  quoteCount: number;
  breakerState: string;
  consecutiveFailures: number;
  lastError: string | null;
  configured: boolean;
};

export type IngestRunView = {
  id: number;
  sourceId: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  requestsMade: number;
  itemsMatched: number;
  itemsUnmatched: number;
  quotesInserted: number;
  historyUpserted: number;
  message: string | null;
};
