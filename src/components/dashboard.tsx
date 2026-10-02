"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  DashboardSnapshot,
  HistoryPoint,
  ItemDetail,
  ItemSummary,
  MarketSummary,
  PriceOffer,
} from "@/lib/types";

type ViewKey = "overview" | "catalog" | "markets" | "watchlist" | "calculator";
type ChartRange = "7d" | "30d" | "90d" | "1y";
type IconName =
  | "overview"
  | "catalog"
  | "markets"
  | "watchlist"
  | "calculator"
  | "search"
  | "chevron"
  | "arrowUp"
  | "arrowDown"
  | "trend"
  | "refresh"
  | "sun"
  | "moon"
  | "filter"
  | "close"
  | "shield"
  | "clock"
  | "check"
  | "external"
  | "spark"
  | "grid"
  | "sliders"
  | "plus"
  | "minus";

const CATEGORIES = ["Все", "Винтовки", "Ножи", "Пистолеты", "Перчатки"];
const RARITIES = ["Все редкости", "Тайное", "Засекреченное", "Запрещённое", "Контрабандное"];
const WEARS = [
  "Все состояния",
  "Прямо с завода",
  "Немного поношенное",
  "После полевых испытаний",
  "Поношенное",
  "Закалённое в боях",
];
const RANGE_LABELS: Record<ChartRange, string> = {
  "7d": "7Д",
  "30d": "30Д",
  "90d": "90Д",
  "1y": "1Г",
};
const VIEW_LABELS: Record<ViewKey, string> = {
  overview: "Обзор рынка",
  catalog: "Каталог предметов",
  markets: "Площадки",
  watchlist: "Избранное",
  calculator: "Калькулятор",
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  let drawing: ReactNode;

  switch (name) {
    case "overview":
      drawing = <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" {...common} /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" {...common} /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" {...common} /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" {...common} /></>;
      break;
    case "catalog":
      drawing = <><path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" {...common} /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" {...common} /></>;
      break;
    case "markets":
      drawing = <><path d="M4 10h16v10H4zM3 10l2-6h14l2 6" {...common} /><path d="M8 20v-6h8v6M3 10c0 1.1.9 2 2 2s2-.9 2-2m0 0c0 1.1.9 2 2 2s2-.9 2-2m0 0c0 1.1.9 2 2 2s2-.9 2-2m0 0c0 1.1.9 2 2 2s2-.9 2-2" {...common} /></>;
      break;
    case "watchlist":
      drawing = <><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z" {...common} /><path d="M9 7h6" {...common} /></>;
      break;
    case "calculator":
      drawing = <><rect x="5" y="3" width="14" height="18" rx="2" {...common} /><path d="M8 7h8v3H8zM8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01M16 17h.01" {...common} /></>;
      break;
    case "search":
      drawing = <><circle cx="10.8" cy="10.8" r="6.8" {...common} /><path d="m16 16 4.5 4.5" {...common} /></>;
      break;
    case "chevron":
      drawing = <path d="m9 18 6-6-6-6" {...common} />;
      break;
    case "arrowUp":
      drawing = <><path d="M12 19V5M6 11l6-6 6 6" {...common} /></>;
      break;
    case "arrowDown":
      drawing = <><path d="M12 5v14M18 13l-6 6-6-6" {...common} /></>;
      break;
    case "trend":
      drawing = <><path d="M3 17.5 8.5 12l3.5 3 8-9" {...common} /><path d="M15 6h5v5" {...common} /></>;
      break;
    case "refresh":
      drawing = <><path d="M20 7v5h-5M4 17v-5h5" {...common} /><path d="M5.7 9A7 7 0 0 1 18 6.2L20 12M4 12l2 5.8A7 7 0 0 0 18.3 15" {...common} /></>;
      break;
    case "sun":
      drawing = <><circle cx="12" cy="12" r="4" {...common} /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" {...common} /></>;
      break;
    case "moon":
      drawing = <path d="M20.7 14.3A8.8 8.8 0 0 1 9.7 3.3 8.8 8.8 0 1 0 20.7 14.3Z" {...common} />;
      break;
    case "filter":
      drawing = <><path d="M4 6h16M7 12h10m-7 6h4" {...common} /><circle cx="8" cy="6" r="1.4" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" /></>;
      break;
    case "close":
      drawing = <><path d="m6 6 12 12M18 6 6 18" {...common} /></>;
      break;
    case "shield":
      drawing = <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" {...common} /><path d="m9 12 2 2 4-4" {...common} /></>;
      break;
    case "clock":
      drawing = <><circle cx="12" cy="12" r="9" {...common} /><path d="M12 7v5l3 2" {...common} /></>;
      break;
    case "check":
      drawing = <path d="m5 12 4 4L19 6" {...common} />;
      break;
    case "external":
      drawing = <><path d="M14 4h6v6m0-6-9 9" {...common} /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" {...common} /></>;
      break;
    case "spark":
      drawing = <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" {...common} /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" {...common} /></>;
      break;
    case "grid":
      drawing = <><rect x="3.5" y="3.5" width="17" height="17" rx="2" {...common} /><path d="M3.5 9h17M9 3.5v17m6-11.5v11.5" {...common} /></>;
      break;
    case "sliders":
      drawing = <><path d="M4 6h16M4 12h16M4 18h16" {...common} /><circle cx="9" cy="6" r="2" fill="var(--surface-2)" stroke="currentColor" strokeWidth="1.8" /><circle cx="15" cy="12" r="2" fill="var(--surface-2)" stroke="currentColor" strokeWidth="1.8" /><circle cx="7" cy="18" r="2" fill="var(--surface-2)" stroke="currentColor" strokeWidth="1.8" /></>;
      break;
    case "plus":
      drawing = <path d="M12 5v14m-7-7h14" {...common} />;
      break;
    case "minus":
      drawing = <path d="M5 12h14" {...common} />;
      break;
  }

  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">{drawing}</svg>;
}

