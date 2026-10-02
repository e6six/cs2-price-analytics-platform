import localFont from "next/font/local";

/**
 * Inter подключён локально (latin + latin-ext + cyrillic, четыре начертания).
 *
 * Шрифт лежит в репозитории, а не тянется с внешнего CDN: сборка не зависит от
 * сети, браузер не делает лишних запросов на сторонний домен, а интерфейс
 * одинаково выглядит на всех системах. Лицензия — SIL Open Font License 1.1,
 * см. `src/fonts/inter/LICENSE.txt`.
 *
 * Файлы собраны из @fontsource/inter (latin, latin-ext, cyrillic, cyrillic-ext)
 * и субсетированы под набор символов интерфейса.
 */
export const inter = localFont({
  src: [
    { path: "./inter/inter-400.woff2", weight: "400", style: "normal" },
    { path: "./inter/inter-500.woff2", weight: "500", style: "normal" },
    { path: "./inter/inter-600.woff2", weight: "600", style: "normal" },
    { path: "./inter/inter-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});
