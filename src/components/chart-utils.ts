/** Геометрия графиков: сглаживание линий, округлённые подписи осей, ширина контейнера. */

import { useEffect, useRef, useState } from "react";

export type ChartPoint = { x: number; y: number };

/**
 * Сглаженный путь через точки (Catmull-Rom → кубические Безье).
 *
 * Напряжение 1/6 даёт «монотонный» вид без петляний, которые появляются у
 * обычной сплайн-интерполяции на резких выбросах: ряд цен недельный и такие
 * выбросы — обычное дело.
 */
export function smoothPath(points: ChartPoint[], tension = 1 / 6): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }

  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;

    const control1 = {
      x: current.x + (next.x - previous.x) * tension,
      y: current.y + (next.y - previous.y) * tension,
    };
    const control2 = {
      x: next.x - (afterNext.x - current.x) * tension,
      y: next.y - (afterNext.y - current.y) * tension,
    };

    path += ` C${control1.x.toFixed(1)},${control1.y.toFixed(1)} ${control2.x.toFixed(1)},${control2.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`;
  }
  return path;
}

/** Замыкает линию в область до нижней границы графика. */
export function areaFromPath(line: string, points: ChartPoint[], bottom: number): string {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(1)},${bottom.toFixed(1)} L${first.x.toFixed(1)},${bottom.toFixed(1)} Z`;
}

/**
 * Человекочитаемый шаг оси: 1/2/5 × 10^n. Возвращает массив значений,
 * покрывающих диапазон [min, max] включительно.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 2) return [];
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.001; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

/**
 * Ширина контейнера графика.
 *
 * Графики рисуются в собственной системе координат: если ширина viewBox совпадает
 * с шириной контейнера, шкала равна 1:1 и подписи осей не «раздуваются» на
 * широких экранах и не сжимаются на узких.
 */
export function useElementWidth<T extends HTMLElement>(fallback = 760) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = (next: number) => {
      const rounded = Math.round(next);
      if (rounded > 0) setWidth(rounded);
    };

    measure(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
