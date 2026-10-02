"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS, useStoredList, useStoredString } from "@/lib/client-store";
import type {
  AnalyticsSummary,
  CatalogFacet,
  CatalogItem,
  CatalogResult,
  DataSourceStatus,
  HistoryPoint,
  IngestRunView,
  MarketDirectoryEntry,
} from "@/lib/analytics/types";
import { CatalogView, CalculatorView, DataView, MarketsView, OverviewView, WatchlistView, type CatalogFiltersState } from "@/components/views";
import { ItemDetailDrawer } from "@/components/item-detail";
import { Badge, FreshnessBadge } from "@/components/ui";
import { formatNumber } from "@/lib/format";

export type DashboardInitialData = {
  summary: AnalyticsSummary;
  catalog: CatalogResult;
  markets: MarketDirectoryEntry[];
  sources: DataSourceStatus[];
  runs: IngestRunView[];
  facets: Record<string, CatalogFacet[]>;
  bootstrap: {
    generatedAt: string;
    stats: Record<string, unknown>;
    sources: Array<{ id: string; repo: string; commit: string; license: string; attribution: string; usedFor: string }>;
  } | null;
  chart: { item: CatalogItem | null; history: HistoryPoint[]; options: CatalogItem[] };
};

type ViewKey = "overview" | "catalog" | "markets" | "watchlist" | "calculator" | "data";

const VIEW_LABELS: Record<ViewKey, string> = {
  overview: "Обзор рынка",
  catalog: "Каталог предметов",
  markets: "Площадки",
  watchlist: "Избранное",
  calculator: "Калькулятор",
  data: "Источники данных",
};

const VIEW_ICONS: Record<ViewKey, string> = {
  overview: "◧",
  catalog: "▤",
  markets: "◈",
  watchlist: "★",
  calculator: "⌗",
  data: "◍",
};

const DEFAULT_FILTERS: CatalogFiltersState = {
  q: "",
  category: "",
  rarity: "",
  wear: "",
  kind: "",
  stattrak: false,
  souvenir: false,
  minPrice: "",
  maxPrice: "",
  sort: "popularity",
};

