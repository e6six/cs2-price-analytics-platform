import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS2 Index — цены, история и аналитика рынка",
  description:
    "Независимая аналитическая платформа для сравнения цен, истории и данных предметов Counter-Strike 2.",
  applicationName: "CS2 Index",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
