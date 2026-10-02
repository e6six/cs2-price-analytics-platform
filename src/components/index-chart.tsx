"use client";

import { useMemo, useState } from "react";
import { formatDate, formatPercent } from "@/lib/format";

type Point = { date: string; value: number };

/**
 * График индекса рынка: медиана отношений цен корзины предметов к первой дате
 * (база 100). Показывает форму рынка, а не цену конкретного предмета.
 */
export function IndexChart({ series, height = 180 }: { series: Point[]; height?: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = useMemo(
    () => [...series].sort((left, right) => left.date.localeCompare(right.date)),
    [series],
  );

  if (points.length < 2) {
    return (
      <div className="chart-empty" style={{ height }}>
        <span>Индекс появится, когда наберётся история хотя бы по двум датам</span>
      </div>
    );
  }

  const width = 760;
  const padding = { top: 14, right: 18, bottom: 24, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values, 100);
  const maxValue = Math.max(...values, 100);
  const span = maxValue - minValue || 1;
  const lower = minValue - span * 0.15;
  const upper = maxValue + span * 0.15;

  const times = points.map((point) => new Date(`${point.date}T00:00:00Z`).getTime());
  const minTime = times[0];
  const timeSpan = times[times.length - 1] - minTime || 1;

  const x = (index: number) => padding.left + ((times[index] - minTime) / timeSpan) * innerWidth;
  const y = (value: number) => padding.top + innerHeight - ((value - lower) / (upper - lower)) * innerHeight;

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${x(0).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z`;

  const baseline = y(100);
  const gridValues = [upper, (upper + lower) / 2, lower];
  const active = hoverIndex === null ? null : points[hoverIndex];
  const last = points[points.length - 1];
  const first = points[0];
  const trend = first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null;

  return (
    <div className="index-chart">
      <div className="chart-head">
        <div>
          <span className="chart-value">{last.value.toFixed(2)}</span>
          <span className="chart-sub">
            за период {formatPercent(trend)} · {formatDate(first.date)} → {formatDate(last.date)} · {points.length} точек
          </span>
        </div>
        <span className="muted small">медиана отношений цен к базовой дате, база 100</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        role="img"
        aria-label="График индекса рынка"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const relative = ((event.clientX - rect.left) / rect.width) * width;
          let nearest = 0;
          let distance = Number.POSITIVE_INFINITY;
          for (let index = 0; index < points.length; index += 1) {
            const current = Math.abs(x(index) - relative);
            if (current < distance) {
              distance = current;
              nearest = index;
            }
          }
          setHoverIndex(nearest);
        }}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(value)}
              y2={y(value)}
              className="chart-grid-line"
            />
            <text x={padding.left - 6} y={y(value) + 3} className="chart-axis-label" textAnchor="end">
              {value.toFixed(0)}
            </text>
          </g>
        ))}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={baseline}
          y2={baseline}
          className="chart-grid-line chart-grid-baseline"
        />
        <path d={areaPath} className="chart-area" />
        <path d={linePath} className="chart-line" />
        {active ? (
          <g>
            <line
              x1={x(hoverIndex ?? 0)}
              x2={x(hoverIndex ?? 0)}
              y1={padding.top}
              y2={padding.top + innerHeight}
              className="chart-hover-line"
            />
            <circle cx={x(hoverIndex ?? 0)} cy={y(active.value)} r={4} className="chart-point-active" />
          </g>
        ) : null}
      </svg>

      <div className="chart-footnote muted small">
        {active
          ? `${formatDate(active.date)} — ${active.value.toFixed(2)}`
          : "Наведите курсор, чтобы увидеть значение на конкретную дату"}
      </div>
    </div>
  );
}