export function Dashboard({ initial }: { initial: DashboardInitialData }) {
  const [view, setView] = useState<ViewKey>("overview");
  const [filters, setFilters] = useState<CatalogFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<CatalogResult>(initial.catalog);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [watchlist, setWatchlist] = useStoredList(STORAGE_KEYS.watchlist);
  const [watchlistItems, setWatchlistItems] = useState<CatalogItem[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [chartItem, setChartItem] = useState<CatalogItem | null>(initial.chart.item);
  const [chartHistory, setChartHistory] = useState<HistoryPoint[]>(initial.chart.history);
  const [summary, setSummary] = useState<AnalyticsSummary>(initial.summary);
  const [theme, setTheme] = useStoredString(STORAGE_KEYS.theme, "dark");
  const [searchDraft, setSearchDraft] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  }, [theme]);

  const loadCatalog = useCallback(
    async (nextFilters: CatalogFiltersState, nextPage: number) => {
      setLoadingCatalog(true);
      try {
        const params = new URLSearchParams();
        if (nextFilters.q) params.set("q", nextFilters.q);
        if (nextFilters.category) params.set("category", nextFilters.category);
        if (nextFilters.rarity) params.set("rarity", nextFilters.rarity);
        if (nextFilters.wear) params.set("wear", nextFilters.wear);
        if (nextFilters.kind) params.set("kind", nextFilters.kind);
        if (nextFilters.stattrak) params.set("stattrak", "1");
        if (nextFilters.souvenir) params.set("souvenir", "1");
        if (nextFilters.minPrice) params.set("minPrice", nextFilters.minPrice);
        if (nextFilters.maxPrice) params.set("maxPrice", nextFilters.maxPrice);
        params.set("sort", nextFilters.sort);
        params.set("page", String(nextPage));
        params.set("limit", "30");

        const response = await fetch(`/api/items?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setCatalog((await response.json()) as CatalogResult);
      } catch {
        // Каталог остаётся в предыдущем состоянии: интерфейс не должен «мигать» пустотой.
      } finally {
        setLoadingCatalog(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCatalog(filters, page);
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, page, loadCatalog]);

  const loadWatchlist = useCallback(async (slugs: string[]) => {
    if (slugs.length === 0) {
      setWatchlistItems([]);
      return;
    }
    try {
      const response = await fetch(`/api/items?slugs=${encodeURIComponent(slugs.join(","))}&limit=60`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as CatalogResult;
      setWatchlistItems(payload.items);
    } catch {
      setWatchlistItems([]);
    } finally {
      setLoadingWatchlist(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "watchlist") return;
    // Запрос откладывается на микрозадачу: эффект не пишет состояние синхронно.
    const timer = setTimeout(() => {
      void loadWatchlist(watchlist);
    }, 0);
    return () => clearTimeout(timer);
  }, [view, watchlist, loadWatchlist]);

  const selectChartItem = useCallback(async (slug: string) => {
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(slug)}?range=365d`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { item: CatalogItem; history: HistoryPoint[] };
      setChartItem(payload.item);
      setChartHistory(payload.history);
    } catch {
      // Тихо игнорируем: график остаётся с прежним предметом.
    }
  }, []);

  const toggleWatch = useCallback(
    (item: CatalogItem) => {
      setWatchlist((current) =>
        current.includes(item.slug) ? current.filter((slug) => slug !== item.slug) : [...current, item.slug].slice(-80),
      );
    },
    [setWatchlist],
  );

  const toggleWatchBySlug = useCallback(
    (slug: string) => {
      setWatchlist((current) =>
        current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug].slice(-80),
      );
    },
    [setWatchlist],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/analytics/summary", { cache: "no-store" });
      if (response.ok) setSummary((await response.json()) as AnalyticsSummary);
    } catch {
      /* обновление — не критичная операция */
    }
    await loadCatalog(filters, page);
  }, [filters, page, loadCatalog]);

  const movers = useMemo(
    () => ({
      gainers: summary.topGainers,
      losers: summary.topLosers,
      liquid: summary.mostLiquid,
    }),
    [summary],
  );

  const chartOptions = useMemo(() => initial.chart.options, [initial.chart.options]);

  const submitSearch = useCallback(() => {
    setFilters((current) => ({ ...current, q: searchDraft }));
    setPage(1);
    setView("catalog");
  }, [searchDraft]);

  const openItem = useCallback((item: CatalogItem) => setSelectedSlug(item.slug), []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CS2</span>
          <div>
            <div className="brand-title">CS2 Index</div>
            <div className="brand-sub">аналитика цен</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Рынок</span>
          {(["overview", "catalog", "markets"] as ViewKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={view === key ? "nav-button nav-active" : "nav-button"}
              onClick={() => setView(key)}
            >
              <span className="nav-icon">{VIEW_ICONS[key]}</span>
              <span>{VIEW_LABELS[key]}</span>
              {key === "catalog" ? <span className="nav-count">{formatNumber(summary.coverage.items)}</span> : null}
              {key === "markets" ? <span className="nav-count">{formatNumber(summary.coverage.marketsWithQuotes)}</span> : null}
            </button>
          ))}

          <span className="nav-section-label nav-tools-label">Инструменты</span>
          {(["watchlist", "calculator", "data"] as ViewKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={view === key ? "nav-button nav-active" : "nav-button"}
              onClick={() => setView(key)}
            >
              <span className="nav-icon">{VIEW_ICONS[key]}</span>
              <span>{VIEW_LABELS[key]}</span>
              {key === "watchlist" && watchlist.length > 0 ? <span className="nav-count">{watchlist.length}</span> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-status">
          <div className="sidebar-status-head">СОСТОЯНИЕ ДАННЫХ</div>
          <FreshnessBadge
            capturedAt={summary.freshness.latestCapturedAt}
            ageHours={summary.freshness.ageHours}
            isStale={summary.freshness.isStale}
          />
          <div className="sidebar-status-row">
            <span>Котировок</span>
            <strong>{formatNumber(summary.coverage.quotes)}</strong>
          </div>
          <div className="sidebar-status-row">
            <span>Точек истории</span>
            <strong>{formatNumber(summary.coverage.historyPoints)}</strong>
          </div>
          <div className="sidebar-status-row">
            <span>Источников</span>
            <strong>{formatNumber(summary.coverage.marketsWithQuotes)}</strong>
          </div>
        </div>
      </aside>

      <main className="main-frame">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>CS2 Index</span>
            <span className="breadcrumb-sep">/</span>
            <strong>{VIEW_LABELS[view]}</strong>
          </div>

          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <input
                type="search"
                value={searchDraft}
                placeholder="Поиск предмета, коллекции, оружия"
                onChange={(event) => setSearchDraft(event.target.value)}
                aria-label="Поиск"
              />
              <button type="submit">Найти</button>
            </form>
            <button type="button" className="icon-button" onClick={() => void refresh()} title="Обновить данные">
              ⟳
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Сменить тему"
            >
              {theme === "dark" ? "☾" : "☀"}
            </button>
          </div>
        </header>

        <div className="page-content">
          {view === "overview" ? (
            <OverviewView
              summary={summary}
              movers={movers}
              chartItem={chartItem}
              chartHistory={chartHistory}
              chartOptions={chartOptions}
              onSelectChartItem={(slug) => void selectChartItem(slug)}
              onOpenItem={openItem}
              onOpenView={(next) => setView(next)}
            />
          ) : null}

          {view === "catalog" ? (
            <CatalogView
              catalog={catalog}
              filters={filters}
              onChange={(patch) => {
                setFilters((current) => ({ ...current, ...patch }));
                setPage(1);
              }}
              onReset={() => {
                setFilters(DEFAULT_FILTERS);
                setPage(1);
              }}
              onPageChange={setPage}
              onOpenItem={openItem}
              facets={initial.facets}
              loading={loadingCatalog}
              watchlist={watchlist}
              onToggleWatch={toggleWatch}
            />
          ) : null}

          {view === "markets" ? <MarketsView markets={initial.markets} /> : null}

          {view === "watchlist" ? (
            <WatchlistView
              items={watchlistItems}
              loading={loadingWatchlist}
              onOpenItem={openItem}
              onRemove={(item) => toggleWatch(item)}
            />
          ) : null}

          {view === "calculator" ? (
            <CalculatorView items={initial.chart.options} markets={initial.markets} onOpenItem={openItem} />
          ) : null}

          {view === "data" ? (
            <DataView sources={initial.sources} runs={initial.runs} bootstrap={initial.bootstrap} summary={summary} />
          ) : null}
        </div>

        <footer className="page-footer">
          <div>
            <Badge tone="neutral">№ {formatNumber(summary.coverage.items)} предметов</Badge>{" "}
            <Badge tone="neutral">{formatNumber(summary.coverage.quotes)} котировок</Badge>
          </div>
          <p>
            Сервис не продаёт скины, не принимает средства и не связан с Valve Corporation. Цены — снимки публичных предложений площадок с
            указанием времени; это не поток реального времени и не инвестиционная рекомендация.
          </p>
        </footer>
      </main>

      {selectedSlug ? (
        <ItemDetailDrawer
          slug={selectedSlug}
          onClose={() => setSelectedSlug(null)}
          onToggleWatch={toggleWatchBySlug}
          isWatched={watchlist.includes(selectedSlug)}
        />
      ) : null}
    </div>
  );
}
