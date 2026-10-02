import type { SVGProps } from "react";

/**
 * Набор интерфейсных иконок: собственная обводка 1.6px, размер задаётся CSS.
 * Значки рисуются как SVG, а не берутся из юникод-символов: глифы вроде «⟳» или
 * «◧» есть не во всех шрифтах, и тогда интерфейс выглядит по-разному на разных
 * системах.
 */
export type IconName =
  | "overview"
  | "catalog"
  | "markets"
  | "watchlist"
  | "calculator"
  | "data"
  | "search"
  | "refresh"
  | "sun"
  | "moon"
  | "trend-up"
  | "trend-down"
  | "layers"
  | "coins"
  | "activity"
  | "store"
  | "star"
  | "external"
  | "close"
  | "shield"
  | "clock"
  | "chevron-right"
  | "arrow-right"
  | "empty"
  | "triangle-up"
  | "triangle-down";

const PATHS: Record<IconName, string[]> = {
  // Обзор: пульс рынка
  overview: ["M3 12h3.6l2.4-6 3.6 12 2.4-6H21"],
  // Каталог: сетка предметов
  catalog: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  // Площадки: витрина
  markets: ["M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z", "M3.5 9l1.5-5h14l1.5 5", "M9 20v-5h6v5"],
  // Избранное
  watchlist: ["M12 4.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.48l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76z"],
  // Калькулятор
  calculator: ["M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M8 7h8", "M8 12h.01", "M12 12h.01", "M16 12h.01", "M8 16h.01", "M12 16h.01", "M16 16h.01"],
  // Источники данных
  data: ["M12 3c4.4 0 8 1.34 8 3s-3.6 3-8 3-8-1.34-8-3 3.6-3 8-3z", "M4 6v6c0 1.66 3.6 3 8 3s8-1.34 8-3V6", "M4 12v6c0 1.66 3.6 3 8 3s8-1.34 8-3v-6"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M20 20l-4.2-4.2"],
  refresh: ["M20 12a8 8 0 1 1-2.34-5.66", "M20 4v4.5h-4.5"],
  sun: ["M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"],
  moon: ["M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"],
  "trend-up": ["M4 17l5.5-5.5 3.5 3.5L20 8", "M15 8h5v5"],
  "trend-down": ["M4 8l5.5 5.5 3.5-3.5L20 17", "M15 17h5v-5"],
  layers: ["M12 3l8 4.5-8 4.5-8-4.5z", "M4 12.5L12 17l8-4.5", "M4 16.5L12 21l8-4.5"],
  coins: ["M9 5c3.3 0 6 .9 6 2s-2.7 2-6 2-6-.9-6-2 2.7-2 6-2z", "M3 7v5c0 1.1 2.7 2 6 2s6-.9 6-2V7", "M9 14v3c0 1.1 2.7 2 6 2s6-.9 6-2v-5"],
  activity: ["M3 12h4l2.5-5 3.5 10 2.5-5H21"],
  store: ["M4 9h16v10H4z", "M3 9l1.5-4.5h15L21 9", "M9 19v-5h6v5"],
  star: ["M12 4.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.48l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76z"],
  external: ["M14 4h6v6", "M20 4l-8.5 8.5", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  shield: ["M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z", "M9 12l2 2 4-4"],
  clock: ["M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "M12 8v4.5l3 1.8"],
  "chevron-right": ["M9.5 5.5l6.5 6.5-6.5 6.5"],
  "arrow-right": ["M4.5 12h14", "M13 6.5l5.5 5.5-5.5 5.5"],
  empty: ["M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "M7.2 16.8L16.8 7.2"],
  "triangle-up": ["M12 7.5l5 8.5H7z"],
  "triangle-down": ["M12 16.5l-5-8.5h10z"],
};

/** Заполненные треугольники для изменения цены: не зависят от глифов шрифта. */
export function TrendTriangle({ direction }: { direction: "up" | "down" }) {
  return (
    <svg viewBox="0 0 24 24" width={9} height={9} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={PATHS[direction === "up" ? "triangle-up" : "triangle-down"][0]} />
    </svg>
  );
}

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Знак проекта: линия индекса, выходящая к максимуму. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" />
        </linearGradient>
      </defs>
      <path
        d="M6 23.5l5.6-7.2 4.2 4.1L26 8.5"
        fill="none"
        stroke="url(#brand-line)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 27h20" stroke="currentColor" strokeOpacity="0.28" strokeWidth={2} strokeLinecap="round" />
      <circle cx="26" cy="8.5" r="2.6" fill="currentColor" />
    </svg>
  );
}
