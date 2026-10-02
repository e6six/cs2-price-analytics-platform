import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Дев-сервер запускается за прокси превью (https://<port>-<sandbox>.e2b.app):
// без явного разрешения Next отклоняет кросс-доменные запросы к /_next/*.
const PREVIEW_ORIGINS = ["*.e2b.app"];

const nextConfig: NextConfig = {
  allowedDevOrigins: isDev ? ["localhost", "127.0.0.1", ...PREVIEW_ORIGINS] : undefined,
  // Собранный standalone-сервер нужен для контейнера (см. Dockerfile).
  output: "standalone",
  // Встроенный PostgreSQL (PGlite) и драйвер pg не должны бандлиться: они
  // работают только в Node-рантайме и подгружаются динамически.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
  logging: { fetches: { fullUrl: false } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          // В превью страница открывается во фрейме платформы, поэтому вместо
          // x-frame-options используем CSP с явным списком источников.
          isDev
            ? { key: "content-security-policy", value: "frame-ancestors 'self' https://*.e2b.app" }
            : { key: "x-frame-options", value: "SAMEORIGIN" },
        ],
      },
      {
        // API не должен попадать в поисковые индексы.
        source: "/api/(.*)",
        headers: [{ key: "x-robots-tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;
