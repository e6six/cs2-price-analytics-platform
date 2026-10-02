"use client";

import { useMemo, useState } from "react";
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
import { IndexChart } from "@/components/index-chart";
import { PriceChart } from "@/components/price-chart";
import { Badge, Banner, ChangeValue, EmptyState, ItemArt, Panel, StatCard, StatusDot, Tabs } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  categoryLabel,
  feeStatusLabel,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatUsd,
  integrationStatusLabel,
  kindLabel,
  rarityLabel,
  shortMarketName,
  wearLabel,
} from "@/lib/format";

type OpenItem = (item: CatalogItem) => void;

/* ------------------------------------------------------------------ Обзор */

export function OverviewView({
  summary,
  movers,
  chartItem,
  chartHistory,
  chartOptions,
  onSelectChartItem,
  onOpenItem,
  onOpenView,
}: {
  summary: AnalyticsSummary;
  movers: { gainers: CatalogItem[]; losers: CatalogItem[]; liquid: CatalogItem[] };
  chartItem: CatalogItem | null;
  chartHistory: HistoryPoint[];
  chartOptions: CatalogItem[];
  onSelectChartItem: (slug: string) => void;
  onOpenItem: OpenItem;
  onOpenView: (view: "catalog" | "markets" | "data") => void;
}) {
  const breadthTotal = summary.breadth.advancing + summary.breadth.declining + summary.breadth.flat;
  const advanceShare = breadthTotal > 0 ? (summary.breadth.advancing / breadthTotal) * 100 : 0;

  return (
    <div className="view-stack">
      <Banner tone={summary.freshness.isStale ? "warning" : "positive"} title="Происхождение данных">
        Цены собраны из публичных источников и хранятся вместе со временем снимка. Последний снимок:{" "}
        <strong>{formatDate(summary.freshness.latestCapturedAt)}</strong> ({formatNumber(summary.coverage.quotes)} котировок).{" "}
        {summary.freshness.isStale
          ? "Данные устарели: запустите синхронизацию, чтобы обновить цены."
          : "Данные актуальны по политике свежести (14 дней)."}{" "}
        <button type="button" className="link-button" onClick={() => onOpenView("data")}>
          Источники и лицензии <Icon name="chevron-right" />
        </button>
      </Banner>

      <div className="stats-grid">
        <StatCard
          icon="activity"
          label="Индекс цен"
          value={summary.index.current === null ? "—" : summary.index.current.toFixed(2)}
          change={summary.index.change7d}
          hint={`база 100 · ${formatNumber(summary.index.constituents)} предметов с ${formatDate(summary.index.baseDate)} · за всё время ${formatPercent(summary.index.changeAll)}`}
        />
        <StatCard
          icon="catalog"
          label="Предметов с ценой"
          value={formatNumber(summary.coverage.itemsWithPrice)}
          hint={`из ${formatNumber(summary.coverage.items)} в каталоге`}
          tone="blue"
        />
        <StatCard
          icon="trend-up"
          label="Широта рынка"
          value={`${formatNumber(summary.breadth.advancing)} / ${formatNumber(summary.breadth.declining)}`}
          hint="растут / падают (7 дней)"
          tone="violet"
        />
        <StatCard
          icon="markets"
          label="Площадок с котировками"
          value={formatNumber(summary.coverage.marketsWithQuotes)}
          hint={`${formatNumber(summary.coverage.sourcesLive)} подключено · ${formatNumber(summary.coverage.sourcesPlanned)} в плане`}
          tone="amber"
        />
      </div>

      <Panel
        title="Индекс рынка"
        subtitle="Медиана отношений цен корзины предметов к базовой дате; устойчив к выбросам отдельных рядов"
      >
        <IndexChart series={summary.index.series} />
      </Panel>

      <div className="overview-grid">
        <Panel
          title="Динамика цены"
          subtitle="Реальные наблюдения источника: недельные срезы датасета и ежедневные снимки синхронизации"
          actions={
            <select
              className="select-filter"
              value={chartItem?.slug ?? ""}
              onChange={(event) => onSelectChartItem(event.target.value)}
              aria-label="Выбор предмета для графика"
            >
              {chartOptions.map((option) => (
                <option key={option.id} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
          }
        >
          <PriceChart history={chartHistory} />
          {chartItem ? (
            <div className="chart-item-row">
              <ItemArt imageUrl={chartItem.imageUrl} name={chartItem.name} rarityColor={chartItem.rarityColor} />
              <div className="chart-item-copy">
                <button type="button" className="item-name-button" onClick={() => onOpenItem(chartItem)}>
                  {chartItem.name}
                </button>
                <div className="chart-item-meta">
                  {categoryLabel(chartItem.category)} · {rarityLabel(chartItem.rarity)} · лучшая цена {formatUsd(chartItem.bestPriceUsd)} на{" "}
                  {shortMarketName(chartItem.bestMarketId ?? "")}
                </div>
              </div>
              <ChangeValue value={chartItem.change7d} />
            </div>
          ) : null}
        </Panel>

        <div className="side-stack">
          <Panel title="Широта движения" subtitle="Доля предметов с ростом цены за неделю">
            <div className="breadth-bar">
              <div className="breadth-bar-up" style={{ width: `${advanceShare}%` }} />
            </div>
            <div className="breadth-legend">
              <span>
                <StatusDot tone="positive" /> растут: {formatNumber(summary.breadth.advancing)}
              </span>
              <span>
                <StatusDot tone="negative" /> падают: {formatNumber(summary.breadth.declining)}
              </span>
              <span>
                <StatusDot tone="neutral" /> без изменений: {formatNumber(summary.breadth.flat)}
              </span>
            </div>
          </Panel>

          <Panel
            title="Лидеры роста"
            subtitle="Изменение за 7 дней по истории"
            actions={
              <button type="button" className="link-button" onClick={() => onOpenView("catalog")}>
                Каталог <Icon name="chevron-right" />
              </button>
            }
          >
            <MoverList items={movers.gainers} onOpenItem={onOpenItem} />
          </Panel>

          <Panel title="Лидеры падения">
            <MoverList items={movers.losers} onOpenItem={onOpenItem} />
          </Panel>
        </div>
      </div>

      <Panel
        title="Самые наблюдаемые предметы"
        subtitle="Больше всего площадок с котировками и полная история"
        actions={
          <button type="button" className="link-button" onClick={() => onOpenView("markets")}>
            Площадки <Icon name="chevron-right" />
          </button>
        }
      >
        <div className="table-scroll">
          <table className="item-table">
            <thead>
              <tr>
                <th>Предмет</th>
                <th>Лучшая цена</th>
                <th>Площадок</th>
                <th>Снимок</th>
                <th>7 дней</th>
              </tr>
            </thead>
            <tbody>
              {movers.liquid.map((item) => (
                <tr key={item.id} onClick={() => onOpenItem(item)} className="row-clickable">
                  <td>
                    <div className="item-cell">
                      <ItemArt imageUrl={item.imageUrl} name={item.name} rarityColor={item.rarityColor} size={34} />
                      <div>
                        <div className="item-name">{item.name}</div>
                        <div className="item-sub">
                          {rarityLabel(item.rarity)} · {wearLabel(item.wear)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{formatUsd(item.bestPriceUsd)}</td>
                  <td className="num">{formatNumber(item.marketCount)}</td>
                  <td>{formatDate(item.lastCapturedAt)}</td>
                  <td>
                    <ChangeValue value={item.change7d} suppressed={item.changeSuppressed} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function MoverList({ items, onOpenItem }: { items: CatalogItem[]; onOpenItem: OpenItem }) {
  if (items.length === 0) return <EmptyState title="Нет данных за период" hint="История пополнится после следующих снимков" />;
  return (
    <ul className="movers-list">
      {items.map((item, index) => (
        <li key={item.id} className="mover-row" onClick={() => onOpenItem(item)}>
          <span className="mover-rank">{index + 1}</span>
          <ItemArt imageUrl={item.imageUrl} name={item.name} rarityColor={item.rarityColor} size={30} />
          <span className="mover-name" title={item.name}>
            {item.name}
          </span>
          <span className="mover-price">{formatUsd(item.bestPriceUsd)}</span>
          <ChangeValue value={item.change7d} suppressed={item.changeSuppressed} />
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- Каталог */

export type CatalogFiltersState = {
  q: string;
  category: string;
  rarity: string;
  wear: string;
  kind: string;
  stattrak: boolean;
  souvenir: boolean;
  minPrice: string;
  maxPrice: string;
  sort: string;
};

export function CatalogView({
  catalog,
  filters,
  onChange,
  onReset,
  onPageChange,
  onOpenItem,
  facets,
  loading,
  watchlist,
  onToggleWatch,
}: {
  catalog: CatalogResult;
  filters: CatalogFiltersState;
  onChange: (patch: Partial<CatalogFiltersState>) => void;
  onReset: () => void;
  onPageChange: (page: number) => void;
  onOpenItem: OpenItem;
  facets: Record<string, CatalogFacet[]>;
  loading: boolean;
  watchlist: string[];
  onToggleWatch: (item: CatalogItem) => void;
}) {
  const pages = Math.max(1, Math.ceil(catalog.total / catalog.limit));

  return (
    <div className="view-stack">
      <Panel
        title="Фильтры"
        subtitle={`Найдено ${formatNumber(catalog.total)} предметов`}
        actions={
          <button type="button" className="link-button" onClick={onReset}>
            Сбросить
          </button>
        }
      >
        <div className="filters-grid">
          <label className="field">
            <span>Поиск</span>
            <input
              type="search"
              value={filters.q}
              placeholder="AK-47, Redline, Phoenix"
              onChange={(event) => onChange({ q: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Категория</span>
            <select value={filters.category} onChange={(event) => onChange({ category: event.target.value })}>
              <option value="">Все категории</option>
              {facets.categories?.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {categoryLabel(facet.value)} ({facet.count})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Редкость</span>
            <select value={filters.rarity} onChange={(event) => onChange({ rarity: event.target.value })}>
              <option value="">Все редкости</option>
              {facets.rarities?.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {rarityLabel(facet.value)} ({facet.count})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Износ</span>
            <select value={filters.wear} onChange={(event) => onChange({ wear: event.target.value })}>
              <option value="">Любой износ</option>
              {facets.wears?.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {wearLabel(facet.value)} ({facet.count})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Тип</span>
            <select value={filters.kind} onChange={(event) => onChange({ kind: event.target.value })}>
              <option value="">Все типы</option>
              {facets.kinds?.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {kindLabel(facet.value)} ({facet.count})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Цена от, $</span>
            <input
              type="number"
              min={0}
              value={filters.minPrice}
              placeholder="0"
              onChange={(event) => onChange({ minPrice: event.target.value })}
            />
          </label>
          <label className="field">
            <span>до, $</span>
            <input
              type="number"
              min={0}
              value={filters.maxPrice}
              placeholder="∞"
              onChange={(event) => onChange({ maxPrice: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Сортировка</span>
            <select value={filters.sort} onChange={(event) => onChange({ sort: event.target.value })}>
              <option value="popularity">По наблюдаемости</option>
              <option value="price-asc">Цена ↑</option>
              <option value="price-desc">Цена ↓</option>
              <option value="change-desc">Рост за 7 дней</option>
              <option value="change-asc">Падение за 7 дней</option>
              <option value="markets-desc">Число площадок</option>
              <option value="updated-desc">Свежесть снимка</option>
              <option value="name">Название</option>
            </select>
          </label>
          <div className="field field-toggles">
            <span>Метки</span>
            <div className="toggle-row">
              <button
                type="button"
                className={filters.stattrak ? "toggle toggle-on" : "toggle"}
                onClick={() => onChange({ stattrak: !filters.stattrak })}
              >
                StatTrak™
              </button>
              <button
                type="button"
                className={filters.souvenir ? "toggle toggle-on" : "toggle"}
                onClick={() => onChange({ souvenir: !filters.souvenir })}
              >
                Souvenir
              </button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="table-scroll">
          <table className="item-table">
            <thead>
              <tr>
                <th>Предмет</th>
                <th>Лучшая цена</th>
                <th>Площадка</th>
                <th>Средняя</th>
                <th>7 дней</th>
                <th>30 дней</th>
                <th>Снимок</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {catalog.items.map((item) => (
                <tr key={item.id} className="row-clickable" onClick={() => onOpenItem(item)}>
                  <td>
                    <div className="item-cell">
                      <ItemArt imageUrl={item.imageUrl} name={item.name} rarityColor={item.rarityColor} />
                      <div>
                        <div className="item-name">{item.name}</div>
                        <div className="item-sub">
                          {rarityLabel(item.rarity)} · {wearLabel(item.wear)}
                          {item.stattrak ? " · StatTrak™" : ""}
                          {item.souvenir ? " · Souvenir" : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{formatUsd(item.bestPriceUsd)}</td>
                  <td>{item.bestMarketId ? shortMarketName(item.bestMarketId) : "—"}</td>
                  <td className="num muted">{formatUsd(item.averagePriceUsd)}</td>
                  <td>
                    <ChangeValue value={item.change7d} suppressed={item.changeSuppressed} />
                  </td>
                  <td>
                    <ChangeValue value={item.change30d} suppressed={item.changeSuppressed} />
                  </td>
                  <td className="muted">{formatDate(item.lastCapturedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={watchlist.includes(item.slug) ? "watch-button watch-on" : "watch-button"}
                      title={watchlist.includes(item.slug) ? "Убрать из избранного" : "Добавить в избранное"}
                      aria-label="Избранное"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleWatch(item);
                      }}
                    >
                      <Icon name="star" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {catalog.items.length === 0 && !loading ? (
          <EmptyState title="Ничего не найдено" hint="Измените фильтры или сбросьте их" />
        ) : null}

        <div className="table-footer">
          <span className="muted">
            Страница {catalog.page} из {pages} · записей {formatNumber(catalog.total)}
          </span>
          <div className="pagination">
            <button type="button" disabled={catalog.page <= 1} onClick={() => onPageChange(catalog.page - 1)}>
              Назад
            </button>
            <button type="button" disabled={catalog.page >= pages} onClick={() => onPageChange(catalog.page + 1)}>
              Вперёд
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* --------------------------------------------------------------- Площадки */

export function MarketsView({ markets }: { markets: MarketDirectoryEntry[] }) {
  return (
    <div className="view-stack">
      <Banner tone="neutral" title="Как читать справочник">
        Статус интеграции показывает, откуда приходят данные. Комиссии хранятся вместе с источником и датой проверки: значения со статусом
        «источники противоречат» или «не проверено» нельзя использовать как тариф площадки.
      </Banner>

      <div className="market-grid">
        {markets.map((market) => (
          <article key={market.id} className="market-card">
            <header className="market-card-head">
              <div>
                <h3>{market.name}</h3>
                <div className="market-card-sub">
                  {market.region} · {market.website}
                </div>
              </div>
              <Badge tone={market.integrationStatus === "live" ? "positive" : market.integrationStatus === "dataset" ? "accent" : "neutral"}>
                {integrationStatusLabel(market.integrationStatus)}
              </Badge>
            </header>

            <div className="market-metrics">
              <div>
                <span className="metric-label">Котировок</span>
                <span className="metric-value">{formatNumber(market.quoteCount)}</span>
              </div>
              <div>
                <span className="metric-label">Последний снимок</span>
                <span className="metric-value">{market.lastQuoteAt ? formatDateTime(market.lastQuoteAt) : "—"}</span>
              </div>
              <div>
                <span className="metric-label">Комиссия продавца</span>
                <span className="metric-value">
                  {market.sellerFeePercent === null ? "—" : `${market.sellerFeePercent}%`}{" "}
                  <span className="fee-status">{feeStatusLabel(market.feeStatus)}</span>
                </span>
              </div>
              <div>
                <span className="metric-label">Комиссия покупателя</span>
                <span className="metric-value">
                  {market.buyerFeePercent === null ? "—" : `${market.buyerFeePercent}%`}
                </span>
              </div>
            </div>

            {market.priceSemantics ? <p className="market-note">{market.priceSemantics}</p> : null}
            {market.normalizationNotes ? <p className="market-note muted">{market.normalizationNotes}</p> : null}
            {market.rateLimitNotes ? <p className="market-note muted">{market.rateLimitNotes}</p> : null}

            <footer className="market-card-foot">
              <div className="market-foot-row">
                <StatusDot tone={market.health.breakerState === "open" ? "negative" : market.lastSuccessAt ? "positive" : "neutral"} />
                <span>
                  {market.lastSuccessAt
                    ? `Сбор: ${formatDateTime(market.lastSuccessAt)}`
                    : market.requiresCredentials
                      ? `Требуются учётные данные (${market.credentialEnvVar ?? "секрет"})`
                      : "Сбор ещё не выполнялся"}
                </span>
              </div>
              <div className="market-links">
                {market.docsUrl ? (
                  <a href={market.docsUrl} target="_blank" rel="noreferrer noopener">
                    Документация
                  </a>
                ) : null}
                {market.feeSourceUrl ? (
                  <a href={market.feeSourceUrl} target="_blank" rel="noreferrer noopener">
                    Источник комиссии
                  </a>
                ) : null}
                <a href={`https://${market.website}`} target="_blank" rel="noreferrer noopener">
                  Площадка
                </a>
              </div>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Данные */

export function DataView({
  sources,
  runs,
  bootstrap,
  summary,
}: {
  sources: DataSourceStatus[];
  runs: IngestRunView[];
  bootstrap: {
    generatedAt: string;
    stats: Record<string, unknown>;
    sources: Array<{ id: string; repo: string; commit: string; license: string; attribution: string; usedFor: string }>;
  } | null;
  summary: AnalyticsSummary;
}) {
  const [tab, setTab] = useState<"sources" | "runs" | "provenance">("sources");

  return (
    <div className="view-stack">
      <div className="stats-grid">
        <StatCard icon="clock" label="Возраст данных" value={summary.freshness.ageHours === null ? "—" : `${Math.round(summary.freshness.ageHours / 24)} дн`} hint={formatDate(summary.freshness.latestCapturedAt)} tone="amber" />
        <StatCard icon="coins" label="Котировок в базе" value={formatNumber(summary.coverage.quotes)} hint={`${formatNumber(summary.coverage.itemsWithPrice)} предметов`} />
        <StatCard icon="layers" label="Точек истории" value={formatNumber(summary.coverage.historyPoints)} hint={`${formatNumber(summary.coverage.historyItems)} предметов`} tone="blue" />
        <StatCard icon="data" label="Источников с данными" value={formatNumber(summary.coverage.marketsWithQuotes)} hint={`${formatNumber(summary.coverage.sourcesLive)} подключено`} tone="violet" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: "sources", label: "Источники" },
          { id: "runs", label: "Журнал сбора" },
          { id: "provenance", label: "Происхождение набора" },
        ]}
      />

      {tab === "sources" ? (
        <Panel title="Источники и условия" subtitle="Лицензии, атрибуция и состояние сбора">
          <div className="table-scroll">
            <table className="item-table">
              <thead>
                <tr>
                  <th>Источник</th>
                  <th>Статус</th>
                  <th>Котировок</th>
                  <th>Последний сбор</th>
                  <th>Лицензия</th>
                  <th>Состояние</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <div className="item-name">{source.name}</div>
                      <div className="item-sub">{source.attribution ?? source.id}</div>
                    </td>
                    <td>
                      <Badge tone={source.integrationStatus === "live" ? "positive" : source.integrationStatus === "dataset" ? "accent" : "neutral"}>
                        {integrationStatusLabel(source.integrationStatus)}
                      </Badge>
                    </td>
                    <td className="num">{formatNumber(source.quoteCount)}</td>
                    <td>{source.lastSuccessAt ? formatDateTime(source.lastSuccessAt) : "—"}</td>
                    <td className="muted small">{source.dataLicense ?? "—"}</td>
                    <td>
                      {source.breakerState === "open" ? (
                        <Badge tone="negative">Разомкнут · ошибок {source.consecutiveFailures}</Badge>
                      ) : source.configured ? (
                        <Badge tone="positive">Готов</Badge>
                      ) : (
                        <Badge tone="warning">Требует настройки</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sync-hint">
            <div className="sync-hint-title">Запуск синхронизации</div>
            <pre>{`# разово из CLI\nnpm run sync -- --source=skinport,csfloat\n\n# планировщик вызывает HTTP-эндпоинт\ncurl -X POST -H "Authorization: Bearer $SYNC_TOKEN" \\\n  "https://<host>/api/sync?sources=steam-community&limit=250"`}</pre>
            <p className="muted">
              Провайдеры без учётных данных работают «из коробки»; для площадок, требующих ключ или сессию, задайте переменные окружения из
              таблицы выше. Падение одного источника не останавливает остальные.
            </p>
          </div>
        </Panel>
      ) : null}

      {tab === "runs" ? (
        <Panel title="Журнал сбора" subtitle="Каждый прогон: сколько запросов, котировок и ошибок">
          <div className="table-scroll">
            <table className="item-table">
              <thead>
                <tr>
                  <th>Источник</th>
                  <th>Статус</th>
                  <th>Начат</th>
                  <th>Длительность</th>
                  <th>Запросов</th>
                  <th>Котировок</th>
                  <th>Сообщение</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{shortMarketName(run.sourceId)}</td>
                    <td>
                      <Badge tone={run.status === "success" ? "positive" : run.status === "partial" ? "warning" : run.status === "failed" ? "negative" : "neutral"}>
                        {run.status}
                      </Badge>
                    </td>
                    <td>{formatDateTime(run.startedAt)}</td>
                    <td>{run.durationMs === null ? "—" : `${(run.durationMs / 1000).toFixed(1)} с`}</td>
                    <td className="num">{formatNumber(run.requestsMade)}</td>
                    <td className="num">{formatNumber(run.quotesInserted)}</td>
                    <td className="muted small">{run.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {runs.length === 0 ? <EmptyState title="Прогонов ещё не было" hint="Запустите синхронизацию из CLI или через API" /> : null}
        </Panel>
      ) : null}

      {tab === "provenance" ? (
        <Panel title="Набор данных при развёртывании" subtitle="Что загружено в базу и на каких условиях">
          {bootstrap ? (
            <div className="provenance">
              <div className="provenance-row">
                <span>Собран</span>
                <strong>{formatDateTime(bootstrap.generatedAt)}</strong>
              </div>
              <div className="provenance-row">
                <span>Предметов в каталоге</span>
                <strong>{formatNumber(Number(bootstrap.stats.catalogItems ?? 0))}</strong>
              </div>
              <div className="provenance-row">
                <span>Котировок</span>
                <strong>{formatNumber(Number(bootstrap.stats.quoteItems ?? 0))}</strong>
              </div>
              <div className="provenance-row">
                <span>История</span>
                <strong>
                  {String(bootstrap.stats.historyFrom ?? "—")} — {String(bootstrap.stats.historyTo ?? "—")} ({formatNumber(Number(bootstrap.stats.historyItems ?? 0))}{" "}
                  предметов)
                </strong>
              </div>
              <div className="provenance-list">
                {bootstrap.sources.map((source) => (
                  <div key={source.id} className="provenance-source">
                    <div className="provenance-source-head">
                      <strong>{source.repo}</strong>
                      <Badge tone="accent">{source.license}</Badge>
                    </div>
                    <div className="muted small">
                      commit {source.commit.slice(0, 10)} · {source.usedFor}
                    </div>
                    <div className="muted small">Атрибуция: {source.attribution}</div>
                  </div>
                ))}
              </div>
              <p className="muted small">
                Названия предметов, изображения и игровые данные принадлежат Valve Corporation. Аналитический сервис не связан с Valve и не
                продаёт предметы.
              </p>
            </div>
          ) : (
            <EmptyState title="Набор не описан" hint="manifest.json не найден в каталоге data/bootstrap" />
          )}
        </Panel>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Избранное */

export function WatchlistView({
  items,
  onOpenItem,
  onRemove,
  loading,
}: {
  items: CatalogItem[];
  onOpenItem: OpenItem;
  onRemove: (item: CatalogItem) => void;
  loading: boolean;
}) {
  if (loading) return <Panel title="Избранное">{<div className="skeleton"><div className="skeleton-row" /><div className="skeleton-row" /></div>}</Panel>;
  if (items.length === 0) {
    return (
      <Panel title="Избранное" subtitle="Список хранится в браузере и не отправляется на сервер">
        <EmptyState title="Список пуст" hint="Отмечайте предметы звёздочкой в каталоге" />
      </Panel>
    );
  }

  return (
    <Panel title="Избранное" subtitle={`${items.length} предметов · котировки обновляются вместе с каталогом`}>
      <div className="table-scroll">
        <table className="item-table">
          <thead>
            <tr>
              <th>Предмет</th>
              <th>Лучшая цена</th>
              <th>Площадка</th>
              <th>7 дней</th>
              <th>Снимок</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="row-clickable" onClick={() => onOpenItem(item)}>
                <td>
                  <div className="item-cell">
                    <ItemArt imageUrl={item.imageUrl} name={item.name} rarityColor={item.rarityColor} />
                    <div>
                      <div className="item-name">{item.name}</div>
                      <div className="item-sub">{rarityLabel(item.rarity)}</div>
                    </div>
                  </div>
                </td>
                <td className="num">{formatUsd(item.bestPriceUsd)}</td>
                <td>{item.bestMarketId ? shortMarketName(item.bestMarketId) : "—"}</td>
                <td>
                  <ChangeValue value={item.change7d} suppressed={item.changeSuppressed} />
                </td>
                <td className="muted">{formatDate(item.lastCapturedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="watch-button watch-on"
                    title="Убрать из избранного"
                    aria-label="Убрать из избранного"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(item);
                    }}
                  >
                    <Icon name="star" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------- Калькулятор */

export function CalculatorView({
  items,
  markets,
  onOpenItem,
}: {
  items: CatalogItem[];
  markets: MarketDirectoryEntry[];
  onOpenItem: OpenItem;
}) {
  const [slug, setSlug] = useState(items[0]?.slug ?? "");
  const [fee, setFee] = useState(12);
  const [quantity, setQuantity] = useState(1);

  const item = useMemo(() => items.find((entry) => entry.slug === slug) ?? items[0] ?? null, [items, slug]);
  const buyPrice = item?.bestPriceUsd ?? 0;
  const worst = item?.averagePriceUsd ?? null;
  const payout = buyPrice * (1 - fee / 100) * quantity;
  const feeAbs = buyPrice * (fee / 100) * quantity;
  const spreadVsAverage = item && item.bestPriceUsd && item.averagePriceUsd ? ((item.averagePriceUsd - item.bestPriceUsd) / item.bestPriceUsd) * 100 : null;

  const feeOptions = markets
    .filter((market) => market.sellerFeePercent !== null && market.feeStatus !== "conflicting")
    .map((market) => ({
      market,
      fee: market.sellerFeePercent as number,
    }));

  if (!item) {
    return (
      <Panel title="Калькулятор">
        <EmptyState title="Нет предметов для расчёта" hint="Выберите предмет в каталоге" />
      </Panel>
    );
  }

  return (
    <div className="calculator-layout">
      <Panel title="Калькулятор выплаты" subtitle="Расчёт по реальной котировке и явно заданной комиссии">
        <label className="field">
          <span>Предмет</span>
          <select value={item.slug} onChange={(event) => setSlug(event.target.value)}>
            {items.map((entry) => (
              <option key={entry.id} value={entry.slug}>
                {entry.name} — {formatUsd(entry.bestPriceUsd)}
              </option>
            ))}
          </select>
        </label>

        <div className="calc-row">
          <div>
            <span className="metric-label">Цена покупателя (лучшая котировка)</span>
            <div className="calc-price">{formatUsd(buyPrice)}</div>
          </div>
          <div>
            <span className="metric-label">Площадка</span>
            <div className="calc-price">{item.bestMarketId ? shortMarketName(item.bestMarketId) : "—"}</div>
          </div>
          <div>
            <span className="metric-label">Снимок</span>
            <div className="calc-price small">{formatDate(item.lastCapturedAt)}</div>
          </div>
        </div>

        <label className="field">
          <span>Комиссия продавца: {fee}%</span>
          <input type="range" min={0} max={30} step={0.5} value={fee} onChange={(event) => setFee(Number(event.target.value))} />
        </label>

        <label className="field">
          <span>Количество</span>
          <input type="number" min={1} max={1000} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} />
        </label>

        <div className="calc-result">
          <div>
            <span className="metric-label">Выплата продавцу</span>
            <strong>{formatUsd(payout)}</strong>
          </div>
          <div>
            <span className="metric-label">Комиссия</span>
            <span>{formatUsd(feeAbs)}</span>
          </div>
          <div>
            <span className="metric-label">Средняя цена по площадкам</span>
            <span>{formatUsd(worst)}</span>
          </div>
          <div>
            <span className="metric-label">Отклонение от средней</span>
            <ChangeValue value={spreadVsAverage} />
          </div>
        </div>

        <p className="legal-note">
          Комиссия задаётся вручную: тарифы площадок меняются и в базе помечены статусом проверки. Значения из справочника приведены для
          справки, расчёт — учебный и не является финансовым советом.
        </p>
      </Panel>

      <Panel title="Ориентиры по тарифам" subtitle="Только источники с непротиворечивыми данными">
        <ul className="fee-list">
          {feeOptions.map(({ market, fee: value }) => (
            <li key={market.id} className="fee-option">
              <button type="button" onClick={() => setFee(value)}>
                {market.name}: {value}%
              </button>
              <span className="muted small">{feeStatusLabel(market.feeStatus)}</span>
            </li>
          ))}
          {feeOptions.length === 0 ? <li className="muted">Нет подтверждённых тарифов — задайте комиссию вручную.</li> : null}
        </ul>

        <div className="calc-quotes">
          <div className="metric-label">Котировки по площадкам</div>
          <div className="muted small">
            {item.marketCount > 1
              ? `Спред между площадками: ${formatPercent(spreadVsAverage)}`
              : "По предмету доступна одна площадка — спред не рассчитывается"}
          </div>
        </div>

        <button type="button" className="secondary-button" onClick={() => onOpenItem(item)}>
          Открыть карточку предмета
        </button>
      </Panel>
    </div>
  );
}
