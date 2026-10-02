"use client";

import { useMemo, useState } from "react";
import type { HistoryPoint } from "@/lib/analytics/types";
import { formatUsd } from "@/lib/format";
import { areaFromPath, niceTicks, smoothPath, useElementWidth } from "@/components/chart-utils";
import { TrendTriangle } from "@/components/icons";

type Props = {
  history: HistoryPoint[];
  height?: number;
  showVolume?: boolean;
};

/**
 * График цены по историческим точкам.
 *
 * Ряд может быть неравномерным (недельные срезы датасета и дневные снимки
 * синхронизации), поэтому точки раскладываются по календарю, а не по индексу.
 */
export function PriceChart({ history, height = 200, showVolume = true }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const { ref: containerRef, width } = useElementWidth<HTMLDivElement>(760);

  const points = useMemo(
    () => [...history].sort((left, right) => left.date.localeCompare(right.date)),
    [history],
  );

  if (points.length < 2) {
    return (
      <div className="chart-empty" style={{ height }}>
        <span>Недостаточно наблюдений для графика</span>
        <span className="chart-empty-hint">
          История пополняется по мере снимков цен: недельные срезы датасета и ежедневная синхронизация
        </span>
      </div>
    );
  }

  const padding = { top: 18, right: 20, bottom: 26, left: 54 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const baseline = padding.top + innerHeight;

  const values = points.map((point) => point.lowPriceUsd);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue || Math.max(maxValue * 0.1, 1);
  const lower = Math.max(0, minValue - span * 0.18);
  const upper = maxValue + span * 0.18;

  const times = points.map((point) => new Date(`${point.date}T00:00:00Z`).getTime());
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const timeSpan = maxTime - minTime || 1;

  const x = (index: number) => padding.left + ((times[index] - minTime) / timeSpan) * innerWidth;
  const y = (value: number) => padding.top + innerHeight - ((value - lower) / (upper - lower)) * innerHeight;

  const coordinates = points.map((point, index) => ({ x: x(index), y: y(point.lowPriceUsd) }));
  const linePath = smoothPath(coordinates);
  const areaPath = areaFromPath(linePath, coordinates, baseline);

  // Подписи оси берутся по «круглым» значениям, а не по долям диапазона:
  // $12.50 / $25.00 читаются легче, чем произвольные доли.
  const ticks = niceTicks(lower, upper, 4).map((value) => ({ value, y: y(value) }));

  const volumeValues = points.map((point) => point.volume ?? 0);
  const maxVolume = Math.max(...volumeValues, 1);
  const hasVolume = showVolume && volumeValues.some((value) => value > 0);

  const hover = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverCoordinate = hoverIndex !== null ? coordinates[hoverIndex] : null;

  const first = points[0];
  const last = points[points.length - 1];
  const change = first.lowPriceUsd > 0 ? ((last.lowPriceUsd - first.lowPriceUsd) / first.lowPriceUsd) * 100 : null;
  const trendTone = change === null ? "flat" : change > 0 ? "positive" : change < 0 ? "negative" : "flat";

  return (
    <div className="price-chart">
      <div className="chart-head">
        <div>
          <div className="chart-value">
            {formatUsd(last.lowPriceUsd)}
            {change === null ? null : (
              <span className={`chart-change change-${trendTone}`}>
                <TrendTriangle direction={change >= 0 ? "up" : "down"} />
                {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
          <div className="chart-sub">
            {points.length} наблюдений · {first.date} — {last.date}
          </div>
        </div>
        {hover ? (
          <div className="chart-hover-info">
            <strong>{formatUsd(hover.lowPriceUsd)}</strong>
            <span>
              {new Date(`${hover.date}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })}
              {hover.volume ? ` · объём ${hover.volume}` : ""}
              {hover.isLive ? " · live" : " · датасет"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="chart-canvas" ref={containerRef}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          height={height}
          className="price-chart-svg"
          role="img"
          aria-label="График цены"
        >
        <defs>
          <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick.value}>
            <line x1={padding.left} x2={width - padding.right} y1={tick.y} y2={tick.y} className="chart-grid-line" />
            <text x={padding.left - 10} y={tick.y + 4} className="chart-axis-label" textAnchor="end">
              {formatUsd(tick.value, { compact: true })}
            </text>
          </g>
        ))}

        {hasVolume
          ? points.map((point, index) => {
              const value = point.volume ?? 0;
              if (value <= 0) return null;
              const barHeight = (value / maxVolume) * innerHeight * 0.16;
              return (
                <rect
                  key={`${point.date}-${point.marketId}`}
                  x={x(index) - 2}
                  y={baseline - barHeight}
                  width={4}
                  height={barHeight}
                  rx={2}
                  className="chart-volume-bar"
                />
              );
            })
          : null}

        <path d={areaPath} fill="url(#chart-area)" />
        <path d={linePath} className="chart-line" />

        {points.length <= 40
          ? coordinates.map((coordinate, index) => (
              <circle
                key={`${points[index].date}-point`}
                cx={coordinate.x}
                cy={coordinate.y}
                r={hoverIndex === index ? 4.5 : 2.6}
                className={hoverIndex === index ? "chart-point chart-point-active" : "chart-point"}
              />
            ))
          : null}

        {hoverCoordinate ? (
          <g>
            <line
              x1={hoverCoordinate.x}
              x2={hoverCoordinate.x}
              y1={padding.top - 4}
              y2={baseline}
              className="chart-hover-line"
            />
            <circle cx={hoverCoordinate.x} cy={hoverCoordinate.y} r={5} className="chart-point-active" />
          </g>
        ) : null}

        <rect
          x={padding.left}
          y={padding.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(event) => {
            const rect = (event.target as SVGRectElement).getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            const index = Math.round(ratio * (points.length - 1));
            setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
          }}
        />
        </svg>
      </div>

      <div className="chart-footnote">
        <span>
          Минимум {formatUsd(minValue)} · максимум {formatUsd(maxValue)}
        </span>
        <span>Разрывы линии — отсутствие наблюдений, а не нулевая цена</span>
      </div>
    </div>
  );
}