function money(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}

function moneyCompact(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `$${value.toFixed(value >= 100 ? 0 : 1)}`;
}

function dateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat("ru-RU", options ?? { day: "numeric", month: "short" }).format(date);
}

function timeLabel(value: string | null) {
  if (!value) return "Время неизвестно";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function rangePoints(points: HistoryPoint[], range: ChartRange) {
  const numberOfDays = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  return points.slice(-numberOfDays);
}

function PriceChart({
  points,
  range,
  id,
  className = "",
}: {
  points: HistoryPoint[];
  range: ChartRange;
  id: string;
  className?: string;
}) {
  const filtered = rangePoints(points, range);
  if (filtered.length < 2) {
    return <div className={`chart-empty ${className}`}>Для выбранного периода пока нет истории.</div>;
  }

  const width = 760;
  const height = 244;
  const left = 52;
  const right = 12;
  const top = 14;
  const bottom = 36;
  const values = filtered.map((point) => point.medianPrice);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, rawMax * 0.035, 1);
  const min = Math.max(0, rawMin - spread * 0.22);
  const max = rawMax + spread * 0.22;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const pointsOnChart = filtered.map((point, index) => ({
    x: left + (index / (filtered.length - 1)) * plotWidth,
    y: top + (1 - (point.medianPrice - min) / (max - min)) * plotHeight,
  }));
  const linePath = pointsOnChart
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${pointsOnChart.at(-1)?.x ?? left},${top + plotHeight} L${left},${top + plotHeight} Z`;
  const yTicks = Array.from({ length: 4 }, (_, index) => min + ((max - min) * index) / 3).reverse();
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((fraction) => {
    const index = Math.round(fraction * (filtered.length - 1));
    return { fraction, point: filtered[index] };
  });
  const safeId = id.replace(/[^a-z0-9-]/gi, "-");
  const lastPoint = pointsOnChart.at(-1);

  return (
    <div className={`price-chart ${className}`}>
      <svg
        className="price-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Демонстрационная история медианной цены за ${RANGE_LABELS[range]}`}
      >
        <defs>
          <linearGradient id={`area-${safeId}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#b8ed68" stopOpacity="0.22" />
            <stop offset="92%" stopColor="#b8ed68" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick, index) => {
          const y = top + (index / 3) * plotHeight;
          return (
            <g key={`y-${index}`}>
              <line x1={left} y1={y} x2={width - right} y2={y} className="chart-grid-line" />
              <text x={left - 9} y={y + 4} textAnchor="end" className="chart-axis-label">
                {moneyCompact(tick)}
              </text>
            </g>
          );
        })}
        {xTicks.map((tick, index) => {
          const x = left + tick.fraction * plotWidth;
          return (
            <text key={`x-${index}`} x={x} y={height - 8} textAnchor={index === 0 ? "start" : index === 3 ? "end" : "middle"} className="chart-axis-label">
              {tick.point ? dateLabel(tick.point.date) : ""}
            </text>
          );
        })}
        <path d={areaPath} fill={`url(#area-${safeId})`} />
        <path d={linePath} className="chart-line" />
        {lastPoint && <><circle cx={lastPoint.x} cy={lastPoint.y} r="8" className="chart-point-halo" /><circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" className="chart-point" /></>}
      </svg>
    </div>
  );
}

function ItemArtwork({ item, compact = false }: { item: ItemSummary; compact?: boolean }) {
  const category = item.category === "Ножи" ? "knife" : item.category === "Перчатки" ? "gloves" : item.category === "Пистолеты" ? "pistol" : "rifle";
  return (
    <div className={`item-art art-${item.artTheme} ${compact ? "item-art-compact" : ""}`} aria-hidden="true">
      <span className="art-glow" />
      {category === "knife" ? (
        <svg viewBox="0 0 96 64" className="art-object">
          <path d="m12 45 42-29 23 9-24 8-28 21-8-3-5 1-4-3 4-4Z" className="art-weapon-blade" />
          <path d="m53 33 17-8 8 3-17 8-8-3Z" className="art-weapon-dark" />
          <path d="m27 45 8 6m-4-10 8 6m-2-10 8 6" className="art-detail-line" />
          <path d="m15 46 8 8" className="art-weapon-dark" />
        </svg>
      ) : category === "gloves" ? (
        <svg viewBox="0 0 96 64" className="art-object">
          <path d="m22 43 2-21q.5-5 4-4t3 5l1 10 2-20q.5-5 4-4t3 5l-1 20 3-23q1-5 4-4t3 5l-2 24 4-19q1-5 4-3t2 6l-3 20q-1 11-11 14L29 57q-9-3-7-14Z" className="art-weapon-blade" />
          <path d="m23 43 29 8m-18-16 20 4m-14-10 16 3" className="art-detail-line" />
        </svg>
      ) : (
        <svg viewBox="0 0 96 64" className="art-object">
          <path d="M13 27h11l7-7h30l7 5h13l5 6-3 5H66l-5 8H37l-4-7H18l-5-4v-6Z" className="art-weapon-dark" />
          <path d="M28 22h33l6 5H40l-7 6h-8l3-11Z" className="art-weapon-blade" />
          <path d="m44 38 4 1-1 13-7 2-2-16m19-14 4-5h10l3 5" className="art-weapon-dark" />
          <path d="M17 29h11m-4 6h9m5-10h15" className="art-detail-line" />
          <circle cx="77" cy="30" r="2" className="art-dot" />
        </svg>
      )}
      <span className="art-label">{item.weapon}</span>
    </div>
  );
}

function MarketMark({ market, small = false }: { market: Pick<MarketSummary, "id" | "shortName">; small?: boolean }) {
  return <span className={`market-mark market-${market.id} ${small ? "market-mark-small" : ""}`}>{market.shortName}</span>;
}

function Change({ value, compact = false }: { value: number; compact?: boolean }) {
  const positive = value >= 0;
  return (
    <span className={`change-value ${positive ? "change-positive" : "change-negative"} ${compact ? "change-compact" : ""}`}>
      <Icon name={positive ? "arrowUp" : "arrowDown"} size={compact ? 12 : 14} />
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tint,
}: {
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  tint: string;
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tint}`}><Icon name={icon} size={18} /></div>
      <div className="stat-copy">
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
      <span className="stat-spark" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
    </article>
  );
}

function ItemTable({
  items,
  loading,
  savedIds,
  onSelect,
  onToggleSaved,
  title,
  caption,
  emptyTitle,
}: {
  items: ItemSummary[];
  loading: boolean;
  savedIds: number[];
  onSelect: (item: ItemSummary) => void;
  onToggleSaved: (id: number) => void;
  title: string;
  caption?: string;
  emptyTitle?: string;
}) {
  return (
    <section className="panel item-table-panel">
      <div className="panel-heading table-heading">
        <div>
          <div className="section-title-row"><h2>{title}</h2><span className="table-count">{items.length.toString().padStart(2, "0")}</span></div>
          {caption && <p>{caption}</p>}
        </div>
        <span className="table-demo-label"><span className="tiny-dot" /> ДЕМО-СНИМОК</span>
      </div>
      <div className="table-scroll">
        <table className="market-table">
          <thead>
            <tr>
              <th className="item-column">Предмет</th>
              <th>Цена покупателя</th>
              <th>Выплата продавцу</th>
              <th>24 часа</th>
              <th>Предложения</th>
              <th>Лучшая цена</th>
              <th aria-label="Избранное" />
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr><td colSpan={7} className="table-message"><span className="loading-orbit" />Ищем предметы в каталоге…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="table-message"><div className="empty-symbol"><Icon name="search" size={20} /></div><strong>{emptyTitle ?? "Ничего не найдено"}</strong><span>Попробуйте изменить запрос или фильтры.</span></td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="item-row" onClick={() => onSelect(item)}>
                  <td className="item-column">
                    <div className="item-cell">
                      <ItemArtwork item={item} compact />
                      <div className="item-cell-copy">
                        <button className="item-name-button" onClick={(event) => { event.stopPropagation(); onSelect(item); }}>{item.name}</button>
                        <div className="item-tags"><span className={`rarity-dot rarity-${item.rarity === "Тайное" || item.rarity === "Контрабандное" ? "red" : item.rarity === "Засекреченное" ? "pink" : "purple"}`} />{item.rarity}<span className="item-tag-divider">·</span>{item.wear}{item.stattrak && <span className="mini-tag stattrak-tag">StatTrak™</span>}{item.souvenir && <span className="mini-tag souvenir-tag">Souvenir</span>}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="table-price">{money(item.currentPrice)}</span><span className="table-cell-sub">за предмет</span></td>
                  <td><span className="table-payout">{money(item.sellerPayout)}</span><span className="table-cell-sub">модельный расчёт</span></td>
                  <td><Change value={item.change24h} compact /></td>
                  <td><span className="listing-number">{item.listingCount}</span><span className="table-cell-sub">снимков</span></td>
                  <td><div className="best-market"><span className="market-mini-mark">{item.bestMarket.slice(0, 1)}</span><span>{item.bestMarket}</span></div><span className="table-cell-sub">{timeLabel(item.capturedAt)}</span></td>
                  <td><button className={`save-button ${savedIds.includes(item.id) ? "is-saved" : ""}`} aria-label={savedIds.includes(item.id) ? "Убрать из избранного" : "Добавить в избранное"} onClick={(event) => { event.stopPropagation(); onToggleSaved(item.id); }}><Icon name="watchlist" size={16} /></button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer"><span><Icon name="clock" size={14} /> Время фиксации указано для каждого предложения</span><span>Все суммы в USD <i className="footer-dot" /> Комиссии площадок не подтверждены</span></div>
    </section>
  );
}

function MarketDirectory({ markets }: { markets: MarketSummary[] }) {
  return (
    <div className="markets-content">
      <div className="market-intro panel">
        <div className="market-intro-icon"><Icon name="shield" size={22} /></div>
        <div><strong>Независимый справочник, не маркетплейс</strong><p>Интеграции не активированы. Комиссии, KYC и условия площадок отображаются как непроверенные до ручной верификации.</p></div>
        <span className="unverified-pill"><span className="status-dot status-muted" />0 подключено</span>
      </div>
      <div className="market-directory-grid">
        {markets.map((market) => (
          <article className="panel market-directory-card" key={market.id}>
            <div className="market-directory-head"><MarketMark market={market} /><span className="connector-badge"><span className="status-dot status-muted" />Не подключена</span></div>
            <h3>{market.name}</h3>
            <p className="market-domain">{market.website}</p>
            <div className="market-region"><span className="field-label">РЕГИОН</span><span>{market.region}</span></div>
            <div className="market-meta-grid">
              <div><span className="field-label">КОМИССИЯ ПРОДАВЦА</span><strong>Не подтверждена</strong></div>
              <div><span className="field-label">ПОЛИТИКА KYC</span><strong>Не проверена</strong></div>
            </div>
            <div className="market-card-footer"><span><Icon name="grid" size={14} />{market.listingCount} демо-снимков</span><span className="connector-text">{market.integrationType}</span></div>
          </article>
        ))}
      </div>
      <div className="legal-note"><Icon name="shield" size={16} /><p>Названия площадок принадлежат их владельцам. Упоминание не означает партнёрство или подключение. Перед публикацией тарифы следует сверить с официальными условиями.</p></div>
    </div>
  );
}

function CalculatorView({ items }: { items: ItemSummary[] }) {
  const [inputValue, setInputValue] = useState("75");
  const [outputValue, setOutputValue] = useState("92");
  const [feePercent, setFeePercent] = useState(5);
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? 0);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0];
  const given = Math.max(0, Number.parseFloat(inputValue) || 0);
  const received = Math.max(0, Number.parseFloat(outputValue) || 0);
  const fee = received * (feePercent / 100);
  const netValue = received - fee;
  const profit = netValue - given;
  const roi = given > 0 ? (profit / given) * 100 : 0;
  const isPositive = profit >= 0;

  return (
    <div className="calculator-layout">
      <section className="panel calculator-panel">
        <div className="panel-heading"><div><h2>Расчёт trade-in</h2><p>Оцените итоговую стоимость после условной комиссии.</p></div><span className="calculator-icon"><Icon name="calculator" size={19} /></span></div>
        <div className="calculator-fields">
          <label className="calc-field"><span>Стоимость предметов, которые отдаёте</span><div className="number-input-wrap"><span>$</span><input type="number" min="0" step="0.01" value={inputValue} onChange={(event) => setInputValue(event.target.value)} aria-label="Стоимость предметов, которые отдаёте" /></div><small>Оценка по вашей стороне сделки</small></label>
          <div className="calc-swap-mark"><Icon name="trend" size={16} /></div>
          <label className="calc-field"><span>Стоимость предметов, которые получаете</span><div className="number-input-wrap"><span>$</span><input type="number" min="0" step="0.01" value={outputValue} onChange={(event) => setOutputValue(event.target.value)} aria-label="Стоимость предметов, которые получаете" /></div><small>Рыночная стоимость до комиссии</small></label>
        </div>
        <div className="fee-control"><div><div><span>Условная комиссия</span><strong>{feePercent}%</strong></div><input type="range" min="0" max="20" step="0.5" value={feePercent} onChange={(event) => setFeePercent(Number(event.target.value))} aria-label="Условная комиссия" style={{ "--range-progress": `${feePercent * 5}%` } as CSSProperties} /><div className="range-limits"><span>0%</span><span>20%</span></div></div><div className="fee-example"><span>Комиссия от получаемого</span><strong>−{money(fee)}</strong></div></div>
        <div className={`calculator-result ${isPositive ? "result-positive" : "result-negative"}`}>
          <div><span>Итог после комиссии</span><strong>{money(netValue)}</strong><small>чистая стоимость получаемого предмета</small></div>
          <div className="result-divider" />
          <div><span>Разница к вашей стороне</span><strong>{isPositive ? "+" : "−"}{money(Math.abs(profit))}</strong><small className="result-roi">{isPositive ? "+" : ""}{roi.toFixed(2)}% к стоимости отдаваемого</small></div>
          <div className="result-mark"><Icon name={isPositive ? "arrowUp" : "arrowDown"} size={19} /></div>
        </div>
        <div className="calculator-disclaimer"><Icon name="spark" size={15} /><span>Комиссия — редактируемый пример, не тариф конкретной площадки. Проверьте актуальные условия самостоятельно.</span></div>
      </section>
      <aside className="panel calculator-side-panel">
        <span className="field-label">ПРОВЕРИТЬ ПРИМЕР ЦЕНЫ</span>
        <h3>Демо-ориентир</h3>
        <p>Выберите предмет, чтобы увидеть пример минимальной цены покупателя и условной выплаты продавцу.</p>
        <select className="calculator-select" value={selectedItem?.id ?? ""} onChange={(event) => setSelectedItemId(Number(event.target.value))} aria-label="Предмет для примера">
          {items.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        {selectedItem && <div className="calc-item-preview"><ItemArtwork item={selectedItem} compact /><div><strong>{selectedItem.name}</strong><span>{selectedItem.listingCount} демонстрационных снимков</span></div></div>}
        {selectedItem && <div className="calc-price-rows"><div><span>Цена покупателя</span><strong>{money(selectedItem.currentPrice)}</strong></div><div><span>Модельная выплата</span><strong className="table-payout">{money(selectedItem.sellerPayout)}</strong></div></div>}
        <div className="side-warning"><Icon name="clock" size={15} /><span>Данные примера не являются актуальными котировками.</span></div>
      </aside>
    </div>
  );
}

function DetailModal({
  item,
  detail,
  loading,
  error,
  onClose,
}: {
  item: ItemSummary;
  detail: ItemDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [range, setRange] = useState<ChartRange>("30d");
  const activeItem = detail?.item ?? item;
  const offers: PriceOffer[] = detail?.offers ?? [];
  const points: HistoryPoint[] = detail?.history ?? [];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="detail-topbar"><span className="detail-kicker"><span className="tiny-dot" /> КАРТОЧКА ПРЕДМЕТА</span><button className="icon-button close-detail" onClick={onClose} aria-label="Закрыть карточку"><Icon name="close" size={20} /></button></div>
        <div className="detail-title-block"><ItemArtwork item={activeItem} /><div><span className="rarity-label"><i className="rarity-dot rarity-red" />{activeItem.rarity}</span><h2 id="detail-title">{activeItem.name}</h2><p>{activeItem.collection} <span>·</span> {activeItem.wear}</p></div></div>
        <div className="detail-price-overview">
          <div><span>Лучшая цена покупателя <i className="info-dot" title="Демонстрационный снимок" /></span><strong>{money(activeItem.currentPrice)}</strong><small>{activeItem.bestMarket} · снимок {timeLabel(activeItem.capturedAt)}</small></div>
          <div><span>Модельная выплата продавцу</span><strong className="detail-payout">{money(activeItem.sellerPayout)}</strong><small>Комиссия площадки не подтверждена</small></div>
          <div className="detail-change-box"><Change value={activeItem.change24h} /><small>демо · 24 часа</small></div>
        </div>
        <div className="detail-chart-section">
          <div className="detail-section-heading"><div><h3>История цены</h3><span>Медианная цена · демонстрационный ряд</span></div><div className="range-switch range-switch-small">{(Object.keys(RANGE_LABELS) as ChartRange[]).map((value) => <button key={value} className={range === value ? "range-active" : ""} onClick={() => setRange(value)}>{RANGE_LABELS[value]}</button>)}</div></div>
          {loading && points.length === 0 ? <div className="detail-chart-skeleton"><span className="loading-orbit" />Загружаем историю…</div> : <PriceChart points={points} range={range} id={`detail-${activeItem.id}`} />}
        </div>
        <div className="detail-specs">
          <div><span>Износ / float</span><strong>{activeItem.wear} <span>{activeItem.floatValue.toFixed(6)}</span></strong></div>
          <div><span>Paint seed</span><strong>#{activeItem.paintSeed}</strong></div>
          <div><span>Предложений в снимке</span><strong>{activeItem.listingCount}</strong></div>
          <div><span>Атрибуты</span><strong>{activeItem.stattrak ? "StatTrak™" : activeItem.souvenir ? "Souvenir" : "Обычный"}</strong></div>
        </div>
        <div className="detail-offers-section">
          <div className="detail-section-heading"><div><h3>Сравнение площадок</h3><span>{offers.length} демонстрационных ценовых снимков</span></div><span className="table-demo-label"><span className="tiny-dot" /> НЕ LIVE</span></div>
          {error && <p className="detail-error">{error}</p>}
          <div className="detail-offers-list">
            {offers.map((offer, index) => (
              <div className="offer-row" key={offer.id}>
                <div className="offer-market"><MarketMark market={{ id: offer.marketId, shortName: offer.marketShortName }} small /><div><strong>{offer.marketName}</strong><span>{offer.region}</span></div></div>
                <div className="offer-price"><span>Покупатель</span><strong>{money(offer.buyerPrice)}</strong></div>
                <div className="offer-price offer-seller"><span>Продавец · модель</span><strong>{money(offer.sellerPayout)}</strong></div>
                <div className="offer-capture"><Icon name="clock" size={13} /><span>{timeLabel(offer.capturedAt)}</span></div>
                {index === 0 && <span className="offer-best-badge">НИЖЕ</span>}
              </div>
            ))}
            {!loading && offers.length === 0 && !error && <div className="detail-empty">Нет зафиксированных предложений.</div>}
          </div>
        </div>
        <div className="detail-disclaimer"><Icon name="shield" size={15} /><span>Цены и выплаты в карточке — синтетические примеры. Реальные источники не подключены; торговые операции недоступны.</span></div>
      </aside>
    </div>
  );
}

function FiltersBar({
  category,
  setCategory,
  weapon,
  setWeapon,
  weaponOptions,
  rarity,
  setRarity,
  collection,
  setCollection,
  collectionOptions,
  wear,
  setWear,
  stattrak,
  setStattrak,
  souvenir,
  setSouvenir,
  sort,
  setSort,
}: {
  category: string;
  setCategory: (value: string) => void;
  weapon: string;
  setWeapon: (value: string) => void;
  weaponOptions: string[];
  rarity: string;
  setRarity: (value: string) => void;
  collection: string;
  setCollection: (value: string) => void;
  collectionOptions: string[];
  wear: string;
  setWear: (value: string) => void;
  stattrak: boolean;
  setStattrak: (value: boolean) => void;
  souvenir: boolean;
  setSouvenir: (value: boolean) => void;
  sort: string;
  setSort: (value: string) => void;
}) {
  return (
    <section className="panel filters-panel">
      <div className="filter-topline"><div className="category-tabs">{CATEGORIES.map((value) => <button key={value} className={category === value ? "category-active" : ""} onClick={() => setCategory(value)}>{value}</button>)}</div><div className="filter-label"><Icon name="sliders" size={16} />ФИЛЬТРЫ</div></div>
      <div className="filter-controls">
        <label className="select-filter"><span>Оружие</span><select value={weapon} onChange={(event) => setWeapon(event.target.value)}><option>Все оружие</option>{weaponOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="select-filter"><span>Редкость</span><select value={rarity} onChange={(event) => setRarity(event.target.value)}>{RARITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="select-filter"><span>Коллекция</span><select value={collection} onChange={(event) => setCollection(event.target.value)}><option>Все коллекции</option>{collectionOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="select-filter"><span>Износ</span><select value={wear} onChange={(event) => setWear(event.target.value)}>{WEARS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="select-filter sort-select"><span>Сортировка</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="popular">Популярность</option><option value="price-asc">Цена: сначала ниже</option><option value="price-desc">Цена: сначала выше</option><option value="change">Изменение за 24 ч</option></select></label>
        <button className={`toggle-filter ${stattrak ? "toggle-on" : ""}`} onClick={() => setStattrak(!stattrak)} aria-pressed={stattrak}><span className="toggle-track"><i /></span>StatTrak™</button>
        <button className={`toggle-filter ${souvenir ? "toggle-on" : ""}`} onClick={() => setSouvenir(!souvenir)} aria-pressed={souvenir}><span className="toggle-track"><i /></span>Souvenir</button>
        <button className="clear-filters" onClick={() => { setCategory("Все"); setWeapon("Все оружие"); setRarity("Все редкости"); setCollection("Все коллекции"); setWear("Все состояния"); setStattrak(false); setSouvenir(false); setSort("popular"); }}>Сбросить</button>
      </div>
    </section>
  );
}

export function Dashboard({ initialData }: { initialData: DashboardSnapshot }) {
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Все");
  const [weapon, setWeapon] = useState("Все оружие");
  const [rarity, setRarity] = useState("Все редкости");
  const [collection, setCollection] = useState("Все коллекции");
  const [wear, setWear] = useState("Все состояния");
  const [stattrak, setStattrak] = useState(false);
  const [souvenir, setSouvenir] = useState(false);
  const [sort, setSort] = useState("popular");
  const [items, setItems] = useState(initialData.items);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [watchReady, setWatchReady] = useState(false);
  const [lightTheme, setLightTheme] = useState(false);
  const [range, setRange] = useState<ChartRange>("30d");
  const [chartItemId, setChartItemId] = useState(initialData.featuredItemId);
  const [chartHistory, setChartHistory] = useState(initialData.history);
  const [chartLoading, setChartLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemSummary | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(initialData.updatedAt);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("cs2-index-watchlist");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) setSavedIds(parsed.filter((id): id is number => Number.isInteger(id)));
      }
      setLightTheme(window.localStorage.getItem("cs2-index-theme") === "light");
    } catch {
      // Local preferences are optional; the dashboard remains usable without storage.
    }
    setWatchReady(true);
  }, []);

  useEffect(() => {
    if (!watchReady) return;
    try {
      window.localStorage.setItem("cs2-index-watchlist", JSON.stringify(savedIds));
      window.localStorage.setItem("cs2-index-theme", lightTheme ? "light" : "dark");
    } catch {
      // Private browsing modes can disable storage.
    }
  }, [savedIds, lightTheme, watchReady]);

  useEffect(() => {
    const hasFilters = Boolean(query.trim()) || category !== "Все" || weapon !== "Все оружие" || rarity !== "Все редкости" || collection !== "Все коллекции" || wear !== "Все состояния" || stattrak || souvenir || sort !== "popular";
    if (!hasFilters) {
      setItems(initialData.items);
      setItemsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setItemsLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (category !== "Все") params.set("category", category);
        if (weapon !== "Все оружие") params.set("weapon", weapon);
        if (rarity !== "Все редкости") params.set("rarity", rarity);
        if (collection !== "Все коллекции") params.set("collection", collection);
        if (wear !== "Все состояния") params.set("wear", wear);
        if (stattrak) params.set("stattrak", "1");
        if (souvenir) params.set("souvenir", "1");
        if (sort !== "popular") params.set("sort", sort);
        const response = await fetch(`/api/items?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Не удалось применить фильтры");
        const payload = (await response.json()) as { items: ItemSummary[] };
        if (!controller.signal.aborted) setItems(payload.items);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") setItems(initialData.items);
      } finally {
        if (!controller.signal.aborted) setItemsLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialData.items, query, category, weapon, rarity, collection, wear, stattrak, souvenir, sort]);

  useEffect(() => {
    if (!selectedItem) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    fetch(`/api/items/${selectedItem.id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить карточку предмета");
        return (await response.json()) as ItemDetail;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setDetail(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") setDetailError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedItem(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedItem]);

  useEffect(() => {
    if (chartItemId === initialData.featuredItemId) {
      setChartHistory(initialData.history);
      return;
    }
    const controller = new AbortController();
    setChartLoading(true);
    fetch(`/api/items/${chartItemId}/history?range=365d`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить историю");
        return (await response.json()) as { history: HistoryPoint[] };
      })
      .then((payload) => {
        if (!controller.signal.aborted) setChartHistory(payload.history);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") setChartHistory([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChartLoading(false);
      });
    return () => controller.abort();
  }, [chartItemId, initialData.featuredItemId, initialData.history]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const displayedItems = activeView === "watchlist" ? items.filter((item) => savedIds.includes(item.id)) : items;
  const featuredItem = initialData.items.find((item) => item.id === chartItemId) ?? initialData.items[0];
  const averageChange = initialData.items.length
    ? initialData.items.reduce((sum, item) => sum + item.change24h, 0) / initialData.items.length
    : 0;
  const topMovers = useMemo(() => [...initialData.items].sort((left, right) => right.change24h - left.change24h).slice(0, 3), [initialData.items]);
  const weaponOptions = useMemo(() => Array.from(new Set(initialData.items.map((item) => item.weapon))).sort((left, right) => left.localeCompare(right)), [initialData.items]);
  const collectionOptions = useMemo(() => Array.from(new Set(initialData.items.map((item) => item.collection))).sort((left, right) => left.localeCompare(right)), [initialData.items]);
  const gainCount = initialData.items.filter((item) => item.change24h > 0).length;
  const declineCount = initialData.items.filter((item) => item.change24h < 0).length;

  const toggleSaved = (itemId: number) => {
    setSavedIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
    const item = initialData.items.find((entry) => entry.id === itemId);
    setToast(item && savedIds.includes(itemId) ? "Удалено из избранного" : "Добавлено в избранное");
  };

  const runRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/analytics/summary", { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось проверить данные");
      const summary = (await response.json()) as { capturedAt?: string };
      if (summary.capturedAt) setLastRefresh(summary.capturedAt);
      setToast("Демо-снимки проверены · live-источники не подключены");
    } catch {
      setToast("Сервис данных временно недоступен");
    } finally {
      setRefreshing(false);
    }
  };

  const openDetail = (item: ItemSummary) => setSelectedItem(item);

  return (
    <div className={`app-shell ${lightTheme ? "theme-light" : ""}`}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-symbol"><span /><span /><span /><span /></div>
          <div className="brand-name">CS2<span>INDEX</span></div>
          <span className="brand-beta">BETA</span>
        </div>
        <div className="sidebar-divider" />
        <nav className="sidebar-navigation" aria-label="Основная навигация">
          <span className="nav-section-label">ПЛАТФОРМА</span>
          <NavButton view="overview" activeView={activeView} onClick={setActiveView} icon="overview" label="Обзор" />
          <NavButton view="catalog" activeView={activeView} onClick={setActiveView} icon="catalog" label="Каталог" />
          <NavButton view="markets" activeView={activeView} onClick={setActiveView} icon="markets" label="Площадки" />
          <NavButton view="watchlist" activeView={activeView} onClick={setActiveView} icon="watchlist" label="Избранное" count={savedIds.length} />
          <span className="nav-section-label nav-tools-label">ИНСТРУМЕНТЫ</span>
          <NavButton view="calculator" activeView={activeView} onClick={setActiveView} icon="calculator" label="Калькулятор" />
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-status-card">
          <div className="sidebar-status-head"><span className="status-light" /><span>ДЕМО-РЕЖИМ</span><Icon name="spark" size={15} /></div>
          <strong>Без торговли.<br />Только данные.</strong>
          <p>Источники не подключены. Цены в интерфейсе демонстрационные.</p>
          <div className="sidebar-progress"><span /></div>
          <span className="sidebar-progress-copy">0 из {initialData.markets.length} live-источников</span>
        </div>
        <div className="sidebar-user">
          <div className="user-avatar">CS</div><div><strong>Гость</strong><span>Только чтение</span></div><span className="user-status" />
        </div>
      </aside>

      <div className="main-frame">
        <header className="topbar">
          <div className="breadcrumbs"><span>CS2 INDEX</span><Icon name="chevron" size={13} /><strong>{VIEW_LABELS[activeView]}</strong></div>
          <div className="topbar-actions">
            <label className="global-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Предмет, коллекция…" aria-label="Поиск предметов" /><kbd>⌘ K</kbd></label>
            <div className="topbar-divider" />
            <span className="demo-status"><i />DEMO DATA</span>
            <button className="icon-button theme-button" aria-label={lightTheme ? "Включить тёмную тему" : "Включить светлую тему"} onClick={() => setLightTheme((value) => !value)}><Icon name={lightTheme ? "moon" : "sun"} size={17} /></button>
            <div className="top-avatar" title="Гостевой режим">CS</div>
          </div>
        </header>

        <main className="page-content">
          <div className="demo-notice"><div className="notice-icon"><Icon name="spark" size={15} /></div><div><strong>Демонстрационные данные</strong><span> Котировки и история ниже — синтетический пример с временными метками, не реальные цены.</span></div><span className="notice-source">0 LIVE-ИСТОЧНИКОВ</span></div>

          <div className="page-heading">
            <div><div className="page-overline"><span className="overline-line" /> MARKET INTELLIGENCE <span className="overline-dot">/</span> CS2</div><h1>{headingFor(activeView, savedIds.length)}</h1><p>{subtitleFor(activeView)}</p></div>
            <div className="heading-actions"><button className="refresh-button" onClick={runRefresh} disabled={refreshing}><Icon name="refresh" size={16} /><span>{refreshing ? "Проверяем…" : "Обновить снимок"}</span></button><span className="last-updated"><i /> Снимок {timeLabel(lastRefresh)}</span></div>
          </div>

          {activeView === "overview" && (
            <>
              <div className="stats-grid">
                <StatCard icon="catalog" label="Предметов в каталоге" value={initialData.metrics.itemCount.toString()} detail="демонстрационный набор" tint="stat-tint-lime" />
                <StatCard icon="markets" label="Площадок в справочнике" value={initialData.metrics.marketCount.toString()} detail="0 интеграций подключено" tint="stat-tint-blue" />
                <StatCard icon="grid" label="Предложений для сравнения" value={initialData.metrics.offerCount.toString()} detail="цены с временем фиксации" tint="stat-tint-violet" />
                <StatCard icon="trend" label="Глубина истории" value={`${initialData.metrics.historyDays} дн.`} detail="демо-ряд, не рыночная история" tint="stat-tint-amber" />
              </div>

              <div className="overview-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading chart-panel-heading">
                    <div><div className="chart-title-row"><span className="section-icon section-icon-lime"><Icon name="trend" size={16} /></span><h2>История цены</h2><span className="chart-demo-tag">ДЕМО</span></div><p>{featuredItem?.name ?? "Рыночный предмет"} · медианная цена</p></div>
                    <label className="chart-item-select"><span>ПРЕДМЕТ</span><select value={chartItemId} onChange={(event) => setChartItemId(Number(event.target.value))} aria-label="Предмет для графика">{initialData.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Icon name="chevron" size={15} /></label>
                  </div>
                  <div className="chart-metrics-row"><div className="current-price-block"><span>Медиана сейчас <i className="info-dot" title="Демонстрационный расчёт" /></span><strong>{featuredItem ? money(featuredItem.currentPrice) : "—"}</strong></div><div className="chart-change-block"><Change value={featuredItem?.change24h ?? 0} /><span>за последние 24 часа <i>·</i> модельный ряд</span></div><div className="range-switch">{(Object.keys(RANGE_LABELS) as ChartRange[]).map((value) => <button key={value} className={range === value ? "range-active" : ""} onClick={() => setRange(value)}>{RANGE_LABELS[value]}</button>)}</div></div>
                  {chartLoading ? <div className="chart-loading"><span className="loading-orbit" />Загружаем демонстрационную историю…</div> : <PriceChart points={chartHistory} range={range} id={`main-${chartItemId}`} />}
                  <div className="chart-footnote"><span><i className="chart-legend-dot" />Медианная цена</span><span><Icon name="clock" size={13} /> Синтетический временной ряд · USD</span></div>
                </section>

                <aside className="panel market-pulse-panel">
                  <div className="panel-heading pulse-heading"><div><div className="chart-title-row"><span className="section-icon section-icon-blue"><Icon name="spark" size={16} /></span><h2>Пульс каталога</h2></div><p>Сводка демонстрационного набора</p></div><span className="pulse-live"><i />СИМУЛЯЦИЯ</span></div>
                  <div className="pulse-average"><div><span>Среднее изменение</span><strong><Change value={averageChange} /></strong></div><span className="pulse-time">24 ЧАСА</span></div>
                  <div className="breadth-card"><div className="breadth-labels"><span><i className="breadth-up-dot" />Растут <strong>{gainCount}</strong></span><span><i className="breadth-down-dot" />Снижаются <strong>{declineCount}</strong></span></div><div className="breadth-bar"><span style={{ width: `${initialData.items.length ? (gainCount / initialData.items.length) * 100 : 0}%` }} /><i style={{ width: `${initialData.items.length ? (declineCount / initialData.items.length) * 100 : 0}%` }} /></div><div className="breadth-total">Движение цен в демо-каталоге <strong>{initialData.items.length} предметов</strong></div></div>
                  <div className="movers-heading"><h3>Заметные движения</h3><span>ДЕМО · 24 Ч</span></div>
                  <div className="movers-list">{topMovers.map((item, index) => <button className="mover-row" key={item.id} onClick={() => openDetail(item)}><span className="mover-rank">0{index + 1}</span><ItemArtwork item={item} compact /><span className="mover-name">{item.name}<small>{item.category} · {item.rarity}</small></span><Change value={item.change24h} compact /></button>)}</div>
                  <div className="pulse-disclaimer"><Icon name="shield" size={14} /><span>Движения рассчитаны по тестовым данным</span></div>
                </aside>
              </div>

              <ItemTable items={displayedItems.slice(0, 9)} loading={itemsLoading} savedIds={savedIds} onSelect={openDetail} onToggleSaved={toggleSaved} title="Популярные предметы" caption="Сравнение минимальных демонстрационных предложений" />
            </>
          )}

          {activeView === "catalog" && (
            <>
              <FiltersBar category={category} setCategory={setCategory} weapon={weapon} setWeapon={setWeapon} weaponOptions={weaponOptions} rarity={rarity} setRarity={setRarity} collection={collection} setCollection={setCollection} collectionOptions={collectionOptions} wear={wear} setWear={setWear} stattrak={stattrak} setStattrak={setStattrak} souvenir={souvenir} setSouvenir={setSouvenir} sort={sort} setSort={setSort} />
              <ItemTable items={displayedItems} loading={itemsLoading} savedIds={savedIds} onSelect={openDetail} onToggleSaved={toggleSaved} title="Все предметы" caption={`${displayedItems.length} результатов · поиск выполняется через API`} emptyTitle="Нет предметов с такими фильтрами" />
              <div className="catalog-footnote"><Icon name="filter" size={15} />Фильтры по категории, оружию, редкости, коллекции, износу, StatTrak™ и Souvenir.</div>
            </>
          )}

          {activeView === "watchlist" && (
            <>
              <div className="watchlist-summary panel"><div className="watchlist-summary-icon"><Icon name="watchlist" size={20} /></div><div><strong>{savedIds.length} {savedIds.length === 1 ? "предмет" : "предметов"} в избранном</strong><p>Список хранится только в этом браузере. Уведомления и синхронизация аккаунта не включены.</p></div><span className="local-only-badge">LOCAL ONLY</span></div>
              <ItemTable items={displayedItems} loading={itemsLoading} savedIds={savedIds} onSelect={openDetail} onToggleSaved={toggleSaved} title="Ваш список наблюдения" caption="Нажмите на закладку в каталоге, чтобы добавить предмет" emptyTitle="Пока нет сохранённых предметов" />
            </>
          )}

          {activeView === "markets" && <MarketDirectory markets={initialData.markets} />}
          {activeView === "calculator" && <CalculatorView items={initialData.items} />}

          <footer className="page-footer"><div className="footer-brand"><span className="footer-brand-mark">C</span><span>CS2 INDEX</span><span className="footer-version">DATA TOOLS</span></div><p>CS2 Index — независимый информационный сервис, не маркетплейс. Не принимает платежи, не хранит средства и не выполняет торговые операции.</p><p className="valve-disclaimer">Counter-Strike 2, CS2 и связанные товарные знаки принадлежат Valve Corporation. Сервис не аффилирован, не одобрен и не спонсируется Valve.</p><span className="footer-data-badge"><i />ДЕМО-ДАННЫЕ</span></footer>
        </main>
      </div>

      {selectedItem && <DetailModal item={selectedItem} detail={detail} loading={detailLoading} error={detailError} onClose={() => setSelectedItem(null)} />}
      {toast && <div className="toast-message" role="status"><span className="toast-mark"><Icon name="check" size={14} /></span>{toast}</div>}
    </div>
  );
}

function NavButton({
  view,
  activeView,
  onClick,
  icon,
  label,
  count: badgeCount,
}: {
  view: ViewKey;
  activeView: ViewKey;
  onClick: (view: ViewKey) => void;
  icon: IconName;
  label: string;
  count?: number;
}) {
  return (
    <button className={`nav-button ${activeView === view ? "nav-button-active" : ""}`} onClick={() => onClick(view)} aria-current={activeView === view ? "page" : undefined}>
      <span className="nav-icon"><Icon name={icon} size={18} /></span><span>{label}</span>{typeof badgeCount === "number" && badgeCount > 0 && <span className="nav-count">{badgeCount}</span>}
    </button>
  );
}

function headingFor(view: ViewKey, savedCount: number) {
  if (view === "watchlist" && savedCount === 0) return "Ваш список наблюдения";
  return VIEW_LABELS[view];
}

function subtitleFor(view: ViewKey) {
  switch (view) {
    case "overview": return "Сравнивайте предложения и следите за динамикой предметов Counter-Strike 2.";
    case "catalog": return "Ищите предметы по категориям, состоянию, редкости и специальным атрибутам.";
    case "markets": return "Справочник площадок и прозрачный статус источников ценовых данных.";
    case "watchlist": return "Сохранённые предметы на этом устройстве — без аккаунта и торговых операций.";
    case "calculator": return "Рассчитайте условную стоимость обмена и выплату с настраиваемой комиссией.";
  }
}
