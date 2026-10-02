"use client";

import { useMemo, useState } from "react";
import type { HistoryPoint } from "@/lib/analytics/types";
import { formatUsd } from "@/lib/format";

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
export function PriceChart({ history, height = 220, showVolume = true }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  const width = 760;
  const padding = { top: 16, right: 18, bottom: 26, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = points.map((point) => point.lowPriceUsd);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue || 1;
  const lower = Math.max(0, minValue - span * 0.12);
  const upper = maxValue + span * 0.12;

  const times = points.map((point) => new Date(`${point.date}T00:00:00Z`).getTime());
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const timeSpan = maxTime - minTime || 1;

  const x = (index: number) => padding.left + ((times[index] - minTime) / timeSpan) * innerWidth;
  const y = (value: number) => padding.top + innerHeight - ((value - lower) / (upper - lower)) * innerHeight;

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.lowPriceUsd).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${x(0).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: lower + (upper - lower) * ratio,
    y: padding.top + innerHeight - innerHeight * ratio,
  }));

  const volumeValues = points.map((point) => point.volume ?? 0);
  const maxVolume = Math.max(...volumeValues, 1);
  const hasVolume = showVolume && volumeValues.some((value) => value > 0);

  const hover = hoverIndex !== null ? points[hoverIndex] : null;

  const first = points[0];
  const last = points[points.length - 1];
  const change = first.lowPriceUsd > 0 ? ((last.lowPriceUsd - first.lowPriceUsd) / first.lowPriceUsd) * 100 : null;

  return (
    <div className="price-chart">
      <div className="chart-head">
        <div>
          <div className="chart-value">{formatUsd(last.lowPriceUsd)}</div>
          <div className="chart-sub">
            {change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}% за период`} · {points.length} наблюдений
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

      <svg viewBox={`0 0 ${width} ${height}`} className="price-chart-svg" role="img" aria-label="График цены">
        <defs>
          <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridLines.map((line) => (
          <g key={line.y}>
            <line x1={padding.left} x2={width - padding.right} y1={line.y} y2={line.y} className="chart-grid-line" />
            <text x={padding.left - 8} y={line.y + 4} className="chart-axis-label" textAnchor="end">
              {formatUsd(line.value, { compact: true })}
            </text>
          </g>
        ))}

        {hasVolume
          ? points.map((point, index) => {
              const value = point.volume ?? 0;
              if (value <= 0) return null;
              const barHeight = (value / maxVolume) * innerHeight * 0.18;
              return (
                <rect
                  key={`${point.date}-${point.marketId}`}
                  x={x(index) - 1.5}
                  y={padding.top + innerHeight - barHeight}
                  width={3}
                  height={barHeight}
                  className="chart-volume-bar"
                />
              );
            })
          : null}

        <path d={areaPath} fill="url(#chart-area)" />
        <path d={linePath} className="chart-line" />

        {points.map((point, index) => (
          <circle
            key={`${point.date}-point`}
            cx={x(index)}
            cy={y(point.lowPriceUsd)}
            r={hoverIndex === index ? 4.5 : 2.4}
            className={hoverIndex === index ? "chart-point chart-point-active" : "chart-point"}
          />
        ))}

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

      <div className="chart-footnote">
        <span>
          {first.date} → {last.date}
        </span>
        <span>
          Минимум {formatUsd(minValue)} · максимум {formatUsd(maxValue)}
        </span>
      </div>
    </div>
  );
}
