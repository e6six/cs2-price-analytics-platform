import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS2 Index — реальные цены, история и аналитика рынка предметов CS2",
  description:
    "Аналитическая платформа: сравнение цен предметов Counter-Strike 2 из публичных источников, история наблюдений, широта рынка и прозрачное происхождение данных.",
  applicationName: "CS2 Index",
  robots: { index: false, follow: false },
  openGraph: {
    title: "CS2 Index — аналитика цен предметов CS2",
    description:
      "Цены, история и статистика рынка CS2 из публичных источников с указанием валюты, времени снимка и условий площадок.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0e13",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
