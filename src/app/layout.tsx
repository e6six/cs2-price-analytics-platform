import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { inter } from "@/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CS2 Index — реальные цены, история и аналитика рынка предметов CS2",
    template: "%s · CS2 Index",
  },
  description:
    "Аналитическая платформа: сравнение цен предметов Counter-Strike 2 из публичных источников, история наблюдений, широта рынка и прозрачное происхождение данных.",
  applicationName: "CS2 Index",
  category: "finance",
  keywords: ["CS2", "Counter-Strike 2", "цены скинов", "аналитика рынка", "Steam Community Market", "Skinport", "CSFloat"],
  robots: { index: false, follow: false },
  openGraph: {
    title: "CS2 Index — аналитика цен предметов CS2",
    description:
      "Цены, история и статистика рынка CS2 из публичных источников с указанием валюты, времени снимка и условий площадок.",
    type: "website",
    locale: "ru_RU",
    siteName: "CS2 Index",
  },
  twitter: {
    card: "summary_large_image",
    title: "CS2 Index — аналитика цен предметов CS2",
    description: "Каталог 34 000 предметов, история недельных срезов, справочник площадок и прозрачное происхождение данных.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e1320" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
  ],
  colorScheme: "dark light",
};

/**
 * Тема применяется до первой отрисовки: без этого пользователь со светлой темой
 * видел бы вспышку тёмного фона. Скрипт крошечный и безопасен при отключённом
 * localStorage (например, в приватном режиме).
 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("cs2-index:theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
